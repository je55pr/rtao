namespace Rta.Disc;

public static class GameDisc
{
    public static IGameDisc Open(string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        path = Path.GetFullPath(path);

        if (Directory.Exists(path))
            return new DirectoryGameDisc(path);

        if (!File.Exists(path))
            throw new FileNotFoundException("RTA disc path does not exist.", path);

        return Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".cue" => RawCueGameDisc.Open(path),
            ".bin" => RawCueGameDisc.OpenBin(path),
            ".iso" => new Iso9660GameDisc(new CookedSectorReader(path), $"ISO: {Path.GetFileName(path)}"),
            _ => throw new NotSupportedException($"Unsupported disc source '{Path.GetExtension(path)}'. Use a BIN/CUE, ISO, or extracted directory.")
        };
    }
}
