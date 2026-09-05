# Native race commands and forces — 2026-09-05

This checkpoint closes additional scalar consumers while the first playable
Peach Raceway race remains the target.

## Verified corrections

The start callback `0x0022F068` and live ordering `0x0022ED38` were reviewed
against their instruction listings and oracle memory setup. The live-order loop
advances the car pointer by 624 bytes while its iteration counter counts down;
this is ascending physical car-slot order. Equal distances retain that order.
The scheduler abstraction correctly exposes calls as events and leaves their
external audio/UI/fade/scheduler hosts unimplemented.

`race_grid_capture.mjs` now hashes returned PNG bytes using Node SHA-256.
Fresh twice-per-activity runs of Peach and Ninja both matched exact PNG bytes.
Their verified inspection report is
`handoff/race-checkpoint-2026-09-05/captures/race-grid-evidence-verified.json`.
The older report with unavailable browser hash strings is historical only.

## Recovered consumers

- `nativeRaceControls.ts`: gearbox callbacks `0x0021DCF8` and `0x0021DE30`,
  steering consumer `0x0021B238..0x0021B3AC`, boost helper `0x00218DC0`.
- Ordinary launch calls gear-schedule setter `0x0021DCB8` at `0x00210658`
  with argument 1, selecting the higher schedule. Higher-schedule acceleration
  upshift quotient is >8200, throttle-held downshift tests <5000 and previous-gear
  quotient <8000. The alternative callback uses >5000 / <3000 / <4000.
  Braking-only downshift uses <8000 in both. Gear changes respect zero sentinels.
- Steering accumulates -32..32. Reversing steering flips the accumulator's sign;
  release recentres by four only when local forward speed is nonzero. The
  stored speed memory and native integer curvature calculation are preserved.
- Command bit 8 feeds the equipment-gated boost call at `0x0021CD10`.
  Runtime equipment flags at `(car+0x184)+8` must contain 0x2000. Boost requires
  scene mode bits 0x0C == 4, debits 100 fuel and produces 44/89/178 native
  speed increments based on remaining fuel below 12000/below 30000/otherwise.
  The signed counter, release cooldown and audio requests are retained.
- The 0x0004/0x0008 bits tested around `0x0021D000` belong to a different
  equipment/physics flag word, not the input-command mask. They must not be
  used to assign input semantics.
- `nativeRaceDriveForce.ts` translates `0x00219D90`: engine target/fuel debit,
  engine/gear/mass force, coupling and brake limits, lateral force, grip loss,
  engine-speed saturation and wheel-speed output. All units remain native.

## Validation

Full actual-PAL `npm run check`: 44 test files, 221 tests, production and capture
builds pass. The new oracle suites exercise both original gearbox callbacks on
all six gear tables and quotient boundaries; steering across every accumulator,
all four steering scalars, directions and stop/reverse states; boost across
fuel and counter thresholds; and 4096 seeded drive-force inputs.

The bounded test interpreter now supports the additional scalar instructions
needed by these exact routines. R5900 SQRT.S reads ft, not generic MIPS fs;
this operand distinction was checked against PCSX2's primary FPU interpreter:
https://github.com/PCSX2/pcsx2/blob/master/pcsx2/FPU.cpp (SQRT_S).
The opcode at `0x00219FF0` is `0x460C0044`, consuming f12 into f1. This was
corrected during the new drive-force test implementation before recording pass.
The oracle still uses normal host float32 arithmetic and is not cycle-accurate
or a general R5900 emulator. Audio calls are hooks.

## Newer saved continuation

Traction, yaw, drift, native equipment loading and composed scalar vehicle
updates are now implemented. The latest tests passed 46 files / 226 tests.
See `handoff/race-checkpoint-2026-09-05/LATEST.md` for scope, original-instruction
comparisons, build completion limits and the remaining contact/transform work.

## Earlier next boundary

These are independently tested scalar functions, not yet a playable vehicle.
Continue through `0x0021B460` (traction speed/brake coupling), yaw/drift updates,
`0x0021AF38`, vector transforms `0x0021E188`, contact/collision `0x0021C280`,
and fixed-position integration in `0x0021D1B8`. Confirm runtime equipment
configuration and contact fields before creating opponent vehicle instances.
World-position conversion uses gp-32476 = 20971.51953125; integer coordinate
increments use `(velocity << 4)/25`. Preserve this evidence without yet
asserting physical SI units or a frame-rate conversion.

Keep Q's Factory race selection/results wiring gated on those movement inputs.
No new economy rules were added; existing prize/licence persistence is ready
for an evidenced completed-race result.
