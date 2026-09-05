# Road Trip Adventure — Three.js/TypeScript next-chat handoff

Date: 2026-08-31

## Continuation prompt

Jess can simply say:

> work mjau 🤭

Meaning: continue the current development work autonomously for as long as useful; inspect/edit/run/test code as needed; do not stop for unnecessary check-ins; send important screenshots/results; only ask Jess if genuinely required for human input.

## IMPORTANT RECOVERY NOTE

This ZIP now contains the **real clean Aug-30 source snapshot at its root**. The user re-uploaded `RTA_ThreeJS_night_work_snapshot_2026-08-30.zip` and it mounted successfully, so source recovery no longer depends on File Library or another upload.

The root source predates the final Aug-31 night-renderer archaeology. The later changes documented below were made in a live `rta_night_dev` tree which was subsequently lost during a sandbox refresh. Treat the root as the known-good baseline and reconstruct/reapply those post-snapshot edits from this handoff rather than assuming they are already merged.

The snapshot's older handoff is preserved at `handoff/SNAPSHOT_HANDOFF_NEXT_CHAT_2026-08-30.md`. Additional MonoGame archaeology source is bundled at `reference/RoadTripAdventureMonoGame-interiors.zip`.

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

For ordinary MSCALF 8 field geometry, recovered stable VU memory 21 is effectively `[128,255,0.5,800]`.

This yields two distance stages:

- GS fog source factor fully source-coloured through depth ~290, then linearly blends to atmosphere at 800;
- VU-generated alpha fully opaque through ~544, then linearly fades to zero at 800.

Representative combined source contribution at depth 672 is only about 12.5% after fog and alpha contributions combine.

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

and the compiled field cache was bumped to **v7** in the latest live branch.

The material grouping key was also extended so batches with different GS TFX/TCC state cannot collapse together.

## Experimental exact GS MODULATE shader

An experiment corrected another Three.js mismatch:

- PS2 GS MODULATE combines texture/vertex values in display-byte space with 128 as neutral;
- Three.js normally samples sRGB texture to linear and multiplies vertex colour in linear light.

An experimental shader round-tripped texture samples to encoded sRGB, applied the `/128`-style GS modulation, then decoded once back to linear for Three's output pipeline.

This made both day and night **much brighter/neon-looking**.

That result is useful negative evidence: Three.js's prior linear-light `/255` multiplication had accidentally been acting as a darkening operation.

Do not simply keep the old mistake because it looks nicer, but also do not promote the bright experimental MODULATE shader to final truth until the remaining original compositing state is understood.

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

The last explicitly completed web validation before the final TFX/TCC shader experiment was:

- **19 test files / 56 tests passing**
- strict TypeScript passing
- Vite production build passing
- sandbox capture bundle passing

After the latest cache-v7 / TEX0 / exact-GS-MODULATE experiment:

- focused tests/builds were run during development;
- `Rta.Tools` built with 0 warnings / 0 errors after TFX/TCC reporting was added;
- **a final full `npm run check` was still due** once deciding whether the experimental GS MODULATE path should remain/promote.

Do this early after source rehydration.

---

# User-confirmed / requested future items

## Headlights (future minor feature)

Once the base night renderer is correct, make the different headlight equipment options visibly affect the beam like in the original game (range/spread/colour/intensity as archaeology supports).

Jess explicitly described this as a **minor future feature**. Do not derail the current night renderer to implement it yet.

## Q's Factory tuning

Deferred: exact car angles, lighting/colour and possibly floor texture/mesh.

---

# Exact recommended next work

1. Rehydrate the latest source tree from `RTA_ThreeJS_night_work_snapshot_2026-08-30.zip` if available.
2. Reapply/reconstruct the post-snapshot night work in this handoff, especially:
   - compiled field cache v7;
   - TFX/TCC decode + batch retention;
   - 216000 clock and 1.1 field VU coefficients;
   - exact FOGCOL colour-space handling;
   - Original/Extended/Unlimited visibility;
   - ordinary-field custom atmosphere shader;
   - no invented Unknown.x opacity semantic.
3. Run full `npm run check` and the C# `Rta.Tools` build.
4. Render matched Peach and Fuji day/night Original-vs-Extended captures.
5. Continue tracing the remaining near-field brightness/compositing discrepancy from PS2 GS/VU evidence. Do **not** add an arbitrary darkness multiplier.
6. Decide whether the exact byte-space GS MODULATE experiment is correct-but-missing-another-stage or should remain an archaeology switch until that stage is recovered.
7. Only after night presentation is structurally convincing, move toward headlights.

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
