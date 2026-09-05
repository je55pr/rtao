#!/usr/bin/env python3
"""Dump selected PAL fixed-interior dialogue entities in one source session.

Usage:
  python3 dialogue_trace.py OUTPUT.json AREA:SLOT [AREA:SLOT ...]

The output preserves variant slots, executable addresses, raw bytes and token
order so action and pre-text opcodes with the same numeric value stay distinct.
"""

from __future__ import annotations

import argparse
import asyncio
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


def request(value: str) -> dict[str, int]:
    try:
        area, slot = (int(part, 0) for part in value.split(":", 1))
    except (TypeError, ValueError) as error:
        raise argparse.ArgumentTypeError("expected AREA:SLOT using decimal or 0x-prefixed integers") from error
    if area <= 0 or slot < 0:
        raise argparse.ArgumentTypeError("area must be positive and slot non-negative")
    return {"areaIndex": area, "slotIndex": slot}


async def run(output: Path, requests: list[dict[str, int]]) -> None:
    if not BUNDLE.is_file():
        raise SystemExit("Capture bundle is missing. Run `npm run build:capture` in web/ first.")
    for path in (CUE, BIN):
        if not path.is_file():
            raise SystemExit(f"PAL source is missing: {path}")
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless="headless-shell" in Path(BROWSER).name,
            executable_path=BROWSER,
            args=["--no-sandbox", "--ignore-gpu-blocklist", "--use-angle=gl"],
        )
        try:
            page = await browser.new_page(viewport={"width": 1200, "height": 900})
            page.set_default_timeout(180_000)
            await page.evaluate("document.body.innerHTML='<input id=files type=file multiple>'")
            await page.add_script_tag(content=BUNDLE.read_text())
            await page.set_input_files("#files", [str(CUE), str(BIN)])
            traces = await page.evaluate(
                """async (requests) => window.__rtaSandboxCapture.inspectShopInteriorDialogueEntities(
                    requests, Array.from(document.querySelector('#files').files))""",
                requests,
            )
        finally:
            await browser.close()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(traces, indent=2, ensure_ascii=False) + "\n")
    print(f"saved {len(traces)} dialogue entity trace(s) to {output}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("entities", nargs="+", type=request)
    args = parser.parse_args()
    asyncio.run(run(args.output, args.entities))


if __name__ == "__main__":
    main()
