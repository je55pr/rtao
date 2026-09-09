# PAL ordinary-race AI — 2026-09-05

## Closed boundary

`rtao/src/game/raceAi.ts` translates the ordinary callback `0x00252BA0`,
its target-angle helper `0x00252198`, and the finite-coordinate paths of PAL
atan2 `0x00278120` / atan `0x0027A780`. Authority is the supplied European
`SLES_513.56`, SHA-256
`2b4a310fc8bb145ccbc5e5ec5d023f0c29903c3e4555d63983d4a976f689eff9`.

This closes command generation and its mutable speed feedback. It does not
connect native speed units to the browser vehicle integrator, launch a race,
or claim a playable ordinary-race loop.

## Native inputs and outputs

| Field / address | Meaning established by its consumer |
|---|---|
| car `+0x90/+0x98` | Native X/Z supplied to angle helper |
| car `+0x194` | Configuration pointer index; low two bits select full/half target corridor |
| car `+0x19A` | Nonzero permits returned steering bits |
| car `+0x1B8` | Signed integer speed; retained in native units |
| car `+0x1D4` | 16-bit yaw, also written by wrong-way correction |
| car `+0x246` | Optional limiter, in twice the ordinary speed bucket |
| car `+0x24A` | Current navigation record |
| car `+0x250/+0x254` | Authored gate and routing tables |
| car `+0x258` | 256-byte per-record speed-target profile |
| car `+0x25C` | Per-car 256-byte speed feedback, cleared by `0x00251F98` |
| scene `+0x28 & 0x0C` | Value 4 permits direct ±256 yaw correction |
| callback argument `a3` | Enables speed-profile adaptation; zero for ordinary opponents |
| `0x002AB988 + activityId*256` | Ordinary non-team speed profile when scene `+0x0A == 0` |

The navigation selector returns a look-ahead **record**. Its byte 1 selects
the target **gate**. The gate endpoints bound a heading corridor; configuration
low bits 1 replace endpoint A with the midpoint, and 2 replace endpoint B.
Other low-bit values retain both endpoints. The returned low angle belongs to
B (or midpoint); the high angle belongs to A (or midpoint).

PAL converts atan2(deltaX, deltaZ) through float32 scale 10430.3779296875
at `0x003D5CB0/4/8`, then retains each low halfword. The implementation
preserves the recovered polynomial constants and operation order rather than
substituting host `Math.atan2`. The scalar model uses host float32 arithmetic;
hardware-specific R5900 rounding/underflow is not claimed as cycle-exact.

## Commands and speed feedback

The ordinary speed bucket is signed truncation of the wrapped 32-bit product
`nativeSpeed*216 / 0x28000`. A nonzero target's low seven bits request command
1 at or below target, 0 one bucket above, and 2 at least two buckets above.
A zero target retains command 1. The optional limiter uses divisor `0x14000`:
one/two buckets over suppress demand, three or more force command 2. Being
below the limiter does not overwrite an existing brake demand.

Positive low-angle error up to 16384 sets steering bit `0x2000`; negative
high-angle error sets `0x8000` when the low error is at least -16384.
Beyond those bounds, permitted scene mode corrects yaw by ±256 instead.
The negative branch deliberately checks the **low** angle a second time;
symmetrising it would change native behaviour. Inside the target corridor,
command 1 becomes 9. The extra bit 8 remains labelled numerically until its
vehicle consumer is closed.

Each update replaces current feedback with `0x80` outside the corridor or
`0x40` inside, then ORs in the speed bucket only when it is 2..62.
When callback `a3` is nonzero, prior current/look-ahead feedback can lower or
raise the mutable target, including aliasing when both indices match. Ordinary
opponents supply zero. Saved teammate branches can supply nonzero; their
profile selection/storage still belongs to the persistent team configuration
and is not replaced with an invented copy of an opponent profile.

## Validation

- Seven focused tests cover speed demand/limiting, exact steering thresholds,
  angle wrapping and midpoint selection, feedback bounds and team adaptation.
- `rtao/test-support/palScalarMachine.ts` is a bounded instruction oracle. It
  reads the external PAL ELF and executes only this scalar call graph; unknown
  instructions fail. It is a test instrument, not a general PS2 emulator.
- `rtao/tests/raceAi.pal.test.ts` compares 4,096 seeded cases from all 24
  activity profiles / 15 course gate tables, including 2,048 with adaptation,
  aliased records, signed speed-product overflow and both yaw corrections.
- Every case compares both target halfwords, command mask, yaw and all 256
  bytes of each mutated buffer. All comparisons passed.

Run the optional actual-PAL gate from `rtao/` with:

```bash
RTA_PAL_EXECUTABLE=/absolute/path/SLES_513.56 npm run check
```

Set `RTA_RACE_AI_REPORT` to an output JSON path to retain aggregate evidence.
Without a supplied ELF the ordinary unit tests still run and this one
external-data test is explicitly skipped. No original executable bytes or
game assets are bundled with the source.

## Current continuation

The later race checkpoints have already closed scheduling/order, control,
drive-force, traction, vehicle scalar composition, ground-support solving and
course-collision queries beyond the boundary originally recorded in this note.
See `docs/STATUS.md` for the current contact/orientation
boundary before starting further race work.
