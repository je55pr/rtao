# Second ordinary-race runtime boundary — 2026-09-14

## Scope

This pass widens the playable ordinary-race runtime beyond activity 0 without bypassing any PAL progression or equipment gate.

Authority remains the European PAL `SLES_513.56` and original `COURSE/Cxx.BIN` data supplied locally. No original bytes are retained in Git.

## Runtime selection

The generic runtime now separates two native identities that must not be conflated:

- `activityId` selects the ordinary-race descriptor, participant pool and 256-byte AI speed profile;
- descriptor `sceneId` selects the physical course, start anchor, finish strips and navigation graph.

This matters because multiple activities can share one course. In Peach Town the executable range is:

- activity 0: **Peach Raceway**, scene/C00, licence/prize class 0;
- activity 1: **Peach Raceway II**, scene/C00, licence/prize class 1;
- activity 2: **Temple Raceway**, scene/C01, licence/prize class 2.
## Validated second race

Activity 1 is the second browser-supported ordinary race. Its PAL opponent settings have equipment flags `0x0000`, so it stays inside the already recovered ordinary active-frame boundary.

A PAL-only regression loads the original executable and `COURSE/C00.BIN`, compiles the original collision data, constructs activity 1 through `createOrdinaryRaceRuntime()`, and advances 420 updates through `OrdinaryRaceCoordinator`. It asserts the recovered identity `Peach Raceway II`, course 0, 24 entrants, C00 navigation and actual player movement.

The Q's Factory browser runtime gate therefore permits activities 0 and 1 only. Native licence availability remains independent: activity 1 is still unavailable until the recovered race state reaches licence class 1.

Deterministic browser capture metadata now contains separate 420-update scenes for activities 0 and 1. The original Peach activity-0 capture remains unchanged as a compatibility regression.

## Temple blocker

Activity 2 is deliberately **not** enabled yet. Its original opponent settings are selectors `[4, 7, 3, 3, 3, 3, ...]` with equipment flags `0x3000`.

The recovered ordinary frame explicitly rejects `(equipmentFlags & 0x300c) != 0`. A direct PAL-backed attempt to construct Temple correctly reached that guard instead of silently treating the flags as ordinary equipment.

That path belongs to open issue #30. This pass does not clear, mask or approximate the `0x3000` flags merely to make C01 launch.
## Validation

CI-safe validation remains `cd rtao && npm run check`.

PAL-only validation is `npm run test:pal` with `RTA_PAL_EXECUTABLE` and `RTA_PAL_BIN` supplied locally. The focused activity-1 runtime oracle is `rtao/tests/ordinaryRaceRuntime.pal.test.ts`.
