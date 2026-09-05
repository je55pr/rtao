#!/usr/bin/env python3
"""Deterministic close-car visual captures for the RTA Three.js port.

Uses the lightweight sandbox capture bundle and reads only the requested field,
Q62, WHEEL/TIRE assets, and sky from an extracted PAL BIN/CUE. The first capture
prepares the stage once; subsequent matched angle/time captures reuse it.

Examples:
  xvfb-run -a python3 car_visual_capture.py day-set /tmp/car-day
  xvfb-run -a python3 car_visual_capture.py lighting-set /tmp/car-lighting --selector 7:1
  xvfb-run -a python3 car_visual_capture.py car-peach-night /tmp/night.png --paint 0x00b8f4af

State options:
  --selector CATEGORY:ITEM   Set a first-loadout native selector byte. Repeatable.
  --paint WORD              Native packed body/two-tone + wheel-colour paint word, decimal or 0x-prefixed.

Environment:
  RTA_GAME_DIR              Directory containing the extracted PAL CUE/BIN.
  RTA_CHROMIUM_EXECUTABLE   Chromium/Chrome executable. Defaults to /usr/bin/chromium.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import os
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
BUNDLE = WEB / "sandbox-dist" / "rta-sandbox-capture.js"
GAME = Path(os.environ.get("RTA_GAME_DIR", "/mnt/data/rta_game_extract"))
CUE = GAME / "Road Trip Adventure (Europe) (En,Fr,De).cue"
BIN = GAME / "Road Trip Adventure (Europe) (En,Fr,De).bin"

PRESET_GROUPS: dict[str, tuple[str, ...]] = {
    "day-set": ("car-peach-day", "car-peach-day-rear"),
    "lighting-set": (
        "car-peach-day",
        "car-peach-sunset",
        "car-peach-night",
        "car-peach-day-rear",
        "car-peach-sunset-rear",
        "car-peach-night-rear",
    ),
    "front-lighting": ("car-peach-day", "car-peach-sunset", "car-peach-night"),
    "rear-lighting": ("car-peach-day-rear", "car-peach-sunset-rear", "car-peach-night-rear"),
}


def require_inputs() -> str:
    if not BUNDLE.is_file():
        raise SystemExit(f"Missing {BUNDLE}. Run `npm run build:capture` in web/ first.")
    missing = [str(path) for path in (CUE, BIN) if not path.is_file()]
    if missing:
        raise SystemExit("PAL capture source is missing: " + ", ".join(missing))
    return BUNDLE.read_text()


def parse_int(value: str) -> int:
    try:
        return int(value, 0)
    except ValueError as error:
        raise argparse.ArgumentTypeError(f"invalid integer: {value}") from error


def parse_selector(value: str) -> tuple[int, int]:
    try:
        category_text, item_text = value.split(":", 1)
        category = int(category_text, 0)
        item = int(item_text, 0)
    except (ValueError, AttributeError) as error:
        raise argparse.ArgumentTypeError("selector must be CATEGORY:ITEM") from error
    if not 0 <= category < 15 or not 0 <= item <= 255:
        raise argparse.ArgumentTypeError("selector category must be 0..14 and item 0..255")
    return category, item


def state_payload(selectors: list[tuple[int, int]], paint: int | None) -> dict[str, object]:
    state: dict[str, object] = {}
    if selectors:
        values = [0] * 15
        for category, item in selectors:
            values[category] = item
        state["equipmentSelectors"] = values
    if paint is not None:
        state["paintWord"] = paint
    return state


def output_paths(target: str, scenes: tuple[str, ...]) -> list[Path]:
    target_path = Path(target)
    if len(scenes) == 1 and target_path.suffix.lower() == ".png":
        return [target_path]
    target_path.mkdir(parents=True, exist_ok=True)
    return [target_path / f"{scene}.png" for scene in scenes]


async def open_page(playwright, bundle: str):
    executable = os.environ.get("RTA_CHROMIUM_EXECUTABLE", "/usr/bin/chromium")
    browser = await playwright.chromium.launch(
        headless=False,
        executable_path=executable,
        args=["--no-sandbox", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    )
    page = await browser.new_page(viewport={"width": 1400, "height": 1100})
    page.set_default_timeout(900_000)
    await page.evaluate("document.body.innerHTML='<input id=files type=file multiple>'")
    await page.add_script_tag(content=bundle)
    await page.set_input_files("#files", [str(CUE), str(BIN)])
    return browser, page


async def capture(scenes: tuple[str, ...], outputs: list[Path], state: dict[str, object]) -> None:
    bundle = require_inputs()
    async with async_playwright() as playwright:
        browser, page = await open_page(playwright, bundle)
        try:
            info = await page.evaluate(
                """async ({scene, state}) => window.__rtaSandboxCapture.prepareCarVisualFromBrowserFiles(
                    scene, Array.from(document.querySelector('#files').files), state)""",
                {"scene": scenes[0], "state": state},
            )
            print(
                f"prepared: FLD/{info['fieldNumbers'][0]:03d}; {info['triangleCount']:,} triangles; "
                f"{info['sourceKind']}; {info['bootExecutable']}"
            )
            for scene, output in zip(scenes, outputs, strict=True):
                data_url = await page.evaluate(
                    """async ({scene, state}) => window.__rtaSandboxCapture.capturePreparedCarVisualDataUrl(scene, state)""",
                    {"scene": scene, "state": state},
                )
                png = base64.b64decode(data_url.split(",", 1)[1])
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_bytes(png)
                digest = hashlib.sha256(png).hexdigest()
                print(f"capture: {scene} -> {output} ({len(png):,} bytes; sha256 {digest})")
        finally:
            await page.evaluate("() => window.__rtaSandboxCapture.disposePreparedCarVisual()")
            await browser.close()


def args_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("preset", help="scene ID or preset group: " + ", ".join(PRESET_GROUPS))
    parser.add_argument("output", help="PNG path for one scene, or output directory for a group")
    parser.add_argument("--selector", action="append", default=[], type=parse_selector, metavar="CATEGORY:ITEM")
    parser.add_argument("--paint", type=parse_int, metavar="WORD")
    return parser


async def main() -> None:
    args = args_parser().parse_args()
    scenes = PRESET_GROUPS.get(args.preset, (args.preset,))
    outputs = output_paths(args.output, scenes)
    await capture(scenes, outputs, state_payload(args.selector, args.paint))


if __name__ == "__main__":
    asyncio.run(main())
