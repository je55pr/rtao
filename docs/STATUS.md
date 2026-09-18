# RTAO status

**Active implementation:** `rtao/` — Three.js / TypeScript browser game  
**Authority:** European PAL executable/data supplied locally by the developer  
**Current priority:** race-facing UX, presentation and hardening on DEV after the first playable Peach Raceway release

GitHub issues are the actionable backlog. This page is only the concise implementation/evidence boundary; do not grow it into a second task tracker.

## Race boundary

The first ordinary-race vertical slice is integrated on `dev`. Verified foundations include:

- executable-backed ordinary-race catalogue, entrant/grid construction, finish strips, lap state, rewards and licence progression;
- native ordinary AI/navigation, scheduling/order, controls, drive force, traction and scalar vehicle composition;
- seven-probe ground support, course collision, contact/orientation, collision response and original-course obstacle handling;
- the enclosing ordinary vehicle frame validated against retained PAL execution on original courses;
- a dedicated PAL driving-validation gate now replays representative C00 control/equipment sequences with field-level pose, velocity and contact diagnostics, while the production chase-camera arithmetic has a pure seam that can be checked against a local numeric PAL camera trace without committing proprietary inputs;
- race contact grip consumption matches PAL for raw low-three-bit surface slots 0–7: slots 0–5 use the six recovered tyre words while car-record slots 6/7 remain the exact zeroes established by initialization; these are not extra tyre coefficients and free-roam surface semantics are unchanged;
- rendered Peach Raceway (`COURSE/C00`) with the recovered 24-car grid and deterministic moving capture;
- generic ordinary-race runtime/coordinator separates activity identity from physical `sceneId` course data; all 24 ordinary activities are PAL-validated for the browser launch path at the normal 420-update gate and a retained 6,000-update circulation sweep, with frozen 420-update capture metadata retained for activities 0/1/2 and Temple retaining its original opponent `0x3000` equipment flags;
- C00–C14 accepted as course geometry/collision/native-start-grid inputs: 15/15 compile and render, 360/360 recovered start positions ground, and each representative 24-car grid repeats pixel-identically;
- Q's Factory's executable-backed selector exposes each authored area range with native licence availability and saved top-six progress; its `StartRace` handoff launches all 24 compatibility-census-approved activities while preserving licence locks;
- recovered player equipment selectors passed into the Q's Factory-launched race;
- deterministic finish/reward state, Cake credit, best-finish/licence updates and recovered-progress persistence;
- game-facing race HUD plus a native-timed start signal driven by PAL widget states 2–6 and scene flag `0x4`, followed by a dedicated completion panel that presents the already-applied player/team places, exact Cake credit, best result and licence promotion without recalculating progression;
- race exit restores the suspended live town-driving session instead of rebuilding a synthetic return state.

Primary race write-ups remain `PAL_NATIVE_RACE_FRAME_2026-09-05.md`, `PAL_NATIVE_RACE_MATH_2026-09-05.md`, `PAL_NATIVE_RACE_CONTACT_2026-09-05.md`, and `PAL_NATIVE_RACE_COLLISION_2026-09-05.md`. Supporting 2026-09-10 activity, interaction and equipment censuses are retained under `docs/archaeology/` and `docs/evidence/`.

Overworld interaction activation is explicit browser host policy: manual NPC/door interaction has no speed limit, while physical NPC-body contact and entry into an authored fixed-interaction polygon auto-activate once per contact episode. This convenience behavior is not claimed as recovered PAL semantics.

## Controller/input boundary

The browser host now has one semantic action/axis path shared by keyboard and standard gamepads, with deadzone handling, connect/disconnect recovery, controller navigation across play/pause/dialogue/fixed interiors/Q's Factory/race/results, and browser-local action bindings with conflict protection, default restore and dynamic help.

A PAL-backed controller-only browser route on 2026-09-18 verified the loaded-game path through free-roam driving, pause/resume, resident dialogue, Parts Shop entry and catalogue use, Q's Factory entry and ordinary-race selection, all three Peach Raceway laps, the normal result panel and return to the suspended live town session, then a Talk binding change from Primary to Button 2, controller disconnect/reconnect, page reload, and successful gameplay/dialogue use of the persisted Button 2 binding. The verification staged the car adjacent to decoded resident/interior targets through temporary DEV-only inspection hooks to keep location setup deterministic; every gameplay and modal transition itself was initiated through the standard gamepad API, and those inspection hooks were removed afterward.

This closes the browser-host scope of issues #93 and #94 without claiming PAL physical-pad binding semantics. Remapping is host/browser configuration stored separately from recovered PAL save/progression state; the standard analog stick/trigger backend mapping remains a fixed browser-device convention rather than recovered game state.

Ordinary free-roam longitudinal/steering motion now runs through an executable-backed `NativeDrivingMotion` boundary at PAL's 50 Hz update rate. The former browser-authored surface acceleration/max-speed table, steering `turnRate`/`turnScale` curve and temporary `PartPerformance` motion multipliers are no longer motion authority. The boundary reuses the recovered gearbox, drive force, traction, steering curvature/yaw/drift and fixed-point velocity transform and is checked update-by-update against the loaded PAL `0x0021B1C0` scalar routine. Outdoor support/collision remains explicitly incomplete: free-roam still uses the browser footprint/ground-attitude bridge with a level-support compatibility input, unresolved surface class `other` remains neutral, reverse command production remains host policy, and developer Shift/RB boost is a traversal aid outside native motion state.

Overworld visual parity now includes the PAL-authored FLD/223 Extra[1] giant Peach and FLD/233 Extra[1] giant Papaya. Peach presents only native-submitted mesh sections 0 and 2, while Papaya presents all three; both preserve recovered per-section homogeneous fourth columns and field-neighbour translation semantics with their embedded transparent textures. Remaining GS material nuance is still approximate; other standalone Extra[1] `prop` landmarks are not generalized from this evidence.

## Warp boundary

Player-facing Warp now has one bounded recovered progression loop independent of broader world unlocking. Opening an ordinary area's local fixed-interaction slot 0 registers that area's PAL Q's Factory destination; Pause > Warp lists only registered authored city destinations in native area order, and selector zero returns to the midpoint of the Q's Factory return edge recovered from the interaction polygon. Registrations are included in recovered-progress persistence.

A fresh PAL browser run on current DEV verified two ordinary destinations without debug teleport or developer boost: Peach Town registered at `SHOP/T00` slot 0, warped back to its FLD/223 Q's Factory edge, then normal driving followed the recovered `223 -> 221 -> 220 -> 113` road chain and FLD/220 minimap road ribbons into Fuji City; Fuji registered at `SHOP/T01.BIN` slot 0, warped back to its FLD/113 Q's Factory edge, left normally, and a page reload restored exactly `Peach Town` then `Fuji City`. Before Fuji registration it was absent from the menu and could not be selected. The focused integration regression locks the same registration/filtering/selector-zero/save-reload boundary.

This does **not** establish general town discovery, licence/quest area gates, transition-action progression or complete world unlock semantics. Those remain issue #107. Warp registration must not be treated as a substitute for that broader progression recovery.

## Immediate work

1. Continue issue #30 archaeology for the remaining low equipment `0x0004/0x0008` paths and category-specific equip side effects; `0x1000/0x2000` and combined `0x3000` are now recovered in the ordinary race frame.
2. Continue race-facing UX, presentation and hardening now that all 24 ordinary activities share the validated runtime path.

## Explicitly outside the current race gate

- Q's Factory post-race dialogue/result branching whose native `resultCode` mapping has not yet been proven;
- complete native scene initialization and reset/debug paths;
- exact original race-start widget sprites/colours, countdown cue-45 playback semantics and the separate 64-update fade appearance;
- live race position ordering: `OrdinaryRaceSession.livePositions()` implements the native ranking sort, but the ordinary coordinator supplies no navigation output/distance for any car, and the human-driven car 0 runs no navigation at all, so the session reports `navigation-metrics-required` and the race HUD shows lap and finish state without a live place;
- outdoor/scene-28 behavior;
- low equipment paths `0x0004/0x0008` and unresolved category-specific equip side effects; the race-frame `0x1000/0x2000` branches are recovered;
- wheel animation and the later UI callback;
- hardware-exact VU timing/flags, rounding and extended-exponent behavior beyond the bounded host-float32 oracle.

The first playable Peach Raceway slice and its Q's Factory launch path have been promoted to stable `main`; ongoing race-facing polish continues on `dev`. A deterministic PAL-backed moving-race capture is retained.

## Validation and evidence

- CI-safe gate: `cd rtao && npm run check`
- PAL-only gate: `npm run test:pal` with locally supplied original-game inputs
- Race evidence: [`evidence/races/2026-09-05/`](evidence/races/2026-09-05/), the C00–C14 acceptance summary at [`evidence/races/2026-09-12/course-validation-summary.json`](evidence/races/2026-09-12/course-validation-summary.json), and the all-activity 6,000-update scalar census at [`evidence/races/2026-09-15/ordinary-race-6000-update-census.json`](evidence/races/2026-09-15/ordinary-race-6000-update-census.json)
- Subsystem archaeology: [`archaeology/`](archaeology/)
- Architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Completion rules: [`development/DEFINITION_OF_DONE.md`](development/DEFINITION_OF_DONE.md)

Original game data must remain local. Do not infer missing native behavior from the C# reference or convenience; PAL evidence remains authoritative.
