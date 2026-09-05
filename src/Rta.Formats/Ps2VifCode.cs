namespace Rta.Formats;

public readonly record struct Ps2VifCode(ushort Immediate, byte Count, byte Command, bool Interrupt)
{
    public static Ps2VifCode Decode(uint value) => new(
        Immediate: (ushort)(value & 0xFFFF),
        Count: (byte)((value >> 16) & 0xFF),
        Command: (byte)((value >> 24) & 0x7F),
        Interrupt: (value & 0x8000_0000u) != 0);
}
