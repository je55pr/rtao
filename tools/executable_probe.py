#!/usr/bin/env python3
"""Read one PAL executable virtual-address range through the browser source path.

Usage:
  python3 executable_probe.py ADDRESS LENGTH OUTPUT.bin
"""

from __future__ import annotations

import argparse
import asyncio
import os
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent
BUNDLE = ROOT / "web" / "sandbox-dist" / "rta-sandbox-capture.js"
GAME = Path(os.environ.get("RTA_GAME_DIR", "/mnt/data/rta_game_extract"))
CUE = GAME / "Road Trip Adventure (Europe) (En,Fr,De).cue"
BIN = GAME / "Road Trip Adventure (Europe) (En,Fr,De).bin"
BROWSER = os.environ.get("RTA_CHROMIUM_EXECUTABLE", "/usr/bin/chromium")


def integer(value: str) -> int:
    try:
        return int(value, 0)
    except ValueError as error:
        raise argparse.ArgumentTypeError("expected a decimal or 0x-prefixed integer") from error


async def run(address: int, length: int, output: Path) -> None:
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
            values = await page.evaluate(
                """async ([address, length]) => window.__rtaSandboxCapture.inspectExecutableVirtualBytes(
                    address, length, Array.from(document.querySelector('#files').files))""",
                [address, length],
            )
        finally:
            await browser.close()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(bytes(values))
    print(f"saved {len(values)} bytes from 0x{address:08x} to {output}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("address", type=integer)
    parser.add_argument("length", type=integer)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    asyncio.run(run(args.address, args.length, args.output))


if __name__ == "__main__":
    main()
