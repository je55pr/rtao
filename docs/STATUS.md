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
- rendered Peach Raceway (`COURSE/C00`) with the recovered 24-car grid and deterministic moving capture;
- C00–C14 accepted as course geometry/collision/native-start-grid inputs: 15/15 compile and render, 360/360 recovered start positions ground, and each representative 24-car grid repeats pixel-identically;
- Q's Factory's executable-backed selector now exposes each authored area range with native licence availability and saved top-six progress; its `StartRace` handoff still launches only validated activity 0 / Peach Raceway;
- recovered player equipment selectors passed into the Q's Factory-launched race;
- deterministic finish/reward state, Cake credit, best-finish/licence updates and recovered-progress persistence;
- game-facing race HUD plus a native-timed start signal driven by PAL widget states 2–6 and scene flag `0x4`, followed by a dedicated completion panel that presents the already-applied player/team places, exact Cake credit, best result and licence promotion without recalculating progression;
- race exit restores the suspended live town-driving session instead of rebuilding a synthetic return state.

Primary race write-ups remain `PAL_NATIVE_RACE_FRAME_2026-09-05.md`, `PAL_NATIVE_RACE_MATH_2026-09-05.md`, `PAL_NATIVE_RACE_CONTACT_2026-09-05.md`, and `PAL_NATIVE_RACE_COLLISION_2026-09-05.md`. Supporting 2026-09-10 activity, interaction and equipment censuses are retained under `docs/archaeology/` and `docs/evidence/`.

Overworld interaction activation is explicit browser host policy: manual NPC/door interaction has no speed limit, while physical NPC-body contact and entry into an authored fixed-interaction polygon auto-activate once per contact episode. This convenience behavior is not claimed as recovered PAL semantics.

## Immediate work

1. Bring the next ordinary race through the existing generic race pipeline, keeping unresolved post-race dialogue branching gated.
2. Continue activity-level validation before removing the explicit activity-0 Q's Factory launch gate.

## Explicitly outside the current race gate

- Q's Factory post-race dialogue/result branching whose native `resultCode` mapping has not yet been proven;
- launching additional ordinary activities from the selector until their activity-specific runtime path is validated; licence availability/progress is recovered, but course geometry acceptance alone is not a launch gate;
- complete native scene initialization and reset/debug paths;
- exact original race-start widget sprites/colours, countdown cue-45 playback semantics and the separate 64-update fade appearance;
- live race position ordering: `OrdinaryRaceSession.livePositions()` implements the native ranking sort, but the Peach coordinator supplies no navigation output/distance for any car, and the human-driven car 0 runs no navigation at all, so the session reports `navigation-metrics-required` and the race HUD shows lap and finish state without a live place;
- outdoor/scene-28 behavior;
- equipment path `0x300C`;
- wheel animation and the later UI callback;
- hardware-exact VU timing/flags, rounding and extended-exponent behavior beyond the bounded host-float32 oracle.

The first playable Peach Raceway slice and its Q's Factory launch path have been promoted to stable `main`; ongoing race-facing polish continues on `dev`. A deterministic PAL-backed moving-race capture is retained.

## Validation and evidence

- CI-safe gate: `cd rtao && npm run check`
- PAL-only gate: `npm run test:pal` with locally supplied original-game inputs
- Race evidence: [`evidence/races/2026-09-05/`](evidence/races/2026-09-05/) plus the C00–C14 acceptance summary at [`evidence/races/2026-09-12/course-validation-summary.json`](evidence/races/2026-09-12/course-validation-summary.json)
- Subsystem archaeology: [`archaeology/`](archaeology/)
- Architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Completion rules: [`development/DEFINITION_OF_DONE.md`](development/DEFINITION_OF_DONE.md)

Original game data must remain local. Do not infer missing native behavior from the C# reference or convenience; PAL evidence remains authoritative.
