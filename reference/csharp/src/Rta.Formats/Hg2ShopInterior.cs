namespace Rta.Formats;

/// <summary>
/// The main pre-rendered 640x384 screen stored in one fixed SHOP/Txx.BIN slot.
/// RgbaPixels is straight-alpha RGBA8 in display order.
/// </summary>
public sealed record Hg2ShopInteriorBackdrop(
    int SlotIndex,
    int Width,
    int Height,
    byte[] RgbaPixels,
    int DmaPacketCount,
    GsPixelStorageFormat SourcePixelStorageFormat);

/// <summary>
/// Reader for HG2's fixed-size indoor/fixed-interaction packages.
///
/// Each package occupies 0x3F000 bytes. The first DMA packet uploads a 640x384
/// PSMT8 screen image and the second uploads its 16x16 PSMCT32 CLUT. Some
/// interactions contain further packets for additional UI imagery, but the first
/// image+CLUT pair is the authored base screen shared by all observed slots.
/// </summary>
public static class Hg2ShopInteriorReader
{
    public const int SlotSize = 0x3F000;
    public const int ExpectedWidth = 640;
    public const int ExpectedHeight = 384;

    public static int GetSlotCount(Stream stream)
    {
        ArgumentNullException.ThrowIfNull(stream);
        if (!stream.CanSeek)
            throw new ArgumentException("SHOP stream must be seekable.", nameof(stream));
        return checked((int)(stream.Length / SlotSize));
    }

    public static Hg2ShopInteriorBackdrop ReadBackdrop(Stream stream, int slotIndex)
    {
        ArgumentNullException.ThrowIfNull(stream);
        if (!stream.CanRead || !stream.CanSeek)
            throw new ArgumentException("SHOP stream must be readable and seekable.", nameof(stream));
        if (slotIndex < 0)
            throw new ArgumentOutOfRangeException(nameof(slotIndex));

        long slotOffset = checked((long)slotIndex * SlotSize);
        if (slotOffset + SlotSize > stream.Length)
            throw new ArgumentOutOfRangeException(nameof(slotIndex), $"SHOP slot {slotIndex} lies beyond the {stream.Length:N0}-byte file.");

        Ps2DmaChain chain = Ps2DmaChain.ReadInline(stream, slotOffset, SlotSize);
        Ps2DmaPacket[] imagePackets = chain.Packets
            .Where(packet => packet.Tag.Id == Ps2DmaTagId.Cnt)
            .Take(2)
            .ToArray();
        if (imagePackets.Length < 2)
            throw new InvalidDataException($"SHOP slot {slotIndex} does not contain its expected image and CLUT DMA packets.");

        FieldTextureUpload image = Ps2GsImageTransferReader.ReadUpload(
            stream,
            checked(slotOffset + imagePackets[0].PayloadOffset),
            0);
        FieldTextureUpload clut = Ps2GsImageTransferReader.ReadUpload(
            stream,
            checked(slotOffset + imagePackets[1].PayloadOffset),
            1);

        if (image.DestinationPixelStorageFormat != GsPixelStorageFormat.PsmT8)
            throw new NotSupportedException($"SHOP slot {slotIndex} base screen uses unsupported PSM 0x{(byte)image.DestinationPixelStorageFormat:X2}.");
        if (clut.DestinationPixelStorageFormat != GsPixelStorageFormat.PsmCt32)
            throw new NotSupportedException($"SHOP slot {slotIndex} CLUT uses unsupported PSM 0x{(byte)clut.DestinationPixelStorageFormat:X2}.");
        if (image.Width <= 0 || image.Height <= 0)
            throw new InvalidDataException($"SHOP slot {slotIndex} has invalid base-screen dimensions {image.Width}x{image.Height}.");

        int pixelCount = checked(image.Width * image.Height);
        if (image.Data.Length < pixelCount)
            throw new InvalidDataException($"SHOP slot {slotIndex} PSMT8 payload contains {image.Data.Length:N0} bytes for {pixelCount:N0} pixels.");
        if (clut.Data.Length < 256 * 4)
            throw new InvalidDataException($"SHOP slot {slotIndex} CLUT contains only {clut.Data.Length:N0} bytes.");

        byte[] rgba = DecodeIndexed8(image.Data, clut.Data, pixelCount);
        return new Hg2ShopInteriorBackdrop(
            slotIndex,
            image.Width,
            image.Height,
            rgba,
            chain.Packets.Count,
            image.DestinationPixelStorageFormat);
    }

    private static byte[] DecodeIndexed8(ReadOnlySpan<byte> indices, ReadOnlySpan<byte> clut, int pixelCount)
    {
        byte[] output = new byte[checked(pixelCount * 4)];
        for (int pixel = 0; pixel < pixelCount; pixel++)
        {
            int logicalIndex = indices[pixel];
            int physicalIndex = SwapClutBits3And4(logicalIndex);
            int paletteOffset = physicalIndex * 4;
            int outputOffset = pixel * 4;
            output[outputOffset] = clut[paletteOffset];
            output[outputOffset + 1] = clut[paletteOffset + 1];
            output[outputOffset + 2] = clut[paletteOffset + 2];
            output[outputOffset + 3] = ExpandPs2Alpha(clut[paletteOffset + 3]);
        }
        return output;
    }

    // HG2 uses GS CSM1 for these indexed screens. With a 32-bit CLUT, address
    // bits 3 and 4 are exchanged when converting logical palette indices to the
    // physical 16x16 upload order.
    private static int SwapClutBits3And4(int value) =>
        (value & ~0x18) | ((value & 0x08) << 1) | ((value & 0x10) >> 1);

    private static byte ExpandPs2Alpha(byte value) =>
        value == 0 ? (byte)0 : (byte)Math.Min(value * 2, 255);
}
