# Fixed-interaction zero-target host trace — 2026-09-02

## Result

The native PAL post-text trace rules out an implicit quest-continuation jump
for Emily's `0x02 [0,0]` and rules out treating Lettar's `0x03 [0]` as a hidden
dialogue-slot selector. The browser must not invent `Emily -> slot 02` or
`Lettar -> slot 03` at either boundary.

This is a useful negative result: both authored quest slots remain valid and
independently regression-tested, but their ordinary-play producer is still an
external interaction/activity-state edge that has not been recovered.

## Native action-02 trace

- The post-text dispatcher at `0x0023d078` uses jump table `0x003013a0`.
- Opcode `0x02` dispatches through `0x0023d548`, passing the two-byte operand
  pointer to callback `0x0023d7f0`.
- `0x0023d7f0` wraps the common two-choice callback `0x0023aa68` and writes
  selection index 1, which proves the second choice is the native default.
- On confirmation, `0x0023aa68` reads `operands[selectedIndex]` at
  `0x0023ab24..0x0023ab40` and writes that byte as the next dialogue target.
- Therefore `[0,0]` produces target zero for **both** Yes and No. Target zero
  ends the dialogue. It does not mean "use the next pointer-table slot" and it
  does not retain an alternate hidden target.

The TypeScript VM now has a direct regression proving that both choices on a
zero-target action end at slot zero.

## Native action-03 trace

Opcode `0x03` dispatches to `0x0023d0a0`. Its one operand is copied into the
host-action parameter field after confirmation; zero is the common ordinary
fixed-interaction exit form already seen across Bartender, Barkeeper, Lettar
and many other NPC entities. It is not a same-entity pointer-table jump.

## Remaining archaeology boundary

Still missing is the producer which makes the original game expose:

- Lettar slot 03, the birthday-package delivery offer;
- Emily slot 02, the Papu-flower delivery request/reward chain.

The first-meeting bit only chooses Lettar slot 02 and Emily slot 06 on a fresh
meeting, then is cleared. The post-text zero targets close those introductions.
No evidence in these callbacks selects the quest slots. Recovering them now
requires tracing the owning activity/quest-state producer outside the dialogue
VM, ideally from a native caller or original-game sequence. Until then the
internal slot paths remain test fixtures rather than claimed ordinary entry.

No rendering or runtime quest semantics were changed as a result of this
trace.
