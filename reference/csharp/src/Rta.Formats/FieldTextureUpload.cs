namespace Rta.Formats;

/// <summary>
/// One HG2 host-to-local GS image transfer. DestinationBasePointer/BufferWidth/
/// PixelStorageFormat come from BITBLTBUF, DestinationX/Y from TRXPOS and Width/
/// Height from TRXREG. Data is the IMAGE payload in host transmission order.
/// </summary>
public sealed record FieldTextureUpload(
    int PacketIndex,
    ushort DestinationBasePointer,
    byte DestinationBufferWidth,
    GsPixelStorageFormat DestinationPixelStorageFormat,
    int DestinationX,
    int DestinationY,
    int Width,
    int Height,
    byte[] Data);
