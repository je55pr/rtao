# PAL equipment `0x3000` race-frame composition (2026-09-14)

## Scope

This pass clears the activity-2 / Temple Raceway blocker without clearing or masking its original equipment flags. Authority is the European PAL `SLES_513.56` and original `COURSE/C01.BIN` supplied locally. No original game bytes are retained in Git.

The recovered scope is specifically equipment bits `0x1000` and `0x2000`. The low bits `0x0004` and `0x0008` remain outside the browser ordinary-frame boundary.

## `0x2000` forward modifier

At `0x0021CCF8` the PAL frame tests equipment bit `0x2000` and calls `0x00218DC0` before the existing `0x40` contact-speed adjustment and quadratic drag. The call uses:

- car `+0x20E`: signed halfword state;
- car `+0x23C`: the already recovered vehicle fuel integer, initialized to `0x40000`;
- current command mask and car flags.

When `(sceneFlags & 0x0C) == 4`, command bit `0x08` consumes 100 fuel units and returns a positive forward addition. The post-consumption thresholds are exact PAL branches: 44 below 12,000 fuel, 89 below 30,000, otherwise 178. The enclosing frame adds the return and caps that intermediate forward value at `0xCF69` before later modifiers.

The `+0x20E` state increments while active. In the two lower fuel bands PAL masks it to 2 or 3 low bits respectively. Releasing the command drives positive state to `-2`, then `-1`, then `0`. The native start/stop sound requests are retained by the composed frame rather than discarded.

## `0x1000` control/yaw modifier

At `0x0021D060` the PAL frame tests equipment bit `0x1000` after drag and before the normal drive callback. Car `+0x244`, already represented as `verticalControl`, is constrained by command bits `0x20` and `0x40` to the signed range `-1..1`.

Command `0x8000` selects a `-1` yaw direction and `0x2000` selects `+1` (the positive direction wins if both are present). PAL adds `trunc(dragForward * direction / 512)` to the existing unsigned-halfword yaw at car `+0x1D4`. The updated `+0x244` value also feeds the later vertical-impulse calculation in the same frame.

## Browser composition

`NativeRaceFrameState` now retains car `+0x20E` as `equipmentBoostState`. Existing fields continue to own `+0x23C` fuel, `+0x244` control and `+0x1D4` yaw. No parallel convenience state was introduced.

The ordinary frame and `OrdinaryRaceSession` now reject only equipment `(flags & 0x000C) != 0`; `0x1000`, `0x2000` and their exact `0x3000` combination stay on the normal recovered frame. The Q's Factory implementation gate consequently includes activity 2 after its PAL runtime validation. Native licence availability remains unchanged.

## Validation

The independent PAL scalar oracle writes and reads car `+0x20E` and now exercises randomized `0x1000`, `0x2000` and `0x3000` frames. A focused 1,024-case comparison covers fuel thresholds, signed cooldown states, control values, command combinations and scene flag `0x40`; production and independently executed PAL state matched in every case.

`tests/templeRaceRuntime.pal.test.ts` loads the original executable and `COURSE/C01.BIN`, compiles the original collision data, constructs activity 2 with the executable-backed descriptor and original opponent `0x3000` flags, then advances 420 updates through `OrdinaryRaceCoordinator`. It proves 24 entrants, C01 selection, race release and actual opponent movement/distance without sanitizing equipment flags.

## Remaining boundary

This does not recover equipment bits `0x0004` or `0x0008`, complete scene/reset/debug paths, wheel animation, or category-specific Q's Factory side effects outside this race-frame path. Those must remain explicit follow-up evidence rather than being inferred from the recovered `0x3000` behavior.
