using System.Buffers.Binary;
using System.Numerics;

namespace Rta.Formats;

public readonly record struct CarRenderVertex(
    Vector3 Position,
    Vector3 Normal,
    Vector3 Color,
    Vector3 TextureData)
{
    public Vector2 TextureCoordinate => new(TextureData.X, TextureData.Y);
    public float SurfaceParameter => TextureData.Z;
}

public sealed record CarRenderPrimitive(
    Ps2GifTag GifTag,
    byte ColorSelection,
    ushort VuProgram,
    IReadOnlyList<CarRenderVertex> Vertices)
{
    public int PrimitiveType => GifTag.Primitive & 0x7;
    public bool UsesTexture => Vertices.Any(vertex => MathF.Abs(vertex.TextureData.X) > 0.00001f || MathF.Abs(vertex.TextureData.Y) > 0.00001f);
}

public static class CarRenderPrimitiveReader
{
    private const byte V3_32 = 0x68;
    private const byte V4_32 = 0x6C;
    private const int VectorsPerVertex = 4;
    private const int BytesPerVector3 = 12;

    /// <summary>
    /// Reads the high-detail main body (section 0, mesh 0) from an HG2 Qxx.BIN.
    /// The other meshes in this section are the light/brake overlays and can be
    /// layered later without changing this primary-body path.
    /// </summary>
    public static IReadOnlyList<CarRenderPrimitive> ReadPrimaryBody(Stream stream, CarFileHeader header)
    {
        ArgumentNullException.ThrowIfNull(stream);
        ArgumentNullException.ThrowIfNull(header);
        if (header.ModelSectionCount < 1)
            return Array.Empty<CarRenderPrimitive>();

        long container = header.Offsets[0];
        long meshOffset = checked(container + 0x10);
        return ReadMeshPart(stream, meshOffset);
    }

    public static IReadOnlyList<CarRenderPrimitive> ReadMeshPart(Stream stream, long meshOffset)
    {
        long original = stream.Position;
        try
        {
            stream.Position = meshOffset;
            Ps2DmaTag tag = Ps2DmaTag.Read(stream);
            if (tag.Id != Ps2DmaTagId.Cnt)
                throw new NotSupportedException($"HG2 car mesh at 0x{meshOffset:X} uses DMA tag {tag.Id}; expected CNT.");

            Ps2VifStream vif = Ps2VifStream.ReadPacket(stream, meshOffset, tag);
            long payloadOffset = checked(meshOffset + 16);
            var output = new List<CarRenderPrimitive>();

            for (int i = 0; i + 2 < vif.Instructions.Count; i++)
            {
                Ps2VifInstruction gifUnpack = vif.Instructions[i];
                Ps2VifInstruction vertexUnpack = vif.Instructions[i + 1];
                Ps2VifInstruction execute = vif.Instructions[i + 2];
                if (!IsCarSequence(gifUnpack, vertexUnpack, execute))
                    continue;

                Ps2GifTag gif = ReadGifTagAt(stream, payloadOffset + gifUnpack.DataOffset);
                int vectorCount = EffectiveCount(vertexUnpack.Code.Count);
                int expected = checked(gif.LoopCount * VectorsPerVertex);
                if (vectorCount != expected)
                    throw new InvalidDataException($"Car primitive expects {expected} vectors from GIF NLOOP={gif.LoopCount}, got {vectorCount}.");

                output.Add(new CarRenderPrimitive(
                    gif,
                    (byte)((gif.Registers >> 32) & 0xFF),
                    execute.Code.Immediate,
                    ReadVertices(stream, payloadOffset + vertexUnpack.DataOffset, gif.LoopCount)));
                i += 2;
            }

            return output;
        }
        finally
        {
            stream.Position = original;
        }
    }

    private static bool IsCarSequence(Ps2VifInstruction gif, Ps2VifInstruction vertices, Ps2VifInstruction execute) =>
        gif.Kind == Ps2VifCommandKind.Unpack && gif.Code.Command == V4_32 && EffectiveCount(gif.Code.Count) == 1 &&
        vertices.Kind == Ps2VifCommandKind.Unpack && vertices.Code.Command == V3_32 &&
        execute.Kind == Ps2VifCommandKind.Mscalf && execute.Code.Immediate is 4 or 10;

    private static Ps2GifTag ReadGifTagAt(Stream stream, long offset)
    {
        long original = stream.Position;
        try
        {
            stream.Position = offset;
            return Ps2GifTag.Read(stream);
        }
        finally { stream.Position = original; }
    }

    private static IReadOnlyList<CarRenderVertex> ReadVertices(Stream stream, long offset, int count)
    {
        long original = stream.Position;
        try
        {
            stream.Position = offset;
            var vertices = new CarRenderVertex[count];
            Span<byte> bytes = stackalloc byte[BytesPerVector3];
            for (int i = 0; i < count; i++)
            {
                Vector3 position = ReadVector3(stream, bytes);
                Vector3 normal = ReadVector3(stream, bytes);
                Vector3 color = ReadVector3(stream, bytes);
                Vector3 texture = ReadVector3(stream, bytes);
                vertices[i] = new CarRenderVertex(position, normal, color, texture);
            }
            return vertices;
        }
        finally { stream.Position = original; }
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
