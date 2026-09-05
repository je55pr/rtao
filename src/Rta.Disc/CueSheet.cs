using System.Text.RegularExpressions;

namespace Rta.Disc;

internal sealed record CueSheet(string BinPath, long FirstSector)
{
    private static readonly Regex FilePattern = new("^\\s*FILE\\s+\"(?<file>.+)\"\\s+BINARY\\s*$", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex TrackPattern = new("^\\s*TRACK\\s+01\\s+MODE2/2352\\s*$", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex IndexPattern = new("^\\s*INDEX\\s+01\\s+(?<m>\\d+):(?<s>\\d+):(?<f>\\d+)\\s*$", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static CueSheet Parse(string cuePath)
    {
        string? file = null;
        bool mode2 = false;
        long? firstSector = null;

        foreach (string line in File.ReadLines(cuePath))
        {
            Match fileMatch = FilePattern.Match(line);
            if (fileMatch.Success)
            {
                file = fileMatch.Groups["file"].Value;
                continue;
            }

            if (TrackPattern.IsMatch(line))
            {
                mode2 = true;
                continue;
            }

            Match indexMatch = IndexPattern.Match(line);
            if (indexMatch.Success)
            {
                int minutes = int.Parse(indexMatch.Groups["m"].Value);
                int seconds = int.Parse(indexMatch.Groups["s"].Value);
                int frames = int.Parse(indexMatch.Groups["f"].Value);
                if (seconds >= 60 || frames >= 75)
                    throw new InvalidDataException("Invalid CUE INDEX timestamp.");
                firstSector = ((minutes * 60L) + seconds) * 75L + frames;
            }
        }

        if (file is null || !mode2 || firstSector is null)
            throw new NotSupportedException("Expected a single-track TRACK 01 MODE2/2352 CUE with INDEX 01.");

        string binPath = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(cuePath)!, file));
        if (!File.Exists(binPath))
            throw new FileNotFoundException("BIN referenced by CUE was not found.", binPath);

        return new CueSheet(binPath, firstSector.Value);
    }
}
