using System.Buffers.Binary;
using System.Numerics;

namespace Rta.Formats;

public sealed record FieldCollisionPrimitive(
    int ChunkIndex,
    Ps2GifTag GifTag,
    uint SurfaceFlags,
    IReadOnlyList<Vector3> Vertices,
    IReadOnlyList<Vector3> TriangleNormals)
{
    public int PrimitiveType => GifTag.Primitive & 0x7;
    public int TriangleCount => Math.Max(0, Vertices.Count - 2);
}

/// <summary>
/// HG2 field collision data is a 16x16 chunk grid. Each primitive is a GIF-like
/// tag followed by N float4 positions and N-2 float4 triangle normals. The upper
/// register word contains surface/property bits whose exact meanings are still under
/// investigation but are preserved verbatim.
/// </summary>
public static class FieldCollisionReader
{
    private const int Float4Bytes = 16;

    public static IReadOnlyList<FieldCollisionPrimitive> ReadAll(
        Stream stream,
        FieldHeader header,
        FieldChunkDirectory? chunks = null)
    {
        ArgumentNullException.ThrowIfNull(stream);
        ArgumentNullException.ThrowIfNull(header);
        chunks ??= FieldChunkDirectory.ReadCollision(stream, header);

        var output = new List<FieldCollisionPrimitive>();
        foreach (FieldChunk chunk in chunks.Chunks)
        {
            long position = checked((long)header.Collision.Offset + chunk.RelativeOffset);
            long end = checked(position + chunk.Length);
            int primitiveCount = chunk.DeclaredPacketCount;

            for (int primitiveIndex = 0; primitiveIndex < primitiveCount; primitiveIndex++)
            {
                if (position + 16 > end)
                    throw new InvalidDataException($"Collision chunk {chunk.Index} ended before primitive {primitiveIndex} tag.");

                stream.Position = position;
                Ps2GifTag gif = Ps2GifTag.Read(stream);
                int vertexCount = gif.LoopCount;
                if (vertexCount < 3)
                    throw new InvalidDataException($"Collision chunk {chunk.Index} primitive {primitiveIndex} has {vertexCount} vertices.");

                Vector3[] vertices = ReadFloat4Vectors(stream, vertexCount);
                Vector3[] normals = ReadFloat4Vectors(stream, vertexCount - 2);
                position = stream.Position;

                // The ordinary register descriptors live in the low 32 bits. The
                // upper word is unused by the GIF descriptor list and varies in a
                // small, highly structured set across Peach Town collision surfaces.
                uint flags = (uint)(gif.Registers >> 32);
                output.Add(new FieldCollisionPrimitive(chunk.Index, gif, flags, vertices, normals));
            }

            if (position > end)
                throw new InvalidDataException($"Collision chunk {chunk.Index} overran by {position - end} bytes.");
        }

        return output;
    }

    private static Vector3[] ReadFloat4Vectors(Stream stream, int count)
    {
        var result = new Vector3[count];
        Span<byte> bytes = stackalloc byte[Float4Bytes];
        for (int i = 0; i < count; i++)
        {
            stream.ReadExactly(bytes);
            result[i] = new Vector3(
                BitConverter.Int32BitsToSingle(BinaryPrimitives.ReadInt32LittleEndian(bytes[0..4])),
                BitConverter.Int32BitsToSingle(BinaryPrimitives.ReadInt32LittleEndian(bytes[4..8])),
                BitConverter.Int32BitsToSingle(BinaryPrimitives.ReadInt32LittleEndian(bytes[8..12])));
        }
        return result;
    }
}
