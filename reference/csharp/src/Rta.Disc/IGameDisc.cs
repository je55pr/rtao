namespace Rta.Disc;

public interface IGameDisc : IDisposable
{
    string Description { get; }
    bool FileExists(string path);
    Stream OpenFile(string path);
    byte[] ReadAllBytes(string path);
}
