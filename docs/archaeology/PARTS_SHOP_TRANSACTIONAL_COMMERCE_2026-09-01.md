# RTA transactional Peach Parts Shop commerce — 2026-09-01

## Result

The active Three.js/TypeScript runtime now makes the reconstructed Peach Parts
Shop a real direct-purchase host. The original nine local stock entries use
their native indexed-ownership coordinates, reject unaffordable purchases
without mutation, debit the original base price once, and persist Cake plus
ownership quantities through recovered save schema 4.

Purchase intentionally does not equip the selected part. Trade/exchange remains
deferred because it belongs to a different native host with teammate-slot and
context-adjusted valuation semantics.

## Native executable evidence

The PAL base-price helper at `0x00245268(category,item)` dispatches categories
0–14 through the jump table at `0x0030ac20`. Category 0 is bodies; categories
1–14 follow the original equipment ordering: tyres, engine, chassis,
transmission, steering, brakes, wheels, lights, wing, special parts, options,
stickers, horns and meters.

The executable's static price records independently confirm the relevant
indices: tyre records begin `[200,1000,2000,5000,10000,2000,3000,500,…]`,
engine begins `[200,500,…]`, steering `[200,500,…]`, brakes
`[500,1000,…]`, wheels `[500,500,500,…]`, horns `[0,1000,…]`, and meters
`[0,100,…]`. The UI's documented prices therefore match the exact coordinates
used for ownership, not merely name-list positions inferred by the browser.

The ordinary direct-purchase host is `0x0026c550`:

- `0x0026c674` calls `0x00245268(category,item)` for the base price;
- `0x0026c6b8` checks the selected player's Cake;
- `0x0026c6e8` calls `0x0023f0a8(category,item,slot)` to test ownership;
- the confirmed path at `0x0026c7c0` calls
  `0x0023ee20(category,item,slot)` to set ownership;
- `0x0026c7d4` calls `0x0023f7b8(basePrice,slot)` to debit Cake.

That path contains no saved equipped-selector write. This matches the Body Shop
finding: buying and equipping are separate native operations.

The ownership helpers reveal a category-sensitive layout that the initial
boolean model did not capture. Namespaces 0 (bodies) and 15 (quest inventory)
use a single bit per item. Equipment namespaces 1–14 use five parallel 32-bit
planes; `0x0023ee20` fills the first free plane, `0x0023eef0` removes one copy
from the highest occupied plane, and `0x0023f0a8` reports full only when the
fifth plane is set. Ordinary Parts Shop purchase therefore permits up to five
copies rather than rejecting the second copy.

New-game setup independently confirms the quantity interpretation. The loop at
`0x00229398` calls the setter twice for item 0 in each category 1–7, producing
two Normal Tyres, Engines, Chassis, Transmissions, Steering sets, Brake sets and
Wheels. The browser now seeds that exact inventory for fresh and pre-schema-4
saves.

The neighbouring host at `0x0026be10` is not the ordinary buy path. It calls
the context/exchange helper `0x002456e8`, consults both player slots, and can
clear one slot's ownership, credit value, set ownership in the opposite slot,
and debit that slot. The formerly unknown `0x70701018` instruction is R5900
`mult1 v0,v1,s0`; the ordinary multiply at `0x00245748` is the R5900
three-operand `mult a1,v1,v0`. With `difference = selectedScore - otherScore`,
the exact integer formulas are:

- seller credit: `basePrice * (difference + 3000) / 4000`;
- recipient debit: `basePrice * (2000 - difference) / 2000`.

Both divisions truncate toward zero. The formula is regression-covered in the
web commerce module, and `mips_probe.py` now decodes the relevant R5900
three-operand `mult`/`mult1` forms.

The composite score producer `0x0023ebb8` is now exact as well. It combines
three signed slot bytes, ten low flag bits, three 128-bit population counts and
25 small state values using executable table weights `[8,4,4,3,2,1]`. The web
implementation preserves offset-labelled inputs until their native producers
have safe gameplay names. Runtime trade remains deferred because those input
producers, teammate selection/state and exchange UI are not yet represented
completely; no value is guessed. Full arithmetic is recorded in
`PARTS_TRADE_COMPOSITE_SCORE_2026-09-01.md`.

## Peach ownership coordinates

The original category catalogue order and PAL stock data establish:

| Stock item | Category | Item index | Price |
| --- | ---: | ---: | ---: |
| Sports Tyre | 1 | 1 | 1,000 Cake |
| Off Road Tyre | 1 | 7 | 500 Cake |
| Panther | 2 | 1 | 500 Cake |
| Quick | 5 | 1 | 500 Cake |
| Soft Pad | 6 | 1 | 1,000 Cake |
| Mesh | 7 | 1 | 500 Cake |
| Spoke 1 | 7 | 2 | 500 Cake |
| Air Horn | 13 | 1 | 1,000 Cake |
| Digital Meter | 14 | 1 | 100 Cake |

Correction from the later full-table census: Off Road Tyre is index 7, not 6
or the development-list position 2. The full native tyre catalogue places
Semi-Racing, Racing, HG Racing, Wet and HG Wet between Sports and Off Road;
index 6 is HG Wet (3,000 Cake), while index 7 is Off-Road (500 Cake).

## Web implementation

- `ShopPartStockItem` now carries `nativeCategory` and `nativeItemIndex`.
- The shared atomic `purchaseIndexedItem` transaction is used by both Parts
  Shop and Body Shop.
- Parts Shop shows live Cake, owned copy counts, five-copy capacity, purchase
  controls and explicit purchased/full/insufficient feedback.
- Keyboard `E`, Enter and Space invoke purchase; mouse purchase uses the same
  handler.
- A successful mutation enters the existing serialized OPFS save queue.
- Recovered save schema 4 records `[namespace,index,count]`; later schema 5
  retains that representation and adds native selector blocks. Schema 1–3 flags
  migrate as one copy, while the proven two-copy normal inventory is seeded by
  the runtime loader.
- No purchase changes `development-parts.json` or the equipped loadout.

## Validation

- Vitest: 26/26 files and 107/107 tests passed.
- TypeScript/Vite production build: passed (42 modules).
- Sandbox capture bundle: passed (36 modules, 1,465.17 kB).
- Regression coverage locks all nine native ownership coordinates and confirms
  equipment copy increments, five-copy rejection, one-copy-at-a-time removal,
  schema migration and multi-copy reload behavior.
- Chrome Headless Shell 151.0.7922.34 + SwiftShader produced the 1280×960 Peach
  Parts Shop capture at 2,689,255 bytes with SHA-256
  `4b61e8053c9af0329af09e7c59ecf482c0560e40307e1c4a865d446dd333e44d`,
  exactly matching the previous deterministic baseline.
- Visual inspection passed: authored scenery and textures, both live cars,
  camera staging and geometry were coherent; no blank frame or catastrophic
  rendering failure was present.

## Explicit remaining boundary

Do not implement trade or auto-equip from the purchase path. The exact fitting
callback, three persisted selector blocks and `0x0023ebb8` score arithmetic are
now known. The next safe trade task is to map the recovered score fields'
native producers plus teammate/save-slot selection before connecting the
exchange host. Full native catalogue and category-side-effect mapping also
remain incomplete; sparse indices must not be shifted or guessed.

The first selector boundary is now narrower. Post-text action table
`0x003013a0` maps opcode `0x04` to handler `0x0023d240`; it registers callback
`0x0023b150` in host mode 9. That callback builds the available player/team-car
list and returns the chosen car slot to its host context. It does not write any
equipment selector. The still-untraced next host transition after that team-car
choice owns the actual part fitting writes, so the browser must not treat action
`0x04` itself—or a Parts Shop purchase—as the native equip callback.
