# PAL ordinary vehicle frame and moving trajectories

The ordinary movement composition now matches 1,800 retained-state updates
against the supplied PAL instructions across courses C00, C03 and C07. This
locally implements the representative moving-trajectory gate in #5 on
`codex/pal-race-contact-producer`, pending review. The first playable race
session, launch flow and finish-to-Cake trigger remain unconnected.

## Authority and code

Authority is the supplied European `SLES_513.56`, SHA-256
`2b4a310fc8bb145ccbc5e5ec5d023f0c29903c3e4555d63983d4a976f689eff9`,
and the local single-track MODE2/2352 PAL BIN/CUE. The moving test checks that
the executable read from the BIN matches the supplied executable. Original
game assets remain outside the repository.

Active implementations:

- `rtao/src/game/nativeRaceFrame.ts`: the ordinary frame from `0x0021C920`
  through body orientation and distance, stopping at `0x0021D4EC` before wheel
  animation. Uses the previously recovered controls, drive, traction, contact,
  matrix and collision-query implementations.
- `nativeRaceCollisionResponse.ts`: standard `0x0021A510` response for scene
  kind other than 28, including rollback, all 16 low-mask cases, yaw/velocity,
  controlled-car scene flag, opponent removal and impact requests.
- `nativeRaceObstacle.ts`: course obstacle records, the `0x0021AB60` point
  iterator and its height/quadrant tests.
- `rtao/test-support/palRaceFrameOracle.ts`: independent instruction execution
  of the enclosing caller and nested physics helpers.

## Recovered ordering and caller state

The frame clears car flag `0x100` and runtime flags, updates the byte/halfword
countdowns, and forms a local velocity difference from current and previous
world velocities. It subtracts 89 from world velocity Y and retains that
gravity-adjusted vector as the next previous velocity. It separately transforms
velocity and the gravity vector into local space before command consumption.

The supported equipment branches, local drag and three impulse decays run
before the command/force/traction/drift composition. The latter uses the old
matrix to produce world velocity. At `0x0021B3AC`, zero steering curvature also
clears X in the caller's local-difference vector. This write was absent from
the earlier isolated component composition and caused the initial moving
comparison to diverge at Peach update 247. It is now carried into contact and
has a CI-safe regression.

After position integration, contact uses the old transform but the updated
yaw and runtime flags. The caller computes a new native coordinate vector,
runs obstacle tests using negative yaw, and combines their result with the
contact flags for collision response. **Coordinates are written before the
response rolls back or pushes the fixed-point position.** Both values remain
distinct in the frame state; recomputing coordinates after response would
change the next frame's reference height.

Body orientation comes from the three support values and native GP-relative
divisors. Body lift includes the recovered Big Tyre addition. Distance adds
absolute native speed unless the resulting car flags contain `0x200`.

The per-car `+0x1FC` flag is derived from scene time and command bit `0x10`.
It is recorded separately from the GP-selected gear callback. The caller must
provide which recovered gear callback is selected; this implementation does
not infer that choice from `+0x1FC`.

## Collision response

Any nonzero full collision flag word first restores the previous yaw and
rolls position back by `trunc((-velocity << 5) / 25)`, masking X/Z to 28 bits.
Only afterward does the native table at `0x002FEB20` select a response using
the low four bits. A high-only flag therefore still rolls back even though
the response mask is zero.

| Low mask | Local positional push (X,Z) | Local velocity delta (X,Z) | Yaw change |
| --- | --- | --- | --- |
| 0 | (0,0) | (0,0) | 0 |
| 1,7 | (2048,-2048) | (-X/4,-Z/16) | +512 |
| 2,11 | (-2048,-2048) | (-X/4,-Z/16) | -512 |
| 3 | (0,-2048) | (0,-Z) | 0 |
| 4,6,13 | (2048,2048) | (-X/2,-Z/8) | 0 |
| 5 | (2048,0) | (0,0) | 0 |
| 8,9,14 | (-2048,2048) | (-X/2,-Z/8) | 0 |
| 10 | (-2048,0) | (0,0) | 0 |
| 12 | (0,2048) | (0,-Z) | 0 |
| 15 | (0,0) | (0,0) | 0 |

Division truncates toward zero after signed 32-bit negation. The push is
transformed using the contact matrix and integrated at the normal scale.
The transformed velocity delta changes world X/Z only; world Y is retained.
Mask 15 sets scene flag `0x200` and requests diagnostic output for controlled
cars (`carFlags & 3`), or clears an opponent's flags and writes place 255.
Impact suppression and type use the resulting flags, matching the native
post-response ordering. No diagnostic string or effect asset is bundled.

## Original-course obstacle data

Scene setup `0x0020CA44..0x0020CA84` recognizes two collision directory sizes.
The `0x608` layout stores a relative point pointer at `+0x600` and count at
`+0x604`. Setup rebases that pointer into scene `+0xE8 + sector*4`; the ordinary
wrapper uses sector 2. The legacy `0x600` layout has no obstacle buffer.

The 15 supplied courses use the `0x608` layout and contain **1,547 records**
total. C00 has zero, C03 has 96 and C07 has 601. Each record supplies X/Y/Z and
a lower-height filter. The iterator uses a zero-W position difference, filters
height, transforms by inverse yaw and ORs quadrant bits within the native
X limits and inclusive Z bounds ±1.5. Scene setup and the wrapper were executed
against all course buffers, including four yaw values per course.

## Verification

- 8,192 response cases: every low-mask combination, high-only flags, signed
  rollback/overflow cases, both controlled cars and opponents, impact
  suppression, pre-existing velocity W and tilted matrices. Transform helpers
  execute from the original instructions; diagnostic/impact output is observed.
- 4,096 synthetic obstacle cases, covering all 16 accumulated masks.
- All 15 original-course buffers / 1,547 points checked against the PAL pointer
  producer and point/count fields; 60 wrapper queries.
- 1,024 enclosing-frame cases with varied initial velocities/history, commands,
  gear callback, contact state and supported equipment flags.
- 600 moving updates each on C00, C03 and C07, retaining separate native and
  production states. The sequence is acceleration (180 updates), right steer
  with acceleration (60), acceleration (120), brake (60), reverse (60), and left
  steer with acceleration (120). All three move and encounter collision flags:
  respectively 36, 4 and 3 updates. Comparisons include position, coordinates,
  velocity/history, gear/fuel/speed, yaw, matrix/inverse/body, support and impulse
  history, surfaces, timers, flags, distance and effect requests.

Every compared finite number must match exactly under the existing bounded
host-float32 instruction model. Failure output identifies course, update,
command and the differing state fields. The deterministic hash is asserted:
`7f34e9c3d1575f46e88d6ae59bf2a478438356909e836757073c8e9e6ce74b9e`.

`docs/evidence/races/2026-09-05/native-frame-report.json` retains full state at
seven checkpoints per course, counts and the hash. `native-response-report.json`
records the isolated response comparison. `native-frame-instructions.txt` and
`native-frame-trace-verification.json` retain 1,427 instruction words and hashes.
The trace includes unexecuted reset/debug/scene-28 branches for context; retaining
those words does not establish implementation of those paths.

Reproduce instruction evidence from the repository root:

```text
node tools/verify_race_math_evidence.mjs docs/evidence/races/2026-09-05 frame
```

Set `RTA_PAL_EXECUTABLE` for that command. From `rtao`, run `npm run test:pal`
with `RTA_PAL_EXECUTABLE` and `RTA_PAL_BIN`, and separately `npm run check`.
Optional `RTA_RACE_FRAME_REPORT` and `RTA_RACE_RESPONSE_REPORT` select report
paths. The long moving test has a 120-second timeout to accommodate concurrent
PAL suites; the default remains 60 seconds. Gate counts and retained logs are
in `validation.json`, `native-frame-check.log` and `native-frame-pal.log`.

## Remaining boundary

Commands are supplied at `0x0021B840`; ownership/navigation dispatch and its
state mutations are not exercised by these trajectories. Memset, skid/audio,
impact and diagnostic callees remain explicit hooks. Physics, ground/obstacle
queries, support, VU transforms, orientation and standard collision response
execute without hooks. The oracle remains a bounded host-float32 model, not
a hardware-accurate PS2 emulator or a hardware capture.

The frame rejects reset, debug input, outdoor/scene-28 paths and equipment
flags `0x300C` (the uncomposed boost/mode/control branches). Wheel animation and
the subsequent UI callback are outside the stopping point. Starting fixtures
use recovered grid anchors and equipment values but do not execute the entire
native entrant/scene initializer. These restrictions must remain visible when
the first supported playable session is connected; other equipment and scene
paths cannot silently use this frame.

The next player-facing milestone is #6: connect supported native movement,
entrant ownership, player/AI commands, course rendering, ordered laps/finish,
results and the existing persistent Cake reward logic. Q's Factory launch is
#7. No playable race capture, race completion or payout is claimed here.
