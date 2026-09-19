#!/usr/bin/env python3
"""Locate VIF MPG uploads in a PS2 ELF and rebuild VU1 micro memory.

The tool operates only on a user-supplied ELF. It scans file-backed PT_LOAD
segments, reports MPG-like VIFcode words, and can reconstruct one contiguous
HG2-style MPG upload stream into the 16 KiB image expected by vu_micro_probe.py.
"""

from __future__ import annotations

import argparse
import struct
from dataclasses import dataclass
from pathlib import Path

VU1_INSTRUCTIONS = 2048
VU1_INSTRUCTION_BYTES = 8
VU1_MEMORY_BYTES = VU1_INSTRUCTIONS * VU1_INSTRUCTION_BYTES
VIF_MPG_COMMAND = 0x4A


def integer(text: str) -> int:
    try:
        return int(text, 0)
    except ValueError as error:
        raise argparse.ArgumentTypeError(
            "expected a decimal or 0x-prefixed integer"
        ) from error


def effective_count(count: int) -> int:
    return 256 if count == 0 else count


@dataclass(frozen=True)
class LoadSegment:
    virtual_address: int
    file_offset: int
    file_size: int


@dataclass(frozen=True)
class MpgCode:
    raw: int
    count_field: int
    count: int
    destination: int
    reserved_immediate: int
    irq: bool


@dataclass(frozen=True)
class MpgPacket:
    address: int
    code: MpgCode
    payload_bytes: int
    padding_bytes: int


@dataclass(frozen=True)
class Extraction:
    memory: bytes
    packets: tuple[MpgPacket, ...]
    next_address: int


class Elf32Image:
    def __init__(self, data: bytes):
        self.data = data
        self.segments = self._read_load_segments()

    @classmethod
    def from_path(cls, path: Path) -> "Elf32Image":
        return cls(path.read_bytes())

    def _read_load_segments(self) -> tuple[LoadSegment, ...]:
        if len(self.data) < 52 or self.data[:4] != b"\x7fELF":
            raise ValueError("input is not an ELF file")
        if self.data[4] != 1:
            raise ValueError("only ELF32 executables are supported")
        if self.data[5] != 1:
            raise ValueError("only little-endian ELF executables are supported")

        program_offset = struct.unpack_from("<I", self.data, 0x1C)[0]
        entry_size = struct.unpack_from("<H", self.data, 0x2A)[0]
        entry_count = struct.unpack_from("<H", self.data, 0x2C)[0]
        if entry_size < 32:
            raise ValueError("ELF program-header entries are too small")

        segments: list[LoadSegment] = []
        for index in range(entry_count):
            offset = program_offset + index * entry_size
            if offset < 0 or offset + 32 > len(self.data):
                raise ValueError("ELF program-header table extends past EOF")
            values = struct.unpack_from("<8I", self.data, offset)
            kind, file_offset, virtual_address, _, file_size, _, _, _ = values
            if kind != 1 or file_size == 0:
                continue
            if file_offset + file_size > len(self.data):
                raise ValueError("ELF PT_LOAD segment extends past EOF")
            segments.append(LoadSegment(virtual_address, file_offset, file_size))

        if not segments:
            raise ValueError("ELF has no file-backed PT_LOAD segments")
        return tuple(sorted(segments, key=lambda segment: segment.virtual_address))

    def read_virtual(self, address: int, length: int) -> bytes:
        if length < 0:
            raise ValueError("length must be non-negative")
        for segment in self.segments:
            start = segment.virtual_address
            end = start + segment.file_size
            if start <= address and address + length <= end:
                offset = segment.file_offset + address - start
                return self.data[offset:offset + length]
        raise ValueError(
            f"virtual range 0x{address:08X}..0x{address + length:08X} "
            "is not file-backed"
        )

    def u32(self, address: int) -> int:
        return struct.unpack("<I", self.read_virtual(address, 4))[0]


def is_mpg_word(word: int) -> bool:
    return ((word >> 24) & 0x7F) == VIF_MPG_COMMAND


def decode_mpg(word: int) -> MpgCode:
    if not is_mpg_word(word):
        raise ValueError(f"0x{word:08X} is not a VIF MPG command")
    immediate = word & 0xFFFF
    count_field = (word >> 16) & 0xFF
    return MpgCode(
        raw=word,
        count_field=count_field,
        count=effective_count(count_field),
        destination=immediate & 0x07FF,
        reserved_immediate=immediate & 0xF800,
        irq=bool(word & 0x80000000),
    )


def validate_vu1_write(code: MpgCode) -> None:
    if code.reserved_immediate:
        raise ValueError(
            f"MPG immediate has non-VU1 address bits set: "
            f"0x{code.reserved_immediate:04X}"
        )
    end = code.destination + code.count
    if end > VU1_INSTRUCTIONS:
        raise ValueError(
            f"MPG write exceeds VU1 micro memory: "
            f"dest=0x{code.destination:03X}, count={code.count}"
        )


def zero_padding_to_qword(image: Elf32Image, address: int) -> int:
    padding = (-address) & 0xF
    if padding == 0:
        return 0
    if padding % 4:
        raise AssertionError("word-aligned VIF stream produced non-word padding")
    try:
        data = image.read_virtual(address, padding)
    except ValueError:
        return 0
    return padding if data == bytes(padding) else 0


def find_mpg_words(image: Elf32Image) -> list[tuple[int, MpgCode, str | None]]:
    matches: list[tuple[int, MpgCode, str | None]] = []
    for segment in image.segments:
        first = (segment.virtual_address + 3) & ~3
        end = segment.virtual_address + segment.file_size
        for address in range(first, end - 3, 4):
            word = image.u32(address)
            if not is_mpg_word(word):
                continue
            code = decode_mpg(word)
            error: str | None = None
            try:
                validate_vu1_write(code)
            except ValueError as problem:
                error = str(problem)
            matches.append((address, code, error))
    return matches


def extract_stream(image: Elf32Image, start_address: int) -> Extraction:
    if start_address < 0 or start_address % 4:
        raise ValueError("start address must be a non-negative 4-byte-aligned address")

    memory = bytearray(VU1_MEMORY_BYTES)
    packets: list[MpgPacket] = []
    cursor = start_address

    while True:
        try:
            word = image.u32(cursor)
        except ValueError:
            if packets:
                break
            raise

        if not is_mpg_word(word):
            break
        code = decode_mpg(word)
        validate_vu1_write(code)
        payload_bytes = code.count * VU1_INSTRUCTION_BYTES
        payload = image.read_virtual(cursor + 4, payload_bytes)
        output_offset = code.destination * VU1_INSTRUCTION_BYTES
        memory[output_offset:output_offset + payload_bytes] = payload

        after_payload = cursor + 4 + payload_bytes
        padding_bytes = zero_padding_to_qword(image, after_payload)
        packets.append(
            MpgPacket(
                address=cursor,
                code=code,
                payload_bytes=payload_bytes,
                padding_bytes=padding_bytes,
            )
        )
        cursor = after_payload + padding_bytes

    if not packets:
        raise ValueError(f"no VIF MPG packet found at 0x{start_address:08X}")
    return Extraction(bytes(memory), tuple(packets), cursor)


def format_packet(address: int, code: MpgCode, error: str | None = None) -> str:
    irq = " IRQ" if code.irq else ""
    if error is not None:
        return (
            f"0x{address:08X}: {code.raw:08X}  MPG num={code.count:3} "
            f"dest=0x{code.destination:03X}{irq} INVALID: {error}"
        )
    last = code.destination + code.count - 1
    return (
        f"0x{address:08X}: {code.raw:08X}  MPG num={code.count:3} "
        f"dest=0x{code.destination:03X}..0x{last:03X}{irq}"
    )


def _mpg_word(count: int, destination: int, irq: bool = False) -> int:
    return (
        (0x80000000 if irq else 0)
        | (VIF_MPG_COMMAND << 24)
        | ((count & 0xFF) << 16)
        | (destination & 0xFFFF)
    )


def _synthetic_elf(payload: bytes, virtual_address: int = 0x00100000) -> Elf32Image:
    ident = bytearray(16)
    ident[:4] = b"\x7fELF"
    ident[4] = 1
    ident[5] = 1
    ident[6] = 1
    header = struct.pack(
        "<16sHHIIIIIHHHHHH",
        bytes(ident), 2, 8, 1, virtual_address, 52, 0, 0,
        52, 32, 1, 0, 0, 0,
    )
    segment_offset = 0x100
    program = struct.pack(
        "<8I",
        1, segment_offset, virtual_address, virtual_address,
        len(payload), len(payload), 5, 0x1000,
    )
    image = bytearray(segment_offset + len(payload))
    image[:len(header)] = header
    image[52:52 + len(program)] = program
    image[segment_offset:] = payload
    return Elf32Image(bytes(image))


def self_test() -> None:
    checks = 0

    zero_count = decode_mpg(_mpg_word(0, 0x100))
    assert zero_count.count_field == 0 and zero_count.count == 256
    checks += 1

    first_payload = bytes(range(16))
    second_payload = bytes(range(0x80, 0x88))
    stream = bytearray()
    stream += struct.pack("<I", _mpg_word(2, 0x10))
    stream += first_payload
    stream += bytes(12)
    stream += struct.pack("<I", _mpg_word(1, 0x20, irq=True))
    stream += second_payload
    stream += bytes(4)
    stream += struct.pack("<I", 0x11000000)

    image = _synthetic_elf(bytes(stream))
    result = extract_stream(image, 0x00100000)
    assert len(result.memory) == VU1_MEMORY_BYTES
    assert len(result.packets) == 2
    checks += 2
    assert result.packets[0].padding_bytes == 12
    assert result.packets[1].padding_bytes == 4
    assert result.packets[1].address % 16 == 0
    checks += 1
    assert result.memory[0x10 * 8:0x12 * 8] == first_payload
    assert result.memory[0x20 * 8:0x21 * 8] == second_payload
    checks += 1
    assert result.packets[1].code.irq
    checks += 1

    matches = find_mpg_words(image)
    packet_addresses = {address for address, _, error in matches if error is None}
    assert {0x00100000, 0x00100020}.issubset(packet_addresses)
    assert any(code.irq for _, code, _ in matches)
    checks += 1

    full_payload = bytes([0xA5]) * (256 * VU1_INSTRUCTION_BYTES)
    full_stream = struct.pack("<I", _mpg_word(0, 0x100)) + full_payload + bytes(12)
    full_result = extract_stream(_synthetic_elf(full_stream), 0x00100000)
    assert full_result.packets[0].code.count == 256
    assert full_result.memory[0x100 * 8:0x200 * 8] == full_payload
    checks += 1

    try:
        validate_vu1_write(decode_mpg(_mpg_word(2, 0x7FF)))
    except ValueError:
        checks += 1
    else:
        raise AssertionError("out-of-range VU1 write was accepted")

    try:
        validate_vu1_write(decode_mpg(_mpg_word(1, 0x0800)))
    except ValueError:
        checks += 1
    else:
        raise AssertionError("reserved MPG destination bits were accepted")

    print(f"self-test: {checks} deterministic checks passed")


def command_find(input_path: Path) -> None:
    image = Elf32Image.from_path(input_path)
    matches = find_mpg_words(image)
    for address, code, error in matches:
        print(format_packet(address, code, error))
    print(f"MPG-like aligned words: {len(matches)}")


def command_extract(input_path: Path, start_address: int, output_path: Path) -> None:
    image = Elf32Image.from_path(input_path)
    result = extract_stream(image, start_address)
    for packet in result.packets:
        suffix = f" pad={packet.padding_bytes}" if packet.padding_bytes else ""
        print(format_packet(packet.address, packet.code) + suffix)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(result.memory)
    uploaded = sum(packet.code.count for packet in result.packets)
    print(
        f"Wrote {len(result.memory)} bytes "
        f"({uploaded} uploaded instructions across {len(result.packets)} MPG packets) "
        f"to {output_path}"
    )
    print(f"Next ELF word after contiguous MPG stream: 0x{result.next_address:08X}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Locate VIF MPG commands and reconstruct a VU1 micro-memory image."
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="run deterministic synthetic ELF/VIF checks and exit",
    )
    commands = parser.add_subparsers(dest="command")
    find_parser = commands.add_parser(
        "find",
        help="scan file-backed ELF load segments for aligned MPG-like VIFcode words",
    )
    find_parser.add_argument("input", type=Path, help="user-supplied PAL executable ELF")

    extract_parser = commands.add_parser(
        "extract",
        help="rebuild one contiguous HG2-style MPG upload stream",
    )
    extract_parser.add_argument("input", type=Path, help="user-supplied PAL executable ELF")
    extract_parser.add_argument("start", type=integer, help="virtual address of the first MPG")
    extract_parser.add_argument("output", type=Path, help="16 KiB VU1 micro-memory output")

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    try:
        if args.self_test:
            self_test()
        elif args.command == "find":
            command_find(args.input)
        elif args.command == "extract":
            command_extract(args.input, args.start, args.output)
        else:
            parser.error("choose find/extract or use --self-test")
    except (OSError, ValueError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
