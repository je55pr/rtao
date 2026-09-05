# RTA native WHEEL.BIN geometry + wheel-paint completion — 2026-09-04

## Result

The canonical Three.js/TypeScript runtime now renders the player Q62's close-detail customizable wheels from the original PAL `CARS/WHEEL.BIN` bank and applies the executable's exact 12-step wheel-colour palette. The previous browser-only Mesh/Spoke ring-cap representation is retired whenever the native wheel bank is available.

The existing packed paint word remains authoritative and schema 8 is unchanged. Its low 24 bits continue to store the two native RGB444 body tones; its high byte is the native wheel-colour index.

## Native wheel-bank archaeology

The supplied PAL disc contains:

- `CAR2/Q62.BIN`: 217,248 bytes
- `CARS/TIRE.BIN`: 74,352 bytes
- `CARS/WHEEL.BIN`: 430,576 bytes
- `CARS/PARTS.BIN`: 172,992 bytes

`WHEEL.BIN` exposes sixteen model-section starts followed by EOF:

`80, 6480, 32448, 69760, 86656, 114880, 131904, 153184, 171216, 206944, 243504, 281504, 305520, 328688, 353264, 380320, EOF 430576`.

PAL renderer tracing establishes the close-wheel rule:

- native configuration byte `+6` is the wheel selector written by equipment category 7;
- section 0 is common authored wheel geometry and is drawn for every wheel;
- selector `n` draws `WHEEL.BIN` section `n + 1` in addition to section 0;
- the executable exposes selector values 0..14;
- therefore Normal `7:0` -> section 1, Mesh `7:1` -> section 2, and Spoke 1 `7:2` -> section 3;
- the close-detail WHEEL path and the TIRE fallback/LOD path are mutually exclusive in the PAL caller.

That last point fixes an inherited browser reconstruction mistake. The browser had been drawing the TIRE fallback assembly at close range and then placing customizable geometry behind it, which hid the native wheel face. When `WHEEL.BIN` is available, the close Q62 now uses the original wheel bank; `TIRE.BIN` remains the fallback/LOD source and remains available for compatibility.

## Native wheel colour

The Paint editor at `0x00258480` advances the live configuration wheel-colour byte and the packed paint word's high byte together. The purchase callback at `0x00258878` prices low-24-bit body changes and high-byte wheel changes independently.

The 12 RGB index triples at executable address `0x002a25b0`, decoded through the same native 16-step intensity table used by the paint system, are:

| Index | RGB |
| ---: | --- |
| 0 | `178,178,178` |
| 1 | `51,51,51` |
| 2 | `204,25,25` |
| 3 | `204,102,127` |
| 4 | `25,114,25` |
| 5 | `76,178,25` |
| 6 | `38,63,204` |
| 7 | `76,165,204` |
| 8 | `191,127,25` |
| 9 | `178,178,38` |
| 10 | `114,38,127` |
| 11 | `153,102,178` |

The renderer applies that colour only to the wheel primitives selected by the original colour-selection path; common/dark authored details are not replaced by a blanket material colour.

## Paint Shop transaction

The player-facing Paint Shop selector now contains the existing six RGB444 body channels plus the native wheel-colour row.

Native pricing is reproduced as:

- unchanged: 0 Cake;
- body only: 100 Cake;
- wheels only: 100 Cake;
- body + wheels: 200 Cake.

The combined purchase is atomic. If 200 Cake is required and the player has only 199, neither body nor wheel paint is committed. No save-schema change is required because the existing packed 32-bit paint word already carries both halves.

The historical `purchaseBodyPaint` helper remains for body-only archaeology/tests; live Paint Shop confirmation uses the complete combined transaction.

## Runtime integration

- `CARS/WHEEL.BIN` is part of new installed-game imports.
- Existing installs that predate this checkpoint can fall back to the older TIRE path if no cached wheel bank exists rather than failing to load.
- Outdoor Q62, Q's Factory/player previews, generic fixed-interior player Q62 and deterministic car-visual captures use the same native wheel-bank path.
- `car_visual_capture.py` now reads Q62 + WHEEL/TIRE assets and accepts the same packed paint word and native equipment-selector overrides used by the runtime.

Only executable-mapped wheel catalogue identities are exposed in the current player-facing Q's Factory bridge. The renderer can decode selectors 0..14, but this checkpoint does not invent names/ownership mappings for catalogue entries that have not yet been recovered.

## Deterministic PAL visual proof

Matched 1280x960 Peach/noon car-visual captures using the exact same camera, pose and scenery produce distinct original wheel frames:

| State | PNG bytes | SHA-256 |
| --- | ---: | --- |
| Normal Wheel `7:0`, palette 0 | 1,171,094 | `91ab3453368c88118c50fabdefaf64d20c8d5e3a746285397d86b1bb846be9fa` |
| Mesh Wheel `7:1`, palette 0 | 1,171,288 | `6edd492bbb2754e0920074c1f30dbdc30aa7256f344047fc4937aa68ffc48dd7` |
| Spoke 1 `7:2`, palette 0 | 1,171,220 | `307edd06c5d3f85c7ef04b9392578c0ee48ed093c197087ffa91f007fdc424da` |
| Mesh Wheel `7:1`, palette 2 red | 1,171,241 | `82727114564354dee7e0ac157e29e03ce31882c41e239f67c61e17f9fd71fb75` |

Visual inspection passed. Normal, Mesh and Spoke 1 show distinct authored wheel geometry; the red Mesh frame changes the native colour-selected wheel surfaces while retaining the same body/camera/scenery.

## Fixed-interior regression refresh

The fixed-interior player Q62 now uses the same native close-wheel geometry as production. This intentionally changes room PNG baselines containing the player car while leaving their dialogue/state behaviour unchanged.

All 27 named fixed-interior regression cases passed their existing dialogue/state assertions and repeated deterministic visual checks in controlled batches under Chrome 151 + SwiftShader. Representative refreshed frames include:

- Peach Bartender: 2,614,631 bytes, SHA-256 `4e4e92596690685514f8ec943138a7c6d92f8e4550752b1e457063ab51a34910`
- White Mountain Bunger: 2,815,827 bytes, SHA-256 `275a5ef30257914e31126ae235e007c9119d4bb70cbe7a110aec7c3e5c3b53b6`
- shared current Quick-Pic visible room frame: 1,938,350 bytes, SHA-256 `352fa4e49e38866f24cd7f32a0a1e38ab325389b5f4772b39061a7ab09d78227`

The seven raw Quick-Pic SHOP-slot family hashes remain separately asserted and unchanged; only the visible player-wheel rendering changed.

## Final validation

- `npm run check`: passed.
- Vitest: **28/28 files, 142/142 tests**.
- Vite production build: passed, 45 modules.
- Sandbox capture bundle: passed, 39 modules, 1,502.24 kB.
- Scenery-only PAL FLD/223 smoke frame remains exactly **1,568,898 bytes / 29,091 triangles / SHA-256 `8c8c7c92abe298a5b214784057b35eba0b4a6baa639b54d8667a640e553a20c9`**.
- No save-schema bump.

## Explicit boundaries / next evidence

This checkpoint does **not** begin Big Tyre implementation.

Sports Tyre and Off Road Tyre are not given invented 3D tread differences. Their native visual/material behaviour remains an open evidence question; shared geometry does not by itself prove whether a texture/material switch exists. Big Tyre `(1,11)` is separately known to participate in a special native configuration path (`0x0400`) and is the natural next tyre-specific archaeology target, but it is intentionally left untouched in this checkpoint.

Likewise, wheel selector decoding proves geometry selection, not complete native performance/handling effects for wheel/tyre catalogue items.
