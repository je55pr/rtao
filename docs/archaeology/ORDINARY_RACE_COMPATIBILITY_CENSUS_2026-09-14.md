# PAL ordinary-race compatibility census (2026-09-14)

## Scope

This pass tests all 24 executable-backed ordinary activities against the generic browser race runtime using the European PAL `SLES_513.56` and original `COURSE/Cxx.BIN` data supplied locally. No original game bytes are retained in Git.

Every activity uses the same recovered ordinary handler pair (`0x0022F3F8`, `0x00252BA0`), describes 24 entrants and 3 laps, and resolves physical course data through descriptor `sceneId`.

## Short compatibility sweep

All 24 activities were constructed with their original course collision, entrant grid, AI speed profile and opponent equipment settings. Each activity then ran 420 coordinated 50 Hz updates.

Result: **24/24 constructed, released and moved successfully**. No activity hit an unrecovered scene/equipment branch during this short gate.

The browser launch set remains narrower because a second, longer circulation sweep exposed contact-surface coverage gaps on five activities.

## Browser-supported set

The 19 activities that remained on recovered runtime paths through the long circulation sweep are:

`0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 15, 16, 17, 20, 22, 23`.

These include the already validated Peach Raceway, Peach Raceway II and Temple Raceway plus sixteen additional ordinary activities. Native licence availability, selector ranges, rewards and progression remain unchanged.
## Long-run contact-surface blockers

A 6,000-update / 120-second AI circulation sweep was used to distinguish short-run compatibility from longer race viability. Nineteen activities completed at least one lap or continued circulating for the full window without leaving the recovered frame boundary.

Five activities eventually entered a surface index whose native tyre grip word is not yet represented by `NativeRaceEquipment.surfaceGrips`:

- activity 8, **Slick Track** / C05: `Unresolved native contact surface` at update 3,413;
- activity 14, **Lagoon Raceway** / C10: same boundary at update 5,016, after one completed lap;
- activity 18, **Treasure Hunting Maze** / C06: update 4,064, after one lap;
- activity 19, **Sliding Door Race** / C11: update 630;
- activity 21, **Rock Climbing** / C13: update 1,257.

These five remain explicitly browser-gated pending the tyre/surface work tracked by issue #65. They are not separate race-runtime failures: all five pass the 420-update generic runtime smoke and fail at the same surface-grip lookup boundary.

## Validation boundary

`tests/ordinaryRaceCompatibility.pal.test.ts` permanently repeats the 420-update original-data gate for every browser-supported activity.

The 6,000-update sweep is retained as archaeology evidence rather than a normal PAL test because it simulates up to 144,000 car-frames per activity and is substantially heavier than the standard oracle suite.

This census does not claim exact live race position ordering, post-race dialogue mapping, complete special-surface tyre semantics, or scene/reset behavior beyond the already recovered ordinary frame. Those remain separate evidence boundaries.
