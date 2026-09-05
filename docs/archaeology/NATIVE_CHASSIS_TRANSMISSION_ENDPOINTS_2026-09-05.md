# Native chassis and transmission endpoints — 2026-09-05

## Result

The browser's fitted Chassis and Transmission entries no longer use the old
hand-tuned percentages. Chassis now applies the executable's weight words as an
inverse-mass force-response ratio. Transmission now applies two endpoints that
are directly determined by its native gear words: first-forward-gear launch
response and final-forward-gear terminal speed.

The complete intermediate automatic shift schedule is not claimed. PAL's shift
callbacks are located and recorded below, but the browser does not invent a
PS2-speed-unit conversion or interpolate unproven per-gear behavior.

## Chassis records and consumer

Category-3 records begin at `0x00301db8` with a 16-byte stride. PAL setup
function `0x00218f70` indexes selector byte `+3`, reads record word `+0x0c`, and
writes it to live car `+0x218` at `0x00219040..0x00219058`.

| Selector | Chassis | Price | Weight word | Equal-force response vs Normal |
|---:|---|---:|---:|---:|
| 0 | Normal | 200 | 25 | 1 |
| 1 | Light | 500 | 22 | 25/22 |
| 2 | Feather | 1,000 | 20 | 25/20 |
| 3 | Phantom | 2,000 | 18 | 25/18 |
| 4 | Hyper | 4,000 | 15 | 25/15 |

Vehicle physics function `0x00219d90` loads `car+0x218` at `0x00219e64` and
uses it repeatedly as the divisor for longitudinal force response, including
`0x00219f24`, `0x00219f8c`, `0x0021a114`, `0x0021a174`, and `0x0021a1f0`.
The browser therefore bridges only the exact inverse-mass response into its
acceleration and braking forces. The unsupported old Chassis steering bonuses
are removed, and no guessed hard top-speed bonus is added.

PAL also adjusts the live weight for other equipment flags in setup. Those
cross-category consequences remain separate until their triggering equipment
behavior is closed.

## Transmission records

Category-4 records begin at `0x00301ee8` with a 28-byte stride. Setup indexes
selector byte `+4` and copies eight signed halfwords from record `+0x0c` into
live car `+0x22c..+0x23a` at `0x00219118..0x00219150`.

| Selector | Transmission | Price | Reverse + forward words + sentinels |
|---:|---|---:|---|
| 0 | Normal | 200 | -95, 116, 162, 227, 318, 446, 0, 0 |
| 1 | Sports | 1,000 | -95, 116, 182, 291, 408, 490, 0, 0 |
| 2 | Power | 2,000 | -95, 128, 220, 276, 387, 464, 557, 0 |
| 3 | Speed | 4,000 | -95, 128, 260, 327, 458, 550, 660, 0 |
| 4 | Wide | 7,000 | -95, 144, 300, 414, 539, 647, 711, 0 |
| 5 | Hyper | 10,000 | -95, 156, 350, 446, 550, 625, 750, 0 |

The current gear selects a halfword at `0x00219e2c..0x00219e58`. The drive path
uses that word as a divisor: engine scalar `car+0x214` is shifted left seven at
`0x00219ea8..0x00219eb8` and divided by the selected gear word. Consequently,
same-engine launch response is inversely proportional to the first forward
word. The browser uses exact ratios 116/116 for Sports and 116/128 for
Power/Speed.

PAL engine speed is updated at `car+0x1d0` and clamped to 10,000 at
`0x0021a258..0x0021a280`. Since engine speed is derived from wheel speed divided
by the selected gear word, terminal wheel speed in the final nonzero gear is
proportional to that word. The browser therefore uses final-word ratios:
Sports `490/446`, Power `557/446`, and Speed `660/446`.

## Shift-schedule boundary

The active gear callback is installed at `0x0021dcb8..0x0021dcd4` and invoked
from `0x0021b218..0x0021b23c` with current gear, signed speed, input flags, the
eight-word table, and engine speed. The two callbacks at `0x0021dcf8` and
`0x0021de30` contain up/downshift thresholds and zero-sentinel checks. Their
control flow is recoverable, but connecting it faithfully requires the exact
native-to-browser speed and engine-state relationship. Until that is closed,
the browser deliberately exposes only the proven launch and terminal endpoints.

## Validation

- `nativeChassisPerformance.ts` locks all five chassis weights and exact
  inverse-mass ratios.
- `nativeTransmissionPerformance.ts` locks all six eight-word gear records and
  derives launch/terminal ratios without name-based tuning.
- Q's Factory definitions for the currently mapped selectors 0–3 consume those
  values; former speculative Transmission/Chassis percentages are gone.
- Controller tests cover Light Chassis drive response plus Speed Transmission
  launch and terminal speed under the deterministic 60 Hz update.

Full browser gate: 33/33 test files, 173/173 tests, production build 50 modules,
and capture bundle build 43 modules (1,521.40 kB).
