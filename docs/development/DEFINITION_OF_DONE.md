# Definition of Done

RTAO is a clean-room reconstruction. "Implemented" means more than code compiling: native behavior must remain inside the evidence boundary.

## Maintenance and refactor changes

A maintenance/refactor change is done when:

1. The change has a single clear structural or tooling purpose.
2. It does not intentionally change gameplay/native behavior.
3. `cd rtao && npm run check` passes.
4. Any moved/renamed paths have their live references updated.
5. The MR explains any residual risk and identifies the area a reviewer should inspect.

Large structural refactors should be split from behavior work so regressions can be attributed cleanly.

## PAL-backed behavior changes

A native/gameplay behavior change is done when:

1. **Evidence identified** — executable addresses, original data structures, traces, captures, or other PAL observations supporting the behavior are recorded.
2. **Boundary stated** — unknown or unverified behavior remains gated rather than filled with a plausible approximation.
3. **Implementation added** — active TypeScript behavior lives under `rtao/`; C# remains reference/archaeology unless explicitly targeted.
4. **Deterministic regression added** — a unit/oracle/capture test covers the recovered behavior where practical.
5. **CI-safe gate passes** — `cd rtao && npm run check` passes without requiring copyrighted original inputs.
6. **PAL validation passes when required** — `npm run test:pal` (with the required local environment variables) or an equivalent documented PAL oracle run succeeds. If the environment was unavailable, the MR must say so explicitly and must not claim parity was validated.
7. **Visual validation performed when relevant** — deterministic captures are compared for rendering/scene changes.
8. **Evidence/state documentation updated** — only when the evidence boundary or current implementation status materially changed.
9. **Independent review is possible** — the MR points reviewers to the evidence, tests, unknowns, and highest-risk code.

## Validation commands

From `rtao/`:

```bash
npm run test:unit
npm run typecheck
npm run build:web
npm run build:capture
npm run check
```

PAL-only suite:

```bash
RTA_PAL_EXECUTABLE=/path/to/SLES_513.56 npm run test:pal
```

Some PAL cases also require `RTA_PAL_BIN`. Original game inputs remain local and must never be committed or uploaded as CI artifacts.
