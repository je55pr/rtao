# RTA Big Tyre native visual + ride-height reconstruction — 2026-09-05

## Result

The Three.js/TypeScript runtime now has an executable-backed Big Tyre `(1,11)` visual path rather than the older development `wheelScale` approximation. Big uses the original PAL `CARS/TIRE.BIN` oversized meshes, native wheel-colour CLUT selection, and the recovered +0.85 chassis/body lift while the authored tyres remain on their ground-contact transforms.

The first intermediate Big capture used the correct oversized tyre meshes but left the Q62 body at the ordinary ride height, causing the tyres to clip deeply into the body. That state is explicitly superseded by this checkpoint.

## Unique native configuration flag

PAL tyre catalogue records are 28 bytes. Category-1 fitting reads the signed halfword at tyre-record offset `+0x12` and uses it to control configuration flag `0x0400`.

Dumping all 13 native tyre records proves:

- Normal, Sports, Racing, Wet, Off Road, Studless and Devil variants have zero in this field;
- only Big Tyre native selector `(1,11)` has value `1`;
- therefore Big is uniquely responsible for the `0x0400` rendering/contact mode.

Sports and Off Road are consequently outside the Big oversized/lift branch; their possible ordinary-material/texture differences remain a separate evidence question.

## Original Big Tyre geometry

`CARS/TIRE.BIN` is 74,352 bytes and exposes six model sections plus texture DMA. The PAL caller's `0x0400` branch bypasses the ordinary customizable `WHEEL.BIN` close path and renders the dedicated oversized tyre assets directly:

- TIRE section 4: authored left-side oversized tyre/wheel asset;
- TIRE section 5: authored right-side oversized tyre/wheel asset.

Their decoded local Y/Z radius is approximately `0.5519499`, substantially larger than the ordinary tyre geometry (~0.33–0.38).

The executable Big transform table uses:

- front-left `(-0.40, 0.55, +0.68)`;
- front-right `(+0.40, 0.55, +0.68)`;
- rear-left `(-0.40, 0.55, -0.66)`;
- rear-right `(+0.40, 0.55, -0.66)`.

Sections 4/5 carry their own lateral offset, so the ±0.40 transform origins are not the final visible tyre centres. No browser-side scale multiplier is applied.

Big intentionally bypasses the currently fitted ordinary wheel *mesh* selector while still participating in the native wheel-colour path.

## Native TIRE CLUT selection

The TIRE texture upload includes a 16×16 CT16 CLUT used as PSMT4 palette banks. Native wheel-colour configuration byte `+5` selects the bank. The first 12 banks correspond to the recovered wheel-paint family.

The browser now selects the appropriate authored TIRE texture/CLUT bank for Big and for the TIRE fallback/LOD path, rather than applying a flat colour material over the whole tyre.

## Chassis/body lift

The PAL `+0.85` value is a real chassis/contact-state consequence, not an aesthetic guess:

- car initialization at `0x002195d8` stores float `0.85` at car offset `+0x74` when configuration flag `0x0400` is present;
- `+0x74` lies in the car transform matrix translation row (Y component);
- the per-frame ground/attitude path at `0x0021d4a8` adds the same `0.85` to the computed ordinary terrain-relative Y before storing it back to `+0x74`;
- another vertical-clearance path at `0x0021c550` uses threshold `1.35` for Big and `0.50` otherwise, again an exact +0.85 delta.

A long-known HG2 teammate glitch independently corroborates that body height is distinct from tyre appearance: after a Big-equipped teammate is replaced/reverted, their ordinary tyres can return while the body remains at the Big-raised position.

### Browser mapping

The browser separates authored wheel roots from the Q62 body group, whereas the PAL engine derives body/contact transforms through its car solver. To preserve the proven native relationship without lifting the tyre contact patch off the terrain, selector 11 now raises the Q62 body and body-mounted accessories by exactly `+0.85` while leaving the dedicated Big tyre roots on their authored ground-contact transforms.

`setNativeTyreAppearance(...)` synchronizes that ride height dynamically. Q's Factory preview/apply/cancel, the outdoor player Q62, and ordinary interior previews now synchronize the native tyre selector rather than relying only on the older descriptive appearance layer.

## Deterministic visual proof

All captures use the existing fixed 1280×960 Peach FLD/223 noon camera/pose.

| State | PNG bytes | SHA-256 |
|---|---:|---|
| Normal Tyre control | 1,171,094 | `91ab3453368c88118c50fabdefaf64d20c8d5e3a746285397d86b1bb846be9fa` |
| Big Tyre + recovered +0.85 lift, front | 1,134,714 | `90b23ef897fd76ecbb1583d775ef27a41d1eb5806e545b1e7ab8cb01cb5faf0c` |
| Big Tyre + recovered +0.85 lift, rear | 1,084,230 | `5ddf8ad6571bfc30842fbea894137315e74752cb481d57b7d96270f3cd05b5e0` |
| Big Tyre + wheel-colour index 2 red | 1,129,096 | `cc2d85a572bceedcf5ef9b41e901ef1e8cff159bb96db61dc2e796eee13037aa` |

Visual inspection passes: the corrected Big body sits clearly above the oversized tyres rather than being swallowed by them; front and rear tyre alternation is coherent; native red changes the authored hub/palette surfaces rather than painting the rubber.

The Normal control remains exactly identical to the native-wheel checkpoint hash.

## Validation

- `npm run check`: passed.
- Vitest: **28/28 files, 142/142 tests**.
- Vite production build: passed (45 modules).
- Sandbox capture bundle: passed (39 modules).
- New native ride-height regression pins Big selector 11 to exactly `+0.85` and all other valid tyre selectors to zero.
- Scenery-only PAL FLD/223 remains exactly **1,568,898 bytes / 29,091 triangles / SHA-256 `8c8c7c92abe298a5b214784057b35eba0b4a6baa639b54d8667a640e553a20c9`**.
- No save-schema bump.

## Boundary / next evidence

This checkpoint closes Big Tyre's **visual geometry + ride-height state**. It does not yet claim exact native Big handling, collision climbing behaviour, acceleration penalty, weight effect, or suspension dynamics beyond the proven visual/body-height relationship.

Next tyre work should:

1. prove whether ordinary Sports/Off Road/etc. have any selector-dependent material/texture path at all;
2. recover the native tyre performance/weight/terrain-grip fields from the catalogue/controller before replacing provisional development multipliers;
3. extend Big-specific contact/collision behaviour only when the executable path is understood, rather than approximating monster-truck climbing with arbitrary clearance values.
