# Native field surface selector — 2026-09-05

## Result

The PAL field collision packet carries the native tyre-surface selector in the
low nibble of the otherwise GIF-unused upper 32 bits of its 64-bit GIF-register
word. Values `0` through `5` select the six tyre coefficients copied by PAL
function `0x00218f70`, in exactly this order:

| Collision low nibble | Native tyre coefficient | Browser surface |
|---:|---|---|
| 0 | Dry | `dry` |
| 1 | Off-road | `dirt` |
| 2 | Wet | `wet` |
| 3 | Grass | `grass` |
| 4 | Snow | `snow` |
| 5 | Ice | `ice` |

The browser keeps authored minimap road ribbons as the highest-priority paved
or dirt-road signal. Outside those ribbons it now samples the collision packet
at the same X/Z/reference-Y point as the ground query and applies the selector
above. The existing controller remains a relative-ratio bridge against Normal
Tyres rather than a claim of exact PS2 vehicle physics.

## PAL evidence

- `SLES_513.56` SHA-256:
  `2b4a310fc8bb145ccbc5e5ec5d023f0c29903c3e4555d63983d4a976f689eff9`.
- Function `0x00218f70` indexes 28-byte tyre records at `0x0030163c` and
  copies six 16-bit values from record offsets `+0x04..+0x0e` into the live car
  record. The recovered table order is Dry, Off-road, Wet, Grass, Snow, Ice.
- A complete PAL `FLD/000`–`FLD/333` collision census found the following
  low-nibble populations:

| Selector | Triangles | Fields |
|---:|---:|---:|
| 0 / Dry | 65,095 | 22 |
| 1 / Off-road | 675,958 | 63 |
| 2 / Wet | 0 | 0 |
| 3 / Grass | 122,861 | 24 |
| 4 / Snow | 11,169 | 1 (`FLD/203`) |
| 5 / Ice | 2,957 | 2 (`FLD/113`, `FLD/203`) |

- White Mountain `FLD/203` contains 11,169 Snow-selector triangles and 738
  Ice-selector triangles. The dominant Snow packet `0x444` correlates with the
  field's white snow textures; the Ice population covers the visible frozen
  lake in the deterministic capture.
- Dirt/earth material families consistently end in selector `1`, and green
  grass families consistently end in selector `3`, across unrelated fields.
- No static field collision packet ends in selector `2`. Wet is therefore
  available to the runtime if a weather/environment producer supplies it, but
  no texture-based Wet classification is fabricated.

The upper nibbles contain additional native collision metadata and remain raw.
The implementation deliberately masks only the low nibble. A selector value
outside `0..5` remains unclassified. Code `5` means the native Ice coefficient;
it is not a claim that every corresponding texture, particularly in Fuji, is
visually literal ice.

## Implementation

- `web/src/game/worldCollision.ts` exposes the exact selector mapping and
  samples collision flags through `DrivingWorld.drivingSurface`.
- `web/src/game/nativeTyrePerformance.ts` maps all six recovered surfaces to
  the corresponding coefficient ratio.
- `web/src/game/drivingGame.ts` preserves the existing base handling profiles;
  Dry, Wet, Snow and Ice gain only the evidence-backed tyre ratio.
- `web/src/sandboxCaptureRunner.ts` reports raw collision flags, native surface
  counts, representative centroids and texture correlations without bundling
  original assets.

## Deterministic validation

- Full web gate: 29/29 files, 150/150 tests.
- Production build: 46 modules.
- Capture build: 40 modules, approximately 1,516.26 kB.
- Deterministic forced-surface simulations verify that Wet, Snow and Ice
  specialist tyres outperform Normal Tyres by more than 1.7× after 60 frames.
- White Mountain capture SHA-256:
  `0c01797c1e9aaf4b65ac733c6e2c1eef00d787e2f62f3fa5c6604cd9c35058c9`.
- Fuji capture SHA-256:
  `2489e64effc19718798062c96fea0133c0a4ec31b943a197aba2208a2435c757`.

Both captures were visually inspected. They are validation evidence only and
are excluded from the clean source checkpoint because they contain original
game-derived imagery.
