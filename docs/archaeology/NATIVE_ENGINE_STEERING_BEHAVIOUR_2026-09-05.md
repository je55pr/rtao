# Native engine and steering behaviour — 2026-09-05

## Result

The first fitted engine and steering behavior is now driven by PAL executable
scalars rather than the earlier development multipliers. The browser applies
each recovered scalar as a ratio to the matching Normal part, preserving the
existing controller while making the selector-to-selector difference native.

## Engine drive scalar

PAL function `0x00218f70` indexes the category-2 table at `0x00301a90` with a
24-byte stride. It copies record word `+0x0c` into live car offset `+0x214` at
`0x0021901c..0x00219020`. The drive-force routine reads that field at
`0x00219ea8` and shifts it left by seven before the surrounding force/division
path.

The exact values for the confidently named browser entries are:

| Selector | Engine | PAL scalar | Ratio to Normal |
|---:|---|---:|---:|
| 0 | Normal Engine | 1500 | 1.0 |
| 1 | Panther | 1800 | 1.2 |
| 2 | Blue Max | 2200 | 22/15 |
| 5 | Mad V2 | 3300 | 2.2 |

Only acceleration uses this ratio. No top-speed effect is inferred from the
engine table: transmission and other live-car fields remain separate native
systems.

## Steering scalar

The same function indexes the category-5 table at `0x003020b4` with a 16-byte
stride and copies record halfword `+0x00` into live car offset `+0x242` at
`0x002190c8..0x002190d0`. PAL steering code reads `+0x242` at `0x0021b300`,
multiplies it by the signed steering accumulator, and divides the result by 32.

| Selector | Steering | PAL scalar | Ratio to Normal |
|---:|---|---:|---:|
| 0 | Normal Steering | 64 | 1.0 |
| 1 | Quick Steering | 96 | 1.5 |
| 2 | X2 Quick | 128 | 2.0 |
| 3 | X3 Quick | 160 | 2.5 |

The browser applies that exact ratio to its steering response, maximum wheel
angle and turn rate. This is an evidence-backed relative bridge; it does not
claim that the surrounding browser vehicle model reproduces every PS2 fixed-
point integration step.

## Historical scope boundary

Brake category 6 is not reduced to a guessed scalar. The PAL record contains a
32-byte time-dependent braking curve, selected through the pointer copied to
car `+0x200`; reconstructing that curve in the browser requires a dedicated
brake-hold integration pass. Chassis and transmission behavior also remain
unchanged until their separate consumers are closed.

The dedicated follow-up is now complete in
`NATIVE_BRAKE_HOLD_CURVE_2026-09-05.md`; this paragraph records the boundary at
the time of the Engine/Steering checkpoint.
