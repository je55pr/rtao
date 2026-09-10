#!/usr/bin/env python3
"""Generate a deterministic PAL fixed-interaction world census.

The full JSON is derived from the user's local SLES_513.56 and MODE2/2352 BIN.
Keep generated coordinate payloads local; the maintained probe contains no
original game data or assets.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path
from typing import Any

AREA_DESCRIPTOR_TABLE = 0x002C04B0
INTERACTION_POINTER_TABLE = 0x002C2710
RESIDENT_POINTER_TABLE = 0x002C4340
DIALOGUE_ROOT = 0x002A4620
AUTHORED_AREA_COUNT = 22
ZONE_SIZE = 32
RESIDENT_SIZE = 16
SHOP_SLOT_SIZE = 0x3F000
SECTOR_SIZE = 2352
USER_DATA_OFFSET = 24
USER_DATA_SIZE = 2048


class Elf32:
    def __init__(self, data: bytes) -> None:
        self.data = data
        if data[:4] != b"\x7fELF" or data[4:6] != b"\x01\x01":
            raise ValueError("expected little-endian ELF32 executable")
        phoff = struct.unpack_from("<I", data, 0x1C)[0]
        entsize = struct.unpack_from("<H", data, 0x2A)[0]
        count = struct.unpack_from("<H", data, 0x2C)[0]
        self.segments: list[tuple[int, int, int]] = []
        for index in range(count):
            offset = phoff + index * entsize
            if struct.unpack_from("<I", data, offset)[0] != 1:
                continue
            self.segments.append((
                struct.unpack_from("<I", data, offset + 4)[0],
                struct.unpack_from("<I", data, offset + 8)[0],
                struct.unpack_from("<I", data, offset + 16)[0],
            ))
        if not self.segments:
            raise ValueError("ELF has no file-backed PT_LOAD segment")

    def offset(self, address: int, size: int = 1) -> int:
        for file_offset, virtual_address, file_size in self.segments:
            if virtual_address <= address and address + size <= virtual_address + file_size:
                return file_offset + address - virtual_address
        raise ValueError(f"virtual address 0x{address:08x} (+{size}) is not file-backed")

    def backed(self, address: int, size: int = 1) -> bool:
        try:
            self.offset(address, size)
            return True
        except ValueError:
            return False

    def u32(self, address: int) -> int:
        return struct.unpack_from("<I", self.data, self.offset(address, 4))[0]

    def f32(self, address: int) -> float:
        return struct.unpack_from("<f", self.data, self.offset(address, 4))[0]

    def bytes(self, address: int, size: int) -> bytes:
        offset = self.offset(address, size)
        return self.data[offset:offset + size]

    def ascii_z(self, address: int, limit: int = 256) -> str:
        offset = self.offset(address)
        end = self.data.find(b"\0", offset, min(len(self.data), offset + limit))
        if end < 0:
            end = min(len(self.data), offset + limit)
        return self.data[offset:end].decode("ascii", "replace")


class Mode2Iso:
    def __init__(self, path: Path) -> None:
        self.handle = path.open("rb")
        pvd = self.sector(16)
        if pvd[:7] != b"\x01CD001\x01":
            raise ValueError("expected ISO9660 primary descriptor in MODE2/2352 BIN")
        root = pvd[156:156 + pvd[156]]
        self.root_extent = int.from_bytes(root[2:6], "little")
        self.root_size = int.from_bytes(root[10:14], "little")

    def close(self) -> None:
        self.handle.close()

    def sector(self, lba: int) -> bytes:
        self.handle.seek(lba * SECTOR_SIZE + USER_DATA_OFFSET)
        data = self.handle.read(USER_DATA_SIZE)
        if len(data) != USER_DATA_SIZE:
            raise EOFError(f"short MODE2 sector at LBA {lba}")
        return data

    def extent(self, lba: int, size: int) -> bytes:
        count = (size + USER_DATA_SIZE - 1) // USER_DATA_SIZE
        return b"".join(self.sector(lba + index) for index in range(count))[:size]

    def directory(self, extent: int, size: int) -> list[dict[str, Any]]:
        data = self.extent(extent, size)
        records: list[dict[str, Any]] = []
        cursor = 0
        while cursor < len(data):
            length = data[cursor]
            if length == 0:
                cursor = ((cursor // USER_DATA_SIZE) + 1) * USER_DATA_SIZE
                continue
            record = data[cursor:cursor + length]
            name_length = record[32]
            raw_name = record[33:33 + name_length]
            if raw_name == b"\x00":
                name = "."
            elif raw_name == b"\x01":
                name = ".."
            else:
                name = raw_name.decode("ascii", "replace").split(";", 1)[0]
            records.append({
                "name": name,
                "extent": int.from_bytes(record[2:6], "little"),
                "size": int.from_bytes(record[10:14], "little"),
                "directory": bool(record[25] & 2),
            })
            cursor += length
        return records

    def named_root_entry(self, name: str) -> dict[str, Any]:
        for entry in self.directory(self.root_extent, self.root_size):
            if entry["name"].upper() == name.upper():
                return entry
        raise KeyError(name)


def field_number(area_name: str, area_code: int) -> int | None:
    if len(area_name) == 3 and all(char in "0123" for char in area_name):
        return int(area_name, 10)
    if 0 <= area_code < 64:
        return ((area_code >> 4) & 3) * 100 + ((area_code >> 2) & 3) * 10 + (area_code & 3)
    return None


def dialogue_entities(elf: Elf32, area_index: int) -> list[dict[str, Any]]:
    language_table = elf.u32(DIALOGUE_ROOT)
    area_table = elf.u32(language_table + area_index * 4)
    if area_table == 0:
        return []
    result: list[dict[str, Any]] = []
    for entity_index in range(128):
        entity_address = elf.u32(area_table + entity_index * 4)
        if entity_address == 0 or not elf.backed(entity_address, 4) or entity_address >= area_table:
            break
        name_address = elf.u32(entity_address)
        result.append({
            "entityIndex": entity_index,
            "entityAddress": entity_address,
            "name": elf.ascii_z(name_address) if elf.backed(name_address) else None,
        })
    return result


def geometry_status(corners: list[list[float]]) -> tuple[str, list[int]]:
    sentinels = [index for index, corner in enumerate(corners) if corner == [-1.0, -1.0]]
    if sentinels:
        return "disabled-sentinel", sentinels
    if len({tuple(corner) for corner in corners}) != 4:
        return "degenerate", sentinels
    turns: list[float] = []
    for index in range(4):
        a, b, c = corners[index], corners[(index + 1) % 4], corners[(index + 2) % 4]
        turns.append((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]))
    nonzero = [value for value in turns if abs(value) > 1e-5]
    if not nonzero or (any(value > 0 for value in nonzero) and any(value < 0 for value in nonzero)):
        return "degenerate", sentinels
    return "active-convex-quadrilateral", sentinels


def build_census(executable: Path, disc_bin: Path) -> dict[str, Any]:
    executable_bytes = executable.read_bytes()
    elf = Elf32(executable_bytes)
    iso = Mode2Iso(disc_bin)
    try:
        shop_entry = iso.named_root_entry("SHOP")
        shop_files = {
            entry["name"].upper(): entry
            for entry in iso.directory(shop_entry["extent"], shop_entry["size"])
            if not entry["directory"]
        }
    finally:
        iso.close()

    areas: list[dict[str, Any]] = []
    backed_interactions = 0
    standard_interactions = 0
    sentinel_interactions: list[dict[str, Any]] = []
    for area_index in range(AUTHORED_AREA_COUNT):
        descriptor = AREA_DESCRIPTOR_TABLE + area_index * 8
        area_name = elf.ascii_z(elf.u32(descriptor))
        raw_area_code = elf.u32(descriptor + 4) & 0xFFFF
        area_code = raw_area_code - 0x10000 if raw_area_code >= 0x8000 else raw_area_code
        counts = elf.bytes(descriptor + 6, 2)
        fixed_count, outdoor_count = counts[0], counts[1]
        resolved_field = field_number(area_name, area_code)
        zone_block = elf.u32(INTERACTION_POINTER_TABLE + area_index * 4)
        resident_block = elf.u32(RESIDENT_POINTER_TABLE + area_index * 4)
        entities = dialogue_entities(elf, area_index)
        shop_path = None if area_index == 0 else f"SHOP/T{area_index - 1:02d}.BIN"
        shop_entry_data = None if shop_path is None else shop_files.get(Path(shop_path).name.upper())
        shop_size = None if shop_entry_data is None else int(shop_entry_data["size"])
        shop_slots = None if shop_size is None else shop_size // SHOP_SLOT_SIZE
        interactions: list[dict[str, Any]] = []
        classification = "bootstrap-special" if area_index == 0 else ("special-outdoor" if resolved_field is None else "standard-world")

        if area_index > 0 and fixed_count:
            if zone_block == 0 or resident_block == 0:
                raise ValueError(f"area {area_index} has fixed interactions without zone/resident backing")
            for local_index in range(fixed_count):
                zone_address = zone_block + local_index * ZONE_SIZE
                definition_address = resident_block + local_index * RESIDENT_SIZE
                corners = [[elf.f32(zone_address + corner * 8), elf.f32(zone_address + corner * 8 + 4)] for corner in range(4)]
                status, sentinels = geometry_status(corners)
                dialogue = entities[local_index] if local_index < len(entities) else None
                row = {
                    "localIndex": local_index,
                    "zoneAddress": zone_address,
                    "residentDefinitionAddress": definition_address,
                    "residentName": elf.ascii_z(elf.u32(definition_address + 12)),
                    "bodyId": elf.u32(definition_address + 4),
                    "packedPaint": elf.u32(definition_address),
                    "corners": corners,
                    "geometryStatus": status,
                    "sentinelCornerIndices": sentinels,
                    "shopSlotIndex": local_index,
                    "dialogue": dialogue,
                }
                interactions.append(row)
                backed_interactions += 1
                if resolved_field is not None:
                    standard_interactions += 1
                if sentinels:
                    sentinel_interactions.append({
                        "areaIndex": area_index,
                        "areaName": area_name,
                        "localIndex": local_index,
                        "residentName": row["residentName"],
                        "sentinelCornerIndices": sentinels,
                    })

        areas.append({
            "areaIndex": area_index,
            "areaName": area_name,
            "areaCode": area_code,
            "fieldNumber": resolved_field,
            "classification": classification,
            "fixedInteractionCount": fixed_count,
            "outdoorResidentCount": outdoor_count,
            "zoneBlockAddress": zone_block,
            "residentBlockAddress": resident_block,
            "dialogueEntityCount": len(entities),
            "dialogueCountMatchesFixedPlusOutdoor": len(entities) == fixed_count + outdoor_count if area_index > 0 else len(entities) == 0,
            "shopPackage": shop_path,
            "shopPackageByteLength": shop_size,
            "shopSlotCount": shop_slots,
            "shopSlotCountMatchesFixed": shop_slots == fixed_count if area_index > 0 else None,
            "interactions": interactions,
        })

    non_bootstrap = areas[1:]
    summary = {
        "authoredAreaDescriptorCount": len(areas),
        "descriptorDeclaredFixedCount": sum(area["fixedInteractionCount"] for area in areas),
        "bootstrapDeclaredFixedCount": areas[0]["fixedInteractionCount"],
        "backedFixedInteractionCount": backed_interactions,
        "standardWorldAreaCount": sum(area["classification"] == "standard-world" for area in non_bootstrap),
        "standardWorldInteractionCount": standard_interactions,
        "specialOutdoorAreaCount": sum(area["classification"] == "special-outdoor" for area in non_bootstrap),
        "specialOutdoorInteractionCount": sum(area["fixedInteractionCount"] for area in non_bootstrap if area["classification"] == "special-outdoor"),
        "activeGeometryCount": sum(row["geometryStatus"] == "active-convex-quadrilateral" for area in areas for row in area["interactions"]),
        "sentinelInteractionCount": len(sentinel_interactions),
        "sentinelInteractions": sentinel_interactions,
        "allShopSlotCountsMatch": all(area["shopSlotCountMatchesFixed"] for area in non_bootstrap),
        "allDialogueCountsMatchFixedPlusOutdoor": all(area["dialogueCountMatchesFixedPlusOutdoor"] for area in non_bootstrap),
        "areaCoverage": [
            {
                "areaIndex": area["areaIndex"],
                "areaName": area["areaName"],
                "fieldNumber": area["fieldNumber"],
                "classification": area["classification"],
                "fixedInteractions": area["fixedInteractionCount"],
                "outdoorResidents": area["outdoorResidentCount"],
                "shopSlots": area["shopSlotCount"],
                "dialogueEntities": area["dialogueEntityCount"],
                "sentinelInteractions": sum(bool(row["sentinelCornerIndices"]) for row in area["interactions"]),
            }
            for area in non_bootstrap
        ],
    }
    return {
        "schemaVersion": 1,
        "sourceExecutableSha256": hashlib.sha256(executable_bytes).hexdigest(),
        "evidenceAddresses": {
            "areaDescriptorTable": AREA_DESCRIPTOR_TABLE,
            "interactionPointerTable": INTERACTION_POINTER_TABLE,
            "residentPointerTable": RESIDENT_POINTER_TABLE,
            "dialogueRoot": DIALOGUE_ROOT,
        },
        "summary": summary,
        "areas": areas,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, required=True)
    parser.add_argument("--disc-bin", type=Path, required=True)
    parser.add_argument("--json", dest="json_path", type=Path)
    args = parser.parse_args()
    census = build_census(args.executable, args.disc_bin)
    if args.json_path:
        args.json_path.parent.mkdir(parents=True, exist_ok=True)
        args.json_path.write_text(json.dumps(census, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    printable = {"sourceExecutableSha256": census["sourceExecutableSha256"], **census["summary"]}
    print(json.dumps(printable, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
