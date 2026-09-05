# Latest saved state

Read [LATEST.md](LATEST.md) first for the newer vehicle checkpoint and exact
resume boundary. The sections below describe the earlier stopped run.

# RTA race checkpoint — 2026-09-05

Saved at the user's request to stop implementation and return. The current
source includes the ordinary PAL AI work and the later race scheduling/order
work. No implementation was added during this saving step.

## Implemented and last tested

- `web/src/game/raceAi.ts`: ordinary AI target angles, speed/brake commands,
  steering, wrong-way yaw correction, speed-profile feedback and adaptation.
- `web/src/game/raceScheduling.ts`: scalar start callback at `0x0022F068`,
  50/60-update timing branches, fade, hold reset, scene flags and observed
  external call events.
- `web/src/game/racePositions.ts`: live ordering at `0x0022ED38` by effective
  signed lap, finish phase, navigation output and distance, excluding finished
  and inactive cars.
- Bounded original-instruction oracle plus opt-in actual-PAL tests in
  `web/test-support` and `web/tests`.
- Race-grid browser capture entry point and `race_grid_capture.mjs`.

The last complete `npm run check`, from `web` with `RTA_PAL_EXECUTABLE` set,
passed 41 test files / 214 tests, the 52-module production build and the
48-module capture build. The PAL reports record 4,096 AI cases, 1,260 countdown
cases and 256 ranking cases. These tests use a bounded host-float32 scalar
interpreter; external fade/audio/UI/scheduler calls are observed hooks.
The tests and builds were completed before this save; this checkpoint adds
only evidence and handoff metadata.

## Captures and correction

Peach Raceway and Ninja Temple each have a 24-car grid PNG and 23 opponent AI
snapshots. Equipment previews are neutral and do not establish native opponent
equipment. These are static grid/AI inspections, not playable race captures.

The earlier claim of pixel-identical repeats was not established. The browser
returned `sha256: "unavailable-in-browser-context"` for both repeats, and the
capture script compared those identical sentinel strings. It retained only
one PNG per activity. `captures/race-grid-evidence.json` is preserved unchanged
as the raw output, including its unreliable `repeatIdentical: true` flags.
`validation.json` records real SHA-256 hashes of the saved PNG files and marks
repeat equivalence unverified. Activity names in the report are correct.

## Resume here

1. Fix `race_grid_capture.mjs` to hash or compare the returned PNG bytes in
   Node; do not use the optional browser hash as the repeat gate. Recapture
   both repeats and verify equality.
2. Finish the manual review of the new scheduler/live-order layer, including
   oracle memory setup and native insertion/tie semantics. The tests pass,
   but this review was paused at the user's request.
3. Continue from the PAL command consumer around `0x0021D000`, including
   command bit 8 and native speed/vehicle integration. Wire the first playable
   race only after those behaviours are evidenced.

The scalar start callback and ordering functions are standalone. The current
source does not implement a full scheduler, audio/UI hosts or a playable race
physics loop. Existing race prizes/licence persistence remain from the prior
race-foundation checkpoint; this run did not extend economy rules.

## Evidence and restoration

`traces/` contains the instruction disassemblies and both PAL oracle reports.
`captures/` contains the two saved PNGs and original inspection JSON.
The source archive includes this directory and all current source/test files.

Use `/RTA/Current/RTA_current_source.zip` with its matching current state files.
The original PAL game, browser and dependency archives remain under the
existing `/RTA/Inputs` folders. Game images and the executable are intentionally
external inputs. Build outputs, dependencies and compiler caches can be rebuilt.

From `web`, run `RTA_PAL_EXECUTABLE=<absolute extracted SLES_513.56> npm run check`.
Actual-PAL test files skip without that environment variable. After correcting
the repeat gate, run `RTA_GAME_DIR=<directory with the PAL BIN/CUE>
RTA_CHROMIUM_EXECUTABLE=<headless shell> node race_grid_capture.mjs <output-dir>`
from the project root (after `npm run build:capture` in `web`).
