namespace Rta.Formats;

/// <summary>
/// Minimal 4 MiB PlayStation 2 GS local-memory model for the pixel storage modes
/// HG2 uploads in its field texture sections. It replays host-to-local IMAGE
/// transfers using BITBLTBUF/TRXPOS/TRXREG addressing and can then read a TEX0
/// surface back into linear row-major pixels.
///
/// This deliberately models memory layout rather than treating each upload as an
/// independent image: GS base pointers are block addresses into one shared VRAM.
/// Page/block/column layouts follow the GS pixel-storage definitions used by
/// PCSX2/ps2sdk-compatible implementations.
/// </summary>
public sealed class GsLocalMemory
{
    public const int SizeBytes = 4 * 1024 * 1024;
    private const int WordSizeBytes = 4;
    private const int WordCount = SizeBytes / WordSizeBytes;

    private static readonly int[] BlockCt32 =
    [
         0,  1,  4,  5, 16, 17, 20, 21,
         2,  3,  6,  7, 18, 19, 22, 23,
         8,  9, 12, 13, 24, 25, 28, 29,
        10, 11, 14, 15, 26, 27, 30, 31
    ];

    private static readonly int[] ColumnWordCt32 =
    [
        0, 1, 4, 5, 8, 9, 12, 13,
        2, 3, 6, 7, 10, 11, 14, 15
    ];

    private static readonly int[] BlockT8 = BlockCt32;

    private static readonly int[][] ColumnWordT8 =
    [
        [
             0,  1,  4,  5,  8,  9, 12, 13,  0,  1,  4,  5,  8,  9, 12, 13,
             2,  3,  6,  7, 10, 11, 14, 15,  2,  3,  6,  7, 10, 11, 14, 15,
             8,  9, 12, 13,  0,  1,  4,  5,  8,  9, 12, 13,  0,  1,  4,  5,
            10, 11, 14, 15,  2,  3,  6,  7, 10, 11, 14, 15,  2,  3,  6,  7
        ],
        [
             8,  9, 12, 13,  0,  1,  4,  5,  8,  9, 12, 13,  0,  1,  4,  5,
            10, 11, 14, 15,  2,  3,  6,  7, 10, 11, 14, 15,  2,  3,  6,  7,
             0,  1,  4,  5,  8,  9, 12, 13,  0,  1,  4,  5,  8,  9, 12, 13,
             2,  3,  6,  7, 10, 11, 14, 15,  2,  3,  6,  7, 10, 11, 14, 15
        ]
    ];

    private static readonly int[] ColumnByteT8 =
    [
        0,0,0,0,0,0,0,0, 2,2,2,2,2,2,2,2,
        0,0,0,0,0,0,0,0, 2,2,2,2,2,2,2,2,
        1,1,1,1,1,1,1,1, 3,3,3,3,3,3,3,3,
        1,1,1,1,1,1,1,1, 3,3,3,3,3,3,3,3
    ];

    private static readonly int[] BlockT4 =
    [
         0,  2,  8, 10,
         1,  3,  9, 11,
         4,  6, 12, 14,
         5,  7, 13, 15,
        16, 18, 24, 26,
        17, 19, 25, 27,
        20, 22, 28, 30,
        21, 23, 29, 31
    ];

    private static readonly int[][] ColumnWordT4 =
    [
        [
             0, 1, 4, 5, 8, 9,12,13,  0, 1, 4, 5, 8, 9,12,13,  0, 1, 4, 5, 8, 9,12,13,  0, 1, 4, 5, 8, 9,12,13,
             2, 3, 6, 7,10,11,14,15,  2, 3, 6, 7,10,11,14,15,  2, 3, 6, 7,10,11,14,15,  2, 3, 6, 7,10,11,14,15,
             8, 9,12,13, 0, 1, 4, 5,  8, 9,12,13, 0, 1, 4, 5,  8, 9,12,13, 0, 1, 4, 5,  8, 9,12,13, 0, 1, 4, 5,
            10,11,14,15, 2, 3, 6, 7, 10,11,14,15, 2, 3, 6, 7, 10,11,14,15, 2, 3, 6, 7, 10,11,14,15, 2, 3, 6, 7
        ],
        [
             8, 9,12,13, 0, 1, 4, 5,  8, 9,12,13, 0, 1, 4, 5,  8, 9,12,13, 0, 1, 4, 5,  8, 9,12,13, 0, 1, 4, 5,
            10,11,14,15, 2, 3, 6, 7, 10,11,14,15, 2, 3, 6, 7, 10,11,14,15, 2, 3, 6, 7, 10,11,14,15, 2, 3, 6, 7,
             0, 1, 4, 5, 8, 9,12,13,  0, 1, 4, 5, 8, 9,12,13,  0, 1, 4, 5, 8, 9,12,13,  0, 1, 4, 5, 8, 9,12,13,
             2, 3, 6, 7,10,11,14,15,  2, 3, 6, 7,10,11,14,15,  2, 3, 6, 7,10,11,14,15,  2, 3, 6, 7,10,11,14,15
        ]
    ];

    private static readonly int[] ColumnByteT4 =
    [
        0,0,0,0,0,0,0,0, 2,2,2,2,2,2,2,2, 4,4,4,4,4,4,4,4, 6,6,6,6,6,6,6,6,
        0,0,0,0,0,0,0,0, 2,2,2,2,2,2,2,2, 4,4,4,4,4,4,4,4, 6,6,6,6,6,6,6,6,
        1,1,1,1,1,1,1,1, 3,3,3,3,3,3,3,3, 5,5,5,5,5,5,5,5, 7,7,7,7,7,7,7,7,
        1,1,1,1,1,1,1,1, 3,3,3,3,3,3,3,3, 5,5,5,5,5,5,5,5, 7,7,7,7,7,7,7,7
    ];

    private readonly byte[] _memory = new byte[SizeBytes];

    public void Clear() => Array.Clear(_memory);

    public void Replay(IEnumerable<FieldTextureUpload> uploads)
    {
        ArgumentNullException.ThrowIfNull(uploads);
        foreach (FieldTextureUpload upload in uploads)
            Write(upload);
    }

    public void Write(FieldTextureUpload upload)
    {
        ArgumentNullException.ThrowIfNull(upload);
        switch (upload.DestinationPixelStorageFormat)
        {
            case GsPixelStorageFormat.PsmCt32:
                WriteCt32(upload, bytesPerPixel: 4);
                break;
            case GsPixelStorageFormat.PsmCt24:
                WriteCt32(upload, bytesPerPixel: 3);
                break;
            case GsPixelStorageFormat.PsmT8:
                WriteT8(upload);
                break;
            case GsPixelStorageFormat.PsmT4:
                WriteT4(upload);
                break;
            default:
                throw new NotSupportedException($"GS upload PSM {upload.DestinationPixelStorageFormat} is not implemented.");
        }
    }

    /// <summary>Reads the level-0 TEX0 image into host-order packed pixels.</summary>
    public byte[] ReadTexture(GsTex0 tex0)
    {
        return tex0.PixelStorageFormat switch
        {
            GsPixelStorageFormat.PsmCt32 => ReadCt32(tex0.TextureBasePointer, tex0.TextureBufferWidth, tex0.Width, tex0.Height, 4),
            GsPixelStorageFormat.PsmCt24 => ReadCt32(tex0.TextureBasePointer, tex0.TextureBufferWidth, tex0.Width, tex0.Height, 3),
            GsPixelStorageFormat.PsmT8 => ReadT8(tex0.TextureBasePointer, tex0.TextureBufferWidth, tex0.Width, tex0.Height),
            GsPixelStorageFormat.PsmT4 => ReadT4(tex0.TextureBasePointer, tex0.TextureBufferWidth, tex0.Width, tex0.Height),
            _ => throw new NotSupportedException($"GS TEX0 PSM {tex0.PixelStorageFormat} is not implemented.")
        };
    }

    /// <summary>
    /// Reads a small 32-bit CLUT surface from CBP. HG2 CSM1 palettes are uploaded
    /// as ordinary PSMCT32 images and the logical-entry permutation is applied by
    /// the caller, matching the existing palette decoder.
    /// </summary>
    public byte[] ReadCt32Surface(ushort basePointer, byte bufferWidth, int width, int height) =>
        ReadCt32(basePointer, bufferWidth, width, height, 4);

    /// <summary>
    /// Reads the logical CSM1 palette selected by TEX0. HG2 field materials use
    /// 32-bit CLUT storage with CSA=0. CSM1 permutes address bits 3 and 4; for
    /// PSMT4 this intentionally means only physical entries 0..7 and 16..23 of
    /// the 16x2 upload are live palette entries, allowing the following texture
    /// upload to reuse the otherwise-unused neighbouring GS block.
    /// </summary>
    public byte[] ReadCsm1Clut(GsTex0 tex0)
    {
        if (tex0.ClutStorageMode)
            throw new NotSupportedException("CSM2 CLUT addressing is not implemented.");
        if (tex0.ClutPixelStorageFormat != 0)
            throw new NotSupportedException($"CLUT PSM {tex0.ClutPixelStorageFormat} is not implemented.");

        int entryCount = tex0.PixelStorageFormat switch
        {
            GsPixelStorageFormat.PsmT4 => 16,
            GsPixelStorageFormat.PsmT8 => 256,
            _ => throw new InvalidOperationException($"TEX0 PSM {tex0.PixelStorageFormat} does not use an indexed CLUT.")
        };

        var output = new byte[checked(entryCount * 4)];
        int entryBase = tex0.ClutEntryOffset * 16;
        for (int logicalIndex = 0; logicalIndex < entryCount; logicalIndex++)
        {
            int physicalIndex = SwapClutBits3And4(entryBase + logicalIndex);
            int x = physicalIndex & 0x0F;
            int y = physicalIndex >> 4;
            int address = Ct32ByteAddress(tex0.ClutBasePointer, 1, x, y);
            int target = logicalIndex * 4;
            output[target] = _memory[address];
            output[target + 1] = _memory[WrapByte(address + 1)];
            output[target + 2] = _memory[WrapByte(address + 2)];
            output[target + 3] = _memory[WrapByte(address + 3)];
        }

        return output;
    }

    private void WriteCt32(FieldTextureUpload upload, int bytesPerPixel)
    {
        int sourceOffset = 0;
        int expected = checked(upload.Width * upload.Height * bytesPerPixel);
        if (upload.Data.Length < expected)
            throw new InvalidDataException($"GS packet {upload.PacketIndex} contains {upload.Data.Length} bytes, expected at least {expected}.");

        for (int y = 0; y < upload.Height; y++)
        {
            for (int x = 0; x < upload.Width; x++)
            {
                int address = Ct32ByteAddress(upload.DestinationBasePointer, upload.DestinationBufferWidth, upload.DestinationX + x, upload.DestinationY + y);
                _memory[address] = upload.Data[sourceOffset++];
                _memory[WrapByte(address + 1)] = upload.Data[sourceOffset++];
                _memory[WrapByte(address + 2)] = upload.Data[sourceOffset++];
                if (bytesPerPixel == 4)
                    _memory[WrapByte(address + 3)] = upload.Data[sourceOffset++];
            }
        }
    }

    private byte[] ReadCt32(ushort basePointer, byte bufferWidth, int width, int height, int bytesPerPixel)
    {
        var output = new byte[checked(width * height * bytesPerPixel)];
        int destinationOffset = 0;
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                int address = Ct32ByteAddress(basePointer, bufferWidth, x, y);
                output[destinationOffset++] = _memory[address];
                output[destinationOffset++] = _memory[WrapByte(address + 1)];
                output[destinationOffset++] = _memory[WrapByte(address + 2)];
                if (bytesPerPixel == 4)
                    output[destinationOffset++] = _memory[WrapByte(address + 3)];
            }
        }
        return output;
    }

    private void WriteT8(FieldTextureUpload upload)
    {
        int expected = checked(upload.Width * upload.Height);
        if (upload.Data.Length < expected)
            throw new InvalidDataException($"GS packet {upload.PacketIndex} contains {upload.Data.Length} bytes, expected at least {expected}.");

        int sourceOffset = 0;
        for (int y = 0; y < upload.Height; y++)
        {
            for (int x = 0; x < upload.Width; x++)
                _memory[T8ByteAddress(upload.DestinationBasePointer, upload.DestinationBufferWidth, upload.DestinationX + x, upload.DestinationY + y)] = upload.Data[sourceOffset++];
        }
    }

    private byte[] ReadT8(ushort basePointer, byte bufferWidth, int width, int height)
    {
        var output = new byte[checked(width * height)];
        int index = 0;
        for (int y = 0; y < height; y++)
            for (int x = 0; x < width; x++)
                output[index++] = _memory[T8ByteAddress(basePointer, bufferWidth, x, y)];
        return output;
    }

    private void WriteT4(FieldTextureUpload upload)
    {
        int pixelCount = checked(upload.Width * upload.Height);
        int expected = (pixelCount + 1) / 2;
        if (upload.Data.Length < expected)
            throw new InvalidDataException($"GS packet {upload.PacketIndex} contains {upload.Data.Length} bytes, expected at least {expected}.");

        int pixelIndex = 0;
        for (int y = 0; y < upload.Height; y++)
        {
            for (int x = 0; x < upload.Width; x++, pixelIndex++)
            {
                byte packed = upload.Data[pixelIndex >> 1];
                byte value = (byte)(((pixelIndex & 1) == 0 ? packed : packed >> 4) & 0x0F);
                (int address, bool highNibble) = T4NibbleAddress(upload.DestinationBasePointer, upload.DestinationBufferWidth, upload.DestinationX + x, upload.DestinationY + y);
                byte existing = _memory[address];
                _memory[address] = highNibble
                    ? (byte)((existing & 0x0F) | (value << 4))
                    : (byte)((existing & 0xF0) | value);
            }
        }
    }

    private byte[] ReadT4(ushort basePointer, byte bufferWidth, int width, int height)
    {
        int pixelCount = checked(width * height);
        var output = new byte[(pixelCount + 1) / 2];
        int pixelIndex = 0;
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++, pixelIndex++)
            {
                (int address, bool highNibble) = T4NibbleAddress(basePointer, bufferWidth, x, y);
                byte value = (byte)(highNibble ? (_memory[address] >> 4) & 0x0F : _memory[address] & 0x0F);
                int target = pixelIndex >> 1;
                if ((pixelIndex & 1) == 0)
                    output[target] = value;
                else
                    output[target] = (byte)(output[target] | (value << 4));
            }
        }
        return output;
    }

    private static int Ct32ByteAddress(ushort basePointer, byte bufferWidth, int x, int y)
    {
        int pageX = x / 64;
        int pageY = y / 32;
        int page = pageX + pageY * bufferWidth;
        int px = x - pageX * 64;
        int py = y - pageY * 32;
        int blockX = px / 8;
        int blockY = py / 8;
        int block = BlockCt32[blockX + blockY * 8];
        int bx = px - blockX * 8;
        int by = py - blockY * 8;
        int column = by / 2;
        int cx = bx;
        int cy = by - column * 2;
        int word = ColumnWordCt32[cx + cy * 8];
        int wordAddress = basePointer * 64 + page * 2048 + block * 64 + column * 16 + word;
        return WrapWord(wordAddress) * WordSizeBytes;
    }

    private static int T8ByteAddress(ushort basePointer, byte bufferWidth, int x, int y)
    {
        int pageStride = bufferWidth >> 1;
        if (pageStride <= 0)
            pageStride = 1;
        int pageX = x / 128;
        int pageY = y / 64;
        int page = pageX + pageY * pageStride;
        int px = x - pageX * 128;
        int py = y - pageY * 64;
        int blockX = px / 16;
        int blockY = py / 16;
        int block = BlockT8[blockX + blockY * 8];
        int bx = px - blockX * 16;
        int by = py - blockY * 16;
        int column = by / 4;
        int cx = bx;
        int cy = by - column * 4;
        int word = ColumnWordT8[column & 1][cx + cy * 16];
        int byteInWord = ColumnByteT8[cx + cy * 16];
        int wordAddress = basePointer * 64 + page * 2048 + block * 64 + column * 16 + word;
        return WrapByte(WrapWord(wordAddress) * WordSizeBytes + byteInWord);
    }

    private static (int Address, bool HighNibble) T4NibbleAddress(ushort basePointer, byte bufferWidth, int x, int y)
    {
        int pageStride = bufferWidth >> 1;
        if (pageStride <= 0)
            pageStride = 1;
        int pageX = x / 128;
        int pageY = y / 128;
        int page = pageX + pageY * pageStride;
        int px = x - pageX * 128;
        int py = y - pageY * 128;
        int blockX = px / 32;
        int blockY = py / 16;
        int block = BlockT4[blockX + blockY * 4];
        int bx = px - blockX * 32;
        int by = py - blockY * 16;
        int column = by / 4;
        int cx = bx;
        int cy = by - column * 4;
        int word = ColumnWordT4[column & 1][cx + cy * 32];
        int nibbleInWord = ColumnByteT4[cx + cy * 32];
        int wordAddress = basePointer * 64 + page * 2048 + block * 64 + column * 16 + word;
        int address = WrapByte(WrapWord(wordAddress) * WordSizeBytes + (nibbleInWord >> 1));
        return (address, (nibbleInWord & 1) != 0);
    }

    private static int SwapClutBits3And4(int value) =>
        (value & ~0x18) | ((value & 0x08) << 1) | ((value & 0x10) >> 1);

    private static int WrapWord(int wordAddress)
    {
        int result = wordAddress % WordCount;
        return result < 0 ? result + WordCount : result;
    }

    private static int WrapByte(int byteAddress)
    {
        int result = byteAddress % SizeBytes;
        return result < 0 ? result + SizeBytes : result;
    }
}
