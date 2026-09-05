#!/usr/bin/env python3
"""Print a compact MIPS/R5900 disassembly of an extracted executable range.

Usage:
  python3 mips_probe.py INPUT.bin BASE_ADDRESS [--offset N] [--length N]

This intentionally covers the ordinary integer/control-flow and scalar COP1
instructions used by the recovered gameplay dispatchers. Unknown R5900/MMI/COP
instructions remain visible as raw words instead of being guessed.
"""

from __future__ import annotations

import argparse
import struct
from pathlib import Path


REGISTERS = (
    "zero", "at", "v0", "v1", "a0", "a1", "a2", "a3",
    "t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7",
    "s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7",
    "t8", "t9", "k0", "k1", "gp", "sp", "fp", "ra",
)


def signed16(value: int) -> int:
    return value - 0x10000 if value & 0x8000 else value


def integer(value: str) -> int:
    try:
        return int(value, 0)
    except ValueError as error:
        raise argparse.ArgumentTypeError("expected a decimal or 0x-prefixed integer") from error


def disassemble(word: int, address: int) -> str:
    op = word >> 26
    rs = (word >> 21) & 31
    rt = (word >> 16) & 31
    rd = (word >> 11) & 31
    shift = (word >> 6) & 31
    funct = word & 63
    immediate = word & 0xFFFF
    simmediate = signed16(immediate)
    target = ((address + 4) & 0xF0000000) | ((word & 0x03FFFFFF) << 2)
    branch = address + 4 + (simmediate << 2)
    r = REGISTERS

    if word == 0:
        return "nop"
    if op == 0:
        if funct in (0x00, 0x02, 0x03, 0x38, 0x3A, 0x3B):
            names = {0x00: "sll", 0x02: "srl", 0x03: "sra", 0x38: "dsll", 0x3A: "dsrl", 0x3B: "dsra"}
            return f"{names[funct]} {r[rd]}, {r[rt]}, {shift}"
        if funct == 0x08:
            return f"jr {r[rs]}"
        if funct == 0x09:
            return f"jalr {r[rd]}, {r[rs]}"
        if funct in (0x10, 0x12):
            return f"{'mfhi' if funct == 0x10 else 'mflo'} {r[rd]}"
        if funct in (0x11, 0x13):
            return f"{'mthi' if funct == 0x11 else 'mtlo'} {r[rs]}"
        if funct in (0x18, 0x19, 0x1A, 0x1B):
            names = {0x18: "mult", 0x19: "multu", 0x1A: "div", 0x1B: "divu"}
            if funct in (0x18, 0x19) and rd != 0:
                return f"{names[funct]} {r[rd]}, {r[rs]}, {r[rt]}"
            return f"{names[funct]} {r[rs]}, {r[rt]}"
        if funct in (0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x2A, 0x2B, 0x2C, 0x2D, 0x2E, 0x2F):
            names = {
                0x20: "add", 0x21: "addu", 0x22: "sub", 0x23: "subu",
                0x24: "and", 0x25: "or", 0x26: "xor", 0x27: "nor",
                0x2A: "slt", 0x2B: "sltu", 0x2C: "dadd", 0x2D: "daddu",
                0x2E: "dsub", 0x2F: "dsubu",
            }
            if funct == 0x21 and rt == 0:
                return f"move {r[rd]}, {r[rs]}"
            if funct == 0x2D and rt == 0:
                return f"move {r[rd]}, {r[rs]}"
            return f"{names[funct]} {r[rd]}, {r[rs]}, {r[rt]}"
    if op == 1:
        names = {0: "bltz", 1: "bgez", 16: "bltzal", 17: "bgezal"}
        if rt in names:
            return f"{names[rt]} {r[rs]}, 0x{branch:08x}"
    if op == 0x11:
        if rs in (0, 2, 4, 6):
            names = {0: "mfc1", 2: "cfc1", 4: "mtc1", 6: "ctc1"}
            return f"{names[rs]} {r[rt]}, f{rd}"
        if rs == 8 and rt in (0, 1, 2, 3):
            names = {0: "bc1f", 1: "bc1t", 2: "bc1fl", 3: "bc1tl"}
            return f"{names[rt]} 0x{branch:08x}"
        if rs in (16, 17, 20, 21):
            formats = {16: "s", 17: "d", 20: "w", 21: "l"}
            ft = rt
            fs = rd
            fd = shift
            fmt = formats[rs]
            arithmetic = {
                0x00: "add", 0x01: "sub", 0x02: "mul", 0x03: "div",
                0x04: "sqrt", 0x05: "abs", 0x06: "mov", 0x07: "neg",
            }
            conversions = {
                0x20: "cvt.s", 0x21: "cvt.d", 0x24: "cvt.w", 0x25: "cvt.l",
            }
            comparisons = {
                0x30: "c.f", 0x31: "c.un", 0x32: "c.eq", 0x33: "c.ueq",
                0x34: "c.olt", 0x35: "c.ult", 0x36: "c.ole", 0x37: "c.ule",
                0x38: "c.sf", 0x39: "c.ngle", 0x3a: "c.seq", 0x3b: "c.ngl",
                0x3c: "c.lt", 0x3d: "c.nge", 0x3e: "c.le", 0x3f: "c.ngt",
            }
            if funct in arithmetic:
                name = f"{arithmetic[funct]}.{fmt}"
                if funct in (0x04, 0x05, 0x06, 0x07):
                    return f"{name} f{fd}, f{fs}"
                return f"{name} f{fd}, f{fs}, f{ft}"
            if funct in conversions:
                return f"{conversions[funct]}.{fmt} f{fd}, f{fs}"
            if funct in comparisons:
                return f"{comparisons[funct]}.{fmt} f{fs}, f{ft}"
    if op == 0x1C and funct in (0x18, 0x19):
        return f"{'mult1' if funct == 0x18 else 'multu1'} {r[rd]}, {r[rs]}, {r[rt]}"
    if op in (2, 3):
        return f"{'j' if op == 2 else 'jal'} 0x{target:08x}"
    if op in (4, 5):
        name = "beq" if op == 4 else "bne"
        if op == 4 and rt == 0:
            return f"beqz {r[rs]}, 0x{branch:08x}"
        if op == 5 and rt == 0:
            return f"bnez {r[rs]}, 0x{branch:08x}"
        return f"{name} {r[rs]}, {r[rt]}, 0x{branch:08x}"
    if op in (20, 21):
        name = "beql" if op == 20 else "bnel"
        if rt == 0:
            return f"{name[:-1]}zl {r[rs]}, 0x{branch:08x}"
        return f"{name} {r[rs]}, {r[rt]}, 0x{branch:08x}"
    if op in (22, 23):
        return f"{'blezl' if op == 22 else 'bgtzl'} {r[rs]}, 0x{branch:08x}"
    if op in (6, 7):
        return f"{'blez' if op == 6 else 'bgtz'} {r[rs]}, 0x{branch:08x}"
    if op in (8, 9, 10, 11, 24, 25):
        names = {8: "addi", 9: "addiu", 10: "slti", 11: "sltiu", 24: "daddi", 25: "daddiu"}
        return f"{names[op]} {r[rt]}, {r[rs]}, {simmediate}"
    if op in (12, 13, 14):
        names = {12: "andi", 13: "ori", 14: "xori"}
        return f"{names[op]} {r[rt]}, {r[rs]}, 0x{immediate:04x}"
    if op == 15:
        return f"lui {r[rt]}, 0x{immediate:04x}"
    if op in (32, 33, 34, 35, 36, 37, 38, 39, 49, 53, 55, 57, 61, 63):
        names = {
            32: "lb", 33: "lh", 34: "lwl", 35: "lw", 36: "lbu", 37: "lhu",
            38: "lwr", 39: "lwu", 49: "lwc1", 53: "ldc1", 55: "ld",
            57: "swc1", 61: "sdc1", 63: "sd",
        }
        return f"{names[op]} {r[rt]}, {simmediate}({r[rs]})"
    if op in (40, 41, 42, 43, 46, 47, 62):
        names = {40: "sb", 41: "sh", 42: "swl", 43: "sw", 46: "swr", 47: "cache", 62: "sq"}
        return f"{names[op]} {r[rt]}, {simmediate}({r[rs]})"
    return f".word 0x{word:08x}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("base_address", type=integer)
    parser.add_argument("--offset", type=integer, default=0)
    parser.add_argument("--length", type=integer)
    args = parser.parse_args()

    data = args.input.read_bytes()
    start = args.offset
    end = len(data) if args.length is None else min(len(data), start + args.length)
    if start < 0 or end < start or start % 4 or end % 4:
        raise SystemExit("offset and selected length must describe an aligned word range")
    for offset in range(start, end, 4):
        word = struct.unpack_from("<I", data, offset)[0]
        address = args.base_address + offset
        print(f"{address:08x}: {word:08x}  {disassemble(word, address)}")


if __name__ == "__main__":
    main()
