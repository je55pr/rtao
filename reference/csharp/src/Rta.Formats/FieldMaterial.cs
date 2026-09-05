namespace Rta.Formats;

public sealed record FieldMaterial(
    Ps2GifTag MaterialGifTag,
    ulong Tex1,
    GsTex0 Tex0,
    GsClamp Clamp,
    ulong? MipTbp1)
{
    public static FieldMaterial FromRegisters(ulong materialGifTagLow, uint materialGifTagRegistersLow, ulong tex1, ulong tex0, ulong clamp, ulong? mipTbp1 = null) =>
        new(Ps2GifTag.FromRawWords(materialGifTagLow, materialGifTagRegistersLow), tex1, GsTex0.Decode(tex0), GsClamp.Decode(clamp), mipTbp1);
}
