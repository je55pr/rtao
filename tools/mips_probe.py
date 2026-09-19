#!/usr/bin/env python3
"""Print a compact MIPS/R5900 disassembly of an extracted executable range.

Usage:
  python3 mips_probe.py INPUT.bin BASE_ADDRESS [--offset N] [--length N]

This intentionally covers the R5900/EE integer, control-flow, COP0/COP1 and
MMI forms that recur in renderer/gameplay archaeology. Unsupported encodings
remain visible as raw words instead of being guessed.
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


def raw_word(word: int) -> str:
    return f".word 0x{word:08x}"


def decode_cop0(word: int, rs: int, rt: int, rd: int, branch: int) -> str:
    if rs == 0x00:
        return f"mfc0 {REGISTERS[rt]}, c{rd}"
    if rs == 0x04:
        return f"mtc0 {REGISTERS[rt]}, c{rd}"
    if rs == 0x08 and rt in (0, 1, 2, 3):
        name = ("bc0f", "bc0t", "bc0fl", "bc0tl")[rt]
        return f"{name} 0x{branch:08x}"
    return raw_word(word)


def decode_cop1(word: int, rs: int, rt: int, rd: int, shift: int, funct: int, branch: int) -> str:
    if rs in (0x00, 0x02, 0x04, 0x06):
        names = {0x00: "mfc1", 0x02: "cfc1", 0x04: "mtc1", 0x06: "ctc1"}
        register = f"fcr{rd}" if rs in (0x02, 0x06) else f"f{rd}"
        return f"{names[rs]} {REGISTERS[rt]}, {register}"
    if rs == 0x08 and rt in (0, 1, 2, 3):
        name = ("bc1f", "bc1t", "bc1fl", "bc1tl")[rt]
        return f"{name} 0x{branch:08x}"

    ft = rt
    fs = rd
    fd = shift
    if rs == 0x10:
        binary = {
            0x00: "add.s", 0x01: "sub.s", 0x02: "mul.s", 0x03: "div.s",
            0x1C: "madd.s", 0x1D: "msub.s", 0x28: "max.s", 0x29: "min.s",
        }
        if funct in binary:
            return f"{binary[funct]} f{fd}, f{fs}, f{ft}"
        if funct == 0x04:
            return f"sqrt.s f{fd}, f{ft}"
        if funct in (0x05, 0x06, 0x07):
            name = {0x05: "abs.s", 0x06: "mov.s", 0x07: "neg.s"}[funct]
            return f"{name} f{fd}, f{fs}"
        if funct == 0x16:
            return f"rsqrt.s f{fd}, f{fs}, f{ft}"
        if funct in (0x18, 0x19, 0x1A, 0x1E, 0x1F):
            name = {0x18: "adda.s", 0x19: "suba.s", 0x1A: "mula.s", 0x1E: "madda.s", 0x1F: "msuba.s"}[funct]
            return f"{name} f{fs}, f{ft}"
        if funct == 0x24:
            return f"cvt.w.s f{fd}, f{fs}"
        if funct in (0x30, 0x32, 0x3C, 0x3E):
            name = {0x30: "c.f.s", 0x32: "c.eq.s", 0x3C: "c.lt.s", 0x3E: "c.le.s"}[funct]
            return f"{name} f{fs}, f{ft}"
    if rs == 0x14 and funct == 0x20:
        return f"cvt.s.w f{fd}, f{fs}"
    return raw_word(word)


def decode_mmi(word: int, rs: int, rt: int, rd: int, shift: int, funct: int) -> str:
    r = REGISTERS
    if funct in (0x00, 0x01, 0x20, 0x21):
        name = {0x00: "madd", 0x01: "maddu", 0x20: "madd1", 0x21: "maddu1"}[funct]
        return f"{name} {r[rd]}, {r[rs]}, {r[rt]}"
    if funct in (0x10, 0x12):
        return f"{'mfhi1' if funct == 0x10 else 'mflo1'} {r[rd]}"
    if funct in (0x11, 0x13):
        return f"{'mthi1' if funct == 0x11 else 'mtlo1'} {r[rs]}"
    if funct in (0x18, 0x19):
        return f"{'mult1' if funct == 0x18 else 'multu1'} {r[rd]}, {r[rs]}, {r[rt]}"
    if funct in (0x1A, 0x1B):
        return f"{'div1' if funct == 0x1A else 'divu1'} {r[rs]}, {r[rt]}"
    if funct == 0x08 and shift in (0x00, 0x01):
        return f"{'paddw' if shift == 0 else 'psubw'} {r[rd]}, {r[rs]}, {r[rt]}"
    if funct == 0x09 and shift == 0x0E:
        return f"pcpyld {r[rd]}, {r[rs]}, {r[rt]}"
    if funct == 0x29 and shift == 0x0E:
        return f"pcpyud {r[rd]}, {r[rs]}, {r[rt]}"
    return raw_word(word)


def disassemble(word: int, address: int) -> str:
    word &= 0xFFFFFFFF
    address &= 0xFFFFFFFF
    op = word >> 26
    rs = (word >> 21) & 31
    rt = (word >> 16) & 31
    rd = (word >> 11) & 31
    shift = (word >> 6) & 31
    funct = word & 63
    immediate = word & 0xFFFF
    simmediate = signed16(immediate)
    target = ((address + 4) & 0xF0000000) | ((word & 0x03FFFFFF) << 2)
    branch = (address + 4 + (simmediate << 2)) & 0xFFFFFFFF
    r = REGISTERS

    if word == 0:
        return "nop"
    if op == 0:
        shifts = {
            0x00: "sll", 0x02: "srl", 0x03: "sra",
            0x38: "dsll", 0x3A: "dsrl", 0x3B: "dsra",
            0x3C: "dsll32", 0x3E: "dsrl32", 0x3F: "dsra32",
        }
        if funct in shifts:
            return f"{shifts[funct]} {r[rd]}, {r[rt]}, {shift}"
        variable_shifts = {
            0x04: "sllv", 0x06: "srlv", 0x07: "srav",
            0x14: "dsllv", 0x16: "dsrlv", 0x17: "dsrav",
        }
        if funct in variable_shifts:
            return f"{variable_shifts[funct]} {r[rd]}, {r[rt]}, {r[rs]}"
        if funct == 0x08:
            return f"jr {r[rs]}"
        if funct == 0x09:
            return f"jalr {r[rd]}, {r[rs]}"
        if funct in (0x0A, 0x0B):
            return f"{'movz' if funct == 0x0A else 'movn'} {r[rd]}, {r[rs]}, {r[rt]}"
        if funct in (0x0C, 0x0D, 0x0F):
            return {0x0C: "syscall", 0x0D: "break", 0x0F: "sync"}[funct]
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
            if funct in (0x21, 0x2D) and rt == 0:
                return f"move {r[rd]}, {r[rs]}"
            return f"{names[funct]} {r[rd]}, {r[rs]}, {r[rt]}"
        return raw_word(word)

    if op == 0x01:
        names = {
            0x00: "bltz", 0x01: "bgez", 0x02: "bltzl", 0x03: "bgezl",
            0x10: "bltzal", 0x11: "bgezal", 0x12: "bltzall", 0x13: "bgezall",
        }
        if rt in names:
            return f"{names[rt]} {r[rs]}, 0x{branch:08x}"
        return raw_word(word)
    if op == 0x10:
        return decode_cop0(word, rs, rt, rd, branch)
    if op == 0x11:
        return decode_cop1(word, rs, rt, rd, shift, funct, branch)
    if op == 0x1C:
        return decode_mmi(word, rs, rt, rd, shift, funct)
    if op in (0x02, 0x03):
        return f"{'j' if op == 0x02 else 'jal'} 0x{target:08x}"
    if op in (0x04, 0x05):
        name = "beq" if op == 0x04 else "bne"
        if rt == 0:
            return f"{'beqz' if op == 0x04 else 'bnez'} {r[rs]}, 0x{branch:08x}"
        return f"{name} {r[rs]}, {r[rt]}, 0x{branch:08x}"
    if op in (0x14, 0x15):
        name = "beql" if op == 0x14 else "bnel"
        if rt == 0:
            return f"{'beqzl' if op == 0x14 else 'bnezl'} {r[rs]}, 0x{branch:08x}"
        return f"{name} {r[rs]}, {r[rt]}, 0x{branch:08x}"
    if op in (0x06, 0x07, 0x16, 0x17):
        names = {0x06: "blez", 0x07: "bgtz", 0x16: "blezl", 0x17: "bgtzl"}
        return f"{names[op]} {r[rs]}, 0x{branch:08x}"
    if op in (0x08, 0x09, 0x0A, 0x0B, 0x18, 0x19):
        names = {
            0x08: "addi", 0x09: "addiu", 0x0A: "slti",
            0x0B: "sltiu", 0x18: "daddi", 0x19: "daddiu",
        }
        return f"{names[op]} {r[rt]}, {r[rs]}, {simmediate}"
    if op in (0x0C, 0x0D, 0x0E):
        names = {0x0C: "andi", 0x0D: "ori", 0x0E: "xori"}
        return f"{names[op]} {r[rt]}, {r[rs]}, 0x{immediate:04x}"
    if op == 0x0F:
        return f"lui {r[rt]}, 0x{immediate:04x}"

    gpr_load_store = {
        0x1A: "ldl", 0x1B: "ldr", 0x1E: "lq", 0x1F: "sq",
        0x20: "lb", 0x21: "lh", 0x22: "lwl", 0x23: "lw",
        0x24: "lbu", 0x25: "lhu", 0x26: "lwr", 0x27: "lwu",
        0x28: "sb", 0x29: "sh", 0x2A: "swl", 0x2B: "sw",
        0x2C: "sdl", 0x2D: "sdr", 0x2E: "swr", 0x37: "ld", 0x3F: "sd",
    }
    if op in gpr_load_store:
        return f"{gpr_load_store[op]} {r[rt]}, {simmediate}({r[rs]})"
    if op in (0x31, 0x39):
        return f"{'lwc1' if op == 0x31 else 'swc1'} f{rt}, {simmediate}({r[rs]})"
    if op == 0x2F:
        return f"cache {rt}, {simmediate}({r[rs]})"
    if op == 0x33:
        return f"pref {rt}, {simmediate}({r[rs]})"
    return raw_word(word)


def self_test() -> None:
    vectors = (
        ("dsll32", 0x0009413C, 0, "dsll32 t0, t1, 4"),
        ("dsrav", 0x01494017, 0, "dsrav t0, t1, t2"),
        ("REGIMM likely", 0x06020002, 0x1000, "bltzl s0, 0x0000100c"),
        ("REGIMM link likely", 0x0613FFFF, 0x1000, "bgezall s0, 0x00001000"),
        ("COP0 move", 0x40086000, 0, "mfc0 t0, c12"),
        ("COP1 likely", 0x4503FFFE, 0x1000, "bc1tl 0x00000ffc"),
        ("COP1 rsqrt", 0x46062916, 0, "rsqrt.s f4, f5, f6"),
        ("COP1 accumulator", 0x46062818, 0, "adda.s f5, f6"),
        ("COP1 multiply-accumulate", 0x4606281E, 0, "madda.s f5, f6"),
        ("COP1 max", 0x46062928, 0, "max.s f4, f5, f6"),
        ("COP1 min", 0x46062929, 0, "min.s f4, f5, f6"),
        ("COP1 word conversion", 0x46802920, 0, "cvt.s.w f4, f5"),
        ("MMI mult1 witness", 0x70701018, 0, "mult1 v0, v1, s0"),
        ("MMI paddw", 0x70641008, 0, "paddw v0, v1, a0"),
        ("MMI psubw", 0x70641048, 0, "psubw v0, v1, a0"),
        ("MMI pcpyld", 0x70641389, 0, "pcpyld v0, v1, a0"),
        ("MMI pcpyud", 0x706413A9, 0, "pcpyud v0, v1, a0"),
        ("MMI div1", 0x7064001A, 0, "div1 v1, a0"),
        ("MMI mthi1", 0x70641011, 0, "mthi1 v1"),
        ("unsupported MMI2", 0x70641009, 0, ".word 0x70641009"),
        ("LQ", 0x7BB1FFF0, 0, "lq s1, -16(sp)"),
        ("SQ", 0x7FB10020, 0, "sq s1, 32(sp)"),
        ("LWC1 register class", 0xC7A3000C, 0, "lwc1 f3, 12(sp)"),
        ("unsupported COP1 compare", 0x46062831, 0, ".word 0x46062831"),
        ("unsupported LDC1", 0xD7A30008, 0, ".word 0xd7a30008"),
        ("unsupported SQC2", 0xFBA30020, 0, ".word 0xfba30020"),
    )
    for name, word, address, expected in vectors:
        actual = disassemble(word, address)
        if actual != expected:
            raise AssertionError(f"{name}: expected {expected!r}, got {actual!r}")
    print(f"self-test: {len(vectors)} vectors passed")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", nargs="?", type=Path)
    parser.add_argument("base_address", nargs="?", type=integer)
    parser.add_argument("--offset", type=integer, default=0)
    parser.add_argument("--length", type=integer)
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="run deterministic decoder vectors instead of reading an executable",
    )
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return
    if args.input is None or args.base_address is None:
        parser.error("INPUT and BASE_ADDRESS are required unless --self-test is used")

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
