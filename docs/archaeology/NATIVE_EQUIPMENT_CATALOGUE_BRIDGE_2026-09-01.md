# RTA native equipment catalogue bridge — 2026-09-01

This follow-up corrects one earlier Peach Parts Shop coordinate and connects
executable-proven nonzero equipment selectors to the existing Three.js
appearance layer where the mapping is exact.

## Off-Road Tyre correction

The earlier transactional note/code used `(category 1, item 6)` for Off Road
Tyre. Re-reading both native tables proves that coordinate is one slot early:

- English tyre records start at `0x003053d0`, stride 28.
- Base-price records start at `0x00301638`, stride 28; helper `0x00245268`
  reads the first word of the indexed record.
- The complete English order is:

| Item | Name | Cake |
|---:|---|---:|
| 0 | Normal | 200 |
| 1 | Sports | 1,000 |
| 2 | Semi-Racing | 2,000 |
| 3 | Racing | 5,000 |
| 4 | HG Racing | 10,000 |
| 5 | Wet | 2,000 |
| 6 | HG Wet | 3,000 |
| 7 | Off-Road | 500 |
| 8 | HG Off-Road | 3,000 |
| 9 | Studless | 1,000 |
| 10 | HG Studless | 3,000 |
| 11 | Big | 5,000 |
| 12 | Devil | 200,000 |

Thus Peach's 500-Cake Off Road Tyre is ownership coordinate `(1,7)`. The old
note's own written list named HG Wet between Sports and Off Road but then
miscounted the index. Catalogue data, transaction tests and canonical state are
corrected to `(1,7)`; no migration is attempted from `(1,6)` because that would
silently convert legitimately owned HG Wet tyres.

## Exact Options catalogue

The English Options records at `0x00307dc0` and native configuration table at
`0x00304fa0` establish selectors 0–8:

| Item | Name | Recovered role |
|---:|---|---|
| 0 | None | no option |
| 1 | Water Ski | water driving; propulsion dependency |
| 2 | Flight Wing | flight with jet turbine |
| 3 | Police Light | roof light |
| 4 | Sign | Peach Town café advertising |
| 5 | Sign | Fuji City noodle-café advertising |
| 6 | Sign | Sandpolis bakery advertising |
| 7 | Sign | White Mountain wool-shop advertising |
| 8 | Sign | Papaya Island coconut-shop advertising |

This matches the action-15 reward census: Owner fits item 4, Nobizo 5,
Chocolat 6, Kate 7 and Daniel 8.

## Runtime bridge

- The development catalogue now exposes the exact nine Options entries while
  retaining its explicit provisional-performance status.
- A narrow mapping covers native selectors whose existing runtime definition
  is confidently identifiable. Sparse indices are preserved; notably Off-Road
  is 7, not shifted to the development list position.
- Loading schema-5 state applies known nonzero selectors over the older
  development loadout. An action-15 mutation applies the same mapping live,
  updates overworld/QFactory/generic-room car appearance and writes the
  compatibility development loadout as well as the exact selector save.
- Direct Parts/Body purchases remain ownership/Cake only and never call this
  bridge.

The existing billboard mesh is used for the five original Sign selectors. Its
presence/role is evidence-backed, but its small mesh/colour treatment remains a
development representation rather than an exact decoded original sign model.

## Validation

- Vitest: 27/27 files, 115/115 tests passed.
- TypeScript/Vite production build passed.
- Chrome 151 + SwiftShader reset the test selector to zero, opened Owner's
  authored slot-06 action, wrote `(11,4)`, logged the compatibility appearance
  save and rendered the Peach Town sign on the player car in the café room.
- The 1400×1100 frame is 1,284,432 bytes, SHA-256
  `8106a3b596fdcf30d864a8dcac414a9d78ac171af9cf2b36f58653678aacd31b`.
  Visual inspection passed: textured room, both cars, visible roof sign,
  sensible camera and readable dialogue/action UI, with no catastrophic
  rendering failure.
