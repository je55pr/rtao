using System.Buffers.Binary;
using System.Text;

namespace Rta.Disc;

internal sealed class Iso9660GameDisc : IGameDisc
{
    private const int SectorSize = 2048;
    private readonly ISectorReader _sectors;
    private readonly IsoDirectoryRecord _root;

    public Iso9660GameDisc(ISectorReader sectors, string description)
    {
        _sectors = sectors;
        Description = description;
        _root = ReadPrimaryVolumeDescriptor();
    }

    public string Description { get; }

    public bool FileExists(string path)
    {
        try
        {
            _ = Resolve(path);
            return true;
        }
        catch (FileNotFoundException)
        {
            return false;
        }
    }

    public Stream OpenFile(string path) => new MemoryStream(ReadAllBytes(path), writable: false);

    public byte[] ReadAllBytes(string path)
    {
        IsoDirectoryRecord record = Resolve(path);
        if (record.IsDirectory)
            throw new IOException($"'{path}' is a directory.");

        byte[] result = GC.AllocateUninitializedArray<byte>(checked((int)record.DataLength));
        Span<byte> sector = stackalloc byte[SectorSize];
        int written = 0;
        long sectorIndex = record.Extent;

        while (written < result.Length)
        {
            _sectors.ReadSector(sectorIndex++, sector);
            int count = Math.Min(SectorSize, result.Length - written);
            sector[..count].CopyTo(result.AsSpan(written, count));
            written += count;
        }

        return result;
    }

    public void Dispose() => _sectors.Dispose();

    private IsoDirectoryRecord ReadPrimaryVolumeDescriptor()
    {
        Span<byte> sector = stackalloc byte[SectorSize];
        for (long index = 16; index < Math.Min(_sectors.SectorCount, 256); index++)
        {
            _sectors.ReadSector(index, sector);
            byte type = sector[0];
            if (!sector.Slice(1, 5).SequenceEqual("CD001"u8) || sector[6] != 1)
                continue;

            if (type == 1)
                return ParseDirectoryRecord(sector[156..], "<root>");
            if (type == 255)
                break;
        }

        throw new InvalidDataException("No ISO9660 Primary Volume Descriptor was found.");
    }

    private IsoDirectoryRecord Resolve(string path)
    {
        string normalized = DiscPath.Normalize(path);
        if (normalized.Length == 0)
            return _root;

        IsoDirectoryRecord current = _root;
        foreach (string component in normalized.Split('/'))
        {
            if (!current.IsDirectory)
                throw new FileNotFoundException($"'{component}' is below a non-directory record.", normalized);

            current = ReadDirectory(current)
                .FirstOrDefault(r => string.Equals(r.NormalizedName, component, StringComparison.OrdinalIgnoreCase))
                ?? throw new FileNotFoundException($"Disc file '{normalized}' was not found.", normalized);
        }

        return current;
    }

    private IEnumerable<IsoDirectoryRecord> ReadDirectory(IsoDirectoryRecord directory)
    {
        byte[] bytes = ReadExtent(directory);
        int offset = 0;
        while (offset < bytes.Length)
        {
            int sectorOffset = offset % SectorSize;
            byte length = bytes[offset];
            if (length == 0)
            {
                offset += SectorSize - sectorOffset;
                continue;
            }

            if (sectorOffset + length > SectorSize || offset + length > bytes.Length)
                throw new InvalidDataException("ISO9660 directory record crosses a logical-sector boundary.");

            IsoDirectoryRecord record = ParseDirectoryRecord(bytes.AsSpan(offset, length), "<directory entry>");
            offset += length;

            if (record.Name is "\0" or "\u0001")
                continue;
            yield return record;
        }
    }

    private byte[] ReadExtent(IsoDirectoryRecord record)
    {
        byte[] result = GC.AllocateUninitializedArray<byte>(checked((int)record.DataLength));
        byte[] sector = new byte[SectorSize];
        int written = 0;
        long sectorIndex = record.Extent;
        while (written < result.Length)
        {
            _sectors.ReadSector(sectorIndex++, sector);
            int count = Math.Min(SectorSize, result.Length - written);
            sector.AsSpan(0, count).CopyTo(result.AsSpan(written));
            written += count;
        }
        return result;
    }

    private static IsoDirectoryRecord ParseDirectoryRecord(ReadOnlySpan<byte> data, string context)
    {
        if (data.Length < 34 || data[0] < 34 || data[0] > data.Length)
            throw new InvalidDataException($"Invalid ISO9660 directory record at {context}.");

        uint extentLe = BinaryPrimitives.ReadUInt32LittleEndian(data.Slice(2, 4));
        uint extentBe = BinaryPrimitives.ReadUInt32BigEndian(data.Slice(6, 4));
        uint lengthLe = BinaryPrimitives.ReadUInt32LittleEndian(data.Slice(10, 4));
        uint lengthBe = BinaryPrimitives.ReadUInt32BigEndian(data.Slice(14, 4));
        if (extentLe != extentBe || lengthLe != lengthBe)
            throw new InvalidDataException("ISO9660 both-endian fields do not agree.");

        int nameLength = data[32];
        if (33 + nameLength > data[0])
            throw new InvalidDataException("ISO9660 filename extends beyond its directory record.");

        string name = nameLength == 1 && data[33] <= 1
            ? ((char)data[33]).ToString()
            : Encoding.ASCII.GetString(data.Slice(33, nameLength));

        int semicolon = name.IndexOf(';');
        string normalized = (semicolon >= 0 ? name[..semicolon] : name).ToUpperInvariant();
        bool isDirectory = (data[25] & 0x02) != 0;
        return new IsoDirectoryRecord(name, normalized, extentLe, lengthLe, isDirectory);
    }

    private sealed record IsoDirectoryRecord(string Name, string NormalizedName, uint Extent, uint DataLength, bool IsDirectory);
}
