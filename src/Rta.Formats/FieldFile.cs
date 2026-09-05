namespace Rta.Formats;

public static class FieldFile
{
    public static FieldHeader ReadHeader(Stream stream)
    {
        ArgumentNullException.ThrowIfNull(stream);
        if (!stream.CanRead || !stream.CanSeek)
            throw new ArgumentException("Field stream must be readable and seekable.", nameof(stream));
        if (stream.Length < 20)
            throw new InvalidDataException("Field file is too small to contain the HG2 section table.");

        long originalPosition = stream.Position;
        try
        {
            stream.Position = 0;
            uint firstOffset = BinaryStream.ReadUInt32LittleEndian(stream);
            if (firstOffset < 16 || firstOffset > stream.Length || (firstOffset & 3) != 0)
                throw new InvalidDataException($"Invalid first field section offset 0x{firstOffset:X8}.");

            int tableEntryCapacity = checked((int)(firstOffset / 4));
            stream.Position = 0;
            var offsets = new List<uint>(tableEntryCapacity);
            for (int i = 0; i < tableEntryCapacity; i++)
            {
                uint value = BinaryStream.ReadUInt32LittleEndian(stream);
                if (value == 0)
                    break;
                offsets.Add(value);
            }

            if (offsets.Count < 4)
                throw new InvalidDataException("Field section table does not contain texture, mesh, collision and EOF offsets.");
            if (offsets[0] != firstOffset)
                throw new InvalidDataException("First field offset does not match the section-table length.");

            uint previous = 0;
            foreach (uint value in offsets)
            {
                if (value <= previous)
                    throw new InvalidDataException("Field section offsets are not strictly increasing.");
                if (value > stream.Length)
                    throw new InvalidDataException("Field section offset lies beyond end of file.");
                previous = value;
            }

            if (offsets[^1] != stream.Length)
                throw new InvalidDataException($"Field EOF offset 0x{offsets[^1]:X} does not match file length 0x{stream.Length:X}.");

            return new FieldHeader(offsets, stream.Length);
        }
        finally
        {
            stream.Position = originalPosition;
        }
    }

    public static uint ReadSectionSignature(Stream stream, FieldSection section)
    {
        ArgumentNullException.ThrowIfNull(stream);
        long originalPosition = stream.Position;
        try
        {
            stream.Position = section.Offset;
            return BinaryStream.ReadUInt32LittleEndian(stream);
        }
        finally
        {
            stream.Position = originalPosition;
        }
    }
}
