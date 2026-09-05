namespace Rta.Formats;

/// <summary>A decoded panorama from HG2's shared SYS/SORA.GSL outdoor-sky package.</summary>
public sealed record Hg2SkyImage(
    int Width,
    int Height,
    byte[] RgbaPixels,
    GsPixelStorageFormat SourcePixelStorageFormat);

/// <summary>
/// Shared outdoor sky imagery. HG2 stores an opaque daytime cloud/horizon panorama
/// plus a transparent night star/moon overlay in one inline GS DMA stream.
/// </summary>
public sealed record Hg2SkyTextureSet(
    Hg2SkyImage DayPanorama,
    Hg2SkyImage NightOverlay,
    int DmaPacketCount);

public static class Hg2SkyTextureReader
{
    public const int ExpectedDayWidth = 512;
    public const int ExpectedDayHeight = 96;
    public const int ExpectedNightWidth = 1024;
    public const int ExpectedNightHeight = 128;

    public static Hg2SkyTextureSet Read(Stream stream)
    {
        ArgumentNullException.ThrowIfNull(stream);
        if (!stream.CanRead || !stream.CanSeek)
            throw new ArgumentException("Sky stream must be readable and seekable.", nameof(stream));

        uint streamLength = checked((uint)stream.Length);
        Ps2DmaChain chain = Ps2DmaChain.ReadInline(stream, 0, streamLength);
        IReadOnlyList<FieldTextureUpload> uploads = FieldTextureUploadReader.ReadUploadSequence(stream, 0, streamLength);

        FieldTextureUpload dayImage = uploads.FirstOrDefault(upload =>
            upload.DestinationPixelStorageFormat == GsPixelStorageFormat.PsmT8 &&
            upload.Width == ExpectedDayWidth &&
            upload.Height == ExpectedDayHeight)
            ?? throw new InvalidDataException("SYS/SORA.GSL does not contain its expected 512x96 daytime panorama.");
        FieldTextureUpload dayClut = FindFollowingClut(uploads, dayImage, 16, 16);

        FieldTextureUpload nightImage = uploads.FirstOrDefault(upload =>
            upload.DestinationPixelStorageFormat == GsPixelStorageFormat.PsmT4 &&
            upload.Width == ExpectedNightWidth &&
            upload.Height == ExpectedNightHeight)
            ?? throw new InvalidDataException("SYS/SORA.GSL does not contain its expected 1024x128 night panorama.");
        FieldTextureUpload nightClut = FindFollowingClut(uploads, nightImage, 16, 2);

        return new Hg2SkyTextureSet(
            DecodeIndexed8(dayImage, dayClut),
            DecodeIndexed4(nightImage, nightClut),
            chain.Packets.Count);
    }

    private static FieldTextureUpload FindFollowingClut(
        IReadOnlyList<FieldTextureUpload> uploads,
        FieldTextureUpload image,
        int width,
        int height)
    {
        return uploads.FirstOrDefault(upload =>
            upload.PacketIndex > image.PacketIndex &&
            upload.DestinationPixelStorageFormat == GsPixelStorageFormat.PsmCt32 &&
            upload.Width == width &&
            upload.Height == height)
            ?? throw new InvalidDataException(
                $"SYS/SORA.GSL image packet {image.PacketIndex} has no following {width}x{height} PSMCT32 CLUT.");
    }

    private static Hg2SkyImage DecodeIndexed8(FieldTextureUpload image, FieldTextureUpload clut)
    {
        int pixelCount = checked(image.Width * image.Height);
        if (image.Data.Length < pixelCount)
            throw new InvalidDataException("Day sky index payload is shorter than its declared image dimensions.");
        if (clut.Data.Length < 256 * 4)
            throw new InvalidDataException("Day sky CLUT is shorter than 256 RGBA entries.");

        byte[] rgba = new byte[checked(pixelCount * 4)];
        for (int pixel = 0; pixel < pixelCount; pixel++)
            CopyPaletteEntry(image.Data[pixel], clut.Data, rgba, pixel * 4);
        return new Hg2SkyImage(image.Width, image.Height, rgba, image.DestinationPixelStorageFormat);
    }

    private static Hg2SkyImage DecodeIndexed4(FieldTextureUpload image, FieldTextureUpload clut)
    {
        int pixelCount = checked(image.Width * image.Height);
        if (image.Data.Length < (pixelCount + 1) / 2)
            throw new InvalidDataException("Night sky index payload is shorter than its declared image dimensions.");
        // CSM1 maps logical indices 8..15 onto physical entries 16..23, so HG2
        // uploads a 16x2 surface even though PSMT4 exposes only 16 logical colours.
        if (clut.Data.Length < 24 * 4)
            throw new InvalidDataException("Night sky CLUT is too short for its CSM1 logical palette.");

        byte[] rgba = new byte[checked(pixelCount * 4)];
        for (int pixel = 0; pixel < pixelCount; pixel++)
        {
            byte packed = image.Data[pixel >> 1];
            int index = (pixel & 1) == 0 ? packed & 0x0F : (packed >> 4) & 0x0F;
            CopyPaletteEntry(index, clut.Data, rgba, pixel * 4);
        }
        return new Hg2SkyImage(image.Width, image.Height, rgba, image.DestinationPixelStorageFormat);
    }

    private static void CopyPaletteEntry(int logicalIndex, ReadOnlySpan<byte> clut, Span<byte> output, int outputOffset)
    {
        int physicalIndex = SwapClutBits3And4(logicalIndex);
        int paletteOffset = physicalIndex * 4;
        output[outputOffset] = clut[paletteOffset];
        output[outputOffset + 1] = clut[paletteOffset + 1];
        output[outputOffset + 2] = clut[paletteOffset + 2];
        output[outputOffset + 3] = ExpandPs2Alpha(clut[paletteOffset + 3]);
    }

    private static int SwapClutBits3And4(int value) =>
        (value & ~0x18) | ((value & 0x08) << 1) | ((value & 0x10) >> 1);

    private static byte ExpandPs2Alpha(byte value) =>
        value == 0 ? (byte)0 : (byte)Math.Min(value * 2, 255);
}
