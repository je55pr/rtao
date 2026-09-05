#!/usr/bin/env python3
"""Compile every executable-referenced ordinary PAL race course and save evidence.

Usage:
  python3 race_course_probe.py OUTPUT.json

The browser capture bundle reads the user's BIN/CUE directly. Course IDs come
from the PAL executable catalogue rather than from a handwritten list.
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


async def run(output: Path) -> None:
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
            page.set_default_timeout(900_000)
            await page.evaluate("document.body.innerHTML='<input id=files type=file multiple>'")
            await page.add_script_tag(content=BUNDLE.read_text())
            await page.set_input_files("#files", [str(CUE), str(BIN)])
            catalogue = await page.evaluate(
                """async () => window.__rtaSandboxCapture.inspectRaceCatalogue(
                    Array.from(document.querySelector('#files').files))"""
            )
            course_ids = sorted(
                {activity["sceneId"] for activity in catalogue["activities"] if activity["ordinaryRace"]}
            )
            courses = []
            for index, course_id in enumerate(course_ids, start=1):
                summary = await page.evaluate(
                    """async courseId => window.__rtaSandboxCapture.inspectRaceCourse(
                        courseId, Array.from(document.querySelector('#files').files))""",
                    course_id,
                )
                courses.append(summary)
                print(
                    f"course {index:02}/{len(course_ids):02} C{course_id:02}: "
                    f"{summary['triangleCount']:,} render / "
                    f"{summary['collisionTriangleCount']:,} collision triangles"
                )
        finally:
            await browser.close()

    evidence = {
        "bootExecutable": "SLES_513.56",
        "ordinaryRaceCount": sum(1 for activity in catalogue["activities"] if activity["ordinaryRace"]),
        "courseIds": course_ids,
        "startAnchors": catalogue["startAnchors"],
        "finishGates": catalogue["finishGates"],
        "courses": courses,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(evidence, indent=2) + "\n")
    print(f"saved {len(courses)} course summaries to {output}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    asyncio.run(run(args.output))


if __name__ == "__main__":
    main()
