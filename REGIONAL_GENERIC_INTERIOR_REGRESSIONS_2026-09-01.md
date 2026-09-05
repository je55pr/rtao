# Regional generic-interior regressions — 2026-09-01

## Scope

After completing the 235/235 fixed-interior dialogue census, this follow-up
selected two ordinary conversations whose initial paths require no unrecovered
save mutation. It deliberately expanded coverage beyond Peach/Fuji and did not
change room rendering or dialogue semantics.

## Added interiors

| Area / slot | Interaction | Entry evidence | PNG bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| Sandpolis 3/05 | Captain Rombo | slot 01, 5 variants, no entry choice/action; action shapes `0x07 [15,5]`, `0x0d [30]` | 2,309,166 | `7049ea077dbe4972c38b81291eeac1e410dae85dd094c078b22fdc8be8719a44` |
| White Mountain 6/15 | Bunger | slot 01, 11 variants, no entry choice/action; four decoded action shapes | 2,820,086 | `fe72ec9b2d7fdb7564f32dec4517d8bad7510cd0dbce82070be16c76609608ca` |

Captain Rombo displays the original visitor/information greeting. Bunger
displays the original surprised house-entry greeting. Both use the generic
fixed-room flow and leave wider conditional/progression variants untouched.

## Visual inspection

Both 1280x960 Chrome/SwiftShader captures passed visual inspection. Captain
Rombo's police office shows the authored lockers, desk/telephone/files, poster,
floor and two live cars. Bunger's house shows its window, Christmas tree,
furniture, framed fish, patterned floor/walls and two live cars. Geometry,
textures and fixed-camera staging are visible and coherent; neither image is
blank or catastrophically rendered.

## Validation

- `npm run check`: 24/24 files and 82/82 tests passed; production and capture
  builds passed.
- `shop_regression.py`: 13/13 cases each rendered twice, repeated byte-for-byte,
  matched the recorded SHA-256, and passed 1280x960 PNG validation.
- The two new cases additionally assert executable entity, slot-01 entry,
  choice/action boundary, variant count and complete action-shape set.

## Remaining limitation

This regression proves initial room/dialogue/return readiness and deterministic
rendering. It does not invent state for later conditional variants. Those paths
should be enabled only as their original flags and mutations are reconstructed.
