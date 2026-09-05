using System.Buffers.Binary;
using System.Numerics;

namespace Rta.Formats;

/// <summary>
/// One triangle-strip primitive from HG2's post-collision field minimap mesh.
/// Positions are stored directly in field/world X/Z coordinates (Y is zero in
/// the source minimap), which makes the minimap useful as a geometric fingerprint
/// of the actual road network as well as for the UI map.
/// </summary>
public sealed record FieldMinimapPrimitive(
    Ps2GifTag GifTag,
    IReadOnlyList<FieldMinimapVertex> Vertices)
{
    public int PrimitiveType => GifTag.Primitive & 0x7;
}

public readonly record struct FieldMinimapVertex(Vector3 Position, Vector3 Color);

public static class FieldMinimapReader
{
    private const byte V3_32 = 0x68;
    private const byte V4_32 = 0x6C;
    private const ushort MinimapVuProgram = 10;
    private const int VectorsPerVertex = 4;
    private const int BytesPerVector3 = 12;

    /// <summary>
    /// Decodes the minimap mesh from the first post-collision field extra.
    /// HG2 stores that extra using the same three-part mesh container shape used
    /// elsewhere in the game; the populated minimap part is detected by its VU1
    /// execution entry rather than by assuming a fixed relative offset.
    /// </summary>
    public static IReadOnlyList<FieldMinimapPrimitive> Read(Stream stream, FieldHeader header)
    {
        ArgumentNullException.ThrowIfNull(stream);
        if (!stream.CanRead || !stream.CanSeek)
            throw new ArgumentException("Field stream must be readable and seekable.", nameof(stream));
        if (header.Extras.Count == 0)
            return Array.Empty<FieldMinimapPrimitive>();

        FieldSection extra = header.Extras[0];
        foreach (uint relativeOffset in ReadCandidateMeshOffsets(stream, extra))
        {
            if (relativeOffset + 16 > extra.Length)
                continue;

            long candidateOffset = checked((long)extra.Offset + relativeOffset);
            uint maximumLength = extra.Length - relativeOffset;
            Ps2DmaChain? chain = TryReadInlineChain(stream, candidateOffset, maximumLength);
            if (chain is null)
                continue;

            IReadOnlyList<FieldMinimapPrimitive> primitives = TryReadMinimapChain(stream, candidateOffset, chain);
            if (primitives.Count > 0)
                return primitives;
        }

        return Array.Empty<FieldMinimapPrimitive>();
    }

    private static IReadOnlyList<uint> ReadCandidateMeshOffsets(Stream stream, FieldSection extra)
    {
        long original = stream.Position;
        try
        {
            stream.Position = extra.Offset;
            uint first = BinaryStream.ReadUInt32LittleEndian(stream);
            uint second = BinaryStream.ReadUInt32LittleEndian(stream);
            // The HG2 three-part mesh container has an implicit first part at +0x10,
            // followed by the two relative offsets stored in the header.
            return new[] { 0x10u, first, second }.Distinct().Order().ToArray();
        }
        finally
        {
            stream.Position = original;
        }
    }

    private static Ps2DmaChain? TryReadInlineChain(Stream stream, long offset, uint maximumLength)
    {
        try
        {
            return Ps2DmaChain.ReadInline(stream, offset, maximumLength);
        }
        catch (Exception ex) when (ex is InvalidDataException or NotSupportedException or EndOfStreamException)
        {
            return null;
        }
    }

    private static IReadOnlyList<FieldMinimapPrimitive> TryReadMinimapChain(
        Stream stream,
        long chainStart,
        Ps2DmaChain chain)
    {
        var output = new List<FieldMinimapPrimitive>();

        foreach (Ps2DmaPacket packet in chain.Packets.Where(packet => packet.Tag.Id == Ps2DmaTagId.Cnt))
        {
            long tagOffset = checked(chainStart + packet.RelativeOffset);
            long payloadOffset = checked(tagOffset + 16);
            Ps2VifStream vif;
            try
            {
                vif = Ps2VifStream.ReadPacket(stream, tagOffset, packet.Tag);
            }
            catch (Exception ex) when (ex is InvalidDataException or NotSupportedException or EndOfStreamException)
            {
                return Array.Empty<FieldMinimapPrimitive>();
            }

            for (int i = 0; i + 2 < vif.Instructions.Count; i++)
            {
                Ps2VifInstruction gifUnpack = vif.Instructions[i];
                Ps2VifInstruction vertexUnpack = vif.Instructions[i + 1];
                Ps2VifInstruction execute = vif.Instructions[i + 2];
                if (!IsMinimapSequence(gifUnpack, vertexUnpack, execute))
                    continue;

                Ps2GifTag gifTag = ReadGifTagAt(stream, payloadOffset + gifUnpack.DataOffset);
                int vectorCount = EffectiveCount(vertexUnpack.Code.Count);
                int expected = checked(gifTag.LoopCount * VectorsPerVertex);
                if (vectorCount != expected)
                    continue;

                output.Add(new FieldMinimapPrimitive(
                    gifTag,
                    ReadVertices(stream, payloadOffset + vertexUnpack.DataOffset, gifTag.LoopCount)));
            }
        }

        return output;
    }

    private static bool IsMinimapSequence(
        Ps2VifInstruction gifUnpack,
        Ps2VifInstruction vertexUnpack,
        Ps2VifInstruction execute) =>
        gifUnpack.Kind == Ps2VifCommandKind.Unpack &&
        gifUnpack.Code.Command == V4_32 &&
        EffectiveCount(gifUnpack.Code.Count) == 1 &&
        vertexUnpack.Kind == Ps2VifCommandKind.Unpack &&
        vertexUnpack.Code.Command == V3_32 &&
        execute.Kind == Ps2VifCommandKind.Mscalf &&
        execute.Code.Immediate == MinimapVuProgram;

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

    private static IReadOnlyList<FieldMinimapVertex> ReadVertices(Stream stream, long offset, int vertexCount)
    {
        long original = stream.Position;
        try
        {
            stream.Position = offset;
            var vertices = new FieldMinimapVertex[vertexCount];
            Span<byte> vectorBytes = stackalloc byte[BytesPerVector3];
            for (int i = 0; i < vertexCount; i++)
            {
                Vector3 position = ReadVector3(stream, vectorBytes);
                _ = ReadVector3(stream, vectorBytes); // constant/helper vector (0,0,1)
                Vector3 color = ReadVector3(stream, vectorBytes);
                _ = ReadVector3(stream, vectorBytes); // constant/helper vector (0,0,1)
                vertices[i] = new FieldMinimapVertex(position, color);
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
