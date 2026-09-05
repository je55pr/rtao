# PAL race transforms and contact orientation

This document retains the #4 evidence boundary. The subsequent moving-frame
comparison is recorded in [`PAL_NATIVE_RACE_FRAME_2026-09-05.md`](PAL_NATIVE_RACE_FRAME_2026-09-05.md).

The probe-transform/orientation milestone (#4) is implemented locally on
`codex/pal-race-contact-producer`. The contact API now composes the recovered
math helpers with the seven-probe producer, course query and support solver.
The command consumer also has an explicit world-velocity composition using
the pre-update car matrix. This is not a complete moving race.

## Authority and implementation

The authority is the supplied European `SLES_513.56`, SHA-256
`2b4a310fc8bb145ccbc5e5ec5d023f0c29903c3e4555d63983d4a976f689eff9`,
and the developer's local single-track MODE2/2352 PAL BIN/CUE. Original assets
and executable bytes remain local. Active code is in
`rtao/src/game/nativeRaceMath.ts`; the composed drive API is
`advanceNativeRaceVehicleVelocity` in `nativeRaceVehicle.ts`.

| Native entry | Recovered operation |
| --- | --- |
| `0x00275770` | Four-column point transform, including W |
| `0x00275990` | Four-lane addition, including point/translation W |
| `0x002757A0` | Matrix product, transforming each right-hand column |
| `0x002757E8` | Cross product with the native operand/lane ordering |
| `0x00275830` | Ordered squares, square root, reciprocal and normalization |
| `0x00275A98` | Identity matrix |
| `0x00275AC0`, `0x00275C88` | Native rotation polynomial and yaw constructor |
| `0x002086C0`, `0x00208738` | Normal basis and subsequent yaw composition |
| `0x0021A368` | Normal adjustment, including bit-64 precedence over bit 128 |
| `0x002758B8` | Rigid-transform inverse |
| `0x0021E188` | Signed fixed-point movement transform using VITOF15/VFTOI15 |

The rotation polynomial reads its four coefficients from `0x002F9580`;
substituting JavaScript sine/cosine changes the native results. Products and
accumulations round separately to float32. Signed zeros and output aliasing
are included in the comparisons. The integer transform uses only the first
three matrix columns: although it loads the translation column, neither that
column nor input W participates in the result. It truncates and saturates
after the final fixed-point conversion.

`advanceNativeRaceContact` uses the old matrix to transform all seven probes,
adds the native position translation, executes the scalar caller and builds
the new normal, matrix and inverse. The scalar API still accepts a transform
dependency for its earlier isolated regression; production composition now
supplies the recovered implementation.

At `0x0021B654`, the command consumer transforms its zero-Y local drive vector
with the pre-update matrix, before drift feedback. The new velocity API
preserves that order even when the scalar call changes yaw.

## PAL comparisons

`PalVuMachine` is an independent bounded COP2 macro-instruction decoder used
by `PalScalarMachine`; it does not call the production math functions.
COP2 transfers, required packed-word permutations and vector loads/stores are
also executed. Unsupported instructions and calls outside the allowed ranges
fail. Instruction meanings were cross-checked with primary PCSX2
[opcode tables](https://github.com/PCSX2/pcsx2/blob/master/pcsx2/R5900OpcodeTables.cpp),
[VU operations](https://github.com/PCSX2/pcsx2/blob/master/pcsx2/VUops.cpp), and
[MMI operations](https://github.com/PCSX2/pcsx2/blob/master/pcsx2/MMI.cpp).
These establish opcode semantics; the supplied PAL program establishes game
behavior. No PCSX2 source is bundled in the implementation.

- 4,096 seeded vector/matrix cases, with separate and aliased destinations:
  transform, addition, cross, normalization, multiplication and inverse.
- All 65,536 signed 16-bit car yaw values against the original polynomial
  and rotation constructor.
- 4,096 normal bases, yaw compositions and adjustment cases.
- 4,096 signed fixed-point movement cases, each with separate output and
  output aliasing either input, including integer extremes and saturation.
- 2,048 full command/force/traction/drift cases executing the movement transform
  instead of the earlier identity-copy hook. Audio and memset remain hooks.
- 2,048 complete contact callers using actual VU/orientation instructions;
  synthetic course-query results are supplied at the query boundary.
- All 360 native-yaw grid slots across the 15 original course packages, plus
  600 retained contact-history updates at the first Peach grid slot: 6,720
  original-course queries. Both sides retain their own state and matrices.
  Transform, orientation, course collision and support helpers have no hooks;
  impact and sound requests are observed through hooks.

The original-course result hash is asserted by the test:
`9802b940eaf1a341f4c29336e8ccdc72ea0b19d3c859f1e8230fff892c492151`.
See `docs/evidence/races/2026-09-05/native-geometry-report.json`.
The previous scalar-only contact and course-collision regressions are retained.

The retained `native-math-instructions.txt` covers 373 instruction words.
`native-math-trace-verification.json` records their ranges and hashes.
Regenerate from the repository root with `RTA_PAL_EXECUTABLE` set:

```text
node tools/verify_race_math_evidence.mjs docs/evidence/races/2026-09-05
```

From `rtao`, run `npm run test:pal` with `RTA_PAL_EXECUTABLE` and `RTA_PAL_BIN`,
and separately `npm run check`. `RTA_RACE_GEOMETRY_REPORT` optionally selects
the report path. Full-gate output is retained in `native-geometry-pal.log`
and `native-geometry-check.log`; `validation.json` records the counts.

## Explicit remaining boundary

This oracle uses host float32 arithmetic for finite inputs. It is not a PS2
hardware or cycle-accurate emulator: pipeline timing, VU status flags,
extended exponents, denormal behavior and hardware rounding differences are
not established by these comparisons. The signed-yaw domain is checked in
production; no general-angle trigonometric claim is made.

Repeated contact-history updates hold the horizontal input position fixed.
They are not moving trajectories or laps. The enclosing `0x0021C920` frame
still requires composition and PAL comparison of prior/current velocity,
gravity, equipment branches, drag and impulses, position/contact updates,
obstacle query `0x0021AD88` / `0x0021AB60`, and collision response `0x0021A510`.
The command consumer's contact inputs are still supplied by its caller.

That moving-trajectory gate remains #5. The subsequent Peach race session
(#6) and Q's Factory launch (#7) must connect entrants, player/AI updates,
ordered lap/finish state, results and the existing persistent Cake reward
logic. No race launch, renderer or payout trigger was changed here, so no new
visual capture is claimed. The first playable race remains incomplete.
