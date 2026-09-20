# PAL native free-roam contact host contract — 2026-09-20

## Scope

This note defines the narrow browser/native seam that replaces the standard-FLD
free-roam footprint bridge with recovered PAL contact evolution. The retained
seven-probe support/orientation recurrence and raw FLD packet query are now live
for standard-world driving. It still does not claim the unrecovered post-contact
outdoor obstacle/rollback response, airborne gameplay, special-outdoor dispatch,
or new equipment behavior beyond the separately recovered contact flags.

The contract is constrained by retained PAL contact, suspension, collision,
math and enclosing-frame evidence already in this repository:

- `PAL_NATIVE_RACE_CONTACT_2026-09-05.md`: seven-probe caller
  `0x0021C280..0x0021C8E0`;
- `PAL_NATIVE_GROUND_SUPPORT_2026-09-05.md`: support solver
  `0x0021BDD8..0x0021C27C`;
- `PAL_NATIVE_RACE_COLLISION_2026-09-05.md`: native packet/cell query;
- `PAL_NATIVE_RACE_MATH_2026-09-05.md`: probe transform and orientation;
- `PAL_NATIVE_RACE_FRAME_2026-09-05.md`: recovered enclosing update order;
- `BIG_TYRE_FREE_ROAM_CONTACT_GATE_2026-09-13.md` and the 2026-09-20
  surface/water regressions: current browser shoreline bridge.

The race implementation is used here as an exact recovered contact primitive.
This note does **not** claim unrecovered outdoor scene dispatch or post-contact
collision response is identical to the ordinary-race wrapper.

## Required cadence and ownership

Contact advances exactly once per PAL driving tick: **50 Hz** (`1 / 50`
seconds). The browser render loop may run at any rate, but it must accumulate
time and invoke the native contact step only on that fixed cadence. A render
frame must never perform an extra support/contact update.

The native side owns all state whose next value depends on the previous PAL
tick. The host owns scene selection, collision-data lifetime, browser input
collection, effect/audio delivery and final render-space projection.

The required ordering for one driving tick is:

1. consume commands and advance recovered native velocity state;
2. integrate native fixed-point position;
3. call contact using the **pre-contact matrix**, updated yaw/runtime flags,
   and retained contact history;
4. compute the new contact matrix/inverse and native position coordinates;
5. retain contact surfaces/state for the next tick;
6. only then perform any separately recovered outdoor collision/obstacle
   response;
7. project the resulting authoritative native pose into browser coordinates.

The current free-roam pattern of proposing a reflected browser candidate,
accepting/rejecting a four-wheel footprint, trying X/Z axis slides, then
synthesizing pitch/roll is not an input producer for this contract.

## Authoritative contact input

The native step must receive the same semantic inputs as
`advanceNativeRaceContact` / `produceNativeRaceContacts`, without replacing
them by browser summaries:

| Input | Ownership / rule |
| --- | --- |
| Seven probes | Executable-backed `0x002A1DD0` order and float32 values. |
| Fixed-point position | Retained native position; never reconstructed from averaged browser ground. |
| Reference Y | Previous native coordinates Y, distinct from newly integrated position Y. |
| Previous matrix | Retained native contact/orientation matrix used to transform all seven probes. |
| Yaw | Updated native 16-bit yaw, interpreted with executable yaw scale. |
| Support history | Three support values, three support deltas and three impulses. |
| Unsupported counter | Retained counter; zero support increments it and previous value >= 65 triggers the recovered equalization branch. |
| Special state | Signed shallow/ordinary/deep auxiliary-contact state `-1/0/+1`. |
| Runtime flags | Fresh per-tick drive flags; contact may add recovered bits such as `0x40` and unsupported bit `1`. |
| Equipment flags | Raw native contact flags, including recovered `0x0008`, `0x0100` and `0x0400` behavior. |
| Global equipment flags | Separate global source used by the Big Tyre auxiliary threshold. |
| Car flags | Raw flags used by impact/audio gates and scene-command selection. |
| Scene flags / byte 0x0B | Raw scene state used by impact, sound and command gates. |
| Scene commands | Raw words used by the `0x1000` / `0x4000` vertical adjustment branch. |
| Local X/Z | Native local-difference components from the recovered velocity/matrix path. |
| Response Z/W | Native drag/gravity response inputs, not browser slope estimates. |
| Vertical impulse | Native caller-produced value, including recovered equipment-dependent behavior. |
| Commands | Native command word, preserving `0x8000` / `0x2000` precedence. |

The browser may still map keyboard/gamepad state into the command producer where
that upstream free-roam producer remains unrecovered, but those host choices
must stop at the command boundary. They must not alter support, probe heights,
surface words, matrix state or collision query results.

## Collision-query callback

The host must provide one scene-selected query callback with the existing
`NativeRaceContactDependencies['query']` shape:

```text
query(nativePoint, nativeSector, probeIndex)
  -> { point, flags, ceilingY }
```

The callback receives unreflected PAL coordinates. It must preserve the native
query result conventions:

- `flags === -1` is a miss;
- signed-negative packet surfaces participate in ground/ceiling bounds without
  becoming the selected drive surface;
- nonnegative bit-`0x10000000` surfaces write the auxiliary/extra height;
- other nonnegative surfaces may become selected ground according to strict
  native comparisons and authored packet order;
- on a selected hit, returned point Y is native ground Y and returned point W
  is native auxiliary height;
- `ceilingY` remains the separate query/support input.

The native `sector` argument produced by the contact caller must cross this
boundary unchanged. The exact free-roam scene/field dispatch that consumes it
is still a recovery requirement; the browser must not reinterpret it as the
current toroidal field-normalization rule.

## Persistent state

The standard-FLD free-roam contact owner retains native state rather than
reconstructing it from `CarState` booleans. At minimum it persists:

- native fixed-point position;
- previous native coordinates/reference Y;
- retained contact surface words required by the enclosing consumer;
- support[3], supportDelta[3], impulses[3];
- unsupported tick count and signed special state;
- native contact matrix and inverse;
- the support-derived local chassis/body matrix used by presentation;
- native yaw plus vehicle state needed by the drive consumer;
- current/previous world velocity needed to derive local support inputs.

Runtime flags are per-update working state in the recovered enclosing frame:
the drive stage starts them fresh and contact writes the next contact flags.
They must not become a browser sticky boolean.

The current `contactHasGroundSupport`, `contactAuxiliaryY`,
`contactSpecialState` and `contactRuntimeFlags` fields are useful observations
and debug projections, but they are not sufficient authoritative state for
another native tick.

## Native outputs

A successful contact step returns and retains:

- updated fixed-point Y plus support/supportDelta/impulse history;
- unsupported counter, runtime flags and shallow/deep special state;
- seven post-query contact points and height words;
- raw surface words and contact/collision flag bits;
- normal, contact matrix and inverse for the next tick;
- the recovered local chassis/body matrix derived from the three support values,
  including the `0x0400` Big Tyre lift;
- impact requests and sound requests as host callbacks, not direct browser
  side effects.

Deep auxiliary contact must retain the recovered surface replacement
`(surface0 & 0x3000) | 0x100651` for surfaces 0..2. The downstream native drive
consumer uses the low three bits of the retained first surface word. Do not
convert the word to `DrivingSurfaceKind` before native consumption.

## Coordinate boundary

Native contact state and collision queries stay in PAL coordinates. Reflection
belongs at the browser presentation/data-query boundary only:

```text
renderLocalX = 1600 - nativeLocalX
renderY      = nativeY
renderLocalZ = nativeLocalZ
```

The native contact/body matrices, yaw, velocity, fixed-point position and seven
probes are not reflected internally. Browser yaw/sign adaptation and X
reflection happen only when projecting native state for Three.js or when
deliberately calling a render-space helper. The local chassis matrix is
conjugated by the X reflection at that presentation boundary so the rendered
transform remains right-handed.

`normalizeRenderPosition` is a browser world-topology helper. It also contains
the explicit north/south torus quality-of-life extension. Therefore it must not
be used inside the native contact solver or as proof of PAL field dispatch.

The current `CompiledFieldCollision` cache is also not an authoritative native
query source: compilation reflects X and expands strips to triangles while
discarding original plane records, native 100-unit cell membership and the
packet representation required by `NativeRaceCollisionSampler`. A native
free-roam query provider must retain or reconstruct the original collision
records at load time; it must not reverse-engineer them from the render cache.

## Scene and surface flags

The host contract transports raw words and only interprets bits with recovered
consumers:

- scene flag `0x40` suppresses recovered support impact requests;
- scene mask `0x48` participates in the shallow-contact sound-40 gate;
- scene byte `0x0B` enables the recovered scene-command height adjustment;
- scene command `0x1000` has precedence over `0x4000`;
- raw collision `-1` is a miss;
- collision bit `0x80000000` marks the signed-negative class in the native
  query;
- collision bit `0x10000000` is the auxiliary-height class when nonnegative;
- raw low three surface bits are native grip-slot selection after contact;
- browser low-nibble names Dry/Off-road/Wet/Grass/Snow/Ice remain a diagnostic
  and presentation mapping, not the contact solver's input vocabulary.

Authored minimap road ribbons must not override raw native collision words for
native contact. Their current paved/dirt precedence can remain for browser
labels and non-native presentation only.

## DrivingWorld API disposition

The following disposition is now applied to standard FLD driving. Compiled-only
fixtures and special-outdoor scenes retain the compatibility bridge where the
native dispatch remains unrecovered.

| Existing API | Disposition | Reason |
| --- | --- | --- |
| `resolveFootprint` | **Retire from live driving/contact.** | Four reflected wheel samples, averaged Y, all-wheel acceptance and auxiliary summary collapse the seven-probe native state and encourage candidate/axis-slide policy. |
| `resolveSpecialOutdoorFootprint` | **Compatibility-only pending native dispatch.** | Special-outdoor collision ownership remains unrecovered, so this lossy path is kept explicit rather than presented as native contact. |
| `sampleGround` | **Retain as browser data query.** | Useful for spawn/debug/world simulation. It is reflected nearest-triangle sampling, not the native packet query. |
| `sampleSpecialOutdoorGround` | **Retain as browser data query.** | Same role outside standard FLD topology. |
| `sampleAuxiliaryHeight` | **Retain only as diagnostic/compatibility data query.** | It can expose an auxiliary plane but cannot reproduce the complete native query result/order. |
| `sampleHighest` | **Retain as presentation query.** | Camera obstruction/world placement use it; it must not drive native support. |
| `sampleSpecialOutdoorHighest` | **Retain as presentation query.** | Same special-scene camera role. |
| `drivingSurface` | **Adapt: remove from native motion input; retain for UI/debug labels.** | Road-ribbon precedence and `DrivingSurfaceKind` are browser policy. Native motion must consume retained raw contact surface slots. |
| `specialOutdoorDrivingSurface` | **Compatibility label/input only.** | Keep labels and the gated old bridge until special-outdoor native dispatch is recovered. |
| `addCompiledField` / `addField` | **Retain for render/browser queries; add a parallel native collision source.** | Compiled triangles cannot satisfy native packet queries. |
| `addCompiledSpecialOutdoor` | **Retain for render/browser queries; add a parallel native collision source if the scene is proven to use this contact path.** | Exact special-outdoor dispatch remains evidence-gated. |

`ArcadeCarController.groundAttitude` is not a `DrivingWorld` API. Standard-FLD
driving no longer calls it: PAL contact orientation owns the terrain/root frame
and retained support history owns the local chassis/body matrix. Its four
sampled heights and browser smoothing remain only on compatibility paths where
native scene dispatch is not recovered; they are not PAL suspension.

## Explicit unrecovered gaps

This contract intentionally stops before implementing the following:

1. **Exact free-roam scene dispatch.** Standard FLD driving now selects authored
   raw collision sections through unreflected field topology, but this is a host
   seam rather than proof of the original sector/scene dispatcher. Special-outdoor
   dispatch remains unrecovered and gated.
2. **Outdoor post-contact collision response.** The recovered ordinary frame
   explicitly rejects scene kind 28 and does not establish the free-roam
   obstacle/rollback/airborne response. Do not reuse the race response merely
   because contact is shared.
3. **Free-roam scene/effect inputs.** Car flags, scene flags/commands and the
   vertical-impulse producer are not recovered for this caller. Production keeps
   their effect branches neutral instead of borrowing ordinary-race defaults.
4. **Reset/debug/scene-specific enclosing paths.** These remain outside the
   verified frame and must stay gated.
5. **Upstream free-roam command production.** Reverse/brake command policy is
   still host-owned in `NativeDrivingMotion`; this contract does not bless it
   as native.
6. **Browser torus policy at native boundaries.** East/west FLD rebasing is
   handled outside contact math. North/south browser wrapping remains a port
   extension and the native path fails closed instead of consuming it.
7. **Effects and audio realization.** Native contact returns requests; exact
   browser audiovisual presentation is a separate host concern.

## Integration acceptance criteria

The standard-FLD implementation is now connected against the structural
criteria below. Deterministic CI tests cover flat ground, slopes, field seams,
retained support changes and support loss/reacquisition. A PAL-only FLD/223
integration case is retained in `tests/drivingValidation.pal.test.ts`; parity
must not be claimed unless it and the surrounding PAL gate are run with locally
supplied original inputs.

- free-roam performs exactly one contact advance per 50 Hz native driving tick;
- retained support/impulse/unsupported/special/matrix state survives across
  ticks without being regenerated from render-space samples;
- all seven executable-backed probes query authoritative native collision data
  in original ordering;
- raw native surface words flow into the native drive consumer before any
  browser surface naming;
- reflection occurs once at the native-to-browser projection boundary;
- `resolveFootprint*`, candidate rejection/axis slides and `groundAttitude` no
  longer determine live native pose;
- unresolved outdoor collision/scene paths fail closed or remain explicitly
  gated rather than silently falling back to the old footprint policy;
- PAL-backed regression covers a retained multi-tick outdoor contact sequence,
  including support loss/recovery and auxiliary contact, before parity is
  claimed.

Production standard-FLD gameplay now uses this seam. The unrecovered paths
above remain explicitly gated, and this is not a claim of end-to-end PAL
free-roam parity.
