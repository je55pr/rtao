namespace Rta.Formats;

public enum GsPixelStorageFormat : byte
{
    PsmCt32 = 0x00,
    PsmCt24 = 0x01,
    PsmCt16 = 0x02,
    PsmCt16S = 0x0A,
    PsmT8 = 0x13,
    PsmT4 = 0x14
}

public readonly record struct GsTex0(
    ushort TextureBasePointer,
    byte TextureBufferWidth,
    GsPixelStorageFormat PixelStorageFormat,
    byte WidthExponent,
    byte HeightExponent,
    bool RgbaColorComponent,
    byte TextureFunction,
    ushort ClutBasePointer,
    byte ClutPixelStorageFormat,
    bool ClutStorageMode,
    byte ClutEntryOffset,
    byte ClutLoadControl)
{
    public int Width => 1 << WidthExponent;
    public int Height => 1 << HeightExponent;

    public static GsTex0 Decode(ulong value) => new(
        TextureBasePointer: (ushort)(value & 0x3FFF),
        TextureBufferWidth: (byte)((value >> 14) & 0x3F),
        PixelStorageFormat: (GsPixelStorageFormat)((value >> 20) & 0x3F),
        WidthExponent: (byte)((value >> 26) & 0xF),
        HeightExponent: (byte)((value >> 30) & 0xF),
        RgbaColorComponent: ((value >> 34) & 0x1) != 0,
        TextureFunction: (byte)((value >> 35) & 0x3),
        ClutBasePointer: (ushort)((value >> 37) & 0x3FFF),
        ClutPixelStorageFormat: (byte)((value >> 51) & 0xF),
        ClutStorageMode: ((value >> 55) & 0x1) != 0,
        ClutEntryOffset: (byte)((value >> 56) & 0x1F),
        ClutLoadControl: (byte)((value >> 61) & 0x7));
}

public readonly record struct GsClamp(
    byte WrapModeS,
    byte WrapModeT,
    byte MinU,
    byte MaxU,
    byte MinV,
    byte MaxV)
{
    public static GsClamp Decode(ulong value) => new(
        WrapModeS: (byte)(value & 0x3),
        WrapModeT: (byte)((value >> 2) & 0x3),
        MinU: (byte)((value >> 4) & 0x3FF),
        MaxU: (byte)((value >> 14) & 0x3FF),
        MinV: (byte)((value >> 24) & 0x3FF),
        MaxV: (byte)((value >> 34) & 0x3FF));
}
