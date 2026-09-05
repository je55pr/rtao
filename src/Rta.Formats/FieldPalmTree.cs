using System.Buffers.Binary;
using System.Numerics;

namespace Rta.Formats;

/// <summary>
/// HG2's coastal palm crowns are not part of the ordinary MSCALF-8 field mesh.
/// FLD/220 and FLD/221 carry a small object container in Extra[1]: its first
/// three sections hold six radial frond quads (1 + 2 + 3) using the dynamic
/// object VU path (MSCALF 4, with an equivalent MSCALF 10 copy).
///
/// The ordinary field still owns the trunks, top-cap markers and authored
/// palm-shaped ground shadows. Keeping the two paths separate mirrors the disc
/// layout and gives the renderer a natural place to animate the crowns.
/// </summary>
public sealed record FieldPalmCrownAsset(IReadOnlyList<IReadOnlyList<CarRenderPrimitive>> FrondGroups)
{
    public int PrimitiveCount => FrondGroups.Sum(group => group.Count);
    public int VertexCount => FrondGroups.Sum(group => group.Sum(primitive => primitive.Vertices.Count));
}

public static class FieldPalmTreeReader
{
    private const int ExpectedFrondGroupCount = 3;

    /// <summary>
    /// Reads the proven palm-crown object container from Extra[1], when present.
    /// The format is intentionally recognised by structure rather than field number:
    /// three leading object sections contain 1, 2 and 3 MSCALF-4 textured quads.
    /// </summary>
    public static FieldPalmCrownAsset? TryReadCrownAsset(Stream stream, FieldHeader header)
    {
        ArgumentNullException.ThrowIfNull(stream);
        ArgumentNullException.ThrowIfNull(header);
        if (header.Extras.Count < 2)
            return null;

        FieldSection extra = header.Extras[1];
        IReadOnlyList<uint> offsets = ReadRelativeOffsets(stream, extra);
        if (offsets.Count < ExpectedFrondGroupCount + 2)
            return null;

        var groups = new List<IReadOnlyList<CarRenderPrimitive>>(ExpectedFrondGroupCount);
        for (int groupIndex = 0; groupIndex < ExpectedFrondGroupCount; groupIndex++)
        {
            long sectionBase = checked((long)extra.Offset + offsets[groupIndex]);
            (uint alternateMeshOffset, uint endOffset, uint authoredPrimitiveCount, uint unknown) = ReadObjectSectionHeader(stream, sectionBase);
            uint sectionLength = offsets[groupIndex + 1] - offsets[groupIndex];

            // The first mesh begins immediately after the 16-byte section header;
            // alternateMeshOffset points at the equivalent MSCALF-10 copy.
            if (unknown != 0 || alternateMeshOffset < 0x20 || alternateMeshOffset >= endOffset || endOffset > sectionLength)
                return null;

            IReadOnlyList<CarRenderPrimitive> primitives;
            try
            {
                primitives = CarRenderPrimitiveReader.ReadMeshPart(stream, checked(sectionBase + 0x10));
            }
            catch (Exception exception) when (exception is InvalidDataException or NotSupportedException or EndOfStreamException)
            {
                return null;
            }

            if (primitives.Count != authoredPrimitiveCount ||
                primitives.Count != groupIndex + 1 ||
                primitives.Any(primitive => primitive.VuProgram != 4 || primitive.PrimitiveType != 4 || !primitive.UsesTexture))
            {
                return null;
            }

            groups.Add(primitives);
        }

        return new FieldPalmCrownAsset(groups);
    }

    /// <summary>
    /// Finds authored attachment markers in the ordinary field mesh. Coastal palm
    /// trunks end in a tiny square top cap while that field's trunk material remains
    /// current. HG2 emits several equivalent cap forms: some are untextured and exactly
    /// horizontal, while others leave TME enabled or have a shallow ~5 cm bevel. The GS
    /// texture addresses are field-local, so identify the dominant cap-material family
    /// structurally rather than baking in one field's VRAM address.
    /// </summary>
    public static IReadOnlyList<Vector3> FindCrownAnchors(IReadOnlyList<FieldRenderPrimitive> primitives)
    {
        ArgumentNullException.ThrowIfNull(primitives);

        FieldRenderPrimitive[] candidateCaps = primitives
            .Where(IsCandidateTrunkCap)
            .ToArray();
        if (candidateCaps.Length == 0)
            return Array.Empty<Vector3>();

        // The cap is emitted while the trunk's TEX0 remains current. In both proven
        // palm fields that creates one dominant cap-material family (6/7 candidates
        // in FLD/221, 106/109 in FLD/220 with the thin-cap variants enabled), while
        // unrelated poles/props remain isolated families. This is stronger than
        // field-number or TBP special-casing.
        FieldRenderPrimitive[] trunkCaps = candidateCaps
            .GroupBy(primitive => primitive.Material.Tex0)
            .OrderByDescending(group => group.Count())
            .First()
            .ToArray();

        return trunkCaps.Select(Centroid).ToArray();
    }

    /// <summary>
    /// Finds the hidden ordinary-field primitive that carries the material state for
    /// the Extra[1] dynamic crown object. Its PSMT8 64x32 frond texture is shared in
    /// content but relocated in GS memory per field (TBP 10406 in FLD/220, 11762 in
    /// FLD/221), and the carrier primitive is deliberately parked far below terrain.
    /// </summary>
    public static FieldMaterial? FindFrondMaterial(IReadOnlyList<FieldRenderPrimitive> primitives)
    {
        ArgumentNullException.ThrowIfNull(primitives);
        return primitives
            .Where(primitive =>
                primitive.TextureMappingEnabled &&
                primitive.Material.Tex0.PixelStorageFormat == GsPixelStorageFormat.PsmT8 &&
                primitive.Material.Tex0.Width == 64 &&
                primitive.Material.Tex0.Height == 32 &&
                primitive.Vertices.Count >= 3 &&
                primitive.Vertices.Max(vertex => vertex.Position.Y) < -20f)
            .Select(primitive => primitive.Material)
            .FirstOrDefault();
    }

    private static bool IsCandidateTrunkCap(FieldRenderPrimitive primitive)
    {
        if (primitive.Vertices.Count < 3)
            return false;

        float minX = primitive.Vertices.Min(vertex => vertex.Position.X);
        float maxX = primitive.Vertices.Max(vertex => vertex.Position.X);
        float minY = primitive.Vertices.Min(vertex => vertex.Position.Y);
        float maxY = primitive.Vertices.Max(vertex => vertex.Position.Y);
        float minZ = primitive.Vertices.Min(vertex => vertex.Position.Z);
        float maxZ = primitive.Vertices.Max(vertex => vertex.Position.Z);
        float width = maxX - minX;
        float depth = maxZ - minZ;

        // Some FLD/220 palms use a shallow bevelled cap (~0.052 m high) rather
        // than the zero-thickness cap used by FLD/221. Both are authored attachment
        // markers. A 6 cm ceiling admits those variants without reaching ordinary
        // trunk segments or unrelated prop geometry.
        return MathF.Abs(maxY - minY) <= 0.06f &&
               minY >= 5f && maxY <= 20f &&
               width >= 0.15f && width <= 0.5f &&
               depth >= 0.15f && depth <= 0.5f;
    }

    private static Vector3 Centroid(FieldRenderPrimitive primitive)
    {
        Vector3 sum = Vector3.Zero;
        foreach (FieldRenderVertex vertex in primitive.Vertices)
            sum += vertex.Position;
        return sum / primitive.Vertices.Count;
    }

    private static IReadOnlyList<uint> ReadRelativeOffsets(Stream stream, FieldSection section)
    {
        long original = stream.Position;
        try
        {
            stream.Position = section.Offset;
            uint firstOffset = BinaryStream.ReadUInt32LittleEndian(stream);
            if (firstOffset < 16 || firstOffset > section.Length || (firstOffset & 3) != 0)
                return Array.Empty<uint>();

            int capacity = checked((int)(firstOffset / 4));
            stream.Position = section.Offset;
            var offsets = new List<uint>(capacity);
            for (int i = 0; i < capacity; i++)
            {
                uint value = BinaryStream.ReadUInt32LittleEndian(stream);
                if (value == 0)
                    break;
                offsets.Add(value);
            }

            if (offsets.Count < 2 || offsets[0] != firstOffset || offsets[^1] != section.Length)
                return Array.Empty<uint>();
            for (int i = 1; i < offsets.Count; i++)
            {
                if (offsets[i] <= offsets[i - 1] || offsets[i] > section.Length)
                    return Array.Empty<uint>();
            }
            return offsets;
        }
        finally
        {
            stream.Position = original;
        }
    }

    private static (uint AlternateMeshOffset, uint EndOffset, uint PrimitiveCount, uint Unknown) ReadObjectSectionHeader(Stream stream, long offset)
    {
        long original = stream.Position;
        try
        {
            stream.Position = offset;
            return (
                BinaryStream.ReadUInt32LittleEndian(stream),
                BinaryStream.ReadUInt32LittleEndian(stream),
                BinaryStream.ReadUInt32LittleEndian(stream),
                BinaryStream.ReadUInt32LittleEndian(stream));
        }
        finally
        {
            stream.Position = original;
        }
    }
}
