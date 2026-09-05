namespace Rta.Disc;

internal sealed class CookedSectorReader : ISectorReader
{
    private const int SectorSize = 2048;
    private readonly FileStream _stream;

    public CookedSectorReader(string path)
    {
        _stream = File.Open(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        if (_stream.Length % SectorSize != 0)
            throw new InvalidDataException("Cooked ISO size is not a multiple of 2048 bytes.");
    }

    public long SectorCount => _stream.Length / SectorSize;

    public void ReadSector(long sectorIndex, Span<byte> destination)
    {
        if (destination.Length < SectorSize)
            throw new ArgumentException("Destination must hold a full 2048-byte sector.", nameof(destination));
        if ((ulong)sectorIndex >= (ulong)SectorCount)
            throw new ArgumentOutOfRangeException(nameof(sectorIndex));

        _stream.Position = checked(sectorIndex * SectorSize);
        _stream.ReadExactly(destination[..SectorSize]);
    }

    public void Dispose() => _stream.Dispose();
}
