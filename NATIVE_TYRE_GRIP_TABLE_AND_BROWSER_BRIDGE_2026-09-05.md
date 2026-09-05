# RTA native tyre grip table + browser handling bridge — 2026-09-05

## Result

The PAL category-1 tyre catalogue's six 16-bit performance words are now recovered and wired into browser driving for the surface classes the browser can currently identify confidently. The older development-only Sports / Off Road / Big grip multipliers have been removed from `parts.ts`; native selector state is now authoritative for tyre grip.

This checkpoint does **not** claim that the browser arcade controller is an exact reconstruction of the PS2 vehicle physics. It uses the executable's selected tyre coefficients as **relative multipliers versus Normal Tyre on the same surface**, preserving the browser controller's existing overall scale while replacing invented tyre differences with native data.

## Ordinary tyre visual boundary

PAL driving renderer tracing establishes that all non-Big tyres share the same ordinary 3D render path:

- the caller tests configuration flag `0x0400`;
- Big Tyre takes the dedicated TIRE.BIN sections 4/5 branch;
- otherwise normal close renderer `0x00222370` reads configuration byte `+6` (wheel selector) and `+5` (wheel colour);
- it does **not** read category-1 tyre selector byte `+1`.

Therefore Sports, Racing, Wet, Off Road and Studless variants do not select different driving-model tyre geometry or textures. Distinct shop/UI art remains possible, but no 3D tread/material difference should be invented in the driving renderer.

## Native six-surface grip catalogue

Function `0x00218f70` reads configuration byte `+1`, selects the 28-byte native tyre record, and copies six consecutive 16-bit words from record offsets `+0x04..+0x0e` into car state. The six fields are:

1. Dry
2. Off-road
3. Wet
4. Grass
5. Snow
6. Ice

The recovered PAL values are:

| Selector | Tyre | Dry | Off-road | Wet | Grass | Snow | Ice |
|---:|---|---:|---:|---:|---:|---:|---:|
| 0 | Normal | 196 | 168 | 128 | 168 | 96 | 64 |
| 1 | Sports | 240 | 196 | 154 | 160 | 96 | 64 |
| 2 | Semi Racing | 333 | 168 | 154 | 140 | 80 | 64 |
| 3 | Racing | 512 | 102 | 102 | 100 | 51 | 64 |
| 4 | HG Racing | 512 | 160 | 102 | 128 | 51 | 64 |
| 5 | Wet | 240 | 196 | 196 | 160 | 128 | 64 |
| 6 | HG Wet | 240 | 196 | 240 | 160 | 128 | 64 |
| 7 | Off Road | 196 | 196 | 160 | 160 | 128 | 64 |
| 8 | HG Off Road | 240 | 240 | 160 | 180 | 168 | 128 |
| 9 | Studless | 196 | 196 | 160 | 168 | 168 | 196 |
| 10 | HG Studless | 240 | 196 | 160 | 168 | 196 | 196 |
| 11 | Big | 240 | 240 | 230 | 210 | 196 | 96 |
| 12 | Devil | 65280 | 65280 | 65280 | 65280 | 65280 | 65280 |

The values independently match the published Japanese HG2 technical parts table, but the browser implementation is grounded in the PAL executable table/consumer rather than the external page.

The same PAL copy function contains a separate 17/16 enhancement path for a teammate/player-state flag. That behaviour is not part of the player tyre selector bridge in this checkpoint.

## Browser handling bridge

`web/src/game/nativeTyrePerformance.ts` is the authoritative tyre table. It exposes:

- exact selector profiles 0..12;
- relative coefficient versus Normal on each native surface;
- a conservative mapping from current browser surface classification.

Current mapping:

- `paved-road` -> Dry ratio
- `dirt` -> Off-road ratio
- `grass` -> Grass ratio
- `other` -> neutral `1.0`

`other` intentionally does **not** guess Wet, Snow or Ice. Those native coefficients stay dormant until browser field collision/material data can distinguish those surfaces with evidence.

`ArcadeCarController` now has a native tyre selector independent of generic `PartPerformance`. `BrowserDrivingGame` exposes the same setter. The selector is applied:

- when driving starts from recovered equipment state;
- immediately after Q's Factory fitting/apply.

Q's Factory comparison stats now show Road / Dirt / Grass grip derived from the draft native tyre selector. This corrects the former provisional Sports/Off-Road descriptions and percentages.

## Important behavioural corrections

The native data disproves several old prototype assumptions:

- Sports is **not** worse off-road than Normal: 196 vs Normal 168.
- Off Road is **not** worse on dry road than Normal: both are 196.
- Off Road improves native off-road coefficient to 196 while retaining Normal dry coefficient.
- Big has strong native coefficients on Dry / Off-road / Wet / Grass / Snow, but unresolved browser surfaces remain neutral until classified.

## Validation

Full `npm run check` passed:

- Vitest: **29/29 files, 147/147 tests**.
- Vite production build: passed, 46 modules.
- Sandbox capture bundle: passed, 39 modules, 1,506.49 kB.

Focused deterministic driving regressions prove:

- Sports accelerates faster than Normal on a forced paved-road surface using the native Dry ratio;
- Off Road accelerates faster than Normal on forced dirt using the native Off-road ratio;
- Off Road and Normal are equal on a forced dry paved road;
- Big and Normal remain equal on unresolved `other`, proving Wet/Snow/Ice are not accidentally applied to unknown terrain.

No save-schema change is required. Tyre selector remains the recovered native equipment selector.

## Boundary / next work

The next high-value archaeology target is the PAL terrain/material selector that chooses among Dry / Off-road / Wet / Grass / Snow / Ice. The browser currently knows paved road, dirt, grass and unresolved other. Wet/Snow/Ice must not be activated until their field/material evidence is recovered.

Big's visual geometry and +0.85 chassis lift are already closed in `BIG_TYRE_NATIVE_VISUAL_AND_RIDE_HEIGHT_2026-09-05.md`. Big-specific weight, collision/climbing and any remaining handling consequences are still separate evidence-gated work.
