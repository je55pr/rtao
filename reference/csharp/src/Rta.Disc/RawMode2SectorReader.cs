namespace Rta.Disc;

internal sealed class RawMode2SectorReader : ISectorReader
{
    public const int RawSectorSize = 2352;
    public const int UserDataOffset = 24;
    public const int UserDataSize = 2048;

    private readonly FileStream _stream;
    private readonly long _firstSector;
    private readonly long _sectorCount;
    private readonly byte[] _scratch = new byte[RawSectorSize];

    public RawMode2SectorReader(string path, long firstSector = 0)
    {
        _stream = File.Open(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        if (_stream.Length % RawSectorSize != 0)
            throw new InvalidDataException("MODE2/2352 BIN size is not a multiple of 2352 bytes.");

        long totalSectors = _stream.Length / RawSectorSize;
        if ((ulong)firstSector >= (ulong)totalSectors)
            throw new InvalidDataException("CUE INDEX points beyond the BIN image.");

        _firstSector = firstSector;
        _sectorCount = totalSectors - firstSector;
    }

    public long SectorCount => _sectorCount;

    public void ReadSector(long sectorIndex, Span<byte> destination)
    {
        if (destination.Length < UserDataSize)
            throw new ArgumentException("Destination must hold a full 2048-byte user-data sector.", nameof(destination));
        if ((ulong)sectorIndex >= (ulong)_sectorCount)
            throw new ArgumentOutOfRangeException(nameof(sectorIndex));

        long rawSector = checked(_firstSector + sectorIndex);
        _stream.Position = checked(rawSector * RawSectorSize);
        _stream.ReadExactly(_scratch);

        if (_scratch[0] != 0x00 || _scratch[1] != 0xFF || _scratch[11] != 0x00 || _scratch[15] != 0x02)
            throw new InvalidDataException($"Sector {sectorIndex} is not a MODE2 raw sector.");

        _scratch.AsSpan(UserDataOffset, UserDataSize).CopyTo(destination);
    }

    public void Dispose() => _stream.Dispose();
}
