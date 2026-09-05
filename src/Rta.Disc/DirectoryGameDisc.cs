namespace Rta.Disc;

internal sealed class DirectoryGameDisc(string root) : IGameDisc
{
    private readonly string _root = Path.GetFullPath(root);

    public string Description => $"Directory: {_root}";

    public bool FileExists(string path) => File.Exists(Resolve(path));

    public Stream OpenFile(string path) => File.OpenRead(Resolve(path));

    public byte[] ReadAllBytes(string path) => File.ReadAllBytes(Resolve(path));

    public void Dispose() { }

    private string Resolve(string path)
    {
        string normalized = DiscPath.Normalize(path).Replace('/', Path.DirectorySeparatorChar);
        string candidate = Path.GetFullPath(Path.Combine(_root, normalized));
        string rootPrefix = _root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!candidate.StartsWith(rootPrefix, StringComparison.Ordinal) && !string.Equals(candidate, _root, StringComparison.Ordinal))
            throw new InvalidOperationException("Disc path escaped the extracted-disc root.");
        return candidate;
    }
}
