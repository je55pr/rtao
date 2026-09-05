# RTA next-chat handoff — 2026-08-21

This is the current clean source state for the Road Trip Adventure / ChoroQ HG2 MonoGame reconstruction project.

**Important:** this archive intentionally contains **no original RTA game files**, no .NET SDK, and no MonoGame/NVorbis NuGet packages. Jess will reattach those separately in the next chat.

## Start here

The branch in this handoff is **ahead of the last prose checkpoint in the conversation**. It already contains the key renderer changes described by Jess's “alternate-universe” future message:

- canonical HG2 world topology is separated from MonoGame render handedness and fixed cartographic unwrapping;
- ordered GS IMAGE transfers preserve BITBLTBUF + TRXPOS + TRXREG + TRXDIR metadata;
- `GsLocalMemory` replays transfers into scratch 4 MiB PS2 GS local memory;
- field `Texture2D`s are resolved from **TEX0 + reconstructed GS memory**, not simply from “the last upload at TBP”;
- ordinary `MSCALF 8` field geometry and `MSCALF 6` billboards use authored STQ directly: `U = S/Q`, `V = T/Q`, with no port-side U or V inversion;
- Police facade atlas layout is regression-tested;
- Chestnut Canyon `FLD/103` has a real GS-composited 64x128 texture and is regression-tested;
- current PAL disc suite is **37/37 passing**.

The clean source copied here came from the working tree named `rta_gs_vram` in the previous sandbox.

## Continuation note — multi-seam topology verification

The supplied .NET SDK 10.0.400 was subsequently added, so the raw-disc findings below now also have a fresh compile/test/runtime validation rather than remaining archaeology-only evidence.

Results:

- eight unrelated E/W authored road boundaries overlap under the existing mapping;
- eight unrelated staggered N/S boundaries overlap after the existing odd-row +800 source-X shift;
- the narrowest measured overlap in this matrix is ~5.998 m; several pairs match to floating-point precision;
- the concrete boundary-connected route toward Fuji is `223 -> 221 -> 220 -> 113` (Peach Town -> countryside -> Bridge -> Fuji City);
- the road triangles form one connected minimap-road polygon in each of those four fields, and ordinary render-edge heights also match at all three route seams;
- the continuation adds `Outdoor authored road seam matrix` as regression test #29 and records the raw measurements in `handoff-research/world-seam-matrix.txt`.
- exact source-local X ownership is now explicitly `[0,1600)`, fixing the exact X=1600 case where the old candidate could be retained while X was reset to 0;
- regression test #30 protects that exact boundary, including the cyclic column-7 -> column-0 case;
- the previously experimental Fuji route probe is now validated: Q62 automatically crosses `223 -> 221 -> 220 -> 113` under live vehicle collision, with all three seams passing at ~27.5 m/s and no load/reset.

The compact runtime transcript is preserved in `handoff-research/fuji-route-live-probe.txt`.

**Decision:** freeze the canonical sector topology unless genuinely contradictory authored data appears. The visually confusing F4/all-world composition is not evidence for another row-transform change because F4 uses a camera-relative cyclic unwrap and the raw seams agree independently of rendering.

No new UV inversion was introduced in this continuation. A direct Police-facade check independently supports raw `V=T/Q`: the physical top edge of the lettering quad is T=0, the lower edge is T=0.5, and the reconstructed GS atlas puts the readable lettering in that same top half. Details are in `handoff-research/police-stq-orientation.txt`. After the .NET SDK was supplied, a fresh MonoGame framebuffer smoke test also showed `POLICE`, vertical `PEACH`, the police-window poster and the Paint Shop sign upright, so the handoff's raw-STQ renderer is now visually validated as well as byte-level validated.

## Validation performed immediately before packaging

Using .NET SDK 10.0.400 and Jess's PAL BIN/CUE:

```text
37/37 tests passed
Rta.Game build: 0 warnings, 0 errors
```

The game source was also compile-validated using the direct-reference MonoGame validation harness (needed only because the Linux sandbox intermittently stalls generating MonoGame `project.assets.json`):

```text
Build succeeded.
0 Warning(s)
0 Error(s)
```

On Jess's normal Windows development machine, use the ordinary `PackageReference` project after placing the four supplied NuGet packages in `local-packages/` (or using normal NuGet if desired).

## What is now considered stable

### 1. Coordinate-space architecture

Do **not** collapse these concepts again:

1. `WorldSectorTopology` = canonical HG2/source topology.
   - 64 ordinary outdoor FLDs (`000..333`).
   - filename-to-grid mapping is established.
   - each FLD is 1600x1600.
   - odd canonical/source rows are shifted **+800 X**.
   - X wraps over 12,800 units.
   - north/south outer-world wrap is **not** enabled/proven.

2. `ReflectedWorldSectorTopology` = current MonoGame render/drive adapter.
   - local render convention uses `renderX = 1600 - sourceX`.
   - camera-relative placement may choose the nearest cyclic X copy.
   - this is correct for local rendering but must NOT be used as a fixed paper/world-map layout.

3. `WorldSectorCartography` = fixed map/debug unwrap.
   - preserves source orientation rather than renderer reflection.
   - uses a stable cyclic cut (`CutColumn = 7`).
   - regression explicitly requires **Papaya west of White Mountain west of Peach** on the fixed map.

Raw-disc seam regressions cover:
- ordinary E/W authored road seam `223 <-> 222`;
- staggered N/S authored road seam `223 <-> 221`.

Additionally, previous archaeology measured column-7 -> column-0 collision boundaries across all eight rows at 0.000 RMSE, so horizontal cyclic wrapping is real authored topology rather than a convenience assumption.

### 2. Persistent world

Already implemented before this handoff:

- all 64 ordinary outdoor FLDs can be resident simultaneously;
- total decoded outdoor field geometry ~= 662,068 triangles;
- persistent world simulation updates all standard-world roaming routes independently of player location;
- 70 standard-world outdoor actor definitions, 69 ordinary moving routes;
- 235 fixed standard-world interaction polygons;
- Cloud Hill remains a deliberate special case outside ordinary field codes 0..63 (its logical code is 64);
- topology-aware driving/collision can straddle sector boundaries;
- deterministic live Q62 road-seam proof crosses `223 -> 222` at ~23.5 m/s without speed reset;
- nearby-sector renderer has sector/chunk/billboard/car frustum culling;
- `F3` spectator cycle and `F4` all-world render candidate mode exist;
- Release mode recommended for playtesting.

### 3. Dialogue/Q's Factory

Also already established and should not be redone:

- Q's Factory has 72 English dialogue/control streams;
- HG2 dialogue is a two-phase bytecode VM (pre-text vs post-text/action dispatch semantics);
- real Q's Factory menu options/targets are decoded from `SLES_513.56`;
- real slot-04 menu runs in MonoGame;
- `Drive around town -> Come again! -> overworld resume` works;
- host actions such as parts/race/save are intentionally exposed rather than faked;
- engine-neutral dialogue flow executor exists.

## Renderer/texture result that was just established

### Raw STQ is the runtime convention

Do not reintroduce OBJ/exporter-style UV flips into the field renderer.

For HG2 field data:

```text
U = S / Q
V = T / Q
```

This now applies to both ordinary `MSCALF 8` primitives and `MSCALF 6` billboard primitives.

The Police atlas is the key regression. Its actual facade contains:

- a lettering quad sampling approximately `T = 0.0 -> 0.5`;
- surrounding stone/awning pieces sampling approximately `T = 0.5 -> 1.0`.

The physically higher edge of the lettering geometry has T=0 and the lower edge has T=0.5. The old `1-T` runtime conversion inverted the atlas regions and caused upside-down/repeated `POLICE` lettering on stone pieces.

Jess reported that the alternate-universe build using raw STQ looked correct; the current source contains that same rule and the corresponding regression test (`FieldSourceStAtlasLayout`).

### GS local-memory reconstruction is not optional correctness polish

Across all 64 FLDs, a previous probe compared **1,164 distinct TEX0 materials** between:

- old shortcut: independent/last upload at the texture base pointer;
- correct model: replay all ordered host-to-local transfers into shared 4 MiB GS local memory, then read the TEX0 surface.

Result:

```text
1164 materials total
1163 equivalent
1 real mismatch: FLD/103 (Chestnut Canyon)
```

See `handoff-research/vram_world_probe.txt`.

Chestnut material:

```text
TEX0 TBP = 0x35F4
TBW      = 2
PSM      = PSMT4
TEX0 size = 64 x 128
```

but the direct upload at `0x35F4` is only:

```text
64 x 78
2496 bytes
```

Later GS transfers alias into the declared TEX0 surface:

```text
packet 19: DBP 0x3607, PSMCT32 16x2  -> changes texture rows ~80..99
packet 20: DBP 0x3608, PSMT4 64x64   -> changes texture rows 96..127
```

So HG2 genuinely composes the 64x128 texture through shared GS local-memory aliasing. The runtime now builds modern textures from `TEX0 + GsLocalMemory`, using scratch VRAM during sector loading and then discarding it.

See:
- `handoff-research/vram_103_alias_trace.txt`
- test `ChestnutGsCompositeTexture`
- `src/Rta.Formats/GsLocalMemory.cs`
- `src/Rta.Game/FieldTexturedMesh.cs`
- `src/Rta.Game/WorldSectorRuntime.cs`

### Police CLUT packing detail

Police uses PSMT4 image TBP `0x3735`, CLUT CBP `0x373D`.

The following transfer physically overwrites part of the 16x2 CT32 CLUT upload in GS memory. This is intentional packing: for CSM1 PSMT4, logical entries 0..15 map to physical entries `0..7` and `16..23`, so the overwritten physical half is not live Police palette data.

The GS replay regression explicitly locks this down.

## The “alternate universe” message from Jess

Jess supplied a future-branch response saying:

- 1,164 TEX0 materials were compared and only Chestnut differed;
- Chestnut's lower texture section is assembled by later GS transfers;
- renderer moved to TEX0 + shared GS-memory extraction;
- Police was fixed by direct `S/Q, T/Q` with no flips;
- Police and Paint Shop appeared upright;
- tests reached 28/28 and game compile validation was 0 warnings/errors.

**This handoff's actual source already matches those core technical claims**, and they were revalidated before packaging. Treat the future message as corroborating HumanEyes evidence rather than as an unimplemented wishlist.

## Visual Chestnut note

The previous sandbox generated matched screenshots (`chestnut-old.png` / `chestnut-gs.png`). The visible difference at that camera is subtle: the building's lower/door material changes rather than producing a dramatic whole-scene difference. The byte-level regression is much stronger evidence than that particular camera framing. Do not discard the GS model because the screenshot comparison is visually understated.


## FLD/221 material leak fixed after HumanEyes road comparison

Jess supplied an original-game screenshot of the broken countryside location and confirmed the dark polygons in the MonoGame view were sky showing through; the intended surface is continuous ordinary asphalt. That ground truth led to a parser-level bug rather than another world-coordinate change.

HG2 field material updates are not always four V3-32 vectors. A world scan found:

```text
9275 occurrences / 64 fields: [0E,15,07,09]
7433 occurrences / 60 fields: [0E,15,07,09,35]
```

Register `0x35` is `MIPTBP1_2`. The old `FieldRenderPrimitiveReader` required exactly four vectors, so it ignored all five-register blocks and leaked the preceding material into following geometry. The decisive FLD/221 chunk-26 sequence is:

```text
p133: yellow warning-sign material, TBP 12178
5-vector update: 0E,15,07,09,35
  TEX0 -> TBP 12201, PSMT4, 128x64, CBP 12217
  CLAMP -> WMS=1, WMT=0
p134/p135: broad road strips
```

TBP 12201 visually decodes to the exact expected grey asphalt atlas with white edge lines and dashed centre marking. A matched MonoGame camera capture before/after the parser fix changes the broken yellow/transparent road into coherent asphalt.

Regression: `Field five-register material update`. Suite is now 33/33 after the subsequent PRIM.TME and Fuji day/night regressions; `Rta.Game` Release build remains 0 warnings / 0 errors. The renderer still does not upload/use PS2 mip levels, but raw `MIPTBP1_2` is preserved in `FieldMaterial`; that is a later fidelity task, not a reason to reject the base-material fix.


## 2026-08-21 HumanEyes Peach -> Fuji visual + alpha pass

Jess drove naturally from Peach Town through FLD/221 and the bridge to the far side of Fuji City. Geometry/collision remained coherent across the whole trip, strongly supporting the frozen sector topology. Her comparison screenshots then isolated the remaining renderer problems:

- the five-register material fix repaired the major FLD/221 road corruption and the dock/bridge/Sandpolis-exit materials;
- Peach's old minimap-derived visual road overlay was the source of a fake 2-lane -> 4-lane transition and is now retired; authored HG2 road geometry remains;
- `PRIM.TME` is now honoured, preventing explicitly untextured Fuji primitives from inheriting stale textures;
- exact Fuji comparison at `FLD/113 X591 Z1060` revealed real day/night layering. HG2 vertices preserve separate `DayColor` and `NightColor`; 100 Fuji untextured primitives are black by day but warm/non-zero at night. Later shop-door comparison refined the initial interpretation: some are useful black daytime interior/backing volumes, so the renderer no longer blanket-omits this static family. The decoder classifies them as `IsDayBlackNightLitLayer` and preserves both channels;
- exact FLD/221 comparison at `X193 Z1443` proved the small ocean/background "hole" is not missing geometry. Alpha-bearing fringe cards were allowing transparent texels to affect depth. The renderer now draws opaque geometry first and routes alpha-bearing textures through `AlphaTestEffect` (`Greater`, reference alpha 0), discarding fully transparent texels while keeping visible texels depth-writing. This removes the reproducible hole without the x-ray/card-sorting downside of the earlier blanket `DepthRead` experiment;
- Fuji facade/forest captures after the alpha-test change are materially closer to the original daytime scene: windows/facade remain opaque and foliage cards depth against one another. Subsequent shop-row evidence restored the day-black interior volumes without reintroducing the old x-ray failure.

Developer ergonomics from this pass remain:

- hold either Shift key while driving for a 5x acceleration/speed-cap boost;
- the window title includes field-local car X/Z for deterministic screenshot archaeology.

### Fuji z-fight + FLD/221 dynamic palms

Jess confirmed the daytime/window alpha fix and Fuji foliage now look correct, then identified a camera-sensitive wall/window shimmer around `FLD/113 X875 Z733`. The field contains intentional coplanar backing/detail layers, but also exactly **100** repeated static triangles whose renderer-visible material/day-colour/UV channels match and whose positions differ only by sub-millimetre source-float noise. A full-world archaeology scan found 475 such repeats out of roughly 919k decoded field triangles (~0.052%). The renderer now:

- submits HG2's global static backing layer (chunk 64) before spatial cutout/detail chunks;
- suppresses only renderer-indistinguishable repeats within one chunk/material/TME batch using 1 mm position and 1e-5 normalized-UV quantization;
- does **not** globally weld geometry or apply polygon offset.

Regression `Fuji near-duplicate static triangles` locks FLD/113 to 100 repeats.

The earlier leafless coastal trunks are now substantially decoded rather than mysterious:

- ordinary trunk TBP `11806` occurs at six palms; each trunk ends in a tiny untextured horizontal top cap that provides a data-driven crown attachment centroid;
- six palm-shadow primitives use TBP `11986` at matching positions;
- hidden frond material TBP `11762` is PSMT8 64x32 and appears on an offstage Y=-50 primitive in the ordinary stream;
- Extra[1]'s first three nested object sections contain **1 + 2 + 3 = 6 radial textured frond primitives / 24 source vertices** around one attachment origin;
- primary copies use `MSCALF 4`, with equivalent `MSCALF 10` copies later in each section;
- FLD/220 contains the same Extra[1] crown object, confirming this is reusable authored dynamic-object data;
- original-game screenshots/video confirm these are palm crowns and the leaves sway gently in wind.

`FieldPalmTreeReader` now decodes the Extra[1] crown structurally, derives placement from the real trunk-top caps, and gets the frond material from TBP 11762 through GS local-memory replay. `PalmCrownMesh` renders the three authored groups with a small phase-shifted sway. The source geometry/texture/placement conclusion is strong; the precise wind frequency/amplitude is still a visual approximation until the original VU animation routine is assigned.

Regression `Bridge/countryside dynamic palm crowns` locks the 1+2+3 group shape, six/24 primitive+vertex counts, six authored anchors, frond TEX0 dimensions and matching FLD/220 object container. Runtime headless captures show the crowns attached to the actual trunks and moving between frames.

Proactively ask Jess for original-game screenshots whenever they can establish ground truth cheaply; mid-investigation screenshots/follow-ups are explicitly welcome and do not disrupt the workflow.

## Most important next steps

1. **Human-test the z-fight + animated-palm build.**
   - revisit Fuji around `FLD/113 X875 Z733` and see whether wall/window shimmer is gone while intentional lattice/backing layers remain;
   - drive past the FLD/221 coastal palms and compare crown size/attachment/orientation and wind amplitude against the original;
   - report any other dynamic scenery that still has a visible shadow/anchor but missing animated geometry.

2. **Reverse the exact dynamic-object/VU animation parameters.**
   - Extra[1]'s later data/code tail remains a candidate for the original crown transform/wind routine;
   - keep the current subtle sine motion clearly labelled as calibration rather than format truth until those constants are assigned.

3. **Decode exact GS TEST/ALPHA state when practical.**
   - current `AlphaTestEffect > 0` behavior is evidence-driven and visually strong, but it remains an approximation until HG2's exact GS alpha-test/blend state is identified.

4. **Run/inspect Chestnut (`FLD/103`) with the current GS-backed renderer.**
   - confirm the proven composite texture looks plausible in motion/from closer views.

5. Q's Factory `Change parts` remains a strong parallel rabbit hole once desired.

## Things explicitly disproven / dangerous old assumptions

Do NOT revive these without new primary evidence:

- “8x8 ordinary square grid with no stagger” — false.
- “cumulative +800 shear every row” — false; alternating source-row stagger is supported by boundary profiles/seams.
- “renderer-relative nearest wrapped placement can be used as the fixed world map” — false; it can put Papaya beside Peach depending on observer.
- “field UVs need a universal U flip” — false for runtime.
- “field UVs need a universal `V = 1-T` flip” — false for runtime; that was an OBJ/export-style convention and caused the Police problem.
- “each IMAGE upload is a self-contained modern texture” — false in at least one proven FLD/103 TEX0 surface.
- “Police problem is caused by conventional PSMT4 unswizzling” — tested offline variants produced garbage and did not explain the authored ST ranges.
- “the 0/800/1600 executable routine is definitely the player world-loader” — not proven; it also looks like it may participate in spatial/collision indexing. Treat that identification cautiously.

## Files the next chat should ask Jess to attach

Jess said she will provide these separately:

1. the PAL Road Trip Adventure game/disc again (BIN/CUE or the RTA/game archive used previously);
2. `.NET SDK 10.0.400` Linux tarball if the sandbox again lacks dotnet;
3. the four offline packages:
   - `MonoGame.Framework.DesktopGL 3.8.5`
   - `MonoGame.Library.SDL 2.32.10.2`
   - `MonoGame.Library.OpenAL 1.24.3.4`
   - `NVorbis 0.10.4`

Place/copy packages into `local-packages/` when using `NuGet.offline.Config`.

## Useful commands

PAL tests:

```bash
dotnet run --project tests/Rta.Tests -- "/path/to/Road Trip Adventure.cue"
```

Playtest:

```bash
dotnet run -c Release --project src/Rta.Game -- --disc "/path/to/Road Trip Adventure.cue"
```

Deterministic seam proof:

```bash
dotnet run -c Release --project src/Rta.Game -- --disc "/path/to/Road Trip Adventure.cue" --debug-seam-crossing
```

Deterministic Peach -> Fuji three-seam proof:

```bash
dotnet run -c Release --project src/Rta.Game -- --disc "/path/to/Road Trip Adventure.cue" --debug-fuji-route-seams
```

Observed runtime result under Xvfb/llvmpipe:

```text
DEBUG FUJI SEAM PASS 1/3: FLD/223 -> FLD/221
DEBUG FUJI SEAM PASS 2/3: FLD/221 -> FLD/220
DEBUG FUJI SEAM PASS 3/3: FLD/220 -> FLD/113
DEBUG FUJI SEAM MATRIX PASS
```

Whole-world renderer experiment:

```bash
dotnet run -c Release --project src/Rta.Game -- --disc "/path/to/Road Trip Adventure.cue" --field 203 --debug-view-field 203 --debug-render-whole-world
```

If Linux sandbox NuGet restore appears to stall after emitting a successful restore summary, `src/Rta.Game/obj/project.assets.json` may already have been produced; a subsequent `dotnet build --no-restore` was successful in this continuation.

## HumanEyes guidance

Jess has repeatedly caught renderer/world-layout mistakes faster than screenshots or inferred maths. When a new world/texture change looks plausible numerically but is visually surprising, prefer asking her to inspect a targeted build/screenshot rather than stacking another corrective transform.

The desired next “wow” milestone remains: **the whole outdoor world is alive simultaneously, and the player can drive naturally from Peach toward Fuji with no PS2-style area loading.**

### 2026-08-22 follow-up
- HumanEyes confirmed all visible FLD/220 beach trunks have animated crowns, then caught that the 55-marker implementation still left a subset bare. The missing markers are real authored variants: shallow ~5 cm bevelled caps and caps that leave TME enabled. Structural discovery now finds 106 FLD/220 trunk-top markers and the relocated but byte-identical crown texture (TBP 10406 vs FLD/221 TBP 11762). Do not reintroduce field/TBP special-casing.
- A motion clip at FLD/113 X863 Z787 confirms the residual Fuji failure is camera-sensitive coplanar depth fighting. PAL executable evidence says the field pass uses inclusive Z, so `LessEqual` remains correct. Material-run ordering was tested and did not solve it.
- Modern projection near plane is now 1.0 m (far stays 20,000 m), the least aggressive tested value that stabilised the deterministic Fuji facade comparison. HumanEyes confirmed the previously flickering Fuji buildings are now stable on her real GPU. Treat this fix as accepted; only reopen PS2 fixed-point depth/rasterisation compatibility if new independent shimmer appears.

### 2026-08-22 sky follow-up
- `SYS/SORA.GSL` is the shared outdoor sky package. It is a 5-packet inline DMA chain with four GS image transfers: a 512x96 PSMT8 daytime panorama + 16x16 PSMCT32 CLUT, followed by a 1024x128 PSMT4 transparent star/moon overlay + 16x2 PSMCT32 CLUT.
- `Hg2SkyTextureReader` decodes both assets directly from the supplied disc; no sky texture is redistributed in the source tree. Regression `Shared outdoor sky panoramas` locks dimensions, pixel formats, the blue->pale daytime horizon, and the sparse high-alpha night overlay.
- `SkyDome` renders the exact daytime panorama on a camera-centred upper hemisphere (U wrap, V clamp). This replaces the dark-grey outdoor clear colour across the normal visible sky while preserving the current daytime-only renderer. Night asset is intentionally held for later integration with HG2 NightColor/time-of-day.
- Xvfb/llvmpipe smoke captures across all four cardinal directions in FLD/221 show continuous authored sky/cloud coverage with no obvious panorama seam. HumanEyes should simply confirm the scale/horizon feels like the original; do not hand-tune palette colours because they are disc-authored.
- PAL suite is 37/37; Rta.Game Release builds 0 warnings / 0 errors.

## 2026-08-22: legacy ocean/world debug grid is now opt-in

- The dark 100 m line grid visible across the ocean was not authored HG2 water at all; it was `Rta.Game.DebugGrid`, a legacy geometry-viewer aid drawn every frame at Y=0.
- Normal gameplay no longer constructs or draws that grid.
- `--debug-grid` restores it explicitly when a world-space reference is useful during archaeology.
- No ocean geometry, coastline data, or field textures were changed by this fix.

### 2026-08-22 Peach -> Fuji daytime visual-cleanup follow-up
- HumanEyes reports the complete Peach-to-Fuji drive is now roughly 95% visually correct. Remaining reported issues were transparent tree/bunting fringes, daytime bridge glow sprites, and Fuji shop doorway darkness.
- The tree/bunting fringe is a modern straight-alpha filtering artifact, not bad HG2 geometry. Alpha-bearing indexed field textures contain arbitrary hidden RGB in transparent palette entries; bilinear filtering that straight-alpha data produces white/cyan silhouettes. Field textures with alpha are now premultiplied on upload and rendered with premultiplied `BlendState.AlphaBlend`, while `AlphaTestEffect(alpha > 0)` remains in place so fully transparent texels still cannot punch depth holes. Deterministic A/B captures remove the tree halo and clean the bunting edges without increasing the alpha-test threshold.
- FLD/220 has exactly 62 authored day-hidden bridge-light billboards selected by a unique world-wide colour signature (`Night avg >= 180`, `Day avg <= 110`): 8 TBP10505 soft yellow glows, 48 TBP10525 green coronas, 6 TBP10534 orange coronas. Original bridge captures confirm they are absent by day and visible at night. The current daytime renderer skips only this billboard family; do not delete the assets because they belong in the later night renderer. Regression `Bridge daytime-hidden night billboards` locks this to FLD/220 and the three authored texture groups.
- Do **not** blanket-suppress the 100 FLD/113 untextured `DayColor=0 / NightColor>0` static primitives anymore. Later original-game Fuji shop comparison proves some are daytime black interior/backing volumes; restoring them makes the curtain-covered shop doorway correctly black while corrected TME/alpha/depth handling keeps the previously fixed window/facade area stable. The format property is now `IsDayBlackNightLitLayer` and is classification only.
- PAL suite is 37/37. `Rta.Game` and `Rta.Tests` Release builds are 0 warnings / 0 errors.
