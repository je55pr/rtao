namespace Rta.Formats;

public enum Ps2DmaTagId : byte
{
    Refe = 0,
    Cnt = 1,
    Next = 2,
    Ref = 3,
    Refs = 4,
    Call = 5,
    Ret = 6,
    End = 7
}

public readonly record struct Ps2DmaTag(
    ushort QuadwordCount,
    byte PriorityControl,
    Ps2DmaTagId Id,
    bool Interrupt,
    uint Address,
    bool Scratchpad,
    uint VifCode0,
    uint VifCode1)
{
    public static Ps2DmaTag Read(Stream stream)
    {
        ulong tag = BinaryStream.ReadUInt64LittleEndian(stream);
        uint vif0 = BinaryStream.ReadUInt32LittleEndian(stream);
        uint vif1 = BinaryStream.ReadUInt32LittleEndian(stream);

        return new Ps2DmaTag(
            QuadwordCount: (ushort)(tag & 0xFFFF),
            PriorityControl: (byte)((tag >> 26) & 0x3),
            Id: (Ps2DmaTagId)((tag >> 28) & 0x7),
            Interrupt: ((tag >> 31) & 1) != 0,
            Address: (uint)((tag >> 32) & 0x7FFF_FFFF),
            Scratchpad: ((tag >> 63) & 1) != 0,
            VifCode0: vif0,
            VifCode1: vif1);
    }

    public int InlinePayloadBytes => checked(QuadwordCount * 16);
}
