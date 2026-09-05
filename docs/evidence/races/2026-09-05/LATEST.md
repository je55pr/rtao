# Latest milestone: native course collision queries

The full course-cell wrapper and authored strip walker are implemented and
match 8192 seeded PAL cases, 363 wrapper boundary cases, and 2040 queries against
original records across all 15 courses (including all 360 grid positions).
Full checks pass **48 files / 232 tests**, production and capture builds, exit 0.
See `docs/PAL_NATIVE_RACE_COLLISION_2026-09-05.md` and the saved report/log/traces.

The contact-output capture hash is
`61e221249833e771c1d7a2043fd1a6ef5bd4c5933100706fdb9b24598ab9cfd2`.
This is deterministic scalar evidence, not a moving race or new image capture.
No race UI or existing renderer was changed. The sampler retains original
plane records and cell membership absent from the render collision cache.

Next: finish the 0x21C280 contact producer and native orientation/VU transforms.
Then verify moving Peach trajectories and connect the race session/results.
The first playable Peach race remains pending. Continue in short work blocks
with frequent visible updates and save every verified milestone.

The original BIN can be supplied with `RTA_PAL_BIN` alongside
`RTA_PAL_EXECUTABLE`; `RTA_RACE_COLLISION_REPORT` optionally writes query counts
and output hash. Run commands from `web`. Original game bytes are excluded.

# Earlier milestone: native ground support

The complete scalar seven-probe support solver is now implemented and checked
against 8192 PAL executions and a 600-update history sequence. Full checks pass
**47 files / 228 tests**, production and capture builds (exit 0 observed).
See `docs/PAL_NATIVE_GROUND_SUPPORT_2026-09-05.md` and the evidence here.

Next: the collision query that supplies these probes and the native matrix/VU
transforms. The playable Peach race is still pending. No guessed contact model
was connected. Continue in short blocks with minute-by-minute visible updates
and save every verified milestone.

The earlier vehicle checkpoint below remains useful background. Its capture
build uncertainty is superseded by the complete successful gate above.

# Saved continuation: native vehicle scalar stages

This save preserves all local source changes after source archive version 62.
No new race implementation was started during the save.

## Current implementation

- `nativeRaceTraction.ts`: traction speed (0x21B460), yaw step/lateral demand
  (0x21B520), drift feedback (0x21AF38). Each suite has 4096 seeded PAL cases;
  the yaw suite also compares the resulting s2/s1 register values.
- `nativeRaceVehicle.ts`: direct PAL equipment-table reader, opponent selector
  extraction, composed gear/steering/brake/force/traction/drift path, quadratic
  drag and 28-bit fixed-point position integration/coordinate extraction.
- `nativeRaceVehicle.pal.test.ts`: all 24 ordinary race equipment sets plus
  all scalar selector ranges and teammate modifiers; 2048 composed-path cases;
  4096 drag/position cases. The composed oracle hooks audio/effects and uses
  an identity transform, so this does NOT verify VU transforms or contact.
- `createNativeRaceVehicleState` starts in gear 1, as written at 0x219C88.
- Finish-gate phase 0 is now allowed: ordinary initialization leaves it zero,
  and the first start-strip crossing changes it to 2 without awarding a lap.

## Verification and limits

The last completed test phase passed 46 files / 226 tests with the supplied PAL
executable. Production build completed. The capture-build log ends at rendering
chunks, and its process completion was not recovered across the interruption;
its completion is not asserted. The earlier controls checkpoint passed both
builds and verified identical PNG bytes for Peach and Ninja repeated grids.
All available logs, traces and captures are included here.

The playable race remains unfinished. Q's Factory race launch/result UI has
not been connected. There is no new playable physics bridge: the verified
scalar APIs take contact inputs and local vectors supplied by their caller.
No inferred contact constants, collision responses or reward triggers were
introduced to make a race appear complete.

## Native findings to retain

- 0x21953C: ordinary opponents use descriptor settings +4 as equipment selector
  pointer; settings +0x12 supplies runtime equipment flags. `rawSettings` starts
  at settings +4, so flags are its bytes 14/15.
- 0x218F70 copies six signed tyre grips, engine scalar/consumption, chassis mass,
  steering scalar, brake curve pointer and eight gear words. Teammates gain
  trunc(grip/16), lose trunc(mass/4); Big Tyre adds mass 5.
- IMPORTANT 0x219D30 clears fuel consumption for cars whose flags &3 ==0.
  The equipment reader mirrors setup before this later initialization write;
  a future runtime must apply it to ordinary opponents, not debit engine fuel.
- 0x219588 initializes fuel to 0x40000. Initial gear is 1; speed/engine/drift/
  brake counters are zero; contact fields +1DC/+1E0/+1E4 start at 4096.
- 0x21D1B8 integrates each velocity with trunc((v<<4)/25); X/Z mask 0x0FFFFFFF.
  Coordinate extraction adds the Z 0x02000000 wrap bit /2 to X, masks X/Z to
  0x01FFFFFFF, and divides float32 coordinates by 20971.51953125.
- 0x21B1C0 uses pre-update local forward speed for the +1B8 traction write,
  distinct from the drive-force output. It transforms that output with the
  pre-update car matrix, then runs drift feedback.
- Native contact producer 0x21C280 samples seven authored points from 0x2A1DD0,
  calls the course collision function via gp-15968, produces support/contact
  values and builds the orientation matrix. It is NOT implemented yet.
- 0x21C8AC calls 0x2086C0 with the recovered ground normal; 0x21C8CC calls
  0x208738 with signed yaw in radians; 0x21C8D8 builds the inverse matrix using
  0x2758B8. Original VU transforms must be recovered before native movement
  can be claimed. `matrix_setup.txt` is actually 0x21AD88 collision work;
  `orientation.txt` is wheel animation, not the car orientation constructor.
- Navigation distance +24C is written at 0x2528E4: next record's forward-gate
  midpoint delta projected using the native sin/cos of the current gate normal.
  Fresh sin/cos kernels and reduction traces are retained, not implemented.
- Lap callback 0x22E910 increments +19B and awards finish when it equals the
  descriptor's lap count. It sets flags |0x280 and speed limiter 40. Race update
  0x22F6F0 processes car slots in ascending order and skips finished cars.

## Resume

1. Re-establish a short work block and visible updates (user experienced a long
   apparent UI freeze). Save verified milestones before substantial continuation.
2. Recover native contact/orientation and vector transforms; close movement.
3. Verify deterministic moving Peach trajectories/captures and lap/finish order.
4. Connect Q's Factory selection, race session and existing once-only Cake/
   licence persistence only after evidence-backed race completion exists.

Local original input: `game/SLES_513.56`, SHA-256
`2b4a310fc8bb145ccbc5e5ec5d023f0c29903c3e4555d63983d4a976f689eff9`.
The original game and installed dependencies are not redistributed in source.
Run project commands from `web`, with `RTA_PAL_EXECUTABLE` pointing to that input.
