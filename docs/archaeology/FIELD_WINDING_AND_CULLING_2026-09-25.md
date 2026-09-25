# PAL FLD winding and face culling — 2026-09-25

## Scope

This pass traces ordinary PAL `FLD` rendering from source triangle strips through
browser conversion and recovers the face-culling law for VU1 `MSCALF 8`.
It also records the boundary for billboard (`MSCALF 6`) and dynamic-object
(`MSCALF 4`) families rather than guessing their states.

The triggering browser experiment was intentionally controlled: at the same
Warp-arrival camera, only the Three.js material side was changed. Peach Town
matched `BackSide`, while Sandpolis matched `FrontSide`. A city-specific side
switch would therefore have encoded the symptom rather than the PAL rule.

## Geometry pipeline

`readFieldRenderPrimitives` decodes each FLD render chunk as authored triangle
strips. Conversion expands strip triangle `i` using alternating parity:

- even: `i, i+1, i+2`
- odd: `i+1, i, i+2`

Parity advances for every strip triple; no field-local restart heuristic or
degenerate-driven parity reset is applied. The PAL-to-browser conversion then
reflects X exactly once, `renderX = 1600 - sourceX`. That reflection has
determinant `-1`, so it reverses every triangle winding exactly once.
World placement does not add another reflection. Standard sector placement is
translation-only (`relativeRenderTranslation`), and ordinary compiled batches
carry no negative scale or field-specific matrix. The approximate and authentic
field paths share the same compiled positions.

The committed 64-FLD census in
`docs/evidence/geometry/field-winding-census-2026-09-25.json` also rejects the
hypothesis that Sandpolis is simply authored backwards relative to Peach. For
near-horizontal source triangles:

| Field | +Y | -Y | Degenerate |
| --- | ---: | ---: | ---: |
| `FLD/223` Peach Town | 15,685 | 503 | 0 |
| `FLD/013` Sandpolis | 10,911 | 1,277 | 1 |

Both fields overwhelmingly use the same source-space terrain orientation.
After the one X reflection, both are reversed in the same way.

The apparent Peach-vs-Sandpolis “effective winding flip” therefore does not
occur at a hidden transform or strip-expansion boundary. It appears only when a
one-sided browser material is imposed on data whose PAL submission is not
one-sided. Different authored surfaces dominate the two Warp views, so forcing
one global front/back definition can make one view look complete and the other
nearly disappear even though the conversion law is identical.
## PAL culling evidence

The retained executable uploads the relevant VU1 program beginning at
`SLES_513.56` `0x00292ED4`; the existing dynamic-object archaeology ties the
same upload to the embedded `MSCALF 4` and `MSCALF 8` field templates near
`0x00294D00` / `0x0029DBD4`.

For entry `MSCALF 8`, micro-PC `0x008` branches to `0x010`. The clipping path
at `0x05E..0x06D` uses `FCOR` and `FCAND` after `CLIP`, and the following code
sets bit `0x8000` in the packed XYZ W word, the GS ADC no-draw bit, for rejected
vertices. Its helper calls remain inside the inspected `0x000..0x2FF` region.
There is no `FMAND` / MAC-area-sign reject in that MSCALF-8 region. The only
retained MAC-flag face-like site found in the full upload belongs to another
entry family, not entry 8.

`rtao/tests/fieldCulling.pal.test.ts` locks the executable words, branch targets,
flag opcodes and ADC-write sequence. This is evidence of frustum/trivial
rejection, not front- or back-face culling.

**Recovered rule:** ordinary `MSCALF 8` FLD submissions are unculled/two-sided.
The browser must therefore use a two-sided material for this family. This is no
longer an unexplained blanket `DoubleSide`; `fieldFaceCulling.ts` records the
PAL submission family and recovered cull mode explicitly.

## Fail-closed families

`MSCALF 6` camera-facing field cards and `MSCALF 4` dynamic objects are kept
explicitly unresolved for face culling. Their existing two-sided presentation
is preserved because removing it without a separate PAL proof can erase foliage,
coronas, palm crowns or other authored cards/props.

No city number, FLD number or material texture is used to choose face side.

## Debug validation

F3 developer diagnostics now also renders authored fixed-interaction
quadrilaterals in world space. Labels include area/local interaction identity and
name; the nearest zone is highlighted. The recovered corners `2 -> 3` exterior
return edge is drawn separately. The overlay reads the same executable-authored
definitions as interaction/return code but does not feed back into contact,
Warp placement, driving, camera or dialogue semantics.

## Regression coverage

- `fieldGeometryWinding.test.ts`: strip parity, degenerate parity progression,
  and the single X-reflection winding reversal.
- `fieldWinding.pal.test.ts`: all 64 ordinary FLDs plus exact Peach/Sandpolis
  witnesses.
- `fieldCulling.pal.test.ts`: executable-backed MSCALF-8 clip/cull boundary.
- `fieldFaceCulling.test.ts`: recovered vs fail-closed family policy.
- `fixedInteractionDebug.test.ts`: X mapping, identity, nearest highlighting,
  sentinel filtering and corners `2 -> 3`.
