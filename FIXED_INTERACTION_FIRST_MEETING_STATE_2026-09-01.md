# Fixed-interaction first-meeting state — 2026-09-01

## Result

PAL pre-text opcode `0x04 [target]` is now executable-proven as **branch if the
current fixed interaction has not yet been met**. The active Three.js runtime
implements the condition, clears it at the native lifecycle boundary and
persists the inverse set of completed meetings.

This closes the previously missing ordinary-entry selector for White Mountain
Lettar and Emily. It also restores the authored first-meeting introductions for
other reconstructed rooms such as Jousset, Fight, the Peach policeman, Captain
Rombo, the Sandpolis Shop Manager and Mr. King, Picarl, Laz and Papaya Flower.

## Native evidence

- Dispatcher `0x0023c870`, opcode-4 handler `0x0023c918`, loads signed area
  index from interaction runtime offset `+35` and local fixed slot from `+33`.
- It calls `0x0023f158(area, slot)`. The helper rejects slots >= 32, loads word
  `0x01825b58 + area*4`, and tests bit `1 << slot`.
- The handler branches to its sole stream operand when the helper returns
  nonzero. A zero bit continues parsing the current entry stream.
- Writer `0x0023e310` uses the same runtime offsets and clears exactly
  `1 << slot` in the same area word. Its calls occur on the fixed-interaction
  opening/transition paths, including `0x0022cc38`, `0x0022cd6c`,
  `0x0022d05c`, `0x0022e474`, `0x0023cbfc` and `0x0023d154`.
- The clearing direction resolves the polarity: a set bit is a pending first
  meeting, not an already-visited flag. The browser stores the inverse
  `metFixedInteractions` set so a new recovered save naturally begins with no
  completed meetings.

The dialogue streams independently agree with that result. Lettar slot 01 has
`0x04 [2]`, where slot 02 is his full accident/package introduction; Emily
slot 01 has `0x04 [6]`, where slot 06 is her full Papu-flower introduction.
Once their meeting bit is cleared, slot 01 proceeds to item/stamp conditions.

## Runtime and persistence

- `DialogueRuntimeState` records `(areaIndex, localIndex)` meeting completions.
- `DialogueFlow` observes the pre-open value while resolving its entry stream,
  then marks the fixed interaction met, matching the native read-before-clear
  lifecycle.
- Recovered save schema 8 adds sorted `metFixedInteractions` pairs. Schemas
  1–7 still migrate without fabricating completed meetings.
- The sandbox inspector accepts and returns this state, so returning-visit
  quest branches are deterministic regression inputs rather than hidden setup.

## Validation

- Web tests: 28 files / 127 tests passed.
- Production Vite build passed.
- Sandbox capture bundle build passed.
- The complete 20-room deterministic suite passed. Every room captured twice
  byte-for-byte and retained its verified 1280x960 SwiftShader SHA-256.
- Fresh Lettar entry resolves to slot 02; persisted return with stamp 65 resolves
  through slot 01 to slot 07 and grants `[0,33]`.
- Fresh Emily entry resolves to slot 06; persisted return with stamp 64 resolves
  through slot 01 to slot 09.
- Lettar and Emily captures were visually inspected: authored room textures,
  geometry, staff/player cars and cameras remain coherent with no catastrophic
  rendering failure.

No rendering semantics or room assets changed in this tranche.
