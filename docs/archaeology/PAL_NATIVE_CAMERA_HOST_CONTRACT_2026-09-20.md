# PAL native camera host contract

## Scope

This note combines the retained ordinary chase-camera archaeology into the
runtime boundary that a future native output-builder implementation must obey.
It does not change live camera presentation and deliberately adds no camera
distance, lift, blend, FOV, clipping, recenter or obstruction tuning.

The primary authority remains
`PAL_CHASE_CAMERA_RUNTIME_2026-09-19.md` and its machine-readable
`docs/evidence/camera/2026-09-19/pal-chase-camera-contract.json`.

The executable proves separate controller/state, output-builder and obstruction
stages. The browser must keep those stages separate too. In particular,
`NativeChaseCameraState.position` is retained follow-helper state; it is not
automatically a final world-space camera eye position.

## Runtime state contract

The active TypeScript seam is
`rtao/src/game/nativeCameraRuntimeContract.ts`.

The state envelope contains:

- the recovered `NativeChaseCameraState`, including preset, lag velocity,
  native slip input and timed recenter state;
- an optional `NativeCameraFinalOutput`, containing only final native-space
  camera position and target after an output-builder implementation resolves
  them.

No native final output is fabricated when only controller state is available.
This prevents the retained `0.001` follow recurrence from silently becoming
browser world-space motion again.
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

This contract intentionally does not name the Three.js FOV, near plane, far
plane or aspect as PAL camera values. The retained executable ranges identify
the transform builder at `0x00220458` and projection-pair setter at
`0x002207e8`, but current evidence does not establish a browser-equivalent
projection mapping. Existing renderer projection values therefore remain host
presentation policy until separately recovered.

The same rule removes the need for a native camera implementation to receive a
browser `yawSign`: reflection belongs after final native output, not inside
native yaw/preset arithmetic.
## Obstruction query boundary

The native obstruction loop at `0x0021ef20` calls the selected scene
collision function through `gp-0x3e60`, probes camera-output blocks at
`+0x100` and `+0x110`, observes corrected heights at `+0x104/+0x114`,
adjusts camera state angle `+0x16` by `-0x80` or `+0x80`, rebuilds via
`0x00220458`, and repeats to its signed-angle boundary.

The runtime contract therefore exposes `NativeCameraObstructionQuery` in
native coordinates. A scene adapter may satisfy that query only when it
preserves the selected native collision semantics. The current
`DrivingWorld.sampleHighest` plus six-point height-clearance loop is not that
query and must not be wired into the native obstruction loop merely because it
also detects geometry near the camera.

Obstruction belongs before renderer reflection. Browser clipping/visibility
safety, if retained, is a presentation post-process and remains explicitly
non-native.

## Lifecycle contract

Only recovered state transitions are allowed to mutate native controller state:

- `native-lag-reset` clears recovered lag velocity without inventing a snap;
- `native-recenter` enters the recovered timed recenter callback state;
- `native-preset-select` selects an explicit recovered preset and resets lag
  as the existing native helper does.

A separate `host-output-invalidate` event discards only a previously resolved
final presentation output. It does not alter native controller state. This is
the correct seam for browser scene-coordinate discontinuities until archaeology
proves a corresponding PAL camera reset/rebase transition.
## Browser fallback disposition

The live fallbacks remain necessary, but their retirement conditions are now
narrow and explicit:

- `browserChaseCamera.ts` distance/lift/blend framing stays until
  `0x00220458` final native position/target semantics are recovered or a
  measured PAL output trace proves an equivalent implementation. Once that
  exists, its geometry, smoothing and `rebaseBrowserChaseCamera` can be
  removed from driving presentation.
- `ordinaryRaceChaseCamera` stays for the same final-output gap. It should be
  removed with the free-roam framing fallback, not independently tuned.
- `applyBrowserChaseObstructionSafety` stays as host-only readability safety
  until the native `gp-0x3e60` obstruction query can be supplied with the
  correct scene-collision semantics. It must not be folded into native state.
- `browserOrdinaryChasePresetIndex = 0` stays until the upstream initial
  preset selector is recovered. The ten preset records themselves are native;
  selecting record zero as the initial browser view is not yet proven native.
- Three.js perspective/FOV/near/far setup remains renderer policy until the
  executable projection-pair/output-builder mapping is recovered. It is not a
  reason to retain browser chase geometry after native final pose recovery.
- OrbitControls world/field overview cameras are developer/navigation
  presentation, not part of the driving-camera replacement and are unaffected.

No current fallback constant is promoted into the native contract. The
contract's purpose is to make deletion safe when each evidence gap closes,
rather than to tune the fallbacks to resemble PAL.
## Verification

The CI-safe regression for this boundary is
`rtao/src/game/nativeCameraRuntimeContract.test.ts`. It checks that final
output cannot be confused with controller state, reflection happens exactly
once at the renderer boundary, projection remains opaque host data, and host
scene invalidation does not mutate native controller state.

The existing camera authority gates remain:

```text
cd rtao
npm run test:pal:camera
npm run check
```

The local PAL executable is required only for the PAL-backed half of
`test:pal:camera`. This contract itself carries no proprietary payload.
