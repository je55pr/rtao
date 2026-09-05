# Road Trip Adventure — Current Project State

**Checkpoint date:** 2026-09-05  
**Canonical implementation:** Three.js / TypeScript web port  
**Canonical source lineage:** `RTA_ThreeJS_native_course_collision_checkpoint_2026-09-05.zip`
**Status:** known-good race foundation (39 activities, 24 ordinary races, exact player/team/opponent entrant and human/AI control ownership, 15 compiled PAL courses, native start-grid seeds plus collision-grounded transforms, finish/lap gates, 1,664 navigation gates/routing records plus the dynamic PAL record selector and ordinary AI ownership, Cake prizes and licence progress), commerce/progress plus native Parts Shop → Q's Factory fitting, original WHEEL.BIN wheels, complete wheel paint, original Big Tyre geometry + recovered +0.85 chassis lift, executable-backed six-surface tyre grip, exact Engine/Steering/Brake behavior, Chassis inverse-mass response, Transmission launch/terminal endpoints, fitted-sign driving distance and sponsor Cake redemption, Cloud Hill Second-hand sales, deterministic close-car regression, schema-10 equipment/paint/reward/race persistence, exact trade arithmetic, generic Quick-Pic 1–100 completion, and twenty-seven deterministic fixed-interior cases

## Current continuation — native course collision queries

The complete course query is implemented: original cell selection, strip edge
checks, authored plane heights, surface-flag rules and hit/miss point writes.
It matches **8192 seeded PAL cases**, **363 wrapper boundary cases**, and
**2040 original-course queries across all 15 courses**, including all 360 grid
positions. Full checks pass **48 files / 232 tests** and both builds, exit 0.

Source, tests, traces and a deterministic contact-output report are saved. See
`docs/PAL_NATIVE_RACE_COLLISION_2026-09-05.md` and the latest handoff notes.
Next are the remaining contact producer and native orientation/VU transforms.
The first playable Peach race remains unfinished; no new moving capture exists.

## Earlier continuation — native ground-support checkpoint

The complete seven-probe scalar support solver at `0x0021BDD8` is implemented.
All writes and effect requests match **8192 original-PAL cases**; a further
**600-update sequence** checks retained suspension history. Full checks pass
**47 files / 228 tests**, production and capture builds, with exit 0 observed.

Source, tests, traces and recovery notes are saved. See
`docs/PAL_NATIVE_GROUND_SUPPORT_2026-09-05.md` and
`handoff/race-checkpoint-2026-09-05/LATEST.md` for the exact boundary.
The collision query and matrix/VU transforms remain next; the first playable
Peach race is unfinished. No speculative ground model was connected.

Earlier checkpoint sections below retain historical scope and limitations.

## Earlier saved continuation — AI, race scheduling and live order

All current source, tests, PAL traces and the two race-grid captures are saved.
The latest complete gate passed **41 files / 214 tests**, production build and
capture build with the PAL executable supplied. Scheduling and ordering have
1,260 countdown and 256 ranking differential cases in addition to the 4,096 AI
cases. The final manual scheduler/order review was paused at the user's request.

**Capture correction:** the script compared the browser's identical
`unavailable-in-browser-context` hash placeholders. Pixel-identical repeats
were therefore not proved. Both saved PNGs have real hashes in the checkpoint
manifest; the repeat gate needs correction and a fresh pair of captures.

Start with `handoff/race-checkpoint-2026-09-05/README.md` for the complete resume
point, limitations and evidence. Then continue into the native vehicle command
consumer and speed/physics integration. A playable race loop remains pending.
The milestone notes below describe earlier checkpoints.

## Earlier continuation — native ordinary-race AI commands

The ordinary AI command generator, authored target corridor and original angle
calculation are now implemented in `web/src/game/raceAi.ts`. A bounded oracle
executed the supplied PAL instructions for 4,096 seeded cases across all 24
profiles and 15 course tables, matching target angles, commands, yaw and both
complete mutable buffers. Full gate: 39 files / 207 tests and both builds pass.
See `docs/PAL_ORDINARY_RACE_AI_2026-09-05.md` for addresses and remaining limits.

Next: ordinary manager/update scheduling, command-bit 8 and native speed/vehicle
integration. This checkpoint still does not claim a playable race. The earlier
milestone notes below are historical where they defer AI command generation.

## Latest race milestone — catalogue, courses and reward progression

PAL `SLES_513.56` now supplies a typed catalogue for all 39 activities: the
split descriptor tables, exact 24 ordinary-race boundary, resident participant
references, 12 selector ranges and six/nine/nine C/B/A class distribution are
covered by deterministic readers/tests. Descriptor scene IDs for those 24
ordinary races select the fifteen unique `COURSE/C00.BIN`–`C14.BIN` packages.

An actual-PAL Chromium probe compiled all fifteen packages through the same
production geometry/collision path used by the importer: 228,072 render and
45,969 collision triangles from 36,403,312 source bytes. Fresh imports retain
all participant car bodies and cache course geometry/collision under OPFS schema
3.

The native four-class × six-place Cake table at `0x002A5218`, up-to-three-team-
car prize sum, 24 best-finish bytes and top-six class promotion are implemented
in `RecoveredRaceState` and persist in recovered save schema 10. The full web
gate is now 37/37 files and 199/199 tests plus production and capture builds.

Follow-up tracing closes the lap boundary too: table `0x002A9E80` supplies
three adjacent native-space finish-line strips for each of C00–C14. Ordinary
handler `0x0022EBA0` requires their ordered phase sequence before calling lap
updater `0x0022E910`; descriptor byte 2 is the required lap count (three for all
24 ordinary races), and the third completion receives the next zero-based
finish order. TypeScript/C# readers and a pure transition regression preserve
that behavior; the separate navigation boundary is closed below.

Car initialiser `0x00219308` now closes the upstream start grid too. Table
`0x002A9C10` supplies native XYZ, cardinal heading and lateral polarity for all
15 courses. Its exact five-bit start-index formula advances 5 units per slot
and staggers odd slots laterally by 7.5 units. Both implementations expose the
typed anchors and deterministic seed calculation; sandbox inspection returns
the first six seeds for every course.

The immediately following indirect call is now closed too. Race launch selects
course helper `0x00208C50` through setter `0x00208790`; it picks the authored
16×16 collision chunk and writes the collision-query ground Y. The production
`RaceCourseGridSampler` applies the established X reflection and returns a
grounded position, reflected yaw and surface flags. An actual-PAL sweep resolved
all 24 slots on all 15 packages (360/360); C09, C13 and C14 prove that some
anchors deliberately seed beneath elevated road decks rather than storing the
final Y.

The ordinary entrant builder is also exact now. Every ordinary descriptor
declares 24 active cars, three laps and 23 resident participants. At
`0x0020F9E8`, PAL creates player car 0 from persistent configuration pointer 0
at start 23. Up to two saved teammates use pointers 1/2 and the first start
slots; helper `0x0023F6E0` filters those resident identities from the AI pool.
Opponents are considered in the two-pass order 22→17 then 0→22 and fill the
remaining car/start slots. TypeScript/C# expose all 24 packed creation flags,
configuration-pointer indices and grounded seeds, with solo and two-teammate
regressions. The formerly attributed `0x00210BA0` loop is correctly isolated as
the separate mode-8/activity-24 path. The full web gate is now 37/37 files and
199/199 tests; the actual-PAL C# suite remains 40/40.

Control ownership is exact at this boundary too. Normal launch schedules
manager `0x0021F540` with selector 0, binding controller state 0 to car 0.
Dispatcher `0x0021B840` sends the player's `0x0002` high flags through human
input, while both saved-teammate flag forms and every opponent carry bit
`0x0080` and invoke ordinary AI `0x00252BA0`. Each typed entrant and sandbox
summary now reports that source explicitly.

The native navigation boundary is now closed through dynamic record selection. Launcher
`0x00210730` installs descriptor handler B through `0x0021DCD8`, and all 24
ordinary descriptors select `0x00252BA0`. Car setup `0x00251F98` indexes the
scene's pointer pair at `0x002BF5F0`; selector `0x00252328` and the ordinary AI
consume one 24-byte gate plus one 8-byte routing record per index. PAL contains
1,664 of each across C00–C14, with counts
35/43/120/143/66/163/90/128/42/37/143/90/143/224/197 and a deliberate C06/C11
table alias. Selector `0x00252328` proves routing bytes 0/1 are backward and
forward boundary-gate indices, bytes 2/3 and 4/5 are paired backward/forward
record choices, byte 6 is stored at car `+0x24B`, and byte 7 is reserved. The
third point in each 24-byte gate is the authored divider for fork choices.
`advanceRaceNavigation` / `AdvanceNavigation` mirror the PAL's float32
cross-products, multi-record backward/forward walk, selector output and returned
look-ahead record passed by dispatcher `0x0021B840` to ordinary AI. An actual
Peach anchor regression resolves initial record 0 to record 34, stores output
34 and returns record 0, matching the circular start/finish boundary.

This is deliberately not described as a playable race. Ordinary-AI steering and
speed output plus race-state/update scheduling remain unimplemented until their
native consumers are traced. The next vertical slice should continue with Peach
Raceway and stay inside that evidence boundary. See
`docs/PAL_RACE_ARCHAEOLOGY_2026-09-05.md`.

## Start here

The active project is the Three.js/TypeScript web recreation of *Road Trip Adventure*. The C#/MonoGame code and tools in this tree are retained for archaeology/reference validation and should not be treated as the primary implementation unless a task specifically needs them.

For substantial development, use this file plus the canonical source archive in `/RTA/Current` as the authoritative checkpoint. Project chat history is useful supplementary context, but critical state should not depend on chat memory alone.

## Canonical Library inputs

Reusable external inputs are stored outside the source handoff:

- Game archive: `/RTA/Inputs/Game/Road Trip Adventure (Europe) (En,Fr,De).7z`
- Node/offline runtime bundle: `/RTA/Inputs/Packages/rta-node_modules-linux-x64.tar.gz`
- MonoGame packages: `/RTA/Inputs/Packages/`
- .NET SDK: `/RTA/Inputs/Toolchains/dotnet-sdk-10.0.400-linux-x64.tar.gz`

Original game data must not be bundled into source handoffs.

## Current web toolchain

`web/package.json` currently pins:

- Three.js `0.185.1`
- Vite `8.2.2`
- Vitest `4.1.11`
- TypeScript `7.0.2`
- `@zip.js/zip.js` `2.8.57`

Useful commands from `web/`:

```bash
npm run dev
npm run test
npm run build
npm run build:capture
npm run check
```

`npm run check` runs the tests, production build, and sandbox capture bundle build.

## Known-good major systems

### Outdoor world rendering / day-night milestone — closed for now

The ordinary outdoor day/night milestone is considered closed unless a concrete visual or gameplay discrepancy appears.

Known restored/validated behaviour includes:

- Three.js car UV convention uses authored V directly rather than inheriting MonoGame/XNA's `1 - V` correction.
- Q's Factory world/floor -> authored SHOP scenery -> depth clear -> live cars -> UI composition is restored.
- Compiled field cache is v8 / `RTAFLD8!` and preserves authored ordinary-field memory-20 vs memory-21 visibility selection.
- Field batches retain Day/Warm/Night RGB plus GS TEX0 TCC/TFX state.
- The disproven `Unknown.x = opacity` interpretation remains removed.
- PAL outdoor clock is 216,000 units/day and 9,000 units/hour.
- Stable field-VU endpoints use the executable-proven 1.1 coefficient with 0.1 overlap during transitions.
- Executable-derived FOGCOL/background curves and the corrected GS display-byte/sRGB colour-domain composition are present.
- Visibility policies are first-class: Original PS2 / Extended / Unlimited.
- Ordinary MSCALF-8 authentic atmosphere is selected per authored primitive; stable memory 21 and dynamic memory 20 use separate visibility profiles.
- Billboard MSCALF-6 remains a separate unresolved path and must not be assumed to use the ordinary profile.
- Deterministic matched Peach/Fuji/bridge capture definitions exist.
- Field GS colour modulation uses the corrected single `/128` interpretation; do **not** re-add an extra `255/128` multiplier.

World-wide archaeology established that all 423,182 scanned field primitives use TEX0 `TFX=0` (MODULATE) and `TCC=1` (RGBA), with 418,115 textured and 5,067 explicitly untextured primitives.

### Outdoor validation inherited from the source handoff

The current handoff records the following as completed before the interior work:

- `Rta.Tools` Release build: 0 warnings / 0 errors.
- Actual PAL BIN/CUE C# regression suite: 40/40 passed at the current start-grid checkpoint.
- Web `npm run check`: 21/21 Vitest files, 64/64 tests, Vite production build, and capture bundle passed after restoring offline dependencies.
- Deterministic PAL Chromium Peach/Fuji/bridge day/night closure captures were regenerated.
- Peach 22:00 Extended remained byte-for-byte identical to its pre-v8 capture.

Do not reopen broad night archaeology without a specific discrepancy. Deferred specialist follow-ups include exact SORA night-strip geometry/timing, MSCALF-6 billboard atmosphere, residual GS draw-order edge cases, and equipment-specific headlight beams.

## Current active milestone — generic fixed SHOP interiors

The active runtime now has a reusable fixed-interior path beyond Q's Factory:

- Authored area `N` maps to `SHOP/T(N-1).BIN`, covered by a web regression test.
- Non-QFactory fixed interactions can pause the overworld, decode their authored local slot, and render a shared fixed-camera SHOP room composition.
- The common room layer repeats the authored floor swatch and overlays the authored scenery cutout using the recovered projection.
- Generic rooms now add the live player Q62 and the interaction's exact
  executable-selected staff body/RGB444 paint in the original repeated
  back-left/foreground-right staging. The surviving Peach FM screenshot is the
  calibration authority.
- Exiting resumes the same driving/resident simulation state.
- Q's Factory remains on its richer specialised renderer for tiled floor, platform, live cars, dialogue, and Change Parts composition.
- `shop_census.py` and `shop_room_capture.py` provide lightweight slot census/capture tooling without loading full field/world geometry.
- `shop_readiness.py` reads the PAL executable once and emits a complete JSON
  dependency map plus Markdown runtime-readiness table for all 235 mapped
  interactions: room package, field/slot, staff body, paired entity, entry
  flow and every action shape/control opcode.
- The same census now preserves every distinct control shape/operand tuple and
  prints namespace-15 inventory checks/clears. It identifies 15 item-dependent
  fixed interactions and several original multi-room quest chains without
  inferring unseen save state.
- `shop_regression.py` captures twenty representative rooms twice
  each, validates 1280x960 PNG structure, requires byte-for-byte repeatability,
  checks verified SwiftShader hashes, and asserts PAL entry-dialogue metadata
  for the four newest Peach NPC rooms.
- The sandbox dialogue inspector accepts an explicit choice-index path. The
  regression suite uses this to prove Wolf's actual `No` path from slot 01 to
  slot 06 and its terminal `0x08 [0]` boundary directly from the PAL executable.
- Shared fixed-interior entry selection now honours Q's Factory's proven slot
  04 while ordinary rooms retain slot 01. The dependency census exposed and
  regression-covered this tooling/runtime distinction.
- Fixed SHOP slot N maps to same-area executable dialogue entity N, avoiding
  fragile display-name matching; generic entities start at slot 01 while Q's
  Factory preserves its proven slot 04 entry.
- Generic dialogue targets are validated before becoming clickable. Uncertain
  streams remain explicit host boundaries instead of throwing on invalid jumps.
- Repeated ordinary-room action `0x03 [0]` is now distinguished from Q's
  Factory's nonzero race-start action and presented as the authored
  return-to-town boundary. This completes Peach Bartender and the matching Fuji
  Barkeeper/Echigoya assistant convention without changing nonzero activity
  actions.
- Peach Parts Shop's opcode-`0x13` host now opens a typed nine-item original
  local-stock catalogue with Cake prices and follows the decoded slot-02 return
  edge. Direct purchase uses original category/item ownership coordinates and
  persistent Cake; trade and equip remain separate evidence-gated hosts.
- Peach and Fuji Body Shop opcode-`0x13` hosts now open typed original local
  stock catalogues (20/22 bodies, all 500 Cake). Selection replaces the decoded
  foreground player body live while preserving the room/staff composition and
  equipped accessory appearance. Return follows authored slot 03; purchasing
  persists ownership and Cake without changing the equipped body.
- Mouse entry no longer repeatedly detaches a newly selected dialogue choice
  before its click can fire; the guard applies to generic rooms and Q's Factory.
- Fresh imports now retain every executable-mapped fixed-interaction staff body,
  not only residents/Q's Factory/Body stock. This fixes Peach Paint Shop's Q34
  dependency and the same latent failure for other less-common generic rooms.
- Paint Shop's contextual action `0x03 [0]` is no longer mislabeled as the
  Bartender-style town exit. Its original slot-02 instructions reach the native
  RGB444 body/two-tone selector plus the executable-proven 12-step wheel-colour
  selector. Body and wheel changes cost 100 Cake independently (200 for both),
  preview live, persist in the same packed paint word, and return through authored
  farewell slot 04. Teammate selection remains evidence-gated.
- The repeated teammate-conversation terminal shape `0x08 [0]` is now treated
  as an authored return-to-town boundary in generic fixed rooms. Q's Factory's
  two-operand `0x08 [0x0f, 0x04]` remains the real Race selector.
- Peach Jousset, Fight, Grandpa Tal and Wolf now have deterministic PAL-backed
  room/dialogue regression coverage. Jousset and Fight are ordinary greeting
  rooms; Grandpa Tal validates an authored Yes/No conversation; Wolf validates
  the initial teammate offer while the positive team mutation stays deferred.
- Picarl (`SHOP/T13.BIN` slot 00) is a ninth deterministic room: its default
  original greeting, five decoded variants and complete absence of post-text
  actions are asserted before its exact visual baseline is checked.
- Exact executable stream bounds now restore omitted trailing zero operands for
  fixed-width actions only when every supplied operand is zero. This recovers
  all fifteen formerly deferred entities while arbitrary/nonzero truncations
  remain hard errors.
- Peach Policeman and Peach FM are the tenth and eleventh deterministic rooms;
  their newly decoded variant counts and complete action-shape sets are locked
  alongside their visual baselines.
- Sandpolis Captain Rombo and White Mountain Bunger are the twelfth and
  thirteenth deterministic rooms. Their original slot-01 greetings, variant
  counts, complete action-shape sets and regional visual baselines are locked
  without inventing later flag-state effects.
- PAL pre-text `0x03 [namespace, bit, target]` is executable-proven as an
  indexed-bit branch, while pre-text `0x11 [namespace, bit]` clears that bit.
  Namespace 15 is the quest inventory used by Peach Policeman's wallet (23),
  Peach FM's voucher (24), Jones's gemstones (32–38), and Flower's seed (41).
- The deterministic sandbox inspector can seed original indexed flags and a
  target slot. Policeman and Peach FM regressions prove their PAL success
  branch, subsequent host action, and item consumption. The later action-07
  trace now supplies the proven producer and persistent normal-play ownership
  path for indexed flags; unrelated save tables remain unreconstructed.
- The Peach T00 census exposes 28 fixed slots with executable-defined interaction labels.
- Mushroom Road Laz is the fourteenth named deterministic room. Its ordinary
  entry, 13 variants, complete action shapes, and real slot-07 numeric action
  `0x05 [22,9,8]` are asserted alongside its visual baseline. The runtime now
  implements the executable-proven 0–99 selector, including initial value 1,
  endpoint clamps and match/mismatch routing to slots 09/08.
- Papaya Island Flower is the fifteenth named deterministic room. Its item-41
  check at slot 03, preservation through the native zero-mode numeric selection
  boundary, and consumption/reward path at slot 06 are PAL-backed assertions.
- Sandpolis Shop Manager and Mr. King are the sixteenth and seventeenth named
  rooms. Their original football-delivery choice, item-39 possession reminder,
  delivery check/consume, and reward boundaries are PAL-backed assertions.
- Existing Peach Jousset and Fight regressions now also cover their original
  item-46 birthday-gift and item-31 inspiring-magazine success paths.
- Post-text action `0x07 [namespace,index]` is executable-proven to call indexed
  bit setter `0x0023ee20`. All fixed interiors now share the resulting recovered
  state and persist it as `save/recovered-dialogue-state.json` in the browser
  install. Only this proven indexed store is serialised.
- Sandpolis Shop Manager → Mr. King is the first normal-play cross-interior
  quest chain: the original acceptance path grants football `[15,39]`, a later
  visit or browser reload restores it, and Mr. King's original branch consumes
  it. Peach FM, Flower and Fight host-mutation regressions prove corresponding
  action-07 grants after their input item is consumed.
- Post-text action `0x0d` is executable-proven as a zero-terminated stamp-ID
  list whose handler calls stamp helper `0x0023e408`. Recovered save schema v2
  now persists deduplicated stamp IDs alongside indexed flags, with safe v1
  migration. Policeman, Mr. King and Jousset regressions apply stamps 5, 31 and
  65 after consuming their original quest items.
- PAL pre-text `0x06 [stamp,target]` is executable-proven as a stamp-membership
  branch through handler `0x0023c958` and helper `0x0023f188`. White Mountain
  Lettar is the eighteenth deterministic room: item 46 can be granted on its
  decoded invitation path; Jousset converts that item to stamp 65; a later
  Lettar entry with stamp 65 branches to slot 07 and grants indexed bit 0:33.
  Pre-text `0x04 [2]` is now executable-proven as his pending first-meeting
  branch: fresh entry reaches the full slot-02 accident/package introduction,
  while the native opening callback clears the `(area 6, slot 9)` bit so later
  entry can evaluate item and stamp state.
- White Mountain Emily is the nineteenth deterministic room. Its PAL paths
  prove item 42 consumption and item 41 grant, stamp-64 award, and stamp-64
  later-entry branching to the post-completion thanks. Pre-text `0x04 [6]`
  now drives the executable-proven fresh slot-06 Papu-flower introduction;
  persisted meeting state exposes the ordinary item/stamp branches afterward.
- Peach Quick-Pic No.1 is the twentieth deterministic room. The regression
  locks six variants, all four action shapes, untaken slot 02, taken/retake
  slot 03, photo action `0x11 [1,6]`, applied completion bit and the exact room
  capture hash.
- Peach Quick-Pic No.2 is the twenty-first deterministic room. Its independent
  entity and photo-number-2 state run the same greeting/question/retake/keep
  lifecycle, proving the host is data-generic rather than No.1-specific.
- Post-text action `0x15 [category,item,target]` is executable-proven as the
  native equipment write. Handler `0x0023d4a8` calls helper `0x0023df78`, which
  stores the item selector at configuration offset `+0x0c+category`, then
  follows operand 2 as its dialogue edge. The browser persists all three native
  fifteen-byte selector blocks in the current recovered save schema 10. Peach Owner's real
  `[11,4,9]` fitting path is live-browser validated. Direct Body/Parts purchase
  remains correctly separate because neither confirmed-purchase path calls the
  equip helper.
- Full-table verification corrected Peach Off Road Tyre ownership from the
  earlier miscounted `(1,6)` to native `(1,7)`: item 6 is HG Wet at 3,000 Cake;
  item 7 is Off-Road at 500 Cake. The exact Options 0–8 table is now mapped,
  so Owner/Nobizo/Chocolat/Kate/Daniel sign rewards update the existing runtime
  appearance bridge while retaining exact native selectors. The five sign
  mesh/colour treatments remain provisional representations.
- The exact native Parts trade context score at `0x0023ebb8` and exchange
  arithmetic at `0x002456e8` are regression-covered with offset-labelled
  inputs; runtime exchange remains deferred until their producers and
  teammate/save-slot selection are mapped.
- Quick-Pic pre-text `0x05 [photo,target]` and post-text
  `0x11 [photo,return]` are now executable-proven across the original continuous
  **100-photo** set. Photos 1–64 occupy the first native 64-bit word and 65–100
  the low 36 bits of the second; the earlier 96-photo interpretation is retired.
  The browser keeps the existing sorted `quickPicPhotos` representation in schema 10
  and accepts IDs 1–100 without a schema bump. Recording the final missing photo
  awards native **Stamp 96** through the existing deduplicating stamp state.
  Completion remains gated on **Keep picture** / the decoded record action.
- Quick-Pic regression coverage now spans all seven byte-distinct authored SHOP
  slot families using No.1/2 plus representatives 13, 17, 28, 36, 71 and 97.
  Every representative validates its full `0x3F000` slot SHA, six-variant
  dialogue lifecycle, photo-specific record action and deterministic room frame.
  Cloud Hill No.97 is tested as a direct area-8/slot-10 fixed room; raw area code
  64 remains outside standard outdoor traversal, so no Cloud Hill world support
  is claimed. A PAL-backed 99→100 No.97 action probe awards Stamp 96.
- The seven authored slot families currently resolve to the same visible fixed-room
  PNG in this renderer (1,938,350 bytes, SHA-256
  `352fa4e49e38866f24cd7f32a0a1e38ab325389b5f4772b39061a7ab09d78227`).
  This visible hash was refreshed only because the player Q62 now uses the original
  close-detail WHEEL.BIN geometry; the seven raw SHOP-slot family hashes remain
  separately asserted and unchanged. Exact PS2 photo-screen framing/effects remain
  unclaimed.

### Latest validation

The current interior tranche establishes:

- 28/28 web test files passing.
- 142/142 tests passing.
- Vite production build passing.
- Sandbox capture bundle build passing (39 modules; 1,502.24 kB).
- Fixed-interior regression coverage is 27 named cases. One long invocation hit
  the execution ceiling on the penultimate Quick-Pic case; the remaining two were
  run separately, so all 27 cases have passing dialogue/state and deterministic
  visual baselines across the combined runs.
- All seven Quick-Pic raw SHOP-slot family hashes match the 2026-09-04 census.
  No.97 additionally passes a PAL-backed 99→100 action probe that awards Stamp 96.
- The FLD/223 smoke fixture remains 6,514,849 bytes and the Peach daytime capture
  remains exactly 1,568,898 bytes / 29,091 triangles / SHA-256
  `8c8c7c92abe298a5b214784057b35eba0b4a6baa639b54d8667a640e553a20c9`;
  visual inspection passed.
- A complete PAL census of 235 executable-mapped slots across 20 ordinary mapped areas, with
  all 235 same-index dialogue entities decoded and zero deferrals.
- One-pass entry classification: 16 ordinary entry dialogues, 72 entry-choice
  flows, 147 immediate host boundaries and zero decoder deferrals. The
  complete dependency map is in `SHOP_INTERIOR_DEPENDENCY_CENSUS_2026-09-01.*`.
- Original dialogue/choice flow and clean exit for high-confidence generic
  rooms including Peach Bartender, Kinsera, Kevin's mum, Parts Shop, Body Shop,
  and Papaya Policeman. Quick-Pic coverage now spans all seven authored SHOP-slot
  families, including direct Cloud Hill No.97 room/dialogue/state validation.
- Portable targeted `shop_room_capture.py` and `shop_census.py` helpers; the
  room helper can emit executable dialogue metadata beside its PNG.

The contact-sheet output for `T00`, `T06`, and `T08` was visually inspected.
Targeted 1280x960 Three.js/SwiftShader captures passed and were visually
inspected with live player/staff cars for Peach Parts Shop, Body Shop,
Bartender, Peach FM, Kinsera and Kevin's mum. Geometry/scenery, textures, floor
composition, executable bodies/paint and camera staging were coherent with no
blank or catastrophic output. Peach FM closely matches the surviving original
screen composition. Bartender remained byte-for-byte deterministic across that historical
repeat capture: 2,618,318 bytes, SHA-256
`bdb4116028dd1d9c8f76db9415083c6ca264a93373669e7064067e87f6f19e0d`.
The native WHEEL.BIN checkpoint later refreshes this player-car-containing frame
to 2,614,631 bytes / `4e4e92596690685514f8ec943138a7c6d92f8e4550752b1e457063ab51a34910`.

The `RTA_WORK_IDEAS.md` follow-up completed Bartender's remaining generic host
boundary and validated the repeated convention against Fuji Barkeeper and
Echigoya sales assistant. Fuji Barkeeper, Echigoya sales assistant and Dumpling
Cake shop were captured at 1280x960 and visually inspected; their authored
rooms, textures, live cars and fixed camera were coherent. Details and hashes
are recorded in `SHOP_INTERIOR_RUNTIME_READINESS_2026-09-01.md`.

The named regression runner passed all twenty cases. Peach Bartender, Jousset,
Fight, Grandpa Tal and Wolf plus Fuji Barkeeper, Echigoya sales assistant and
Dumpling Cake shop each matched on two consecutive captures and their recorded
SHA-256. The four new Peach cases also matched the expected executable entity,
slot-01 entry, choice count and lack of an initial external host action. Wolf
additionally passed the choice-path assertion `No` (index 1) → slot 06 →
external action `0x08 [0]`.

The same full 20-room suite now optionally executes executable-proven host
mutations. Shop Manager grants `[15,39]`; Peach FM grants `[15,11]`,
Flower grants `[15,1]`, and Fight grants `[0,150]` after their original input
flags are consumed. All rooms still repeated byte-for-byte and retained their
verified visual hashes. See
`PERSISTENT_INDEXED_DIALOGUE_PROGRESS_2026-09-01.md`.

Action-0d host mutation is now covered in the same PAL harness: wallet,
football and birthday-gift success paths consume their namespace-15 input and
persist stamps 5, 31 and 65 respectively. The executable trace and schema-v2
scope are in `STAMP_REWARD_PERSISTENCE_2026-09-01.md`.

White Mountain Lettar's 1280x960 capture is 2,420,875 bytes with SHA-256
`1940bc633120fee261155806c4f94840c9884ff291b85de064a4a906d270cb36`.
It repeated byte-for-byte in the full suite. Visual inspection found coherent
authored post-office/shop scenery, wood floor, counter and walls, live postal
staff truck/player car and sensible fixed-camera staging. The regression also
proves the slot-03 package-46 grant and stamp-65 slot-07 branch/reward paths.
The original quest-path evidence is in `LETTAR_STAMP_BRANCH_2026-09-01.md`;
the now-closed first-meeting boundary is in
`FIXED_INTERACTION_FIRST_MEETING_STATE_2026-09-01.md`.

White Mountain Emily's 1280x960 capture is 2,566,864 bytes with SHA-256
`ffe4073ff43695682e9b4aba5d29579a1d0f933bba4a6bda1408bce0e8197863`.
It repeated byte-for-byte. Visual inspection found the authored timber room,
checker floor, stump/table furniture, wall decoration, live cars and fixed
camera coherent with no blank or catastrophic output. Its item-42 -> item-41,
stamp-64 producer and stamp-64 thank-you paths are in
`EMILY_FLOWER_CHAIN_2026-09-01.md`.

Picarl's 1280x960 capture is 1,942,122 bytes with SHA-256
`646133c77daf53eaf8fa82c57ba183f4dba06f11eec5af0eddf499aadad9dbe1`.
Visual inspection found a coherent cellar/storage composition with stairs,
crates, lamp, textured floor/walls, live cars and sensible fixed-camera framing.

Peach Policeman's 1280x960 capture is 2,367,448 bytes, SHA-256
`9c86e27aa74cb2181c7655aa78887ca71230b5d9da51d6c37098ff3de06aaea9`.
Peach FM's is 2,596,156 bytes, SHA-256
`f36c36ec89c738159082aa0fcab16168ae0a2349f31ae3ee5468bb560c1f4668`.
Both were visually inspected with coherent textured rooms, live cars and no
catastrophic rendering failure. The structural decoder evidence is recorded in
`DIALOGUE_BOUNDED_ZERO_RECOVERY_2026-09-01.md`.

An executable-level follow-up separated the quest condition from post-text
action `0x05`: pre-text opcode `0x03` checks an indexed state bit and `0x11`
clears it. PAL-backed Chrome regressions seed the wallet/voucher bits, enter
slot 03, reach each original slot-04 success stream, and verify the bit is
consumed. Both PNGs remain byte-for-byte identical to their verified baselines.
Exact addresses and item mappings are in
`QUEST_INVENTORY_DIALOGUE_VM_2026-09-01.md`.

Mushroom Road Laz's 1280x960 capture is 2,581,798 bytes, SHA-256
`8050791e60a5a2328c92de47a4d045e3b8c1128e64b20d457ee7840872ee5940`.
It repeated byte-for-byte. Visual inspection found coherent textured room
geometry, furniture, live cars and camera staging. Native callback
`0x0023be00` is now traced and implemented as a 0–99 selector. Live PAL Chrome
proved `22 -> 0x09` and `1 -> 0x08`; the 1400×1100 UI capture is 1,481,140
bytes, SHA-256
`a456553606bd044dbc0830a8e043e7961771f07eb999aa800242a74aff8cb12f`.
Details are in `ACTION05_NUMERIC_SELECTOR_ARCHAEOLOGY_2026-09-01.md`.

Papaya Island Flower's 1280x960 capture is 2,776,710 bytes, SHA-256
`81703303c183a98d98141c8eaac989914fcd6b717c3eb3dacca1b9fffd932978`.
It repeated byte-for-byte and passed visual inspection. Its PAL state checks
prove seed item 41 is retained at slot 04's selection boundary and consumed at
slot 06 before reward action `0x07 [15,1]`. Details are in
`FLOWER_SEED_INTERIOR_2026-09-01.md`.

The expanded 235-room census recovered exact namespace-15 item dependencies
for 15 interactions. Proven chains include wallet 23 → voucher 24, magazine 31
→ cards 25, pink flower 42 → seed 41, football 39, and Lettar's gift 46 →
Jousset. Luke's item 19 remains explicitly unnamed. The complete map and
confidence notes are in `QUEST_INVENTORY_CENSUS_2026-09-01.md`; exact operand
shapes are in `SHOP_INTERIOR_DEPENDENCY_CENSUS_2026-09-01.json`.

Sandpolis Captain Rombo's 1280x960 capture is 2,309,166 bytes, SHA-256
`7049ea077dbe4972c38b81291eeac1e410dae85dd094c078b22fdc8be8719a44`.
White Mountain Bunger's pre-native-wheel reproducible frame was 2,820,086 bytes, SHA-256
`fe72ec9b2d7fdb7564f32dec4517d8bad7510cd0dbce82070be16c76609608ca`.
The native WHEEL.BIN checkpoint refreshes the same deterministic room to
2,815,827 bytes / `275a5ef30257914e31126ae235e007c9119d4bb70cbe7a110aec7c3e5c3b53b6`.
Before refreshing this already-known unstable baseline on 2026-09-04, the untouched
canonical 2026-09-02 source was rebuilt separately under the identical Chrome 151
SwiftShader environment and produced the exact same bytes/hash. The change is
therefore not attributable to the Quick-Pic source edits; visual inspection passed.
Both passed dialogue/action-shape assertions, repeated byte-for-byte and were
visually inspected with coherent authored scenery, textures, live cars and
fixed-camera staging. Details are in
`REGIONAL_GENERIC_INTERIOR_REGRESSIONS_2026-09-01.md`.

The four new Peach room captures were visually inspected together. All contain
visible textured room geometry and floors, live staff/player cars, coherent
fixed-camera staging and no blank or catastrophic rendering failure. Exact
sizes, hashes, path boundaries and deferred progression effects are recorded in
`PEACH_ORDINARY_NPC_INTERIORS_2026-09-01.md`.

A redundant cold full-world Vite probe was terminated after several minutes
while the 64-sector first install was still compiling; it produced no Chrome,
WebGL or page error. This is recorded as an environment timing limitation, not
as a fixed-interior regression: direct Chrome/SwiftShader PAL room captures and
the then-current twenty-one-room suite completed normally; the 2026-09-04 suite now covers twenty-seven cases.

The full PAL browser path also completed Peach Body Shop end to end under Chrome
151 + SwiftShader: Yes opened 20 original bodies, Q013 Silvia S15 replaced the
foreground preview live, Return reached `Come again!`, and exit restored the
town state. The 1328x996 screenshot is 1,273,637 bytes with SHA-256
`de2b63bd2913c67d6f75003fc58f5da888bb185aaa1ba42c1180b3ef3016336b`.
Visual inspection found coherent geometry, textures, staff/player staging and
camera framing with no catastrophic rendering failure. Details are recorded in
`BODY_SHOP_RECONSTRUCTION_2026-09-01.md` and the matching Research note.

Peach Paint Shop was subsequently completed for the evidence-backed player
body/two-tone path. Chrome 151 + SwiftShader opened original slot 02, edited
the two native RGB444 tones, debited 100 Cake, saved packed paint
`0x00b8f4af` in schema 6 and returned through slot 04. The 1400×1100 selector
frame is 973,620 bytes (SHA-256
`e2ecfd71b26c5a3be3084e21c670744c23a7c1c2a038e8286c4049f4ede4e7fe`);
the post-purchase frame is 1,127,432 bytes (SHA-256
`88741a2955ce652802a9e2d63a802076fc790b6cd60bdcc3063b2dbce9da3eab`).
Visual inspection passed. That body-only milestone is historical; the 2026-09-04
native-wheel checkpoint subsequently recovers the wheel palette and complete
0/100/200-Cake transaction while teammate paint remains deferred. See
`NATIVE_WHEEL_BANK_AND_WHEEL_PAINT_2026-09-04.md`.

Peach Quick-Pic No.1 was then completed in Chrome 151 + SwiftShader. The photo
Blob is a valid 1280×960 PNG, 1,942,202 bytes, SHA-256
`b373c03d23aa2f313c61f1c431e48a3ace45e46012d4a56808325478a32d90cc`.
The save remained unchanged before **Keep picture**, then stored photo 1 in
the schema-7 field (retained by current schema 10). A fresh page at question slot 02 branched to slot 03 and displayed
“Would you like to take it again?”. Visual inspection passed. Exact opcode and
save-bit evidence is in `QUICK_PIC_PHOTO_STATE_AND_CAPTURE_2026-09-01.md`.

Peach Quick-Pic No.2 independently validates the shared host and persistent
photo bit 2. Its historical pre-native-wheel room baseline was 1,942,698 bytes /
`026e56ec5da3f388206c6362eab912ae582226a3faf6efb68dbe2dae39dff8a9`.
No.1/No.2 still share the same room/car/camera composition and distinct executable
entities/photo-state bits. The native WHEEL.BIN checkpoint deliberately refreshes
the shared current visible room frame to 1,938,350 bytes /
`352fa4e49e38866f24cd7f32a0a1e38ab325389b5f4772b39061a7ab09d78227`.
Details of the original state milestone remain in `QUICK_PIC_NO2_REGRESSION_2026-09-02.md`.

The 2026-09-04 correction expands this same runtime to IDs 1–100, now retained by schema 10,
and awards Stamp 96 when the record action completes the full set. Six additional
representatives (13, 17, 28, 36, 71 and direct-room Cloud Hill 97) cover every
authored raw SHOP-slot family alongside Peach. All seven raw family hashes match
the archaeology census; all eight Quick-Pic named cases retain the same known-good
SwiftShader room frame. No.97 additionally proves the PAL-backed 99→100 + Stamp 96
transition. Details are in `QUICK_PIC_1_100_RUNTIME_EXPANSION_2026-09-04.md`.

The RoadTripAdventure YouTube Peach/Fuji playlists and exact Bartender, Parts
Shop and Body Shop entries were mapped. This cloud browser could verify their
pages/titles/durations but its YouTube media CDN did not deliver stream frames.
The precise source map, implemented evidence and remaining gaps are recorded in
`SHOP_INTERIOR_ORIGINAL_REFERENCE_2026-09-01.md` and the matching Research note.

`shop_room_capture.py` keeps visual capture available even if a future dialogue
entity cannot be decoded: the PNG is produced and the optional metadata sidecar
records the exact error. The current census has zero such deferrals. Action
`0x05 [0,0,0]` is the same recovered numeric selector as Laz's nonzero form;
both result edges are slot zero, so it exits after confirmation without a save
mutation.

The earlier Chrome `SIGSEGV` was not a GPU or code failure: the extracted
executable in persistent scratch had been truncated below its declared
196,975,952 bytes (observed as 173,932,544 bytes). Extracting the supplied archive under `/tmp` yielded the
complete Chrome 151.0.7922.34 binary and restored Playwright/SwiftShader.

## Validated low-memory deterministic capture fixture

A derived-fixture path was added to reduce repeated full-disc reads and sandbox pressure:

- `.dev-cache/` is ignored and reserved for user-derived local fixtures.
- `sandboxCaptureRunner.ts` can load `fixture.json`, `SORA.GSL`, and serialized `field-###.mesh` files directly.
- A fixture-builder can export sky/fields one at a time rather than returning large Playwright payloads.
- Fixture metadata records a field-compiler source fingerprint, cache version, PAL boot executable, and available fields; stale fixtures are rejected.
- `sandbox_fixture.py refresh ...` is the expensive PAL path.
- `sandbox_fixture.py capture ...` is the cheap routine path.

The FLD/223 path is now runtime-validated. The original browser download code
revoked each Blob URL on a zero-delay timer, racing Chromium while it copied the
large mesh into the Playwright download artifact. That produced a 1,048,576-byte
file whose header declared a 6,514,849-byte payload. Fixture download URLs are
now retained until the prepared fixture-source session is explicitly disposed.

Controlled PAL validation produced a complete 6,514,849-byte
`field-223.mesh`. A second `peach-day-ground` capture succeeded after the PAL
source was made unavailable, proving that it used the cached fixture. Both the
fresh and cached 1280x960 captures rendered 29,091 triangles and were
byte-for-byte identical with SHA-256
`8c8c7c92abe298a5b214784057b35eba0b4a6baa639b54d8667a640e553a20c9`, also
matching the preceding direct-DevTools known-good capture. Visual inspection
confirmed visible geometry and textures, a sensible camera, and no catastrophic
rendering failure.

## Transactional Body Shop commerce

The browser runtime now persists executable-backed Cake alongside indexed
ownership, stamps, native equipment selectors, packed paint and Quick-Pic
completion plus fixed-interaction meeting state in the current schema 10 of
`save/recovered-dialogue-state.json`.
Schema 1–7 saves migrate while retaining the executable-proven 1,000-Cake
new-game balance and zeroed native selector blocks where older schemas contain
no selector state. Pre-paint saves do not fabricate native paint state.

Peach and Fuji Body Shop purchasing is transactional: namespace-0 ownership is
checked first, insufficient funds leave state untouched, a confirmed purchase
sets ownership and debits the original 500 Cake once, and duplicate purchases
do not charge again. The catalogue shows the current Cake balance, owned items
and explicit feedback, and each mutation is queued to OPFS immediately.

The native confirmed-purchase path at `0x0026cae0` contains ownership and debit
calls but no saved configuration write. The separately identified initializer
`0x0022b568` writes a new-game starting body to full-save offsets `+0x0c` and
`+0x04`; its six callers are starter-body selection cases, not Body Shop.
Accordingly, purchase continues to preview but intentionally does not equip.
The starting balance is no longer an unknown: new-game setup `0x0022b5d0`
writes 1,000 at slot-0 `+0x654` immediately before starter-body selection.
Peach Parts Shop direct purchase is now reconstructed from the distinct native
host at `0x0026c550`. The nine stock entries carry their original category/item
  ownership coordinates, including corrected Off Road Tyre `(1,7)`, and use the same atomic
ownership/Cake transaction and OPFS persistence as Body Shop. The confirmed
path sets ownership and debits base price but does not write equipped selectors,
so purchase intentionally does not equip. The teammate-slot trade host
`0x0026be10` remains deferred rather than approximated. Its context value helper
`0x002456e8` is now exact: seller credit is
`base*(scoreDifference+3000)/4000`, recipient debit is
`base*(2000-scoreDifference)/2000`, both truncating toward zero. Helper
`0x0023ebb8` is now reconstructed too: its exact offset-labelled score combines
three signed slot bytes, ten low flag tests, three 128-bit population counts and
25 state values weighted `[8,4,4,3,2,1]`. Runtime trade still requires the
score fields' native producers plus teammate/save-slot state to be mapped; no
browser UI is connected to guessed meanings.

Equipment ownership is not boolean. Helpers `0x0023ee20`, `0x0023eef0` and
`0x0023f0a8` prove five parallel copy planes for namespaces 1–14, while bodies
and quest inventory remain single-bit ownership. The Parts Shop now permits up
to five copies and reports full only at capacity. New-game loop `0x00229398`
sets item 0 twice in each category 1–7; fresh and migrated browser saves now
start with those two normal parts. Schema 4 records explicit copy counts and
schema 1–3 equipment flags migrate as one copy.

Current validation: 28/28 Vitest files and 135/135 tests passed; TypeScript, Vite
production build and sandbox capture bundle passed. Chrome 151 rebuilt a
complete 6,514,849-byte FLD/223 fixture and emitted the canonical 1,568,898-byte
Peach daytime capture at 29,091 triangles. SHA-256 remained
`8c8c7c92abe298a5b214784057b35eba0b4a6baa639b54d8667a640e553a20c9`;
visual inspection passed. Full details are in
`BODY_SHOP_TRANSACTIONAL_COMMERCE_2026-09-01.md` and its Research copy.

The deterministic Peach Parts Shop frame also remains byte-identical at
2,689,255 bytes with SHA-256
`4b61e8053c9af0329af09e7c59ecf482c0560e40307e1c4a865d446dd333e44d`;
visual inspection passed. Exact evidence and the nine ownership coordinates are
recorded in `PARTS_SHOP_TRANSACTIONAL_COMMERCE_2026-09-01.md`.

The native equipment-write path is now separately reconstructed. All three
15-byte configuration selector blocks round-trip through the current schema 10; schema 1–4
migrate to zero selectors rather than fabricating a loadout. A live Peach Owner
slot-06 probe wrote category 11/item 4 to OPFS and rendered a coherent
1400×1100 interior/action frame (1,284,143 bytes, SHA-256
`fa981b8d9cb0e906e18352912fd17fe2b2cedbd80781c1c4b13386143a1367bf`).
Full addresses, script examples and remaining catalogue-mapping boundary are in
`EQUIPMENT_SELECTOR_PERSISTENCE_2026-09-01.md`.

The subsequent native catalogue pass corrected Off Road Tyre to `(1,7)` and
mapped the exact Options 0–8 names/roles. Owner's persisted item-4 selector now
renders a visible Peach Town sign on the player car. The updated 1400×1100
frame is 1,284,432 bytes, SHA-256
`8106a3b596fdcf30d864a8dcac414a9d78ac171af9cf2b36f58653678aacd31b`;
visual inspection passed. Evidence and the deliberate provisional sign-geometry
limit are in `NATIVE_EQUIPMENT_CATALOGUE_BRIDGE_2026-09-01.md`.

The 2026-09-04 native Q's Factory pass now connects that recovered ownership and
selector state into the player-facing Parts Shop → fit → drive/reload loop. Change
Parts is no longer an all-unlocked development catalogue: executable-mapped
nonzero choices are ownership-gated, selector zero remains the baseline/no-part
choice, preview is non-mutating, and applying writes the first native selector
block plus the existing compatibility appearance save. All nine reconstructed
Peach Parts Shop stock coordinates now have a Q's Factory identity; Mesh Wheel
`(7,1)` is the focused acceptance path and survives current schema-10 reload with its
visible mesh-wheel appearance. Air Horn `(13,1)` and Digital Meter `(14,1)` now
persist/fittable too, while their audio/HUD effects remain deferred. The full web
gate is 28/28 files and 135/135 tests. A fresh Chrome 151 + SwiftShader PAL
click-through now passes the complete Peach loop: the Library `.7z` was unpacked
with a tiny local libarchive extractor, the browser installed all 64 sectors,
Mesh `(7,1)` was bought for 500 Cake without auto-equipping, Q's Factory exposed
it as owned, fitting wrote one native selector change, outdoor driving resumed,
and a reload restored `Mesh Wheel · FITTED · 1 OWNED`. Details are in
`QFACTORY_NATIVE_EQUIPMENT_LOOP_2026-09-04.md`.

A deterministic close-car regression harness complements that state/UI test.
It pins Q62 to the same Peach FLD/223 pose with matched front/rear three-quarter
cameras at 12:00, 17:30 and 22:00, and can rebuild the live Q62 from explicit
native selector/packed-paint state without loading the 64-sector world. A prepared
one-field path reuses the 29,091-triangle Peach stage across captures, while
`car_visual_capture.py` exposes day/front/rear/lighting preset groups for routine
development.

The follow-up native-wheel pass replaces the harness's provisional Mesh/Spoke
faces with the original PAL `CARS/WHEEL.BIN` close-detail bank. Executable tracing
proves configuration byte `+6` selects section `selector + 1` while section 0 is
common geometry; Normal `7:0`, Mesh `7:1` and Spoke 1 `7:2` now render three
distinct original meshes. The PAL caller also proves WHEEL.BIN close detail and
TIRE.BIN fallback/LOD are mutually exclusive, correcting the inherited browser
path that previously occluded custom wheels with the tyre fallback.

The same trace completes wheel paint: packed-paint high byte indexes the exact
12-step executable palette at `0x002a25b0`, while low 24 bits remain the two RGB444
body tones. Native callback `0x00258878` charges body and wheel changes independently
at 100 Cake each. The combined browser transaction is atomic and its packed word
is retained unchanged by current schema 10. Matched noon captures now distinguish Normal, Mesh, Spoke 1 and red
Mesh deterministically. All 27 fixed-interior visual baselines were deliberately
refreshed because their player Q62 now uses the same original close-wheel path;
dialogue/state checks remain unchanged. The scenery-only Peach baseline remains
byte-identical at SHA-256 `8c8c7c92...`. Full evidence is in
`NATIVE_WHEEL_BANK_AND_WHEEL_PAINT_2026-09-04.md`.


The 2026-09-05 Big Tyre pass closes the visual/lift half of native selector `(1,11)`.
PAL tyre records prove Big is uniquely responsible for configuration flag `0x0400`.
That branch bypasses ordinary WHEEL.BIN and renders original TIRE.BIN sections 4/5
with authored left/right transforms; no browser wheel-scale approximation remains. The
first intermediate capture had the correct tyres but the ordinary body height and is
explicitly superseded. PAL car-transform code stores/adds exactly `+0.85` Y for Big,
with a separate 0.50→1.35 clearance threshold confirming the same delta. The browser
now raises the Q62 body/accessories by exactly +0.85 while retaining the authored Big
tyre contact transforms, including Q's Factory preview/apply/cancel synchronization.
The TIRE PSMT4 CLUT-bank path also follows native wheel-colour index byte `+5`.
Matched front/rear captures visibly pass; Normal remains byte-identical at
`91ab3453...`, and scenery-only Peach remains `8c8c7c92...`. Full evidence is in
`BIG_TYRE_NATIVE_VISUAL_AND_RIDE_HEIGHT_2026-09-05.md`.

The follow-up tyre-performance pass proves that all **non-Big** tyre selectors share
the same PAL driving-model visual path: normal renderer `0x00222370` reads only
wheel selector byte `+6` and wheel-colour byte `+5`, never category-1 tyre selector
byte `+1`. Distinct Sports/Off-Road driving-model tread or texture is therefore not
invented. PAL function `0x00218f70` instead copies six 16-bit tyre coefficients in
Dry / Off-road / Wet / Grass / Snow / Ice order from the selected 28-byte tyre
record. The full 13-tyre table is now represented exactly in
`nativeTyrePerformance.ts`. Browser driving applies native ratios versus Normal on
surfaces using the collision packet's exact low-nibble selector: 0 Dry, 1 Off-road,
2 Wet, 3 Grass, 4 Snow and 5 Ice. Authored road ribbons retain priority so their
paved/dirt semantics are not weakened. A complete 64-field PAL census found no
static selector-2 triangles, so Wet remains available to a future recovered
environment producer without inventing texture heuristics. This replaces
the previous provisional Sports/Off-Road/Big grip multipliers and corrects two old
assumptions: Sports improves native Off-road grip over Normal, while Off Road retains
exactly Normal Dry grip. Q's Factory stats now report Road/Dirt/Grass from the draft
native selector. Full gate is 29/29 files and 150/150 tests; details are in
`NATIVE_TYRE_GRIP_TABLE_AND_BROWSER_BRIDGE_2026-09-05.md` and
`NATIVE_FIELD_SURFACE_SELECTOR_2026-09-05.md`.

The native Parts trade arithmetic is now complete and regression-covered. The
offset-labelled implementation of `0x0023ebb8` is paired with the exact
`0x002456e8` seller-credit/recipient-debit formulas; evidence and the remaining
runtime-state boundary are in `PARTS_TRADE_COMPOSITE_SCORE_2026-09-01.md`.

The 2026-09-05 native Engine/Steering pass connects two further equipment
categories without guessed tuning. PAL function `0x00218f70` copies Engine record
word `+0x0c` into `car+0x214`; the drive consumer at `0x00219ea8` uses that field
in its force path. Normal/Panther/Blue Max/Mad V2 therefore use exact relative
scalars 1.0/1.2/22÷15/2.2. The same setup function copies the Steering record
halfword into `car+0x242`; consumer `0x0021b300` multiplies the signed steering
accumulator then divides by 32. Normal/Quick/X2/X3 use exact relative scalars
1.0/1.5/2.0/2.5. Full evidence is in
`NATIVE_ENGINE_STEERING_BEHAVIOUR_2026-09-05.md`.

The native Brake pass is also complete. Category-6 records begin at
`0x00302190` with a 44-byte stride: 12 bytes of metadata followed by the
32-byte curve selected through live car `+0x200`. Consumer
`0x0021b3b0..0x0021b3f8` increments the hold counter before lookup, saturates at
sample 32, resets on release, and computes `(curveByte * 10000) >> 5`. All four
Normal/Soft/Hard/Metal curves now drive the browser's 60 Hz fixed update, and
the former guessed pad scalars are removed. Full gate is 31/31 files and
163/163 tests; details are in `NATIVE_BRAKE_HOLD_CURVE_2026-09-05.md`.

The Chassis/Transmission endpoint pass replaces their remaining arbitrary
percentages. Chassis selector records supply weight words 25/22/20/18/15 at
`0x00301db8`; PAL physics repeatedly divides longitudinal force by live
`car+0x218`, so browser acceleration/braking now use exact inverse-mass ratios.
Transmission records at `0x00301ee8` supply eight signed gear words. The browser
uses their proven first-forward inverse-divisor launch ratio and final-forward
terminal ratio under the common 10,000 engine-speed cap. The located PAL shift
callbacks remain evidence-gated on native speed/state conversion. Full gate is
33/33 files and 173/173 tests; details are in
`NATIVE_CHASSIS_TRANSMISSION_ENDPOINTS_2026-09-05.md`.

Cloud Hill's authored Second-hand shop now completes another native Cake
producer. Area 9 / slot 5 action `0x13 [3]` reaches the PAL direct-sale callback:
one owned copy is removed, `floor(basePrice / 2)` Cake is credited through the
common capped wallet helper, and the fitted selector remains untouched. The
browser exposes only fifteen entries whose coordinates and base prices are
already exact, filters them by current ownership, and persists the result in
schema 10. The same archaeology pass located Roulette's 10,000-Cake wager cap,
exact debit and record-multiplier payout; its physical result remains gated on
`ACTION/A19.BIN` rather than invented browser RNG. Follow-up tracing located the
sole physical result caller at `0x00263be8`: final car angle relative to the
wheel is converted to Q15, half-pocket rounded and divided into the executable's
pocket table. All 23 number/group/colour bets and 18×/3×/2× payouts are now
materialised as a pure tested layer, including the native index-20 zero alias.
The `A19` scene/physics presentation remains unported. Full gate is 34/34 files
and 181/181 tests; details are in
`SECOND_HAND_CAKE_PRODUCER_AND_ROULETTE_BOUNDARY_2026-09-05.md`.

The fitted-sign advertising loop is now complete. Option category 11 items 4..8
all carry native flag `0x0200` and sponsor indices 0..4. Successful driven world
distance—not teleports—is accumulated for only the fitted sign. Each sponsor's
authored slot-07 action `0x16` invokes the recovered `0x0023bad0` semantics:
complete 1,000-unit blocks are removed, the remainder is retained, and Cake is
credited at 10/20/30/40/50 per block. The five counters and Cake persist together
in recovered save schema 10; schema 1..9 migration remains supported. PAL dialogue
text independently confirms each rate. The Peach Owner room/action capture passes
at SHA-256 `a7c4886c...`; that milestone's gate was 30/30 files and 159/159
tests. Evidence is in `NATIVE_ADVERTISING_CAKE_LOOP_2026-09-05.md`.

PAL fixed-interaction first-meeting state is now complete. Opcode-4 handler
`0x0023c918` tests bit `(area, local slot)` through `0x0023f158`; opening writer
`0x0023e310` clears that exact bit in the 32-word table at `0x01825b58`.
Schema 8 introduced the inverse completed-meeting pairs, retained by current schema 10. Fresh Lettar,
Emily, Jousset, Fight, Policeman, Captain Rombo, Shop Manager, Mr. King,
Picarl, Laz and Flower entries now reach their authored long introductions;
returning quest branches remain available after reload. The then-current 20 deterministic
room regressions retained their byte-identical capture hashes. Full evidence is
in `FIXED_INTERACTION_FIRST_MEETING_STATE_2026-09-01.md`.

The follow-up post-text trace proves action `0x02 [0,0]` selects target zero for
either Yes/No answer and that ordinary `0x03 [0]` is a host exit, not an
implicit next-slot jump. Consequently Lettar slot 03 and Emily slot 02 remain
evidence-gated on an unrecovered external activity-state producer rather than
being made reachable speculatively. Exact callbacks are recorded in
`FIXED_INTERACTION_ZERO_TARGET_HOST_TRACE_2026-09-02.md`.

## Recommended next work

1. Continue into another executable-backed Cake producer only when its complete
   trigger, mutation and authored host path are all available; connect Roulette
   only after porting the `ACTION/A19.BIN` physical scene and its two Q15 angle
   inputs to the now-closed result matcher.
2. Recover exact intermediate Transmission shift timing only after mapping its
   native speed/engine-state units into the browser controller.
3. Recover Big-specific weight and collision/climbing consequences only from
   executable consumers; its geometry, lift and six-surface grip are closed.
4. Map the recovered `0x0023ebb8` input-field producers and teammate/save-slot
   state before implementing teammate trade. Keep Quick-Pic 1–100 generic state
   closed unless exact photo-screen effects or Cloud Hill traversal are explicitly
   targeted.

## Deferred user-visible features / tuning

- Different headlight equipment should eventually produce visibly different beam behaviour, supported by original-game archaeology.
- Q's Factory exact car angles, lighting/colour, and possible floor texture/mesh tuning remain deferred.

## Important original-game facts already established

Preserve these unless new evidence disproves them:

- Palm crowns are animated in the original game.
- Every visible palm trunk in the FLD/220 beach stretch has a crown.
- Those crowns sway synchronously rather than with per-tree phase variation.
- Big-bridge corona lights are night-only in the original game.
- Some assets use distinct day/night emissive appearance.
- Fuji/interior doorway behaviour and alpha/draw-order details should be compared against original captures rather than guessed aesthetically.

## Sandbox-safe working conventions

- Serialize heavy build/capture/archaeology work.
- Prefer targeted or single-scene captures over broad all-world processing.
- Reuse compiled/capture outputs when they are still valid.
- Avoid unnecessary repeated reads of the large PAL game archive.
- Keep `.dev-cache/`, `node_modules/`, build outputs, and original game data out of handoff archives.
- Save checkpoints frequently because mutable sandbox working trees have previously disappeared independently of memory pressure.

## Canonical checkpoint files

The persistent project checkpoint should consist of:

- `/RTA/Current/RTA_current_source.zip`
- `/RTA/Current/RTA_CURRENT_STATE.md`
- `/RTA/Current/RTA_STATE.json`

Historical milestone archives belong in `/RTA/Handoffs`; reusable game/toolchain/package inputs belong in `/RTA/Inputs`.
