# RTAO current state

**Updated:** 2026-09-05  
**Canonical source:** GitLab `main`  
**Active implementation:** `rtao/` — Three.js / TypeScript  
**Behavioral authority:** European PAL executable/data supplied locally by the developer

This file is the concise current implementation/evidence boundary. The final pre-GitLab chat-era state document is preserved verbatim at [`docs/archive/state/RTA_CURRENT_STATE_PRE_GITLAB_2026-09-05.md`](docs/archive/state/RTA_CURRENT_STATE_PRE_GITLAB_2026-09-05.md).

## Current priority: ordinary races

Races are the active development priority and the main remaining player-facing progression loop.

### Closed / verified race foundations

- 39 PAL activities identified; 24 are ordinary races across 15 unique course packages (`C00`–`C14`).
- Exact ordinary-race Cake rewards, best-finish bytes and C → B → A → Super A top-six promotion are implemented.
- Three ordered finish strips per course and three-lap crossing state are recovered.
- Native start anchors/grid construction are recovered; 360/360 start slots were collision-grounded.
- Entrant builder `0x0020F9E8` is recovered: player, optional teammates, opponent filtering/fill and human/AI ownership.
- Navigation pointer table `0x002BF5F0`, 1,664 gates/records and dynamic selector `0x00252328` are recovered.
- Ordinary AI `0x00252BA0` matches 4,096 seeded PAL cases.
- Scheduling/order coverage includes 1,260 countdown cases and 256 ranking differential cases.
- Native controls, drive force, traction and scalar vehicle composition are implemented and regression-covered.
- Seven-probe scalar ground-support solver `0x0021BDD8` matches 8,192 PAL instruction cases plus a 600-update retained-history sequence.
- Native course collision query is implemented:
  - underlying query `0x00207748`;
  - wrapper `0x00208C50`;
  - 8,192 seeded instruction cases;
  - 363 wrapper boundary cases;
  - 2,040 original-course queries across all 15 courses;
  - all 360 grid positions included;
  - 1,882 hits;
  - deterministic output SHA-256 `61e221249833e771c1d7a2043fd1a6ef5bd4c5933100706fdb9b24598ab9cfd2`.
- Scalar seven-probe contact producer `0x0021C280` is implemented through the
  orientation inputs: 8,192 prescribed-transform PAL cases, 600 retained-history
  updates, and 360 original-course grid cases / 2,520 queries across all 15 courses.
  This earlier isolated regression remains intact.
- Probe transforms, native yaw polynomial, normal/adjustment, orientation and
  inverse now compose with the contact producer: 2,048 full caller cases,
  360 original-course grids and 600 retained contact updates / 6,720 queries.
  Helper coverage includes all 65,536 signed yaw values and 4,096 seeded cases
  for vector/matrix operations and integer movement transforms.
- Command/force/traction/drift composition now executes the native world-velocity
  transform in 2,048 additional PAL cases using the pre-update matrix.
- Standard collision response matches 8,192 PAL cases; obstacle iteration matches
  4,096 cases plus all 15 original-course buffers / 1,547 points and 60 wrapper queries.
- The enclosing ordinary frame through body orientation/distance matches 1,024
  composed cases and **1,800 retained moving updates** on C00/C03/C07, including
  acceleration, steering, braking, reverse and collision response. Output SHA-256:
  `7f34e9c3d1575f46e88d6ae59bf2a478438356909e836757073c8e9e6ce74b9e`.
- Latest gates: **45 CI-safe files / 230 tests** and **14 PAL files / 33 tests**,
  production build pass, capture build pass, exit 0. PAL tests have a 60-second
  default timeout; the longer moving sequence has a 120-second timeout.

Primary race write-ups:

- [`docs/PAL_NATIVE_RACE_FRAME_2026-09-05.md`](docs/PAL_NATIVE_RACE_FRAME_2026-09-05.md)
- [`docs/PAL_NATIVE_RACE_MATH_2026-09-05.md`](docs/PAL_NATIVE_RACE_MATH_2026-09-05.md)
- [`docs/PAL_NATIVE_RACE_CONTACT_2026-09-05.md`](docs/PAL_NATIVE_RACE_CONTACT_2026-09-05.md)
- [`docs/PAL_NATIVE_RACE_COLLISION_2026-09-05.md`](docs/PAL_NATIVE_RACE_COLLISION_2026-09-05.md)
- [`docs/PAL_NATIVE_GROUND_SUPPORT_2026-09-05.md`](docs/PAL_NATIVE_GROUND_SUPPORT_2026-09-05.md)
- [`docs/PAL_NATIVE_RACE_CONTROLS_2026-09-05.md`](docs/PAL_NATIVE_RACE_CONTROLS_2026-09-05.md)
- retained traces/oracles/captures: [`docs/evidence/races/2026-09-05/`](docs/evidence/races/2026-09-05/)

### Immediate next work

1. Connect the supported native movement path to the first playable **Peach Raceway**
   session: entrant initialization/ownership, player/AI command dispatch, renderer,
   ordered laps/finish, results and persistent Cake rewards (#6).
2. Connect Q's Factory race selection/launch to that validated course (#7).
3. Keep reset/debug, outdoor/scene-28 and equipment `0x300C` paths gated; wheel
   animation and the subsequent UI callback are outside the current frame comparison.

**Current boundary:** the first playable race is not complete. Moving scalar trajectories are verified; no new rendered moving-race capture exists. Commands are supplied at the ownership/navigation boundary, and the complete native scene initializer is not executed. PAL comparisons use a bounded host-float32 instruction oracle; hardware rounding, VU timing/flags and extended exponents are not established. Milestones #3/#4 and the representative #5 trajectory gate are locally implemented on `codex/pal-race-contact-producer`, pending review and unmerged.

Useful primary traces for the next step:

- `docs/evidence/races/2026-09-05/traces/contact_matrix.txt`
- `docs/evidence/races/2026-09-05/traces/contact.txt`
- `docs/evidence/races/2026-09-05/traces/ground_support.txt`
- `docs/evidence/races/2026-09-05/traces/orientation.txt`
- `docs/evidence/races/2026-09-05/traces/normal_matrix_constructor.txt`
- `docs/evidence/races/2026-09-05/traces/matrix_setup.txt`
- `docs/evidence/races/2026-09-05/traces/matrix_normal.txt`
- `docs/evidence/races/2026-09-05/traces/matrix_y.txt`
- `docs/evidence/races/2026-09-05/traces/local_to_world.txt`

## Equipment / commerce / progression

These systems are already implemented to evidence-backed boundaries and should not be reopened casually while race work is active.

- Body Shop transactional purchase: insufficient funds, ownership, 500 Cake debit and persistence; purchase does **not** auto-equip.
- Parts Shop purchase path and Q's Factory owned-gated fitting are implemented; preview does not mutate state and apply writes native selectors.
- Three native 15-byte equipment-selector blocks persist through save schema 10.
- Native WHEEL.BIN wheel geometry and 12-step palette are implemented.
- Big Tyre selector `(1,11)` uses native `0x0400`, TIRE.BIN sections 4/5 and recovered **+0.85 chassis/body lift**.
- Complete 13×6 native tyre grip table and static surface low-nibble mapping are implemented.
- Engine scalars, Steering multipliers, all four Brake hold curves, Chassis inverse mass and proven Transmission launch/final-forward endpoints are implemented. Intermediate shift timing remains evidence-gated.
- Five fitted advertising-sign Cake loops are implemented with persistent distance counters.
- Cloud Hill Second-hand exact half-price sale is implemented.
- Roulette stake/pocket/matcher/payout math is tested; the physical `ACTION/A19.BIN` scene remains unported.
- Parts trade arithmetic is recovered; teammate/save-slot producer state remains unmapped.
- Quick-Pic state covers all IDs 1–100 with Stamp 96 completion.
- Generic fixed-interior runtime covers all 235 executable-mapped slots to the documented evidence boundary.

Detailed subsystem research lives under [`docs/archaeology/`](docs/archaeology/).

## Outdoor / renderer status

The daytime outdoor reconstruction is considered a closed milestone unless a concrete discrepancy is found. Established behavior includes:

- all 64 ordinary FLDs in a persistent world;
- exact toroidal/staggered topology separation from renderer handedness;
- authored STQ, GS local-memory material reconstruction and alpha behavior;
- daytime/nighttime vertex-color separation;
- bridge night-corona family handling;
- dynamic palm crowns and shared SORA sky package;
- PAL-derived resident traffic and fixed interaction zones;
- deterministic capture tooling and derived low-memory fixture support.

Retained field/render primary evidence lives under [`docs/evidence/field-rendering/`](docs/evidence/field-rendering/).

## Validation discipline

Primary browser gate:

```bash
cd rtao
npm run check
```

PAL-backed tests require local original-game inputs. If an agent cannot execute the PAL gate in its runtime, it must say so explicitly and rely only on already-recorded evidence plus non-PAL checks it can actually perform.

Do not commit original game data. Do not invent native behavior to close a feature.

## Repository transition note

The repository now uses Git history, branches, merge requests and review instead of ZIP checkpoints and chat handoff manifests. Historical recovery material is retained under `docs/archive/` only for reference.
