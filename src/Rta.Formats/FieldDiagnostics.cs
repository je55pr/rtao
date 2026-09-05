namespace Rta.Formats;

public sealed record FieldSectionDiagnostic(FieldSection Section, uint Signature);

public static class FieldDiagnostics
{
    public static IReadOnlyList<FieldSectionDiagnostic> ReadSectionSignatures(Stream stream, FieldHeader header) =>
        header.Sections.Select(section => new FieldSectionDiagnostic(section, FieldFile.ReadSectionSignature(stream, section))).ToArray();

    public static Ps2DmaTag ReadFirstTextureDmaTag(Stream stream, FieldHeader header)
    {
        long originalPosition = stream.Position;
        try
        {
            stream.Position = header.Textures.Offset;
            return Ps2DmaTag.Read(stream);
        }
        finally
        {
            stream.Position = originalPosition;
        }
    }
}
