# RTAO status

**Active implementation:** `rtao/` — Three.js / TypeScript browser game  
**Authority:** European PAL executable/data supplied locally by the developer  
**Current priority:** DEV validation and promotion of the first playable Peach Raceway / Q's Factory race slice

GitHub issues are the actionable backlog. This page is only the concise implementation/evidence boundary; do not grow it into a second task tracker.

## Race boundary

The first ordinary-race vertical slice is integrated on `dev`. Verified foundations include:

- executable-backed ordinary-race catalogue, entrant/grid construction, finish strips, lap state, rewards and licence progression;
- native ordinary AI/navigation, scheduling/order, controls, drive force, traction and scalar vehicle composition;
- seven-probe ground support, course collision, contact/orientation, collision response and original-course obstacle handling;
- the enclosing ordinary vehicle frame validated against retained PAL execution on original courses;
- rendered Peach Raceway (`COURSE/C00`) with the recovered 24-car grid and deterministic moving capture;
- Q's Factory's executable-backed race selector and `StartRace` handoff, currently launching only validated activity 0 / Peach Raceway;
- recovered player equipment selectors passed into the Q's Factory-launched race;
- deterministic finish/reward state, Cake credit, best-finish/licence updates and recovered-progress persistence;
- race exit restores the suspended live town-driving session instead of rebuilding a synthetic return state.

Primary race write-ups remain `PAL_NATIVE_RACE_FRAME_2026-09-05.md`, `PAL_NATIVE_RACE_MATH_2026-09-05.md`, `PAL_NATIVE_RACE_CONTACT_2026-09-05.md`, and `PAL_NATIVE_RACE_COLLISION_2026-09-05.md`. Supporting 2026-09-10 activity, interaction and equipment censuses are retained under `docs/archaeology/` and `docs/evidence/`.

## Immediate work

1. Human DEV play/visual validation of the integrated Peach/Q's Factory slice before promotion from `dev` to stable `main`.
2. Continue the race-facing UX/presentation tranche only after the promotion candidate is accepted.

## Explicitly outside the current race gate

- Q's Factory post-race dialogue/result branching whose native `resultCode` mapping has not yet been proven;
- launching Peach Raceway II, Temple Raceway or any other unvalidated ordinary course from the selector;
- complete native scene initialization and reset/debug paths;
- live race position ordering: `OrdinaryRaceSession.livePositions()` implements the native ranking sort, but the Peach coordinator supplies no navigation output/distance for any car, and the human-driven car 0 runs no navigation at all, so the session reports `navigation-metrics-required` and the race HUD shows lap and finish state without a live place;
- outdoor/scene-28 behavior;
- equipment path `0x300C`;
- wheel animation and the later UI callback;
- hardware-exact VU timing/flags, rounding and extended-exponent behavior beyond the bounded host-float32 oracle.

The first playable Peach Raceway slice and its Q's Factory launch path are implemented to this evidence boundary. A deterministic PAL-backed moving-race capture is retained, but stable-branch promotion still requires the human DEV play/visual check defined by repository policy.

## Validation and evidence

- CI-safe gate: `cd rtao && npm run check`
- PAL-only gate: `npm run test:pal` with locally supplied original-game inputs
- Race evidence: [`evidence/races/2026-09-05/`](evidence/races/2026-09-05/)
- Subsystem archaeology: [`archaeology/`](archaeology/)
- Architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Completion rules: [`development/DEFINITION_OF_DONE.md`](development/DEFINITION_OF_DONE.md)

Original game data must remain local. Do not infer missing native behavior from the C# reference or convenience; PAL evidence remains authoritative.
