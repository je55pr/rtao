# PAL ground-support solver — verified checkpoint

## Implemented

`web/src/game/nativeRaceGroundSupport.ts` translates the complete scalar
0x0021BDD8..0x0021C27C routine. It consumes the caller's seven collision probe
Y components, seven original fixed-point height words and seven auxiliary
query heights, plus three stored support values, deltas and impulses.

It preserves the executable's normal/Big Tyre allowances (20971 / 41943),
seven probe clamp bits and 0x100 flag, native asymmetric integer damping,
support limits 0..8192, support-history changes and landing impulse requests.
The effect host at 0x0020B898 is returned as channel/kind/strength requests.
No new collision sampler, substitute ground model or playable physics bridge
was introduced.

## Verification

- 8192 seeded original-PAL executions compare every returned flag and every
  written point Y, height word, support, support delta, impulse and effect call.
  Cases include normal and Big Tyre, clamp boundaries, zero/full support,
  human/opponent/team flags, replay flags and impact thresholds 178/179.
- A 600-update prescribed-contact sequence compares retained suspension
  history through changes representing landing, braking and release inputs.
  These are routine-level scenarios, not captures of a complete native race.
- Coverage assertions require over 100 impact requests, retained-impulse cases
  and probe-clamp cases, preventing an accidentally inactive random suite.
- Complete `npm run check` passed: **47 files / 228 tests**, production build
  and capture build. Exit status 0 was observed. The latest complete build
  resolves the capture-build completion uncertainty at the previous save.
- The bounded PAL oracle adds only the routine address range and SRAV support.
  Float operations remain host float32; this is not a cycle-accurate PS2.

Evidence: `handoff/race-checkpoint-2026-09-05/traces/ground_support.txt`,
`normal_matrix_constructor.txt` and `native-ground-support-check.log`.

## Remaining boundary

0x0021C280 prepares seven probes from 0x002A1DD0 and calls the selected course
collision query before this solver. That query and the orientation/VU transform
path remain unported. The scalar solver is therefore not connected to the
browser driving loop yet. The first playable Peach race remains unfinished.

The orientation constructors are now traced: 0x002086C0 starts from identity,
normalizes (normalY, -normalX, 0), copies the supplied normal as the second
basis vector, and forms the third by cross product. 0x00208738 constructs a
Y-rotation and multiplies it into that basis. Verify the VU helpers' exact
lane/order/rounding before implementing the transform.

Next bounded work block: recover the original course query outputs and matrix
helpers so the verified scalar inputs are produced by evidenced native paths.
Post visible updates at least once a minute and save before expanding scope.
