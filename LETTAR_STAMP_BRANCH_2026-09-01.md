# Lettar stamp-branch reconstruction — 2026-09-01

## Scope

This tranche remained inside the generic fixed-SHOP milestone. It added the
minimum runtime state check required by White Mountain Lettar and a targeted
deterministic room regression. It did not invent the unrecovered activity state
that makes Lettar offer the birthday-package delivery in normal play.

## Executable evidence

The PAL pre-text dispatcher maps opcode `0x06` to handler `0x0023c958`. The
handler reads a stamp ID, calls `0x0023f188`, and branches to its second operand
when that helper reports the stamp is present. Helper `0x0023f188` checks the
original stamp bitset at `0x01825498` using `stampId - 1`.

White Mountain area 6, fixed slot 09, dialogue slot 01 contains:

- pre-text `0x06 [65,7]` — branch to slot 07 when stamp 65 is present;
- slot 07 post-text `0x07 [0,33]` — grant indexed progress bit 0:33.

The same entity's slot 03 choice index 0 reaches slot 04 and post-text
`0x07 [15,46]`, granting the birthday package used by Peach Jousset. Jousset's
already-validated success path consumes item 46 and awards stamp 65. This
establishes the data-backed loop:

`Lettar package 46 -> Jousset -> stamp 65 -> Lettar thank-you -> bit 0:33`.

The ordinary path that selects Lettar slot 03 still depends on an unrecovered
interaction/activity-state producer. This checkpoint exposes and validates the
proven slot path without making slot 03 the default or fabricating that state.

## Runtime change

- Added `BranchIfStampSet = 0x06` to the TypeScript and C# PAL pre-text enums.
- Added `DialogueRuntimeState.hasStamp` and exact opcode-06 branching to the
  shared fixed-interior dialogue flow.
- Extended the deterministic sandbox input with initial stamp IDs.
- Extended `shop_regression.py` state expectations with `initial_stamps` and
  explicit choice paths.
- Added `white-mountain-lettar` as the eighteenth named deterministic room.

No rendering semantics or Q's Factory behaviour changed.

## Validation

- Targeted Lettar PAL regression passed its entry metadata and all 18 decoded
  variants / 8 distinct post-action shapes.
- Slot 03, choice 0 reached the proven action `0x07 [15,46]` and produced
  indexed item 15:46.
- Slot 01 with initial stamp 65 branched to slot 07, retained stamp 65, and
  produced indexed bit 0:33.
- 1280x960 capture: 2,420,875 bytes.
- SHA-256: `1940bc633120fee261155806c4f94840c9884ff291b85de064a4a906d270cb36`.
- Visual inspection passed: the authored post-office/shop room, wood floor,
  counter/walls, staff postal truck, player car and fixed camera are coherent;
  geometry and textures are visible with no blank or catastrophic rendering.
- Web unit suite: 25 files / 94 tests passed. Production and sandbox capture
  bundle builds passed.
- The complete 18-room PAL/Chrome regression passed two deterministic captures
  per room, exact baseline hashes, PNG validation and all dialogue/state checks.

## Remaining boundary

Recover the interaction-local state producer that selects Lettar's delivery
invitation before claiming the complete quest as reachable from ordinary
overworld entry. Nearby pre-text opcode `0x04` checks interaction-local state
through `0x0023f158`; pre-text `0x15` writes a separate bitset through
`0x0023f290`. Their user-facing semantics are not named in this checkpoint.
