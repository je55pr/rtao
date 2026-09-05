using System.Numerics;

namespace Rta.Formats;

public sealed record PalOverworldAreaDescriptor(
    int AreaIndex,
    string Name,
    short AreaCode,
    int FixedInteractionCount,
    int OutdoorResidentCount);

public sealed record PalFixedInteractionZone(
    int AreaIndex,
    int LocalResidentIndex,
    string ResidentName,
    int BodyId,
    uint PackedPaint,
    IReadOnlyList<Vector2> Corners)
{
    /// <summary>
    /// A handful of HG2 records use (-1,-1) as an unused/sentinel vertex.
    /// Returning the mean of the remaining vertices gives a stable debug-label
    /// position without pretending the sentinel is a world coordinate.
    /// </summary>
    public Vector2 Center
    {
        get
        {
            Vector2 sum = Vector2.Zero;
            int count = 0;
            foreach (Vector2 corner in Corners)
            {
                if (IsSentinel(corner))
                    continue;
                sum += corner;
                count++;
            }
            return count == 0 ? Vector2.Zero : sum / count;
        }
    }

    public bool HasSentinelCorner => Corners.Any(IsSentinel);

    /// <summary>Returns true when a source-space X/Z point lies inside this convex trigger polygon.</summary>
    public bool Contains(Vector2 point)
    {
        if (HasSentinelCorner || Corners.Count < 3)
            return false;

        float sign = 0f;
        for (int i = 0; i < Corners.Count; i++)
        {
            Vector2 a = Corners[i];
            Vector2 b = Corners[(i + 1) % Corners.Count];
            Vector2 edge = b - a;
            Vector2 delta = point - a;
            float cross = edge.X * delta.Y - edge.Y * delta.X;
            if (MathF.Abs(cross) <= 0.0001f)
                continue;
            float currentSign = MathF.Sign(cross);
            if (sign == 0f)
                sign = currentSign;
            else if (currentSign != sign)
                return false;
        }
        return sign != 0f;
    }

    /// <summary>Distance in source-space metres to the polygon; zero when inside.</summary>
    public float DistanceTo(Vector2 point)
    {
        if (HasSentinelCorner || Corners.Count < 2)
            return float.PositiveInfinity;
        if (Contains(point))
            return 0f;

        float bestSquared = float.PositiveInfinity;
        for (int i = 0; i < Corners.Count; i++)
        {
            Vector2 a = Corners[i];
            Vector2 b = Corners[(i + 1) % Corners.Count];
            Vector2 ab = b - a;
            float lengthSquared = ab.LengthSquared();
            float t = lengthSquared <= 0.000001f ? 0f : Math.Clamp(Vector2.Dot(point - a, ab) / lengthSquared, 0f, 1f);
            Vector2 closest = a + ab * t;
            bestSquared = MathF.Min(bestSquared, Vector2.DistanceSquared(point, closest));
        }
        return MathF.Sqrt(bestSquared);
    }

    public static bool IsSentinel(Vector2 point) => point.X == -1f && point.Y == -1f;
}

/// <summary>
/// Clean-room reader for the PAL executable's fixed overworld interaction zones.
///
/// Code at 0x0025B5B0 in SLES_513.56 selects the current area, looks up the
/// area's block through 0x002C2710, iterates the descriptor's byte-at-+6 count,
/// and performs four 2D cross-product tests against each 32-byte record. On a
/// hit it stores both the area index and local resident index in player state.
/// The local index addresses the same resident-definition array exposed through
/// 0x002C4340, which lets the geometry be named without guessing from location.
/// </summary>
public static class PalOverworldInteractionZones
{
    public const uint AreaDescriptorTableAddress = 0x002C04B0;
    public const uint InteractionZoneAreaPointerTableAddress = 0x002C2710;
    public const uint ResidentDefinitionAreaPointerTableAddress = 0x002C4340;
    public const int AreaCount = 32;
    // The executable reserves 5-bit area indexes, but the contiguous authored
    // descriptor catalogue used by HG2 contains entries 0..21.
    public const int AuthoredAreaCount = 22;
    public const int PeachTownAreaIndex = 1;

    private const int AreaDescriptorSize = 8;
    private const int ResidentDefinitionSize = 16;
    private const int ZoneSize = 32;

    public static PalOverworldAreaDescriptor ReadAreaDescriptor(Stream executable, int areaIndex)
    {
        var elf = new Elf32AddressSpace(executable);
        return ReadAreaDescriptor(elf, areaIndex);
    }

    public static IReadOnlyList<PalFixedInteractionZone> ReadZones(Stream executable, int areaIndex)
    {
        var elf = new Elf32AddressSpace(executable);
        return ReadZones(elf, areaIndex);
    }

    public static IReadOnlyList<PalFixedInteractionZone> ReadPeachTownZones(Stream executable) =>
        ReadZones(executable, PeachTownAreaIndex);

    private static PalOverworldAreaDescriptor ReadAreaDescriptor(Elf32AddressSpace elf, int areaIndex)
    {
        ValidateAreaIndex(areaIndex);
        uint address = AreaDescriptorTableAddress + (uint)(areaIndex * AreaDescriptorSize);
        uint nameAddress = elf.ReadUInt32(address);
        short areaCode = unchecked((short)(elf.ReadUInt32(address + 4) & 0xFFFF));
        byte[] counts = elf.ReadBytes(address + 6, 2);
        return new PalOverworldAreaDescriptor(
            areaIndex,
            elf.ReadAsciiZ(nameAddress),
            areaCode,
            counts[0],
            counts[1]);
    }

    private static IReadOnlyList<PalFixedInteractionZone> ReadZones(Elf32AddressSpace elf, int areaIndex)
    {
        PalOverworldAreaDescriptor descriptor = ReadAreaDescriptor(elf, areaIndex);
        if (descriptor.FixedInteractionCount == 0)
            return Array.Empty<PalFixedInteractionZone>();

        uint zoneBlock = elf.ReadUInt32(InteractionZoneAreaPointerTableAddress + (uint)(areaIndex * 4));
        uint residentBlock = elf.ReadUInt32(ResidentDefinitionAreaPointerTableAddress + (uint)(areaIndex * 4));
        if (zoneBlock == 0 || residentBlock == 0)
            throw new InvalidDataException($"PAL overworld area {areaIndex} has fixed interactions but no backing zone/resident block.");

        var result = new PalFixedInteractionZone[descriptor.FixedInteractionCount];
        for (int localIndex = 0; localIndex < result.Length; localIndex++)
        {
            uint zoneAddress = zoneBlock + (uint)(localIndex * ZoneSize);
            var corners = new Vector2[4];
            for (int corner = 0; corner < corners.Length; corner++)
            {
                uint address = zoneAddress + (uint)(corner * 8);
                corners[corner] = new Vector2(elf.ReadSingle(address), elf.ReadSingle(address + 4));
            }

            uint definitionAddress = residentBlock + (uint)(localIndex * ResidentDefinitionSize);
            uint packedPaint = elf.ReadUInt32(definitionAddress);
            int bodyId = checked((int)elf.ReadUInt32(definitionAddress + 4));
            uint nameAddress = elf.ReadUInt32(definitionAddress + 12);
            result[localIndex] = new PalFixedInteractionZone(
                areaIndex,
                localIndex,
                elf.ReadAsciiZ(nameAddress),
                bodyId,
                packedPaint,
                corners);
        }

        return result;
    }

    private static void ValidateAreaIndex(int areaIndex)
    {
        if (areaIndex is < 0 or >= AreaCount)
            throw new ArgumentOutOfRangeException(nameof(areaIndex));
    }
}
