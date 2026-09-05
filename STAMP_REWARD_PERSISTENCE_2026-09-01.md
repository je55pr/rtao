# RTA stamp reward persistence — 2026-09-01

## Result

Post-text action `0x0d` is now executable-proven as the original stamp-award
operation. The browser applies its single or multiple stamp IDs to the shared
fixed-interior progress state and persists them beside indexed quest flags.

This completes the reward edge for several already reconstructed item quests:

| Interaction | Input item | Original action | Persisted result |
| --- | --- | --- | --- |
| Peach Policeman | wallet `[15,23]` | `0x0d [5]` | stamp 5 |
| Sandpolis Mr. King | football `[15,39]` | `0x0d [31]` | stamp 31 |
| Peach Jousset | birthday gift `[15,46]` | `0x0d [65]` | stamp 65 |

## Executable trace

The post-text action jump table at `0x003013a0` maps action 13 to
`0x0023d178`. The handler advances past the opcode, walks a zero-terminated
byte list and calls `0x0023e408` for every nonzero ID:

```text
0x0023d1a8  addiu s2, s2, 1
0x0023d1ac  lbu   v0, 0(s2)
0x0023d1b0  beqz  v0, end
0x0023d1b8  lbu   a0, 0(s2)
0x0023d1c0  jal   0x0023e408
0x0023d1c4  addiu s2, s2, 1
```

The helper rejects zero and duplicates, searches the existing byte list,
appends a new ID, increments its count and applies special milestone effects.
The complete 235-room census contains ordinary IDs throughout the original
stamp range plus paired awards such as `[21,22]`, `[27,28]`, `[37,38]`,
`[43,44]`, `[69,70]`, `[75,76]` and `[93,94]`. This is not an inferred generic
reward number.

## Implementation

- Action enum `0x0d` is named `GrantStamps` in TypeScript and reference C#.
- `DialogueRuntimeState` deduplicates and sorts stamp IDs.
- Recovered dialogue save schema v2 adds `stamps`; v1 indexed-only saves load
  unchanged and gain the new field on their next mutation.
- Single and paired awards have explicit host presentation and no invented
  dialogue return edge.
- The sandbox inspector reports stamps after optionally applying a host action.

## Validation

- Web tests: 25/25 files, 93/93 tests.
- Vite production build and capture bundle: passed.
- PAL targeted regressions applied and persisted stamp 5, 31 and 65 after
  consuming their original quest items.
- The corresponding 1280×960 room captures retained their exact verified
  hashes.

The remaining save work is deliberately separate: stamp milestone UI/secondary
effects, Cake, ownership, paint/body purchases and ordinary flags have not been
guessed into this schema.
