# PAL race catalogue, course and reward archaeology — 2026-09-05

## Authority and scope

This milestone is derived from the European PAL executable `SLES_513.56` and
the original `COURSE/C00.BIN`–`COURSE/C14.BIN` packages. The implementation
does not infer race behaviour from labels or from another release.

It closes the static ordinary-race catalogue, participant references, course
package import, native start-grid seeds and collision grounding, native
navigation tables, their dynamic record selector and ordinary-AI ownership, prize arithmetic,
best-result persistence, licence-class promotion and the exact ordinary player,
saved-teammate and opponent entrant/control ownership. It does **not** yet claim
a playable race loop: ordinary-AI steering/speed and wider race state still need native traces.

## Executable structures

| Structure | PAL address | Proven interpretation |
|---|---:|---|
| Activity names | `0x002C0410` | 39 string pointers |
| Primary descriptors | `0x002BFE48` | IDs 0–34, 16 bytes each |
| Extended descriptors | `0x002C0090` | IDs 35–38, 16 bytes each |
| Selector ranges | `0x002C0078` | 12 `(first ID, count)` byte pairs |
| Resident blocks | `0x002C4340` | Area-indexed resident-definition pointers |
| Prize table | `0x002A5218` | Four classes × six places, 32-bit Cake values |
| Start anchors | `0x002A9C10` | 15 course records × native XYZ, cardinal heading and lateral polarity |
| Finish strips | `0x002A9E80` | 15 course records × three native-space AABBs |
| Activity launcher | `0x002106B8` | Selects the split descriptor tables |
| Ordinary entrant builder | `0x0020F9E8` | Creates player car 0, saved teammates and the filtered opponent field |
| Saved-teammate identity filter | `0x0023F6E0` | Compares a resident pair against the two persistent team slots |
| Mode-8 opponent loop | `0x00210BA0` | Separate activity-24 path; not an ordinary-race roster |
| Car input dispatcher | `0x0021B840` | Routes flag `0x0080` cars to installed AI; low flag `0x0002` to human input |
| Primary controller manager | `0x0021F540` | Selector 0 binds controller state 0 to car 0 |
| Ordinary-race bound | `0x00238D50` | IDs below 24 are ordinary races |
| Prize consumer | `0x00237A00` | Sums up to three team finish prizes |
| Licence promotion | `0x00238D00` | Requires top-six results in every race of current class |
| Best-result write | `0x00239440` | Keeps the lower finish index at save `+0xFF0+raceId` |
| Finish crossing | `0x0022EBA0` | Ordered three-strip phase machine for each car |
| Lap/placing update | `0x0022E910` | Increments lap and assigns zero-based finish order |
| Car initialiser | `0x00219308` | Applies the course anchor and exact five-bit start-index stagger |
| Collision-helper selector | `0x00208790` | Race launch selects the course-specific helper at `0x00208C50` |
| Course start grounding | `0x00208C50` | Selects a 16×16 course collision chunk and writes the queried ground Y |
| Navigation pointer pairs | `0x002BF5F0` | Per-scene 24-byte gate table and 8-byte routing-record table |
| Navigation setup | `0x00251F98` | Installs the scene's gate/record pointers into each car |
| Navigation selector | `0x00252328` | Walks backward/forward through authored records, resolves forks, stores byte 6 and returns an AI look-ahead record |
| Ordinary AI handler | `0x00252BA0` | Descriptor-installed driving callback; routing byte 1 selects its steering target gate |

For an ordinary race, descriptor byte 0 is the course/scene ID, byte 1 is the
active-car count, byte 2 is the required lap count and byte 3 is the
licence/prize class. All 24 ordinary descriptors specify 24 cars, three laps
and exactly 23 resident participant references. Settings bytes 4–23 remain raw
until their consumers are proven. Settings `+0` points to a zero-terminated list of
resident pairs `(areaIndex, residentIndex)`; each resident definition supplies
the participant name, body ID and packed paint.

Peach Raceway, activity 0, is a useful fixed control: scene 0, raw bytes 24 and
3, class 0, settings `0x002BF9F8`, participant list `0x002BF728`, 23 named
participants, and handlers `0x0022F3F8` / `0x00252BA0`. Its first participant
is Diez with body 103. The consumer at `0x0022EA68` proves descriptor byte 2 is
the required lap count, so all 24 ordinary descriptors specify three laps.

### Native finish-line crossing

Each course has three adjacent axis-aligned strips. Per-car phase begins at 1;
crossing strip 0 sets phase 2, strip 1 sets phase 3, and strip 2 advances phase
3 to 4. Re-entering strip 0 from phase 4 calls the lap updater and returns to
phase 2. Leaving the line while still at phase 2 resets it to phase 1, so a
single strip touch or reversed/incomplete sequence cannot award a lap.

Peach Raceway's native-space strips are `(588,535)–(590,576.8)`,
`(590,535)–(592,576.8)` and `(592,535)–(594,576.8)`. These coordinates remain
in PAL course space; the renderer's established X reflection is a separate
conversion. On the third completed lap, the updater assigns the current
zero-based finish-order counter to the car and advances that counter.

### Native start-grid seeds

Car initialiser `0x00219308`, specifically the ordinary-course path beginning
at `0x002195F4`, indexes `0x002A9C10` by descriptor scene ID with a 16-byte
stride. Each record contains three floats, a signed cardinal-heading halfword
and a signed zero/one lateral-polarity halfword. The car's creation flags supply
a five-bit start index `(flags >> 10) & 0x1f`.

The initialiser seeds the anchor Y, advances 5 native units per start index
along the grid axis, and offsets odd indices by 7.5 units along the lateral
axis. The polarity halfword selects the lateral side. Its four heading branches
are reproduced exactly in `nativeRaceStartSeed` / `StartSeed`, including the
16-bit yaw values `0x0000`, `0x4000`, `0x8000` and `0xC000`.

### Course-collision grounding

Race launch `0x00210650` enables the course-specific placement helper through
setter `0x00208790`; its selected target is `0x00208C50`. Immediately after
the four grid branches, car initialiser `0x002198FC` calls that target. The
helper divides native X/Z by 100 to choose one of the package's 16×16
collision chunks, performs the collision query at `0x00207748`, and replaces
the car's Y with the returned ground height. This proves the call is placement,
not an AI or navigation owner.

`RaceCourseGridSampler` preserves the established web reflection
`renderX = 1600 - nativeX`, resolves the seed against compiled course
collision, exposes the native surface flags, and fails explicitly when no
ground exists. A complete actual-PAL sweep resolved all 24 slots on every
course: 360/360 successful queries. Most anchor Ys already match the road, but
the maximum correction is 30 units on C09, 98 on C13 and about 100.707 on C14.
Those elevated decks are why the seed and grounded transform remain separate
typed boundaries.

### Ordinary player, teammate and opponent assignment

The ordinary branch at `0x00210C48` resolves all 23 resident pairs, then calls
entrant builder `0x0020F9E8`. Its first creation is unambiguous: car 0 uses
persistent configuration pointer 0, start index 23 and packed creation flags
`0x00025C00`. This closes the player car and final-grid-slot owner.

The builder next reads the two persistent team identities at save offsets
`+0x674/+0x675` and `+0x676/+0x677`. Active entries become car slots 1/2 as
available, use configuration pointers 1/2, and occupy start indices from zero.
Their high creation fields are respectively `0x0090` and `0x00A0`.

Remaining cars use the descriptor's resident pool. PAL considers participant
indices 22→17 first, then 0→22 until all 24 car slots are filled. Helper
`0x0023F6E0` filters any resident pair matching either saved teammate, so a
teammate cannot also be instantiated as an AI opponent. Each opponent's runtime
configuration pointer is `participantIndex + 3`; opponent cars and start
indices advance together after the player/team entries. A solo launch therefore
contains player car 0 at start 23 followed by opponents in order
`22,21,20,19,18,17,0..16`, using car slots 1..23 and start slots 0..22.

`ordinaryRaceEntrants` / `OrdinaryRaceEntrants` reproduce the packed flags,
configuration pointers, identity filter and already-proven start seeds. A
two-teammate regression proves participant identities 5 and 20 are removed
from the opponent set while the field remains exactly 24 cars.

The normal launcher calls manager builder `0x0020F8A0` with selector zero; it
schedules `0x0021F540` with flags zero. That manager's exact stride arithmetic
binds controller state 0 to car 0. Dispatcher `0x0021B840` then tests each car's
stored creation high halfword: the player's `0x0002` takes the human-input path,
while teammate `0x0090/0x00A0` and opponent `0x0080` all contain bit `0x0080`
and invoke descriptor-installed ordinary AI `0x00252BA0`. Entrant records expose
this as `human-input` controller 0 versus `ordinary-ai`; no AI parameters are
invented beyond the proven branch.

Earlier work had incorrectly attributed the loop at `0x00210BA0` to ordinary
races. Its controlling branch is scene mode 8 and the traced caller supplies
activity 24. That separate loop is now explicitly named as such and no longer
materialised as an ordinary-race roster.

| Course | Anchor X | Anchor Y | Anchor Z | Quarter turns | Polarity |
|---|---:|---:|---:|---:|---:|
| C00 | 572.2 | 1.1 | 561.3 | 1 | 0 |
| C01 | 572.2 | 1.1 | 561.3 | 1 | 0 |
| C02 | 721.3 | 60.0 | 166.5 | 2 | 1 |
| C03 | 121.5 | 10.0 | 302.5 | 0 | 0 |
| C04 | 437.5 | 10.0 | 253.8 | 3 | 0 |
| C05 | 588.8 | 5.0 | 380.0 | 0 | 1 |
| C06 | 742.7 | 1.0 | 588.7 | 3 | 0 |
| C07 | 617.6 | 173.0 | 285.5 | 3 | 0 |
| C08 | 778.5 | 42.5 | 913.8 | 1 | 0 |
| C09 | 778.5 | 12.5 | 913.8 | 1 | 0 |
| C10 | 451.4 | 30.0 | 461.7 | 2 | 1 |
| C11 | 742.7 | 1.0 | 588.7 | 3 | 0 |
| C12 | 532.5 | 10.0 | 343.8 | 1 | 1 |
| C13 | 880.5 | 2.0 | 704.3 | 3 | 0 |
| C14 | 869.5 | 3.3 | 526.3 | 3 | 0 |

### Native navigation ownership and tables

The ordinary descriptor's handler-B field is not decorative metadata. Launcher
`0x00210730` passes it to setter `0x0021DCD8`; car input dispatcher
`0x0021B840` later invokes that installed pointer. Every one of the 24 ordinary
descriptors supplies `0x00252BA0`, closing the shared ordinary-opponent AI owner.

Car setup `0x00251F98` indexes pointer-pair table `0x002BF5F0` by scene ID and
stores a 24-byte gate table plus an 8-byte routing-record table. Selector
`0x00252328` consumes the first two X/Z pairs of each gate as crossing
endpoints and the third pair as the authored divider between two route choices.
Routing bytes 0/1 select backward/forward boundary gates, bytes 2/3 select a
backward record, bytes 4/5 select a forward record, byte 6 is stored at car
`+0x24B`, and byte 7 is reserved. The selector walks across multiple records
until the car lies between its current boundaries, then returns the selected
forward look-ahead record to dispatcher `0x0021B840`; `0x00252BA0` also uses
byte 1 as its steering target gate.

The PAL tables contain exactly 1,664 gates and 1,664 routing records across
C00–C14. Counts are `35, 43, 120, 143, 66, 163, 90, 128, 42, 37, 143, 90,
143, 224, 197`; C11 intentionally aliases C06's gate and record addresses.
TypeScript and C# readers validate every pointer, float and gate/record index.
Their pure selector mirrors PAL float32 cross-products, backward/forward walks,
fork resolution, stored output and returned look-ahead record. Peach's native
start anchor deterministically takes record 0 backward to record 34, stores 34
and returns record 0. This closes route-record selection, not yet the full
dynamic steering, speed, overtaking or wider race schedule.

## Selector ranges and classes

The twelve area-indexed selector entries are preserved numerically because the
table itself supplies indices, not display names.

| Area index | First activity | Count |
|---:|---:|---:|
| 0 | 0 | 0 |
| 1 | 0 | 3 |
| 2 | 3 | 3 |
| 3 | 6 | 4 |
| 4 | 10 | 4 |
| 5 | 14 | 4 |
| 6 | 18 | 2 |
| 7 | 20 | 4 |
| 8 | 25 | 1 |
| 9 | 24 | 1 |
| 10 | 0 | 0 |
| 11 | 0 | 0 |

The 24 ordinary races comprise six class-C descriptors, nine class-B and nine
class-A. Save byte `+0x651` uses 0=C, 1=B, 2=A and 3=Super A. PAL tutorial text
agrees with the executable promotion path: top six in all six C races unlocks
B; all nine B races unlock A; all nine A races unlock Super A.

| Class | 1st | 2nd | 3rd | 4th | 5th | 6th |
|---|---:|---:|---:|---:|---:|---:|
| C | 800 | 500 | 400 | 300 | 200 | 100 |
| B | 1,500 | 1,200 | 1,000 | 800 | 600 | 500 |
| A | 2,500 | 2,000 | 1,600 | 1,200 | 1,000 | 800 |
| Super A | 80,000 | 60,000 | 40,000 | 30,000 | 20,000 | 10,000 |

Finish indices are zero-based. Each of up to three team members contributes
the corresponding prize; indices outside 0–5 contribute nothing. Results code
credits Cake through the same capped commerce mutation path already used by
other recovered producers.

## Ordinary course packages

The ordinary descriptor scene IDs resolve exactly to the fifteen unique
packages `COURSE/C00.BIN`–`COURSE/C14.BIN`. This interpretation is intentionally
limited to IDs 0–23 under the ordinary race handler; later activities use other
handlers and their scene-byte semantics are not generalized.

All fifteen packages were decoded from the PAL disc and compiled through the
production field mesh/collision pipeline in Chromium. Their combined source
size is 36,403,312 bytes.

| Course | Render triangles | Collision triangles |
|---|---:|---:|
| C00 | 14,204 | 1,547 |
| C01 | 14,048 | 1,687 |
| C02 | 10,134 | 934 |
| C03 | 22,336 | 2,060 |
| C04 | 12,533 | 1,361 |
| C05 | 14,854 | 2,729 |
| C06 | 20,683 | 5,596 |
| C07 | 17,660 | 2,781 |
| C08 | 16,297 | 3,533 |
| C09 | 12,420 | 3,356 |
| C10 | 12,882 | 4,578 |
| C11 | 20,107 | 5,596 |
| C12 | 9,769 | 2,741 |
| C13 | 11,800 | 2,080 |
| C14 | 18,345 | 5,390 |
| **Total** | **228,072** | **45,969** |

The compiled output contains 684,216 render vertices, 78,684 primitives, 854
textures and 3,207 batches. The packages use the same 8×8-plus-global render
chunk and 16×16 collision conventions already handled by the production field
readers. Import cache schema 3 stores the fifteen compiled course geometries,
collision packages and manifest summaries; original source assets are not
included in handoffs.

## Implemented boundary

- TypeScript and C# readers preserve all 39 activities and the 24-race split.
- Import retains every referenced participant car and compiles all 15 ordinary
  courses into OPFS.
- `RecoveredRaceState` preserves the native licence byte and 24 best-finish
  bytes in recovered save schema 10.
- Race completion applies the exact team prize, best-result and top-six class
  promotion rules in deterministic tests.
- The 15 native finish-line gate sets and exact ordered crossing phase machine
  are typed and tested; all ordinary descriptors prove a three-lap target.
- The 15 native start anchors and all four start-index stagger branches are
  typed and tested in TypeScript and C#; sandbox inspection exposes each anchor
  plus its first six deterministic seeds.
- The selected post-seed helper and course collision query are traced; the web
  course inspector collision-grounds all 24 slots and an actual-PAL sweep
  resolves all 360/360 starts.
- All ordinary descriptors prove 24 active cars, three laps and 23 resident
  references. The exact entrant builder is typed and tested: player car 0 uses
  start 23, up to two saved teammates use the first starts, and the two-pass
  resident pool fills all remaining cars after filtering teammate identities.
- All ordinary descriptors install AI handler `0x00252BA0`. Its 15 native
  navigation table pairs are typed and validated: 1,664 gates plus 1,664
  routing records, including the original C06/C11 alias.
- The browser runtime restores and persists this state. The exact dynamic
  navigation selector is typed/tested, but no synthetic race start or guessed
  steering behaviour has been attached to it.

The next safe vertical slice is Peach Raceway's ordinary-AI steering/speed and
race-state/update scheduling beyond the now-proven navigation selector.
`race_course_probe.py` is the deterministic PAL course
compiler and grounded-grid probe for maintaining this boundary.
