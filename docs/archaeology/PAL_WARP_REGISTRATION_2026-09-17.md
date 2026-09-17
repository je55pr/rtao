# PAL Warp registration state — 2026-09-17

## Authority and result

Authority is European PAL `SLES_513.56`, SHA-256
`2b4a310fc8bb145ccbc5e5ec5d023f0c29903c3e4555d63983d4a976f689eff9`.
No executable bytes or original assets are retained here.

The fixed-interaction opening routine at `0x0023E310` owns the proven Warp
registration event. It reads local fixed slot `+33` and authored area `+35`.
After the entry stream has observed the old first-meeting state, the routine
clears that interaction's first-meeting bit as already recovered.

When and only when the local fixed slot is zero, areas 1–9 take an additional
persistent path. Table `0x002B81D0` maps those areas to one-based flag IDs
`1, 10, 23, 52, 91, 60, 72, 85, 50`. The routine subtracts one and ORs the
selected bit into the save bit bank at `+0x528`.

That side effect is therefore modelled at fixed-interaction open, not at debug
teleport, arbitrary area transition, or dialogue action `0x14`. In the ordinary
towns, local slot zero is Q's Factory staff for areas 1–8; area 9 slot zero is
Gonzo, so the implementation follows the executable slot rule rather than
inventing a Q's-Factory-only special case.

## Consumer and persistence boundary

Helper `0x0023F200` tests the same `+0x528` bit bank. Its recovered caller at
`0x002680D0` sits in the pause-menu Warp selection path; the associated menu
text includes the English fragments `Check visited a city` and `Warp to`.
This closes registration as persistent Warp-facing state without proving any
further destination-selection semantics.

`DialogueRuntimeState` now stores the native one-based flag IDs and exposes
registered authored-area indices through the recovered mapping, sharing its
revision/save pipeline with the other recovered progress. Recovered save schema
10 gains optional `warpRegisteredAreaIndices`, deliberately without a schema
bump so existing browser saves remain readable. A schema-10 save written before
this field existed can reconstruct a registration only from an existing
`metFixedInteractions` entry `[area, 0]`, because that persisted completion is
proof that the exact native opening event already happened.

Fresh browser recovered state contains no synthetic Warp registrations. Repeat
opens are idempotent, matching the native OR operation. Q's Factory now queues
the existing recovered-progress save immediately after constructing its
`DialogueFlow`, matching generic fixed interiors which already save on open.

## Remaining boundary

This does **not** claim that a registered area is currently selectable as a
Warp destination, recover destination order, assign entry selectors, or enable
browser Warp travel. Those semantics remain separate evidence. Debug teleport
and generic area-transition actions remain outside registration.

Deterministic regression coverage pins empty initial state, exact slot-zero
registration, duplicate visits, reload persistence, and pre-field schema-10
compatibility. The CI-safe gate remains `cd rtao && npm run check`.

## Validation

Focused `dialogueProgress.test.ts`: 23/23 tests passed. The complete CI-safe
`npm run check` gate passed: 73 test files / 402 tests, typecheck, production
build and smoke, and sandbox capture bundle build.
