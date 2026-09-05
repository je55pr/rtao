using System.Text;
using Rta.Disc;

namespace Rta.Formats;

public sealed record RtaGameIdentity(string BootExecutable, string Version, string VideoMode)
{
    public const string ExpectedEuropeanExecutable = "SLES_513.56";

    public bool IsSupportedEuropeanRelease => string.Equals(BootExecutable, ExpectedEuropeanExecutable, StringComparison.OrdinalIgnoreCase);

    public static RtaGameIdentity Read(IGameDisc disc)
    {
        ArgumentNullException.ThrowIfNull(disc);
        string text = Encoding.ASCII.GetString(disc.ReadAllBytes("SYSTEM.CNF"));
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (string rawLine in text.Replace("\r", string.Empty).Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            int equals = rawLine.IndexOf('=');
            if (equals < 0)
                continue;
            values[rawLine[..equals].Trim()] = rawLine[(equals + 1)..].Trim();
        }

        string boot = values.GetValueOrDefault("BOOT2") ?? throw new InvalidDataException("SYSTEM.CNF has no BOOT2 entry.");
        int slash = Math.Max(boot.LastIndexOf('\\'), boot.LastIndexOf('/'));
        string executable = slash >= 0 ? boot[(slash + 1)..] : boot;
        int versionSuffix = executable.IndexOf(';');
        if (versionSuffix >= 0)
            executable = executable[..versionSuffix];

        return new RtaGameIdentity(
            executable,
            values.GetValueOrDefault("VER") ?? string.Empty,
            values.GetValueOrDefault("VMODE") ?? string.Empty);
    }
}
