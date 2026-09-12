# PAL ordinary-course acceptance — 2026-09-12

## Authority and scope

Authority is the developer-supplied European PAL `SLES_513.56` plus the original `COURSE/Cxx.BIN` packages. No original game bytes or screenshots are retained in Git.

This pass answers a deliberately narrow question: can every executable-referenced ordinary course be compiled, rendered, collision-sampled and seeded with its recovered native 24-car start grid using the current browser reconstruction?

It does **not** assert that all 24 race activities are ready to launch. Activity availability, licence gating, race-specific progression and any unresolved per-activity behavior remain separate work.

## Validation method

`tools/race_course_validation.mjs` drives the existing sandbox capture bundle through Chromium. Course IDs are discovered from the executable ordinary-race catalogue rather than a handwritten allow-list.

For each unique `sceneId` C00–C14 the tool:

- compiles the original course through the shared production render and collision readers;
- grounds all 24 recovered native start seeds with `RaceCourseGridSampler`;
- renders a deterministic whole-course overview without actors;
- renders the representative ordinary activity's recovered 24-car grid twice;
- requires the repeated grid PNG hashes to match exactly;
- records only counts, scalar grounding results and PNG hashes in retained evidence.

## Acceptance result

All **15/15** unique ordinary courses passed. The sweep compiled **228,072 render triangles**, **45,969 collision triangles**, grounded **360/360** native start positions, produced 24 entrants for every representative grid, reported zero browser errors, and had zero automatic acceptance failures.

| Course | Representative activity | Render tris | Collision tris | Starts | Repeat |
| --- | --- | ---: | ---: | ---: | --- |
| C00 | Peach Raceway | 14,204 | 1,547 | 24/24 | identical |
| C01 | Temple Raceway | 14,048 | 1,687 | 24/24 | identical |
| C02 | Desert Raceway | 10,134 | 934 | 24/24 | identical |
| C03 | Ninja Temple Raceway | 22,336 | 2,060 | 24/24 | identical |
| C04 | Snow Mountain Raceway | 12,533 | 1,361 | 24/24 | identical |
| C05 | Slick Track | 14,854 | 2,729 | 24/24 | identical |
| C06 | Treasure Hunting Maze | 20,683 | 5,596 | 24/24 | identical |
| C07 | River Raceway | 17,660 | 2,781 | 24/24 | identical |
| C08 | Tin Raceway | 16,297 | 3,533 | 24/24 | identical |
| C09 | Tin Raceway | 12,420 | 3,356 | 24/24 | identical |
| C10 | Lagoon Raceway | 12,882 | 4,578 | 24/24 | identical |
| C11 | Sliding Door Race | 20,107 | 5,596 | 24/24 | identical |
| C12 | Lava Run Raceway | 9,769 | 2,741 | 24/24 | identical |
| C13 | Highway Race | 11,800 | 2,080 | 24/24 | identical |
| C14 | Drag Race | 18,345 | 5,390 | 24/24 | identical |

## Visual inspection

The local whole-course and start-grid captures were manually inspected together. No course showed an empty scene, exploded mesh, floating grid, catastrophic material failure, or missing start area.

C03's overview contains large blank regions because its temple/interior geometry is segmented rather than a continuous outdoor terrain sheet. C07 similarly contains open non-course space around the authored canyon road network. Their actual start environments are textured, grounded and coherent; neither was treated as a blocker.

The PAL-backed PNGs remain ignored local artifacts. Retained evidence is `docs/evidence/races/2026-09-12/course-validation-summary.json`, which contains only safe scalar data and capture hashes.

## Resulting boundary

C00–C14 are accepted as usable **course geometry / collision / native-start-grid inputs** for subsequent ordinary-race integration. This closes the content-package uncertainty that previously blocked choosing another course.

Only activity 0 / Peach Raceway remains game-facing on this branch. Enabling another activity still requires its selector/licence/progression boundary and an end-to-end race validation; course acceptance alone must not be used as permission to bypass those gates.

This sweep also does not independently certify animated or activity-driven obstacle presentation. Native course obstacle/contact behavior remains covered by its separate PAL-backed tests; any per-activity animated-object requirements must be checked when that activity is integrated.

## Reproduction

Build the current sandbox bundle, then run with local PAL inputs:

```text
cd rtao
npm run build:capture
cd ..
set RTA_GAME_DIR=<local PAL BIN/CUE directory>
set RTA_CHROMIUM_EXECUTABLE=<Chrome/Chromium executable>
node tools/race_course_validation.mjs artifacts/course-validation
```
