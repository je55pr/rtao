# PAL ordinary-race compatibility census (2026-09-14, updated 2026-09-15)

## Scope

This census tests all 24 executable-backed ordinary activities against the generic browser race runtime using the European PAL `SLES_513.56` and original `COURSE/Cxx.BIN` data supplied locally. No original game bytes are retained in Git.

Every activity uses the same recovered ordinary handler pair (`0x0022F3F8`, `0x00252BA0`), describes 24 entrants and 3 laps, and resolves physical course data through descriptor `sceneId`.

## Normal compatibility gate

All 24 activities are constructed with their original course collision, entrant grid, AI speed profile and opponent equipment settings. Each activity then runs 420 coordinated 50 Hz updates.

Result after the 2026-09-15 race-contact fix: **24/24 construct, release and move successfully**. This is now the permanent normal PAL compatibility gate in `tests/ordinaryRaceCompatibility.pal.test.ts`.

## Recovered race contact-surface boundary

The earlier 6,000-update census had exposed one shared failure in activities 8, 14, 18, 19 and 21: the race drive consumer indexed raw low-three-bit contact surface slot 7, while the browser model exposed only the six copied tyre grip words.

PAL initialization closes that boundary without adding tyre coefficients. Car-record initialization at `0x00219354` clears the 624-byte car record before equipment setup. `0x00218F70` then copies exactly six signed tyre-grip halfwords to car `+0x21C..+0x226`. The following halfwords at `+0x228` and `+0x22A`, which the `0x0021B1C0` race consumer can address as raw surface slots 6 and 7, therefore remain exact zeroes. Gear words begin at `+0x22C`.

Accordingly, race contact slots 0–5 resolve to `NativeRaceEquipment.surfaceGrips[0..5]`, slots 6/7 resolve to zero, and values outside 0–7 remain rejected. Slots 6/7 are **zero-filled race car-record slots, not seventh/eighth tyre coefficients**. `readNativeRaceEquipment()` remains six entries wide and free-roam `NativeTyreSurface` / collision-flag semantics are unchanged.

Direct PAL regressions exercise all slots 0–7 against consumer `0x0021B1C0`; the assembled frame oracle also cycles `surfaces[0]` through 0–7 while retaining the existing original-course moving-frame regression.

## 6,000-update circulation sweep

The retained 6,000-update / 120-second AI circulation sweep now completes for **all 24 activities**. Each activity reaches all 6,000 coordinated updates without leaving the recovered frame boundary. The safe scalar report is retained at `docs/evidence/races/2026-09-15/ordinary-race-6000-update-census.json` and records only activity/course identity, encountered low-three-bit surface indices, update/lap counts and final runtime status.

The five formerly blocked activities now complete the full window and all encounter slot 7:

- activity 8, **Slick Track** / C05: surfaces `0,1,7`, 6,000 updates, max 1 completed lap;
- activity 14, **Lagoon Raceway** / C10: surfaces `0,1,3,7`, 6,000 updates, max 1 completed lap;
- activity 18, **Treasure Hunting Maze** / C06: surfaces `4,5,7`, 6,000 updates, max 1 completed lap;
- activity 19, **Sliding Door Race** / C11: surfaces `4,5,7`, 6,000 updates, max 1 completed lap;
- activity 21, **Rock Climbing** / C13: surfaces `0,1,7`, 6,000 updates, max 2 completed laps.

Surface slot 6 was not encountered in this course sweep; its zero semantics are nevertheless covered directly by the PAL consumer and full-frame oracle regressions alongside slot 7.

## Browser-supported set

All ordinary activity IDs `0..23` are now inside the validated browser runtime/launch set. Q's Factory retains native licence availability, selector ranges, rewards and progression; the former contact-surface exclusion for 8/14/18/19/21 is removed.

## Validation boundary

`tests/ordinaryRaceCompatibility.pal.test.ts` permanently repeats the 420-update original-data gate for all 24 activities. The heavier 6,000-update all-activity sweep is retained as an opt-in PAL evidence run because it simulates millions of car-frame advances and is substantially heavier than the standard oracle suite.

This census does not claim exact live race position ordering, post-race dialogue mapping, complete semantic naming for raw special surface/state values, or scene/reset behavior beyond the already recovered ordinary frame. Those remain separate evidence boundaries.
