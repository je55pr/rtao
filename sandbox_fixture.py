#!/usr/bin/env python3
"""Low-memory deterministic outdoor capture fixture for the RTA web port.

Usage (Chromium/WebGL normally needs Xvfb in the sandbox):
  xvfb-run -a python3 sandbox_fixture.py refresh 223 113 220
  xvfb-run -a python3 sandbox_fixture.py capture peach-night-ground /tmp/peach.png

`refresh` is the only mode that opens the user's PAL BIN/CUE. It exports SORA.GSL
and one serialized RTAFLD mesh at a time into .dev-cache/capture-fixture.
`capture` uses only those small derived files and never opens the game disc.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import sys
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
BUNDLE = WEB / "sandbox-dist" / "rta-sandbox-capture.js"
FIXTURE = ROOT / ".dev-cache" / "capture-fixture"
GAME = Path(os.environ.get("RTA_GAME_DIR", "/mnt/data/rta_game_extract"))
CUE = GAME / "Road Trip Adventure (Europe) (En,Fr,De).cue"
BIN = GAME / "Road Trip Adventure (Europe) (En,Fr,De).bin"


def require_bundle() -> str:
    if not BUNDLE.is_file():
        raise SystemExit(f"Missing {BUNDLE}. Run `npm run build:capture` once after source changes.")
    return BUNDLE.read_text()


def require_pal_files() -> list[str]:
    missing = [str(path) for path in (CUE, BIN) if not path.is_file()]
    if missing:
        raise SystemExit("PAL capture source is missing: " + ", ".join(missing))
    return [str(CUE), str(BIN)]


def fixture_files() -> list[str]:
    required = [FIXTURE / "fixture.json", FIXTURE / "SORA.GSL"]
    if any(not path.is_file() for path in required):
        raise SystemExit("Development fixture is missing. Run `sandbox_fixture.py refresh ...` first.")
    meshes = sorted(FIXTURE.glob("field-*.mesh"))
    if not meshes:
        raise SystemExit("Development fixture contains no field meshes.")
    return [*(str(path) for path in required), *(str(path) for path in meshes)]


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
    return browser, page


async def refresh(fields: list[int]) -> None:
    unique_fields = sorted(set(fields))
    if not unique_fields:
        raise SystemExit("Refresh needs at least one field number.")
    bundle = require_bundle()
    pal_files = require_pal_files()
    FIXTURE.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as playwright:
        browser, page = await open_page(playwright, bundle)
        try:
            await page.set_input_files("#files", pal_files)
            source_info = await page.evaluate(
                """async () => window.__rtaSandboxCapture.prepareDevFixtureSourceFromBrowserFiles(
                    Array.from(document.querySelector('#files').files))"""
            )
            available = set(source_info["fieldNumbers"])
            missing = [field for field in unique_fields if field not in available]
            if missing:
                raise RuntimeError(f"PAL disc is missing requested standard fields: {missing}")

            async with page.expect_download() as pending:
                sky_info = await page.evaluate(
                    "async () => window.__rtaSandboxCapture.downloadPreparedDevFixtureSky()"
                )
            sky_download = await pending.value
            await sky_download.save_as(FIXTURE / sky_info["filename"])
            print(f"fixture: {sky_info['filename']} {sky_info['byteLength']:,} bytes")

            for field in unique_fields:
                async with page.expect_download() as pending:
                    info = await page.evaluate(
                        "async field => window.__rtaSandboxCapture.downloadPreparedDevFixtureField(field)",
                        field,
                    )
                download = await pending.value
                await download.save_as(FIXTURE / info["filename"])
                print(f"fixture: {info['filename']} {info['byteLength']:,} bytes")

            manifest = await page.evaluate(
                "fields => window.__rtaSandboxCapture.devFixtureManifest(fields)", unique_fields
            )
            (FIXTURE / "fixture.json").write_text(json.dumps(manifest, indent=2) + "\n")
            print(f"fixture: field cache v{manifest['compiledFieldCacheVersion']} / {manifest['compilerFingerprint'][:12]}…")
        finally:
            await page.evaluate("async () => window.__rtaSandboxCapture.disposePreparedDevFixtureSource()")
            await browser.close()


async def capture(scene: str, output: Path) -> None:
    bundle = require_bundle()
    files = fixture_files()
    output.parent.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as playwright:
        browser, page = await open_page(playwright, bundle)
        try:
            await page.set_input_files("#files", files)
            info = await page.evaluate(
                """async () => window.__rtaSandboxCapture.prepareOutdoorFromFixtureBrowserFiles(
                    Array.from(document.querySelector('#files').files))"""
            )
            data_url = await page.evaluate(
                "async scene => window.__rtaSandboxCapture.capturePreparedOutdoorDataUrl(scene)", scene
            )
            png = base64.b64decode(data_url.split(",", 1)[1])
            output.write_bytes(png)
            print(
                f"capture: {scene} -> {output} ({len(png):,} bytes; "
                f"{len(info['fieldNumbers'])} cached fields / {info['triangleCount']:,} triangles)"
            )
        finally:
            await page.evaluate("() => window.__rtaSandboxCapture.disposePreparedOutdoor()")
            await browser.close()


def parse_fields(values: list[str]) -> list[int]:
    try:
        return [int(value) for value in values]
    except ValueError as error:
        raise SystemExit("Field numbers must be integers.") from error


async def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    command = sys.argv[1].lower()
    if command == "refresh":
        await refresh(parse_fields(sys.argv[2:]))
        return
    if command == "capture" and len(sys.argv) == 4:
        await capture(sys.argv[2], Path(sys.argv[3]))
        return
    raise SystemExit(__doc__)


if __name__ == "__main__":
    asyncio.run(main())
