namespace Rta.Formats;

public enum FieldSectionKind
{
    Textures,
    RenderMeshes,
    Collision,
    Extra
}

public sealed record FieldSection(FieldSectionKind Kind, int Index, uint Offset, uint Length)
{
    public uint EndOffset => checked(Offset + Length);

    public override string ToString() => Kind == FieldSectionKind.Extra
        ? $"Extra[{Index}] @ 0x{Offset:X8}, {Length:N0} bytes"
        : $"{Kind} @ 0x{Offset:X8}, {Length:N0} bytes";
}
