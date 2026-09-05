# RTA persistent indexed dialogue progress — 2026-09-01

## Result

The executable-proven indexed dialogue state is now shared by all fixed SHOP
interiors and persisted inside the current browser install. This turns the
Sandpolis football exchange into the first ordinary cross-interior quest chain
whose original item producer and consumer can operate during normal play:

1. Shop Manager's original “All right” path reaches action `0x07 [15,39]`.
2. The browser records indexed flag `[15,39]` and writes the recovered state to
   `save/recovered-dialogue-state.json` in the install's private storage.
3. A later room or browser reload restores that flag.
4. Mr. King's original slot-03 check branches to slot 04 and pre-text
   `0x11 [15,39]` consumes the football; the changed state is saved again.

Only the proven indexed flag store is serialised. Cake, owned parts, ordinary
flags and other save fields remain outside this schema until their original
ownership and mutation paths are traced.

## Executable proof for action 07

The post-text dispatcher at `0x0023d078` uses jump table `0x003013a0`.
Entry 07 points to `0x0023d408`. That handler registers callback
`0x0023b840` with the two operand bytes.

The callback reaches:

```text
0x0023ba24  lbu a1, 1(s2)       # index
0x0023ba28  move a2, zero       # state page 0
0x0023ba2c  jal 0x0023ee20      # indexed-bit setter
0x0023ba30  lbu a0, 0(s2)       # namespace
```

`0x0023ee20` computes the same indexed bank/bit address used by the already
proven clear helper `0x0023eef0` and test helper `0x0023efe8`, then ORs the bit
into the selected word. Action 07 is therefore named `GrantIndexedFlag` in the
TypeScript and reference C# enums.

## Implementation

- `DialogueRuntimeState` now exposes deterministic indexed-flag entries and a
  mutation revision while keeping set/clear idempotent.
- `dialogueProgress.ts` owns the narrow schema, sanitised restore, snapshot and
  proven action-07 host mutation.
- Generic rooms and Q's Factory share one recovered runtime state.
- Every room entry, choice, host return and action-07 mutation queues a small
  ordered OPFS write when the indexed revision changes.
- The action-07 UI reports a quest item for namespace 15 and an original reward
  for other banks; it does not invent a dialogue return edge.
- The sandbox inspector can optionally apply the external action and reports
  the complete resulting indexed store.

## Validation

- Web tests: 25/25 files, 90/90 tests.
- Vite production build: passed.
- Sandbox capture bundle: passed.
- Complete readiness census: 235/235 mapped interactions, zero deferrals.
- Full 17-room double-capture regression: passed with every established hash
  unchanged.
- PAL-backed host mutation checks:
  - Shop Manager grants `[15,39]`.
  - Mr. King consumes `[15,39]`.
  - Peach FM consumes `[15,24]` and grants `[15,11]`.
  - Flower consumes `[15,41]` and grants `[15,1]`.
  - Fight consumes `[15,31]` and grants `[0,150]`.

Shop Manager and Mr. King were visually re-inspected at 1280×960. Their room
geometry, textures, live cars and fixed cameras remain coherent; no blank or
catastrophic rendering failure was present.

## Remaining boundary

This implements persistence for a proven state table, not a speculative full
memory-card model. At this checkpoint action `0x0d`, zero-mode action `0x05`,
Cake/ownership and ordinary save flags were separate archaeology tasks; later
checkpoints recovered stamps, Cake/ownership, the numeric selector, and native
equipment-selector persistence without expanding to a speculative full save.
