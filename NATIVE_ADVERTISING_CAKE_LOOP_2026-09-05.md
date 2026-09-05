# Native fitted-sign advertising Cake loop — 2026-09-05

## Closed result

The browser now implements the complete evidence-backed loop shared by the five
original sponsor signs:

1. drive with option category 11 item 4..8 fitted;
2. add successful travelled world distance to that sign's dedicated counter;
3. revisit the matching sponsor and reach authored post-text action `0x16`;
4. consume complete 1,000-unit blocks, retain the remainder, and credit Cake at
   the sponsor's native rate.

Debug teleports add no distance. Distance and Cake are saved together in
recovered save schema 9. Older schema 1..8 saves remain valid and migrate with
zero advertising distance.

## PAL authority

Source executable: `SLES_513.56`, SHA-256
`2b4a310fc8bb145ccbc5e5ec5d023f0c29903c3e4555d63983d4a976f689eff9`.

### Fitted sign records

The option table at virtual address `0x00304fa0` has 20-byte records. Items 4..8
all contain configuration flag `0x0200` at record `+0x0c`; record byte `+0x10`
is respectively sponsor index 0..4. No other option selector is treated as an
advertising sign by the browser.

| Option item | Sponsor index | Authored sponsor | Native payment |
| ---: | ---: | --- | ---: |
| 4 | 0 | Peach Town Owner | 10 Cake / 1,000 units |
| 5 | 1 | Nobizo | 20 Cake / 1,000 units |
| 6 | 2 | Chocolat | 30 Cake / 1,000 units |
| 7 | 3 | Kate | 40 Cake / 1,000 units |
| 8 | 4 | Daniel | 50 Cake / 1,000 units |

### Distance producer

PAL function `0x0022fc20` consumes car movement accumulator `car+0x204`. It
always adds the truncated movement units to the general distance counter. When
the live configuration flags contain `0x0200`, it also reads the fitted option's
sponsor byte and adds the same units to save counters beginning at `save+0x65c`.
It then clears `car+0x204`.

The movement accumulator producer at `0x0021d4d4..0x0021d4e8` adds the absolute
value of `car+0x1b8`. The browser physics is not a PS2 fixed-point reimplementation;
its explicit bridge is successful travelled world distance, whose existing unit
scale is metres. Failed collision moves and developer teleports are excluded.

### Redemption callback

Dialogue action handler `0x0023d458` launches callback `0x0023bad0`. The callback:

- selects the sponsor counter using action operand 0;
- computes `blocks = trunc(counter / 1000)`;
- retains `counter - blocks * 1000`;
- credits `blocks * 10 * (sponsorIndex + 1)` Cake through helper `0x0023f7b8`;
- uses action operand 1 as the authored return dialogue slot.

The five sponsor entities all place this action at dialogue slot `07`:

| Area / local slot | Entity | Action |
| --- | --- | --- |
| 1 / 12 | Owner | `0x16 [0,8,0]` |
| 2 / 16 | Nobizo | `0x16 [1,8,0]` |
| 3 / 17 | Chocolat | `0x16 [2,8,0]` |
| 6 / 19 | Kate | `0x16 [3,8,0]` |
| 7 / 14 | Daniel | `0x16 [4,8,0]` |

Their authored text independently states 10, 20, 30, 40 and 50 per kilometre,
matching the callback arithmetic exactly.

## Browser integration

- `commerceProgress.ts` owns the five integer counters and exact redemption.
- `drivingGame.ts` exposes monotonic successful travel without counting teleports.
- `main.ts` accrues only for a currently fitted native sign and invokes redemption
  once when the authored action boundary opens.
- sub-unit browser movement is carried per sponsor during a driving session;
  persistent state remains integer native-style distance units.
- schema 9 persists the five counters alongside Cake, equipment and dialogue state.

## Deterministic validation

- full gate: 30/30 Vitest files, 159/159 tests;
- production build: 47 modules;
- sandbox capture bundle: 41 modules, 1,517.63 kB;
- PAL trace: all five sponsor slot-07 action operands and authored payment text;
- Peach Owner room capture: 1280×960, 2,319,467 bytes,
  SHA-256 `a7c4886c290c6a50a3d1f5edb2964fd0cbcf9def691379b13559852912b5e92b`;
- visual inspection: passed; room, live cars and café scenery compose cleanly.

No original PAL executable, BIN/CUE data, or captured PAL assets are included in
the source handoff.
