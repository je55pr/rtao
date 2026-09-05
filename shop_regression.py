#!/usr/bin/env python3
"""Run a small deterministic PAL fixed-interior regression suite.

Each named room is captured twice through the shared Three.js sandbox bundle,
must repeat byte-for-byte, and must match its verified SwiftShader baseline.
No outdoor field is compiled or traversed.

Usage:
  python3 shop_regression.py /tmp/rta-shop-regressions
  python3 shop_regression.py /tmp/rta-shop-regressions peach-bartender fuji-barkeeper
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import os
from dataclasses import dataclass
from pathlib import Path

from playwright.async_api import Page, async_playwright

ROOT = Path(__file__).resolve().parent
BUNDLE = ROOT / "web" / "sandbox-dist" / "rta-sandbox-capture.js"
GAME = Path(os.environ.get("RTA_GAME_DIR", "/mnt/data/rta_game_extract"))
CUE = GAME / "Road Trip Adventure (Europe) (En,Fr,De).cue"
BIN = GAME / "Road Trip Adventure (Europe) (En,Fr,De).bin"
BROWSER = os.environ.get("RTA_CHROMIUM_EXECUTABLE", "/usr/bin/chromium")


@dataclass(frozen=True)
class DialogueExpectation:
    entity_name: str
    current_slot: int
    choice_count: int
    external_action: tuple[int, tuple[int, ...]] | None = None
    variant_count: int | None = None
    action_shapes: tuple[tuple[int, tuple[int, ...]], ...] | None = None


@dataclass(frozen=True)
class DialoguePathExpectation:
    choices: tuple[int, ...]
    result: DialogueExpectation
    apply_external_action: bool = False
    remaining_indexed_flags: tuple[tuple[int, int], ...] = ()
    stamps: tuple[int, ...] = ()


@dataclass(frozen=True)
class DialogueStateExpectation:
    start_slot: int
    indexed_flags: tuple[tuple[int, int], ...]
    remaining_indexed_flags: tuple[tuple[int, int], ...]
    result: DialogueExpectation
    apply_external_action: bool = False
    stamps: tuple[int, ...] = ()
    initial_stamps: tuple[int, ...] = ()
    choices: tuple[int, ...] = ()
    quick_pic_photos: tuple[int, ...] = ()
    remaining_quick_pic_photos: tuple[int, ...] = ()
    met_fixed_interactions: tuple[tuple[int, int], ...] = ()


@dataclass(frozen=True)
class RegressionCase:
    area_index: int
    slot_index: int
    sha256: str
    dialogue: DialogueExpectation | None = None
    dialogue_path: DialoguePathExpectation | None = None
    dialogue_states: tuple[DialogueStateExpectation, ...] = ()
    shop_slot_sha256: str | None = None


def quick_pic_case(
    area_index: int,
    slot_index: int,
    photo_number: int,
    shop_slot_sha256: str,
    completion_probe: bool = False,
) -> RegressionCase:
    entity_name = f"Quick-Pic Shop No.{photo_number}"
    dialogue_states = [
        DialogueStateExpectation(
            start_slot=2, indexed_flags=(), remaining_indexed_flags=(),
            result=DialogueExpectation(entity_name, 2, 2),
        ),
        DialogueStateExpectation(
            start_slot=2, indexed_flags=(), remaining_indexed_flags=(),
            result=DialogueExpectation(entity_name, 3, 2),
            quick_pic_photos=(photo_number,), remaining_quick_pic_photos=(photo_number,),
        ),
        DialogueStateExpectation(
            start_slot=2, indexed_flags=(), remaining_indexed_flags=(),
            result=DialogueExpectation(entity_name, 4, 0, (0x11, (photo_number, 6))),
            apply_external_action=True, choices=(0,), remaining_quick_pic_photos=(photo_number,),
        ),
    ]
    if completion_probe:
        first_99 = tuple(value for value in range(1, 101) if value != photo_number)
        dialogue_states.append(DialogueStateExpectation(
            start_slot=4, indexed_flags=(), remaining_indexed_flags=(),
            result=DialogueExpectation(entity_name, 4, 0, (0x11, (photo_number, 6))),
            apply_external_action=True, stamps=(96,),
            quick_pic_photos=first_99, remaining_quick_pic_photos=tuple(range(1, 101)),
        ))
    return RegressionCase(
        area_index=area_index,
        slot_index=slot_index,
        sha256="352fa4e49e38866f24cd7f32a0a1e38ab325389b5f4772b39061a7ab09d78227",
        dialogue=DialogueExpectation(
            entity_name, 1, 0, (0x02, (0, 81)), variant_count=6,
            action_shapes=((0x01, (4, 5)), (0x02, (0, 81)), (0x05, (0, 0, 0)), (0x11, (photo_number, 6))),
        ),
        dialogue_states=tuple(dialogue_states),
        shop_slot_sha256=shop_slot_sha256,
    )


CASES = {
    "peach-bartender": RegressionCase(1, 4, "4e4e92596690685514f8ec943138a7c6d92f8e4550752b1e457063ab51a34910"),
    "fuji-barkeeper": RegressionCase(2, 4, "b589437631d2843fbf1644fb08d0996c1366ccae6c7cb12d33803f142aa6af9b"),
    "fuji-echigoya": RegressionCase(2, 6, "18b558116bf9cce09e6b1119dabba7f37fe435078167781abc2ec77de4c8306d"),
    "fuji-dumpling-shop": RegressionCase(2, 12, "bc2258953830dec918cbfce090329fd4214d2d60e971f049ab3193caa223377e"),
    "peach-jousset": RegressionCase(
        1, 11, "73f6f7eb56a2b16c3ffc0782df5512153a3a2ada7c3eceb84a8fb0cedd19b7b8",
        DialogueExpectation("Jousset", 2, 0),
        dialogue_states=(DialogueStateExpectation(
            1, ((15, 46),), (), DialogueExpectation("Jousset", 3, 0, (0x0d, (65,))), True, (65,), (), (), (), (), ((1, 11),),
        ),),
    ),
    "peach-fight": RegressionCase(
        1, 15, "a60b5a57bee9db3e80cff1405419c9ea55b6f6bb6e53c302fc120715eebfd6b8",
        DialogueExpectation("Fight", 7, 2),
        dialogue_states=(DialogueStateExpectation(
            1, ((15, 31),), ((0, 150),), DialogueExpectation("Fight", 8, 0, (0x07, (0, 150))), True, (), (), (), (), (), ((1, 15),),
        ),),
    ),
    "peach-grandpa-tal": RegressionCase(
        1, 13, "4425a85cb093c0fa4cc9525019421140f337e61713db875ded873529b9cb41a0",
        DialogueExpectation("Grandpa Tal", 1, 2),
    ),
    "peach-wolf": RegressionCase(
        1, 9, "9a99cc65dd622fbe3cc8c9bf3f40d64bc6443a0ce44ba89c917048eb74703a66",
        DialogueExpectation("Wolf", 1, 2),
        DialoguePathExpectation((1,), DialogueExpectation("Wolf", 6, 0, (0x08, (0,)))),
    ),
    "picarl": RegressionCase(
        14, 0, "71a63a374e2826445f7af497c1dcff18a5d197e0eab9e73713062bb97d48be19",
        DialogueExpectation("Picarl", 2, 0, variant_count=5, action_shapes=()),
    ),
    "peach-policeman": RegressionCase(
        1, 5, "8d51344fc56a4337619d4a9caa99904f210d4785bb0e6a9086ff942047bb38e7",
        DialogueExpectation(
            "Policeman", 6, 2, variant_count=9,
            action_shapes=((0x02, (0, 0)), (0x05, (0, 0, 0)), (0x07, (15, 24)), (0x0d, (5,))),
        ),
        dialogue_states=(DialogueStateExpectation(
            3, ((15, 23),), (), DialogueExpectation("Policeman", 4, 0, (0x0d, (5,))), True, (5,),
        ),),
    ),
    "peach-fm": RegressionCase(
        1, 6, "09e32f8442ebcb67831e0a69e4386fbf4773ed99e8bd1aa9968d5b9a75cf7976",
        DialogueExpectation(
            "Peach FM Front Desk", 1, 2, variant_count=7,
            action_shapes=((0x02, (0, 0)), (0x05, (0, 0, 0)), (0x07, (15, 11)), (0x0d, (3,))),
        ),
        dialogue_states=(DialogueStateExpectation(
            3, ((15, 24),), ((15, 11),), DialogueExpectation("Peach FM Front Desk", 4, 0, (0x07, (15, 11))), True,
        ),),
    ),
    "sandpolis-captain-rombo": RegressionCase(
        3, 5, "bf96fde988f32f2d9a5fc8695d2f4f1ef0b961973e990c84dd54e70f78dfa0c2",
        DialogueExpectation(
            "Captain Rombo", 2, 0, variant_count=5,
            action_shapes=((0x07, (15, 5)), (0x0d, (30,))),
        ),
    ),
    "sandpolis-shop-manager": RegressionCase(
        3, 13, "fd813dd6c6dfe7073414f68f8fc1347f6989b58d08a8ca410799d6cc0f27e012",
        DialogueExpectation("Shop Manager", 2, 2, variant_count=8, action_shapes=((0x07, (15, 39)),)),
        DialoguePathExpectation(
            (0,), DialogueExpectation("Shop Manager", 4, 0, (0x07, (15, 39))),
            apply_external_action=True, remaining_indexed_flags=((15, 39),),
        ),
        dialogue_states=(DialogueStateExpectation(
            1, ((15, 39),), ((15, 39),), DialogueExpectation("Shop Manager", 7, 0), False, (), (), (), (), (), ((3, 13),),
        ),),
    ),
    "sandpolis-mr-king": RegressionCase(
        3, 14, "962211d06fbd1874b9096d6fc45cf6410afc69b8aa5e39be17127df26e046a95",
        DialogueExpectation(
            "Mr.King", 2, 0, (0x03, (0,)), variant_count=5,
            action_shapes=((0x03, (0,)), (0x0d, (31,))),
        ),
        dialogue_states=(DialogueStateExpectation(
            3, ((15, 39),), (), DialogueExpectation("Mr.King", 4, 0, (0x0d, (31,))), True, (31,),
        ),),
    ),
    "white-mountain-bunger": RegressionCase(
        6, 15, "275a5ef30257914e31126ae235e007c9119d4bb70cbe7a110aec7c3e5c3b53b6",
        DialogueExpectation(
            "Bunger", 1, 0, variant_count=11,
            action_shapes=((0x01, (4, 8)), (0x01, (6, 8)), (0x10, (7, 8)), (0x10, (10, 0))),
        ),
    ),
    "white-mountain-lettar": RegressionCase(
        6, 9, "ff4e84db71e6b93e091cb77e70cbe5d946a6d6fb77953881ea0b3133cfef2623",
        DialogueExpectation(
            "Lettar", 2, 0, (0x03, (0,)), variant_count=18,
            action_shapes=(
                (0x01, (11, 15)), (0x01, (13, 15)), (0x03, (0,)),
                (0x07, (15, 46)), (0x07, (0, 33)),
                (0x10, (14, 15)), (0x10, (17, 0)), (0x11, (0, 0)),
            ),
        ),
        dialogue_states=(
            DialogueStateExpectation(
                3, (), ((15, 46),), DialogueExpectation("Lettar", 4, 0, (0x07, (15, 46))),
                True, (), (), (0,),
            ),
            DialogueStateExpectation(
                1, (), ((0, 33),), DialogueExpectation("Lettar", 7, 0, (0x07, (0, 33))),
                True, (65,), (65,), (), (), (), ((6, 9),),
            ),
        ),
    ),
    "white-mountain-emily": RegressionCase(
        6, 16, "8f2a16cb31b39cab44247125766a75be0ae7475ec9185571aef85a7bd184389b",
        DialogueExpectation(
            "Emily", 6, 2, variant_count=9,
            action_shapes=((0x02, (0, 0)), (0x07, (15, 41)), (0x0d, (64,))),
        ),
        dialogue_states=(
            DialogueStateExpectation(
                2, ((15, 42),), ((15, 41),), DialogueExpectation("Emily", 7, 0, (0x07, (15, 41))),
                True,
            ),
            DialogueStateExpectation(
                5, (), (), DialogueExpectation("Emily", 5, 0, (0x0d, (64,))), True, (64,),
            ),
            DialogueStateExpectation(
                1, (), (), DialogueExpectation("Emily", 9, 0), False, (64,), (64,), (), (), (), ((6, 16),),
            ),
        ),
    ),
    "mushroom-road-laz": RegressionCase(
        10, 0, "0ddc59987e8b0d40b1ab902d80e83db4817ccaf855993ac9ccefc9d0d622e27e",
        DialogueExpectation(
            "Laz", 6, 2, variant_count=13,
            action_shapes=((0x02, (0, 0)), (0x05, (22, 9, 8)), (0x07, (0, 0)), (0x07, (13, 7)), (0x0d, (97,))),
        ),
        dialogue_states=(DialogueStateExpectation(
            7, (), (), DialogueExpectation("Laz", 7, 0, (0x05, (22, 9, 8))),
        ),),
    ),
    "papaya-flower": RegressionCase(
        9, 16, "4e56eaafdc047f9ca6958a88379f622ba0782776aaed58033415592e3ef8bc78",
        DialogueExpectation(
            "Flower", 2, 0, (0x03, (0,)), variant_count=10,
            action_shapes=((0x03, (0,)), (0x05, (0, 0, 0)), (0x07, (15, 1)), (0x0d, (41,))),
        ),
        dialogue_states=(
            DialogueStateExpectation(
                3, ((15, 41),), ((15, 41),), DialogueExpectation("Flower", 4, 0, (0x05, (0, 0, 0))),
            ),
            DialogueStateExpectation(
                6, ((15, 41),), ((15, 1),), DialogueExpectation("Flower", 6, 0, (0x07, (15, 1))), True,
            ),
        ),
    ),
    "peach-quick-pic-1": RegressionCase(
        1, 18, "352fa4e49e38866f24cd7f32a0a1e38ab325389b5f4772b39061a7ab09d78227",
        DialogueExpectation(
            "Quick-Pic Shop No.1", 1, 0, (0x02, (0, 81)), variant_count=6,
            action_shapes=((0x01, (4, 5)), (0x02, (0, 81)), (0x05, (0, 0, 0)), (0x11, (1, 6))),
        ),
        dialogue_states=(
            DialogueStateExpectation(
                start_slot=2, indexed_flags=(), remaining_indexed_flags=(),
                result=DialogueExpectation("Quick-Pic Shop No.1", 2, 2),
            ),
            DialogueStateExpectation(
                start_slot=2, indexed_flags=(), remaining_indexed_flags=(),
                result=DialogueExpectation("Quick-Pic Shop No.1", 3, 2),
                quick_pic_photos=(1,), remaining_quick_pic_photos=(1,),
            ),
            DialogueStateExpectation(
                start_slot=2, indexed_flags=(), remaining_indexed_flags=(),
                result=DialogueExpectation("Quick-Pic Shop No.1", 4, 0, (0x11, (1, 6))),
                apply_external_action=True, choices=(0,), remaining_quick_pic_photos=(1,),
            ),
        ),
        shop_slot_sha256="b7f1294e64ed65950240c89b207c133e2290c2bf53f81badd68bd0368c0cc289",
    ),
    "peach-quick-pic-2": RegressionCase(
        1, 19, "352fa4e49e38866f24cd7f32a0a1e38ab325389b5f4772b39061a7ab09d78227",
        DialogueExpectation(
            "Quick-Pic Shop No.2", 1, 0, (0x02, (0, 81)), variant_count=6,
            action_shapes=((0x01, (4, 5)), (0x02, (0, 81)), (0x05, (0, 0, 0)), (0x11, (2, 6))),
        ),
        dialogue_states=(
            DialogueStateExpectation(
                start_slot=2, indexed_flags=(), remaining_indexed_flags=(),
                result=DialogueExpectation("Quick-Pic Shop No.2", 2, 2),
            ),
            DialogueStateExpectation(
                start_slot=2, indexed_flags=(), remaining_indexed_flags=(),
                result=DialogueExpectation("Quick-Pic Shop No.2", 3, 2),
                quick_pic_photos=(2,), remaining_quick_pic_photos=(2,),
            ),
            DialogueStateExpectation(
                start_slot=2, indexed_flags=(), remaining_indexed_flags=(),
                result=DialogueExpectation("Quick-Pic Shop No.2", 4, 0, (0x11, (2, 6))),
                apply_external_action=True, choices=(0,), remaining_quick_pic_photos=(2,),
            ),
        ),
        shop_slot_sha256="b7f1294e64ed65950240c89b207c133e2290c2bf53f81badd68bd0368c0cc289",
    ),
    "quick-pic-13-generic": quick_pic_case(11, 0, 13, "c88aa860c688c5240f18620e55648a4cd1b75f5747a48de7cd0ea3e87a2d1ec4"),
    "quick-pic-17-fuji": quick_pic_case(2, 19, 17, "e7b6dc0e680a5d079862220ba2c94f37e01843d47844e3ef0e0cadcb9f60a419"),
    "quick-pic-28-my-city": quick_pic_case(9, 21, 28, "12bfa6b6adc2ff66010103fb69cb0266620f230b5db86e33973e8aa32ef1a615"),
    "quick-pic-36-sandpolis": quick_pic_case(3, 21, 36, "e325ab10a267ab8bbc5ead36c8a92061e0c521e4c08904cbe04af943f8dee2ac"),
    "quick-pic-71-white-mountain": quick_pic_case(6, 20, 71, "e4d4260d4f787479aa5ab46cf7bab55ec41eff962afd627aabb2e1a4df94e2af"),
    "quick-pic-97-cloud-hill": quick_pic_case(
        8, 10, 97, "743f7c87570b1211a5f00d46eaa9a161283df4db0eeb7bbc6135869cb4c99943", completion_probe=True,
    ),

}


async def capture_room(page: Page, case: RegressionCase) -> bytes:
    data_url = await page.evaluate(
        """async ([area, slot]) => window.__rtaSandboxCapture.captureShopInteriorRoomDataUrl(
            area, slot, Array.from(document.querySelector('#files').files))""",
        [case.area_index, case.slot_index],
    )
    return base64.b64decode(data_url.split(",", 1)[1])


async def inspect_dialogue(
    page: Page,
    case: RegressionCase,
    choice_path: tuple[int, ...],
    state: DialogueStateExpectation | None = None,
    apply_external_action: bool = False,
) -> dict:
    initial_state = {"applyExternalAction": apply_external_action}
    if state is not None:
        initial_state.update({
            "startSlot": state.start_slot,
            "indexedFlags": [list(flag) for flag in state.indexed_flags],
            "stamps": list(state.initial_stamps),
            "quickPicPhotos": list(state.quick_pic_photos),
            "metFixedInteractions": [list(interaction) for interaction in state.met_fixed_interactions],
        })
    return await page.evaluate(
        """async ([area, slot, choices, state]) => window.__rtaSandboxCapture.inspectShopInteriorDialogue(
            area, slot, Array.from(document.querySelector('#files').files), choices, state)""",
        [case.area_index, case.slot_index, list(choice_path), initial_state],
    )


def assert_dialogue(name: str, label: str, actual: dict, expected: DialogueExpectation) -> None:
    observed_action = actual.get("externalAction")
    expected_action = None if expected.external_action is None else {
        "opcode": expected.external_action[0],
        "operands": list(expected.external_action[1]),
    }
    observed = (actual["entityName"], actual["currentSlot"], len(actual["choices"]), observed_action)
    wanted = (expected.entity_name, expected.current_slot, expected.choice_count, expected_action)
    if observed != wanted:
        raise RuntimeError(f"{name} {label}: expected dialogue boundary {wanted!r}, got {observed!r}")
    if expected.variant_count is not None and actual["variantCount"] != expected.variant_count:
        raise RuntimeError(f"{name} {label}: expected {expected.variant_count} variants, got {actual['variantCount']}")
    if expected.action_shapes is not None:
        observed_shapes = tuple((shape["opcode"], tuple(shape["operands"])) for shape in actual["actionShapes"])
        if observed_shapes != expected.action_shapes:
            raise RuntimeError(f"{name} {label}: expected action shapes {expected.action_shapes!r}, got {observed_shapes!r}")
    print(
        f"PASS {name} {label}: {actual['entityName']} slot {actual['currentSlot']}, "
        f"{len(actual['choices'])} choice(s), external action {observed_action}, "
        f"{actual['variantCount']} variant(s), {len(actual['actionShapes'])} action shape(s)"
    )


async def validate_dialogue(page: Page, name: str, case: RegressionCase) -> None:
    if case.dialogue is not None:
        assert_dialogue(name, "dialogue", await inspect_dialogue(page, case, ()), case.dialogue)
    if case.dialogue_path is not None:
        path = case.dialogue_path
        label = f"dialogue path {list(path.choices)}"
        actual = await inspect_dialogue(page, case, path.choices, apply_external_action=path.apply_external_action)
        assert_dialogue(name, label, actual, path.result)
        remaining = tuple(tuple(flag) for flag in actual["remainingIndexedFlags"])
        if remaining != path.remaining_indexed_flags:
            raise RuntimeError(f"{name} {label}: expected remaining indexed flags {path.remaining_indexed_flags!r}, got {remaining!r}")
        if path.apply_external_action:
            print(f"PASS {name} {label}: applied external action, remaining indexed flags {remaining}")
        stamps = tuple(actual["stamps"])
        if stamps != path.stamps:
            raise RuntimeError(f"{name} {label}: expected stamps {path.stamps!r}, got {stamps!r}")
    for state in case.dialogue_states:
        label = f"dialogue state slot {state.start_slot} flags {list(state.indexed_flags)}"
        actual = await inspect_dialogue(page, case, state.choices, state, state.apply_external_action)
        assert_dialogue(name, label, actual, state.result)
        remaining = tuple(tuple(flag) for flag in actual["remainingIndexedFlags"])
        if remaining != state.remaining_indexed_flags:
            raise RuntimeError(f"{name} {label}: expected remaining indexed flags {state.remaining_indexed_flags!r}, got {remaining!r}")
        stamps = tuple(actual["stamps"])
        if stamps != state.stamps:
            raise RuntimeError(f"{name} {label}: expected stamps {state.stamps!r}, got {stamps!r}")
        quick_pic_photos = tuple(actual["quickPicPhotos"])
        if quick_pic_photos != state.remaining_quick_pic_photos:
            raise RuntimeError(
                f"{name} {label}: expected Quick-Pic photos {state.remaining_quick_pic_photos!r}, got {quick_pic_photos!r}"
            )
        print(f"PASS {name} {label}: remaining indexed flags {remaining}, stamps {stamps}, Quick-Pic photos {quick_pic_photos}")


async def validate_shop_slot_hash(page: Page, name: str, case: RegressionCase) -> None:
    if case.shop_slot_sha256 is None:
        return
    data_url = await page.evaluate(
        """async ([area, slot]) => window.__rtaSandboxCapture.readShopInteriorSlotDataUrl(
            area, slot, Array.from(document.querySelector('#files').files))""",
        [case.area_index, case.slot_index],
    )
    slot_bytes = base64.b64decode(data_url.split(",", 1)[1])
    digest = hashlib.sha256(slot_bytes).hexdigest()
    if digest != case.shop_slot_sha256:
        raise RuntimeError(f"{name}: expected authored SHOP slot SHA-256 {case.shop_slot_sha256}, got {digest}")
    print(f"PASS {name}: authored SHOP slot SHA-256 {digest}")


def png_dimensions(png: bytes) -> tuple[int, int]:
    if len(png) < 24 or png[:8] != b"\x89PNG\r\n\x1a\n" or png[12:16] != b"IHDR":
        raise ValueError("capture is not a valid PNG with an IHDR chunk")
    return int.from_bytes(png[16:20], "big"), int.from_bytes(png[20:24], "big")


async def run(output_dir: Path, names: list[str]) -> None:
    if not BUNDLE.is_file():
        raise SystemExit("Capture bundle is missing. Run `npm run build:capture` in web/ first.")
    for path in (CUE, BIN):
        if not path.is_file():
            raise SystemExit(f"PAL source is missing: {path}")
    output_dir.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=False,
            executable_path=BROWSER,
            args=["--no-sandbox", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        )
        try:
            page = await browser.new_page(viewport={"width": 1400, "height": 1100})
            page.set_default_timeout(180_000)
            await page.evaluate("document.body.innerHTML='<input id=files type=file multiple>'")
            await page.add_script_tag(content=BUNDLE.read_text())
            await page.set_input_files("#files", [str(CUE), str(BIN)])
            for name in names:
                case = CASES[name]
                await validate_shop_slot_hash(page, name, case)
                await validate_dialogue(page, name, case)
                first = await capture_room(page, case)
                second = await capture_room(page, case)
                if first != second:
                    raise RuntimeError(f"{name}: repeated captures differ")
                dimensions = png_dimensions(first)
                if dimensions != (1280, 960):
                    raise RuntimeError(f"{name}: expected 1280x960, got {dimensions[0]}x{dimensions[1]}")
                digest = hashlib.sha256(first).hexdigest()
                output = output_dir / f"{name}.png"
                output.write_bytes(first)
                if digest != case.sha256:
                    raise RuntimeError(f"{name}: expected SHA-256 {case.sha256}, got {digest}")
                print(f"PASS {name}: {len(first):,} bytes, {dimensions[0]}x{dimensions[1]}, {digest}")
        finally:
            await browser.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("cases", nargs="*", choices=sorted(CASES))
    args = parser.parse_args()
    asyncio.run(run(args.output_dir, args.cases or list(CASES)))


if __name__ == "__main__":
    main()
