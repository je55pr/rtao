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

The original pass gated Q's Factory to activities 0 and 1. The later `EQUIPMENT_3000_RACE_FRAME_2026-09-14.md` recovery clears activity 2 without changing native licence availability; each activity is still unavailable until its recovered licence class is reached.

Deterministic browser capture metadata now contains separate 420-update scenes for activities 0, 1 and 2. The original Peach activity-0 capture remains unchanged as a compatibility regression.

A later same-day compatibility census (`ORDINARY_RACE_COMPATIBILITY_CENSUS_2026-09-14.md`) widened the browser launch set to 19/24 ordinary activities. Activities 8, 14, 18, 19 and 21 remain gated because longer circulation reaches one shared unrecovered native contact-surface grip path.

## Temple follow-up

Activity 2 uses selectors `[4, 7, 3, 3, 3, 3, ...]` with original opponent equipment flags `0x3000`. The 2026-09-14 issue-#30 follow-up recovered the `0x1000` and `0x2000` frame branches and their combined `0x3000` path from PAL instructions.

A PAL-backed runtime regression now constructs Temple on original `COURSE/C01.BIN` with those flags intact and advances 420 coordinated updates. Q's Factory therefore permits activity 2 as the third validated browser ordinary race. Low equipment bits `0x0004/0x0008` remain explicitly rejected.
## Validation

CI-safe validation remains `cd rtao && npm run check`.

PAL-only validation is `npm run test:pal` with `RTA_PAL_EXECUTABLE` and `RTA_PAL_BIN` supplied locally. Focused activity runtime oracles include `rtao/tests/ordinaryRaceRuntime.pal.test.ts` and `rtao/tests/templeRaceRuntime.pal.test.ts`.
