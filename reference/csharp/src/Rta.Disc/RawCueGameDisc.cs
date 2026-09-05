namespace Rta.Disc;

internal static class RawCueGameDisc
{
    public static IGameDisc Open(string cuePath)
    {
        CueSheet cue = CueSheet.Parse(cuePath);
        return new Iso9660GameDisc(
            new RawMode2SectorReader(cue.BinPath, cue.FirstSector),
            $"BIN/CUE: {Path.GetFileName(cuePath)}");
    }

    public static IGameDisc OpenBin(string binPath)
    {
        string expectedCue = Path.ChangeExtension(binPath, ".cue");
        if (File.Exists(expectedCue))
            return Open(expectedCue);

        return new Iso9660GameDisc(
            new RawMode2SectorReader(binPath),
            $"MODE2/2352 BIN: {Path.GetFileName(binPath)}");
    }
}
