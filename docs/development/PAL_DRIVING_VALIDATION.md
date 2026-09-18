# PAL driving validation

This gate exists to make driving changes measurable before the browser's
presentation-oriented driving feel is replaced. It reuses the recovered PAL
ordinary-frame scalar oracle instead of creating a second physics model.

The gate has two deliberately separate parts:

- motion/contact/equipment: browser TypeScript `advanceNativeRaceFrame` is
  compared frame-by-frame with instructions executed by `palRaceFrameOracle`;
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

## Local camera trace

Camera evidence is intentionally not frozen here until a reproducible PAL
capture is available in the local workspace. Point `RTA_PAL_CAMERA_TRACE` at a
JSON file with this copyright-safe numeric schema:

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

Those numbers are schema examples only, not PAL evidence. A real local trace
should contain only measured numeric observations and labels, never executable,
disc, screenshot, texture, audio or other retail payload data.

The camera test feeds each `browserPose` through the same pure
`advanceBrowserChaseCamera` function used by `WorldView`. It then compares that
output with `palCamera`. This means changing the browser camera constants or
smoothing produces a field-level failure against the local PAL observations,
rather than silently changing feel.

## Boundary

`ArcadeCarController` is still the existing browser-authored free-roam model.
This validation work does not claim that its acceleration, steering or collision
constants are native. Instead, the recovered `advanceNativeRaceFrame` path is
the executable-backed candidate contract that a future browser-driving
replacement can consume without changing the oracle.

The current chase camera is likewise only browser policy until its local PAL
trace passes. Extracting its arithmetic into `browserChaseCamera.ts` is a
behavior-preserving seam for validation, not evidence that the existing
distance, lift or smoothing constants are native.

The broader gate remains:

```text
npm run check
```
