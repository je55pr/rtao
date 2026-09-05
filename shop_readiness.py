#!/usr/bin/env python3
"""Write a one-pass PAL fixed-interior dependency/readiness census.

The browser bundle reads the executable once and reports all mapped fixed
interactions. This helper persists the complete machine-readable JSON and a
compact Markdown table without compiling or traversing outdoor geometry.

Usage:
  python3 shop_readiness.py OUTPUT.json --markdown OUTPUT.md
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from collections import Counter, defaultdict
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent
BUNDLE = ROOT / "web" / "sandbox-dist" / "rta-sandbox-capture.js"
GAME = Path(os.environ.get("RTA_GAME_DIR", "/mnt/data/rta_game_extract"))
CUE = GAME / "Road Trip Adventure (Europe) (En,Fr,De).cue"
BIN = GAME / "Road Trip Adventure (Europe) (En,Fr,De).bin"
BROWSER = os.environ.get("RTA_CHROMIUM_EXECUTABLE", "/usr/bin/chromium")


def action_text(action: dict | None) -> str:
    if not action:
        return "—"
    operands = ", ".join(f"0x{value:02x}" for value in action["operands"])
    return f"`0x{action['opcode']:02x} [{operands}]`"


def classification(entry: dict) -> str:
    if entry.get("dialogueError"):
        return "decoder deferred"
    if entry.get("entryExternalAction"):
        return "entry host boundary"
    if entry.get("entryChoices"):
        return "entry choice"
    return "entry dialogue"


def indexed_inventory_text(entry: dict) -> str:
    values: list[str] = []
    for shape in entry.get("controlShapes") or []:
        operands = shape["operands"]
        if not operands or operands[0] != 15:
            continue
        if shape["opcode"] == 0x03 and len(operands) == 3:
            values.append(f"check {operands[1]}→{operands[2]:02d}")
        elif shape["opcode"] == 0x11 and len(operands) == 2:
            values.append(f"clear {operands[1]}")
    return ", ".join(f"`{value}`" for value in values) or "—"


def markdown(entries: list[dict]) -> str:
    classes = Counter(classification(entry) for entry in entries)
    areas: dict[int, list[dict]] = defaultdict(list)
    for entry in entries:
        areas[entry["areaIndex"]].append(entry)
    lines = [
        "# RTA fixed-interior dependency census — 2026-09-01",
        "",
        "Generated from the PAL executable in one source session. Classification",
        "describes the default entry boundary only; it does not claim that every",
        "quest/save consequence in later variants is implemented.",
        "",
        f"- Mapped interactions: **{len(entries)}** across **{len(areas)}** areas.",
        f"- Decoded entities: **{len(entries) - classes['decoder deferred']}**.",
        f"- Decoder-deferred entities: **{classes['decoder deferred']}**.",
        f"- Entry dialogue: **{classes['entry dialogue']}**; entry choices: **{classes['entry choice']}**; entry host boundaries: **{classes['entry host boundary']}**.",
        "",
    ]
    for area_index, area_entries in sorted(areas.items()):
        first = area_entries[0]
        lines.extend([
            f"## Area {area_index} · FLD/{first['fieldNumber']:03d} · {first['packagePath']}",
            "",
            "| Slot | Interaction → entity | Staff | Entry | Choices | Entry action | Inventory checks/clears | All action opcodes |",
            "| ---: | --- | ---: | --- | ---: | --- | --- | --- |",
        ])
        for entry in sorted(area_entries, key=lambda value: value["slotIndex"]):
            if entry.get("dialogueError"):
                entity = f"{entry['interactionName']} → **deferred**"
                entry_text = entry["dialogueError"].replace("|", "\\|")
                choices = "—"
                entry_action = "—"
                inventory = "—"
                actions = "—"
            else:
                entity = f"{entry['interactionName']} → {entry['entityName']}"
                pages = entry.get("entryPages") or []
                entry_text = f"slot {entry['entrySlot']:02d}; {len(pages)} page(s)"
                choices = str(len(entry.get("entryChoices") or []))
                entry_action = action_text(entry.get("entryExternalAction"))
                inventory = indexed_inventory_text(entry)
                opcodes = sorted({action["opcode"] for action in entry.get("actionShapes") or []})
                actions = ", ".join(f"`0x{opcode:02x}`" for opcode in opcodes) or "—"
            lines.append(
                f"| {entry['slotIndex']:02d} | {entity} | Q{entry['staffBodyId']:03d} | {entry_text} | {choices} | {entry_action} | {inventory} | {actions} |"
            )
        lines.append("")
    return "\n".join(lines)


async def run(json_output: Path, markdown_output: Path | None) -> None:
    if not BUNDLE.is_file():
        raise SystemExit("Capture bundle is missing. Run `npm run build:capture` in web/ first.")
    for path in (CUE, BIN):
        if not path.is_file():
            raise SystemExit(f"PAL source is missing: {path}")
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=False,
            executable_path=BROWSER,
            args=["--no-sandbox", "--ignore-gpu-blocklist", "--use-angle=gl"],
        )
        try:
            page = await browser.new_page(viewport={"width": 1200, "height": 900})
            page.set_default_timeout(180_000)
            await page.evaluate("document.body.innerHTML='<input id=files type=file multiple>'")
            await page.add_script_tag(content=BUNDLE.read_text())
            await page.set_input_files("#files", [str(CUE), str(BIN)])
            entries = await page.evaluate(
                """async () => window.__rtaSandboxCapture.inspectShopInteriorCensus(
                    Array.from(document.querySelector('#files').files))"""
            )
        finally:
            await browser.close()
    json_output.parent.mkdir(parents=True, exist_ok=True)
    json_output.write_text(json.dumps(entries, indent=2, ensure_ascii=False) + "\n")
    if markdown_output:
        markdown_output.parent.mkdir(parents=True, exist_ok=True)
        markdown_output.write_text(markdown(entries))
    counts = Counter(classification(entry) for entry in entries)
    print(f"saved {len(entries)} interactions: {dict(counts)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("--markdown", type=Path)
    args = parser.parse_args()
    asyncio.run(run(args.output, args.markdown))


if __name__ == "__main__":
    main()
