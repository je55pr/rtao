# Native race collision queries

Authority: local PAL `SLES_513.56`, SHA-256
`2b4a310fc8bb145ccbc5e5ec5d023f0c29903c3e4555d63983d4a976f689eff9`.

`web/src/game/nativeRaceCollision.ts` implements the complete scalar strip
walker at **0x207748–0x207A9C** and the course-cell selection/result writes at
**0x208C50–0x208D2C**. The seven-probe caller at 0x21C280 uses this course query.
This supplies the contact-query building block; it does not yet connect a
playable race or implement the remaining contact/orientation caller.

## Recovered behaviour

The wrapper rounds native X/Z inputs and division by 100 to float32, truncates
to integers, masks each with 15, and selects `xCell + (zCell << 4)`. It searches
exactly this cell, preserving authored packet and triangle order. The globals
at GP−32716/GP−32712 initialize auxiliary/ground heights to +10000/−10000;
extra height starts at zero and selected flags at −1.

The walker reads vertex count from the packet's low 15 bits and surface flags
from its word at +12. Each vertex and plane record is 16 bytes. After N vertices
come N−2 authored plane records; the next packet is `packet + 32*N − 16`.
Three XZ half-space tests include triangle edges, with inequality direction
alternating through the strip. The routine does not inspect a render primitive
type. Height is computed from the first vertex Y and authored plane X/Z
coefficients, with float32 rounding after each scalar operation.

| Surface word | Native writes after an inside-triangle hit |
| --- | --- |
| Signed negative (bit 31) | A height strictly above the query Y may lower auxiliary height. A height strictly below query Y may raise ground height. Neither changes selected flags or plane pointer. |
| Nonnegative, bit 28 set | Replaces extra height unconditionally. Last matching hit wins. |
| Other nonnegative | If height is strictly below auxiliary height and strictly above ground height, replaces ground height, selected flags and plane pointer. |

These are raw flag rules. Physical meanings for all flagged surfaces are not
inferred. Strict comparisons preserve first selection at equal heights. A
later signed surface can raise ground height while retaining earlier selected
flags. Conversely, a signed surface encountered first can prevent a lower
ordinary surface from being selected. Reordering packets would change results.

After walking, the wrapper writes the query point's Y and W only if selected
flags are nonnegative. Auxiliary height is always returned. A miss therefore
preserves original point Y/W, even when the walker changed its internal heights.

`NativeRaceCollisionSampler` reads the original field collision directory and
records in native coordinates. Its selected plane offset refers to the original
input bytes. The existing reflected render-space triangle cache does not retain
the authored plane records or cell membership required by this query; it is
unchanged. Rendering and start-grid capture code are unchanged by this milestone.

## Verification

`web/tests/nativeRaceCollision.pal.test.ts` executes supplied PAL instructions:

- 8192 seeded strip queries compare flags, plane identity and all three heights.
  Cases include both triangle parities, edges, varying coefficients, misses,
  signed surfaces, extra heights and overlapping packets, with coverage checks.
- Targeted overlapping-surface cases cover strict equality, retained flags and
  authored packet ordering.
- 363 wrapper cases verify wrapped cell selection around positive/negative
  boundaries, sentinel initialization, and hit/miss point writes. Only this
  isolated wrapper test hooks the walker.
- **2040 queries against original records across all 15 courses**, including
  **360 start-grid positions** and first-triangle centroids in populated cells
  at three heights, execute both routines without hooks. 1882 queries select
  surfaces. Every output and authored plane offset matches.

Original-course output SHA-256:
`61e221249833e771c1d7a2043fd1a6ef5bd4c5933100706fdb9b24598ab9cfd2`.
This is a deterministic contact-output capture, not an image or moving race.
The bounded scalar oracle uses host float32 arithmetic; it is not a full PS2
emulator or proof of hardware behaviour for exceptional floating-point values.

Full gate passes **48 files / 232 tests**, production and capture builds, with
exit status 0 observed. Reproduce from `web`:

```sh
RTA_PAL_EXECUTABLE=/path/to/SLES_513.56 \
RTA_PAL_BIN='/path/to/Road Trip Adventure (Europe) (En,Fr,De).bin' \
npm run check
```

`RTA_RACE_COLLISION_REPORT=/path/to/report.json` optionally saves the original
course output counts/hash. The BIN test expects the supplied PAL single-track
MODE2/2352 image, whose CUE starts at sector zero. Original game bytes are not
included in source archives.

## Next boundary

Finish the 0x21C280 contact producer: probe transforms, flag/impulse branches,
height integration and ground-normal construction. Recover the VU transforms
and 0x2086C0/0x208738 orientation matrix calls before claiming native movement.
Then verify moving Peach trajectories and connect the race session/results.
