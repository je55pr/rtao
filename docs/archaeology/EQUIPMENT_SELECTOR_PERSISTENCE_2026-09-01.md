# RTA native equipment-selector persistence — 2026-09-01

This tranche recovers the original equipment-write boundary without changing
Body Shop or Parts Shop purchase semantics. Direct purchase remains ownership
plus Cake only; original reward/dialogue action `0x15` and Q's Factory's fitting
callback are the proven selector-writing paths.

## Executable evidence

- Native helper `0x0023df78` receives `(configurationBase, category, item)`.
  Its first store is `sb item, 0x0c(configurationBase + category)`, followed by
  category-specific configuration flag updates.
- The three native configuration blocks begin at save offsets `+0x00`, `+0x1c`
  and `+0x38`; their fifteen selector bytes therefore live at `+0x0c`, `+0x28`
  and `+0x44`.
- Post-text dispatch table `0x003013a0` maps action `0x15` to handler
  `0x0023d4a8`. It passes operand 0 as category and operand 1 as item to
  `0x0023df78` for the first car, then uses operand 2 as the dialogue return
  slot.
- Q's Factory callback `0x0022d140`–`0x0022d3b8` calls the same helper. Its
  ordinary fitting path at `0x0022d2b0` passes the selected category/item and
  selected configuration block; category 13 has a special adjacent path at
  `0x0022d280`.
- Confirmed Body Shop purchase at `0x0026cae0` and Parts Shop direct purchase
  at `0x0026c7c0` still contain no call to this helper. They must not auto-equip.

## Original dialogue examples

The PAL dialogue census pairs several ownership grants with exact equipment
writes:

| Interaction | Grant | Equip and return |
|---|---:|---:|
| Peach Owner | `0x07 [11,4]` | `0x15 [11,4,9]` |
| Nobizo | `0x07 [11,5]` | `0x15 [11,5,9]` |
| Chocolat | `0x07 [11,6]` | `0x15 [11,6,9]` |
| Kate | `0x07 [11,7]` | `0x15 [11,7,9]` |
| Daniel | `0x07 [11,8]` | `0x15 [11,8,9]` |
| Seidon | grants `[10,1]` and `[9,1]` | equips `[10,1]`, then `[9,1]` |

This confirms that action `0x15` is not a conditional check: it is the fitting
mutation paired with already-proven indexed ownership where the script needs a
new reward fitted immediately.

## Browser implementation

- `RecoveredEquipmentState` models all three native fifteen-byte selector
  blocks with byte/category/loadout validation and revision tracking.
- Recovered save schema 5 serialises `equipmentSelectors` alongside Cake,
  indexed ownership and stamps. Schema 1–4 saves migrate to zeroed selector
  blocks without inventing equipped items.
- Generic fixed interiors apply action `0x15`, queue the same atomic OPFS save,
  present the original category/item fitting boundary, and follow operand 2.
- Regression coverage includes selector validation, action application,
  all-three-block round-trip, schema-4 migration, the paired Owner
  ownership/equip mutation and the authored host return edge.

## Validation

- Vitest: 27/27 files, 114/114 tests passed.
- TypeScript/Vite production build passed.
- Sandbox capture bundle build passed.
- Chrome Headless Shell 151 + SwiftShader opened Peach Owner at slot 06. The
  live UI displayed `I'll put it on for you.`, action `0x15 [11,4,9]`, and a
  `Return to Owner` edge.
- OPFS contained schema 5 with first-loadout selector 11 equal to 4; the other
  selector bytes remained zero.
- The 1400×1100 screenshot is 1,284,143 bytes, SHA-256
  `fa981b8d9cb0e906e18352912fd17fe2b2cedbd80781c1c4b13386143a1367bf`.
  Visual inspection passed: authored textured room/floor, live cars, sensible
  camera and readable action UI, with no blank or catastrophic rendering.

## Remaining boundary

The recovered selector blocks are exact persistence state, but the existing
development `PartLoadout` catalogue still uses descriptive string IDs. Do not
claim that every native selector byte has been mapped onto the current runtime
appearance/handling definition until the complete native item catalogue and
category-specific flag side effects are mapped. Q's Factory can then move from
its separate development save to these native selectors without guessing.

Later the same day, `NATIVE_EQUIPMENT_CATALOGUE_BRIDGE_2026-09-01.md` mapped
the exact Options 0–8 set and other high-confidence identities, corrected
Off-Road Tyre from `(1,6)` to `(1,7)`, and connected those known nonzero
selectors to runtime appearance. The complete catalogue/flag boundary remains.
