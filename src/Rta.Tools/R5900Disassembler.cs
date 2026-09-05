namespace Rta.Tools;

/// <summary>
/// Compact diagnostic disassembler for the R5900 instruction subset used by
/// HG2's renderer setup. Unknown instructions remain visible as raw words so
/// this tool never pretends to understand an opcode it has not decoded.
/// </summary>
internal static class R5900Disassembler
{
    private static readonly string[] Registers =
    [
        "zero", "at", "v0", "v1", "a0", "a1", "a2", "a3",
        "t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7",
        "s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7",
        "t8", "t9", "k0", "k1", "gp", "sp", "fp", "ra"
    ];

    public static string Disassemble(uint address, uint word)
    {
        if (word == 0)
            return "nop";

        int op = (int)(word >> 26);
        int rs = (int)((word >> 21) & 31);
        int rt = (int)((word >> 16) & 31);
        int rd = (int)((word >> 11) & 31);
        int sa = (int)((word >> 6) & 31);
        int fn = (int)(word & 63);
        short simm = unchecked((short)word);
        ushort imm = unchecked((ushort)word);

        return op switch
        {
            0x00 => Special(word, rs, rt, rd, sa, fn),
            0x01 => RegImm(address, rs, rt, simm),
            0x02 => $"j       {JumpTarget(address, word):X8}",
            0x03 => $"jal     {JumpTarget(address, word):X8}",
            0x04 => Branch("beq", address, rs, rt, simm),
            0x05 => Branch("bne", address, rs, rt, simm),
            0x06 => BranchOne("blez", address, rs, simm),
            0x07 => BranchOne("bgtz", address, rs, simm),
            0x08 => I("addi", rt, rs, simm),
            0x09 => I("addiu", rt, rs, simm),
            0x0A => I("slti", rt, rs, simm),
            0x0B => I("sltiu", rt, rs, simm),
            0x0C => $"andi    {R(rt)}, {R(rs)}, 0x{imm:X4}",
            0x0D => $"ori     {R(rt)}, {R(rs)}, 0x{imm:X4}",
            0x0E => $"xori    {R(rt)}, {R(rs)}, 0x{imm:X4}",
            0x0F => $"lui     {R(rt)}, 0x{imm:X4}",
            0x10 => Cop0(word, rs, rt, rd),
            0x11 => Cop1(address, word, rs, rt, rd, simm),
            0x14 => Branch("beql", address, rs, rt, simm),
            0x15 => Branch("bnel", address, rs, rt, simm),
            0x16 => BranchOne("blezl", address, rs, simm),
            0x17 => BranchOne("bgtzl", address, rs, simm),
            0x18 => I("daddi", rt, rs, simm),
            0x19 => I("daddiu", rt, rs, simm),
            0x1A => LoadStore("ldl", rt, rs, simm),
            0x1B => LoadStore("ldr", rt, rs, simm),
            0x1C => Mmi(word, rs, rt, rd, sa, fn),
            0x1E => LoadStore("lq", rt, rs, simm),
            0x1F => LoadStore("sq", rt, rs, simm),
            0x20 => LoadStore("lb", rt, rs, simm),
            0x21 => LoadStore("lh", rt, rs, simm),
            0x22 => LoadStore("lwl", rt, rs, simm),
            0x23 => LoadStore("lw", rt, rs, simm),
            0x24 => LoadStore("lbu", rt, rs, simm),
            0x25 => LoadStore("lhu", rt, rs, simm),
            0x26 => LoadStore("lwr", rt, rs, simm),
            0x27 => LoadStore("lwu", rt, rs, simm),
            0x28 => LoadStore("sb", rt, rs, simm),
            0x29 => LoadStore("sh", rt, rs, simm),
            0x2A => LoadStore("swl", rt, rs, simm),
            0x2B => LoadStore("sw", rt, rs, simm),
            0x2C => LoadStore("sdl", rt, rs, simm),
            0x2D => LoadStore("sdr", rt, rs, simm),
            0x2E => LoadStore("swr", rt, rs, simm),
            0x2F => LoadStore("cache", rt, rs, simm),
            0x31 => LoadStoreFloat("lwc1", rt, rs, simm),
            0x33 => LoadStore("pref", rt, rs, simm),
            0x37 => LoadStore("ld", rt, rs, simm),
            0x39 => LoadStoreFloat("swc1", rt, rs, simm),
            0x3F => LoadStore("sd", rt, rs, simm),
            _ => $".word   0x{word:X8}"
        };
    }

    private static string Special(uint word, int rs, int rt, int rd, int sa, int fn) => fn switch
    {
        0x00 => $"sll     {R(rd)}, {R(rt)}, {sa}",
        0x02 => $"srl     {R(rd)}, {R(rt)}, {sa}",
        0x03 => $"sra     {R(rd)}, {R(rt)}, {sa}",
        0x04 => Three("sllv", rd, rt, rs),
        0x06 => Three("srlv", rd, rt, rs),
        0x07 => Three("srav", rd, rt, rs),
        0x08 => $"jr      {R(rs)}",
        0x09 => $"jalr    {R(rd)}, {R(rs)}",
        0x0A => Three("movz", rd, rs, rt),
        0x0B => Three("movn", rd, rs, rt),
        0x0C => "syscall",
        0x0D => "break",
        0x0F => "sync",
        0x10 => $"mfhi    {R(rd)}",
        0x11 => $"mthi    {R(rs)}",
        0x12 => $"mflo    {R(rd)}",
        0x13 => $"mtlo    {R(rs)}",
        0x18 => Two("mult", rs, rt),
        0x19 => Two("multu", rs, rt),
        0x1A => Two("div", rs, rt),
        0x1B => Two("divu", rs, rt),
        0x20 => Three("add", rd, rs, rt),
        0x21 => Three("addu", rd, rs, rt),
        0x22 => Three("sub", rd, rs, rt),
        0x23 => Three("subu", rd, rs, rt),
        0x24 => Three("and", rd, rs, rt),
        0x25 => Three("or", rd, rs, rt),
        0x26 => Three("xor", rd, rs, rt),
        0x27 => Three("nor", rd, rs, rt),
        0x2A => Three("slt", rd, rs, rt),
        0x2B => Three("sltu", rd, rs, rt),
        0x2D => Three("daddu", rd, rs, rt),
        0x2F => Three("dsubu", rd, rs, rt),
        0x38 => $"dsll    {R(rd)}, {R(rt)}, {sa}",
        0x3A => $"dsrl    {R(rd)}, {R(rt)}, {sa}",
        0x3B => $"dsra    {R(rd)}, {R(rt)}, {sa}",
        0x3C => $"dsll32  {R(rd)}, {R(rt)}, {sa}",
        0x3E => $"dsrl32  {R(rd)}, {R(rt)}, {sa}",
        0x3F => $"dsra32  {R(rd)}, {R(rt)}, {sa}",
        _ => $".word   0x{word:X8}"
    };

    private static string RegImm(uint address, int rs, int rt, short imm) => rt switch
    {
        0x00 => BranchOne("bltz", address, rs, imm),
        0x01 => BranchOne("bgez", address, rs, imm),
        0x02 => BranchOne("bltzl", address, rs, imm),
        0x03 => BranchOne("bgezl", address, rs, imm),
        0x10 => BranchOne("bltzal", address, rs, imm),
        0x11 => BranchOne("bgezal", address, rs, imm),
        _ => $".word   0x{((uint)0x01 << 26 | (uint)rs << 21 | (uint)rt << 16 | (ushort)imm):X8}"
    };

    private static string Cop0(uint word, int rs, int rt, int rd) => rs switch
    {
        0x00 => $"mfc0    {R(rt)}, c{rd}",
        0x04 => $"mtc0    {R(rt)}, c{rd}",
        _ => $".word   0x{word:X8}"
    };

    private static string Cop1(uint address, uint word, int rs, int rt, int rd, short imm)
    {
        if (rs == 0x00) return $"mfc1    {R(rt)}, f{rd}";
        if (rs == 0x02) return $"cfc1    {R(rt)}, f{rd}";
        if (rs == 0x04) return $"mtc1    {R(rt)}, f{rd}";
        if (rs == 0x06) return $"ctc1    {R(rt)}, f{rd}";
        if (rs == 0x08)
        {
            string op = rt switch { 0 => "bc1f", 1 => "bc1t", 2 => "bc1fl", 3 => "bc1tl", _ => "bc1?" };
            return $"{op,-8}{BranchTarget(address, imm):X8}";
        }

        int ft = rt;
        int fs = rd;
        int fd = (int)((word >> 6) & 31);
        int fn = (int)(word & 63);
        string suffix = rs switch { 0x10 => ".s", 0x14 => ".w", _ => string.Empty };
        return fn switch
        {
            0x00 => FloatThree("add" + suffix, fd, fs, ft),
            0x01 => FloatThree("sub" + suffix, fd, fs, ft),
            0x02 => FloatThree("mul" + suffix, fd, fs, ft),
            0x03 => FloatThree("div" + suffix, fd, fs, ft),
            0x04 => FloatTwo("sqrt" + suffix, fd, fs),
            0x05 => FloatTwo("abs" + suffix, fd, fs),
            0x06 => FloatTwo("mov" + suffix, fd, fs),
            0x07 => FloatTwo("neg" + suffix, fd, fs),
            0x16 => FloatTwo("rsqrt" + suffix, fd, fs),
            0x18 => FloatThree("adda" + suffix, fd, fs, ft),
            0x1C => FloatThree("madd" + suffix, fd, fs, ft),
            0x24 => FloatTwo("cvt.w" + suffix, fd, fs),
            0x20 => FloatTwo("cvt.s" + suffix, fd, fs),
            0x28 => FloatThree("max" + suffix, fd, fs, ft),
            0x29 => FloatThree("min" + suffix, fd, fs, ft),
            0x32 => $"c.eq{suffix,-5} f{fs}, f{ft}",
            0x3C => $"c.lt{suffix,-5} f{fs}, f{ft}",
            0x3E => $"c.le{suffix,-5} f{fs}, f{ft}",
            _ => $".word   0x{word:X8}"
        };
    }

    private static string Mmi(uint word, int rs, int rt, int rd, int sa, int fn) => fn switch
    {
        0x00 => Three("madd", rd, rs, rt),
        0x01 => Three("maddu", rd, rs, rt),
        0x04 when sa == 0x00 => Three("paddw", rd, rs, rt),
        0x04 when sa == 0x08 => Three("psubw", rd, rs, rt),
        0x09 => Two("mult1", rs, rt),
        0x11 => Two("div1", rs, rt),
        0x28 when sa == 0x0E => Three("pcpyld", rd, rs, rt),
        0x28 when sa == 0x12 => Three("pcpyud", rd, rs, rt),
        _ => $".word   0x{word:X8}"
    };

    private static string R(int index) => Registers[index];
    private static string Three(string op, int d, int s, int t) => $"{op,-8}{R(d)}, {R(s)}, {R(t)}";
    private static string Two(string op, int s, int t) => $"{op,-8}{R(s)}, {R(t)}";
    private static string I(string op, int t, int s, short imm) => $"{op,-8}{R(t)}, {R(s)}, {imm}";
    private static string LoadStore(string op, int t, int s, short imm) => $"{op,-8}{R(t)}, {imm}({R(s)})";
    private static string LoadStoreFloat(string op, int t, int s, short imm) => $"{op,-8}f{t}, {imm}({R(s)})";
    private static string FloatThree(string op, int d, int s, int t) => $"{op,-8}f{d}, f{s}, f{t}";
    private static string FloatTwo(string op, int d, int s) => $"{op,-8}f{d}, f{s}";
    private static string Branch(string op, uint address, int s, int t, short imm) => $"{op,-8}{R(s)}, {R(t)}, {BranchTarget(address, imm):X8}";
    private static string BranchOne(string op, uint address, int s, short imm) => $"{op,-8}{R(s)}, {BranchTarget(address, imm):X8}";
    private static uint BranchTarget(uint address, short imm) => unchecked(address + 4u + (uint)(imm << 2));
    private static uint JumpTarget(uint address, uint word) => ((address + 4) & 0xF0000000u) | ((word & 0x03FFFFFFu) << 2);
}
