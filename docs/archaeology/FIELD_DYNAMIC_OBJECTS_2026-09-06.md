# RTA field dynamic objects — Extra[1] container, wind turbines and palm crowns — 2026-09-06

## Result

`FLD/NNN.BIN` header sections at index ≥ 3 ("Extra") were previously parsed for
bounds but never decoded. Extra[1], when present, is a standard `Hg2ObjectFile`
container of one or more MSCALF-4 dynamic-object meshes. The Three.js runtime now
decodes it and renders:

- **FLD/213 (Mushroom Road)** — 22 spinning wind-turbine rotors on the recovered
  tower tops, replacing the previous bare towers;
- **FLD/220 / FLD/221 (Peach–Fuji coast)** — ~106 / ~6 swaying coastal palm
  crowns on the trunk tops, replacing the previous bare trunk poles.

Geometry, texture and the MSCALF-4 vertex format are evidence-backed. The
per-object animation, facing and scale are **host approximations** — the
originals are composed into a per-object matrix by EE object-update code that is
not decoded. The palm-crown sway is a direct port of the C# reference's
`PalmCrownMesh`; the C# notes it is likewise unverified.

## Extra[1] object survey (all 64 fields)

| Field(s) | Object | Rendered |
|---|---|---|
| 213 Mushroom Road | wind-turbine rotor (1 section, radius 42, ~36 tris, 128² tex) | **yes — spin** |
| 220, 221 Peach–Fuji coast | palm crown: three 1/2/3-frond sections, radius ~4, 64×32 frond tex | **yes — sway** |
| 223 Peach Town | **the giant peach landmark** (rounded fruit + stem + leaf; orange/red/green, radius ~2) | no — `prop` |
| 233 Papaya Island | **the giant papaya landmark** (two rounded fruit lobes ~5 tall + leaves) | no — `prop` |
| 113 Fuji City | a **moat bridge** (grey, 4×2.3×9, a railed profile extruded across the moat; textured from the field) | no — `prop` |
| 210 (forest/lake) | a **decorative potted tree** — heart-motif purple planter + trunk + yellow-green canopy | no — `prop` |
| 012 (desert canyon) | a **crossed-billboard shrub / small tree** (olive/brown, panel + base box) | no — `prop` |
| 011 (desert) | a **180-unit flat scenery band** (white, striped 128² tex) + a small prop; a distant backdrop / boundary flat | no — `prop` |
| 202, 203, 211 (ski area) | small posts / **trail signs / slalom-gate markers** (white + colour, 3–6 units) | no — `prop` |
| 111 | Extra[1] section 0 does not decode as a mesh (+ a 128² tex) — needs a closer look | no |
| 023 ("My City") | 80 extra sections, not a simple container | no — needs own pass |

`readFieldObjectAsset` classifies each container by structure: `turbine-rotor`
(one section, radius > 20), `palm-crown` (three sections, ≤ 24 tris total,
radius < 10), or `prop`. The giant-fruit landmarks and the bridge are `prop`
because they lack recovered placement markers (and, for the bridge, a texture
source); they would need per-object anchor heuristics like the crown and rotor.
`?showprops` (dev-only) drops a scaled static copy of every Extra[1] object at a
debug anchor for eyeballing.

### Why the giant peach / papaya are not placed (checked 2026-09-06)

The `prop` landmarks stay unrendered. Placement was investigated and found not to
be evidence-backed:

- **FLD/223 Extra[1]** = exactly one object, three MSCALF-4 sections (body 160
  tris + stem 200 + leaf 136), object-local, radius ≈ 2.0, 128² texture.
  **FLD/233 Extra[1]** = one object, three sections (flat base 216 tris + two
  lobes ≈ 5 tall), radius ≈ 5.0, 128² texture. Both are small origin-centred
  models — world position, scale and facing are entirely in the per-object
  matrix.
- **Extra[0] is the minimap only** — a single VU-program-10 DMA chain at +0x50
  (`readFieldMinimapPrimitives` already consumes it: road ribbons + tan building
  quads + black POI squares + cyan water, all at y = 0). It is not a 3D
  placement / instance table.
- **No structural anchor in the field mesh.** The turbine and crown got a
  *dominant family* of attachment primitives (22 tower shafts, N trunk caps); a
  single landmark has none, and a scan for an isolated raised pedestal near the
  town centre of either field turned up nothing distinctive.
- The C# reference does not place these either — `FieldPalmTreeReader` rejects
  both containers (section prim counts ≠ 1/2/3).

Recovering real placement means tracing the field object-list loader that
populates the runtime struct fn `0x00224510` reads (floats at +0x04/+0x14/+0x24/
+0x34 → matrix-build `0x002279a0`). `0x00224510` has no `jal` callers — it is
dispatched through an actor vtable, several layers above the FLD Extra[1] read.
Same wall as the rotor spin; deferred.

## Extra[1] container format

Section table: a leading `u32` list of relative section offsets; the first entry
equals the table length, the last equals the section length. Each section:

```
+0x00  16-byte sub-header (2 sub-offsets + pad; the first points at an
       equivalent MSCALF-10 copy of the mesh)
+0x10  DMA CNT tag, then a VIF packet in the shared car/object grammar:
         UNPACK V4-32 ×1     GIF tag
         UNPACK V3-32 ×(4·N) vertex payload, 4 vec3 per vertex
         MSCALF #4 (or #10)  execute the dynamic-object VU program
```

Vertex = `[position][normal][authored RGB][texData: u, v, gloss]`, identical to
`CARS/*.BIN` high-detail meshes (`src/formats/carGeometry.ts` `readCarMeshPart`
already decodes this exact sequence). A trailing section with no MSCALF-4 mesh is
an optional PSMT8 texture DMA (128×128 image + 256-entry CT32 CLUT for the FLD/213
rotor).

Across the PAL fields the dynamic objects are small props — coastal palm-crown
fronds (`FLD/220`/`221`, radius ≈ 3.9), and other clusters in `FLD/223`/`233`
(radius 2–5). **`FLD/213`'s single object is a radius-42, ~36-triangle three-blade
rotor** — an order of magnitude larger, which is the render-side discriminator.

## MSCALF-4 (VU program 4)

The shared "dynamic object / high-detail car" VU1 kernel, already documented in
`docs/FORMAT_NOTES.md` §"High-detail car VU1 shading" (micro-instructions
`0x287` setup / `0x2C4` vertex loop / `0x2D3`–`0x2F8` colour; palette
`SLES_513.56` `0x2A2910`; normal basis EE `0x01824E00`; per-frame column update
fn `0x00227128`). It transforms `position` by a per-object matrix and shades the
retained `normal`/RGB. **It contains no time input** — animation is entirely in
the matrix the EE composes before the kick.

EE side (this pass, R5900 disassembly of `SLES_513.56`):

- `0x00224510` builds a per-object transform (matrix-build `0x002279a0`, submit
  `0x00227fd0`) from four scalars in an object struct and draws a baked
  VIF+geometry template from a table at `0x00294d00` (3 MSCALF-4 templates +
  MSCALF-10 alternates; matching MSCALF-8 templates near `0x0029dbd4`). These are
  executable-embedded built-in objects, not the FLD container path.
- `~0x00226700` selects a time-of-day MSCALF-4 palette (`0x002A3610` / `3D60` /
  `3D90` / `3DF0`) then a per-category tint from a 40 × 3-byte table at
  `0x002A40A0`.

The loader that walks Extra[0]/Extra[1] and the per-object matrix composition
(where rotor spin lives) were **not reached**. `tools/mips_probe.py` /
`tools/disasm_elf_context.py` cover the integer/COP1 disassembly used here.

## Placement (both structural, no field numbers baked in)

Extra[0] is a ground-level 4-vec3 mesh (a pad/decal), not a placement table;
Extra[1] holds only the object model, not instances. Mounts come from the
ordinary field mesh:

- **Turbines** (`findTurbineAnchors`) — the dominant tall (> 40), narrow
  (footprint ≤ 12 and ≤ 0.3 × height), near-vertical primitive family, top
  Y ≥ 100. 22 shafts in FLD/213; top centre (X reflected) is a rotor mount. Only
  runs when the Extra[1] object is rotor-sized, so bridge pylons and palm trunks
  attract nothing.
- **Palm crowns** (`findPalmCrownAnchors`, mirroring the C# `FindCrownAnchors`) —
  the dominant small (0.1–1.2), near-horizontal (≤ 0.4 tall), a-few-metres-up
  (Y 3–30) cap family, emitted while the shared frond material is current. Each
  cap centroid is a crown mount.

## Host approximations (explicit — `src/game/worldView.ts`)

- `approximateRotorSpinRadiansPerSecond = 1.15` — constant angular velocity.
- `approximateRotorFacingYaw = 0` — all rotors face one world direction.
- `approximateRotorScale = 0.42` — rotor sized to sit on the recovered towers;
  the authored per-object scale is undecoded.
- `crownSway` — `sin`-driven Z (±0.045 rad) + X (±0.022 rad) sway per frond
  group, phase-offset by 0.42 rad per group and by instance position. Ported
  verbatim from the C# `PalmCrownMesh`; the C# marks these constants unverified.
- Shading: texture-only with alpha test; authored vertex colour is GS-neutral 128
  and no MSCALF-4 diffuse is applied (matching the C# palm-crown path, which
  draws crowns unlit). Any daylight response is part of the undecoded matrix.

## Dev harness note

`?devdisc` + `?onlyfield=N` now imports **only those FLD sectors** (plus the
always-required files, no race courses), which fits a ~260 MB browser-storage
quota and loads in seconds. Such installs are marked `devPartialFields` in the
manifest and are never treated as the full world.

## Next

Trace the EE Extra[0]/Extra[1] loader and per-object matrix composition to
replace the four approximations above with recovered values, then the rotor
texture's exact CLUT/alpha handling and the tower→rotor attach offset.
