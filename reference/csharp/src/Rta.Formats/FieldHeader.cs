namespace Rta.Formats;

public sealed class FieldHeader
{
    internal FieldHeader(IReadOnlyList<uint> offsets, long fileLength)
    {
        Offsets = offsets;
        FileLength = fileLength;

        var sections = new List<FieldSection>(offsets.Count - 1);
        for (int i = 0; i < offsets.Count - 1; i++)
        {
            FieldSectionKind kind = i switch
            {
                0 => FieldSectionKind.Textures,
                1 => FieldSectionKind.RenderMeshes,
                2 => FieldSectionKind.Collision,
                _ => FieldSectionKind.Extra
            };
            int extraIndex = kind == FieldSectionKind.Extra ? i - 3 : 0;
            sections.Add(new FieldSection(kind, extraIndex, offsets[i], offsets[i + 1] - offsets[i]));
        }
        Sections = sections;
    }

    public IReadOnlyList<uint> Offsets { get; }
    public IReadOnlyList<FieldSection> Sections { get; }
    public long FileLength { get; }
    public uint HeaderLength => Offsets[0];
    public uint EndOffset => Offsets[^1];

    public FieldSection Textures => Sections[0];
    public FieldSection RenderMeshes => Sections[1];
    public FieldSection Collision => Sections[2];
    public IReadOnlyList<FieldSection> Extras => Sections.Skip(3).ToArray();
}
