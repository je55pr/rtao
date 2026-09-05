#!/usr/bin/env python3
"""Render one authored SHOP slot through the shared web room composition.

Usage:
  xvfb-run -a python3 shop_room_capture.py 1 4 /tmp/bartender.png

`RTA_GAME_DIR` and `RTA_CHROMIUM_EXECUTABLE` override the normal Work paths.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent
BUNDLE = ROOT / "web" / "sandbox-dist" / "rta-sandbox-capture.js"
GAME = Path(os.environ.get("RTA_GAME_DIR", "/mnt/data/rta_game_extract"))
CUE = GAME / "Road Trip Adventure (Europe) (En,Fr,De).cue"
BIN = GAME / "Road Trip Adventure (Europe) (En,Fr,De).bin"
BROWSER = os.environ.get("RTA_CHROMIUM_EXECUTABLE", "/usr/bin/chromium")


async def capture(area_index: int, slot_index: int, output: Path, metadata_output: Path | None, dialogue_slot: int | None) -> None:
    if not BUNDLE.is_file():
        raise SystemExit("Capture bundle is missing. Run `npm run build:capture` in web/ first.")
    for path in (CUE, BIN):
        if not path.is_file():
            raise SystemExit(f"PAL source is missing: {path}")

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless="headless-shell" in Path(BROWSER).name,
            executable_path=BROWSER,
            args=["--no-sandbox", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        )
        try:
            page = await browser.new_page(viewport={"width": 1400, "height": 1100})
            page.set_default_timeout(180_000)
            await page.evaluate("document.body.innerHTML='<input id=files type=file multiple>'")
            await page.add_script_tag(content=BUNDLE.read_text())
            await page.set_input_files("#files", [str(CUE), str(BIN)])
            try:
                metadata = await page.evaluate(
                    """async ([area, slot, dialogueSlot]) => window.__rtaSandboxCapture.inspectShopInteriorDialogue(
                        area, slot, Array.from(document.querySelector('#files').files), [],
                        dialogueSlot === null ? {} : { startSlot: dialogueSlot })""",
                    [area_index, slot_index, dialogue_slot],
                )
            except Exception as error:
                metadata = {
                    "areaIndex": area_index,
                    "slotIndex": slot_index,
                    "dialogueDecodeError": str(error),
                }
            data_url = await page.evaluate(
                """async ([area, slot]) => window.__rtaSandboxCapture.captureShopInteriorRoomDataUrl(
                    area, slot, Array.from(document.querySelector('#files').files))""",
                [area_index, slot_index],
            )
            png = base64.b64decode(data_url.split(",", 1)[1])
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(png)
            if metadata_output is not None:
                metadata_output.parent.mkdir(parents=True, exist_ok=True)
                metadata_output.write_text(json.dumps(metadata, indent=2) + "\n")
            print(f"saved {output} ({len(png):,} bytes; 1280x960; area {area_index} slot {slot_index})")
            if "dialogueDecodeError" in metadata:
                print(f"dialogue metadata deferred: {metadata['dialogueDecodeError']}")
            else:
                action = metadata.get("externalAction")
                action_label = "none" if action is None else f"0x{action['opcode']:02x} {action['operands']}"
                print(
                    f"dialogue: {metadata['entityName']} entity {metadata['entityIndex']} "
                    f"slot {metadata['currentSlot']} / {len(metadata['choices'])} choices / action {action_label}"
                )
        finally:
            await browser.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("area_index", type=int)
    parser.add_argument("slot_index", type=int)
    parser.add_argument("output", type=Path)
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--dialogue-slot", type=lambda value: int(value, 0))
    args = parser.parse_args()
    if args.area_index <= 0 or args.slot_index < 0:
        parser.error("area_index must be positive and slot_index non-negative")
    asyncio.run(capture(args.area_index, args.slot_index, args.output, args.metadata, args.dialogue_slot))


if __name__ == "__main__":
    main()
