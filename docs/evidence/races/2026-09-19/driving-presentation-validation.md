# Driving presentation validation — 2026-09-19

This is the issue #26 presentation pass after the native driving, equipment and
chase-camera integration. The European PAL executable/disc supplied locally is
the behavior authority. No recovered vehicle arithmetic was changed during this
pass, and no original game bytes or screenshots are retained here.

## Deterministic capture comparison

The DEV browser was loaded from the local PAL BIN/CUE and the ordinary-race
capture entry points were run at 1280×960 through 420 fixed 50 Hz updates with
player command mask `1`. The Three.js capture is intentionally canvas-only;
the game HUD is DOM presentation outside that image.

| activity | moved | canvas SHA-256 before HUD fix | canvas SHA-256 after HUD fix |
| --- | ---: | --- | --- |
| Peach Raceway | 47.567 | `db77d5eeb1a1b29c582af667e64aa4b93de503744abb8dcd5c8cad15fd71c428` | same |
| Peach Raceway II | 47.567 | `4499d2c4117659b433d0494a314d08c159a0d4b8450d53e57d9d795054e4083c` | same |
| Temple Raceway | 47.567 | `cff15851de52d44f4d9c59d9617ea950fe0936b41198af8356d788f4645d95a0` | same |

Before the presentation fix, all three DOM HUDs said `Peach Raceway` even
though activities 1 and 2 were already running the correct recovered runtime.
The HUD and active-race button now take the executable-backed
`runtime.activityName`: the three checks read `Peach Raceway`,
`Peach Raceway II`, and `Temple Raceway` respectively. Identical canvas
hashes before/after are the expected guardrail: the correction changes host UI
text only and does not touch vehicle, camera, collision, course, or renderer
state.

The captured PNGs were inspected locally and discarded as validation artifacts;
only copyright-safe numeric metadata and hashes are retained in Git.

## Presentation findings

**Steering readability.** Free-roam and ordinary races consume the same
recovered scalar steering/yaw core at 50 Hz. Cross-mode regression drives both
paths through the same 120-update steering sequence and requires exact native
vehicle and world-velocity equality. The browser wheel steering pose remains a
presentation projection of recovered steering state; no steering gain, yaw
multiplier, or input curve was added in this pass.

**Speed sensation.** The 420-update moving captures all advance the player
47.567 course units. Speed remains communicated by recovered motion, wheel
rotation, native engine-audio state and scene motion rather than a new
speed-dependent FOV, camera pull-back, shake, or post-process effect. Adding
those without PAL evidence would make the host feel layer silently redefine the
native result, so none was introduced.

**Chase-camera comfort/readability.** Ordinary free-roam and reflected race
presentation advance the same recovered chase recurrence. Preset zero projects
the recovered ordinary offset of 7 units behind and 2 units above the vehicle;
the retained fixed lag, native yaw/slip input and recenter state remain
unchanged. Free-roam additionally has the separately named
`applyBrowserChaseObstructionSafety` host adapter, while ordinary races do not
claim that adapter as PAL camera behavior. The three sampled moving race frames
remain readable at the capture point. A measured end-to-end PAL camera output
trace is still not retained, so this pass does not claim complete browser
output-builder parity or prove every obstruction case.

**Collision presentation.** Ordinary-race pose/contact remains driven by the
PAL-backed seven-probe support, course collision and collision-response path.
No camera kick, synthetic bounce, rumble, slowdown, or collision animation was
added. Free-roam still uses the explicitly incomplete browser footprint and
ground-attitude bridge; its recovered Big Tyre 1.35 contact gate is tested, but
that bridge must not be described as native seven-probe outdoor collision.

**Tyre/equipment effects.** The PAL gate replays selector-zero, Tyre, Engine,
Chassis, Transmission, Steering and Brake cases independently plus a combined
loadout through acceleration, steering and braking/reverse phases, requiring
exact native vehicle and transformed velocity equality on every update.
Free-roam and race now snapshot the same complete selector block; scalar
categories 1..6 use recovered records, and tyre/wheel selectors also keep the
race model aligned with the saved loadout. Categories 7..14 remain
evidence-gated by issue #30.

**Ordinary-race readability.** Native-timed start signal, lap state, finish
state and result panel remain intact. This pass fixed one host-only readability
defect: the live HUD no longer labels every ordinary activity as Peach Raceway.
Live place remains intentionally absent while navigation metrics for the human
car are unavailable, so the HUD shows lap/finish state rather than inventing a
position.

## Explicit host policy

The following remain browser policy rather than recovered vehicle behavior:
free-roam obstruction safety, wheel animation, free-roam reverse-command
production, Shift/RB developer traversal boost, semantic/browser input bindings
and the DOM HUD/result presentation. The activity-name correction in this pass
belongs to that layer. None of these policies may feed replacement values back
into the recovered scalar vehicle or PAL oracle.

## Validation boundary

Focused presentation/integration regression covers native equipment handoff,
native chase-camera recurrence, browser obstruction separation, free-roam
driving and ordinary-race coordination. PAL-backed driving validation covers
the C00 frame oracle and free-roam scalar machine; PAL camera validation checks
the retained executable contract. The optional measured
`RTA_PAL_CAMERA_TRACE` output comparison remains unavailable.

A full human manual comfort judgment across every race/course is not converted
into a native claim by this pass. Issue #26 should therefore distinguish the
completed deterministic/presentation checks from that subjective/manual
boundary rather than treating local visual review as executable evidence.

## Verification results

- Focused native driving/camera/equipment/race regression: 6 files, 26 tests passed.
- `npm run check`: passed; 94 unit-test files / 496 tests passed, followed by typecheck, production build, Chrome production smoke and sandbox capture build.
- `npm run test:pal:driving` with the local PAL BIN: 3 tests passed and the optional measured camera-trace test skipped. The executed gates include 600 C00 pose/velocity/contact updates plus the independent/combined free-roam equipment scalar sequences.
- `npm run test:pal:camera` with the local `SLES_513.56`: 2 files / 8 tests passed, rechecking the retained executable camera contract and verification hashes.
- Post-fix browser capture import: all three activity names corrected in the DOM HUD and all three pre-fix canvas SHA-256 values reproduced exactly.

The single PAL-driving skip is the already-declared optional
`RTA_PAL_CAMERA_TRACE` measured output comparison; it is not a failed native
driving/contact/equipment oracle.
