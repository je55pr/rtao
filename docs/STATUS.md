# Current project status

## Race catalogue/course/reward milestone — 2026-09-05

The PAL executable now drives a typed catalogue of all 39 activities, including
the exact 24 ordinary-race boundary, split descriptor tables, participant cars,
12 selector ranges and six/nine/nine C/B/A class distribution. All fifteen
ordinary `COURSE/C00.BIN`–`C14.BIN` packages compile through the production
geometry/collision path and are retained by OPFS cache schema 3. Together they
contain 228,072 render and 45,969 collision triangles.

The exact four-class, six-place Cake table, up-to-three-team-car sum, 24 native
best-finish bytes and top-six class promotion are implemented in recovered save
schema 10. A follow-up trace also materialises all 15 course-specific three-strip
finish lines, their ordered anti-shortcut crossing phases, the descriptor's
proven three-lap target and zero-based completion-order assignment. Native start
seeds, all 360 collision-grounded grid positions, exact entrant/control ownership
and the float32 forward/backward navigation-record selector are also closed. The
full web gate is 37/37 files and 199/199 tests plus both builds;
the actual PAL browser probe compiled all 15 courses deterministically. The
playable loop remains evidence-gated on ordinary-AI steering/speed and wider race
scheduling traces. See `PAL_RACE_ARCHAEOLOGY_2026-09-05.md`.

## Active development target

The **Three.js/TypeScript web port is the active implementation**. The C#/MonoGame tree is retained as historical/reference archaeology and diagnostic infrastructure. C# fixes are acceptable when they improve format understanding or regression confidence, but active game/rendering development should default to `web/`.

### Earlier 2026-09-05 equipment/reward addendum

The canonical web port now has executable-backed six-surface tyre handling,
exact Engine and Steering relative scalars, all four native 32-update Brake
curves, Chassis inverse-mass response, Transmission launch/terminal endpoints,
the complete fitted-sign advertising loop, and Cloud Hill's authored
Second-hand producer. The latter removes one owned copy, credits half the exact
base price rounded down, preserves the fitted selector and now persists through schema 10.
Successful travelled
distance accrues only for option items
4..8, excludes teleports, and the five sponsor action-`0x16` paths redeem whole
1,000-unit blocks for 10/20/30/40/50 Cake while retaining the remainder.
Recovered save schema 10 persists those counters and remains compatible with
schema 1..9. Roulette's wager, deterministic final-angle pocket binning, exact
number table, 23-bet matcher and multiplier/payout math are locked in tests.
Its `ACTION/A19.BIN` scene and car/wheel physics remain gated. The current full
gate at that point was 34/34 files and 181/181 tests. The newer race milestone
above supersedes its next-target guidance; intermediate Transmission shifting
remains gated on the native speed/state bridge.

## Working and locally tested

- Direct European MODE2/2352 BIN/CUE opening, cooked ISO and extracted-directory access.
- PAL executable validation (`SLES_513.56`, version `1.02`).
- Peach Town field textures, ordinary/global meshes, billboard sprites, minimap roads and collision surface decoding.
- Native field collision surface selection: the low nibble maps exactly to the
  PAL tyre-table order Dry, Off-road, Wet, Grass, Snow and Ice. Road ribbons
  keep priority; the 64-field static census contains no Wet-selector triangles.
- MonoGame Peach Town renderer with original texture/material state, filtering and camera-facing billboards.
- Runtime road reconstruction with authored dirt-road detection and five discovered paved-road texture styles.
- Q62 reference/player car, original TIRE.BIN wheel geometry, steering/wheel spin, four-contact ground attitude and decoded PAL VU1 body shading. The runtime now preserves unpainted authored details, uses the two original fixed light directions plus camera-dependent half-vector, and applies the stable daylight palette/intensity rather than flat vertex colour.
- Four-footprint collision/allowed-driving surface checks and paved/dirt/grass handling profiles.
- PAL overworld resident archaeology: exact Peach Town outdoor resident body IDs, RGB444 paint, spawn positions and per-resident roaming route pointer assignments.
- Six roaming residents (James, Klien, Barthou, Pillow, Kevin, Newman) moving on their original executable-defined routes, including intentional grass/hill excursions.
- PAL dialogue hierarchy reader (`0x002A4620` root) with Peach Town entity lookup and original resident/dialogue variants.
- Proximity-based talk prompt, global simulation pause during dialogue, exact traffic-state resume, runtime text/choice UI, and a data-driven dialogue interpreter with conditions/flag writes.
- All 28 Peach Town fixed-overworld interaction quadrilaterals decoded and mapped index-for-index to their resident/activity definitions. The original point-in-convex-polygon behavior is represented by the format layer, with a 2 m runtime QoL proximity margin.
- Grandpa Tal's disabled fixed trigger is preserved as executable data; the active cave-entrance trigger is a separate slot.
- `SHOP/T00.BIN` decoded as exactly 28 `0x3F000` Peach Town interaction packages. Their first GS transfer is an authored 640×384 PSMT8 backdrop followed by a 16×16 PSMCT32 palette.
- Generic clean-room GS image-transfer reader shared by field/shop format code.
- Runtime Q's Factory transition from its real Peach Town trigger. The original backdrop is decoded from the user's disc, rendered in MonoGame, and `Escape` returns to the preserved overworld state.
- Interior mode globally pauses overworld simulation; 120-frame headless validation preserved every roaming resident position/route index exactly.
- Q's Factory dialogue entity located in the PAL English hierarchy; archaeology CLI can dump its original variants/control bytes without embedding game text in the source tree.
- PAL dialogue scripting traced as two phase-sensitive bytecode dispatchers: pre-text condition/state processing and post-text actions. Q's Factory contains 72 English pointer-table slots/streams, all parsed by the phase-aware reader.
- Q's Factory's original executable-defined menus are decoded, including option labels and target dialogue slots. The normal menu is `Change parts`, `Race`, `Save data`, `Exit game`, `Drive around town`; no menu labels or branches are hard-coded in the runtime.
- Engine-neutral `PalDialogueFlow` executes the traced branch/set/clear/rally/area/menu/Yes-No subset and exposes host-owned operations such as parts selection, race selection, saving and starting a race without fabricating their behavior.
- Q's Factory now runs its real slot-04 menu interactively over the authored SHOP backdrop. Selecting `Drive around town` follows the executable target to the original farewell stream and then resumes the exact preserved Peach Town simulation.
- Dialogue actions `0x08` and `0x09` have context-dependent short zero-sentinel forms outside Q's Factory; the tokenizer preserves those forms instead of applying Q's Factory payload assumptions globally.
- Ordinary outdoor world topology decoded from the complete 64-file `FLD/000`–`FLD/333` set: 8×8 storage sectors, alternating 800-unit row stagger, 12,800-unit cyclic horizontal placement and topology-aware local/global conversion.
- All 64 standard outdoor FLDs are now decoded and retained simultaneously by `PersistentWorldRuntime` (926,478 daytime field triangles; 926,602 including night-only bridge lights). Rendering nearby sectors is independent from whether their data/simulation exists.
- Standard-world executable catalogue generalized to 70 outdoor definitions / 69 ordinary moving routes plus 235 fixed interaction zones. Remote actors advance continuously even while the observer/player is in another sector. Cloud Hill's field code 64 remains intentionally outside the normal 0–63 world until its special geometry/access path is traced.
- World-aware driving collision supports footprints spanning FLD seams. A deterministic original-road seam at Peach `223` local X=1600 / Z≈637 continues into `222` local X=0; Q62 crosses it at ~23.5 m/s with no load, car recreation or velocity reset.
- Exact source-local X ownership is now explicitly half-open (`[0,1600)`). An exact X=1600 point transfers to the neighbouring sector at local X=0 instead of being accepted by the old field and then zeroed, which previously changed the represented canonical point by 1600 m at that exact boundary.
- A deterministic live Q62 route probe now validates all three authored road seams from Peach toward Fuji: `223 -> 221 -> 220 -> 113`. All three crossings succeed under the real vehicle controller/collision sampling at ~27.5 m/s without a load, car recreation or velocity reset.
- World-sector rendering uses shared staggered transforms. A spectator can inspect Peach/Fuji/White/Papaya while the player stays elsewhere, and all 64 FLDs can be submitted in one frame for extreme draw-distance diagnostics.
- Persistent-world performance pass: the renderer now preserves HG2's original 8×8 spatial chunks when batching static geometry, spatially buckets billboards, frustum-culls whole sectors/batches/resident cars, and avoids fine terrain grounding for remote residents until an observer/player is near their sector. Route progression still advances globally. Once-per-second console profiling reports FPS, sector/batch rejection, triangle count, car visibility, approximate draw calls and CPU update/submit time.
- On the sandbox's software OpenGL renderer, the normal Peach view now reaches the 60 FPS cap in Release (~1.3 ms persistent update, ~8 ms world submission) while rejecting roughly 985 of 1,313 candidate field batches. Debug no longer enters MonoGame's fixed-step catch-up spiral: observer-driven resident grounding reduced the measured update from ~25 ms to ~6 ms and raised the same software-rendered test from ~1.3 FPS to ~35 FPS.
- Integration suite: **37/37 tests passing** against the supplied PAL BIN/CUE under .NET SDK 10.0.400, including the 16-boundary authored-road seam matrix, exact-boundary normalization, FLD/221 five-register material-state regression, shared SORA sky assets, and FLD/220 daytime-hidden bridge-light billboard family.
- Field material decoding now accepts HG2's common 5-vector form (`material GIF tag, TEX1_2, TEX0_2, CLAMP_2, MIPTBP1_2`) and preserves raw `MIPTBP1_2`. A disc-wide scan found 7,433 such updates across 60/64 outdoor fields. The erstwhile `UnknownRegister` is now correctly identified as the low 96 bits of the compact material GIF tag (`NLOOP=3/4`, `REG0=A+D`), ruling that slot out as hidden night/blend state. This fixes material leakage where ordinary geometry followed richer mipmapped state blocks; the key FLD/221 road strip now selects TBP 12201 (128x64 asphalt) instead of inheriting TBP 12178 (yellow warning sign).
- Game source validated under MonoGame DesktopGL with **0 warnings / 0 errors**, including headless Q's Factory menu captures and real keyboard-driven menu/return validation.
- Shared outdoor sky rendering is now disc-authored from `SYS/SORA.GSL`; the 512x96 daytime panorama replaces the old charcoal clear colour and wraps camera-centred around the world. The decoded 1024x128 star/moon overlay is retained for future time-of-day work.
- The legacy 100 m world `DebugGrid` is disabled during normal play and is available only through `--debug-grid`, leaving authored ocean surfaces unobstructed.
- Daytime transparent-card cleanup now uploads alpha-bearing field textures premultiplied and uses premultiplied blending with the existing `alpha > 0` test. This removes bilinear hidden-RGB halos around trees/bunting while preserving the FLD/221 hole fix and depth-writing visible texels.
- FLD/220's 62 bridge corona/lamp billboards are classified from their unique authored day/night colour signature and omitted only during the current daytime renderer; original PAL bridge screenshots confirm the same sprites become visible at night.
- Outdoor day/night ordinary-field parity is now closed for the current milestone. Cache **v8 / `RTAFLD8!`** preserves HG2's authored GIF-tag selector between dynamic VU memory 20 and stable memory 21. Authentic memory-20 geometry contracts from the daytime ~290/~544/800 visibility profile to ~45/~172/300 at deep night; memory-21 geometry retains the long profile. PAL Chromium controls confirm Peach/Fuji night, a new ground-level bridge day/night regression, and unchanged Extended behaviour.
- Fuji day-black/night-lit static geometry is retained rather than blanket-suppressed. HumanEyes comparison at the shop row shows those primitives restore the original black doorway/interior backing, while corrected texture-enable/alpha/depth handling keeps the previously fixed facade/windows stable.

## Current interior limitation

The fixed SHOP slot reader decodes the common authored backdrop transfer rather than every dynamic layer in an interaction package. Q's Factory's dialogue-driven menu/cursor flow and runtime player/staff car composition are reconstructed; Peach Parts Shop and Peach/Fuji Body Shop direct purchases now use persistent native ownership/Cake rules. Peach Paint Shop has a native RGB444 body/two-tone selector, 100-Cake transaction and schema-6 packed-colour persistence; wheel-palette rendering and teammate paint remain deferred. Post-text action 05 has its native 0–99 input host and exact match/mismatch routing. Post-text action 15 writes the proven native category/item selector and all three selector blocks persist. Exact Options 0–8 and other confident catalogue identities now bridge those selectors to existing runtime appearance; sparse unknowns are not shifted or guessed. Teammate trade's composite-score and transfer arithmetic are exact but remain UI-disconnected until the offset-labelled input producers and teammate/save-slot transition are mapped. Complete catalogue/side-effect mapping, race/license UI and some Paint Shop extra packets are not yet interpreted.

## Current dialogue limitation

The phase-aware dialogue reader can safely tokenize the known instruction shapes and Q's Factory's 72 English streams, but not every opcode has a proven high-level meaning. The runtime executes only the traced subset. Host-owned actions such as parts/team-car selection, race selection, Save Data, race launch and area transitions are surfaced explicitly until their corresponding gameplay/UI systems are reconstructed. Some action bytes are context-sensitive, so Q's Factory-specific semantics are not assumed globally.

## Near-term next targets

- Trace Peach Raceway's ordinary-AI steering/speed and wider race scheduling
  from PAL data/consumers, then connect the smallest
  playable course slice to the existing Q's Factory race host.
- Keep the decoded 15-course geometry/collision, native participant catalogue
  and exact reward/progression layer as the foundation; do not fill the live
  race loop with guessed minimap routes or generic AI.
- Turn the proven `223 -> 221 -> 220 -> 113` seam chain into a natural human-driven Peach -> Fuji playtest, looking for scenery/collision issues away from the three deliberately selected road-centre crossings.
- Improve whole-world visual composition: identify missing sky/ocean/global scenery, test very long draw distances from White Mountain and determine which sparse FLDs rely on shared/global assets rather than ordinary terrain.
- Continue renderer profiling on real hardware. The current biggest remaining rendering cost is hundreds of small PS2 material draw calls; only pursue texture-atlas/material-merging work if the new frustum/chunk pass still leaves practical bottlenecks.
- Resolve nonstandard terrain sources used by My City (`FLD/023`) and the handful of route points whose height currently cannot be sampled from the ordinary field surface.
- Trace Cloud Hill's field code 64 geometry/access path and integrate it as the first special world outside the normal 64-sector topology.
- Map the complete ownership-backed native catalogue and category flag effects onto the now-persistent selector blocks; Q's Factory and action 15 share proven helper `0x0023df78`, while direct purchase must remain separate.
- Connect the existing Q's Factory race-selection handoff after the first native
  race loop is complete.
- Reconstruct Save Data semantics using the clean-room save system rather than emulating PS2 memory-card APIs.
- Decode remaining specialised SHOP packets and Paint Shop's 12-step wheel-colour render mapping; common dynamic car/UI composition and player body paint are live.
- Generalize overworld → SHOP transitions to all Peach Town fixed interactions once their action type is known.
- Decode exact return/spawn-facing behavior for leaving each interaction.
- Continue exact HG2 dialogue opcode/flag semantics so quest/team/shop branches match the PS2.

## 2026-08-21 visual-road / PRIM-state follow-up

- Retired the Peach-only minimap-derived visual road overlay. After five-register material decoding, the authored FLD/223 road geometry already carries the real widths and markings; the approximation could create a false 2-lane -> 4-lane transition near the Fuji exit.
- Field batching now honours GIFtag `PRIM.TME` instead of forcing a stale texture onto TME=0 geometry. FLD/113 contains 566 untextured and 11,781 textured primitives. This is renderer-state correctness work; the remaining Fuji foliage/building alpha issues are not considered solved yet.

- Fuji day/night comparison established that `FieldRenderVertex.DayColor` and `NightColor` are semantically distinct authored channels, not redundant colour copies. In FLD/113, 100 untextured facade/window primitives are black by day but warm/non-zero at night; the original game confirms these layers disappear in daylight. The daytime renderer now suppresses them without discarding the night data.
- The FLD/221 `X193 Z1443` "world hole" was reproduced deterministically and is not missing geometry. Alpha-bearing road/grass fringe cards were allowing transparent texels to contaminate depth. Field rendering now submits opaque geometry first, then alpha-bearing textures through `AlphaTestEffect` (`Greater, reference 0`) so fully transparent texels are discarded while visible texels still write depth. This removes the hole and gives foliage cards proper near/far occlusion.
- Fuji's remaining camera-sensitive wall/window shimmer came from a tiny class of renderer-indistinguishable repeated static triangles plus authored layered facade geometry. The renderer now submits the global backing layer before spatial cutout/details and suppresses only exact modern-render duplicates within one chunk/material/TME group after 1 mm position / 1e-5 UV quantization. FLD/113 has exactly 100 such repeats; no broad mesh welding or polygon offset is used.
- FLD/221's missing coastal palm crowns are now decoded from the real dynamic-object path rather than fabricated. Extra[1] exposes six radial textured fronds split into 1+2+3 MSCALF-4 groups (with parallel MSCALF-10 copies); the ordinary field supplies six trunk-top attachment caps, matching palm shadows and hidden PSMT8 64x32 frond material TBP 11762. The renderer attaches the authored crown to those markers and gives the three groups a subtle phase-shifted sway. HumanEyes footage confirms the shipped crowns move in wind; exact original wind timing/amplitude remains unassigned.
- Holding either Shift key gives the debug car a 5x acceleration/speed-cap boost, with turn rate scaled at excess speed so the boost remains usable on curved roads.
- The runtime window title now carries field-local car X/Z, making future screenshot reports self-locating.

- FLD/220 palm crowns are discovered structurally despite field-local GS relocation. The original detector found only 55 zero-thickness untextured caps; HumanEyes exposed missing crowns, and disc comparison showed additional authored cap variants that are shallow (~5 cm) bevels or leave TME enabled. The generalized cap-family detector now recovers 106 authored crown markers while preserving the same Extra[1] six-frond crown asset.
- Remaining Fuji facade shimmer was isolated to modern depth precision, not a PAL Z-test mismatch: PAL uses inclusive field Z; the desktop camera now uses a conservative 1.0 m near plane with the 20 km far view retained. HumanEyes subsequently confirmed the previously flickering FLD/113 buildings are stable on real hardware.
