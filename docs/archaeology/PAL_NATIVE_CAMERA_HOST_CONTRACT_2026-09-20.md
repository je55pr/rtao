# PAL native camera host contract

## Scope

This note combines the retained ordinary chase-camera archaeology with the
2026-09-20 final-output recovery. The native output builder is now implemented
for consumers that can supply the recovered world matrix; no browser distance,
lift or blend constants are promoted into native behavior.

The primary authority remains
`PAL_CHASE_CAMERA_RUNTIME_2026-09-19.md` and its machine-readable
`docs/evidence/camera/2026-09-19/pal-chase-camera-contract.json`.

The executable proves separate controller/state, camera-world helper,
output-builder and obstruction stages. The browser must keep those stages
separate too. The earlier `NativeChaseCameraState.position/target` abstraction
has been retired: `0x0021EAC8` owns two per-player lag pairs that shape camera
orientation, while final eye/forward exists only after `0x00220458`.

## Runtime state contract

The active TypeScript seam is
`rtao/src/game/nativeCameraRuntimeContract.ts`.

The state envelope contains:

- the recovered `NativeChaseCameraState`, including copied/mutable descriptor
  local offset `+0x00`, focal `+0x10`, pitch `+0x14`, timed relative-yaw
  `+0x16`, retained `+0x18`, slip `+0x1A`, mode flags `+0x1C`, and the separate
  per-player `+0x00/+0x04` and `+0x08/+0x0C` lag pairs;
- an optional `NativeCameraFinalOutput`, containing the recovered native eye
  (`output +0x170`), +Z-forward vector (`+0x180`) and focal parameter (`+0x18C`).

No native final output is fabricated when only controller state is available.
This prevents the retained `0.001` lag-pair recurrence from silently becoming
browser world-space motion again. `advanceNativeCameraWorldTransform`
implements the recovered `0x0021EAC8` lag/orientation transition when its PAL
car fields are supplied. `0x0021D6A0` then owns packed car-position translation;
`nativeCameraWorldMatrix` intentionally accepts only an already-decoded native
translation. `nativeCameraFinalOutput` consumes the resulting full `W` plus the
mutable descriptor offset/focal/pitch/yaw/slip fields to produce eye/forward/focal.
`materializeNativeCameraFinalOutput` composes those recovered stages only when
all required PAL world inputs and decoded native translation are supplied, and
associates the resulting final output with the same controller snapshot.
`nativeCameraFrameFromStateForRenderer` still returns no frame until that
producer chain has actually run; `selectNativeCameraRenderPose` therefore keeps
the current live host fallback explicit. `replaceNativeCameraController`
discards stale final output whenever controller state advances.

## Final output and renderer boundary

Native camera arithmetic must finish in PAL/native scene coordinates. Only
after that final pose exists may the host convert it to renderer coordinates.

`nativeCameraFrameForRenderer` therefore accepts an explicit
`NativeCameraRendererBoundary` with two host-owned pieces:

1. `toRenderPoint`, which performs coordinate-system conversion such as the
   HG2 X reflection;
2. opaque renderer projection state, passed through unchanged.

`reflectNativeCameraPointX(point, origin)` is a convenience for the already
established HG2 relation `renderX = origin - nativeX`. The origin is supplied
by the scene adapter rather than hidden inside camera arithmetic.

The final recovery identifies `0x002207e8` as a projection-center pair, not
FOV/clip state. `nativeCameraProjectionContract` carries focal/512, perspective
Z coefficients `1.0000457763671875` and `-3.0000686645507812`, exact native near
`1.5` / far `65536`, GS viewport scales, reverse-depth scale/bias, the two decoded
display-scale families, and center pairs `(2048,2048)`, `(2048,1992)`,
`(2048,2104)`. Live Three.js projection remains host-owned only because the
runtime selector for the two unlabelled display-scale modes is not yet wired;
shifted centers also require an off-axis/custom projection rather than only
FOV/aspect.

The same rule removes the need for a browser `yawSign`: all controller,
camera-world and output-builder math remains in PAL/native coordinates.
`nativeCameraFrameForRenderer` converts the recovered eye and host convenience
target `eye + forward` only after native output is complete, so handedness is
reflected exactly once.
## Obstruction query boundary

The native obstruction loop at `0x0021ef20` calls the selected scene
collision function through `gp-0x3e60`, probes camera-output blocks at
`+0x100` and `+0x110`, observes corrected heights at `+0x104/+0x114`,
adjusts camera state angle `+0x16` by `-0x80` or `+0x80`, rebuilds via
`0x00220458`, and repeats to its signed-angle boundary.

`nativeCameraObstruction.ts` now implements that two-probe correction loop as
a pure native stage, including the paired-preset bypass, raw `+0x28 & 0x8000`
and `+0x0B` bypass gates, signed-angle termination, and a rebuild after every
`0x80` correction. `DrivingWorld.queryNativeCameraObstruction` supplies the
ordinary-world query through the retained wrapped native FLD strip walker.
The stage still requires the output builder to supply the exact transformed
`+0x100/+0x110` probe points; those points are not reconstructed from browser
camera geometry. Course-cell scene modes likewise remain a separate adapter.

The existing `DrivingWorld.sampleHighest` plus six-point height-clearance loop
is not the native query. It remains presentation safety only while the browser
fallback pose is selected, and is explicitly bypassed once a native final
output is selected. Obstruction belongs before renderer reflection.

## Lifecycle contract

Only recovered state transitions are allowed to mutate native controller state:

- `native-lag-reset` matches the controller-`+0x08 == 0` path by clearing all
  four words in the per-player lag block, both values and both velocities;
- `native-recenter` enters the recovered timed recenter callback state;
- `native-preset-select` selects an explicit recovered preset and applies that
  same full lag-block reset as the native view-change path.

A separate `host-output-invalidate` event discards only a previously resolved
final presentation output. It does not alter native controller state. Ordinary
FLD seams use that event plus `rebaseBrowserChaseCamera`: they are coordinate-
frame changes inside one outdoor scene, so native lag/controller state remains
continuous and the browser fallback is rebased instead of snapping or flying
across the world.

True scene construction is different. Outdoor startup, Warp/area entry,
interior-to-outdoor return, race start, and the eventual race-to-outdoor return
construct a fresh native camera task, so the browser integration recreates its
camera runtime state at those boundaries. Menu/dialogue pauses preserve camera
history. Race finish itself does not reset the suspended outdoor camera; the
reset happens when the outdoor scene is re-entered.
## Browser fallback disposition

The live fallbacks remain necessary, but their retirement conditions are now
narrow and explicit:

- `browserChaseCamera.ts` distance/lift/blend framing stays only until each
  live driving mode can supply the exact `0x0021EAC8` car inputs
  (`+0x10/+0x50/+0x58/+0x1D4`) to `advanceNativeCameraWorldTransform`.
  `0x00220458` eye/forward semantics are no longer a gap; once the input bridge
  is connected, browser geometry, smoothing and `rebaseBrowserChaseCamera` can
  be deleted rather than tuned.
- `ordinaryRaceChaseCamera` remains the same explicit fallback. The retained
  race contact matrix is not substituted for the camera-specific
  `0x0021EAC8` matrix merely because both are native transforms.
- `applyBrowserChaseObstructionSafety` remains host-only readability safety
  only for fallback poses. The ordinary-world native FLD collision-query adapter
  and recovered two-probe correction stage now exist, but live native correction
  still waits for exact transformed near-edge probes from the final-output
  producer; course-cell scene modes remain separately evidence-gated.
- `browserOrdinaryChasePresetIndex = 0` stays until the upstream initial
  preset selector is recovered. The ten preset records themselves are native;
  selecting record zero as the initial browser view is not yet proven native.
- the native projection mapping is now recovered: focal, two display-scale
  families, near `1.5`, far `65536`, and the three center pairs are represented
  by `nativeCameraProjectionContract`. Live Three.js projection stays on
  `hostCameraProjection.ts` only until the runtime meaning/selection of the two
  display-scale modes is connected; shifted centers require an off-axis/custom
  matrix rather than a simple PerspectiveCamera FOV.
- OrbitControls world/field overview cameras are developer/navigation
  presentation, not part of the driving-camera replacement and are unaffected.

No current fallback constant is promoted into the native contract. The
contract's purpose is to make deletion safe when each evidence gap closes,
rather than to tune the fallbacks to resemble PAL.
## Verification

The CI-safe regression for this boundary is
`rtao/src/game/nativeCameraRuntimeContract.test.ts`. It checks that controller-
only state produces no native renderer frame, final output cannot be confused
with controller state, reflection happens exactly once at the renderer
boundary, projection remains opaque host data, and host scene invalidation does
not mutate native controller state.

The PAL-backed authority test pins the `0x0021EAC8` source/mode/offset/yaw
loads, its normalize/basis/yaw call chain, both matrices passed to
`0x00220458`, projection scale constants/frustum vectors, the center-pair
stores, and the DMA/VIF renderer handoff. CI-safe numeric tests additionally
lock the preset-0 identity-world eye/forward oracle and both recovered projection
families without embedding retail payload.

The existing camera authority gates remain:

```text
cd rtao
npm run test:pal:camera
npm run check
```

The local PAL executable is required only for the PAL-backed half of
`test:pal:camera`. This contract itself carries no proprietary payload.
