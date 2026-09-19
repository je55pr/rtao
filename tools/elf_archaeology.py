#!/usr/bin/env python3
"""Copyright-safe ELF/R5900 archaeology scanners for local executable inputs.

The tool accepts either a complete little-endian ELF32 executable or a flat
virtual-address dump when --base-address is supplied. It deliberately reports
unknown GS register addresses as GS_XX rather than guessing semantics.
"""

from __future__ import annotations

import argparse
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
import struct

from mips_probe import REGISTERS, disassemble, signed16


@dataclass(frozen=True)
class Mapping:
    file_offset: int
    virtual_address: int
    file_size: int


class AddressSpace:
    def __init__(self, data: bytes, mappings: list[Mapping]) -> None:
        self.data = data
        self.mappings = tuple(mappings)
    @classmethod
    def from_input(cls, data: bytes, base_address: int | None = None) -> "AddressSpace":
        if base_address is not None:
            return cls(data, [Mapping(0, base_address, len(data))])
        if len(data) < 0x34 or data[:4] != b"\x7fELF":
            raise ValueError("expected an ELF32 image, or pass --base-address for a flat dump")
        if data[4] != 1 or data[5] != 1:
            raise ValueError("only little-endian ELF32 images are supported")
        phoff = struct.unpack_from("<I", data, 0x1C)[0]
        phentsize = struct.unpack_from("<H", data, 0x2A)[0]
        phnum = struct.unpack_from("<H", data, 0x2C)[0]
        if phentsize < 32:
            raise ValueError("ELF program-header entry is unexpectedly small")
        mappings: list[Mapping] = []
        for index in range(phnum):
            offset = phoff + index * phentsize
            if offset < 0 or offset + 32 > len(data):
                raise ValueError("ELF program-header table extends beyond the file")
            if struct.unpack_from("<I", data, offset)[0] != 1:
                continue
            file_offset, virtual_address, _physical_address, file_size = struct.unpack_from("<IIII", data, offset + 4)
            if file_offset + file_size > len(data):
                raise ValueError("ELF PT_LOAD segment extends beyond the file")
            mappings.append(Mapping(file_offset, virtual_address, file_size))
        if not mappings:
            raise ValueError("ELF contains no file-backed PT_LOAD segment")
        return cls(data, mappings)

    def read(self, virtual_address: int, count: int) -> bytes:
        for mapping in self.mappings:
            relative = virtual_address - mapping.virtual_address
            if relative < 0 or relative + count > mapping.file_size:
                continue
            offset = mapping.file_offset + relative
            return self.data[offset:offset + count]
        raise ValueError(f"0x{virtual_address:08X} (+{count}) is not file-backed")

    def u32(self, virtual_address: int) -> int:
        return struct.unpack("<I", self.read(virtual_address, 4))[0]

    def iter_aligned(self, alignment: int, width: int) -> Iterator[int]:
        for mapping in self.mappings:
            start = (mapping.virtual_address + alignment - 1) & ~(alignment - 1)
            end = mapping.virtual_address + mapping.file_size
            yield from range(start, end - width + 1, alignment)


@dataclass(frozen=True)
class AddressReference:
    lui_address: int
    lui_word: int
    use_address: int
    use_word: int
    form: str


@dataclass(frozen=True)
class MemoryReference:
    address: int
    word: int
    mnemonic: str
    offset: int


@dataclass(frozen=True)
class GsWrite:
    register: int
    value: int


@dataclass(frozen=True)
class GifPacket:
    address: int
    loop_count: int
    end_of_packet: bool
    writes: tuple[GsWrite, ...]


MEMORY_OPS = {
    0x1E: "lq", 0x1F: "sq",
    0x20: "lb", 0x21: "lh", 0x22: "lwl", 0x23: "lw",
    0x24: "lbu", 0x25: "lhu", 0x26: "lwr", 0x27: "lwu",
    0x28: "sb", 0x29: "sh", 0x2A: "swl", 0x2B: "sw", 0x2E: "swr",
    0x31: "lwc1", 0x36: "lqc2", 0x37: "ld",
    0x39: "swc1", 0x3E: "sqc2", 0x3F: "sd",
}

GS_REGISTERS = {
    0x00: "PRIM", 0x01: "RGBAQ", 0x02: "ST", 0x03: "UV",
    0x04: "XYZF2", 0x05: "XYZ2", 0x06: "TEX0_1", 0x07: "TEX0_2",
    0x08: "CLAMP_1", 0x09: "CLAMP_2", 0x0A: "FOG", 0x0C: "XYZF3", 0x0D: "XYZ3",
    0x14: "TEX1_1", 0x15: "TEX1_2", 0x16: "TEX2_1", 0x17: "TEX2_2",
    0x18: "XYOFFSET_1", 0x19: "XYOFFSET_2", 0x1A: "PRMODECONT", 0x1B: "PRMODE",
    0x1C: "TEXCLUT", 0x22: "SCANMSK", 0x34: "MIPTBP1_1", 0x35: "MIPTBP1_2",
    0x36: "MIPTBP2_1", 0x37: "MIPTBP2_2", 0x3B: "TEXA", 0x3D: "FOGCOL",
    0x3F: "TEXFLUSH", 0x40: "SCISSOR_1", 0x41: "SCISSOR_2", 0x42: "ALPHA_1",
    0x43: "ALPHA_2", 0x44: "DIMX", 0x45: "DTHE", 0x46: "COLCLAMP",
    0x47: "TEST_1", 0x48: "TEST_2", 0x49: "PABE", 0x4A: "FBA_1",
    0x4B: "FBA_2", 0x4C: "FRAME_1", 0x4D: "FRAME_2", 0x4E: "ZBUF_1",
    0x4F: "ZBUF_2", 0x50: "BITBLTBUF", 0x51: "TRXPOS", 0x52: "TRXREG",
    0x53: "TRXDIR", 0x54: "HWREG", 0x60: "SIGNAL", 0x61: "FINISH", 0x62: "LABEL",
}


def find_address_references(space: AddressSpace, target: int, lookahead: int = 6) -> list[AddressReference]:
    target &= 0xFFFFFFFF
    matches: list[AddressReference] = []
    for address in space.iter_aligned(4, 4):
        first = space.u32(address)
        if first >> 26 != 0x0F:
            continue
        base_register = (first >> 16) & 31
        high = first & 0xFFFF
        for distance in range(1, lookahead + 1):
            use_address = address + distance * 4
            try:
                use = space.u32(use_address)
            except ValueError:
                break
            opcode = use >> 26
            if opcode not in (0x09, 0x0D) or ((use >> 21) & 31) != base_register:
                continue
            low = use & 0xFFFF
            if opcode == 0x09:
                value = ((high << 16) + signed16(low)) & 0xFFFFFFFF
                form = "addiu"
            else:
                value = ((high << 16) | low) & 0xFFFFFFFF
                form = "ori"
            if value == target:
                matches.append(AddressReference(address, first, use_address, use, form))
    return matches


def format_memory(word: int, mnemonic: str) -> str:
    rs = (word >> 21) & 31
    rt = (word >> 16) & 31
    offset = signed16(word & 0xFFFF)
    if mnemonic in ("lwc1", "swc1"):
        target = f"f{rt}"
    elif mnemonic in ("lqc2", "sqc2"):
        target = f"vf{rt}"
    else:
        target = REGISTERS[rt]
    return f"{mnemonic} {target}, {offset}({REGISTERS[rs]})"


def find_memory_offsets(space: AddressSpace, minimum: int, maximum: int) -> list[MemoryReference]:
    if minimum > maximum:
        raise ValueError("minimum offset must not exceed maximum offset")
    matches: list[MemoryReference] = []
    for address in space.iter_aligned(4, 4):
        word = space.u32(address)
        mnemonic = MEMORY_OPS.get(word >> 26)
        offset = signed16(word & 0xFFFF)
        if mnemonic is not None and minimum <= offset <= maximum:
            matches.append(MemoryReference(address, word, mnemonic, offset))
    return matches


def gs_register_name(register: int) -> str:
    return GS_REGISTERS.get(register, f"GS_{register:02X}")


def find_gs_packets(space: AddressSpace) -> list[GifPacket]:
    matches: list[GifPacket] = []
    for address in space.iter_aligned(16, 16):
        low, high = struct.unpack("<QQ", space.read(address, 16))
        loop_count = low & 0x7FFF
        end_of_packet = bool((low >> 15) & 1)
        format_value = (low >> 58) & 0x3
        nreg = (low >> 60) & 0xF
        register_count = 16 if nreg == 0 else nreg
        descriptor = high & 0xF
        if format_value != 0 or register_count != 1 or descriptor != 0xE or not 1 <= loop_count <= 32:
            continue
        try:
            payload = space.read(address + 16, loop_count * 16)
        except ValueError:
            continue
        writes: list[GsWrite] = []
        valid = True
        for index in range(loop_count):
            value, register_word = struct.unpack_from("<QQ", payload, index * 16)
            if register_word & ~0xFF or register_word > 0x62:
                valid = False
                break
            writes.append(GsWrite(int(register_word), value))
        if valid:
            matches.append(GifPacket(address, int(loop_count), end_of_packet, tuple(writes)))
    return matches


def integer(text: str) -> int:
    try:
        return int(text, 0)
    except ValueError as error:
        raise argparse.ArgumentTypeError("expected a decimal or 0x-prefixed integer") from error


def signed_offset(text: str) -> int:
    value = integer(text)
    if 0 <= value <= 0xFFFF and value & 0x8000:
        value -= 0x10000
    if not -0x8000 <= value <= 0x7FFF:
        raise argparse.ArgumentTypeError("offset must fit a signed 16-bit immediate")
    return value


def load_space(path: Path, base_address: int | None) -> AddressSpace:
    return AddressSpace.from_input(path.read_bytes(), base_address)


def encode_i(opcode: int, rs: int, rt: int, immediate: int) -> int:
    return (opcode << 26) | (rs << 21) | (rt << 16) | (immediate & 0xFFFF)


def synthetic_elf(payload: bytes, virtual_address: int) -> bytes:
    file_offset = 0x100
    data = bytearray(file_offset + len(payload))
    data[:6] = b"\x7fELF\x01\x01"
    struct.pack_into("<I", data, 0x1C, 0x34)
    struct.pack_into("<H", data, 0x2A, 32)
    struct.pack_into("<H", data, 0x2C, 1)
    struct.pack_into(
        "<IIIIIIII",
        data,
        0x34,
        1,
        file_offset,
        virtual_address,
        virtual_address,
        len(payload),
        len(payload),
        5,
        16,
    )
    data[file_offset:] = payload
    return bytes(data)


def self_test() -> None:
    base = 0x00100000
    target = 0x12348004
    payload = bytearray(0xA0)
    words = [
        encode_i(0x0F, 0, 8, 0x1235),
        encode_i(0x09, 8, 9, 0x8004),
        encode_i(0x0F, 0, 10, 0x1234),
        encode_i(0x0D, 10, 11, 0x8004),
        encode_i(0x23, 29, 4, 0xFFE0),
        encode_i(0x1E, 16, 2, 0x0030),
        encode_i(0x1F, 16, 2, 0x0034),
    ]
    for index, word in enumerate(words):
        struct.pack_into("<I", payload, index * 4, word)
    tag_low = 2 | (1 << 15) | (1 << 60)
    struct.pack_into("<QQ", payload, 0x40, tag_low, 0xE)
    struct.pack_into("<QQ", payload, 0x50, 0x1122334455667788, 0x47)
    struct.pack_into("<QQ", payload, 0x60, 0x8877665544332211, 0x33)
    invalid_tag_low = 1 | (1 << 60)
    struct.pack_into("<QQ", payload, 0x80, invalid_tag_low, 0xE)
    struct.pack_into("<QQ", payload, 0x90, 0x55, 0x100)

    space = AddressSpace.from_input(synthetic_elf(bytes(payload), base))
    references = find_address_references(space, target)
    assert [(item.form, item.lui_address, item.use_address) for item in references] == [
        ("addiu", base, base + 4),
        ("ori", base + 8, base + 12),
    ]
    memory = find_memory_offsets(space, -32, 0x34)
    assert [(item.mnemonic, item.offset) for item in memory] == [
        ("lw", -32), ("lq", 0x30), ("sq", 0x34),
    ]
    packets = find_gs_packets(space)
    assert len(packets) == 1 and packets[0].address == base + 0x40
    assert [gs_register_name(write.register) for write in packets[0].writes] == ["TEST_1", "GS_33"]

    flat = AddressSpace.from_input(bytes(payload), base)
    assert find_address_references(flat, target) == references
    assert signed_offset("0xffe0") == -32 and signed_offset("-32") == -32
    print("elf_archaeology self-test: ok")


def add_input_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("input", type=Path, help="ELF32 image, or flat dump with --base-address")
    parser.add_argument("--base-address", type=integer, help="virtual base address for a flat binary dump")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    address_parser = commands.add_parser("find-address", help="find LUI + ADDIU/ORI references to an address")
    add_input_arguments(address_parser)
    address_parser.add_argument("target", type=integer)
    address_parser.add_argument("--lookahead", type=int, default=6)

    offset_parser = commands.add_parser("find-offset", help="find immediate-offset load/store instructions")
    add_input_arguments(offset_parser)
    offset_parser.add_argument("minimum", type=signed_offset)
    offset_parser.add_argument("maximum", type=signed_offset)

    packet_parser = commands.add_parser("find-gs-packets", help="find static packed GIF A+D packets")
    add_input_arguments(packet_parser)
    commands.add_parser("self-test", help="run deterministic synthetic verification")

    args = parser.parse_args()
    if args.command == "self-test":
        self_test()
        return

    space = load_space(args.input, args.base_address)
    if args.command == "find-address":
        if args.lookahead < 1:
            raise SystemExit("--lookahead must be at least 1")
        matches = find_address_references(space, args.target, args.lookahead)
        for match in matches:
            print(f"{match.lui_address:08X}: {match.lui_word:08X}  {disassemble(match.lui_word, match.lui_address)}")
            print(
                f"{match.use_address:08X}: {match.use_word:08X}  "
                f"{disassemble(match.use_word, match.use_address)}  [{match.form} -> 0x{args.target & 0xFFFFFFFF:08X}]"
            )
            print()
        print(f"Target-address references: {len(matches)}")
    elif args.command == "find-offset":
        matches = find_memory_offsets(space, args.minimum, args.maximum)
        for match in matches:
            print(f"{match.address:08X}: {match.word:08X}  {format_memory(match.word, match.mnemonic)}")
        print(f"Load/store offset matches: {len(matches)}")
    elif args.command == "find-gs-packets":
        packets = find_gs_packets(space)
        for packet in packets:
            print(f"{packet.address:08X}: GIF A+D NLOOP={packet.loop_count} EOP={1 if packet.end_of_packet else 0}")
            for write in packet.writes:
                print(f"  {gs_register_name(write.register):<12} [0x{write.register:02X}] = 0x{write.value:016X}")
        print(f"Static packed GS A+D packets: {len(packets)}")


if __name__ == "__main__":
    main()
