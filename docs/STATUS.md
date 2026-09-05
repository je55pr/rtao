# RTAO status

**Active implementation:** `rtao/` — Three.js / TypeScript browser game  
**Authority:** European PAL executable/data supplied locally by the developer  
**Current priority:** supported playable Peach Raceway session

GitLab issues are the actionable project backlog. This page records only the concise current evidence boundary and points at the active work items rather than maintaining a second detailed todo list.

## Current race boundary

Native course collision queries are implemented and verified against PAL behavior:

- underlying course-cell/strip query: `0x00207748`;
- wrapper: `0x00208C50`;
- 8,192 seeded PAL instruction cases;
- 363 wrapper boundary cases;
- 2,040 original-course queries across all 15 courses, including all 360 grid positions;
- latest local gates: **45 CI-safe files / 230 tests** and **14 PAL files / 33 tests**,
  with production and capture builds passing.

Primary write-up: [`PAL_NATIVE_RACE_COLLISION_2026-09-05.md`](PAL_NATIVE_RACE_COLLISION_2026-09-05.md).

The scalar contact producer at `0x0021C280` now matches 8,192 prescribed-transform
PAL cases, 600 retained-history updates and 360 grid-position cases / 2,520
original-course queries. This earlier isolated regression remains intact. See
[`PAL_NATIVE_RACE_CONTACT_2026-09-05.md`](PAL_NATIVE_RACE_CONTACT_2026-09-05.md).

The VU/orientation helpers now compose with contact, course queries and support:
2,048 complete caller cases, all 360 grids and 600 retained contact updates /
6,720 queries. All 65,536 signed yaw values and 4,096 seeded math cases match
the bounded host-float32 PAL instruction oracle. The command consumer's native
world-velocity transform also passes 2,048 composed cases. Hardware rounding,
VU timing/flags and extended exponents remain outside this oracle. See
[`PAL_NATIVE_RACE_MATH_2026-09-05.md`](PAL_NATIVE_RACE_MATH_2026-09-05.md).

The enclosing ordinary frame now matches 1,024 composed cases and 1,800 moving
PAL updates across C00/C03/C07. Standard collision response and original-course
obstacle buffers are verified. Commands are supplied; reset/debug, scene-28,
outdoor, equipment `0x300C`, wheel animation and the later UI callback remain
outside this gate. See [`PAL_NATIVE_RACE_FRAME_2026-09-05.md`](PAL_NATIVE_RACE_FRAME_2026-09-05.md).

## Active work items

The current race path is deliberately ordered:

1. **#3** — scalar contact producer implemented and locally verified on
   `codex/pal-race-contact-producer`; awaiting review, not merged.
2. **#4** — probe transforms, normal/adjustment, orientation and inverse implemented
   and locally verified on the same branch; awaiting review, not merged.
3. **#5** — representative moving trajectories and the supported enclosing
   frame implemented and locally verified; awaiting review, not merged.
4. **#6** — connect the validated native movement path to the first playable Peach Raceway vertical slice.
5. **#7** — connect Q's Factory race selection/launch to the validated playable course.

Architecture cleanup is tracked separately in **#2**, which decomposes `rtao/src/main.ts` through behavior-neutral extraction MRs.

The scalar ground-support solver at `0x0021BDD8` is already verified. The first playable race is **not** complete, and there is no new valid moving-race capture yet.

## Where to look

- Current human-readable evidence boundary: [`../RTA_CURRENT_STATE.md`](../RTA_CURRENT_STATE.md)
- Current machine-readable state: [`../RTA_STATE.json`](../RTA_STATE.json)
- Race evidence: [`evidence/races/2026-09-05/`](evidence/races/2026-09-05/)
- Subsystem archaeology: [`archaeology/`](archaeology/)
- Architecture overview: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Architecture decisions: [`adr/`](adr/)
- Shared contributor/agent rules: [`../AGENTS.md`](../AGENTS.md)

Do not infer missing native behavior from the C# reference or from convenience. PAL evidence remains the implementation boundary.
