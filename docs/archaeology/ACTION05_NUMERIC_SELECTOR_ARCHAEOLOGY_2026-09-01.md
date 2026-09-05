# RTA action-05 numeric selector archaeology — 2026-09-01

Post-text dialogue action `0x05 [expected, matchSlot, mismatchSlot]` is now
recovered end to end. It is one native 0–99 numeric selector in both its
nonzero and all-zero forms; the all-zero form is not a separate quest-item
conditional.

## Native executable trace

- Post-text dispatch table `0x003013a0` maps opcode `0x05` to handler
  `0x0023d568`.
- The handler registers callback `0x0023be00`, passing the three dialogue
  operands unchanged.
- Callback initialization sets the selected value to `1`.
- The up/down input paths decrement toward `0` and increment toward `99`, with
  explicit endpoint guards.
- On confirmation, the callback compares the selected value with operand 0.
  A match returns operand 1; a mismatch returns operand 2.
- Therefore Laz's `[22,9,8]` means exactly `22 -> slot 09`, any other number
  `-> slot 08`.
- `[0,0,0]` uses the same selector. Both outcomes return slot zero, so the
  interaction ends after confirmation. No ownership, quest-item, Cake or save
  write occurs in this callback.

## Runtime implementation

The ordinary fixed-room host now presents the recovered 0–99 selector, starts
at 1, clamps at 0/99, supports keyboard and pointer input, and follows the
native match/mismatch target. Explicit `interiorProbe` URLs may also provide an
`interiorSlot` for deterministic inspection of a decoded stream that is not
reachable from ordinary entry without later quest-state producers.

Pure regression tests cover initial value, both clamps, match/mismatch routing
and the `[0,0,0]` exit result.

## PAL browser validation

Chrome Headless Shell 151 + SwiftShader opened Mushroom Road Laz directly at
decoded slot 07:

- value `22` reached original slot `0x09`;
- initial value `1` reached original slot `0x08`;
- no page error or WebGL failure occurred.

The 1400×1100 UI capture is 1,481,140 bytes with SHA-256
`a456553606bd044dbc0830a8e043e7961771f07eb999aa800242a74aff8cb12f`.
Visual inspection found the textured Laz room, live Laz/player cars, sensible
camera, readable dialogue/selector UI and no catastrophic rendering failure.

This closes the former action-05 host-semantics limitation. It does not by
itself recover the interaction-local state producers that expose every later
quest stream during ordinary entry.
