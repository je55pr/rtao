namespace Rta.Formats;

/// <summary>
/// Simple HG2 object container used by CARS/WHEEL.BIN, TIRE.BIN and PARTS.BIN.
/// The file starts with a monotonically increasing table of relative section offsets;
/// the final entry is EOF. Some object types place a texture DMA section immediately
/// before EOF, while others (such as WHEEL.BIN) contain model sections only.
/// </summary>
public sealed class Hg2ObjectFileHeader
{
    internal Hg2ObjectFileHeader(IReadOnlyList<uint> offsets, long fileLength)
    {
        Offsets = offsets;
        FileLength = fileLength;
    }

    public IReadOnlyList<uint> Offsets { get; }
    public long FileLength { get; }
    public int SectionCount => Math.Max(0, Offsets.Count - 1);
    public uint EndOffset => Offsets[^1];
}

public static class Hg2ObjectFile
{
    public static Hg2ObjectFileHeader ReadHeader(Stream stream)
    {
        ArgumentNullException.ThrowIfNull(stream);
        if (!stream.CanRead || !stream.CanSeek)
            throw new ArgumentException("Object stream must be readable and seekable.", nameof(stream));
        if (stream.Length < 16)
            throw new InvalidDataException("HG2 object file is too small to contain an offset table.");

        long original = stream.Position;
        try
        {
            stream.Position = 0;
            uint firstOffset = BinaryStream.ReadUInt32LittleEndian(stream);
            if (firstOffset < 8 || firstOffset > stream.Length || (firstOffset & 3) != 0)
                throw new InvalidDataException($"Invalid first HG2 object offset 0x{firstOffset:X8}.");

            int capacity = checked((int)(firstOffset / 4));
            stream.Position = 0;
            var offsets = new List<uint>(capacity);
            for (int i = 0; i < capacity; i++)
            {
                uint value = BinaryStream.ReadUInt32LittleEndian(stream);
                if (value == 0)
                    break;
                offsets.Add(value);
            }

            if (offsets.Count < 2 || offsets[0] != firstOffset)
                throw new InvalidDataException("HG2 object offset table is incomplete.");

            uint previous = 0;
            foreach (uint value in offsets)
            {
                if (value <= previous || value > stream.Length)
                    throw new InvalidDataException("HG2 object section offsets are invalid or not strictly increasing.");
                previous = value;
            }

            if (offsets[^1] != stream.Length)
                throw new InvalidDataException("HG2 object EOF offset does not match the file length.");

            return new Hg2ObjectFileHeader(offsets, stream.Length);
        }
        finally
        {
            stream.Position = original;
        }
    }

    public static IReadOnlyList<CarRenderPrimitive> ReadPrimaryMesh(Stream stream, Hg2ObjectFileHeader header, int sectionIndex)
    {
        if ((uint)sectionIndex >= header.Offsets.Count - 1)
            throw new ArgumentOutOfRangeException(nameof(sectionIndex));
        long sectionOffset = header.Offsets[sectionIndex];
        return CarRenderPrimitiveReader.ReadMeshPart(stream, checked(sectionOffset + 0x10));
    }
}
