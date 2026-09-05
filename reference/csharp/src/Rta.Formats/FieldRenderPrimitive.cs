using System.Buffers.Binary;
using System.Numerics;

namespace Rta.Formats;

/// <summary>
/// The five V3-32 input vectors used by the HG2 field VU1 program at MSCALF 8.
/// Keeping the undecoded vectors intact lets the renderer use known data now while
/// later reverse engineering can give the remaining channels better names.
/// </summary>
public readonly record struct FieldRenderVertex(
    Vector3 Position,
    Vector3 DayColor,
    Vector3 UnknownVector,
    Vector3 NightColor,
    Vector3 TextureCoordinate);

public sealed record FieldRenderPrimitive(
    int ChunkIndex,
    int ChunkX,
    int ChunkZ,
    int PrimitiveIndex,
    FieldMaterial Material,
    Ps2GifTag GifTag,
    IReadOnlyList<FieldRenderVertex> Vertices,
    Vector3? PlacementOffset = null)
{
    public int PrimitiveType => GifTag.Primitive & 0x7;
    public bool TextureMappingEnabled => (GifTag.Primitive & 0x10) != 0;

    /// <summary>
    /// HG2 includes a small set of untextured day-black/night-lit primitives. Some are
    /// dark interior/backing volumes by day and become illuminated at night; others are
    /// additive light layers whose black daytime colour contributes nothing. Preserve
    /// the authored channels instead of deciding visibility in the format layer.
    /// </summary>
    public bool IsDayBlackNightLitLayer =>
        !TextureMappingEnabled &&
        Vertices.Count > 0 &&
        Vertices.All(vertex => IsBlack(vertex.DayColor)) &&
        Vertices.Any(vertex => !IsBlack(vertex.NightColor));

    /// <summary>
    /// The PAL outdoor data has one uniquely identifiable family of billboard light
    /// effects: their authored night colour is very bright while their daytime colour
    /// is at most about half intensity. Original bridge captures confirm these coronas
    /// are absent by day and visible at night. Across all 64 fields this predicate
    /// selects only the 62 bridge corona/lamp sprites in FLD/220.
    /// </summary>
    public bool IsNightLightBillboard =>
        PlacementOffset is not null &&
        Vertices.Count > 0 &&
        AverageBrightness(Vertices, night: true) >= 180f &&
        AverageBrightness(Vertices, night: false) <= 110f;

    private static float AverageBrightness(IReadOnlyList<FieldRenderVertex> vertices, bool night)
    {
        float total = 0f;
        foreach (FieldRenderVertex vertex in vertices)
        {
            Vector3 color = night ? vertex.NightColor : vertex.DayColor;
            total += (color.X + color.Y + color.Z) / 3f;
        }
        return total / vertices.Count;
    }

    private static bool IsBlack(Vector3 color) =>
        MathF.Abs(color.X) < 0.0001f &&
        MathF.Abs(color.Y) < 0.0001f &&
        MathF.Abs(color.Z) < 0.0001f;
}

public static class FieldRenderPrimitiveReader
{
    private const byte V3_32 = 0x68;
    private const byte V4_32 = 0x6C;
    private const ushort FieldMeshVuProgram = 8;
    private const ushort FieldBillboardVuProgram = 6;
    private const int MinimumMaterialVectorCount = 4;
    private const int MaximumMaterialVectorCount = 5;
    private const int VectorsPerVertex = 5;
    private const int BytesPerVector3 = 12;

    /// <summary>
    /// Decodes the ordinary 8x8 spatial field chunks. The global chunk is deliberately
    /// excluded because HG2 uses a different VU1 program there for billboards and other
    /// special geometry.
    /// </summary>
    public static IReadOnlyList<FieldRenderPrimitive> ReadSpatialPrimitives(
        Stream stream,
        FieldHeader header,
        FieldChunkDirectory? chunks = null)
    {
        ArgumentNullException.ThrowIfNull(stream);
        if (!stream.CanRead || !stream.CanSeek)
            throw new ArgumentException("Field stream must be readable and seekable.", nameof(stream));

        chunks ??= FieldChunkDirectory.ReadRenderMeshes(stream, header);
        var output = new List<FieldRenderPrimitive>();

        foreach (FieldChunk chunk in chunks.Chunks.Where(chunk => !chunk.IsGlobal))
        {
            long chainStart = checked((long)header.RenderMeshes.Offset + chunk.RelativeOffset);
            Ps2DmaChain chain = Ps2DmaChain.ReadInline(stream, chainStart, chunk.Length);
            int primitiveIndex = 0;
            FieldMaterial? currentMaterial = null;

            foreach (Ps2DmaPacket packet in chain.Packets.Where(packet => packet.Tag.Id == Ps2DmaTagId.Cnt))
            {
                long tagOffset = checked(chainStart + packet.RelativeOffset);
                long payloadOffset = checked(tagOffset + 16);
                Ps2VifStream vif = Ps2VifStream.ReadPacket(stream, tagOffset, packet.Tag);

                for (int i = 0; i < vif.Instructions.Count; i++)
                {
                    Ps2VifInstruction instruction = vif.Instructions[i];
                    FieldMaterial? materialUpdate = TryReadMaterial(stream, payloadOffset, instruction);
                    if (materialUpdate is not null)
                        currentMaterial = materialUpdate;

                    if (i + 2 >= vif.Instructions.Count || currentMaterial is null)
                        continue;

                    Ps2VifInstruction gifUnpack = instruction;
                    Ps2VifInstruction vertexUnpack = vif.Instructions[i + 1];
                    Ps2VifInstruction execute = vif.Instructions[i + 2];

                    if (!IsMeshSequence(gifUnpack, vertexUnpack, execute))
                        continue;

                    Ps2GifTag gifTag = ReadGifTagAt(stream, payloadOffset + gifUnpack.DataOffset);
                    int vectorCount = EffectiveCount(vertexUnpack.Code.Count);
                    int expectedVectorCount = checked(gifTag.LoopCount * VectorsPerVertex);
                    if (vectorCount != expectedVectorCount)
                    {
                        throw new InvalidDataException(
                            $"Field chunk {chunk.Index} primitive {primitiveIndex}: VIF contains {vectorCount} V3 vectors " +
                            $"but GIF NLOOP={gifTag.LoopCount} requires {expectedVectorCount}.");
                    }

                    IReadOnlyList<FieldRenderVertex> vertices = ReadVertices(
                        stream,
                        payloadOffset + vertexUnpack.DataOffset,
                        gifTag.LoopCount);

                    output.Add(new FieldRenderPrimitive(
                        chunk.Index,
                        chunk.X,
                        chunk.Z,
                        primitiveIndex++,
                        currentMaterial,
                        gifTag,
                        vertices));
                }
            }
        }

        return output;
    }

    public static IReadOnlyList<FieldRenderPrimitive> ReadAllPrimitives(
        Stream stream,
        FieldHeader header,
        FieldChunkDirectory? chunks = null)
    {
        chunks ??= FieldChunkDirectory.ReadRenderMeshes(stream, header);
        var output = new List<FieldRenderPrimitive>();
        output.AddRange(ReadSpatialPrimitives(stream, header, chunks));
        output.AddRange(ReadGlobalPrimitives(stream, header, chunks));
        return output;
    }

    public static IReadOnlyList<FieldRenderPrimitive> ReadGlobalPrimitives(
        Stream stream,
        FieldHeader header,
        FieldChunkDirectory? chunks = null)
    {
        ArgumentNullException.ThrowIfNull(stream);
        if (!stream.CanRead || !stream.CanSeek)
            throw new ArgumentException("Field stream must be readable and seekable.", nameof(stream));

        chunks ??= FieldChunkDirectory.ReadRenderMeshes(stream, header);
        FieldChunk? global = chunks.Chunks.FirstOrDefault(chunk => chunk.IsGlobal);
        if (global is null)
            return Array.Empty<FieldRenderPrimitive>();

        long chainStart = checked((long)header.RenderMeshes.Offset + global.RelativeOffset);
        Ps2DmaChain chain = Ps2DmaChain.ReadInline(stream, chainStart, global.Length);
        var output = new List<FieldRenderPrimitive>();
        FieldMaterial? currentMaterial = null;
        int primitiveIndex = 0;

        foreach (Ps2DmaPacket packet in chain.Packets.Where(packet => packet.Tag.Id == Ps2DmaTagId.Cnt))
        {
            long tagOffset = checked(chainStart + packet.RelativeOffset);
            long payloadOffset = checked(tagOffset + 16);
            Ps2VifStream vif = Ps2VifStream.ReadPacket(stream, tagOffset, packet.Tag);

            for (int i = 0; i < vif.Instructions.Count; i++)
            {
                Ps2VifInstruction instruction = vif.Instructions[i];
                FieldMaterial? materialUpdate = TryReadMaterial(stream, payloadOffset, instruction);
                if (materialUpdate is not null)
                    currentMaterial = materialUpdate;

                if (i + 2 >= vif.Instructions.Count || currentMaterial is null)
                    continue;

                Ps2VifInstruction gifUnpack = instruction;
                Ps2VifInstruction vertexUnpack = vif.Instructions[i + 1];
                Ps2VifInstruction execute = vif.Instructions[i + 2];

                if (IsMeshSequence(gifUnpack, vertexUnpack, execute))
                {
                    Ps2GifTag gifTag = ReadGifTagAt(stream, payloadOffset + gifUnpack.DataOffset);
                    int vectorCount = EffectiveCount(vertexUnpack.Code.Count);
                    int expectedVectorCount = checked(gifTag.LoopCount * VectorsPerVertex);
                    if (vectorCount != expectedVectorCount)
                        continue;

                    IReadOnlyList<FieldRenderVertex> vertices = ReadVertices(
                        stream,
                        payloadOffset + vertexUnpack.DataOffset,
                        gifTag.LoopCount);

                    output.Add(new FieldRenderPrimitive(
                        global.Index,
                        global.X,
                        global.Z,
                        primitiveIndex++,
                        currentMaterial,
                        gifTag,
                        vertices));
                    continue;
                }

                if (!IsBillboardSequence(gifUnpack, vertexUnpack, execute))
                    continue;

                Ps2GifTag billboardGifTag = ReadGifTagAt(stream, payloadOffset + gifUnpack.DataOffset);
                int billboardVectorCount = EffectiveCount(vertexUnpack.Code.Count);
                int billboardExpectedVectorCount = checked(1 + billboardGifTag.LoopCount * VectorsPerVertex);
                if (billboardVectorCount != billboardExpectedVectorCount)
                    continue;

                (Vector3 placementOffset, IReadOnlyList<FieldRenderVertex> billboardVertices) = ReadOffsetVertices(
                    stream,
                    payloadOffset + vertexUnpack.DataOffset,
                    billboardGifTag.LoopCount);

                output.Add(new FieldRenderPrimitive(
                    global.Index,
                    global.X,
                    global.Z,
                    primitiveIndex++,
                    currentMaterial,
                    billboardGifTag,
                    billboardVertices,
                    placementOffset));
            }
        }

        return output;
    }

    private static bool IsBillboardSequence(
        Ps2VifInstruction gifUnpack,
        Ps2VifInstruction vertexUnpack,
        Ps2VifInstruction execute) =>
        gifUnpack.Kind == Ps2VifCommandKind.Unpack &&
        gifUnpack.Code.Command == V4_32 &&
        EffectiveCount(gifUnpack.Code.Count) == 1 &&
        vertexUnpack.Kind == Ps2VifCommandKind.Unpack &&
        vertexUnpack.Code.Command == V3_32 &&
        execute.Kind == Ps2VifCommandKind.Mscalf &&
        execute.Code.Immediate == FieldBillboardVuProgram;

    private static bool IsMeshSequence(
        Ps2VifInstruction gifUnpack,
        Ps2VifInstruction vertexUnpack,
        Ps2VifInstruction execute) =>
        gifUnpack.Kind == Ps2VifCommandKind.Unpack &&
        gifUnpack.Code.Command == V4_32 &&
        EffectiveCount(gifUnpack.Code.Count) == 1 &&
        vertexUnpack.Kind == Ps2VifCommandKind.Unpack &&
        vertexUnpack.Code.Command == V3_32 &&
        execute.Kind == Ps2VifCommandKind.Mscalf &&
        execute.Code.Immediate == FieldMeshVuProgram;

    private static FieldMaterial? TryReadMaterial(Stream stream, long payloadOffset, Ps2VifInstruction instruction)
    {
        if (instruction.Kind != Ps2VifCommandKind.Unpack ||
            instruction.Code.Command != V3_32 ||
            EffectiveCount(instruction.Code.Count) is < MinimumMaterialVectorCount or > MaximumMaterialVectorCount)
        {
            return null;
        }

        long original = stream.Position;
        try
        {
            stream.Position = checked(payloadOffset + instruction.DataOffset);
            Span<byte> bytes = stackalloc byte[BytesPerVector3];
            ulong materialGifTagLow = 0;
            uint materialGifTagRegistersLow = 0;
            ulong tex1 = 0;
            ulong tex0 = 0;
            ulong clamp = 0;
            ulong mipTbp1 = 0;
            bool hasMaterialGifTag = false;
            bool hasTex1 = false;
            bool hasTex0 = false;
            bool hasClamp = false;
            bool hasMipTbp1 = false;
            int materialVectorCount = EffectiveCount(instruction.Code.Count);

            for (int i = 0; i < materialVectorCount; i++)
            {
                stream.ReadExactly(bytes);
                uint lo = BinaryPrimitives.ReadUInt32LittleEndian(bytes[0..4]);
                uint hi = BinaryPrimitives.ReadUInt32LittleEndian(bytes[4..8]);
                uint register = BinaryPrimitives.ReadUInt32LittleEndian(bytes[8..12]);
                ulong value = ((ulong)hi << 32) | lo;

                switch (register)
                {
                    case 0x0E:
                        materialGifTagLow = value;
                        materialGifTagRegistersLow = register;
                        hasMaterialGifTag = true;
                        break;
                    case 0x15:
                        tex1 = value;
                        hasTex1 = true;
                        break;
                    case 0x07:
                        tex0 = value;
                        hasTex0 = true;
                        break;
                    case 0x09:
                        clamp = value;
                        hasClamp = true;
                        break;
                    // HG2 frequently appends MIPTBP1_2 to the four core material
                    // registers. TEX1 MXL>0 materials depend on this richer block;
                    // even while the first renderer only samples mip level 0, the
                    // update must be recognised or the previous material leaks into
                    // the following mesh draw.
                    case 0x35:
                        mipTbp1 = value;
                        hasMipTbp1 = true;
                        break;
                    default:
                        return null;
                }
            }

            bool coreRegistersPresent = hasMaterialGifTag && hasTex1 && hasTex0 && hasClamp;
            bool optionalRegisterShapeValid = materialVectorCount == MinimumMaterialVectorCount || hasMipTbp1;
            if (!coreRegistersPresent || !optionalRegisterShapeValid)
                return null;

            Ps2GifTag materialGifTag = Ps2GifTag.FromRawWords(materialGifTagLow, materialGifTagRegistersLow);
            bool materialGifTagShapeValid =
                materialGifTag.Format == 0 &&
                materialGifTag.RegisterCount == 1 &&
                materialGifTag.GetRegisterDescriptor(0) == 0xE &&
                materialGifTag.LoopCount == materialVectorCount - 1;
            return materialGifTagShapeValid
                ? FieldMaterial.FromRegisters(materialGifTagLow, materialGifTagRegistersLow, tex1, tex0, clamp, hasMipTbp1 ? mipTbp1 : null)
                : null;
        }
        finally
        {
            stream.Position = original;
        }
    }

    private static Ps2GifTag ReadGifTagAt(Stream stream, long offset)
    {
        long original = stream.Position;
        try
        {
            stream.Position = offset;
            return Ps2GifTag.Read(stream);
        }
        finally
        {
            stream.Position = original;
        }
    }

    private static (Vector3 PlacementOffset, IReadOnlyList<FieldRenderVertex> Vertices) ReadOffsetVertices(Stream stream, long offset, int vertexCount)
    {
        long original = stream.Position;
        try
        {
            stream.Position = offset;
            Span<byte> vectorBytes = stackalloc byte[BytesPerVector3];
            Vector3 positionOffset = ReadVector3(stream, vectorBytes);
            var vertices = new FieldRenderVertex[vertexCount];

            for (int vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++)
            {
                Vector3 position = ReadVector3(stream, vectorBytes) + positionOffset;
                Vector3 dayColor = ReadVector3(stream, vectorBytes);
                Vector3 unknown = ReadVector3(stream, vectorBytes);
                Vector3 nightColor = ReadVector3(stream, vectorBytes);
                Vector3 textureCoordinate = ReadVector3(stream, vectorBytes);
                vertices[vertexIndex] = new FieldRenderVertex(position, dayColor, unknown, nightColor, textureCoordinate);
            }

            return (positionOffset, vertices);
        }
        finally
        {
            stream.Position = original;
        }
    }

    private static IReadOnlyList<FieldRenderVertex> ReadVertices(Stream stream, long offset, int vertexCount)
    {
        long original = stream.Position;
        try
        {
            stream.Position = offset;
            var vertices = new FieldRenderVertex[vertexCount];
            Span<byte> vectorBytes = stackalloc byte[BytesPerVector3];

            for (int vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++)
            {
                Vector3 position = ReadVector3(stream, vectorBytes);
                Vector3 dayColor = ReadVector3(stream, vectorBytes);
                Vector3 unknown = ReadVector3(stream, vectorBytes);
                Vector3 nightColor = ReadVector3(stream, vectorBytes);
                Vector3 textureCoordinate = ReadVector3(stream, vectorBytes);
                vertices[vertexIndex] = new FieldRenderVertex(position, dayColor, unknown, nightColor, textureCoordinate);
            }

            return vertices;
        }
        finally
        {
            stream.Position = original;
        }
    }

    private static Vector3 ReadVector3(Stream stream, Span<byte> bytes)
    {
        stream.ReadExactly(bytes);
        return new Vector3(
            BitConverter.Int32BitsToSingle(BinaryPrimitives.ReadInt32LittleEndian(bytes[0..4])),
            BitConverter.Int32BitsToSingle(BinaryPrimitives.ReadInt32LittleEndian(bytes[4..8])),
            BitConverter.Int32BitsToSingle(BinaryPrimitives.ReadInt32LittleEndian(bytes[8..12])));
    }

    private static int EffectiveCount(byte count) => count == 0 ? 256 : count;
}
