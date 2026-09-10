#!/usr/bin/env python3
"""Emit a payload-free census of PAL activity IDs 24..38."""
from __future__ import annotations
import argparse
import hashlib
import json
import struct
from pathlib import Path

PRIMARY = 0x002BFE48
EXTENDED = 0x002C0090
NAMES = 0x002C0410
SELECTORS = 0x002C0078


def u32(data: bytes, offset: int = 0) -> int:
    return struct.unpack_from("<I", data, offset)[0]


class Elf:
    def __init__(self, path: Path):
        self.data = path.read_bytes()
        phoff = u32(self.data, 0x1C)
        entsize = struct.unpack_from("<H", self.data, 0x2A)[0]
        count = struct.unpack_from("<H", self.data, 0x2C)[0]
        self.segments: list[tuple[int, int, int]] = []
        for i in range(count):
            off = phoff + i * entsize
            p_type, p_offset, p_vaddr, _, p_filesz, _, _, _ = struct.unpack_from("<8I", self.data, off)
            if p_type == 1:
                self.segments.append((p_vaddr, p_offset, p_filesz))

    def offset(self, address: int, size: int = 1) -> int:
        for vaddr, fileoff, filesz in self.segments:
            if vaddr <= address and address + size <= vaddr + filesz:
                return fileoff + address - vaddr
        raise ValueError(f"address 0x{address:08x} is not file-backed")

    def bytes(self, address: int, size: int) -> bytes:
        off = self.offset(address, size)
        return self.data[off:off + size]

    def word(self, address: int) -> int:
        return u32(self.bytes(address, 4))

    def ascii_z(self, address: int, limit: int = 128) -> str:
        off = self.offset(address)
        end = self.data.find(b"\0", off, off + limit)
        if end < 0:
            raise ValueError(f"unterminated string at 0x{address:08x}")
        return self.data[off:end].decode("ascii", errors="replace")


def descriptor_address(activity_id: int) -> int:
    return PRIMARY + activity_id * 16 if activity_id < 35 else EXTENDED + (activity_id - 35) * 16


def verify_dispatch_boundary(elf: Elf) -> None:
    expected = {
        0x002106B8: 0x28620023,  # slti v0,v1,35: split descriptor tables
        0x00210730: 0x8CA4000C,  # lw a0,12(a1): descriptor handler B
        0x00210AD0: 0x24020008,  # addiu v0,zero,8: separate mode-8 setup branch
        0x00210D80: 0x8C450008,  # lw a1,8(v0): descriptor handler A
        0x00238D54: 0x2C420018,  # sltiu v0,v0,24: ordinary progression boundary
    }
    for address, word in expected.items():
        actual = elf.word(address)
        if actual != word:
            raise ValueError(f"PAL dispatch invariant changed at 0x{address:08X}: 0x{actual:08X}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("executable", type=Path)
    ap.add_argument("--json", type=Path)
    args = ap.parse_args()
    elf = Elf(args.executable)
    verify_dispatch_boundary(elf)

    selectors = []
    for area in range(12):
        pair = elf.bytes(SELECTORS + area * 2, 2)
        selectors.append({"areaIndex": area, "firstActivityId": pair[0], "count": pair[1]})
    selectable = {aid: area for area, first, count in ((r["areaIndex"], r["firstActivityId"], r["count"]) for r in selectors) for aid in range(first, first + count)}

    activities = []
    for aid in range(24, 39):
        addr = descriptor_address(aid)
        descriptor = elf.bytes(addr, 16)
        settings_address = u32(descriptor, 4)
        settings = elf.bytes(settings_address, 24)
        activities.append({
            "activityId": aid,
            "name": elf.ascii_z(elf.word(NAMES + aid * 4)),
            "descriptorAddress": f"0x{addr:08X}",
            "descriptorBytes0To3": list(descriptor[:4]),
            "settingsAddress": f"0x{settings_address:08X}",
            "settingsWordsRaw": [f"0x{u32(settings, off):08X}" for off in range(0, 24, 4)],
            "handlerA": f"0x{u32(descriptor, 8):08X}",
            "handlerB": f"0x{u32(descriptor, 12):08X}",
            "genericSelectorAreaIndex": selectable.get(aid),
        })

    out = {
        "sourceSha256": hashlib.sha256(elf.data).hexdigest(),
        "scope": "PAL activity IDs 24..38; derived metadata only, no executable payload",
        "dispatchEvidence": {
            "descriptorSplitAtId": 35,
            "handlerBInstallRead": "0x00210730",
            "modeEightSetupBranch": "0x00210AD0",
            "handlerAScheduleRead": "0x00210D80",
            "ordinaryProgressionUpperExclusive": 24,
            "ordinaryProgressionBoundInstruction": "0x00238D54",
        },
        "activities": activities,
        "selectors": selectors,
    }
    text = json.dumps(out, indent=2)
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(text + "\n", encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
