namespace Rta.Tools;

/// <summary>Diagnostic decoder for the VU1 microinstruction forms used by HG2.</summary>
internal static class VuMicroDisassembler
{
    private static readonly string?[] UpperOps =
    [
        "ADDx", "ADDy", "ADDz", "ADDw", "SUBx", "SUBy", "SUBz", "SUBw",
        "MADDx", "MADDy", "MADDz", "MADDw", "MSUBx", "MSUBy", "MSUBz", "MSUBw",
        "MAXx", "MAXy", "MAXz", "MAXw", "MINIx", "MINIy", "MINIz", "MINIw",
        "MULx", "MULy", "MULz", "MULw", "MULq", "MAXi", "MULi", "MINIi",
        "ADDq", "MADDq", "ADDi", "MADDi", "SUBq", "MSUBq", "SUBi", "MSUBi",
        "ADD", "MADD", "MUL", "MAX", "SUB", "MSUB", "OPMSUB", "MINI",
        null, null, null, null, null, null, null, null, null, null, null, null,
        "FD00", "FD01", "FD10", "FD11"
    ];

    private static readonly string?[][] UpperFdOps =
    [
        ["ADDAx", "SUBx", "MADDAx", "MSUBAx", "ITOF0", "FTOI0", "MULAx", "MULAq", "ADDAq", "SUBAq", "ADDA", "SUBA"],
        ["ADDAy", "SUBy", "MADDAy", "MSUBAy", "ITOF4", "FTOI4", "MULAy", "ABS", "MADDAq", "MSUBAq", "MADDA", "MSUBA"],
        ["ADDAz", "SUBz", "MADDAz", "MSUBAz", "ITOF12", "FTOI12", "MULAz", "MULAi", "ADDAi", "SUBAi", "MULA", "OPMULA"],
        ["ADDAw", "SUBw", "MADDAw", "MSUBAw", "ITOF15", "FTOI15", "MULAw", "CLIP", "MADDAi", "MSUBAi", null, "NOP"]
    ];

    public static string DisassemblePair(int instruction, uint lower, uint upper)
    {
        string flags = string.Concat(
            (upper & 0x80000000) != 0 ? "I" : string.Empty,
            (upper & 0x40000000) != 0 ? "E" : string.Empty,
            (upper & 0x20000000) != 0 ? "M" : string.Empty,
            (upper & 0x10000000) != 0 ? "D" : string.Empty,
            (upper & 0x08000000) != 0 ? "T" : string.Empty);
        string upperText = DisassembleUpper(upper);
        string lowerText = (upper & 0x80000000) != 0
            ? $"I = {BitConverter.Int32BitsToSingle(unchecked((int)lower)):G9}"
            : DisassembleLower(instruction, lower);
        return $"{(flags.Length == 0 ? string.Empty : "[" + flags + "] ")}{upperText,-34} | {lowerText}";
    }

    private static string DisassembleUpper(uint code)
    {
        int opcode = (int)(code & 63);
        int ft = (int)((code >> 16) & 31);
        int fs = (int)((code >> 11) & 31);
        int fd = (int)((code >> 6) & 31);
        string mask = Mask(code);
        string? op = UpperOps[opcode];
        if (opcode >= 0x3C)
        {
            int table = opcode - 0x3C;
            op = fd < UpperFdOps[table].Length ? UpperFdOps[table][fd] : null;
        }
        if (op is null)
            return $".upper 0x{code:X8}";
        if (op == "NOP")
            return "NOP";

        string decorated = op + mask;
        if (op is "ITOF0" or "ITOF4" or "ITOF12" or "ITOF15" or "FTOI0" or "FTOI4" or "FTOI12" or "FTOI15" or "ABS")
            return $"{decorated,-12} vf{ft}, vf{fs}";
        if (op == "CLIP")
            return $"CLIPw.xyz    vf{fs}, vf{ft}w";
        if (op.StartsWith("ADDA", StringComparison.Ordinal) || op.StartsWith("SUBA", StringComparison.Ordinal) || op.StartsWith("MULA", StringComparison.Ordinal) || op.StartsWith("MADDA", StringComparison.Ordinal) || op.StartsWith("MSUBA", StringComparison.Ordinal) || op == "OPMULA")
            return $"{decorated,-12} ACC, vf{fs}, {Source(op, ft)}";
        if (op is "MADD" or "MADDx" or "MADDy" or "MADDz" or "MADDw" or "MADDq" or "MADDi" or "MSUB" or "MSUBx" or "MSUBy" or "MSUBz" or "MSUBw" or "MSUBq" or "MSUBi" or "OPMSUB")
            return $"{decorated,-12} vf{fd}, ACC, vf{fs}, {Source(op, ft)}";
        return $"{decorated,-12} vf{fd}, vf{fs}, {Source(op, ft)}";
    }

    private static string Source(string op, int ft)
    {
        if (op.EndsWith('x')) return $"vf{ft}x";
        if (op.EndsWith('y')) return $"vf{ft}y";
        if (op.EndsWith('z')) return $"vf{ft}z";
        if (op.EndsWith('w')) return $"vf{ft}w";
        if (op.EndsWith('q')) return "Q";
        if (op.EndsWith('i')) return "I";
        return $"vf{ft}";
    }

    private static string DisassembleLower(int instruction, uint code)
    {
        int primary = (int)(code >> 25);
        int ft = (int)((code >> 16) & 31);
        int fs = (int)((code >> 11) & 31);
        int fd = (int)((code >> 6) & 31);
        int it = ft & 15;
        int @is = fs & 15;
        int id = fd & 15;
        int imm11 = SignExtend((int)(code & 0x7FF), 11);
        return primary switch
        {
            0x00 => $"LQ{Mask(code),-5} vf{ft}, {imm11}(vi{@is})",
            0x01 => $"SQ{Mask(code),-5} vf{fs}, {imm11}(vi{it})",
            0x04 => $"ILW{Mask(code),-4} vi{it}, {imm11}(vi{@is})",
            0x05 => $"ISW{Mask(code),-4} vi{it}, {imm11}(vi{@is})",
            0x08 => $"IADDIU     vi{it}, vi{@is}, {Immediate15(code)}",
            0x09 => $"ISUBIU     vi{it}, vi{@is}, {Immediate15(code)}",
            0x20 => $"B          {BranchTarget(instruction, imm11):X4}",
            0x21 => $"BAL        vi{it}, {BranchTarget(instruction, imm11):X4}",
            0x24 => $"JR         vi{@is}",
            0x25 => $"JALR       vi{it}, vi{@is}",
            0x28 => $"IBEQ       vi{it}, vi{@is}, {BranchTarget(instruction, imm11):X4}",
            0x29 => $"IBNE       vi{it}, vi{@is}, {BranchTarget(instruction, imm11):X4}",
            0x2C => $"IBLTZ      vi{@is}, {BranchTarget(instruction, imm11):X4}",
            0x2D => $"IBGTZ      vi{@is}, {BranchTarget(instruction, imm11):X4}",
            0x2E => $"IBLEZ      vi{@is}, {BranchTarget(instruction, imm11):X4}",
            0x2F => $"IBGEZ      vi{@is}, {BranchTarget(instruction, imm11):X4}",
            0x40 => DisassembleLowerOp(code, ft, fs, fd, it, @is, id),
            _ => $".lower 0x{code:X8}"
        };
    }

    private static string DisassembleLowerOp(uint code, int ft, int fs, int fd, int it, int @is, int id)
    {
        int opcode = (int)(code & 63);
        if (opcode == 0x30) return $"IADD       vi{id}, vi{@is}, vi{it}";
        if (opcode == 0x31) return $"ISUB       vi{id}, vi{@is}, vi{it}";
        if (opcode == 0x32) return $"IADDI      vi{it}, vi{@is}, {SignExtend(fd, 5)}";
        if (opcode == 0x34) return $"IAND       vi{id}, vi{@is}, vi{it}";
        if (opcode == 0x35) return $"IOR        vi{id}, vi{@is}, vi{it}";
        if (opcode < 0x3C)
            return $".lower 0x{code:X8}";

        int table = opcode - 0x3C;
        return (table, fd) switch
        {
            (0, 12) => $"MOVE{Mask(code),-5} vf{ft}, vf{fs}",
            (0, 13) => $"LQI{Mask(code),-6} vf{ft}, (vi{@is}++)",
            (0, 14) => $"DIV        vf{fs}{Component((int)((code >> 21) & 3))}, vf{ft}{Component((int)((code >> 23) & 3))}",
            (0, 15) => $"MTIR       vi{it}, vf{fs}{Component((int)((code >> 21) & 3))}",
            (0, 25) => $"MFP{Mask(code),-6} vf{ft}, P",
            (0, 26) => $"XTOP       vi{it}",
            (0, 27) => $"XGKICK     vi{@is}",
            (1, 12) => $"MR32{Mask(code),-5} vf{ft}, vf{fs}",
            (1, 13) => $"SQI{Mask(code),-6} vf{fs}, (vi{it}++)",
            (1, 14) => $"SQRT       vf{ft}{Component((int)((code >> 23) & 3))}",
            (1, 15) => $"MFIR{Mask(code),-5} vf{ft}, vi{@is}",
            (1, 26) => $"XITOP      vi{it}",
            (2, 13) => $"LQD{Mask(code),-6} vf{ft}, (--vi{@is})",
            (2, 14) => $"RSQRT      vf{fs}{Component((int)((code >> 21) & 3))}, vf{ft}{Component((int)((code >> 23) & 3))}",
            (2, 15) => $"ILWR{Mask(code),-5} vi{it}, (vi{@is})",
            (3, 13) => $"SQD{Mask(code),-6} vf{fs}, (--vi{it})",
            (3, 14) => "WAITQ",
            (3, 15) => $"ISWR{Mask(code),-5} vi{it}, (vi{@is})",
            (3, 27) => "WAITP",
            _ => $".lower 0x{code:X8}"
        };
    }

    private static string Mask(uint code)
    {
        Span<char> chars = stackalloc char[5];
        int length = 0;
        if ((code & (1u << 24)) != 0) chars[length++] = '.';
        if ((code & (1u << 24)) != 0) chars[length++] = 'x';
        if ((code & (1u << 23)) != 0) chars[length++] = 'y';
        if ((code & (1u << 22)) != 0) chars[length++] = 'z';
        if ((code & (1u << 21)) != 0) chars[length++] = 'w';
        return new string(chars[..length]);
    }

    private static string Component(int index) => index switch { 0 => "x", 1 => "y", 2 => "z", _ => "w" };
    private static int SignExtend(int value, int bits) => (value << (32 - bits)) >> (32 - bits);
    private static int Immediate15(uint code) => (int)(((code >> 10) & 0x7800) | (code & 0x7FF));
    private static int BranchTarget(int instruction, int offset) => instruction + 1 + offset;
}
