#!/usr/bin/env python3
"""Render a labelled contact sheet of every authored SHOP slot for one HG2 area.

This is a development helper only. It reads the user's local PAL BIN/CUE through
the browser capture bundle and never writes game assets into source.

Usage:
  xvfb-run -a python3 tools/shop_census.py 1 /tmp/peach-shop-slots.png
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import os
from pathlib import Path

from playwright.async_api import async_playwright

REPO_ROOT = Path(__file__).resolve().parent.parent
RTAO = REPO_ROOT / "rtao"
BUNDLE = RTAO / "sandbox-dist" / "rta-sandbox-capture.js"
DEFAULT_GAME = Path(os.environ.get("RTA_GAME_DIR", "/mnt/data/rta_game_extract"))
DEFAULT_CUE = DEFAULT_GAME / "Road Trip Adventure (Europe) (En,Fr,De).cue"
DEFAULT_BIN = DEFAULT_GAME / "Road Trip Adventure (Europe) (En,Fr,De).bin"


async def render(area_index: int, output: Path, cue: Path, bin_file: Path) -> None:
    if not BUNDLE.is_file():
        raise SystemExit("Capture bundle is missing. Run `npm run build:capture` in rtao/ first.")
    for path in (cue, bin_file):
        if not path.is_file():
            raise SystemExit(f"PAL source is missing: {path}")

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=False,
            executable_path=os.environ.get("RTA_CHROMIUM_EXECUTABLE", "/usr/bin/chromium"),
            args=["--no-sandbox", "--ignore-gpu-blocklist", "--use-angle=gl"],
        )
        try:
            page = await browser.new_page(viewport={"width": 1200, "height": 900})
            page.set_default_timeout(180_000)
            await page.evaluate("document.body.innerHTML='<input id=files type=file multiple>'")
            await page.add_script_tag(content=BUNDLE.read_text())
            await page.set_input_files("#files", [str(cue), str(bin_file)])
            data_url = await page.evaluate(
                """async area => window.__rtaSandboxCapture.captureShopPackageContactSheetDataUrl(
                    area, Array.from(document.querySelector('#files').files))""",
                area_index,
            )
            png = base64.b64decode(data_url.split(",", 1)[1])
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(png)
            print(f"saved {output} ({len(png):,} bytes)")
        finally:
            await browser.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("area_index", type=int)
    parser.add_argument("output", type=Path)
    parser.add_argument("--cue", type=Path, default=DEFAULT_CUE)
    parser.add_argument("--bin", dest="bin_file", type=Path, default=DEFAULT_BIN)
    args = parser.parse_args()
    asyncio.run(render(args.area_index, args.output, args.cue, args.bin_file))


if __name__ == "__main__":
    main()
