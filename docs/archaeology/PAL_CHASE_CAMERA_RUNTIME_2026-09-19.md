# PAL ordinary chase-camera runtime contract

## Scope and authority

This note retains the bounded ordinary chase-camera authority needed by the
future native camera runtime. The source is the developer-supplied PAL
`SLES_513.56` with SHA-256
`2b4a310fc8bb145ccbc5e5ec5d023f0c29903c3e4555d63983d4a976f689eff9`.

The retained machine-readable contract is
`docs/evidence/camera/2026-09-19/pal-chase-camera-contract.json`. Its companion
verification file stores only addresses, word counts and SHA-256 hashes for
the bounded executable ranges. Raw executable instruction words are
deliberately not retained in Git.

No production camera behavior changes in this archaeology task. In particular,
the existing browser chase offsets, interpolation and obstruction safety must
not be described as native merely because a native contract now exists.

## Recovered executable ranges

The ordinary path is bounded by these PAL virtual-address ranges:

- `0x0021eac8..0x0021ef1c`: vehicle-relative follow target and lag state.
- `0x0021ef20..0x0021f1d4`: collision/obstruction correction loop.
- `0x0021f540..0x0021fb08`: ordinary chase-camera controller update.
- `0x0021fb08..0x0021fc40`: timed recenter callback.
- `0x00220458..0x002207e4`: camera transform/output builder.
- `0x002209c8..0x00220a18`: preset copy/lookup helpers.

The preset table begins at `0x002a2150`, with ten records of `0x20` bytes.
The retained table hash is
`59e2ad8e59af09064de0b4a17d0d841862a26ddd9eb0741298aa74af60a5cf39`.
## Presets and vehicle inputs

Each preset record is retained as neutral fields rather than invented camera
semantics: a four-float `vector00`, float `field10`, and raw numeric
`field14`, `field18`, `field1c`. Representative records include
`[0, 2, -7, 1], 500, 0x380, 0, 0` at `0x002a2150` and
`[0, 1.2, -10.8, 1], 461, 0x880, 0, 0` at `0x002a2270`.
The JSON retains all ten records exactly as float32/integer values.

The follow helper consumes the ordinary vehicle record directly:

- signed halfword `vehicle + 0x1d4` is converted to radians as
  `int16 * pi * 2^-15`;
- halfword `vehicle + 0x1d6` is the camera slip input. When copied preset
  `field1c` is zero, it is negated into camera state `+0x1a`; otherwise
  that camera field is cleared.

The two executable pi copies used around this path are at `0x003d5934` and
`0x003d5958`, both float32 `3.1415927410125732`.

## Fixed-step follow smoothing

The helper owns per-player lag state at
`0x017d41b0 + player * 0x10`. Its three axis-like recurrence pairs use
float32 `+0.0010000000474974513` at `0x003d5938/40/48` and
`-0.0010000000474974513` at `0x003d593c/44/4c`.

For each smoothed component the recovered recurrence is:

`error = target - value`; step velocity toward the error by the signed
0.001 constant; clamp velocity to the remaining error to prevent overshoot;
then `value += velocity`.

A deterministic retained trace for target `0.005` starts
`(value, velocity) = (0.001, 0.001)`, then `(0.003, 0.002)`, then reaches
float32 `0.005` with the clamped remainder. The helper accepts no `dt`;
this proves per-camera-invocation recurrence, not a separate wall-clock rate.
## Reset, recenter and semantic control

When the ordinary update sees controller `+0x08 == 0`, it clears the four
words of the selected per-player lag block before returning. This is a native
reset state, but it is not evidence for one browser-style `snap: boolean`.

Controller `+0x1c` bit `0x400` installs callback `0x0021fb08` and resets
controller `+0x08`. For copied preset `field1c == 0`, the callback holds
camera state angle `+0x16` at `-0x8000` through timer `0x3f`, advances
it by `+0x200` on invocations `0x40..0x7f`, then at `0x80` clears
context `+0x28` bit `0x400` and restores `0x0021f540`.

The executable data contains the semantic string `Change View` at
`0x002fe328`, referenced by the entry at `0x002a1278` whose retained
`field08` is `0x78`. The ordinary branch `0x0021f7cc..0x0021f868`
branches on copied preset `field1c` and passes one of the paired preset
selectors to `0x002209c8`.

This proves a native semantic view-change action and preset-pair selection.
It does not prove which browser key or gamepad button should be assigned to
that action; the binding mask is indirect and remains outside this contract.

## Obstruction correction

`0x0021ef20` calls the selected scene collision function through
`gp - 0x3e60`, the same selected collision-query slot already identified by
the PAL vehicle/contact archaeology. It probes camera-output blocks at
`+0x100` and `+0x110`, compares corrected heights at `+0x104/+0x114`,
and adjusts camera state angle `+0x16` by `-0x80` or `+0x80`.
After each adjustment it rebuilds the camera through `0x00220458` and
repeats while the selected collision query still reports an invalid probe or
a raised corrected height, terminating at the signed-angle boundary.

This is executable-backed obstruction correction. It does not authorize
folding any current browser-only raycast/clipping safety into the native
contract unless a later comparison proves equivalence.

## Reproduction

From the assigned repository root, with the matching developer-owned
executable available locally:

```text
node tools/verify_pal_camera_evidence.mjs docs/evidence/camera/2026-09-19 <path-to-SLES_513.56>
```

`RTA_PAL_EXECUTABLE` may be used instead of the third argument. The verifier
rejects any executable whose SHA-256 differs from the authority above, extracts
the ten preset records and semantic control entry, emits the deterministic
lag/recenter traces, and hashes the six bounded code ranges without writing
their instruction bytes to the repository.

The CI-safe retained-evidence regression is
`rtao/tests/palChaseCameraEvidence.test.ts`. The local-authority companion
`rtao/tests/palChaseCameraEvidence.pal.test.ts` verifies the executable hash,
bounded range hashes and semantic instruction decodes when
`RTA_PAL_EXECUTABLE` is set. From `rtao/`, `npm run test:pal:camera`
runs both (the local-authority suite skips when that environment variable is absent).

## Explicit boundary for native-camera-runtime

The recovered contract is sufficient to implement against executable-backed
preset values, yaw/slip consumption, per-invocation follow lag, reset/recenter
states, semantic view changes and obstruction correction. It does not yet
name every raw preset field, prove a browser input binding, prove a single
boolean snap equivalent, or authorize the current browser camera constants.

Implementation work should consume this retained authority without deleting
the evidence boundary. Any presentation-only safety that remains browser-side
should stay isolated and labelled as host policy.
