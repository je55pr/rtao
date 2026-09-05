# Road Trip Adventure MonoGame — Next Chat Handoff

**Date:** 2026-08-22

## Resume point

Continue the Road Trip Adventure / ChoroQ HG2 MonoGame reverse-engineering project from the **post-interior-colour-fix** source packaged alongside this handoff.

The immediate next rabbit hole is **car lighting/shading**, specifically how HG2's car VU programs combine decoded vertex normals with the two authored paint colours. **Do not resume camera tuning right now**; Jess explicitly asked to leave the camera work parked.

The renderer/world visual reconstruction pass is considered done enough. Jess will report if the tree/bunting transparency issue is still visible during future play. My City is knowingly a special broken case (much of its ground is absent) and is deliberately deferred.

---

## Most recent user direction

Jess's last substantive direction before the chat limit was:

> It's getting closer? It's hard to say really, let's leave the camera stuff for now, please look into the colour issue, and don't forget to check the colours of other cars too, i saw some very bright neon red where in the base game it would have been less bright, so this isn't just an issue with the CQF truck

That colour investigation was completed successfully. The next chat should **continue from the results below**, not redo them.

---

# 1. Car paint data is now solved globally

There were **two separate bugs** in our previous paint decoding.

## 1.1 Packed 24-bit paint layout

HG2 stores **two consecutive RGB444 colours** in the low 24 bits:

```text
bits  0.. 3 = primary R
bits  4.. 7 = primary G
bits  8..11 = primary B
bits 12..15 = secondary R
bits 16..19 = secondary G
bits 20..23 = secondary B
```

Conceptually:

```text
R1 G1 B1 | R2 G2 B2
```

This is implemented in:

```text
src/Rta.Formats/PalOverworldRoamingRoutes.cs
PalCarPaint.Decode(...)
```

Do **not** restore the previous channel-interleaved interpretation.

### CQF/Q28 proof

The Q's Factory staff resident's packed value is:

```text
0x00FFFF10
```

With the corrected packing this becomes:

```text
primary nibbles   = 0,1,F  -> blue
secondary nibbles = F,F,F  -> white
```

That immediately explains the authored **blue + white CQF van** without a Q28-specific hack.

---

## 1.2 HG2 does not expand RGB444 to 0..255

Our old code used ordinary 4-bit expansion (`nibble * 17`), making channel F = 255 and channel 0 = 0. That is wrong for HG2 car paint.

The PAL executable contains the exact 16-level paint intensity table:

```text
float table (SLES 0x2A2560):
0.10, 0.15, 0.20, 0.25,
0.30, 0.35, 0.40, 0.45,
0.50, 0.55, 0.60, 0.65,
0.70, 0.75, 0.80, 0.85
```

Corresponding byte values (also present in the executable at `0x2A25A0`):

```text
25, 38, 51, 63,
76, 89, 102, 114,
127, 140, 153, 165,
178, 191, 204, 216
```

So HG2 deliberately keeps paint channels in a restricted range:

- nibble `0` -> about 25, not black
- nibble `F` -> about 216, not full 255

This is the explanation for Jess noticing that some red cars in MonoGame looked **neon / over-bright** compared with the original game.

### This table is authoritative, not a nearby guess

PAL car-render setup at approximately `0x222710`:

1. extracts all six packed paint nibbles;
2. indexes the `0.10..0.85` table six times;
3. constructs the primary and secondary RGB vectors;
4. uploads those vectors into VU memory at slots `0x18` and `0x19` immediately before the car geometry path.

Therefore this conversion belongs in the global paint decoder, not only Q's Factory.

### Regression examples

Q's Factory staff value:

```text
0x00FFFF10
primary   = RGB(25, 38, 216)
secondary = RGB(216, 216, 216)
```

Kevin's deliberately red paint:

```text
0x0000F00F
primary   = RGB(216, 25, 25)
secondary = RGB(216, 25, 25)
```

These are covered in `tests/Rta.Tests/Program.cs`.

---

# 2. Remaining colour problem = lighting/shading, not paint decoding

After the global paint fix, Q28 and several Peach residents were rendered and checked. The over-bright data-level problem is fixed, but the MonoGame cars are still flatter than the original game.

Important discovery:

- HG2 source car vertices contain proper, varied **unit normals**.
- Our current `CarDebugMesh` path effectively discards those decoded normals for painted body polygons.
- The original PS2 cars visibly have body shading; our current painted surfaces are much closer to flat RGB.

Therefore the next target is:

> **Decode enough of HG2's car VU entrypoints (`MSCALF 4` / `MSCALF 10`) to recover how the vertex normal contributes to final painted body colour.**

Do **not** solve this by:

- enabling arbitrary MonoGame default lighting;
- multiplying paint colours by a guessed darkening factor;
- special-casing red or Q28;
- modifying the now-authoritative paint intensity table.

Trace the PS2/VU shading path first.

The paint vectors entering the VU program are already understood (see above). The missing half is how normals/light/material state modify them before final vertex colour/output.

---

# 3. Current Q's Factory interior state

Camera work is intentionally **parked** for now, but preserve the existing discoveries/code.

## SHOP atlas/compositor facts

`SHOP/T00.BIN` is an atlas/compositor source, not a finished fullscreen backdrop.

Q's Factory composition includes:

- authored factory scenery cutout;
- tiled floor from the 64x64 atlas tile at `(512,320)..(576,384)`;
- dynamic cars;
- later state-specific turntable/platform geometry;
- 2D menu/dialogue UI layers.

The base floor is executable-authored geometry:

```text
20 x 20 world units
16 x 16 texture repeats
=> one repeated tile = 1.25 x 1.25 world units
```

The Change Parts turntable/platform is:

```text
3.75 x 3.75 world units
=> exactly 3 x 3 repeated floor tiles
```

Jess independently noticed from the original-game screenshot that the platform is almost exactly 3x3 floor tiles; this agrees perfectly with the executable data.

The Change Parts platform placement is authored around:

```text
X = 1.2
Z = 5.2
```

The yellow ring and grey inner layer are separate textured planes; the grey inner/platform layer has state-driven rotation.

## Shop camera archaeology already done

The important correction was that the packed SLES shop-camera angle values are converted with **`vitof4`** before HG2's angle scaling. The corrected SLES camera interpretation was approximately:

```text
X = +23.90625 degrees
Y = -41.484375 degrees
```

The previous `22.5 / +56.25` theory was wrong and must not be resurrected.

The current interior target uses 640x384 authored coordinates internally but is presented at **4:3** in the host. This final presentation correction substantially improved car/background proportions without warping models or camera transforms.

Again: **Jess has asked to leave camera work alone for now.** Preserve it; don't tune it further unless a later task specifically requires it.

---

# 4. Region/source caveat

The reverse-engineered executable and disc data in the project are European PAL:

```text
SLES_513.56
Road Trip Adventure (Europe) (En,Fr,De)
```

Jess personally plays the **NTSC-U / SLUS-20398** version because that version has RetroAchievements support.

Therefore screenshots Jess supplies from her current gameplay are usually **SLUS/NTSC captures**.

Use those captures confidently for:

- composition;
- state behaviour;
- asset relationships;
- relative proportions;
- visual comparisons such as car colour/shading.

But do not silently force exact SLES/PAL projection/raster constants to pixel-match SLUS screenshots. Keep the attached SLES executable authoritative for PAL-specific constants.

---

# 5. Validation at handoff

The source packaged with this handoff was revalidated in this chat after the future-limit transcript was supplied.

Using the European `.cue`:

```text
37/37 PAL regression tests passed
```

Release compile:

```text
Rta.Tests: 0 warnings, 0 errors
Rta.Game:  0 warnings, 0 errors
```

The new paint regressions are included in that 37-test suite.

---

# 6. Useful current visual artifacts

These were produced during the most recent interior/paint work and may be useful for comparison if they are attached/copied into the next environment:

```text
qfactory_change_parts_4x3.png
qfactory_exact_paint_table.png
exactpaint_samples_montage.png
exactpaint_samples/Kevin.png
exactpaint_samples/Gonzo.png
exactpaint_samples/Klien.png
exactpaint_samples/Pillow.png
```

The most important source is the code/executable, not these screenshots.

---

# 7. Suggested next-chat sequence

1. **Do not revisit camera calibration.**
2. Inspect the existing car vertex decoder / `CarDebugMesh` path and identify exactly where normals are lost.
3. Trace the PAL VU car geometry/shading entrypoints, especially `MSCALF 4` and `MSCALF 10`.
4. Determine the source of light direction/intensity/material factors used with paint vectors in VU slots `0x18` / `0x19`.
5. Implement only the shading behaviour that is supported by executable/VU evidence.
6. Render several different cars, including:
   - Q28/CQF van (blue + white),
   - Kevin or another pure-red resident,
   - at least one less-saturated/mixed-colour resident.
7. Compare whether the remaining neon/flat appearance is resolved globally.
8. Add regression coverage for any newly decoded deterministic shading inputs where practical.
9. Only after physical car appearance is credible, return to other interior presentation work such as the original 2D SHOP menu/dialogue chrome.

Jess prefers that if a visual question would be substantially easier to answer with an original-game screenshot/video, **ask for the specific capture rather than spending a long time reconstructing evidence she can provide directly**.

---

# 8. Do not reopen these solved/parked rabbit holes casually

- world topology / persistent 64-field world;
- Peach -> Fuji renderer cleanup;
- global alpha ordering for bunting/trees (considered done pending future HumanEyes confirmation);
- Q's Factory atlas-vs-backdrop interpretation;
- 20x20 / 16-repeat floor geometry;
- 3.75x3.75 Change Parts platform geometry;
- corrected SLES shop camera `vitof4` angle interpretation;
- 4:3 interior presentation correction;
- packed paint layout;
- 0.10..0.85 HG2 paint intensity table.

If new evidence contradicts one of these, revisit it explicitly; otherwise build forward.
