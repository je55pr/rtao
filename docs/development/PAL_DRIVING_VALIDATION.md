# PAL driving validation

This gate makes driving changes measurable against executable-backed PAL
arithmetic. It reuses the recovered ordinary-frame scalar oracle instead of
creating a second physics model.

The gate has three deliberately separate parts:

- ordinary race motion/contact/equipment: browser TypeScript
  `advanceNativeRaceFrame` is compared frame-by-frame with instructions
  executed by `palRaceFrameOracle`;
- free-roam motion core: `NativeDrivingMotion` is compared update-by-update
  with the executable's original `0x0021B1C0` scalar vehicle call while both
  receive the same explicit contact inputs;
- chase camera: the pure browser chase-camera policy is compared with a local
  numeric trace captured from PAL observations.

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

The free-roam motion-core gate additionally runs eight 160-update cases through
`NativeDrivingMotion` and the loaded executable routine: selector-zero baseline,
Tyre, Engine, Chassis, Transmission, Steering and Brake independently, plus one
combined loadout. Each case includes acceleration, both steering directions and
a brake/reverse-command phase. Vehicle state and transformed world velocity
must match exactly on every update. This locks the recovered equipment records,
gearbox, drive force, traction, brake hold curve, steering accumulator/curvature,
yaw/drift and fixed-point velocity transform behind the production runtime boundary.

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
      "browserPose": {
        "position": [100, 2, 200],
        "yaw": 0,
        "cameraLift": 4.2,
        "snap": true
      },
      "palCamera": {
        "position": [100, 6, 192],
        "target": [100, 3, 200]
      }
    }
  ]
}
```

Those numbers are schema examples only, not PAL evidence. The retained runtime
contract is the current camera authority; a future local output trace should
contain only measured numeric observations and labels, never executable, disc,
screenshot, texture, audio or other retail payload data.

The camera test feeds each `browserPose` through the same pure
`advanceBrowserChaseCamera` function used by `WorldView`. It then compares that
output with `palCamera`. This means changing the browser camera constants or
smoothing produces a field-level failure against the local PAL observations,
rather than silently changing feel.

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

The current production chase camera remains browser policy even though the
native runtime contract is now recovered. `browserChaseCamera.ts` is still a
behavior-preserving validation seam; its existing distance, lift and smoothing
constants must not be reclassified as native until implementation work replaces
them from the retained contract and validates the result.

The broader gate remains:

```text
npm run check
```
