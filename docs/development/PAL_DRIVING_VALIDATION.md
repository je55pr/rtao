# PAL driving validation

This gate makes driving changes measurable against executable-backed PAL
arithmetic. It reuses the recovered ordinary-frame scalar oracle instead of
creating a second physics model.

The gate has three deliberately separate parts:

- ordinary race motion/contact/equipment: browser TypeScript
  `advanceNativeRaceFrame` is compared frame-by-frame with instructions
  executed by `palRaceFrameOracle`;
- free-roam motion core: the recovered retail scalar composition is compared
  update-by-update with the executable's original `0x0021B1C0` vehicle call,
  while `NativeDrivingMotion` is independently compared with that same scalar
  composition using the explicit playable `symmetric` drift policy;
- chase camera: the retained executable-backed preset/yaw/slip/lag/recenter
  contract is covered by deterministic tests. Live browser rendering currently
  uses an explicitly host-owned chase framing fallback because the recovered
  `0.001` recurrence is not proven to be final world-space camera output. An
  optional measured PAL output trace is still required before replacing that
  presentation fallback with a native output-builder projection.

Original executable, disc and camera-capture inputs remain local. No retail
payload is required or permitted in Git.

## Running the gate

From `rtao/`:

```text
set RTA_PAL_BIN=<local PAL BIN path>
set RTA_PAL_EXECUTABLE=<optional matching extracted SLES_513.56 path>
set RTA_PAL_CAMERA_TRACE=<optional local camera JSON path>
npm run test:pal:driving
```

The motion gate loads `COURSE/C00.BIN` from the local disc and exercises five
120-update scenarios. The 2026-09-18 local pass is retained as
[`driving-validation-summary.json`](../evidence/races/2026-09-18/driving-validation-summary.json).
The scenarios are: straight/coast, a turn-command sequence, active `0x1000`,
active `0x2000` boost, and combined `0x3000`. Pose, velocity, gear/speed,
equipment state, support/impulses, surface slots and contact/obstacle flags are
compared at every update.

A mismatch names the scenario, tick and exact field. For example, a changed
candidate X position is reported as:

```text
PAL driving divergence:
turn-command tick 42 pose.position[0]: browser=... PAL=... delta=... tolerance=0
```

Native integer/state fields are exact by default. Tolerances are explicit
arguments to the comparison helper; do not widen them merely to make a changed
browser implementation pass.

The free-roam motion-core gate additionally runs eight 160-update equipment
cases: selector-zero baseline, Tyre, Engine, Chassis, Transmission, Steering and
Brake independently, plus one combined loadout. Each case includes acceleration,
both steering directions and a brake/reverse-command phase. The retail scalar
composition must match the loaded executable exactly on vehicle state and world
velocity at every update. Separately, `NativeDrivingMotion` must match the same
composition with the explicit playable `symmetric` drift policy exactly. The
x3-steering tick-62 fork is retained as a witness: retail reaches drift/slip/yaw
`-5/-45/5320`, while playable symmetric drift reaches `-1/-8/5357`. This keeps
raw retail authority coverage intact without misclassifying the intentional host
policy as PAL behavior.

## Camera authority and optional output trace

The executable-backed ordinary chase-camera runtime contract is now retained in
`docs/evidence/camera/2026-09-19/` and interpreted in
`docs/archaeology/PAL_CHASE_CAMERA_RUNTIME_2026-09-19.md`. It pins preset
records, vehicle yaw/slip inputs, signed per-invocation lag steps, reset/recenter
states, the semantic `Change View` path and obstruction correction without
committing raw executable instruction bytes.

`RTA_PAL_CAMERA_TRACE` remains an optional second gate for measured end-to-end
camera outputs. Point it at a JSON file with this copyright-safe numeric schema:

```json
{
  "schema": 1,
  "tolerance": 0.0001,
  "samples": [
    {
      "label": "representative-turn",
      "tick": 0,
      "nativeVehicle": {
        "position": [100, 2, 200],
        "nativeYaw": 0,
        "nativeSlip": 0,
        "presetIndex": 0,
        "resetLag": false
      },
      "palCamera": {
        "position": [100, 4, 193],
        "target": [100, 2, 200]
      }
    }
  ]
}
```

Those numbers are schema examples only, not PAL evidence. The retained runtime
contract is the current camera authority; a future local output trace should
contain only measured numeric observations and labels, never executable, disc,
screenshot, texture, audio or other retail payload data.

The optional output test feeds each retained native vehicle position/yaw/slip
sample through the same `advanceNativeChaseCamera` runtime used by ordinary
free-roam and races, then compares that result with `palCamera`. No measured
end-to-end PAL output trace is retained in Git yet, so this second gate remains
conditional on `RTA_PAL_CAMERA_TRACE` rather than treating the browser projection
as proven output-builder parity.

## Boundary

Free-roam now delegates its ordinary longitudinal/steering motion core to
`NativeDrivingMotion` at the PAL 50 Hz fixed update. The previous browser
surface acceleration/max-speed table, `turnRate`/`turnScale` steering curve
and temporary `PartPerformance` motion bridge have been removed from the live
driving API. Native selectors 1..6 are loaded through the executable-backed
Tyre, Engine, Chassis, Transmission, Steering and Brake records and consumed by
the same recovered scalar vehicle arithmetic used by the ordinary-race path.
Categories 7..14 remain outside this handling bridge while issue #30's equip
side effects are unresolved; they are not replaced by browser multipliers.

This does **not** mean outdoor physics is fully native. Free-roam still owns the
existing footprint collision resolver and presentation ground attitude rather
than the PAL seven-probe outdoor support/contact solver. It passes an explicit
level-support compatibility input into `NativeDrivingMotion`; unresolved
browser surface class `other` remains neutral instead of being assigned an
invented native surface code. Reverse command production is likewise an
explicit host bridge because the recovered scalar consumer proves bit 4's
effect but the upstream outdoor command producer is not yet recovered.
Developer Shift/RB boost remains a browser traversal aid outside native motion
state and therefore cannot multiply recovered yaw.

The production ordinary chase path retains a PAL preset, native vehicle
yaw/slip and the recovered float32 per-invocation lag recurrence through
`nativeChaseCamera.ts`. Free-roam advances that controller state on the same
50 Hz fixed ticks as native vehicle motion; ordinary races advance the same
state after each recovered race step. Live rendering still uses the explicitly
host-owned `browserChaseCamera` / `ordinaryRaceChaseCamera` framing because
the retained follow-helper state is not proven to be final output-builder
position. The handoff also does not prove the upstream initial preset selector,
so `browserOrdinaryChasePresetIndex` keeps the current record-0 choice
explicitly host-side rather than declaring it a native default.

The state/output/renderer/obstruction/lifecycle boundary is frozen in
`PAL_NATIVE_CAMERA_HOST_CONTRACT_2026-09-20.md` and represented by
`nativeCameraRuntimeContract.ts`. End-to-end PAL output-builder parity remains
bounded by the optional measured camera trace above. Preset fields whose render
meaning is not proven, the timed recenter angle and slip state are retained
without inventing projection effects. `browserChaseCameraSafety.ts` remains an
explicitly host-only height-clearance adapter; it is not the native
`gp-0x3e60` obstruction loop. The recovered semantic `Change View` action
likewise has no browser binding until that binding is independently proven.

Cross-mode regression coverage additionally locks the integration seams rather than introducing a third motion model: `nativeDrivingCrossMode.test.ts` drives `NativeDrivingMotion` and the ordinary-race scalar consumer from identical recovered equipment/contact inputs and requires exact vehicle/velocity parity, then verifies that free-roam and reflected race presentation advance the same native chase-camera recurrence. Ordinary race launch paths snapshot one complete saved selector block; direct race entry and Q's Factory therefore no longer diverge on player equipment, while unresolved categories 7..14 remain excluded from scalar handling.

The broader gate remains:

```text
npm run check
```
