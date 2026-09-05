# RTA quest-inventory dialogue VM trace — 2026-09-01

## Result

The Peach Policeman and Peach FM item gates are now identified at executable
handler level. The user's observation that both rooms are quest-item related
was correct, but the condition is not post-text action `0x05` itself.

The original PAL stream uses two separate, phase-sensitive operations:

| Phase/opcode | Operands | Proven behavior |
| --- | --- | --- |
| pre-text `0x03` | `[namespace, bit, targetSlot]` | Branch to `targetSlot` when the indexed state bit is set. |
| pre-text `0x11` | `[namespace, bit]` | Clear the indexed state bit. |
| post-text `0x05` | `[value, successSlot, failureSlot]` | Enter a separate original answer/selection UI callback; nonzero form is proven as Laz's numeric windmill answer. Zero form remains a host boundary. |

Namespace `15` is the quest-inventory bit set in the traced conversations.
The PAL text and branch/clear pairs identify:

- item 23: Tim's missing wallet;
- item 24: Peach FM voucher;
- items 32–38: Adventure Jones's seven gemstones;
- item 41: flower seed.

## Executable trace

The pre-text dispatcher is at PAL virtual address `0x0023c870`; its 29-entry
jump table is at `0x00301310`.

- opcode `0x03` dispatches to `0x0023c900`. It calls `0x0023efe8` with the first
  two operands and state page zero, then redirects through the third operand
  when the result is nonzero.
- `0x0023efe8` computes an indexed bit address below `0x01825bb0` and returns
  whether the selected bit is set.
- opcode `0x11` dispatches to `0x0023cb98`. It calls `0x0023eef0` with the two
  operands and state page zero.
- `0x0023eef0` addresses the same indexed bit store and clears the selected
  bit. This is the original item-consumption edge in the success variants.

The post-text dispatcher is at `0x0023d078`, with its 25-entry jump table at
`0x003013a0`. Action `0x05` dispatches via `0x0023d568` and registers callback
`0x0024be00`, passing the three-byte operand pointer. Laz uses
`0x05 [22, 9, 8]` immediately after asking the number of windmills, proving
the nonzero numeric-answer/result form. Its zeroed use at quest-item prompts is
not treated as the item predicate.

## Runtime and regression work

The TypeScript VM now preserves PAL indexed flag banks in
`DialogueRuntimeState`, executes pre-text branch `0x03`, and executes pre-text
clear `0x11`. The symbolic names are `BranchIfIndexedFlagSet` and
`ClearIndexedFlag`; the historical C# decoder enum was renamed consistently.

The sandbox dialogue inspector can seed a start slot and indexed flags. The
named room regression now proves against the real PAL executable that:

- Policeman, starting at slot 03 with `[15,23]`, redirects to slot 04, displays
  the Tim's-wallet success stream, reaches action `0x0d [5]`, and consumes the
  wallet bit.
- Peach FM, starting at slot 03 with `[15,24]`, redirects to slot 04, displays
  the voucher/Peach-Doll success stream, reaches action `0x07 [15,11]`, and
  consumes the voucher bit.

Both 1280×960 room renders retained their exact verified hashes. Visual
inspection found coherent geometry, textures, camera and live cars with no
catastrophic rendering failure.

## Deliberate limitation

The broader player save/inventory producer is not yet reconstructed, so normal
fresh browser play does not invent wallet or voucher ownership. The dialogue
VM and PAL-backed deterministic test are ready for that state to be connected
when the original save fields are recovered. A later trace established
post-text action `0x05 [0,0,0]` as the native 0–99 selector with two zero return
targets and no inventory/save mutation.
