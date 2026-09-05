# Road Trip Adventure clean-room reimplementation

Clean-room reimplementation experiments for the European PS2 release of **Road Trip Adventure / ChoroQ HG 2**.

This repository intentionally contains **no original game assets**. Supply your own PAL BIN/CUE, cooked ISO, or extracted disc directory at runtime.

## Browser port — parallel vertical slice

The new `web/` project is a browser-native Three.js and TypeScript port developed alongside the intact C# reference implementation. It currently provides:

- local drag/drop or file-picker import for a cooked ISO, a ZIP containing an ISO, or a ZIP containing the PAL MODE2/2352 BIN and CUE;
- client-only ISO9660/CUE/sector processing in a Web Worker, with no game-file upload or server processing;
- contiguous MODE2/BIN reads that project raw sectors in memory instead of issuing one browser-storage operation per 2,352-byte sector;
- PAL `SLES_513.56` validation and the same 64-standard-sector invariant used by the C# runtime;
- a versioned, atomic OPFS installation containing only the current runtime's required game files and compiled results, restored on reload without choosing or processing the source again;
- an executable-derived catalogue of all 39 PAL activities and exact 24-race
  boundary, including resident participants, 12 selector ranges and all fifteen
  ordinary `COURSE/C00.BIN`–`C14.BIN` packages compiled/cached through the
  production geometry and collision path;
- native ordinary-race Cake rewards, 24 best-finish bytes and C → B → A →
  Super A top-six promotion in recovered save schema 10, plus the 15 exact
  three-strip finish lines and ordered three-lap crossing state; the live start
  grid, wider course navigation and AI loop remains evidence-gated;
- TypeScript ports of the HG2 field header/chunk, DMA/VIF mesh, GIF image-transfer, GS local-memory, indexed texture/CLUT and STQ paths;
- a textured Three.js persistent world for all 64 ordinary FLDs, with vertex colours, alpha-tested materials, culling batches, camera-facing global billboards, exact two-axis toroidal placement, and named landmark focus views;
- cached original collision surfaces plus a fixed-step playable Q62 using the real body, close-detail WHEEL.BIN wheel bank and TIRE.BIN fallback/LOD assets, four-contact ground attitude, steering/wheel animation and a chase camera that crosses FLD seams without reloading the world.
- executable-derived persistent traffic using all 70 original resident bodies/paints, 69 moving routes and 235 fixed interaction zones;
- non-blocking resident-car streaming: the world and driving controls become usable first, Peach cars are prioritised, and the rest attach progressively in the background;
- authored road-ribbon plus native collision-packet surface classification for
  paved road, Dry, Off-road, Wet, Grass, Snow and Ice tyre coefficients;
- the disc-authored daytime SORA sky plus phase-aware PAL dialogue decoding and pause-safe `E` greetings for Peach Town's six roaming residents.
- a reference-calibrated Three.js Q's Factory scene decoded from `SHOP/T00.BIN`, with live original car meshes, the executable-defined menu, fixed-zone entry and exact outdoor-state resume.
- a reusable generic fixed-SHOP runtime for all 235 executable-mapped slots: the
  correct area/slot room, live player plus executable-selected staff body/paint,
  same-index original dialogue entity when decoded, yes/no/menu flow, safe
  host-action boundaries, and exact outdoor-state resume;
- executable-proven indexed quest progress shared across fixed interiors and
  saved in the current browser install; Sandpolis Shop Manager can grant the
  original football and Mr. King can consume it after a room change or reload;
- executable-proven single/paired stamp awards persisted in the same narrow
  recovered-progress schema; wallet, football and birthday-gift quests now
  retain their original stamp rewards;
- executable-proven action-`0x15` equipment fitting plus schema-7 persistence
  for all three native fifteen-byte selector blocks; direct shop purchase stays
  separate because its native paths do not write equipped configuration;
- a verified native-catalogue bridge for confidently mapped parts, including
  exact Options 0–8 and visible Peach/Fuji/Sandpolis/White/Papaya sign rewards;
- an evidence-backed Peach Parts Shop catalogue with original local stock,
  native indexed ownership coordinates and Cake prices; direct purchases are
  transactional and persistent with the original five-copy equipment capacity,
  while teammate trade and full native-selector catalogue mapping remain
  evidence-gated;
- an evidence-backed Cloud Hill Second-hand loop for the exact mapped part
  subset: authored action `0x13 [3]` removes one owned copy, credits half the PAL
  base price rounded down, preserves the fitted selector and persists through
  schema 10. Roulette's exact stake, physical angle-to-pocket result, 23-bet
  matcher and payout math are locked in tests, while its `ACTION/A19.BIN` scene
  and car/wheel simulation remain intentionally gated;
- evidence-backed Peach Town and Fuji City Body Shop catalogues with 20 and 22
  original local bodies respectively, 500-Cake prices, live decoded-body
  preview, transactional persistent purchase, authored dialogue return and
  clean outdoor-state restore; purchase correctly remains separate from equip;
- a transactional Peach Paint Shop selector using the original body/two-tone
  RGB444 channels plus the exact 12-step native wheel-colour palette. Body and
  wheel changes cost 100 Cake independently (200 when both change), preview
  live, and persist in the same packed schema-10 save's paint word; teammate paint
  remains evidence-gated;
- generic Quick-Pic 1–100 state using executable-proven photo-state opcodes,
  explicit keep/retake handling, schema-10 persistence and native Stamp 96
  completion; deterministic room coverage spans all seven authored SHOP-slot
  families, including direct Cloud Hill No.97 room/state validation;
- targeted `SHOP/Txx.BIN` census and 1280x960 single-room capture helpers that do
  not compile or traverse the outdoor world;
- an ownership-gated Q's Factory Change Parts loop backed by recovered native
  selectors. All nine reconstructed Peach Parts Shop stock items have native
  fitting identities; direct purchase remains separate from equip, selectors
  persist through schema 10, and only evidence-backed catalogue entries are
  exposed as native choices;
- executable-exact Engine acceleration scalars, Steering multipliers, all four
  Brake 32-update hold curves, Chassis inverse-mass response, and Transmission
  launch/terminal gear endpoints connected to live driving; intermediate PAL
  shift timing remains evidence-gated;
- the complete five-sign advertising loop: successful travelled distance accrues
  only for fitted native sign selectors, sponsor action `0x16` redeems complete
  1,000-unit blocks at the authored 10/20/30/40/50 Cake rates, preserves the
  remainder, and persists all five counters in recovered save schema 10;
- deterministic close-car visual captures at fixed Peach front/rear cameras for
  noon, sunset and 22:00. `car_visual_capture.py` reuses one FLD/223 stage and
  accepts native selector/paint overrides; native wheel selectors now render the
  original WHEEL.BIN sections and the packed paint high byte supplies their
  original 12-step colour palette.

Run it with:

```bash
cd web
npm install
npm run dev
```

`npm run check` runs the browser-port regressions, strict TypeScript compilation and the production build. See [`docs/WEB_PORT.md`](docs/WEB_PORT.md) for the architecture, storage contract, supported inputs and current parity boundary.

## Current milestone

The current vertical slice boots directly from the original disc and is already playable as a debug reconstruction of Peach Town:

1. Open the original MODE2/2352 BIN/CUE directly and validate `SLES_513.56`.
2. Decode `FLD/223.BIN` field textures, ordinary/global meshes, billboard sprites, minimap roads and collision data.
3. Render Peach Town in MonoGame DesktopGL with original textures, vertex colours, material state, filtering and camera-facing trees.
4. Decode Peach Town's authored road geometry/materials directly; the earlier minimap-derived visual road overlay has now been retired because it could invent lane-count transitions absent from the original game.
5. Decode the reference starter body `CAR2/Q62.BIN`, the original close-detail customizable wheel bank from `CARS/WHEEL.BIN`, and the separate `CARS/TIRE.BIN` fallback/LOD path. Big Tyre `(1,11)` now uses the PAL-only `0x0400` branch with original oversized TIRE sections 4/5 and the recovered +0.85 body lift.
6. Animate front steering and wheel spin using the authored front/rear wheel centres and radii preserved by the four-wheel LOD.
7. Follow the original 2.5D collision surface with a four-point footprint check and orient the chassis from four ground contacts.
8. Use authored minimap road ribbons first, then the collision packet's native
   low-nibble Dry/Off-road/Wet/Grass/Snow/Ice selector for driving-surface
   classification while leaving visual road widths/markings to original field
   geometry.
9. Apply the selected tyre record's native surface coefficient as a ratio to
   Normal Tyres while keeping the established browser controller baseline.
10. Decode the PAL executable's actual per-resident overworld route assignments and spawn positions for James, Klien, Barthou, Pillow, Kevin and Newman; render their exact body IDs/paint and run them on those original routes, including intentional off-road excursions.
11. Add a forgiving proximity interaction (`E`) instead of requiring the original crash-to-talk behaviour. The player must be within roughly 1.75 m beyond both cars' body radii and below about 20 km/h.
12. Decode Peach Town's English dialogue hierarchy and load James's original generic peach-tree greeting from `SLES_513.56`.
13. Add a data-driven dialogue state machine supporting text, choices, condition checks and flag writes. Entering dialogue globally pauses player/traffic/world simulation and resumes every car from its preserved route state on exit.
14. Decode all 28 fixed Peach Town overworld interaction polygons from the PAL executable. These map index-for-index to Q's Factory, shops, houses/activities, the cave entrance and ten Quick-Pic locations.
15. Add a forgiving fixed-interaction prompt (`E ENTER ...`) using the original polygon plus a 2 m proximity margin instead of requiring the player to hit the trigger perfectly.
16. Decode `SHOP/T00.BIN` as 28 fixed `0x3F000` interaction slots. Each Peach slot begins with an authored 640×384 PSMT8 backdrop plus PSMCT32 palette; slot 0 is Q's Factory.
17. Enter Q's Factory directly from its real overworld trigger, render the original disc-supplied backdrop, freeze the overworld while inside, and return to the exact preserved world state with `Escape`.
18. Render runtime-built dialogue/prompt/debug text without redistributing font/game assets.
19. Trace the PAL dialogue/control VM as two phase-sensitive dispatchers: a pre-text condition/state VM and a post-text action VM. Preserve raw operands so NUL and printable bytes used as parameters are never mistaken for text.
20. Use `dialogue_trace.py` for ordered entity streams, `executable_probe.py` for bounded PAL virtual ranges, and `mips_probe.py` for compact control-flow disassembly. Indexed quest state uses pre-text `0x03` to branch and `0x11` to clear; namespace 15 is inventory.
20. Decode Q's Factory's 72 English dialogue/control streams, including its original variable-length menus, Yes/No targets, race-selection handoff, Save Data handoff, race-start action, rally state controls and World Grand Prix progression gates.
21. Add an engine-neutral dialogue-flow executor which follows decoded branch/flag/menu/Yes-No behavior while exposing still-external systems such as parts selection, race selection, saving and race launch explicitly rather than inventing them.
22. Run Q's Factory's real slot-04 menu in MonoGame on top of the original authored backdrop. The five labels and destination slots come directly from `SLES_513.56`; selecting `Drive around town` follows the original target to `Come again!` and resumes the preserved overworld.
23. Decode the ordinary outdoor topology as all 64 `FLD/000`–`FLD/333` sectors. The three base-4 filename digits map to an 8×8 canonical HG2 source grid whose odd rows are shifted +800 units and whose X axis is cyclic over 12,800 units. Canonical topology, reflected MonoGame render coordinates and fixed cartographic/debug-map unwrapping are now represented separately so renderer handedness or camera-relative wrapping cannot silently mirror/re-cut the world map.
24. Replace the single-Peach field lifetime with a persistent world runtime: all 64 outdoor FLDs are decoded once from the disc and kept resident, while rendering selects nearby sectors independently from simulation. A current PAL-disc scan contains 926,602 decoded field triangles, of which 926,478 belong to the daytime render after excluding the 124 bridge-light triangles authored for night.
25. Generalize executable outdoor residents and fixed interactions across the standard world. Seventy standard-world outdoor actor definitions (69 ordinary moving routes) now simulate continuously, and 235 fixed interaction polygons remain attached to their resident sectors even when no player is nearby.
26. Make driving collision/surface sampling topology-aware. A car footprint can straddle two FLDs, sample each sector's original collision data and commit the new sector without recreating the car. A deterministic authored-road test crosses Peach `223` → `222` at ~23.5 m/s without losing speed.
27. Render sectors in a shared staggered world frame. `F3` can spectate Peach/Fuji/White Mountain/Papaya while the player remains elsewhere, and `F4` expands the render candidate set to all 64 resident FLDs for extreme draw-distance/world-overview experiments.
28. Restore the field renderer's spatial awareness for modern performance: static geometry is batched by HG2's original 8×8 chunks, billboards are spatially bucketed, sector/chunk/billboard/car bounds are camera-frustum culled, and persistent remote residents keep advancing their original routes without paying for fine terrain grounding until a player/observer is nearby. The runtime prints once-per-second FPS/draw-call/update/submit diagnostics to the console.
29. Reconstruct ordered PS2 GS image transfers into scratch 4 MiB local memory during field loading and resolve each material from its declared `TEX0` surface. This preserves real HG2 local-memory aliasing/composition; Chestnut Canyon `FLD/103` contains a proven 64×128 PSMT4 texture whose base upload is only 64×78 and whose lower rows are completed by later transfers.
30. Use HG2's authored STQ directly in the runtime field renderer (`U=S/Q`, `V=T/Q`) for both ordinary `MSCALF 8` geometry and `MSCALF 6` billboards. The Police facade atlas regression locks down the original text/stone half selection and prevents OBJ-style U/V flips from returning.

31. Preserve HG2's separate daytime and nighttime vertex-colour channels without globally discarding day-black geometry. FLD/113 contains 100 untextured primitives whose DayColor is black and NightColor is warm/non-zero; later HumanEyes comparisons showed that some are useful black daytime interior/backing volumes (for example Fuji shop doorways) while other facade layers naturally occlude them. The decoder therefore classifies and retains them. Separately, FLD/220 contains 62 camera-facing bridge glow billboards with a unique bright-night/dim-day signature; original day/night bridge captures confirm those sprites are hidden in daytime, so the current daytime renderer omits only that billboard family while retaining all night data.
32. Render alpha-bearing field textures after opaque geometry with a real alpha test (`alpha > 0`) rather than letting transparent texels write invisible occluders. Alpha-bearing field textures are also uploaded with premultiplied RGB and rendered with premultiplied blending, preventing hidden RGB in transparent palette entries from bleeding through bilinear filtering as white/cyan tree and bunting fringes. This closes the reproducible FLD/221 `X193 Z1443` grass/ocean hole while keeping visible foliage/card texels depth-writing.
33. Stabilize Fuji's layered facades without broad polygon-offset hacks: HG2's global static backing layer is submitted before spatial cutout/detail chunks, and only renderer-indistinguishable repeated static triangles inside the same chunk/material/TME batch are suppressed. FLD/113 has exactly 100 such sub-millimetre repeats; the regression locks that narrow class down.
34. Decode FLD/221's missing palm crowns from the real dynamic-object path. Extra[1] contains six radial frond primitives split 1+2+3 across MSCALF-4 groups (with MSCALF-10 counterparts); six authored trunk-top caps provide placement and hidden TBP 11762 supplies the PSMT8 frond material. The crowns now render on the real trunks with a gentle phase-shifted wind sway; geometry/placement are authored, while exact original wind timing remains future VU archaeology.
35. Generalize palm crown placement across FLD/220's authored trunk variants. HumanEyes exposed that the original 55-marker detector only accepted zero-thickness untextured caps; FLD/220 also uses shallow ~5 cm bevelled caps and caps that leave TME enabled. Structural cap-family detection now recovers 106 authored crown markers without field/TBP special-casing.
36. Decode and render HG2's shared outdoor sky package (`SYS/SORA.GSL`). Its inline GS DMA stream contains the authored 512x96 daytime blue/cloud/horizon panorama plus a separate transparent 1024x128 star/moon night overlay. The daytime asset now renders on a camera-centred upper hemisphere with horizontal wrap and a clamped horizon; the night overlay is decoded and regression-covered but deliberately held for the future time-of-day renderer.
37. Make the old 100 m `DebugGrid` opt-in (`--debug-grid`) instead of drawing it over the authored ocean every frame. The black lattice seen across FLD/221/220 water was a legacy geometry-viewer aid, not HG2 sea geometry.
38. Finish the Peach-to-Fuji daytime cleanup pass: alpha-weighted filtering removes transparent-edge halos from tree/bunting cards; the 62 FLD/220 bridge corona/lamp billboards are retained for night but hidden during the current daytime renderer; and Fuji's authored day-black/night-lit static geometry is no longer blanket-suppressed, restoring the original black shop-door/interior backing while keeping the previously fixed facade/window composition stable.
39. Reconstruct the PAL high-detail car `MSCALF 4` colour path from VU1 microcode. Car bodies now use the original two fixed light directions, camera-dependent Blinn half-vector, eighth-power authored highlight parameter, stable daylight intensity and exact zero/odd/even paint-selection rule. Q28's authored hazard stripes remain unpainted, while outdoor and factory cars gain the original faceted body modelling and glossy camera response.

Peach Town currently decodes to 13,917 render strips / 29,101 triangles plus 9,108 collision strips / 20,955 collision triangles. Six named roaming residents use the game's original executable-defined overworld routes, while the fixed-interaction system now connects the reconstructed overworld to the original SHOP interaction packages.

## Outdoor coordinate spaces

The persistent-world work deliberately keeps three coordinate concepts separate:

- **Canonical HG2 source topology (`WorldSectorTopology`)** — the raw FLD coordinate system used for archaeology and seam validation. Fields are 1600×1600, odd rows are +800 in source X, and X is cyclic over 12,800 units. This layer contains no MonoGame handedness assumptions.
- **Reflected render topology (`ReflectedWorldSectorTopology`)** — adapts canonical source coordinates to the current MonoGame field convention (`renderX = 1600 - sourceX`) and chooses the nearest wrapped image around an observer. Driving, collision sampling and 3D neighbouring-sector placement use this layer.
- **Fixed cartographic unwrap (`WorldSectorCartography`)** — preserves canonical source orientation and uses a stable world-map cut rather than the current camera. The current diagnostic cut places Papaya west of White Mountain and White Mountain west of Peach on their shared cyclic row.

Raw-data regressions now cover a 16-seam authored-road matrix across unrelated rows/columns, including both east/west boundaries and staggered north/south row crossings. The matrix also exposes the concrete road-field chain `223 -> 221 -> 220 -> 113` from Peach Town toward Fuji City. Do not infer global atlas orientation from a camera-relative F4 render: it intentionally chooses whichever cyclic copy is nearest to the observer.

## Local commands

```bash
dotnet run --project src/Rta.Tools -- inspect "/path/to/Road Trip Adventure.cue"
dotnet run --project src/Rta.Tools -- field "/path/to/Road Trip Adventure.cue" 223
dotnet run --project src/Rta.Tools -- mesh-summary "/path/to/Road Trip Adventure.cue" 223
dotnet run --project src/Rta.Tools -- world-mesh-summary "/path/to/Road Trip Adventure.cue"
dotnet run --project src/Rta.Tools -- dialogue "/path/to/Road Trip Adventure.cue" "Q's Factory"
dotnet run --project tests/Rta.Tests -- "/path/to/Road Trip Adventure.cue"
dotnet run -c Release --project src/Rta.Game -- --disc "/path/to/Road Trip Adventure.cue"
```

`Release` is recommended for normal playtesting. The persistent-world runtime is intentionally usable in Debug too, but .NET Debug builds make the terrain samplers substantially more expensive and are not representative of game performance.

The renderer can also save deterministic debug frames and exit:

```bash
dotnet run -c Release --project src/Rta.Game -- --disc "/path/to/Road Trip Adventure.cue" --field 223 --screenshot peach-town.png

# Let traffic simulate for 300 rendered frames before capture:
dotnet run -c Release --project src/Rta.Game -- --disc "/path/to/Road Trip Adventure.cue" --field 223 --screenshot peach-town.png --screenshot-frame 300

# Developer archaeology helpers for the current Peach Town slice:
dotnet run --project src/Rta.Game -- --disc "/path/to/Road Trip Adventure.cue" --field 223 --debug-interaction-zones
dotnet run --project src/Rta.Game -- --disc "/path/to/Road Trip Adventure.cue" --field 223 --debug-near-fixed "Q's Factory Staff"
dotnet run --project src/Rta.Game -- --disc "/path/to/Road Trip Adventure.cue" --field 223 --debug-interior 0

# Deterministic authored-road seam proof (automatic throttle, 223 -> 222):
dotnet run -c Release --project src/Rta.Game -- --disc "/path/to/Road Trip Adventure.cue" --debug-seam-crossing

# Deterministic three-seam Peach -> Fuji proof (automatic throttle):
dotnet run -c Release --project src/Rta.Game -- --disc "/path/to/Road Trip Adventure.cue" --debug-fuji-route-seams

# Submit all 64 resident outdoor sectors in one renderer frame:
dotnet run -c Release --project src/Rta.Game -- --disc "/path/to/Road Trip Adventure.cue" --field 203 --debug-view-field 203 --debug-render-whole-world
```

The window title also includes the player car's current field-local X/Z coordinates so visual bugs captured in screenshots are self-locating. The game prints a lightweight performance line roughly once per second, for example `PERF 60.0 fps | sectors 5/7 | field batches 333/1,313 ... | CPU update 1.3 ms / submit 7.7 ms`. This is deliberately left available during development so renderer/simulation regressions are easy to spot on different machines.

The PAL-disc regression suite passes **39/39** with .NET SDK 10.0.400. This includes the 16-boundary authored-road seam matrix, exact-boundary normalization, HG2's common five-register `MIPTBP1_2` material blocks, Fuji PRIM texture-enable state, Fuji day-black/night-lit static geometry, FLD/220's daytime-hidden bridge-light billboards, the narrowly scoped Fuji duplicate-static-triangle class, dynamic palm-crown assets, the shared SORA day/night sky panoramas, and the decoded VU1 car shading/daylight tables. The MonoGame executable also builds with 0 warnings / 0 errors, and the automated Q62 Fuji-route probe crosses `223 -> 221 -> 220 -> 113` under live vehicle collision without a load/reset.

Field materials are not always four VIF vectors: 7,433 five-register updates were found across 60 outdoor FLDs. The fifth register is GS `MIPTBP1_2` (`0x35`). These updates must be consumed even before full mip rendering exists, otherwise the previous material leaks onto the next mesh draw (the broken FLD/221 road was inheriting a yellow warning-sign texture instead of its asphalt atlas).

The test runner intentionally has no third-party test-framework dependency, so format/disc tests can run in restricted/offline environments.

## Debug controls

Drive mode is the default when no explicit debug camera is supplied:

- `W` / `Up` — throttle
- `Left Shift` / `Right Shift` — hold for a 5× developer driving-speed boost; acceleration, speed cap and excess-speed steering scale together
- `--debug-grid` — opt-in legacy 100 m world reference grid; disabled during normal play so it no longer cuts across the ocean
- `S` / `Down` — brake / reverse
- `A` / `Left`, `D` / `Right` — steer
- `E` — talk to a nearby roaming resident / enter a nearby fixed interaction / advance dialogue
- `Enter` / `Space` — advance dialogue
- `Up` / `Down` — select a dialogue or interior-menu choice when one is present
- `Backspace` — return/cancel from the currently exposed Q's Factory host action when its original return target is known
- `F2` — toggle drive camera / free camera
- `F3` — cycle a spectator camera through Peach Town, Fuji City, White Mountain and Papaya Island without moving the player
- `F4` — let all 64 resident outdoor FLDs participate in rendering instead of the nearby-sector set; camera-frustum culling still rejects geometry outside the view (simulation is persistent either way)
- `F1` — print camera, car and surface diagnostics
- `Escape` — close dialogue, leave an interior, or exit while driving

Free-camera mode keeps the original debug fly-camera controls: WASD, Space/Ctrl, Shift and RMB mouse-look.

## Projects

- `Rta.Disc` — raw BIN/CUE, ISO and extracted-directory access.
- `Rta.Formats` — engine-neutral RTA/HG2 binary readers and decoded field/car/object/collision/shop primitives.
- `Rta.Tools` — command-line inspection/summary/dialogue archaeology tools.
- `Rta.Game` — MonoGame runtime/debug renderer and current driving/interaction slice.
- `Rta.Tests` — dependency-free executable integration tests.

## Copyright / clean-room boundary

The project does not redistribute Road Trip Adventure data. Public reverse-engineering notes may be used as research/specification evidence, but implementation here is written independently against the supplied disc format and PS2 file structures.

- **Fuji/field depth compatibility:** the perspective near plane is 1.0 m (20 km far plane retained), matching modern 24-bit depth precision to HG2's deliberately coplanar facade layers much better than the earlier 0.1 m debug-camera default.
