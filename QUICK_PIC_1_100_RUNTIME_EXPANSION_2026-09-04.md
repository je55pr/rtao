# RTA Quick-Pic 1–100 runtime expansion — 2026-09-04

## Result

The canonical Three.js/TypeScript runtime now models Quick-Pic as the original continuous **1–100** set rather than the earlier 1–96 interpretation. The existing sorted `quickPicPhotos` save representation remains schema 8; no schema bump was required because the representation naturally stores IDs 97–100.

Recording a valid photo remains idempotent. After a Quick-Pic record action, the runtime tests whether all 100 IDs are present and, when complete, awards **Stamp 96** through the existing deduplicating recovered stamp state. Merely reaching/rendering the capture host still does not mutate completion; the photo is recorded only through the established keep/apply path.

## State and save changes

- Shared Quick-Pic constants now define 100 valid photos and completion Stamp 96.
- Dialogue runtime validation accepts integer photo IDs 1–100 and rejects 0/101.
- Schema-7/8 Quick-Pic restoration accepts 1–100 while preserving sorted/deduplicated state.
- Duplicate recording does not increase completion count or duplicate Stamp 96.
- A 99/100 state does not award Stamp 96 until the final missing photo is recorded.
- Reloaded complete state remains stable, including the completion stamp.

Focused state coverage includes IDs 96, 97 and 100, invalid 0/101, duplicate recording, 99/100 negative completion, final-photo award, and complete-state reload/reinteraction.

## Cloud Hill direct-room boundary

Cloud Hill remains outside the ordinary standard-field/outdoor mapping. To test its normal fixed SHOP interiors without claiming outdoor traversal, the sandbox fixed-room helper now has a narrow fallback that can decode one fixed interaction directly by area/local slot even when no standard FLD number exists.

This is used by Quick-Pic No.97 at area 8 / slot 10. The ordinary overworld catalogue remains unchanged and still excludes the special raw area-code-64 mapping, so this pass does **not** implement Cloud Hill outdoor rendering or entry.

A PAL-backed No.97 completion probe starts with all photos except 97, executes the decoded `0x11 [97,6]` host action, and verifies the resulting recovered state contains photos 1–100 plus Stamp 96.

## Seven authored SHOP-slot families

The regression harness now covers the existing Peach family plus one representative from each remaining raw `0x3F000` authored slot family. It verifies the complete slot bytes before dialogue/rendering:

| Representative | Area / slot | Raw slot SHA-256 |
|---|---|---|
| No.1 / No.2 — Peach | 1 / 18–19 | `b7f1294e64ed65950240c89b207c133e2290c2bf53f81badd68bd0368c0cc289` |
| No.13 — generic/Bridge | 11 / 0 | `c88aa860c688c5240f18620e55648a4cd1b75f5747a48de7cd0ea3e87a2d1ec4` |
| No.17 — Fuji | 2 / 19 | `e7b6dc0e680a5d079862220ba2c94f37e01843d47844e3ef0e0cadcb9f60a419` |
| No.28 — My City | 9 / 21 | `12bfa6b6adc2ff66010103fb69cb0266620f230b5db86e33973e8aa32ef1a615` |
| No.36 — Sandpolis | 3 / 21 | `e325ab10a267ab8bbc5ead36c8a92061e0c521e4c08904cbe04af943f8dee2ac` |
| No.71 — White Mountain | 6 / 20 | `e4d4260d4f787479aa5ab46cf7bab55ec41eff962afd627aabb2e1a4df94e2af` |
| No.97 — Cloud Hill | 8 / 10 | `743f7c87570b1211a5f00d46eaa9a161283df4db0eeb7bbc6135869cb4c99943` |

All eight Quick-Pic regression cases (No.1, No.2 and the six additions) pass the same six-variant dialogue lifecycle and their photo-specific `0x11 [photo,6]` action.

### Renderer-side finding

Despite the seven complete SHOP slots being byte-distinct, the current reconstructed fixed-room renderer produces the same visible 1280×960 composition for all seven representatives: 1,942,698 bytes, SHA-256 `026e56ec5da3f388206c6362eab912ae582226a3faf6efb68dbe2dae39dff8a9` under the checkpoint Chrome 151 SwiftShader path.

This does **not** collapse the authored data into one family. The regression now asserts both the raw slot-family SHA and the rendered baseline so future decoding of currently unused family-specific slot data can become visible without losing evidence that all seven native authored families were exercised.

## Deterministic renderer environment

In this sandbox, Chrome 151 launched with `--use-angle=gl` selected Mesa/llvmpipe rather than the SwiftShader backend that produced the stored regression hashes. The fixed-room and low-memory fixture harnesses now request SwiftShader explicitly with `--use-angle=swiftshader --enable-unsafe-swiftshader`.

With the local X display available, that reproduces the stored Peach Quick-Pic hash exactly. A vanished sandbox X display caused a temporary WebGL-context allocation error during validation; restarting the local X display restored the same renderer/hash without source changes.

## Bunger baseline control

White Mountain Bunger again exhibited the already-documented environment-sensitive PNG baseline behaviour. The current pass produced a repeatable 2,820,086-byte frame at SHA-256 `fe72ec9b2d7fdb7564f32dec4517d8bad7510cd0dbce82070be16c76609608ca`.

Before changing that baseline, the untouched canonical 2026-09-02 source ZIP was rebuilt separately under the identical Chrome 151 / SwiftShader environment. It produced the exact same 2,820,086-byte frame and SHA, proving the difference was not introduced by the Quick-Pic changes. Visual inspection remained coherent. Only the regression baseline was refreshed; no Bunger rendering code changed.

## Validation

- Focused Quick-Pic/recovered-state tests: passed.
- Full web test suite: 28 files / 132 tests passed at the implementation checkpoint before final packaging.
- Vite production build: passed.
- Sandbox capture bundle: passed (38 modules; 1,474.72 kB before final packaging).
- Fixed-interior regression coverage: 27 cases total. The long combined invocation reached the tool execution ceiling on the penultimate Quick-Pic case; the remaining two cases were immediately run separately and passed. Across the combined runs every one of the 27 named cases passed its dialogue/state assertions and deterministic image baseline.
- Seven Quick-Pic raw SHOP-slot family hashes: all matched exactly.
- No.97 PAL-backed 99→100 completion action: passed with Stamp 96.
- Outdoor FLD/223 fixture: 6,514,849 bytes.
- Peach outdoor smoke capture: 1,568,898-byte 1280×960 PNG, 29,091 triangles, SHA-256 `8c8c7c92abe298a5b214784057b35eba0b4a6baa639b54d8667a640e553a20c9`, exactly matching the canonical known-good baseline. Visual inspection passed.

## Remaining boundary

The exact original PS2 Quick-Pic photo-screen framing/effects and per-photo native metadata remain unreconstructed. Cloud Hill outdoor traversal/entry also remains a separate future subsystem. Neither boundary blocks the now-generic 1–100 Quick-Pic state, completion reward, dialogue lifecycle, or direct fixed-room regression coverage.
