#!/usr/bin/env python3
"""Disassemble the bounded VU microinstruction subset used by RTA archaeology.

Each microinstruction is an 8-byte little-endian pair: lower word, then upper
word. The decoder is intentionally partial. Unknown forms stay visible as raw
.upper/.lower words instead of being guessed.
"""

from __future__ import annotations

import argparse
import struct
from pathlib import Path


UPPER_OPS = (
    "ADDx", "ADDy", "ADDz", "ADDw", "SUBx", "SUBy", "SUBz", "SUBw",
    "MADDx", "MADDy", "MADDz", "MADDw", "MSUBx", "MSUBy", "MSUBz", "MSUBw",
    "MAXx", "MAXy", "MAXz", "MAXw", "MINIx", "MINIy", "MINIz", "MINIw",
    "MULx", "MULy", "MULz", "MULw", "MULq", "MAXi", "MULi", "MINIi",
    "ADDq", "MADDq", "ADDi", "MADDi", "SUBq", "MSUBq", "SUBi", "MSUBi",
    "ADD", "MADD", "MUL", "MAX", "SUB", "MSUB", "OPMSUB", "MINI",
    None, None, None, None, None, None, None, None,
    None, None, None, None, "FD00", "FD01", "FD10", "FD11",
)
# The historical C# table spelled the four SUBA component forms SUBx/y/z/w.
# Here fd is the special-op selector, not a destination register, so retain the
# accumulator semantics consistently with ADDA/MADDA/MSUBA and the other SUBA
# forms instead of rendering the selector as vf1.
UPPER_FD_OPS = (
    ("ADDAx", "SUBAx", "MADDAx", "MSUBAx", "ITOF0", "FTOI0",
     "MULAx", "MULAq", "ADDAq", "SUBAq", "ADDA", "SUBA"),
    ("ADDAy", "SUBAy", "MADDAy", "MSUBAy", "ITOF4", "FTOI4",
     "MULAy", "ABS", "MADDAq", "MSUBAq", "MADDA", "MSUBA"),
    ("ADDAz", "SUBAz", "MADDAz", "MSUBAz", "ITOF12", "FTOI12",
     "MULAz", "MULAi", "ADDAi", "SUBAi", "MULA", "OPMULA"),
    ("ADDAw", "SUBAw", "MADDAw", "MSUBAw", "ITOF15", "FTOI15",
     "MULAw", "CLIP", "MADDAi", "MSUBAi", None, "NOP"),
)

CONVERSION_OPS = {
    "ITOF0", "ITOF4", "ITOF12", "ITOF15",
    "FTOI0", "FTOI4", "FTOI12", "FTOI15", "ABS",
}
ACCUMULATOR_OP_PREFIXES = ("ADDA", "SUBA", "MULA", "MADDA", "MSUBA")
ACCUMULATOR_SOURCE_OPS = {
    "MADD", "MADDx", "MADDy", "MADDz", "MADDw", "MADDq", "MADDi",
    "MSUB", "MSUBx", "MSUBy", "MSUBz", "MSUBw", "MSUBq", "MSUBi", "OPMSUB",
}


def integer(text: str) -> int:
    try:
        return int(text, 0)
    except ValueError as error:
        raise argparse.ArgumentTypeError(
            "expected a decimal or 0x-prefixed integer"
        ) from error


def mask(code: int) -> str:
    components = "".join(
        component
        for bit, component in ((24, "x"), (23, "y"), (22, "z"), (21, "w"))
        if code & (1 << bit)
    )
    return f".{components}" if components else ""


def component(index: int) -> str:
    return "xyzw"[index & 3]


def sign_extend(value: int, bits: int) -> int:
    sign = 1 << (bits - 1)
    return (value ^ sign) - sign


def immediate15(code: int) -> int:
    return ((code >> 10) & 0x7800) | (code & 0x7FF)


def branch_target(instruction: int, offset: int) -> int:
    return instruction + 1 + offset


def source(op: str, ft: int) -> str:
    if op.endswith(("x", "y", "z", "w")):
        return f"vf{ft}{op[-1]}"
    if op.endswith("q"):
        return "Q"
    if op.endswith("i"):
        return "I"
    return f"vf{ft}"
def disassemble_upper(code: int) -> str:
    code &= 0xFFFFFFFF
    opcode = code & 63
    ft = (code >> 16) & 31
    fs = (code >> 11) & 31
    fd = (code >> 6) & 31
    op = UPPER_OPS[opcode]
    if opcode >= 0x3C:
        table = UPPER_FD_OPS[opcode - 0x3C]
        op = table[fd] if fd < len(table) else None
    if op is None:
        return f".upper 0x{code:08X}"
    if op == "NOP":
        return "NOP"

    decorated = op + mask(code)
    if op in CONVERSION_OPS:
        return f"{decorated:<12} vf{ft}, vf{fs}"
    if op == "CLIP":
        return f"CLIPw.xyz    vf{fs}, vf{ft}w"
    if op.startswith(ACCUMULATOR_OP_PREFIXES) or op == "OPMULA":
        return f"{decorated:<12} ACC, vf{fs}, {source(op, ft)}"
    if op in ACCUMULATOR_SOURCE_OPS:
        return f"{decorated:<12} vf{fd}, ACC, vf{fs}, {source(op, ft)}"
    return f"{decorated:<12} vf{fd}, vf{fs}, {source(op, ft)}"


def disassemble_lower_op(code: int, ft: int, fs: int, fd: int) -> str:
    it = ft & 15
    is_ = fs & 15
    id_ = fd & 15
    opcode = code & 63
    if opcode == 0x30:
        return f"IADD       vi{id_}, vi{is_}, vi{it}"
    if opcode == 0x31:
        return f"ISUB       vi{id_}, vi{is_}, vi{it}"
    if opcode == 0x32:
        return f"IADDI      vi{it}, vi{is_}, {sign_extend(fd, 5)}"
    if opcode == 0x34:
        return f"IAND       vi{id_}, vi{is_}, vi{it}"
    if opcode == 0x35:
        return f"IOR        vi{id_}, vi{is_}, vi{it}"
    if opcode < 0x3C:
        return f".lower 0x{code:08X}"

    table = opcode - 0x3C
    special = {
        (0, 12): f"MOVE{mask(code):<5} vf{ft}, vf{fs}",
        (0, 13): f"LQI{mask(code):<6} vf{ft}, (vi{is_}++)",
        (0, 14): (
            f"DIV        vf{fs}{component((code >> 21) & 3)}, "
            f"vf{ft}{component((code >> 23) & 3)}"
        ),
        (0, 15): f"MTIR       vi{it}, vf{fs}{component((code >> 21) & 3)}",
        (0, 25): f"MFP{mask(code):<6} vf{ft}, P",
        (0, 26): f"XTOP       vi{it}",
        (0, 27): f"XGKICK     vi{is_}",
        (1, 12): f"MR32{mask(code):<5} vf{ft}, vf{fs}",
        (1, 13): f"SQI{mask(code):<6} vf{fs}, (vi{it}++)",
        (1, 14): f"SQRT       vf{ft}{component((code >> 23) & 3)}",
        (1, 15): f"MFIR{mask(code):<5} vf{ft}, vi{is_}",
        (1, 26): f"XITOP      vi{it}",
        (2, 13): f"LQD{mask(code):<6} vf{ft}, (--vi{is_})",
        (2, 14): (
            f"RSQRT      vf{fs}{component((code >> 21) & 3)}, "
            f"vf{ft}{component((code >> 23) & 3)}"
        ),
        (2, 15): f"ILWR{mask(code):<5} vi{it}, (vi{is_})",
        (3, 13): f"SQD{mask(code):<6} vf{fs}, (--vi{it})",
        (3, 14): "WAITQ",
        (3, 15): f"ISWR{mask(code):<5} vi{it}, (vi{is_})",
        (3, 27): "WAITP",
    }
    return special.get((table, fd), f".lower 0x{code:08X}")
def disassemble_lower(instruction: int, code: int) -> str:
    code &= 0xFFFFFFFF
    primary = code >> 25
    ft = (code >> 16) & 31
    fs = (code >> 11) & 31
    fd = (code >> 6) & 31
    it = ft & 15
    is_ = fs & 15
    imm11 = sign_extend(code & 0x7FF, 11)

    simple = {
        0x00: f"LQ{mask(code):<5} vf{ft}, {imm11}(vi{is_})",
        0x01: f"SQ{mask(code):<5} vf{fs}, {imm11}(vi{it})",
        0x04: f"ILW{mask(code):<4} vi{it}, {imm11}(vi{is_})",
        0x05: f"ISW{mask(code):<4} vi{it}, {imm11}(vi{is_})",
        0x08: f"IADDIU     vi{it}, vi{is_}, {immediate15(code)}",
        0x09: f"ISUBIU     vi{it}, vi{is_}, {immediate15(code)}",
        0x20: f"B          {branch_target(instruction, imm11):04X}",
        0x21: f"BAL        vi{it}, {branch_target(instruction, imm11):04X}",
        0x24: f"JR         vi{is_}",
        0x25: f"JALR       vi{it}, vi{is_}",
        0x28: f"IBEQ       vi{it}, vi{is_}, {branch_target(instruction, imm11):04X}",
        0x29: f"IBNE       vi{it}, vi{is_}, {branch_target(instruction, imm11):04X}",
        0x2C: f"IBLTZ      vi{is_}, {branch_target(instruction, imm11):04X}",
        0x2D: f"IBGTZ      vi{is_}, {branch_target(instruction, imm11):04X}",
        0x2E: f"IBLEZ      vi{is_}, {branch_target(instruction, imm11):04X}",
        0x2F: f"IBGEZ      vi{is_}, {branch_target(instruction, imm11):04X}",
    }
    if primary in simple:
        return simple[primary]
    if primary == 0x40:
        return disassemble_lower_op(code, ft, fs, fd)
    return f".lower 0x{code:08X}"


def float_immediate(word: int) -> str:
    value = struct.unpack("<f", struct.pack("<I", word & 0xFFFFFFFF))[0]
    return format(value, ".9g")
def disassemble_pair(instruction: int, lower: int, upper: int) -> str:
    flags = "".join(
        letter
        for bit, letter in ((31, "I"), (30, "E"), (29, "M"), (28, "D"), (27, "T"))
        if upper & (1 << bit)
    )
    upper_text = disassemble_upper(upper)
    lower_text = (
        f"I = {float_immediate(lower)}"
        if upper & 0x80000000
        else disassemble_lower(instruction, lower)
    )
    prefix = f"[{flags}] " if flags else ""
    return f"{prefix}{upper_text:<34} | {lower_text}"


def disassemble_memory(data: bytes, start: int, count: int | None) -> list[str]:
    if len(data) % 8:
        raise ValueError("micro memory length must be a multiple of 8 bytes")
    total = len(data) // 8
    if start < 0 or start > total:
        raise ValueError("start instruction lies outside micro memory")
    if count is None:
        count = total - start
    if count < 0 or start + count > total:
        raise ValueError("selected instruction range lies outside micro memory")

    lines: list[str] = []
    for instruction in range(start, start + count):
        lower, upper = struct.unpack_from("<II", data, instruction * 8)
        decoded = disassemble_pair(instruction, lower, upper)
        lines.append(f"{instruction:04X}: {lower:08X} {upper:08X}  {decoded}")
    return lines


def self_test() -> None:
    vectors = (
        ("upper NOP", disassemble_upper(0x000002FF), "NOP"),
        ("upper unknown", disassemble_upper(0x00000030), ".upper 0x00000030"),
        ("upper SUBAx", disassemble_upper(0x0000007C), "SUBAx        ACC, vf0, vf0x"),
        ("lower IADD", disassemble_lower(0x0012, 0x80021930), "IADD       vi4, vi3, vi2"),
        ("lower branch", disassemble_lower(0x0010, 0x400007FF), "B          0010"),
        ("lower unknown", disassemble_lower(0, 0x04000000), ".lower 0x04000000"),
    )
    for name, actual, expected in vectors:
        if actual != expected:
            raise AssertionError(f"{name}: expected {expected!r}, got {actual!r}")

    immediate = disassemble_pair(0, 0x3F800000, 0x800002FF)
    if not immediate.startswith("[I] NOP") or not immediate.endswith("| I = 1"):
        raise AssertionError(f"immediate pair: unexpected output {immediate!r}")

    packed = struct.pack("<IIII", 0x400007FF, 0x000002FF, 0, 0x00000030)
    lines = disassemble_memory(packed, 0, 2)
    if len(lines) != 2 or not lines[1].endswith("| LQ      vf0, 0(vi0)"):
        raise AssertionError(f"memory decode: unexpected output {lines!r}")
    print(f"self-test: {len(vectors) + 2} vectors passed")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Disassemble a partial, diagnostic subset of PS2 VU microinstructions."
    )
    parser.add_argument("input", nargs="?", type=Path, help="raw VU micro memory dump")
    parser.add_argument("--start", type=integer, default=0, help="first instruction index")
    parser.add_argument("--count", type=integer, help="number of instructions to decode")
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="run deterministic decoder vectors instead of reading a dump",
    )
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return
    if args.input is None:
        parser.error("INPUT is required unless --self-test is used")

    try:
        lines = disassemble_memory(args.input.read_bytes(), args.start, args.count)
    except ValueError as error:
        parser.error(str(error))
    for line in lines:
        print(line)


if __name__ == "__main__":
    main()
