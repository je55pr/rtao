namespace Rta.Formats;

public sealed class CarFileHeader
{
    internal CarFileHeader(IReadOnlyList<uint> offsets, long fileLength)
    {
        Offsets = offsets;
        FileLength = fileLength;
    }

    public IReadOnlyList<uint> Offsets { get; }
    public long FileLength { get; }
    public int ModelSectionCount => Math.Max(0, Offsets.Count - 2);
    public uint TextureOffset => Offsets[^2];
    public uint EndOffset => Offsets[^1];
    public uint TextureLength => EndOffset - TextureOffset;
}

public static class CarFile
{
    public static CarFileHeader ReadHeader(Stream stream)
    {
        ArgumentNullException.ThrowIfNull(stream);
        if (!stream.CanRead || !stream.CanSeek)
            throw new ArgumentException("Car stream must be readable and seekable.", nameof(stream));
        if (stream.Length < 32)
            throw new InvalidDataException("Car file is too small to contain the HG2 offset table.");

        long original = stream.Position;
        try
        {
            stream.Position = 0;
            uint firstOffset = BinaryStream.ReadUInt32LittleEndian(stream);
            if (firstOffset < 16 || firstOffset > stream.Length || (firstOffset & 3) != 0)
                throw new InvalidDataException($"Invalid first car section offset 0x{firstOffset:X8}.");

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

            if (offsets.Count < 3 || offsets[0] != firstOffset)
                throw new InvalidDataException("Car section table is incomplete.");

            uint previous = 0;
            foreach (uint value in offsets)
            {
                if (value <= previous || value > stream.Length)
                    throw new InvalidDataException("Car section offsets are invalid or not strictly increasing.");
                previous = value;
            }
            if (offsets[^1] != stream.Length)
                throw new InvalidDataException("Car EOF offset does not match the file length.");

            return new CarFileHeader(offsets, stream.Length);
        }
        finally
        {
            stream.Position = original;
        }
    }
}
