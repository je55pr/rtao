# RTAO status

**Active implementation:** `rtao/` — Three.js / TypeScript browser game  
**Authority:** European PAL executable/data supplied locally by the developer  
**Current priority:** native ordinary-race vehicle contact/orientation pipeline

## Current race boundary

Native course collision queries are implemented and verified against PAL behavior:

- underlying course-cell/strip query: `0x00207748`;
- wrapper: `0x00208C50`;
- 8,192 seeded PAL instruction cases;
- 363 wrapper boundary cases;
- 2,040 original-course queries across all 15 courses, including all 360 grid positions;
- latest saved full gate: **48 test files / 232 tests**, with production and capture builds passing in the recorded PAL environment.

Primary write-up: [`PAL_NATIVE_RACE_COLLISION_2026-09-05.md`](PAL_NATIVE_RACE_COLLISION_2026-09-05.md).

## Next evidence-gated work

1. Finish the seven-probe contact producer around `0x0021C280`.
2. Recover/verify native orientation and VU transform helpers around `0x002086C0` and `0x00208738`.
3. Compare deterministic moving trajectories against PAL.
4. Only then connect native movement to the first playable Peach Raceway and Q's Factory race launch flow.

The scalar ground-support solver at `0x0021BDD8` is already verified. The first playable race is **not** complete, and there is no new valid moving-race capture yet.

## Where to look

- Full current state: [`../RTA_CURRENT_STATE.md`](../RTA_CURRENT_STATE.md)
- Machine-readable transitional state: [`../RTA_STATE.json`](../RTA_STATE.json)
- Race evidence: [`evidence/races/2026-09-05/`](evidence/races/2026-09-05/)
- Subsystem archaeology: [`archaeology/`](archaeology/)
- Shared contributor/agent rules: [`../AGENTS.md`](../AGENTS.md)

Do not infer missing native behavior from the C# reference or from convenience. PAL evidence remains the implementation boundary.
