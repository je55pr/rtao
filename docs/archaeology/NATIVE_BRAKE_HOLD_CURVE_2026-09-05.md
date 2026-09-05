# Native brake hold curve — 2026-09-05

## Result

All four fitted Brake selectors now use the PAL executable's time-dependent
32-update force curves. The earlier guessed `1.18` / `1.38` / `1.62` scalars
have been removed. Browser driving advances one curve sample on each existing
fixed 60 Hz vehicle update while the brake is held, saturates at sample 32, and
resets on release, selector change, initialization, or debug teleport.

The browser preserves the exact native integer calculation for each active
sample:

`force = (curveByte * 10000) >> 5`

That 0–10,000 result is used as a fraction of the browser controller's existing
maximum braking acceleration. This is an evidence-backed curve-shape bridge; it
does not claim that all surrounding PS2 vehicle fixed-point units have already
been reconstructed.

## Record layout and selector mapping

PAL function `0x00218f70` reads category-6 selector byte `+6` from the live
configuration, multiplies it by the 44-byte record stride, and writes a pointer
to `0x0030219c + selector*44` into live car offset `+0x200` at
`0x002190d4..0x002190f8`.

The apparent curve-base address is 12 bytes after the real table start. The
complete records begin at `0x00302190`: name pointer, description pointer,
price, then the 32 curve bytes. This resolves the temporary archaeology concern
that only three labelled records existed and proves the direct selector mapping.

| Selector | Record | Pad | PAL description | Price | First four | Update 16 | Update 32 |
|---:|---:|---|---|---:|---|---:|---:|
| 0 | `0x00302190` | Normal Pad | Standard | 500 | 1, 1, 1, 1 | 4 | 32 |
| 1 | `0x003021bc` | Soft Pad | Good for quick braking | 1,000 | 4, 7, 10, 12 | 26 | 32 |
| 2 | `0x003021e8` | Hard Pad | Helps for all around cornering | 1,500 | 0, 1, 1, 1 | 6 | 32 |
| 3 | `0x00302214` | Metal Pad | Stops on a dime | 2,000 | 1, 1, 1, 1 | 16 | 32 |

Exact curves are represented in `web/src/game/nativeBrakePerformance.ts` and
locked by deterministic tests.

## Consumer and timing

The vehicle-update consumer at `0x0021b3b0..0x0021b3f8` tests input bit `0x0002`:

- inactive: stores zero to car `+0x1fe` and produces zero brake force;
- active below 32: increments car `+0x1fe`, then reads `curve[hold-1]`;
- active at 32: keeps reading the final byte;
- force: multiplies the unsigned byte by 10,000 and arithmetic-shifts right 5.

The resulting force is passed as argument `t1` into vehicle physics function
`0x00219d90`. Car initialization also clears `+0x1fe` at `0x00219c9c`,
`0x0021ca24`, `0x0021d878`, and `0x0021d9d4`.

The browser already integrates vehicle state on a deterministic 1/60-second
fixed update. Advancing one PAL curve sample per fixed update therefore
preserves the recovered update-count semantics without introducing a guessed
continuous-time interpolation.

## Runtime and validation

- `nativeBrakePerformance.ts` owns the four immutable PAL records, selector
  validation, saturated sample lookup, exact integer force, and normalized
  browser bridge.
- `ArcadeCarController` owns the live hold counter and consumes the fitted
  category-6 selector.
- Q's Factory apply/cancel and reload paths synchronize the persisted native
  selector into live driving.
- Brake catalogue descriptions now describe the real curves; provisional pad
  multipliers no longer leak through aggregate part performance.
- Deterministic Metal Pad integration covers the first 16 force samples and a
  release/re-press reset.

Full browser gate: 31/31 test files, 163/163 tests, production build 48 modules,
and capture bundle build 41 modules (1,517.71 kB).

## Historical boundary

Chassis and Transmission still carry development tuning. Their PAL records and
consumers must be recovered separately; no behavior is inferred from their
names or descriptions here.

The following checkpoint closes Chassis inverse-mass response and Transmission
launch/terminal endpoints in
`NATIVE_CHASSIS_TRANSMISSION_ENDPOINTS_2026-09-05.md`. Exact intermediate shift
timing remains gated on its native speed/state bridge.
