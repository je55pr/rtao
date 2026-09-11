#!/usr/bin/env python3
"""Dump the PAL native equipment catalogue without retaining game payloads.

Accepts either the PAL SLES_513.56 ELF or the raw 2352-byte-sector BIN.
The output contains record addresses, names, prices, exact record bytes and
only evidence-backed field interpretations. Unknown bytes remain raw.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path

TABLES = {
    1: ("Tyres", 0x00301630, 28, 13),
    2: ("Engine", 0x00301A90, 24, 12),
    3: ("Chassis", 0x00301DB8, 16, 5),
    4: ("Transmission", 0x00301EE8, 28, 6),
    5: ("Steering", 0x003020A8, 16, 4),
    6: ("Brakes", 0x00302190, 44, 4),
    7: ("Wheels", 0x00304B98, 12, 15),
}
TABLES.update({
    8: ("Lights", 0x00304B00, 16, 3),
    9: ("Wing", 0x00304E40, 12, 2),
    10: ("Special Parts", 0x00304EB8, 16, 3),
    11: ("Options", 0x00304FA0, 20, 9),
    12: ("Stickers", 0x003053B8, 12, 2),
    13: ("Horns", 0x00304C60, 16, 15),
    14: ("Meters", 0x00305280, 12, 11),
})

SELECTOR_EFFECTS = {
    1: "record u16@+0x1a nonzero sets cfg flags 0x0400; zero clears it",
    2: "record u32@+0x14 code 1/2 selects cfg flag 0x0001/0x0002 after clearing both",
    3: "no category-specific selector-write side effect beyond selector byte",
    4: "no category-specific selector-write side effect beyond selector byte",
    5: "no category-specific selector-write side effect beyond selector byte",
    6: "no category-specific selector-write side effect beyond selector byte",
    7: "duplicates selected item to configuration byte +0x06",
    8: "nonzero selector sets cfg flag 0x0010; zero clears it",
    9: "nonzero selector sets cfg flag 0x1000; zero clears it",
    10: "clears cfg flags 0x0040/0x2000 then ORs record u16@+0x0c",
    11: "clears cfg flags 0x0004/0x0020/0x0100/0x0200, ORs record u16@+0x0c, copies record byte@+0x10 to cfg byte +0x07",
    12: "nonzero selector sets cfg flag 0x4000; zero clears it",
    13: "selector byte only in helper 0x0023df78",
    14: "selector byte only in helper 0x0023df78",
}
ROLE_NOTES = {
    1: "six PAL surface grip coefficients; Big selector additionally drives cfg flag 0x0400",
    2: "drive-force scalar at +0x0c; final flag code is consumed by selector writer",
    3: "weight word at +0x0c is the live inverse-mass divisor source",
    4: "eight signed reverse/forward/sentinel gear words at +0x0c",
    5: "steering scalar at +0x0c",
    6: "32-update braking curve at +0x0c",
    7: "wheel appearance selector; duplicated to configuration byte +0x06",
    8: "light equipment selector; nonzero state toggles cfg flag 0x0010",
    9: "wing equipment selector; nonzero state toggles cfg flag 0x1000",
    10: "propulsion equipment; record flag word distinguishes Propeller/Jet Turbine",
    11: "optional equipment; record flags and variant byte are consumed by selector writer",
    12: "sticker equipment; nonzero state toggles cfg flag 0x4000",
    13: "horn selection; audio switching role known, trailing word retained raw",
    14: "meter selection; HUD switching role known, no extra selector-writer side effect",
}


def read_sector(handle, lba: int) -> bytes:
    handle.seek(lba * 2352 + 24)
    data = handle.read(2048)
    if len(data) != 2048:
        raise ValueError(f"short sector at LBA {lba}")
    return data


def read_extent(handle, lba: int, size: int) -> bytes:
    count = (size + 2047) // 2048
    return b"".join(read_sector(handle, lba + i) for i in range(count))[:size]


def extract_sles_from_bin(path: Path) -> bytes:
    with path.open("rb") as handle:
        pvd = read_sector(handle, 16)
        if pvd[:7] != b"\x01CD001\x01":
            raise ValueError("expected Mode2/2352 ISO9660 primary volume descriptor")
        root = pvd[156:190]
        root_lba = struct.unpack_from("<I", root, 2)[0]
        root_size = struct.unpack_from("<I", root, 10)[0]
        directory = read_extent(handle, root_lba, root_size)
        pos = 0
        while pos < len(directory):
            length = directory[pos]
            if not length:
                pos = ((pos // 2048) + 1) * 2048
                continue
            record = directory[pos:pos + length]
            name_len = record[32]
            name = record[33:33 + name_len].decode("ascii", "replace")
            if name.upper() == "SLES_513.56;1":
                lba = struct.unpack_from("<I", record, 2)[0]
                size = struct.unpack_from("<I", record, 10)[0]
                return read_extent(handle, lba, size)
            pos += length
    raise ValueError("SLES_513.56;1 not found in BIN root directory")


def load_elf(path: Path) -> tuple[bytes, str]:
    with path.open("rb") as handle:
        head = handle.read(4)
    if head == b"\x7fELF":
        return path.read_bytes(), "elf"
    return extract_sles_from_bin(path), "mode2-bin"


class ElfView:
    def __init__(self, data: bytes):
        if data[:4] != b"\x7fELF" or data[4:6] != b"\x01\x01":
            raise ValueError("expected little-endian ELF32")
        self.data = data
        phoff = struct.unpack_from("<I", data, 28)[0]
        phentsize = struct.unpack_from("<H", data, 42)[0]
        phnum = struct.unpack_from("<H", data, 44)[0]
        self.loads = []
        for i in range(phnum):
            values = struct.unpack_from("<IIIIIIII", data, phoff + i * phentsize)
            if values[0] == 1:
                self.loads.append(values)

    def offset(self, address: int) -> int:
        for _, file_off, vaddr, _, file_size, _, _, _ in self.loads:
            if vaddr <= address < vaddr + file_size:
                return file_off + address - vaddr
        raise ValueError(f"virtual address not file-backed: 0x{address:08x}")

    def bytes(self, address: int, size: int) -> bytes:
        off = self.offset(address)
        return self.data[off:off + size]

    def cstr(self, address: int, limit: int = 128) -> str:
        off = self.offset(address)
        end = self.data.find(b"\0", off, off + limit)
        if end < 0:
            end = off + limit
        return self.data[off:end].decode("latin-1", "replace")


def decode_known_fields(category: int, tail: bytes) -> dict[str, object]:
    if category == 1:
        return {
            "surface_grip_u16": list(struct.unpack_from("<6H", tail, 0)),
            "raw_u16_0x18": struct.unpack_from("<H", tail, 12)[0],
            "selector_flag_source_u16_0x1a": struct.unpack_from("<H", tail, 14)[0],
        }
    if category == 2:
        return {
            "drive_scalar_u32_0x0c": struct.unpack_from("<I", tail, 0)[0],
            "raw_u32_0x10": struct.unpack_from("<I", tail, 4)[0],
            "selector_flag_code_u32_0x14": struct.unpack_from("<I", tail, 8)[0],
        }
    if category == 3:
        return {"weight_word_u32_0x0c": struct.unpack_from("<I", tail, 0)[0]}
    if category == 4:
        return {"gear_words_s16_0x0c": list(struct.unpack_from("<8h", tail, 0))}
    if category == 5:
        return {
            "steering_scalar_u16_0x0c": struct.unpack_from("<H", tail, 0)[0],
            "raw_u16_0x0e": struct.unpack_from("<H", tail, 2)[0],
        }
    if category == 6:
        return {"brake_curve_u8_0x0c": list(tail)}
    return decode_late_fields(category, tail)


def decode_late_fields(category: int, tail: bytes) -> dict[str, object]:
    if category in (8, 13):
        return {"raw_u32_0x0c": struct.unpack_from("<I", tail, 0)[0]}
    if category == 10:
        return {
            "config_flags_u16_0x0c": struct.unpack_from("<H", tail, 0)[0],
            "raw_u16_0x0e": struct.unpack_from("<H", tail, 2)[0],
        }
    if category == 11:
        return {
            "config_flags_u16_0x0c": struct.unpack_from("<H", tail, 0)[0],
            "raw_u16_0x0e": struct.unpack_from("<H", tail, 2)[0],
            "config_byte_u8_0x10": tail[4],
            "raw_bytes_0x11_0x13": tail[5:8].hex(),
        }
    return {}


def build_catalogue(elf: bytes) -> dict[str, object]:
    view = ElfView(elf)
    categories = []
    for category, (label, start, stride, count) in TABLES.items():
        items = []
        for index in range(count):
            address = start + index * stride
            record = view.bytes(address, stride)
            name_ptr, desc_ptr, price = struct.unpack_from("<III", record, 0)
            tail = record[12:]
            items.append({
                "index": index,
                "address": f"0x{address:08x}",
                "record_name": view.cstr(name_ptr),
                "name_pointer": f"0x{name_ptr:08x}",
                "description_pointer": f"0x{desc_ptr:08x}",
                "price_cake": price,
                "record_hex": record.hex(),
                "configuration_tail_hex": tail.hex(),
                "known_fields": decode_known_fields(category, tail),
            })
        categories.append({
            "category": category,
            "label": label,
            "table_address": f"0x{start:08x}",
            "record_stride": stride,
            "item_count": count,
            "known_role": ROLE_NOTES[category],
            "selector_write_effect": SELECTOR_EFFECTS[category],
            "items": items,
        })
    return {
        "schema": 1,
        "authority": "Road Trip Adventure European PAL executable SLES_513.56",
        "source": {
            "input_kind": "pal-executable",
            "elf_size": len(elf),
            "elf_sha256": hashlib.sha256(elf).hexdigest(),
        },
        "evidence_addresses": {
            "price_helper": "0x00245268",
            "price_jump_table": "0x0030ac20",
            "selector_write_helper": "0x0023df78",
            "selector_side_effect_jump_table": "0x00301410",
        },
        "categories": categories,
    }


def canonical_json(value: object) -> str:
    return json.dumps(value, indent=2, sort_keys=False) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path, help="PAL SLES_513.56 ELF or raw Mode2 BIN")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--verify", type=Path, help="compare generated JSON with retained evidence")
    args = parser.parse_args()

    elf, _input_kind = load_elf(args.input)
    text = canonical_json(build_catalogue(elf))
    if args.verify:
        expected = args.verify.read_text(encoding="utf-8")
        if expected != text:
            raise SystemExit(f"catalogue mismatch: {args.verify}")
        print(f"verified {args.verify}")
        return
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8", newline="\n")
        print(f"wrote {args.output}")
    else:
        print(text, end="")


if __name__ == "__main__":
    main()
