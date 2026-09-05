# Second-hand Cake producer and Roulette boundary — 2026-09-05

## Result

Cloud Hill's authored Second-hand shop is now a complete player-facing Cake
producer for the exact part records already mapped in the browser. The original
dialogue opens a sale catalogue, one owned copy is removed per transaction, and
the player receives half the PAL base price rounded down. Ownership and Cake
persist through the existing schema-9 save. The fitted selector is deliberately
left unchanged, matching the executable even when the last owned copy is sold.

The same archaeology pass now closes Roulette's deterministic result and payout
math: the authored wager selector, debit, physical final-angle binning, pocket
number table, bet matcher, multiplier and payout credit are all identified and
locked in browser-side tests. The `ACTION/A19.BIN` scene and its physical car /
wheel simulation are not yet ported, so Roulette is not exposed as a playable
menu and no browser RNG substitutes for that activity.

## Second-hand authored path

The fixed interaction is Cloud Hill area 9, local slot 5, backed by `FLD/023`
and `SHOP/T08.BIN`. Its dialogue entity is `Second-hand shop`:

- slot 1 asks whether the player has unwanted parts;
- the affirmative branch reaches slot 2, “What do you want to sell?”;
- slot 2 hands off through action `0x13 [3]`;
- first-meeting slot 4 independently states that parts are bought for half the
  price originally paid.

Action-`0x13` callback `0x0026cd80` calls the location mapper at `0x0022c258`.
Area 9 / slot 5 resolves host code 4 and callback `0x0026be10`. That host clears
context `+0x1c`, selecting the direct player-sale path:

1. `0x0026c1f0` calls ownership helper `0x0023eef0` to remove one copy.
2. `0x0026c204` calls `0x00245268` for the item's base price.
3. `0x0026c20c..0x0026c21c` computes negative `floor(basePrice / 2)` using the
   signed correction before arithmetic shift.
4. Cake helper `0x0023f7b8` treats the negative amount as a credit and retains
   its 999,999-Cake cap.

The path contains no equipment-selector write. The browser therefore removes
ownership only and does not silently equip another part.

## Evidence-backed sale subset

The catalogue exposes only records whose namespace, item index and PAL base
price are already exact. Entries not yet mapped remain hidden rather than being
named or priced speculatively.

| Namespace/index | Part | Base price | Sale credit |
|---|---|---:|---:|
| 1/0 | Normal Tyre | 200 | 100 |
| 2/0 | Normal Engine | 200 | 100 |
| 3/0 | Normal Chassis | 200 | 100 |
| 4/0 | Normal Transmission | 200 | 100 |
| 5/0 | Normal Steering | 200 | 100 |
| 6/0 | Normal Pad | 500 | 250 |
| 1/1 | Sports Tyre | 1,000 | 500 |
| 1/7 | Off Road Tyre | 500 | 250 |
| 2/1 | Panther | 500 | 250 |
| 5/1 | Quick | 500 | 250 |
| 6/1 | Soft Pad | 1,000 | 500 |
| 7/1 | Mesh | 500 | 250 |
| 7/2 | Spoke 1 | 500 | 250 |
| 13/1 | Air Horn | 1,000 | 500 |
| 14/1 | Digital Meter | 100 | 50 |

The sale helper additionally locks the odd-price rule: base price 1,001
produces 500 Cake, not 501.

## Browser connection

- `sellIndexedPart` validates native part namespaces 1..14, rejects unowned
  items without mutation, removes exactly one copy and credits the capped Cake
  balance.
- the Cloud Hill action opens a catalogue filtered to exact entries currently
  owned by the player;
- the UI shows the floor-half offer and owned count before committing;
- a successful sale updates the catalogue, balance and persistent progress and
  explicitly reports that the fitted selector was not changed.

The deterministic PAL click-through started with two Normal Tyres and 1,000
Cake, sold one Normal Tyre for 100 Cake, and observed one copy plus 1,100 Cake.
Its visually inspected 1,440×1,000 room/catalogue capture is 1,175,444 bytes,
SHA-256 `e546ae422d8da175e8211def74fffba08b5976659f5afa36345f6d7471eb94c7`.
After the final header wording change, a fresh PAL import reached the same
catalogue and asserted `OWNED ORIGINAL PARTS`; the long whole-world cache run
then stopped only because the supplementary harness referenced the retired
`#shop-details` selector. Transaction behavior is covered independently by the
green deterministic unit suite and the preceding PAL click-through.

## Roulette wager and payout path

Sandpolis area 3, local slot 8 is `Roulette Registration`. The authored flow
offers Play, rules or exit, and slot 3 starts action `0x03 [44]`. The rules state
that the player chooses a bet and wager, the player car enters the roulette in
place of a ball, and a win earns money.

The wager host at `0x00264318` starts at zero, caps the selectable maximum to
`min(current Cake, 10,000)`, uses decimal place/power-of-ten editing, and rejects
a zero wager. Its success callback at `0x00264604` debits the exact wager through
the common Cake helper.

Payout callback `0x00264ad0` indexes 48-byte bet records at `0x002dbae8`.
`0x00264ed4..0x00264f08` reads the multiplier at record `+24` and multiplies it
by the wager/result value; the number-bet records begin with multiplier 18.
`0x00264f74..0x00264f78` sends the negative payout to the Cake helper, crediting
the full win amount.

The physical action is registered under callback ID `0x00010119`, with disc
assets in `ACTION/A19.BIN`. The extracted PAL file is 1,512,480 bytes with
SHA-256 `9808cd089953b228c98105f4993b7ebfc1ba27d9c709e13194859464c13b9326`.

## Physical result and exact matcher

The activity update at `0x002637e8` reaches result state 6 after the player car
settles. At `0x00263b60..0x00263be8` it:

1. obtains the final car direction around centre `(400, 400)` through `atan2`;
2. converts radians to signed Q15 turns with `angle / pi * 32768`;
3. subtracts the wheel angle stored in the activity state, adds half a pocket
   (`1,638`), masks to unsigned 16-bit, and divides by `3,276`;
4. passes that physical pocket index to the sole matcher at `0x00265048`.

The wheel's twenty ordinary pockets map through the table at `0x002dbf38`:

`0, 6, 8, 18, 10, 4, 12, 16, 14, 2, 0, 5, 7, 17, 9, 3, 11, 15, 13, 1`.

Since `3,276 * 20 = 65,520`, the final sixteen Q15 ticks produce index 20.
The adjacent executable word is zero, so the browser preserves this narrow
zero alias instead of silently applying a guessed modulo.

Matcher `0x00265048` implements all 23 bets:

- bet indices 0..17 match pocket number minus one and pay 18×;
- indices 18..20 match six-number groups computed as
  `trunc((number - 1) / 6) + 18` and pay 3×;
- indices 21..22 match the two physical colour indices and pay 2×. The first
  ten pockets use index parity; the second ten plus wrap alias use flipped
  parity.

This retains native quirks, including both ordinary zero pockets, the narrow
index-20 zero alias, and signed division that maps zero into group bet 18. The
browser helper returns the full winning credit; the wager was already debited,
exactly like the PAL host.

`web/src/game/roulette.ts` materialises this pure evidence layer. It is not
connected to the dialogue until the physical `A19` scene, wheel state and car
settling path can supply the two native Q15 angles.

## Validation

- Full browser gate: 34/34 test files and 181/181 tests.
- Production Vite build: 50 modules.
- Sandbox capture bundle: 43 modules, 1,521.40 kB.
- Tests cover odd-price floor rounding, one-copy removal, zero-copy rejection,
  capped Cake credit, exact normal-record prices, owned-entry filtering and the
  contextual action-`0x13 [3]` host presentation.
- Roulette tests lock the physical pocket order, half-pocket angle rounding,
  index-20 edge alias, all three matcher classes, native zero behavior, payout
  multipliers and the Cake/10,000 wager cap.
