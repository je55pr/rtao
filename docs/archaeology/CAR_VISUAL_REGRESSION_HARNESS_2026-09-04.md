# RTA deterministic car visual regression harness — 2026-09-04

## Result

The canonical Three.js/TypeScript port now has a dedicated close-car visual regression path for testing the live Q62 under fixed camera, pose, time and outdoor scenery. It is intended for paint, wheels, tyres, headlights, wings, signs and other visible equipment changes where the existing scenery-only outdoor capture deliberately hides the player vehicle.

The harness uses the real `Q62CarModel` and native paint/equipment appearance bridge rather than a separately modelled comparison car. A capture temporarily places the car at a fixed Peach Town pose, applies the requested time/visibility, records the frame, and restores the original transform/parent/visibility and world lighting state afterward.

## Matched capture catalogue

All current car-visual scenes use PAL `FLD/223`, the same vehicle pose and 1280×960 output.

Front three-quarter:

- `car-peach-day` — 12:00
- `car-peach-sunset` — 17:30
- `car-peach-night` — 22:00

Rear three-quarter:

- `car-peach-day-rear` — 12:00
- `car-peach-sunset-rear` — 17:30
- `car-peach-night-rear` — 22:00

The front camera makes body paint, wheel face, tyres and headlights readable. The rear camera preserves the same staged pose while exposing rear bodywork, wheels and future wing/special-equipment representations.

Vitest locks each angle's camera and vehicle pose across its three lighting states so future capture changes cannot silently invalidate comparisons.

## Low-memory prepared path

`sandboxCaptureRunner.ts` now provides a prepared car-visual path:

- `prepareCarVisualFromBrowserFiles(...)`
- `capturePreparedCarVisualDataUrl(...)`
- `disposePreparedCarVisual()`

Preparation reads only:

- `SYS/SORA.GSL`
- requested `FLD/223.BIN`
- `CAR2/Q62.BIN`
- `CARS/TIRE.BIN`

It compiles one 29,091-triangle Peach field stage and retains the decoded car/tire source bytes. Subsequent matched captures can rebuild Q62 with a different native selector/paint state without reopening the 617 MB PAL BIN or restoring the complete 64-sector world.

The full application also accepts `car-visual` deterministic capture scenes, using the currently installed player's actual saved paint/equipment state.

## Command helper

`car_visual_capture.py` wraps the prepared browser path for routine development captures. It accepts a scene or a preset group plus optional first-loadout native selector and packed paint overrides.

Examples:

```bash
xvfb-run -a python3 car_visual_capture.py day-set /tmp/car-day
xvfb-run -a python3 car_visual_capture.py lighting-set /tmp/car-lighting --selector 7:1
xvfb-run -a python3 car_visual_capture.py car-peach-night /tmp/night.png --paint 0x00b8f4af
```

Preset groups include `day-set`, `front-lighting`, `rear-lighting` and `lighting-set`. `RTA_GAME_DIR` selects the extracted PAL BIN/CUE and `RTA_CHROMIUM_EXECUTABLE` can pin Chrome 151/SwiftShader.

## Equipment sensitivity finding and fix

The first Normal Wheel versus Mesh Wheel comparison produced byte-identical images even though the native selector changed correctly. The harness exposed that the older provisional mesh/spoke wheel cap was positioned inside the authored tyre geometry and was fully depth-hidden.

The provisional browser appearance bridge was corrected so non-normal wheel faces sit just outside the tyre face. Mesh/Spoke now use a thin ring/spoke/hub treatment rather than the initially tested solid cylinder. This makes selector changes observable while remaining explicitly provisional cosmetic geometry; it is **not** claimed as an exact reconstruction of the original PS2 wheel art.

Matched noon front captures now differ as expected:

- Normal Wheel: 1,178,812 bytes, SHA-256 `af3563e85c4e33d3a7e2af70c98f80a7cd75f5cb03132241e6a8500056f322e6`
- Mesh Wheel `(7,1)`: 1,176,293 bytes, SHA-256 `cc4800ec2ee7933a2432d81c8df13ce1a82b4f9d7f35e7e23047c89d6f634990`

The visible difference was inspected directly in the final frame.

## Lighting-set reference hashes — Mesh Wheel `(7,1)`

| Scene | PNG bytes | SHA-256 |
|---|---:|---|
| `car-peach-day` | 1,176,293 | `cc4800ec2ee7933a2432d81c8df13ce1a82b4f9d7f35e7e23047c89d6f634990` |
| `car-peach-sunset` | 1,211,643 | `b545106e759afe33766ba38c89d35846af94bee9e73dd1378f7b777dcc296404` |
| `car-peach-night` | 1,139,362 | `b6d01e33c58869e83c7f9ea8957e6940787e2d4a0507dcf10973dca2dadb0f83` |
| `car-peach-day-rear` | 1,130,052 | `219c862f314f122aba58237547f006bce38aef52dcf1db575e42fd93b99a0c2b` |
| `car-peach-sunset-rear` | 1,167,069 | `4d3d751904804cc61d2290c801f332bbe9184b0c54ddfe79edf92c98888491c4` |
| `car-peach-night-rear` | 1,074,992 | `d6d108dd836134e16b919b205632e20e10f073752af9b0990933f28d920ddd8f` |

Front/rear day and front night frames were visually inspected and give useful close views of the car rather than scenery-dominated screenshots.

## Paint sensitivity

Packed native paint word `0x00b8f4af` was captured with otherwise identical normal-wheel state:

- noon: 1,178,616 bytes, SHA-256 `bf92bf53205effcb79589f19e759d7b62d10de235f4f5368d9bd7a8d6e0589a8`
- 22:00: 1,141,388 bytes, SHA-256 `73f329b404d65ce4dbe6dd1f6dc17e29528061f705cce746f67d086e942d5b48`

Visual inspection clearly shows the native two-tone body-paint change while camera, car pose and world scenery remain fixed.

## Validation

- Full web gate: **28/28 test files, 137/137 tests passed**.
- Vite production build: passed (45 modules).
- Sandbox capture bundle: passed (39 modules; 1,494.82 kB).
- Prepared car stage: PAL `SLES_513.56`, `FLD/223`, 29,091 triangles.
- All six matched Mesh Wheel lighting/angle captures completed; the long six-shot shell invocation hit the external command ceiling after five, and the sixth night-rear scene passed immediately as a separate one-scene invocation.
- Existing scenery-only FLD/223 fixture rebuilt to 6,514,849 bytes and `peach-day-ground` remains exactly 1,568,898 bytes / 29,091 triangles / SHA-256 `8c8c7c92abe298a5b214784057b35eba0b4a6baa639b54d8667a640e553a20c9`.

## Superseded provisional wheel representation

The provisional Mesh/Spoke ring/spoke/hub bridge described above was superseded later on 2026-09-04 by the executable-proven `CARS/WHEEL.BIN` close-detail path. Current canonical captures use original wheel sections and the native 12-step wheel-colour palette. See `NATIVE_WHEEL_BANK_AND_WHEEL_PAINT_2026-09-04.md`. Historical hashes in this note remain evidence for the harness milestone itself, not current wheel artwork.

## Boundary

This harness establishes deterministic **browser visual regression**, not exact native appearance for every part. Native ownership/selectors and recovered paint words remain the authoritative state where proven; provisional browser geometry/handling representations must continue to be labelled as such until original per-part rendering/performance data is reconstructed.
