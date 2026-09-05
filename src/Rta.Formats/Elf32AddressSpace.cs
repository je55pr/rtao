using System.Buffers.Binary;
using System.Text;

namespace Rta.Formats;

/// <summary>
/// Minimal read-only ELF32 virtual-address mapper used for the PAL RTA executable.
/// It deliberately implements only the pieces needed by clean-room data readers.
/// </summary>
public sealed class Elf32AddressSpace
{
    private readonly byte[] _image;
    private readonly Segment[] _segments;

    private sealed record Segment(uint FileOffset, uint VirtualAddress, uint FileSize, uint MemorySize);

    public Elf32AddressSpace(Stream executable)
    {
        ArgumentNullException.ThrowIfNull(executable);
        if (!executable.CanRead || !executable.CanSeek)
            throw new ArgumentException("Executable stream must be readable and seekable.", nameof(executable));

        long original = executable.Position;
        try
        {
            executable.Position = 0;
            if (executable.Length > int.MaxValue)
                throw new InvalidDataException("ELF image is too large for the current reader.");
            _image = new byte[(int)executable.Length];
            executable.ReadExactly(_image);
        }
        finally
        {
            executable.Position = original;
        }

        if (_image.Length < 0x34 || _image[0] != 0x7F || _image[1] != (byte)'E' || _image[2] != (byte)'L' || _image[3] != (byte)'F')
            throw new InvalidDataException("Expected an ELF executable.");
        if (_image[4] != 1 || _image[5] != 1)
            throw new NotSupportedException("Only little-endian ELF32 images are supported.");

        uint programHeaderOffset = ReadUInt32File(0x1C);
        ushort programHeaderEntrySize = ReadUInt16File(0x2A);
        ushort programHeaderCount = ReadUInt16File(0x2C);
        if (programHeaderEntrySize < 32)
            throw new InvalidDataException("ELF program-header entry is unexpectedly small.");

        var segments = new List<Segment>();
        for (int i = 0; i < programHeaderCount; i++)
        {
            int offset = checked((int)programHeaderOffset + i * programHeaderEntrySize);
            EnsureFileRange(offset, 32);
            uint type = ReadUInt32File(offset);
            if (type != 1) // PT_LOAD
                continue;

            uint fileOffset = ReadUInt32File(offset + 4);
            uint virtualAddress = ReadUInt32File(offset + 8);
            uint fileSize = ReadUInt32File(offset + 16);
            uint memorySize = ReadUInt32File(offset + 20);
            segments.Add(new Segment(fileOffset, virtualAddress, fileSize, memorySize));
        }

        if (segments.Count == 0)
            throw new InvalidDataException("ELF contains no PT_LOAD segments.");
        _segments = segments.ToArray();
    }

    public uint ReadUInt32(uint virtualAddress)
    {
        int offset = MapFileBackedAddress(virtualAddress, 4);
        return BinaryPrimitives.ReadUInt32LittleEndian(_image.AsSpan(offset, 4));
    }

    public float ReadSingle(uint virtualAddress)
    {
        int bits = unchecked((int)ReadUInt32(virtualAddress));
        return BitConverter.Int32BitsToSingle(bits);
    }

    public byte[] ReadBytes(uint virtualAddress, int count)
    {
        int offset = MapFileBackedAddress(virtualAddress, count);
        return _image.AsSpan(offset, count).ToArray();
    }

    public string ReadAsciiZ(uint virtualAddress, int maxLength = 256)
    {
        if (maxLength <= 0)
            throw new ArgumentOutOfRangeException(nameof(maxLength));
        int offset = MapFileBackedAddress(virtualAddress, 1);
        int end = offset;
        int limit = Math.Min(_image.Length, checked(offset + maxLength));
        while (end < limit && _image[end] != 0)
            end++;
        return Encoding.ASCII.GetString(_image, offset, end - offset);
    }

    public bool IsFileBacked(uint virtualAddress, int count = 1)
    {
        try
        {
            _ = MapFileBackedAddress(virtualAddress, count);
            return true;
        }
        catch (InvalidDataException)
        {
            return false;
        }
    }

    public IReadOnlyList<uint> FindBytes(ReadOnlySpan<byte> pattern)
    {
        if (pattern.IsEmpty)
            throw new ArgumentException("Search pattern must not be empty.", nameof(pattern));

        var matches = new List<uint>();
        foreach (Segment segment in _segments)
        {
            ReadOnlySpan<byte> data = _image.AsSpan(checked((int)segment.FileOffset), checked((int)segment.FileSize));
            int searched = 0;
            while (searched <= data.Length - pattern.Length)
            {
                int relative = data[searched..].IndexOf(pattern);
                if (relative < 0)
                    break;
                int offset = searched + relative;
                matches.Add(checked(segment.VirtualAddress + (uint)offset));
                searched = offset + 1;
            }
        }
        return matches;
    }

    private int MapFileBackedAddress(uint virtualAddress, int count)
    {
        if (count < 0)
            throw new ArgumentOutOfRangeException(nameof(count));

        foreach (Segment segment in _segments)
        {
            ulong start = segment.VirtualAddress;
            ulong end = start + segment.FileSize;
            ulong requestedStart = virtualAddress;
            ulong requestedEnd = requestedStart + (uint)count;
            if (requestedStart >= start && requestedEnd <= end)
            {
                ulong fileOffset = segment.FileOffset + (requestedStart - start);
                if (fileOffset + (uint)count > (ulong)_image.Length)
                    break;
                return checked((int)fileOffset);
            }
        }

        throw new InvalidDataException($"Virtual address 0x{virtualAddress:X8} (+{count}) is not backed by ELF file data.");
    }

    private ushort ReadUInt16File(int offset)
    {
        EnsureFileRange(offset, 2);
        return BinaryPrimitives.ReadUInt16LittleEndian(_image.AsSpan(offset, 2));
    }

    private uint ReadUInt32File(int offset)
    {
        EnsureFileRange(offset, 4);
        return BinaryPrimitives.ReadUInt32LittleEndian(_image.AsSpan(offset, 4));
    }

    private void EnsureFileRange(int offset, int count)
    {
        if (offset < 0 || count < 0 || (long)offset + count > _image.Length)
            throw new InvalidDataException("ELF metadata points outside the file image.");
    }
}
