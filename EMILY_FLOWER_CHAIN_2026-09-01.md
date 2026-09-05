# Emily flower-chain validation — 2026-09-01

## Scope

White Mountain Emily is the nineteenth named deterministic fixed interior. This
tranche validates only paths directly present in the PAL dialogue data and the
already executable-proven indexed-item, stamp and flag operations. It does not
invent the interaction-local state transition that selects the quest-intro and
reward slots during ordinary entry.

## Proven dialogue/state paths

Emily is area 6, fixed slot 16, executable dialogue entity 16. Nine variants
contain three post-text action shapes.

1. Slot 02 checks indexed item `[15,42]` and branches to slot 07. Slot 07 clears
   that item with pre-text `0x11 [15,42]`, clears flag 52, and ends at action
   `0x07 [15,41]`. Applying the proven host mutation therefore replaces the
   delivered Papu flower with the pink-flower/seed-chain item 41.
2. Slot 05 ends at action `0x0d [64]`. Applying the proven stamp host mutation
   adds stamp 64.
3. Slot 01 contains pre-text `0x06 [64,9]`. With stamp 64 present, the shared
   runtime branches to slot 09's post-completion thank-you dialogue and retains
   the stamp.

This establishes the exact persistent state chain visible in the data:

`item 42 -> Emily -> item 41`, plus `Emily reward -> stamp 64 -> later thank-you`.

Item 41 is already consumed by Papaya Flower's validated reward path.

## Deliberate limitation

Slot 01 also contains pre-text controls `0x15 [64]`, `0x04 [6]` and
`0x01 [52,8]`; slot 03 sets flag 52. The executable traces establish that
opcode `0x04` checks interaction-local state and opcode `0x15` writes a
different bit store, but their user-facing ownership and producer path remain
unnamed. The zero-target Yes/No action `0x02 [0,0]` also depends on that host
state. This checkpoint does not make internal slots 02, 05, 06 or 07 the normal
entry point and does not persist flag 52.

## Deterministic regression

- Default entry: Emily slot 01, two decoded Yes/No choices, no external action.
- Variant count: 9.
- Complete post-action shapes: `0x02 [0,0]`, `0x07 [15,41]`, `0x0d [64]`.
- Item path: start slot 02 with item 42 -> slot 07 -> item 42 consumed -> item
  41 granted.
- Stamp producer: start slot 05 -> stamp 64 awarded.
- Stamp consumer: start slot 01 with stamp 64 -> slot 09, stamp retained.
- Capture: 2,566,864 bytes, 1280x960.
- SHA-256: `ffe4073ff43695682e9b4aba5d29579a1d0f933bba4a6bda1408bce0e8197863`.
- Repeat capture: byte-for-byte identical.
- Visual inspection: passed. The authored warm timber room, checker floor,
  stump/table furniture, wall decoration, live staff/player cars and fixed
  camera are visible and coherent with no blank or catastrophic rendering.
- Web validation: 25/25 files and 94/94 tests passed; production and capture
  bundle builds passed.
- Full PAL/Chrome validation: all 19 rooms passed two captures, exact hashes,
  PNG validation and every configured dialogue/state assertion.
