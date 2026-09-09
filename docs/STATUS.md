# RTAO status

**Active implementation:** `rtao/` — Three.js / TypeScript browser game  
**Authority:** European PAL executable/data supplied locally by the developer  
**Current priority:** first playable Peach Raceway session (#6)

GitHub issues are the actionable backlog. This page is only the concise implementation/evidence boundary; do not grow it into a second task tracker.

## Race boundary

The ordinary native vehicle path required for the first race slice is merged on `main` (commit `9f8836b` and descendants). Verified foundations include:

- ordinary-race catalogue, entrant/grid construction, finish strips, lap state, rewards and licence progression;
- native ordinary AI/navigation and scheduling/order behavior;
- native controls, drive force, traction and scalar vehicle composition;
- seven-probe ground support and course collision queries;
- scalar contact producer plus orientation/VU helper composition;
- standard collision response and original-course obstacle iteration;
- the enclosing ordinary frame through body orientation/distance across 1,800 retained PAL updates on C00/C03/C07.

The retained 2026-09-05 PAL gate recorded **14 PAL files / 33 tests** passing for this race evidence boundary. Current copyright-safe validation is enforced by GitHub Actions rather than duplicated here as a rolling test count.

Primary write-ups: `PAL_NATIVE_RACE_FRAME_2026-09-05.md`, `PAL_NATIVE_RACE_MATH_2026-09-05.md`, `PAL_NATIVE_RACE_CONTACT_2026-09-05.md`, and `PAL_NATIVE_RACE_COLLISION_2026-09-05.md`.
## Immediate work

1. **#6** — build the supported playable Peach Raceway vertical slice using the merged native movement path: entrant ownership/commands, rendering, ordered laps/finish, results and persistent Cake rewards.
2. **#7** — connect Q's Factory race selection/launch to that validated playable course.

Issues **#3, #4 and #5** describe foundations that are already merged and should remain closed historical milestones, not active prerequisites.

## Explicitly outside the current race gate

- complete native scene initialization and reset/debug paths;
- outdoor/scene-28 behavior;
- equipment path `0x300C`;
- wheel animation and the later UI callback;
- hardware-exact VU timing/flags, rounding and extended-exponent behavior beyond the bounded host-float32 oracle.

The first playable race is not complete, and there is not yet a valid rendered moving-race capture.

## Validation and evidence

- CI-safe gate: `cd rtao && npm run check`
- PAL-only gate: `npm run test:pal` with locally supplied original-game inputs
- Race evidence: [`evidence/races/2026-09-05/`](evidence/races/2026-09-05/)
- Subsystem archaeology: [`archaeology/`](archaeology/)
- Architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Completion rules: [`development/DEFINITION_OF_DONE.md`](development/DEFINITION_OF_DONE.md)

Original game data must remain local. Do not infer missing native behavior from the C# reference or convenience; PAL evidence remains authoritative.
