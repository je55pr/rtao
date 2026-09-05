# Three.js / TypeScript browser port

**This is the active implementation target.** The older C#/MonoGame code is retained as historical/reference archaeology and tooling; new game/rendering development should land here by default.

## Status

`web/` is the primary implementation under active development. The C# projects remain available as historical behavioural/archaeology reference code and diagnostic tooling, but are not a co-equal development target.

The completed browser slices cover the complete source-to-render path and a persistent outdoor simulation:

1. A user explicitly chooses or drops a local source.
2. A module Web Worker opens a cooked ISO directly, extracts an ISO from ZIP into temporary OPFS storage, or extracts and pairs a MODE2/2352 BIN with its CUE.
3. The TypeScript ISO9660 reader validates `SYSTEM.CNF` and `SLES_513.56`.
4. The importer verifies all 64 `FLD/000`–`FLD/333` standard sectors.
5. Runtime-required internal files are copied into a new versioned OPFS import. The executable-derived resident list selects only the player, current resident and implemented Q's Factory car bodies instead of copying every unused CAR-bank entry. The original disc image is not retained; an archive's temporary ISO/BIN is removed after extraction.
6. All 64 ordinary FLDs are decoded and compiled into browser-native binary packages containing Three.js batches, vertex colours, STQ UVs, resolved RGBA textures, original collision triangles/flags, material identities and minimap road ribbons.
7. Only after every step succeeds is `current.json` updated to publish the new import. A failed or cancelled import cannot replace the previous working install.
8. Subsequent page loads open the compiled packages directly from OPFS without asking for or reprocessing the source image. Resident meshes attach progressively after the world becomes usable and never gate the driving controls.
9. The original `CAR2/Q62.BIN` body and `CARS/TIRE.BIN` wheel meshes/textures feed a fixed-60-Hz arcade controller, four-contact collision footprint, wheel animation, ground attitude and chase camera across the persistent world.
10. `SLES_513.56` supplies 70 standard-world resident definitions, 69 original moving routes, 235 fixed interaction polygons and the phase-sensitive PAL dialogue hierarchy. All resident bodies and paints come from the cached CAR banks.
11. `SYS/SORA.GSL` supplies the camera-centred daytime sky; its night panorama is decoded and retained for the future time-of-day renderer.
12. Peach Town's real Q's Factory zone opens a dedicated fixed-camera Three.js scene. `SHOP/T00.BIN` supplies its indexed machinery/sign atlas and floor/platform materials, while live decoded Q62/Q28 meshes and the executable's slot-04 menu complete the first state-preserving interior loop.
13. The original Change Parts handoff now opens a typed development catalogue with 14 categories and 55 immediately available test parts. Selection previews cosmetic accessories and provisional performance totals live; Apply persists the loadout inside the current OPFS install and updates the outdoor car/controller, while Cancel restores the previous loadout.
14. A deterministic visual-capture harness renders canonical outdoor/interior scenes to exact 1280x960 PNGs through off-screen WebGL targets. Outdoor captures exclude roaming traffic, Q's Factory uses a fixed animation phase, and the result page exposes a PNG SHA-256 plus direct links between canonical scenes.
15. Cloud Hill's authored Second-hand action opens an ownership-filtered subset
    of exactly mapped PAL parts. Selling removes one copy, credits half the base
    price rounded down, leaves the fitted selector untouched and persists the
    transaction. Roulette's native wager, final-angle pocket binning, 23-bet
    matcher and payout math are unit-locked; it remains outside the playable
    surface until the physical `ACTION/A19.BIN` scene supplies those angles.

## Supported sources

- `.iso`: cooked 2048-byte-sector ISO9660 image.
- `.zip` containing one cooked ISO.
- `.zip` containing a single-track `TRACK 01 MODE2/2352` CUE and its referenced BIN. If an archiver renamed the BIN, the importer accepts it only when it is the sole BIN and therefore unambiguous.
- Direct BIN or BIN+CUE selection is also accepted as a developer convenience.

Encrypted ZIPs, 7Z, CHD, split archives and multi-track CUEs are intentionally outside this first importer. Archive paths are treated as untrusted; absolute/traversing entries are not eligible as game sources. ZIP CRC/signature and overlapping-entry checks are enabled.

The supported platform is a modern desktop browser in a secure context (`https://` or localhost). Mobile and console browsers are not current targets.

## Storage contract

The game file is never posted to a server. Browser storage is organized as:

```text
OPFS/rta-browser/
  current.json
  imports/<uuid>/
    manifest.json
    game/
      SYSTEM.CNF
      SLES_513.56
      FLD/*.BIN
      CAR0/<required Q*.BIN> … CAR4/<required Q*.BIN>
      CARS/Q150.BIN
      CARS/TIRE.BIN
      SHOP/T00.BIN … SHOP/Txx.BIN
      SYS/SORA.GSL
    compiled/
      field-000.mesh … field-333.mesh
      collision-000.bin … collision-333.bin
    save/
      development-parts.json
```

The manifest records the cache schema, source description, PAL identity, cached file sizes, all field summaries and compiled-field statistics. Import IDs are generated before worker startup so cancellation can remove the exact unpublished staging directory. Cache schema changes deliberately invalidate older imports instead of attempting to interpret stale binary packages.

OPFS remains subject to the browser's quota and site-data controls. The UI requests persistent storage after the user starts an import and reports insufficient quota before copying the selected runtime files. Removing the install deletes only its exact `imports/<uuid>` directory and current pointer; it never modifies the source disc image.

## Ported format/render layers

- Async random access over `Blob.slice()` and stored OPFS files.
- Cooked ISO sectors and batched raw MODE2/2352 user-data projection. Contiguous raw sectors are fetched in one backing-file read and projected in memory, avoiding hundreds of asynchronous OPFS reads for each car or field.
- ISO9660 primary volume, directory record and version-suffixed path resolution.
- PAL game identity.
- HG2 field section table and 8x8/16x16 chunk directories.
- Inline PS2 DMA chains, VIF codes/UNPACK lengths and MSCALF 8/6 primitive sequences.
- Four- and five-register field material updates, including `MIPTBP1_2` consumption.
- GIF tags and host-to-local `BITBLTBUF`/`TRXPOS`/`TRXREG` image transfers.
- A 4 MiB GS local-memory model for PSMCT32/24, PSMT8 and PSMT4 addressing plus CSM1 palettes.
- Original `S/Q`, `T/Q` field UVs, daytime vertex colours, alpha detection and wrap/clamp selection.
- Three.js chunk/material batches and horizontally camera-facing billboard shader geometry.
- Renderer-equivalent static-triangle suppression inside one exact source chunk/material state, using the same one-millimetre position / 1e-5 UV tolerance that stabilises authored Fuji repeats in the reference renderer. Cache version 4 forces existing browser installs to rebuild the affected field meshes once; each compiled field records its suppression count and world startup reports the non-zero counts by `FLD/NNN` for evidence without a visual shimmer hunt.
- Global chunk-64 static backing geometry is submitted before local opaque detail, matching the proven Fuji facade/lattice ordering in the reference renderer.
- Original collision-strip compilation, spatially bucketed runtime sampling and staggered toroidal X/Z seam normalization.
- HG2 car/object mesh sequences, PSMT8 Q62 paint/detail texture, PSMT4/PSMCT16 tire atlas, authored wheel centres and daylight body shading.
- Deterministic fixed-step driving, four-wheel ground attitude, steering/spin animation and collision-aware chase camera.
- Minimap road-ribbon decoding plus authored underlay classification into paved/dirt road, grass, dirt and other driving profiles.
- ELF32 virtual-address mapping, all standard-world resident/spawn/route definitions, fixed interaction zones and original RGB444 paints.
- Persistent fixed-60-Hz outdoor actor simulation with exact resident body files, per-resident paints and world-relative torus placement.
- Shared SORA daytime/night panorama decoding and camera-centred daytime hemisphere rendering.
- Phase-aware PAL dialogue bytecode, executable entity lookup, pages, variable menus, Yes/No routing, proven flag/branch flow and explicit external-action handoff.
- Executable-proven action-`0x07 [namespace,index]` indexed-progress grants,
  shared fixed-interior runtime state and narrow per-install OPFS persistence.
  Namespace-15 quest items now survive room changes and browser reloads without
  inventing Cake, ownership or unrelated memory-card fields.
- Executable-proven action-`0x0d` zero-terminated stamp lists, including
  deduplicated single/paired awards and schema-v1-to-v2 persistence migration.
- In-world `E` greeting interaction for the six Peach roaming residents, with a true player/resident simulation pause and state-preserving resume.
- Fixed-size SHOP slot decoding for 640x384 PSMT8/PSMCT32 atlases, with all ordinary `SHOP/Txx.BIN` packages retained by new imports.
- Generic fixed-SHOP entry for all executable-mapped area/slot pairs: shared
  floor/scenery composition, live player plus executable-selected staff
  body/paint, same-index original dialogue entity, ordinary slot-01 entry,
  keyboard/click choices, explicit unsupported-host boundaries, and exact
  outdoor-state resume. Q's Factory intentionally keeps its proven slot-04
  specialised composition.
- Peach Parts Shop opens a typed catalogue host with the original nine local
  stock entries and Cake prices, then follows the executable's slot-02 return
  edge. Direct purchases use the PAL category/item ownership coordinates,
  persist quantities through recovered save schema 6 and debit Cake atomically.
  Equipment categories retain the native five-copy capacity and two-copy normal
  starting inventory. Action `0x15` now writes and persists the native selector
  blocks; native trade/exchange and full selector-to-runtime catalogue mapping
  remain separate evidence-gated work.
- Peach Town and Fuji City Body Shops open typed 20/22-body local catalogues at
  the executable's opcode-`0x13` boundary. Selection swaps the decoded
  foreground player body live while retaining paint/accessories, and Return
  follows the authored slot-03 `Come again!` path. All entries retain their
  original 500-Cake price; purchase records ownership and debits persistent
  Cake without incorrectly auto-equipping the previewed body.
- Paint Shop's contextual action-`0x03 [0]` is distinguished from the ordinary
  Bartender exit convention. The original instructions and 100/200-Cake price
  text now reach a native RGB444 body/two-tone selector. Changed body paint
  debits 100 Cake atomically, persists the packed configuration word in schema
  6, previews live and returns to authored slot 04. The separately proven
  12-step wheel palette, its 100-Cake component, combined 200-Cake path and
  teammate selection remain deferred. Imports retain every executable-mapped
  fixed-interaction staff body so all generic rooms satisfy their live-car
  dependency.
- Original-reference-calibrated Q's Factory composition: authored scenery cutout, tiled floor, rotating yellow platform, live staff/player cars, 4:3 presentation and the executable-defined five-option menu.
- In-world Q's Factory entry/exit with globally paused player/resident simulation, exact outdoor-state resume, keyboard/click choices and honest handoffs for races and save data that are not yet ported.
- A native TypeScript Change Parts host system covering Tyres, Engine, Chassis, Transmission, Steering, Brakes, Wheels, Lights, Wing Set, Special Parts, Options, Stickers, Horns and Meters. The current 60-item catalogue is explicitly development inventory: every item is available, tuning is provisional and ownership/unlock decisions remain outside the selector. Exact Options 0–8 and other confidently identified records bridge native selectors to this runtime without shifting sparse indices.
- Live Q62 accessory previews for wheels, tyres, lights, wings, special parts, roof options and stickers, plus recovered Engine/Steering ratios, native tyre surface coefficients, four exact 32-update Brake curves, Chassis inverse-mass response, and Transmission launch/terminal gear endpoints consumed by the fixed-step driving controller. Intermediate PAL shift timing remains evidence-gated.
- Versioned per-import parts-loadout persistence in OPFS. Unknown future/obsolete item IDs safely fall back category-by-category instead of invalidating the game-data install.

The compiled field package is binary and versioned. It avoids JSON expansion of large typed arrays and lets reloads bypass ISO traversal, VIF parsing, VRAM replay and texture compilation.

## Sandbox-injected capture runner

A separate single-file browser bundle can now be built with `npm run build:capture` (also included in `npm run check`). It exposes `window.__rtaSandboxCapture` on an already-open blank browser page, specifically so restricted environments can render deterministic captures without navigating to the Vite app URL. One-shot `runCapture(...)` remains available, while `prepareOutdoorFromBrowserFiles(...)` + `capturePreparedOutdoor(...)` keeps a decoded Three.js world alive so several named outdoor captures can be requested without recompiling ~926k triangles each time. The same injected runner can also reconstruct Q's Factory directly from `SHOP/T00.BIN`, the executable-defined interaction/staff car, Q62 and `CARS/TIRE.BIN`. The sandbox path is intentionally aimed at direct ISO/BIN+CUE input because archive imports depend on OPFS, which restricted blank-page contexts may not expose. A real PAL BIN/CUE sandbox run has now produced byte-stable 1280x960 captures for both Peach Town and Q's Factory: two consecutive Peach captures matched SHA-256 `d9ae535434acf083c78c8766df6209a642922bd61aabeefc4a2cd8f5a690409d`, and two consecutive Q's Factory captures matched `205cb32d1709617dd4a950d9358f09f592399aef6981895b97950321b801867a`. The named outdoor field mapping was also visually revalidated from disc data: Peach `223`, Fuji `113`, White Mountain `203`, and Papaya `233`; Peach alone uses a pinned comparison camera because its large rural apron makes the generic field-centre framing poor.

For lower-memory repeat captures, `sandbox_fixture.py` can persist derived sky
and field meshes one at a time. FLD/223 is validated at 6,514,849 bytes: a fresh
and fixture-only `peach-day-ground` capture both rendered 29,091 triangles at
1280x960 and matched byte-for-byte. The browser retains each fixture-download
Blob URL until the prepared source is disposed; revoking it on the next task can
race Chromium's multi-megabyte download stream and leave only its first 1 MiB.


## Deterministic visual captures

With a local install already present, append one of these query parameters to the normal app URL:

```text
?capture=world
?capture=peach
?capture=fuji
?capture=white-mountain
?capture=papaya
?capture=qfactory
```

Each capture renders at 1280x960 independently of the browser viewport and opens a comparison page with the exact PNG, its filename and SHA-256, plus links to the other canonical scenes. Outdoor captures intentionally hide moving residents/player vehicles, and capture mode does not start their asynchronous model loads, so actor attachment timing cannot change the image. Q's Factory fixes the rotating platform to animation time 0. New comparison cameras should be added to `src/game/captureScenes.ts` rather than being scattered through probe code.

The browser port intentionally wraps **both** outdoor axes. East/west wrapping is supported by original-game evidence; north/south wrapping is a requested browser-port quality-of-life extension and should not be removed by future C# parity work.

For targeted interior work, `?interiorProbe=AREA:SLOT` enters one installed
fixed interaction directly. `shop_room_capture.py AREA SLOT OUTPUT.png` renders
only the shared 1280x960 room composition from the PAL BIN/CUE, and
`shop_census.py AREA OUTPUT.png` produces a labelled per-package contact sheet.
Both helpers accept `RTA_GAME_DIR` and `RTA_CHROMIUM_EXECUTABLE` overrides. The
room helper's optional `--metadata OUTPUT.json` sidecar records the paired
executable entity, current slot/pages, validated choices and external action.
The room capture includes both live cars. A deferred dialogue decoder no longer
blocks visual capture; its exact error is written to the optional sidecar.
`shop_readiness.py OUTPUT.json --markdown OUTPUT.md` opens the PAL source once
and records all 235 executable-mapped rooms, staff dependencies, entry flows
and action shapes/control opcodes without compiling the outdoor world. Exact
next-stream bounds recover omitted trailing zero operands, so the current PAL
census decodes 235/235 entities with zero deferrals.
`shop_regression.py OUTPUT_DIR [CASES...]` runs a twenty-one-room representative PAL
suite: every output must be a valid 1280x960 PNG, repeat byte-for-byte on a
second capture and match its verified Chrome/SwiftShader SHA-256 baseline. The
new Peach NPC cases also assert executable entity, initial slot, choice count
and external-action metadata before rendering. Dialogue inspection can follow
an explicit choice-index path; Wolf's regression proves `No` reaches slot 06
and PAL action `0x08 [0]`. Picarl covers a geographically distinct ordinary
conversation room whose five decoded variants contain no post-text action.
Peach Policeman and Peach FM lock down exact-boundary restoration of omitted
trailing zero action operands and their newly recovered room baselines.
Sandpolis Captain Rombo and White Mountain Bunger extend exact dialogue/action
shape and visual-baseline coverage into two further authored regions.
Mushroom Road Laz, Papaya Flower, Sandpolis Shop Manager and Mr. King add
numeric, quest-item and cross-room producer/consumer paths. Action 05 now uses
the native 0–99 selector (initial 1, endpoint clamps and exact match/mismatch
result slots), including the formerly unresolved all-zero exit form. The inspector can
apply proven action-07 host mutations and report the complete resulting indexed
state. White Mountain Lettar adds executable-proven stamp-membership pre-text
`0x06`, its package-46 grant path, and its stamp-65 thank-you/reward branch.
White Mountain Emily adds item-42 delivery/item-41 reward, stamp-64 award and
stamp-64 post-completion entry paths. Native pre-text `0x04 [target]` now
branches on the current fixed interaction's pending first-meeting bit: handler
`0x0023c918` reads the `(area,slot)` bit through `0x0023f158`, and opening
callback `0x0023e310` clears that exact bit. Schema 8 introduced the
completed-meeting pairs and current schema 10 retains them alongside the five
advertising-distance counters. These inverse completed-meeting pairs restore
Lettar/Emily and other authored long introductions before ordinary return-state
conditions.

## PAL race foundation

`formats/raceCatalogue.ts` decodes all 39 executable activities, the exact
24-ordinary-race boundary, resident participant references and 12 selector
ranges. For those ordinary descriptors, the fifteen unique scene IDs select
`COURSE/C00.BIN`–`C14.BIN`; import compiles and retains their geometry and
collision packages in OPFS cache schema 3. An actual-PAL Chromium probe covered
all fifteen packages (228,072 render and 45,969 collision triangles).

`RecoveredRaceState` mirrors the licence byte and 24 best-finish bytes in save
schema 10. Its completion operation applies the exact executable four-class,
six-place Cake table, up-to-three-team-car sum, best-result rule and top-six
class promotion. The 15 course records at `0x002A9E80` add exact three-strip
finish lines and their ordered crossing phase machine; descriptor byte 2 proves
the ordinary three-lap target and `0x0022E910` assigns completion order. Native
start-grid placement, entrant/control ownership and the dynamic forward/backward
route-record selector are exact. No ordinary-AI steering/speed or wider race
schedule is fabricated; those are the remaining boundary before the first
playable course runtime.

## Validation

Run:

```bash
cd web
npm run check
```

The automated suite contains 199 tests across 37 files. Coverage includes input
containers and PAL identity; field, car, SHOP, dialogue, traffic and collision
formats; deterministic driving and six-surface/native-equipment behavior;
schema-10 commerce, ownership, fitting, paint, quest, Quick-Pic, advertising
and race progress; the 39-activity/24-race catalogue; exact race Cake and
licence rules; importer course selection; and deterministic capture identity.

For a browser-safe end-to-end fixture containing no original game data:

```bash
node scripts/create-smoke-disc.mjs
```

This creates ignored synthetic ISO, archived-ISO and archived-BIN/CUE fixtures under `web/test-output/`. They contain 64 structurally valid synthetic FLDs and one coloured test triangle in FLD/223. Browser QA has exercised all three supported source paths, Three.js rendering, zero warning/error logs, and reload restoration from OPFS.

A real PAL ZIP/BIN+CUE import has also been exercised end to end. A clean-origin import of the 285 MiB archive extracted the BIN, identified `SLES_513.56`, compiled all 64 fields and cached the reduced runtime file set in about 45 seconds on the test machine; the former per-car ten-second stall was absent. Cache version 3 decoded FLD/223 to 29,101 triangles and submitted 926,478 daytime world triangles—an exact match for the then-current field-by-field C# scan. Cache version 4 now deliberately suppresses the proven renderer-equivalent repeated static triangles, so its real-disc world total should be re-baselined on the next browser run rather than preserving the old pre-suppression count. The world became interactive before resident rendering completed, then all 70/70 resident models attached in roughly six additional background seconds. The live executable catalogue resolves 69 moving routes and 235 fixed zones across 20 standard sectors. All 1,239 authored minimap road ribbons decode (1,235 paved and 4 dirt), with 34 vertices falling back to the same projection height convention as the C# reference. The PAL dialogue reader resolves all six Peach roaming greetings and all 72 Q's Factory streams. The real Q62 decodes to 470 body/wheel strips and 1,454 triangles with authored textures and wheel centres. A live browser probe drove `223 -> 221 -> 220 -> 113` across the three original road seams without reloading or recreating the car. A second probe decoded Q's Factory slot 0 as a 640x384 atlas with three DMA packets, entered the original slot-04 menu, previewed and applied wheel/wing/engine parts, verified stat updates and Cancel rollback, reopened the selector with the applied loadout intact, followed the original return edge and resumed the preserved FLD/223 session. Reload opens the compiled packages from OPFS without reopening the archive.

The current compiled field format is **v8 / `RTAFLD8!`**. V8 preserves the authored ordinary MSCALF-8 memory-20/memory-21 visibility selector from each primitive GIF tag. Authentic deep night now shortens the dominant memory-20 path to roughly 45 m fog-full / 172 m alpha-full / 300 m far while memory 21 remains at 290/544/800; Extended and Unlimited remain intentional browser-port visibility policies. Final PAL controls pass with 64/64 web tests and the Extended Peach-night capture remains byte-identical to the pre-v8 renderer.

## Next parity milestones

The next work should continue vertically, using original-game captures as the visual authority and the C# implementation only where it contains proven format or behavioural evidence:

1. Profile and refine field/collision/surface startup and interest-region loading on lower-end desktop GPUs.
2. Map the full native equipment catalogue and category flag side effects onto
   the recovered selector blocks, then connect Q's Factory's existing
   development catalogue. Map teammate trade's recovered score-input producers
   and teammate/save-slot transition before implementing exchange. Direct
   Parts/Body purchases already use decoded Cake, ownership and save rules and
   correctly do not auto-equip.
3. Continue high-confidence fixed interiors and specialised service screens;
   ordinary outdoor day/night is now closed for the current milestone, with
   specialised SORA/MSCALF-6 follow-ups deferred.
4. Port palm crowns/dynamic scenery, remaining UI/input, audio and save data.
5. Move the archaeology tools to Node-hosted TypeScript only after browser/runtime parity; retain the C# reference until then.

The browser port is now a data-driven persistent outdoor runtime with a playable and configurable Q62, original traffic, surface profiles, fixed interaction data, sky, roaming dialogue, a complete Q's Factory vertical slice, and live executable-selected cars throughout generic fixed rooms. Peach Parts Shop and the Peach/Fuji Body Shops have original catalogues, transactional persistent direct purchase and decoded return flows; Peach Paint Shop has transactional persistent RGB444 body/two-tone paint; original action-15 fitting and three-block selector persistence are reconstructed. The ordinary race catalogue, courses, finish-line/lap state, reward/progression, grounded start grid, entrant/control ownership and dynamic navigation-record selector are reconstructed; ordinary-AI steering/speed and wider scheduling are the next major boundary. Teammate trade, wider specialised hosts and the broader game loop remain additional boundaries. Ordinary outdoor day/night is implemented and closed for the current milestone; the C# implementation stays intact as an archaeology reference rather than a line-for-line port target.
