# PAL Q's Factory race availability — 2026-09-12

## Authority and scope

Authority is the European PAL `SLES_513.56`, SHA-256
`2b4a310fc8bb145ccbc5e5ec5d023f0c29903c3e4555d63983d4a976f689eff9`.
No executable bytes or original assets are retained here.

This pass closes the ordinary-race availability semantics behind Q's Factory
action `0x08`. It does not widen the browser's playable-race runtime gate.

## Action handoff

The post-text dispatcher at `0x0023D078` sends action `0x08` through case
`0x0023D258`. It installs host callback `0x0023B2E0` through `0x00204F88` and
passes the action payload beginning at operand 1. The existing dialogue reader
therefore remains correct to preserve the two authored selected/cancel targets.

## Native selector host

`0x0023B2E0` reads the current interaction's area index and indexes the twelve
`(firstActivityId,count)` pairs at `0x002C0078`. It iterates exactly that
range, reads descriptors from `0x002BFE48`, and resolves authored activity
names through the pointer table at `0x002C0410`.
For each ordinary race entry the host reads two independent progress facts:

- descriptor byte `+3` is the required licence/prize class;
- save byte `+0x651` is the player's current licence class;
- save byte `+0xFF0 + activityId` is that race's best zero-based finish index.

The entry is marked unavailable when `licence < descriptor[3]`. The saved best
is not an additional unlock gate: best `< 6` instead selects the host's
completed/top-six presentation state. Thus availability is class-based while
best-result bytes report progress and feed later promotion.

The browser now mirrors that split in `qFactoryRaceOptions()`: it returns the
authored area-range activities with native licence availability, saved best and
top-six state. RTAO runtime support is deliberately separate in `main.ts`;
activity 0 remains the only launchable ordinary race until a later activity is
independently validated through the full runtime.

The browser words `Top-6 recorded`, `Licence locked` and `RTAO runtime pending`
are host presentation policy. This pass does not claim they are native strings
or recover the exact original selector iconography.

## Promotion correction

The promotion scan at `0x00238D50` compares descriptor class against current
licence while walking all 24 best-result bytes. For the just-finished activity,
a current top-six result passes immediately; otherwise the stored best byte is
still consulted. Therefore a previously-recorded top-six best remains valid
when a replay finishes outside the top six.

`RecoveredRaceState.completeOrdinaryRace()` now folds the current result into
the stored best first, then promotes when every race in the current class has a
stored best below 6. A PAL scalar-oracle regression executes `0x00238D00` and
pins both the stored-best promotion case and the incomplete-class rejection.

## Reproduction

The selector trace was reproduced locally with `tools/executable_probe.py` /
`tools/mips_probe.py`-style bounded extraction and disassembly. The retained
PAL oracle is `rtao/tests/raceProgress.pal.test.ts`; it requires a locally
supplied original executable through `RTA_PAL_EXECUTABLE`.
