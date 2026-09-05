# RTA indexed quest success regressions — 2026-09-01

This tranche turns four dependencies from the namespace-15 census into PAL-
backed dialogue-flow regressions.

## Existing Peach rooms

- Jousset with item `[15,46]` enters the original birthday-gift success stream
  at slot 03, clears item 46, and reaches action `0x0d [65]`.
- Fight with item `[15,31]` enters the original inspiring-magazine success
  stream at slot 08, clears item 31, and reaches reward action
  `0x07 [0,150]`.

Their existing room captures remain byte-for-byte identical to the established
visual baselines.

## Sandpolis football chain

The Shop Manager (area 3/slot 13) presents the original two-choice delivery
request. Selecting “All right” reaches slot 04 and reward/item action
`0x07 [15,39]`. When item 39 is already set, entry branches to the original
slot-07 reminder without consuming the football.

Mr. King (area 3/slot 14) checks item 39 at slot 03. Possession branches to the
original slot-04 football-delivery thanks, clears item 39, and reaches action
`0x0d [31]`.

The original item acquisition/reward host screens remain explicit boundaries;
the tests do not simulate a save mutation that has not yet been connected.

## Visual validation

| Room | PNG bytes | SHA-256 |
| --- | ---: | --- |
| Sandpolis Shop Manager | 2,466,962 | `2adb2048a4a67b5ec982d842ffde4870c4f054a7bd1a78413a17ac9425a344f6` |
| Sandpolis Mr. King | 1,922,276 | `6f4a3b5dfeae07700b7b597715dbfcd1bea2f7f0d79a0a19a4d9fdd17561d4aa` |

Both captures repeated byte-for-byte. Visual inspection found coherent authored
rooms, textures, fixed camera and live staff/player cars. The sports shop has
football stock/shelving; Mr. King's mansion has football trophies, gold stairs
and furniture. No blank or catastrophic rendering failure was present.
