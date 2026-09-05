# RTA Parts Shop → Q's Factory native equipment loop — 2026-09-04

## Result

The canonical Three.js/TypeScript runtime now connects direct Peach Parts Shop ownership to Q's Factory fitting through the recovered native equipment selector state.

The intended gameplay slice is now represented as one coherent state path:

**Parts Shop purchase → indexed ownership → Q's Factory owned-part catalogue → native selector write → live car appearance/handling bridge → recovered save → reload**.

Direct purchase still does **not** auto-equip. Q's Factory is the fitting boundary.

## Q's Factory fitting rules

- The Change Parts UI no longer exposes the complete development catalogue as though every item were owned.
- It builds its choices from executable-mapped native category/item identities plus current indexed ownership.
- Nonzero parts require at least one owned copy before they can be selected/fitted.
- Native selector `0` remains available as the baseline/no-equipped state, so a fitted optional part can be removed without inventing an ownership grant for “None”.
- The currently fitted selector remains displayable even if an imported/native save lacks an ownership copy, but that does not grant any new part.
- Previewing remains non-mutating. **Fit selected parts** commits the native selectors; **Cancel** restores the prior visual preview and changes no save state.
- A successful native selector mutation queues the existing schema-8 `recovered-dialogue-state.json` save immediately.
- `save/development-parts.json` is retained only as a compatibility mirror for the older descriptive appearance/temporary handling layer. The recovered selector bytes are the authoritative fitting state.

## Peach Parts Shop bridge

All nine currently reconstructed Peach stock entries now resolve to an executable-backed Q's Factory identity:

| Peach stock | Native selector | Browser bridge |
|---|---:|---|
| Sports Tyre | `1:1` | Sports Tyre |
| Off Road Tyre | `1:7` | Off Road Tyre |
| Panther | `2:1` | Panther |
| Quick | `5:1` | Quick Steering |
| Soft Pad | `6:1` | Soft Pad |
| Mesh | `7:1` | Mesh Wheel |
| Spoke 1 | `7:2` | Spoke 1 |
| Air Horn | `13:1` | Air Horn; selector/save only, audio switching still deferred |
| Digital Meter | `14:1` | Digital Meter; selector/save only, HUD switching still deferred |

The Spoke identity now uses its original `Spoke 1` label. Air Horn replaces an unrelated placeholder horn identity so the original Peach stock coordinate `13:1` is not lost at the fitting boundary.

## End-to-end acceptance test

A focused test covers the visible Mesh Wheel loop because it is cheap, immediately recognisable and uses only already-proven data:

1. Start a fresh recovered save with the executable-proven two Normal Wheels in ownership category 7/item 0.
2. Confirm Q's Factory initially offers only the Normal Wheel for that category.
3. Purchase Peach Mesh at native coordinate `7:1` for 500 Cake.
4. Confirm Cake becomes 500 and Q's Factory now exposes Normal Wheel + Mesh Wheel.
5. Fit Mesh Wheel through the ownership-gated native fitting helper.
6. Confirm first-loadout selector category 7 becomes item 1.
7. Apply the existing appearance bridge and confirm `wheelStyle == "mesh"`.
8. Serialise schema 8, restore into fresh runtime state and confirm ownership `7:1`, 500 Cake, selector `7:1`, and mesh-wheel appearance all survive reload.
9. Attempting to fit unowned Spoke 1 (`7:2`) is rejected.

This directly covers the player-facing sequence **buy → fit → drive/reload with the fitted wheel** at the state/render-appearance boundary.

## Validation

- Focused Parts/QFactory tests: passed.
- Every one of the nine Peach stock coordinates has a mapped native Q's Factory identity.
- Full final web gate after implementation: 28/28 Vitest files, 135/135 tests, Vite production build and sandbox capture bundle passed.
- No outdoor renderer, generic fixed-interior dialogue, commerce transaction, Quick-Pic, paint or teammate-trade code was changed by this pass.

### Live PAL browser validation

The earlier claim that this sandbox could not unpack the supplied `.7z` was corrected. There is no `7z` executable, but the environment contains libarchive headers/libraries plus a C compiler. A tiny local extractor linked against libarchive successfully unpacked the supplied archive to the original PAL CUE and a **617,825,712-byte BIN**. No original game data is bundled into the source handoff.

Chrome 151 + SwiftShader then ran the real browser application against that extracted PAL source and completed a clean local install:

- 64/64 world sectors compiled and restored;
- whole-world renderer reported **926,127 triangles**;
- driving became available normally.

The actual browser UI then passed the end-to-end Mesh Wheel acceptance flow:

1. Peach Parts Shop opened through its executable-defined fixed interaction. The fresh balance was **1,000 CAKE**.
2. Wheel stock showed Mesh and Spoke 1 at 500 Cake each. Buying Mesh executed the native `(7,1)` indexed purchase, reduced the balance to **500 CAKE**, showed **1/5 owned**, and explicitly did **not** auto-equip it.
3. Q's Factory opened through its native slot-04 menu (`Change parts / Race / Save data / Exit game / Drive around town`). Choosing **Change parts** opened the ownership-gated fitting UI.
4. Before fitting, Wheels showed `Normal Wheel · FITTED · 2 OWNED` and `Mesh Wheel · 1 OWNED`.
5. Selecting Mesh Wheel and applying it logged **1 native selector change** and **1 visible non-standard selection**, then returned to Q's Factory slot 04.
6. Returning to town resumed the already-active driving state (`Stop driving`).
7. Reloading the persistent install and reopening Q's Factory showed `Normal Wheel · 2 OWNED` and **`Mesh Wheel · FITTED · 1 OWNED`**, proving ownership plus native fitted selector persistence across reload.
8. Visual inspection of the Q's Factory frame passed; the player Q62 visibly carries the mesh-style wheel while the UI identifies native selector `7:1`.

This closes the previous validation caveat: the player-facing **Parts Shop purchase → Q's Factory fit → drive → reload** loop is now both test-backed and live PAL-browser validated.

## Remaining boundaries

- The complete native catalogue is still not mapped. Q's Factory deliberately omits development-only categories/items whose native identities are not established.
- Native category-specific configuration side effects beyond the recovered selector byte remain an archaeology target where they affect future gameplay.
- Horn audio and meter HUD switching remain deferred even though their original Peach selectors are now persisted/fittable.
- Existing development handling multipliers are still provisional and must not be described as decoded native performance values.
- Teammate/save-slot selection and Parts Shop trading remain separate; this pass does not touch them.
