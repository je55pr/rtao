using System.Numerics;

namespace Rta.Formats;

public readonly record struct PalRgb(byte R, byte G, byte B);

public readonly record struct PalCarPaint(PalRgb Primary, PalRgb Secondary)
{
    /// <summary>
    /// HG2 packs two contiguous RGB444 colours into the low 24 bits:
    /// bits 0..11 are primary R/G/B nibbles and bits 12..23 are secondary R/G/B.
    /// PAL code at 0x257E98 extracts the six channels at shifts 0,4,8,12,16,20;
    /// 0x258D84 compares the corresponding primary/secondary triplet channels.
    /// </summary>
    public static PalCarPaint Decode(uint packed)
    {
        return new PalCarPaint(
            DecodeRgb444(packed),
            DecodeRgb444(packed >> 12));
    }

    // PAL SLES_513.56 contains the exact sixteen paint intensities twice:
    // 0x2A2560 is the float table 0.10, 0.15, ... 0.85 used by the car render
    // setup at 0x222710, while 0x2A25A0 is its byte equivalent used by the
    // paint UI. Do not expand RGB444 to the full 0..255 range: HG2 deliberately
    // keeps even channel 0 above black and channel 15 below full intensity.
    private static ReadOnlySpan<byte> PaintIntensity =>
    [
        25, 38, 51, 63,
        76, 89, 102, 114,
        127, 140, 153, 165,
        178, 191, 204, 216
    ];

    private static PalRgb DecodeRgb444(uint packed) => new(
        DecodeNibble((int)(packed & 0x0F)),
        DecodeNibble((int)((packed >> 4) & 0x0F)),
        DecodeNibble((int)((packed >> 8) & 0x0F)));

    private static byte DecodeNibble(int value) => PaintIntensity[value & 0x0F];
}

public sealed record PalRoamingRoutePoint(Vector2 Left, Vector2 Right, Vector2 Auxiliary)
{
    public Vector2 Center => (Left + Right) * 0.5f;
}

public sealed record PalOverworldRoamingRoute(
    uint StartAddress,
    uint EndAddress,
    IReadOnlyList<PalRoamingRoutePoint> Points);

public sealed record PalOutdoorSpawn(Vector3 Position, uint RawOrientation);

public sealed record PalOutdoorResidentDefinition(
    int LocalOutdoorIndex,
    string Name,
    int BodyId,
    uint PackedPaint,
    PalCarPaint Paint,
    PalOutdoorSpawn Spawn,
    PalOverworldRoamingRoute Route);

/// <summary>
/// Clean-room reader for the PAL executable's overworld-car route assignment data.
/// The route lookup itself is used by code at 0x00262588 in SLES_513.56:
/// route = routeAreaTable[area][localOutdoorResident].
/// </summary>
public static class PalOverworldRoamingRoutes
{
    public const uint RouteAreaPointerTableAddress = 0x002DBA28;
    public const uint OutdoorSpawnAreaPointerTableAddress = 0x002C4EF0;

    // Peach Town is slot 1 in the roaming/spawn tables. Its outdoor resident records
    // are the final eleven entries of the town's resident-definition block.
    public const int PeachTownRouteAreaIndex = 1;
    public const uint PeachTownOutdoorResidentDefinitionAddress = 0x002C2950;
    public const int PeachTownOutdoorResidentCount = 11;

    private static readonly HashSet<string> PeachTownRoamingNames = new(StringComparer.Ordinal)
    {
        "James", "Klien", "Barthou", "Pillow", "Kevin", "Newman"
    };

    public static PalOverworldRoamingRoute ReadRoute(Stream executable, int areaIndex, int localOutdoorResidentIndex)
    {
        var elf = new Elf32AddressSpace(executable);
        return ReadRoute(elf, areaIndex, localOutdoorResidentIndex);
    }


    /// <summary>
    /// Reads every outdoor resident definition for an executable area. Unlike the
    /// historical Peach helper, this preserves residents with an intentionally empty
    /// route as zero-point actors so callers can model static/special behaviour.
    /// </summary>
    public static IReadOnlyList<PalOutdoorResidentDefinition> ReadOutdoorResidents(Stream executable, int areaIndex)
    {
        var elf = new Elf32AddressSpace(executable);
        PalOverworldAreaDescriptor descriptor = ReadAreaDescriptor(elf, areaIndex);
        if (descriptor.OutdoorResidentCount == 0)
            return Array.Empty<PalOutdoorResidentDefinition>();

        uint residentBlock = elf.ReadUInt32(PalOverworldInteractionZones.ResidentDefinitionAreaPointerTableAddress + (uint)(areaIndex * 4));
        if (residentBlock == 0)
            throw new InvalidDataException($"PAL outdoor resident area {areaIndex} has no resident-definition block.");

        uint outdoorBlock = residentBlock + (uint)(descriptor.FixedInteractionCount * 16);
        var result = new PalOutdoorResidentDefinition[descriptor.OutdoorResidentCount];
        for (int localIndex = 0; localIndex < result.Length; localIndex++)
        {
            uint definitionAddress = outdoorBlock + (uint)(localIndex * 16);
            uint packedPaint = elf.ReadUInt32(definitionAddress);
            int bodyId = checked((int)elf.ReadUInt32(definitionAddress + 4));
            uint nameAddress = elf.ReadUInt32(definitionAddress + 12);
            string name = elf.ReadAsciiZ(nameAddress);
            PalOutdoorSpawn spawn = ReadSpawn(elf, areaIndex, localIndex);
            PalOverworldRoamingRoute route = TryReadRoute(elf, areaIndex, localIndex, out PalOverworldRoamingRoute? decoded)
                ? decoded!
                : new PalOverworldRoamingRoute(0, 0, Array.Empty<PalRoamingRoutePoint>());
            result[localIndex] = new PalOutdoorResidentDefinition(
                localIndex,
                name,
                bodyId,
                packedPaint,
                PalCarPaint.Decode(packedPaint),
                spawn,
                route);
        }

        return result;
    }

    public static IReadOnlyList<PalOutdoorResidentDefinition> ReadPeachTownOutdoorResidents(Stream executable)
    {
        var elf = new Elf32AddressSpace(executable);
        var result = new List<PalOutdoorResidentDefinition>(PeachTownOutdoorResidentCount);
        for (int localIndex = 0; localIndex < PeachTownOutdoorResidentCount; localIndex++)
        {
            uint definitionAddress = PeachTownOutdoorResidentDefinitionAddress + (uint)(localIndex * 16);
            uint packedPaint = elf.ReadUInt32(definitionAddress);
            int bodyId = checked((int)elf.ReadUInt32(definitionAddress + 4));
            uint nameAddress = elf.ReadUInt32(definitionAddress + 12);
            string name = elf.ReadAsciiZ(nameAddress);
            PalOutdoorSpawn spawn = ReadSpawn(elf, PeachTownRouteAreaIndex, localIndex);
            PalOverworldRoamingRoute route = ReadRoute(elf, PeachTownRouteAreaIndex, localIndex);
            result.Add(new PalOutdoorResidentDefinition(
                localIndex,
                name,
                bodyId,
                packedPaint,
                PalCarPaint.Decode(packedPaint),
                spawn,
                route));
        }
        return result;
    }

    public static IReadOnlyList<PalOutdoorResidentDefinition> ReadPeachTownRoamingResidents(Stream executable) =>
        ReadPeachTownOutdoorResidents(executable)
            .Where(resident => PeachTownRoamingNames.Contains(resident.Name))
            .ToArray();

    private static PalOverworldRoamingRoute ReadRoute(Elf32AddressSpace elf, int areaIndex, int localOutdoorResidentIndex)
    {
        if (!TryReadRoute(elf, areaIndex, localOutdoorResidentIndex, out PalOverworldRoamingRoute? route))
            throw new InvalidDataException($"PAL roaming route area {areaIndex}, resident {localOutdoorResidentIndex} is empty or malformed.");
        return route!;
    }

    private static bool TryReadRoute(Elf32AddressSpace elf, int areaIndex, int localOutdoorResidentIndex, out PalOverworldRoamingRoute? route)
    {
        ValidateIndexes(areaIndex, localOutdoorResidentIndex);
        uint areaBlock = elf.ReadUInt32(RouteAreaPointerTableAddress + (uint)(areaIndex * 4));
        if (areaBlock == 0)
        {
            route = null;
            return false;
        }

        uint record = areaBlock + (uint)(localOutdoorResidentIndex * 8);
        uint start = elf.ReadUInt32(record);
        uint end = elf.ReadUInt32(record + 4);
        if (start == 0 || end <= start)
        {
            route = null;
            return false;
        }
        uint byteLength = end - start;
        if (byteLength % 24 != 0)
            throw new InvalidDataException($"PAL roaming route at 0x{start:X8} has non-24-byte length {byteLength}.");

        int count = checked((int)(byteLength / 24));
        var points = new PalRoamingRoutePoint[count];
        for (int i = 0; i < count; i++)
        {
            uint address = start + (uint)(i * 24);
            Vector2 left = new(elf.ReadSingle(address), elf.ReadSingle(address + 4));
            Vector2 right = new(elf.ReadSingle(address + 8), elf.ReadSingle(address + 12));
            Vector2 auxiliary = new(elf.ReadSingle(address + 16), elf.ReadSingle(address + 20));
            points[i] = new PalRoamingRoutePoint(left, right, auxiliary);
        }
        route = new PalOverworldRoamingRoute(start, end, points);
        return true;
    }

    private static PalOverworldAreaDescriptor ReadAreaDescriptor(Elf32AddressSpace elf, int areaIndex)
    {
        if (areaIndex is < 0 or >= PalOverworldInteractionZones.AreaCount)
            throw new ArgumentOutOfRangeException(nameof(areaIndex));
        uint address = PalOverworldInteractionZones.AreaDescriptorTableAddress + (uint)(areaIndex * 8);
        uint nameAddress = elf.ReadUInt32(address);
        short areaCode = unchecked((short)(elf.ReadUInt32(address + 4) & 0xFFFF));
        byte[] counts = elf.ReadBytes(address + 6, 2);
        return new PalOverworldAreaDescriptor(areaIndex, elf.ReadAsciiZ(nameAddress), areaCode, counts[0], counts[1]);
    }

    private static PalOutdoorSpawn ReadSpawn(Elf32AddressSpace elf, int areaIndex, int localOutdoorResidentIndex)
    {
        ValidateIndexes(areaIndex, localOutdoorResidentIndex);
        uint areaBlock = elf.ReadUInt32(OutdoorSpawnAreaPointerTableAddress + (uint)(areaIndex * 4));
        if (areaBlock == 0)
            throw new InvalidDataException($"PAL outdoor-spawn area {areaIndex} has no spawn block.");

        uint record = areaBlock + (uint)(localOutdoorResidentIndex * 16);
        Vector3 position = new(elf.ReadSingle(record), elf.ReadSingle(record + 4), elf.ReadSingle(record + 8));
        uint rawOrientation = elf.ReadUInt32(record + 12);
        return new PalOutdoorSpawn(position, rawOrientation);
    }

    private static void ValidateIndexes(int areaIndex, int localOutdoorResidentIndex)
    {
        if (areaIndex is < 0 or >= 32)
            throw new ArgumentOutOfRangeException(nameof(areaIndex));
        if (localOutdoorResidentIndex is < 0 or >= 32)
            throw new ArgumentOutOfRangeException(nameof(localOutdoorResidentIndex));
    }
}
