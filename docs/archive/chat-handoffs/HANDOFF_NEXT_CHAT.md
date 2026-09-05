# Road Trip Adventure — Three.js/TypeScript next-chat handoff

## Current resume override — 2026-09-05

This historical handoff is retained for archaeology, but the authoritative
resume point is now `RTA_CURRENT_STATE.md` plus `RTA_STATE.json`. Current source
lineage is `RTA_ThreeJS_native_ordinary_race_navigation_selector_2026-09-05.zip`.

The latest milestone closes the PAL race catalogue and import/reward foundation:
all 39 activities, the exact 24 ordinary races, 12 selector ranges, resident
participants, six/nine/nine C/B/A classes, and all fifteen ordinary
`COURSE/C00.BIN`–`C14.BIN` packages. The actual PAL browser probe compiled
228,072 render and 45,969 collision triangles through the production path.
Native four-class/six-place Cake prizes, up-to-three-car team sums, 24 best
finish bytes and top-six licence promotion now persist in recovered save schema
10. All 15 course-specific three-strip finish lines, the ordered crossing phase
machine, three-lap target and finish-order assignment are now traced and typed.
The exact start grid, 360/360 collision-grounded positions, 24-car player/team/
opponent layout, human/AI control split and PAL float32 navigation-record
selector are also closed. OPFS cache schema is 3. The full gate is 37/37 test
files and 199/199 tests plus both builds; the actual-disc suite is 40/40.

Resume by tracing Peach Raceway's ordinary-AI steering/speed and wider race
scheduling, then attach the smallest playable ordinary-race slice. Do not invent
those behaviours from the minimap or activity labels. Native equipment and
other Cake producers remain useful only when their complete executable-backed
consumer/host path closes.

Date: 2026-08-31

## Continuation prompt

Jess can simply say:

> work mjau 🤭

Meaning: continue the current development work autonomously for as long as useful; inspect/edit/run/test code as needed; do not stop for unnecessary check-ins; send important screenshots/results; only ask Jess if genuinely required for human input.

## RESTORATION STATUS — 2026-08-31

The Aug-30 source snapshot was successfully recovered and the **proven Aug-31 changes have now been reconstructed into this source tree**. Do **not** treat this as the old Aug-30 baseline anymore.

Restored in source:

- Q28 raw executable yaw (removed erroneous browser `+π`);
- direct Three.js car V convention plus `carTextureUv` regression;
- Q's Factory world compositing order: floor/platform/shadows → SHOP scenery → live cars → UI;
- compiled field cache **v8 / `RTAFLD8!`**, including the authored ordinary-field memory-20/memory-21 selector;
- removed the disproven `Unknown.x = opacity` interpretation;
- retained GS `TEX0.TCC` / `TEX0.TFX` in compiled field batches;
- exact PAL 216,000-unit clock and **1.1** field-VU endpoint coefficients;
- executable-derived FOGCOL/background colour curves and correct Three.js sRGB-byte conversion;
- field atmosphere composition also corrected to blend in GS display-byte/sRGB space before decoding back to Three linear;
- configurable Original / Extended / Unlimited visibility;
- ordinary MSCALF-8 atmosphere now uses display-space fog/alpha composition, darkening authentic night medium/far geometry toward the PAL result;
- ordinary MSCALF-8 authentic atmosphere selected per primitive: stable memory 21 = ~290/~544/800; dynamic memory 20 reaches ~45/~172/300 at deep night;
- matched Peach/Fuji day/night and Original-vs-Extended deterministic capture scenes;
- C# archaeology census for TFX/TCC.

The late GS byte-space MODULATE experiment was subsequently corrected: its neon-bright result came from applying the `/128` modulation factor twice. The **current source now contains the corrected no-double-scale GS colour-domain implementation** in `worldView.ts`, with dependency-free regressions in `fieldGsColor.ts` / `fieldGsColor.test.ts`. Textured MODULATE uses encoded texture × the already-normalised `vColor`; untextured TME=0 converts the vertex factor back to a direct GS display value. This shader has now been fully revalidated in Chromium against the local PAL CUE/BIN. The field-material archaeology also now decodes the erstwhile `UnknownRegister` correctly as the compact material GIF tag rather than a hidden GS state register.

Validation after reconstruction:

- `Rta.Tools` Release build: **0 warnings / 0 errors**;
- PAL 64-field census: **423,182 / 423,182 primitives TFX=0 (MODULATE), TCC=1 (RGBA)**;
- compiled-field v8, GS-colour and field-lighting regressions pass;
- full `npm run check` currently passes: **21/21 Vitest files, 64/64 tests**, production Vite build and sandbox capture bundle;
- deterministic PAL Chromium captures are available locally from the extracted CUE/BIN.

The snapshot's older handoff remains at `handoff/SNAPSHOT_HANDOFF_NEXT_CHAT_2026-08-30.md`. Additional MonoGame archaeology source is bundled at `reference/RoadTripAdventureMonoGame-interiors.zip`.

---

# Project intent / constraints

- Browser Three.js + TypeScript port of the Road Trip Adventure reconstruction.
- Original game assets are supplied locally by the user and processed locally; do not put copyrighted game assets in the repository.
- The browser world's **north/south wrap is intentional** in addition to the proven east/west wrap. Do not revert it just because the C# reference only proves east/west behaviour.
- Current travel-mode development should favour work closable through archaeology, tests and deterministic screenshots rather than requiring controller/playtesting feedback.
- Screenshot workflow: show important captures inline. Only add a separate full-resolution file link when Jess needs close inspection.

---

# Stable Three.js state before the current night pass

The capture-runner/stabilised TypeScript port already had:

- all 64 outdoor fields compiled/rendered;
- deterministic 1280×960 screenshot harness;
- prepared outdoor capture sessions so multiple views can reuse one decoded world;
- real Q62, residents, wrapped topology and driving;
- real Q's Factory interior from `SHOP/T00.BIN`;
- original Q28 staff truck and Q62 player car;
- Change Parts development loop;
- capture scenes for world/Peach/Fuji/White/Papaya/Q's Factory;
- compiled-field duplicate suppression / chunk-64 ordering stabilisation;
- intentional two-axis browser wrapping;
- tests and strict TypeScript/Vite/capture-bundle validation.

File Library baseline artifact: `RTA_TS_capture_runner_cumulative.patch` records the stabilised capture-runner state and its handoff docs.

---

# Q's Factory work completed in this chat

Treat these as completed unless contradicted by new original-game evidence.

## Q28 orientation

The web port had added an unnecessary `+π` to the executable-derived Q28 yaw. Removing it points the truck broadly the correct way.

A diagnostic temporarily replaced Q28 with an ordinary Q62-style body while keeping Q28's exact transform. Jess confirmed both cars were facing roughly the correct direction after the correction.

Do not reintroduce the blanket `+π` fix.

## Car texture V convention

A global car-texture bug was found through Q28:

- Q28's 128×128 atlas contains the large `CQF` front graphic.
- Q28's authored UVs hit that graphic correctly **without** a V flip.
- The TypeScript renderer had inherited MonoGame/XNA's `1 - V` correction even though Three.js `DataTexture` did not need it.
- Removing the extra Three.js V flip makes the `CQF` front lettering appear and also restores other car details such as red Q62 taillights.

This is a general car-texture convention fix, not a Q28 special case.

A regression helper/test was introduced around this rule (`carTextureUv` in the live branch).

## Interior compositing order

Jess noticed pre-rendered SHOP background pieces drawing over the live cars.

The intended world compositing rule is now:

1. floor/platform/shadows
2. authored SHOP backdrop/scenery
3. clear depth
4. live cars (cars depth-sort against one another)
5. UI above everything

In other words: **live cars are the highest world render layer; UI is higher.**

## Remaining Q's Factory tuning (deferred)

Q's Factory is now considered right-ish. Remaining work is tuning rather than structural archaeology:

- exact camera/car angles;
- car lighting/colour;
- perhaps floor texture/mesh presentation.

Do not spend ages polishing this unless it becomes useful again.

---

# Night renderer archaeology — important recovered truths

This is the current main development line.

## Day / warm / night field channels

Field vertices carry three useful colour states for the ordinary MSCALF 8 path:

- Day RGB = `DayColor`
- Warm transition RGB = `(Day.r, Unknown.y, Unknown.z)`
- Night RGB = `NightColor`

The former `Unknown.x` was briefly misidentified as authored opacity. Further VU inspection showed that semantic should **not** be compiled as field opacity. The post-snapshot branch removed that invented semantic and bumped the field cache accordingly.

## PAL world clock

The correct outdoor clock is:

- **216,000 units/day**
- **9,000 units/hour**

Time regions recovered from PAL SLES_513.56:

- 00:00–05:30 deep night
- 05:30–06:30 dawn (night → day)
- 06:30–17:00 stable day
- 17:00–18:00 sunset (day → warm)
- 18:00–18:30 dusk (warm → night)
- 18:30–24:00 deep night

## VU memory-19 lighting coefficients — latest correction

This is important: the field coefficients are **not normalised to 1.0**.

PAL code at roughly `0x00226910` writes the values that are uploaded to VU memory 19.

Stable endpoints:

- day = `(1.1, 0, 0)`
- night = `(0, 0, 1.1)`

Transitions deliberately keep a roughly 0.1 overlap:

- dawn midpoint ≈ `(0.5, 0, 0.6)`
- sunset midpoint ≈ `(0.6, 0.5, 0)`
- dusk midpoint ≈ `(0, 0.5, 0.6)`
- 18:00 begins around `(0, 1.0, 0.1)`

Do not silently normalise these field-VU coefficients to sum to one.

Atmosphere/fog interpolation is a separate concept and should use normalised phase interpolation rather than the 1.1 vertex-light coefficients.

## Environment / FOGCOL

The executable-derived above-water FOGCOL curve was recovered.

Important endpoints:

- full day: approximately RGB `(255,255,255)`
- warm sunset endpoint: approximately `(255,161,127)`
- late dusk fades toward black
- deep night FOGCOL: **RGB `(0,0,8)`**

A neighbouring environment tint reaches true black at deep night.

Important Three.js colour-space correction discovered late in the pass:

These executable/GS values are display-byte/sRGB-like values. Feeding `8/255` directly to `THREE.Color` as linear light causes Three.js output encoding to make the blue far too bright. Decode byte values into Three's linear working space first, e.g. via `THREE.Color().setRGB(..., THREE.SRGBColorSpace)` or equivalent.

## SORA night asset

`SYS/SORA.GSL` contains:

- 512×96 daytime panorama
- 1024×128 transparent night star/moon strip

The real night strip is now used instead of procedural stars.

The original attempt mapped the night strip onto the same pole-collapsing hemisphere as day and produced radial star streaks. A cylindrical/truncated spherical-band presentation was explored.

Latest visual direction before handoff:

- map the 1024×128 night strip over a relatively narrow sky band so its authored one-pixel stars do not become enormous at 1280×960;
- the exact original sky geometry is **not yet proven**, so keep this mapping explicitly provisional;
- do not claim an arbitrary ~20° band as original HG2 truth.

## Bridge night lights — strong success

FLD/220 contains exactly 62 night-dominant billboard lights which were previously discarded:

- 48 green coronas
- 8 soft yellow glows
- 6 orange/yellow tower coronas

The real night bridge capture looked convincingly correct and Jess specifically said the bridge looked great.

These are authored assets/positions/colours, not hand-placed effects.

---

# Original-vs-expanded visibility — intentional browser feature

Jess explicitly wants the authentic PS2 distance behaviour to be optional because seeing huge amounts of the world is part of the browser port's wow factor.

Three first-class policies were introduced:

## Original PS2

HG2 ordinary MSCALF 8 geometry does **not** use one universal profile. A deliberately repurposed bit in the primitive GIF-tag register-descriptor word (`0x0000000200000000`) selects between two VU vectors:

- clear -> dynamic **VU memory 20**;
- set -> stable **VU memory 21**.

The stable memory-21 profile is `[128,255,0.5,800]`: fog remains fully source-coloured to ~290, alpha fully opaque to ~544, and both reach atmosphere at 800.

Above water, dynamic memory 20 is the main ordinary-field profile. It matches the long profile during daytime but contracts with the executable's night coefficient until deep night reaches `[128,255,1.0,300]`: fog fully source-coloured only to ~45, alpha fully opaque only to ~172, and both complete by 300. This per-primitive selector is now preserved in cache v8 and applied only in Authentic mode.

## Extended (preferred default)

Keep original day/warm/night colours and environment colours but stretch visibility dramatically (the experimental profile used roughly fog-full 1800 / alpha-full 3500 / far 5200).

This is the mode that preserves the multi-field / whole-world wow factor and should remain the practical default.

## Unlimited

Disable distance-atmosphere fade entirely.

## Shader implementation direction

Three.js built-in `Fog` was rejected for ordinary field geometry because it cannot reproduce the two separate linear starts.

A custom field shader path was added which:

- computes view depth;
- reproduces the linear fog and alpha factors for ordinary MSCALF 8 geometry;
- composites toward the recovered atmospheric colour while keeping opaque WebGL depth ordering deterministic.

Important caveat:

- **Billboards use MSCALF 6 and a different dynamic VU memory-20 profile.**
- Do not falsely apply the ordinary 290/544/800 profile to trees/coronas/billboards until the MSCALF 6 profile is reconstructed.

---

# GS TEX0 / texture modulation archaeology — latest active thread

The latest session investigated why near-field night geometry still looked brighter than original references.

## World-wide TEX0 proof

The C# archaeology tool was extended to scan `TEX0.TFX` and `TEX0.TCC` across all 64 fields.

Result:

- **423,182 / 423,182 field primitives use TFX=0 = MODULATE**
- **423,182 / 423,182 use TCC=1 = RGBA**

This is a strong world-wide fact.

The TypeScript `GsTex0` / compiled-field structures were extended to retain:

- `rgbaColorComponent` (`TCC`)
- `textureFunction` (`TFX`)

and the compiled field cache is now **v8**; v8 additionally preserves the authored memory-20/memory-21 visibility selector.

The material grouping key was also extended so batches with different GS TFX/TCC state cannot collapse together.

## Corrected GS MODULATE shader — current source

The first exact-MODULATE experiment was wrong in one important way: it applied the PS2 `/128` scale **twice**. The field compiler already maps raw 0..128 GS RGB into normalized vertex attributes such that `vColor ≈ raw / 128`.

The current implementation therefore does:

- textured `TFX=MODULATE`: encoded/sRGB texture × `vColor`, then decode once to Three's linear working space;
- untextured `TME=0`: convert normalized `raw/128` back to direct `raw/255` display colour before decoding to linear.

New dependency-free helpers/tests live in `fieldGsColor.ts` and `fieldGsColor.test.ts`. The corrected shader is now in `worldView.ts`; **do not re-add another `255/128` factor**.

This interpretation has now passed real PAL Chromium validation. The major remaining night-brightness discrepancy was traced to the wrong universal visibility-profile assumption rather than a missing arbitrary darkness multiplier.

## Latest screenshots from that experiment

Names used in the lost sandbox branch included:

- `/mnt/data/rta_modulate_baseline/peach-day-ground.png`
- `/mnt/data/rta_modulate_exact/peach-day-ground.png`
- `/mnt/data/rta_modulate_exact/peach-night-ground.png`

The exact-GS MODULATE versions were dramatically brighter.

---

# Deterministic capture catalogue additions during night work

Matched cameras were added/used for:

- `peach-day-ground`
- `peach-night-ground`
- `peach-night-ground-extended`
- `peach-sunset-ground`
- various dawn/dusk Peach development scenes
- `fuji-day-ground`
- `fuji-night-ground`
- `fuji-night-ground-extended`
- bridge day/night variants

Purpose: compare only time/visibility state without camera drift.

Capture service was also improved in one live branch to support returning PNG data URLs to avoid serialising a million PNG bytes as JS number arrays in restricted Playwright contexts.

---

# Validation state

The ordinary outdoor day/night milestone has been fully revalidated and is
**closed for now**:

- **21/21 Vitest files / 64/64 tests passing**;
- strict TypeScript passing;
- Vite production build passing;
- sandbox capture bundle passing;
- Peach/Fuji/bridge Authentic day/night closure captures regenerated from the PAL disc;
- Peach 22:00 Extended remained byte-for-byte identical to the pre-v8 capture.

Do not re-open broad night archaeology without a concrete visual/gameplay
discrepancy. Exact SORA night-strip geometry, MSCALF-6 billboard atmosphere,
residual GS draw-order edge cases and equipment-specific headlights are
separate future follow-ups.


## Generic SHOP interior fallback — 2026-09-01

The next-major-milestone interior work has started cleanly:

- `web/src/formats/shopInterior.ts` now exposes `shopInteriorPackagePath(areaIndex)`
  (`1 -> SHOP/T00.BIN`, etc.) with a regression test.
- `ShopInteriorBackdropView` remains a raw-atlas diagnostic, while
  `ShopInteriorRoomView` is the generic fixed-camera room renderer: repeated authored
  floor swatch + screen-space scenery cutout using the recovered QFactory projection.
- any fixed interaction other than Q's Factory now enters that shared room composition
  instead of printing "not reconstructed yet"; overworld simulation pauses/resumes cleanly.
- Q's Factory continues to use `QFactoryInteriorView` unchanged for its known
  scene-specific floor/platform/live-car composition and dialogue flow.
- historical MonoGame source independently used the same generic fixed-interaction
  -> SHOP slot -> backdrop model, which supports this as the correct common layer.
- validation: **21/21 files, 65/65 tests**, Vite production build and capture bundle pass.
- `shop_census.py` / `shop_room_capture.py` uses the capture bundle to render a labelled contact sheet of
  every slot in one SHOP package without loading FLDs/world geometry.
- PAL visual checks confirmed coherent generic rooms for Peach Bartender slot 04,
  Policeman slot 05, and Kevin's mom slot 08. This strongly validates the common
  floor/scenery layer across ordinary interiors.
- the census now labels slots with executable-defined interaction names; Peach T00
  exposes all 28 fixed slots in one image.

Next useful interior task: build a lightweight visual census/probe across SHOP
packages/slots, then pick an easy second room and recover only the extra runtime
composition that room actually needs.

## Low-memory deterministic capture fixture — source work in progress

The sandbox has a hard ~4 GiB cgroup and routine PAL captures were repeatedly
re-reading the ~589 MiB BIN, field compiler, Chromium and build/runtime files.
The active source now contains a deliberately untracked derived-fixture path:

- `.dev-cache/` is ignored;
- `sandboxCaptureRunner.ts` can prepare an outdoor world directly from
  `fixture.json` + `SORA.GSL` + serialized `field-###.mesh` files;
- the PAL fixture-builder side keeps the disc open once and exports **one asset
  per browser download**, never several meshes through one Playwright JSON value;
- `build-sandbox-capture.mjs` embeds an SHA-256 fingerprint of the field compiler
  source files;
- `fixture.json` records that fingerprint, `compiledFieldCacheVersion`, PAL boot
  executable and available fields; stale fixtures are rejected automatically;
- root `sandbox_fixture.py` has `refresh` and `capture` modes. Only `refresh`
  touches the PAL BIN/CUE; routine `capture` consumes the small derived files.

This fixture plumbing was added during a deliberately low-memory/source-only
period and has **not yet received its runtime Chromium validation**. Do that
once the sandbox experiment permits a controlled heavy step. Do not include
`.dev-cache/` in source/handoff archives; it is derived from user-supplied game
data.

A separate sandbox lifecycle quirk has also been observed: `/mnt/data/rta_src`
has occasionally been reduced to a docs-only shell even while cgroup usage was
~1 GiB. This is independent of the earlier memory-pressure failures. Keep small
source checkpoints frequently rather than assuming the mutable working tree is
persistent.

---

# User-confirmed / requested future items

## Headlights (future minor feature)

Make the different headlight equipment options visibly affect the beam like in
the original game (range/spread/colour/intensity as archaeology supports).
This remains a minor future feature; do not derail the next milestone for it.

## Q's Factory tuning

Deferred: exact car angles, lighting/colour and possibly floor texture/mesh.

---

# Exact recommended next work

1. Keep heavy sandbox work serialized and preserve the low-memory baseline.
2. When a controlled Chromium step is appropriate, build the three-field
   derived fixture (`223`, `113`, `220`) one field at a time and verify a cached
   Peach capture matches the direct-PAL capture.
3. Measure routine fixture-capture memory/time versus the old direct-PAL path;
   retain the fixture only if it materially improves stability.
4. Then return to the active product milestone: **generalise the Three.js fixed
   SHOP/interior pipeline beyond Q's Factory**. Separate reusable backdrop/slot
   decoding and fixed-camera scene/session behaviour from QFactory-specific
   floor/platform/live-car composition.
5. Bring additional real interiors online one by one against original-game
   references rather than assuming all SHOP packages share QFactory's layout.

---

# Useful current inputs the user has supplied

The current conversation/user environment has supplied at various points:

- `Road Trip Adventure (Europe) (En,Fr,De).7z`
- `dotnet-sdk-10.0.400-linux-x64.tar.gz`
- `monogame.framework.desktopgl.3.8.5.nupkg`
- `monogame.library.sdl.2.32.10.2.nupkg`
- `monogame.library.openal.1.24.3.4.nupkg`
- `nvorbis.0.10.4.nupkg`
- offline Node dependency archives/native Linux bindings used for Three.js builds
- original-game screenshots/videos supplied earlier for renderer comparisons

Do not include original game data in project deliverables.

---

# File Library artifacts worth searching by exact title

- `RTA_TS_capture_runner_cumulative.patch`
- `RTA_TS_stabilisation_capture_harness.patch`
- `RTA_NEXT_CHAT_HANDOFF.md`
- `RTA_NEXT_CHAT_HANDOFF(1).md`
- older MonoGame renderer archaeology patches such as `RoadTripAdventureMonoGame-daylight-alpha-fix.patch`

The cumulative capture-runner patch is especially useful for reconstructing the pre-night TypeScript baseline if the 2026-08-30 clean source snapshot is unavailable.

---

# Working style

- Do not be afraid to invalidate old assumptions; many “truths” in this project started as provisional guesses.
- Prefer executable/VU/GS/disc evidence over visual tuning when available.
- Use original-game screenshots from the web/user as visual ground truth, but distinguish screenshot-derived tuning from structurally decoded facts.
- Because Jess may be away from the PC for days, do not block on manual playtesting unless genuinely necessary; keep a deferred playtest queue.
- Send meaningful screenshots autonomously when a visual change is worth reviewing.
