namespace Rta.Formats;

/// <summary>
/// Decodes the small GIF packet HG2 uses for host-to-local GS image transfers.
/// The packet consists of a four-register A+D setup (BITBLTBUF/TRXPOS/TRXREG/
/// TRXDIR), followed by one GIF IMAGE payload. This shape is reused by fields,
/// cars and the pre-rendered SHOP interior screens.
/// </summary>
public static class Ps2GsImageTransferReader
{
    public static FieldTextureUpload ReadUpload(Stream stream, long payloadOffset, int packetIndex = 0)
    {
        ArgumentNullException.ThrowIfNull(stream);
        if (!stream.CanRead || !stream.CanSeek)
            throw new ArgumentException("GS image-transfer stream must be readable and seekable.", nameof(stream));

        long original = stream.Position;
        try
        {
            stream.Position = payloadOffset;
            Ps2GifTag setupTag = Ps2GifTag.Read(stream);
            if (setupTag.LoopCount != 4 || setupTag.Format != 0 || setupTag.RegisterCount != 1 || setupTag.GetRegisterDescriptor(0) != 0xE)
                throw new NotSupportedException($"Texture packet {packetIndex} has unsupported setup GIF tag.");

            ulong bitbltbuf = 0;
            ulong trxpos = 0;
            ulong trxreg = 0;
            ulong trxdir = 0;
            bool sawBitbltbuf = false;
            bool sawTrxpos = false;
            bool sawTrxreg = false;
            bool sawTrxdir = false;

            for (int i = 0; i < 4; i++)
            {
                ulong value = BinaryStream.ReadUInt64LittleEndian(stream);
                ulong registerWord = BinaryStream.ReadUInt64LittleEndian(stream);
                byte register = (byte)(registerWord & 0xFF);
                switch (register)
                {
                    case 0x50: // BITBLTBUF
                        bitbltbuf = value;
                        sawBitbltbuf = true;
                        break;
                    case 0x51: // TRXPOS
                        trxpos = value;
                        sawTrxpos = true;
                        break;
                    case 0x52: // TRXREG
                        trxreg = value;
                        sawTrxreg = true;
                        break;
                    case 0x53: // TRXDIR
                        trxdir = value;
                        sawTrxdir = true;
                        break;
                }
            }

            if (!sawBitbltbuf || !sawTrxpos || !sawTrxreg || !sawTrxdir)
                throw new InvalidDataException($"Texture packet {packetIndex} is missing BITBLTBUF/TRXPOS/TRXREG/TRXDIR.");
            if ((trxdir & 0x3) != 0)
                throw new NotSupportedException($"Texture packet {packetIndex} is not a host-to-local GS transfer (TRXDIR={trxdir & 0x3}).");

            Ps2GifTag imageTag = Ps2GifTag.Read(stream);
            if (imageTag.Format != 2)
                throw new NotSupportedException($"Texture packet {packetIndex} has non-IMAGE GIF payload format {imageTag.Format}.");

            int imageBytes = checked(imageTag.LoopCount * 16);
            byte[] imageData = new byte[imageBytes];
            stream.ReadExactly(imageData);

            ushort dbp = (ushort)((bitbltbuf >> 32) & 0x3FFF);
            byte dbw = (byte)((bitbltbuf >> 48) & 0x3F);
            GsPixelStorageFormat dpsm = (GsPixelStorageFormat)((bitbltbuf >> 56) & 0x3F);
            int destinationX = (int)((trxpos >> 32) & 0x7FF);
            int destinationY = (int)((trxpos >> 48) & 0x7FF);
            int width = (int)(trxreg & 0xFFF);
            int height = (int)((trxreg >> 32) & 0xFFF);

            return new FieldTextureUpload(packetIndex, dbp, dbw, dpsm, destinationX, destinationY, width, height, imageData);
        }
        finally
        {
            stream.Position = original;
        }
    }
}
