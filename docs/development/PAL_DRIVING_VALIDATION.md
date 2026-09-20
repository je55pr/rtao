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
- chase camera: executable-backed tests now cover preset/slip/recenter state,
  both `0x0021EAC8` lag pairs and camera-world matrices, `0x00220458`
  eye/forward/focal output, both recovered projection families, projection
  centers and the renderer DMA/VIF handoff. Live browser framing remains only
  until each host mode supplies the exact PAL car-record inputs consumed by
  `0x0021EAC8`; the recovered lag pairs are orientation state, not camera eye.

Original executable, disc and camera-capture inputs remain local. No retail
payload is required or permitted in Git.

## Running the gate

From `rtao/`:

```text
set RTA_PAL_BIN=<local PAL BIN path>
set RTA_PAL_EXECUTABLE=<optional matching extracted SLES_513.56 path; required with RTA_PAL_CAMERA_TRACE>
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

Free-roam contact validation now also has two complementary stress gates. The
CI-safe `nativeOutdoorContactSoak.test.ts` composes 6,000 PAL ticks of mixed
slope/crest support, dry/off-road/grass surface words, shoreline auxiliary
contact, an 80-tick unsupported interval, repeated obstacle masks and Big Tyre.
It requires deterministic output, finite pose/velocity/body matrices, native
support clamps `0..8192`, and the unsupported recovery pulse. With
`RTA_PAL_BIN` present, `drivingValidation.pal.test.ts` additionally loads the
original `FLD/223.BIN` and `FLD/221.BIN`: it rechecks the retained Peach
shoreline normal-vs-Big-Tyre state split and drives the native contact runtime
across the retained FLD/223 -> FLD/221 seam without browser footprint fallback.
The 2026-09-20 local PAL pass confirmed the odd-row stagger explicitly: the
source-side FLD/223 point is approximately `(960.2, 0.2)`, which crosses into
the retained target-side FLD/221 point near `(160.2, 1599.8)`. The executable
authority was read directly from the same PAL disc image, so no separately
exported executable was required. Special-outdoor scenes remain on their
separately tested compatibility path.

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
        "resetLag": false,
        "pitchTarget": 896
      },
      "cameraWorld": {
        "sourceVector": [0, 1, 0, 0],
        "offset50": 0,
        "offset58": 0,
        "translation": [100, 2, 200]
      },
      "palCamera": {
        "position": [100, 4, 193],
        "target": [100, 2, 200]
      }
    }
  ]
}
```

Those numbers are schema examples only, not PAL evidence. Schema 1 remains
parse-compatible with older vehicle-only traces, but final-output comparison now
requires `cameraWorld`: the recovered `0x0021EAC8` source vector/offsets plus an
already-decoded native translation for the separate `0x0021D6A0` stage. A
vehicle position/yaw/slip sample by itself is intentionally rejected rather than
being reinterpreted as camera output. `pitchTarget` is optional and represents
an already-resolved native `+0x14` target; omitting it retains the descriptor's
current pitch. `RTA_PAL_EXECUTABLE` is required with a camera trace so the gate
uses the matching executable-backed native math coefficients.

The optional output test advances descriptor/controller state, materializes the
recovered camera-world and final-output producer stages, and compares native eye
plus `eye + forward` with `palCamera`. A future local output trace should contain
only measured numeric observations and labels, never executable, disc,
screenshot, texture, audio or other retail payload data. No measured end-to-end
PAL output trace is retained in Git yet, so this second gate remains conditional
on `RTA_PAL_CAMERA_TRACE` and does not promote browser projection policy to
native semantics.

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

Standard-FLD free-roam now advances the retained seven-probe PAL contact and
support recurrence once per native tick. `NativeDrivingMotion` consumes its raw
surface word, three support values, contact matrix/inverse and retained velocity
history directly; the former level-support compatibility inputs are supplied
only on compiled-only and special-outdoor fallback paths. The same support
history now builds the recovered local chassis/body matrix, including Big
Tyre's PAL body lift, while contact orientation remains the root terrain frame.
Browser `groundAttitude` sampling/smoothing therefore no longer contributes to
standard-FLD pose. Reflection of the local body matrix occurs only when it is
projected into the Three.js chassis transform.

Standard-FLD post-contact response is now native as well: terrain-edge/contact
flags and authored outdoor obstacle masks feed the recovered scene-kind `-1`
rollback/push response, and the resulting velocity/yaw are retained into the
next 50 Hz tick. Unsupported support remains the recovered support/history/
impulse recurrence rather than a browser ballistic mode or road snap. The
slot-`11` 26-group obstacle extension is represented by an explicit runtime
enable seam; the browser does not fabricate the unrecovered PAL enable bitset.

This still does **not** make all outdoor physics native. Special-outdoor scene
dispatch remains compatibility-only, unresolved browser surface class `other`
stays neutral on that path, and the explicit scene-`0x400` reset producer is
not inferred from collision/support failure. Reverse command production is
likewise an explicit host bridge because the recovered scalar consumer proves
bit 4's effect but the upstream outdoor command producer is not yet recovered.
Developer Shift/RB boost remains a browser traversal aid outside native motion
state and therefore cannot multiply recovered yaw.

The production ordinary chase controller retains the mutable PAL descriptor fields and two executable-backed lag pairs in `nativeChaseCamera.ts`; it no longer carries a fabricated camera position or target. `nativeCameraWorldTransform.ts` implements the recovered `0x0021EAC8` lag/orientation helper when supplied car `+0x10/+0x50/+0x58/+0x1D4`, while `0x0021D6A0` remains the separate packed-position translation stage. `nativeCameraFinalOutput.ts` consumes the full native `W` and mutable descriptor local offset/focal/pitch/relative-yaw/slip to produce eye/+Z-forward/focal, and exposes the recovered normalized perspective/GS viewport/depth families. Live standard-world and ordinary-race rendering still route through `selectNativeCameraRenderPose` and deterministically choose their existing host fallback because those exact car-record inputs, packed translation and upstream pitch/display-mode selectors are not yet bridged from host simulation state. The race contact matrix is not used as a substitute for the camera-specific helper matrix. Special-outdoor remains directly on host framing because its native camera scene path is not recovered.

The state/output/renderer/obstruction/lifecycle boundary is frozen in `PAL_NATIVE_CAMERA_HOST_CONTRACT_2026-09-20.md`. `nativeCameraProducer.ts` composes the recovered world-orientation, decoded translation and final-output stages atomically without guessing missing host data. `nativeCameraObstruction.ts` now carries the recovered two-near-edge correction loop, and ordinary-world `DrivingWorld.queryNativeCameraObstruction` routes its height query through the retained wrapped native FLD strip walker. The browser six-sample `+1.8` safety is applied only to host-fallback poses. Remaining camera integration gaps are narrow: source the exact helper car fields for each live mode; materialize the exact transformed `+0x100/+0x110` near-edge probes for the live producer; resolve the course-cell obstruction adapter plus runtime selector/meaning of the two recovered display-scale modes and shifted projection centers; and recover the upstream initial preset selector. `hostCameraProjection.ts` and `browserChaseCamera.ts` remain explicitly host-owned until those seams close. The recovered semantic `Change View` action likewise has no browser binding until independently proven.

Cross-mode regression coverage locks the integration seams rather than introducing a third motion model: `nativeDrivingCrossMode.test.ts` requires free-roam and ordinary-race motion to agree on recovered vehicle/velocity behavior and requires their camera controllers to consume identical native slip/recenter inputs before renderer presentation. Ordinary race launch paths snapshot one complete saved selector block; direct race entry and Q's Factory therefore no longer diverge on player equipment, while unresolved categories 7..14 remain excluded from scalar handling.

The broader gate remains:

```text
npm run check
```
