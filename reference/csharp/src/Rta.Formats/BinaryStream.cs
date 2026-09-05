using System.Buffers.Binary;

namespace Rta.Formats;

internal static class BinaryStream
{
    public static uint ReadUInt32LittleEndian(Stream stream)
    {
        Span<byte> buffer = stackalloc byte[4];
        stream.ReadExactly(buffer);
        return BinaryPrimitives.ReadUInt32LittleEndian(buffer);
    }

    public static ulong ReadUInt64LittleEndian(Stream stream)
    {
        Span<byte> buffer = stackalloc byte[8];
        stream.ReadExactly(buffer);
        return BinaryPrimitives.ReadUInt64LittleEndian(buffer);
    }
}
