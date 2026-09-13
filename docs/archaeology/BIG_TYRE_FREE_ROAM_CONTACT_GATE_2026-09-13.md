# Big Tyre free-roam contact gate

## Result

Free-roam now carries the PAL Big Tyre vertical contact distinction into the browser driving collision bridge without changing the authored wheel footprint.

PAL contact code at `0x0021C550` reads global equipment flag `0x0400`. Ordinary tyres use a vertical threshold of `0.50`; Big Tyre uses the executable constant at GP-32488, `1.350000023841858` (`Math.fround(1.35)`). Selector 11 is the only recovered tyre selector that produces `0x0400`.

The threshold is applied against the auxiliary height returned for native probe 0. The executable probe table at `0x002A1DD0` identifies probe 0 as front-centre `(0, 0, +0.68)`. It is not a wider wheel/collision footprint.

## Collision surface evidence

The PAL course walker distinguishes three raw surface classes:

- signed-negative surfaces update ground/ceiling bounds without becoming the selected drive surface;
- nonnegative surfaces with bit `0x10000000` write the auxiliary `extraY` height;
- other nonnegative surfaces can become the selected ground surface.

The existing compiled field collision cache already retains every triangle's original 32-bit surface word. No new asset format or proprietary data is stored.

Free-roam `FieldCollisionSampler.sampleClosest` now excludes signed-negative and `0x10000000` auxiliary triangles from ordinary drivable-ground selection. `sampleAuxiliaryHeight` evaluates the preserved auxiliary triangles separately and retains authored compiled order for overlapping hits.

## Browser mapping

`DrivingWorld.resolveFootprint` keeps the existing four wheel/ground samples. It additionally evaluates the PAL front-centre `+0.68 Z` probe only for the auxiliary-height gate.

`ArcadeCarController` passes the fitted tyre selector's native threshold through candidate movement, axis-slide fallback and debug teleport resolution. Normal tyres therefore use `0.50`; selector 11 uses `1.35`. No browser wheel radius, X/Z probe spread or arbitrary monster-truck step height is introduced.

The arcade controller maps a triggered auxiliary-height gate to a rejected footprint because it has no native retained support/impulse state. This is deliberately a narrow browser collision bridge, not a claim that free-roam now executes the PS2 seven-probe solver.

## Validation

- focused browser tests: 22/22 passed;
- full unit suite: 63 files / 342 tests passed;
- lint, TypeScript, production build, Chrome smoke and sandbox capture build passed;
- PAL `nativeRaceContact.pal.test.ts`: 3 passed, 1 BIN-gated skip;
- the PAL-backed regression reads `bigTyreThreshold` from the supplied executable and requires it to equal the free-roam selector-11 threshold exactly;
- the existing 8192 prescribed-transform PAL contact cases remain green.

## Remaining boundary

This closes the evidence-backed Big-specific free-roam auxiliary-height gate. It does not port the native seven-probe support history, impulse damping, special-state transitions, orientation solver or complete obstacle response into the arcade free-roam controller.

Those systems already exist in the native race path and should only replace the arcade bridge if free-roam itself is later moved onto that complete native solver. Issue #66 should not be interpreted as proof of full PS2 free-roam suspension parity from this change alone.
