namespace Rta.Formats;

public readonly record struct Ps2GifTag(
    ushort LoopCount,
    bool EndOfPacket,
    bool PrimitiveEnabled,
    ushort Primitive,
    byte Format,
    byte RegisterCount,
    ulong Registers)
{
    public static Ps2GifTag Read(Stream stream)
    {
        ulong low = BinaryStream.ReadUInt64LittleEndian(stream);
        ulong high = BinaryStream.ReadUInt64LittleEndian(stream);
        return FromRawWords(low, high);
    }

    public static Ps2GifTag FromRawWords(ulong low, ulong high)
    {
        byte nreg = (byte)((low >> 60) & 0xF);
        return new Ps2GifTag(
            LoopCount: (ushort)(low & 0x7FFF),
            EndOfPacket: ((low >> 15) & 1) != 0,
            PrimitiveEnabled: ((low >> 46) & 1) != 0,
            Primitive: (ushort)((low >> 47) & 0x7FF),
            Format: (byte)((low >> 58) & 0x3),
            RegisterCount: nreg == 0 ? (byte)16 : nreg,
            Registers: high);
    }

    public byte GetRegisterDescriptor(int index)
    {
        if ((uint)index >= RegisterCount)
            throw new ArgumentOutOfRangeException(nameof(index));
        return (byte)((Registers >> (index * 4)) & 0xF);
    }
}
