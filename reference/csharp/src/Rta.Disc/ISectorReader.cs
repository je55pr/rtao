namespace Rta.Disc;

internal interface ISectorReader : IDisposable
{
    long SectorCount { get; }
    void ReadSector(long sectorIndex, Span<byte> destination);
}
