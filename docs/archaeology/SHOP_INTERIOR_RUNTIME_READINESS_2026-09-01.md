# RTA fixed-interior runtime readiness follow-up — 2026-09-01

## Task source and scope

This tranche used `/RTA/RTA_WORK_IDEAS.md` as its development queue. It stayed
inside the active Three.js/TypeScript fixed-SHOP milestone and did not reopen
outdoor day/night work.

The first selected item was “Finish Bartender as a complete original-dialogue
interior.” The existing room, cars and executable dialogue text were already
correct, but its terminal action was still labelled as an unreconstructed
activity screen.

## Repeated terminal-action evidence

Targeted PAL dialogue probes established the following initial streams:

| Area/slot | Interaction | Initial result |
| --- | --- | --- |
| 1/04 | Peach Bartender | Original coin greeting, then action `0x03 [0]` |
| 2/04 | Fuji Barkeeper | Original coin greeting, then action `0x03 [0]` |
| 2/06 | Echigoya sales assistant | Original shop-assistant dialogue, then action `0x03 [0]` |
| 2/12 | Dumpling Cake shop | Original missing-Otomi dialogue, then ordinary end |

This evidence separates zero-target action `0x03` in ordinary fixed rooms from
Q's Factory's nonzero race-start use. Generic interiors now present `0x03 [0]`
as the authored return-to-town boundary. Nonzero action-`0x03` host targets are
unchanged and remain explicit activity boundaries.

## Runtime-readiness tranche

| Interior | Room/cars | Original entry dialogue | Exit | Status |
| --- | --- | --- | --- | --- |
| Peach Bartender | complete | complete | decoded `0x03 [0]` return | ready |
| Fuji Barkeeper | complete | complete | decoded `0x03 [0]` return | ready |
| Fuji Echigoya sales assistant | complete | complete | decoded `0x03 [0]` return | ready |
| Fuji Dumpling Cake shop | complete | complete initial quest dialogue | ordinary dialogue end | ready with quest-state limitation |
| Peach Kinsera | complete | authored Yes/No flow | both validated exit targets | ready with team-state limitation |
| Peach Kevin's mum | complete | original quest dialogue | ordinary dialogue end | ready with quest-state limitation |
| Peach Jousset | complete | original greeting | ordinary dialogue end | ready with quest/team-state limitation |
| Peach Fight | complete | original greeting | ordinary dialogue end | ready with quest/team-state limitation |
| Peach Grandpa Tal | complete | authored Yes/No flow | both choices terminate cleanly | ready |
| Peach Wolf | complete | authored teammate Yes/No offer | No reaches decoded `0x08 [0]` return | ready with team-mutation limitation |
| Picarl | complete | original visitor/brother greeting | ordinary dialogue end; no post-text actions in five variants | ready with later flag-state limitation |
| Peach Policeman | complete | greeting plus PAL-proven wallet branch/consume | success reaches original `0x0d [5]` boundary | ready with inventory-source limitation; action `0x05` subsequently recovered |
| Peach FM | complete | greeting plus PAL-proven voucher branch/consume | success reaches original `0x07 [15,11]` boundary | ready with inventory-source limitation; action `0x05` subsequently recovered |
| Sandpolis Captain Rombo | complete | original visitor/information greeting | ordinary initial dialogue end | ready with later flag-state limitation |
| White Mountain Bunger | complete | original surprised house-entry greeting | ordinary initial dialogue end | ready with later flag-state limitation |
| Mushroom Road Laz | complete | original greeting; numeric question decoded | explicit four-digit `22` → slots 09/08 boundary | ready with numeric-input UI limitation |
| Papaya Island Flower | complete | original greeting plus seed-41 check/consume | original reward reaches `0x07 [15,1]` | numeric action `0x05` subsequently recovered; ordinary quest-slot producer still deferred |
| Sandpolis Shop Manager | complete | original football-delivery Yes/No plus item-39 reminder | grant remains explicit `0x07 [15,39]` boundary | ready with inventory-source limitation |
| Sandpolis Mr. King | complete | original football wait/delivery success | consumes item 39; reaches `0x0d [31]` | ready with reward-host limitation |

“Ready with quest/team-state limitation” means the room, dialogue path and clean
overworld return are usable, but the wider progression consequence is not yet
implemented. No placeholder state mutation is claimed.

## Peach NPC follow-up

PAL probes showed that Wolf, Best and Milton reuse one-byte `0x08 [0]` after
teammate-conversation paths, while Q's Factory uses two operands
`0x08 [0x0f, 0x04]` for its real race selector. Generic fixed interiors now
present only the one-byte zero form as Return to town. The positive teammate
selection action `0x10` remains an explicit unsupported boundary; no team/save
mutation was invented.

Four additional 1280x960 captures were produced and inspected:

- Peach Jousset: 2,386,051 bytes, SHA-256
  `b42cd293fe1ba10ea27b605c4e113a4298d28537a46492c0f2c44283fe8359e1`.
- Peach Fight: 2,403,684 bytes, SHA-256
  `fb047f522852d11a7e1d3ad1cf0bccb441550247354d185dcb49b877afefe348`.
- Peach Grandpa Tal: 2,157,312 bytes, SHA-256
  `ea20c2031d1738ecdf432b6c6d0f9e116fa140f25a40588206b25789015599b9`.
- Peach Wolf: 2,357,741 bytes, SHA-256
  `55d799147bd108ba3b8f4ae1cd65dc502efef5bc1b649caa5812ec4656798b63`.

All four show visible textured scenery/floors, live staff and player cars,
sensible camera staging and no blank or catastrophic output.

## Visual validation

Three 1280x960 Three.js/SwiftShader captures were produced and inspected:

- Fuji Barkeeper: 2,488,135 bytes, SHA-256
  `b6dc5e3c08f5d412facd8b2495715c7d693a435fc9a256d03f60351ef71bb9a6`.
- Fuji Echigoya sales assistant: 2,491,480 bytes, SHA-256
  `47e01ce4a37051b2354f774513b0425090063d9d57ca64ef3445f9ad14e9c544`.
- Fuji Dumpling Cake shop: 2,096,413 bytes, SHA-256
  `8913708675f301b16ec42e0718484a9bb3790117b4ecc2322d55e99f9e7ba22f`.

All show visible textured scenery and floor geometry, live staff/player cars,
sensible inward staging and no blank or catastrophic rendering failure.

## Automated validation

- Targeted interior-flow test: 9/9 passed.
- Full web suite: 25/25 files, 94/94 tests passed.
- TypeScript/Vite production build: passed.
- Sandbox capture bundle build: passed.
- `shop_regression.py`: all nineteen named cases passed two consecutive captures,
  exact baseline SHA-256 checks and 1280x960 PNG validation. Jousset, Fight,
  Grandpa Tal and Wolf also passed PAL entity/slot/choice/action assertions.
  Wolf's explicit choice path additionally proved index 1 (`No`) reaches slot
  06 with external action `0x08 [0]`.

## Complete dependency census and Picarl follow-up

`shop_readiness.py` now decodes all executable-mapped fixed interactions in one
PAL source session. The generated JSON and Markdown report cover 235 rooms in
20 areas. Its first run exposed 220 decoded entities and fifteen exact
truncation errors; the bounded-zero fix below then produced the current 235/235
result. Each decoded row includes all action shapes and control opcodes,
avoiding repeated per-room disc opens.

The dependency output now retains exact control shapes as well as opcode sets.
The Markdown census calls out namespace-15 inventory checks/clears inline; the
complete scan finds 15 item-dependent fixed interactions. Cross-room chains
and remaining name uncertainty are recorded in
`QUEST_INVENTORY_CENSUS_2026-09-01.md`.

The census also caught Q's Factory entering at slot 01 inside generic tooling.
The shared start helper now fulfils its documented contract: Q's Factory uses
proven slot 04 and ordinary fixed rooms use slot 01. A new unit regression locks
that distinction down.

Picarl was selected because all five decoded variants contain no post-text
action. Its original visitor/brother greeting and metadata passed, and its
1,942,122-byte 1280x960 image repeated exactly at SHA-256
`646133c77daf53eaf8fa82c57ba183f4dba06f11eec5af0eddf499aadad9dbe1`.
Visual inspection found visible textured geometry, stairs/crates/lamp, live
cars and coherent camera staging with no catastrophic rendering failure.

## Bounded trailing-zero recovery

The fifteen decoder deferrals all ended at an exact next-stream address with a
fixed-width action whose supplied operands were exclusively zero. Restoring
only the omitted trailing zeros recovers 21 affected variants and brings the
census to 235/235 decoded entities. Strict truncation remains for arbitrary
buffers and any incomplete nonzero payload. Details are in
`DIALOGUE_BOUNDED_ZERO_RECOVERY_2026-09-01.md`.

Peach Policeman and Peach FM now participate in deterministic regression. Their
1280x960 captures are respectively 2,367,448 and 2,596,156 bytes with SHA-256
`9c86e27aa74cb2181c7655aa78887ca71230b5d9da51d6c37098ff3de06aaea9`
and `f36c36ec89c738159082aa0fcab16168ae0a2349f31ae3ee5468bb560c1f4668`.
Both rooms passed visual inspection. A later native trace established action
`0x05 [0,0,0]` as the same 0–99 numeric selector used by Laz, with both result
targets zero and no save mutation.

The subsequent executable trace proved that the quest item test is pre-text
`0x03 [namespace, bit, target]` and item consumption is pre-text
`0x11 [namespace, bit]`. Namespace 15 maps the wallet to item 23 and voucher to
item 24. Named Chrome regressions seed those PAL bits at slot 03, verify each
slot-04 success/action boundary, and assert that the bit is cleared. Action
`0x07` is now executable-proven as the indexed-state producer; the
unrelated save tables stayed deferred at this checkpoint; the zero-mode
action-05 UI was subsequently reconstructed.

## Persistent indexed progress follow-up

Post-text action `0x07 [namespace,index]` dispatches through `0x0023d408` to
callback `0x0023b840`, which calls indexed-bit setter `0x0023ee20`. Generic
rooms and Q's Factory now share this state, and the browser install persists
only its exact indexed entries at `save/recovered-dialogue-state.json`.

The full 19-room suite retained every baseline hash. Its PAL checks now execute
representative grants as well as branches/clears: Shop Manager `[15,39]`, Peach
FM `[15,11]`, Flower `[15,1]`, and Fight `[0,150]`. Mr. King consumes the
football after restore, completing one normal-play producer/consumer chain.
Details are in `PERSISTENT_INDEXED_DIALOGUE_PROGRESS_2026-09-01.md`.

## Stamp reward follow-up

Action `0x0d` dispatches to `0x0023d178`, walks a zero-terminated stamp-ID
list, and invokes the original deduplicating stamp helper `0x0023e408`. Save
schema v2 persists these IDs beside indexed flags. PAL success paths now prove
Policeman stamp 5, Mr. King stamp 31 and Jousset stamp 65 while retaining every
visual hash. See `STAMP_REWARD_PERSISTENCE_2026-09-01.md`.

## Lettar stamp-branch follow-up

PAL pre-text opcode `0x06` dispatches to `0x0023c958`, which calls stamp lookup
helper `0x0023f188` before following its target operand. White Mountain Lettar
(area 6/slot 09) is now the eighteenth deterministic room. Its slot-03 choice
path grants item 46, while an entry seeded with Jousset's stamp 65 branches to
slot 07 and grants indexed bit 0:33. The room's 2,420,875-byte 1280x960 capture
repeated at SHA-256
`1940bc633120fee261155806c4f94840c9884ff291b85de064a4a906d270cb36` and
passed visual inspection. The interaction-state producer that normally selects
the invitation remains deferred; see `LETTAR_STAMP_BRANCH_2026-09-01.md`.

## Emily flower-chain follow-up

White Mountain Emily (area 6/slot 16) is the nineteenth deterministic room.
The PAL harness proves item 42 is consumed at slot 07 before action-07 grants
item 41, slot 05 awards stamp 64, and stamp 64 branches a later slot-01 entry to
slot 09. Its 2,566,864-byte 1280x960 capture repeated at SHA-256
`ffe4073ff43695682e9b4aba5d29579a1d0f933bba4a6bda1408bce0e8197863`
and passed visual inspection. The interaction-local state selecting its quest
intro/reward slots remains deliberately unreconstructed; see
`EMILY_FLOWER_CHAIN_2026-09-01.md`.

## Regional ordinary-room follow-up

Captain Rombo (Sandpolis area 3/slot 05) and Bunger (White Mountain area
6/slot 15) extend deterministic coverage into two further authored areas. Their
slot-01 greetings, no-choice/no-entry-action boundaries, variant counts and
complete action shapes are asserted before rendering. Both repeated exactly:

- Captain Rombo: 2,309,166 bytes, SHA-256
  `7049ea077dbe4972c38b81291eeac1e410dae85dd094c078b22fdc8be8719a44`.
- Bunger: 2,820,086 bytes, SHA-256
  `fe72ec9b2d7fdb7564f32dec4517d8bad7510cd0dbce82070be16c76609608ca`.

Visual inspection passed for both rooms. Later conditional variants remain
gated on their original flags rather than receiving invented state effects.
See `REGIONAL_GENERIC_INTERIOR_REGRESSIONS_2026-09-01.md`.

## Next useful items from RTA_WORK_IDEAS

1. Continue the runtime-readiness table with other decoded ordinary houses,
   favouring conversations whose initial paths do not depend on unrecovered
   save state.
2. Recover Cake/ownership/save fields before enabling Parts Shop transactions.
3. Extend the deterministic interior regression suite when it can validate the
   dialogue overlay as well as the underlying room render.
