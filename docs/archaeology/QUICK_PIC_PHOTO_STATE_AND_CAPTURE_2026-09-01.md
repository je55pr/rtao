# Quick-Pic photo state and browser capture — 2026-09-01

## Result

Peach Quick-Pic No.1 is complete as an evidence-backed fixed-interior interaction: overworld room entry, original greeting/question/retake dialogue, a real 1280×960 PNG capture, explicit keep/retake choice, persistent completion state, authored post-photo dialogue, clean exit and reload-safe retake branching.

The implementation is data-generic for original photo numbers 1–96. It does not claim that the browser's fixed-room PNG reproduces the PS2 photo activity's unknown framing/effects; it provides a real local screenshot at the exact recovered host boundary while preserving the original state transitions.

## Executable evidence

- Pre-text dispatcher `0x0023c870`, opcode `0x05` handler `0x0023c938`, calls `0x0023f448(photoNumber)` and branches to operand 2 when the photo bit is already set.
- Post-text dispatcher `0x0023d078`, opcode `0x11` handler `0x0023d308`, calls `0x0023e120(photoNumber)`, registers callback `0x0023d510`, and returns through operand 2.
- `0x0023e120` sets bit `photoNumber - 1` in the 96-bit Quick-Pic set at save base `0x01824f80 + 0x508`; `0x0023f448` tests the same set.
- All 96 mapped Quick-Pic entities use positive action shape `0x11 [photoNumber,6]`.
- Peach Quick-Pic No.1 uses pre-text `0x05 [1,3]`, question slot 02, retake slot 03, activity slot 04 and post-photo slot 06.
- Slot 01's bounded `0x02 [0,81]` cannot be a valid same-entity choice target. The browser applies a narrow Quick-Pic-name/context bridge from the greeting to proven question slot 02; global opcode-02 semantics are unchanged.

## Implementation

- `DialogueOpcode.BranchIfQuickPicTaken` and `DialogueActionOpcode.RecordQuickPicPhoto` replace the former unknown labels.
- `DialogueRuntimeState` validates and stores photo numbers 1–96.
- recovered state schema 7 adds sorted `quickPicPhotos`; schema 1–6 migration invents no photo completion.
- Photo state is not mutated when the host action is rendered. The room is captured to a Blob first and the bit is recorded only after **Keep picture**.
- **Retake** discards the Blob and leaves progress unchanged; **Save PNG** downloads the same local Blob.
- Re-entering question slot 02 after keeping photo 1 executes the original condition and reaches slot 03, “Would you like to take it again?”

## Validation

- Vitest: 28/28 files, 125/125 tests passed.
- Vite production build: passed.
- Sandbox capture bundle: passed.
- Chrome Headless Shell 151 + SwiftShader: passed.
- Captured PNG: 1280×960, 1,942,202 bytes, SHA-256 `b373c03d23aa2f313c61f1c431e48a3ace45e46012d4a56808325478a32d90cc`.
- Save before keep: `quickPicPhotos: []`.
- Save after keep: schema 7, `quickPicPhotos: [1]`.
- Fresh page/load at slot 02: branched to slot `0x03` with the original retake text.
- Visual inspection: authored Quick-Pic backdrop/scenery and floor, live player/staff cars, textures and fixed camera were coherent; no blank frame or catastrophic rendering failure.
- `shop_regression.py` now includes `peach-quick-pic-1` as its twentieth case. It captures twice byte-for-byte, checks all four action shapes, verifies untaken/taken pre-text branching and applies the photo action. Its capture is 1,942,698 bytes with SwiftShader regression SHA-256 `026e56ec5da3f388206c6362eab912ae582226a3faf6efb68dbe2dae39dff8a9`; visual inspection passed.

## Remaining boundary

The exact PS2 Quick-Pic activity camera, decorative effects and any memory-card photo representation have not been recovered. They are not required for the verified browser-local PNG and completion-bit flow, and no PS2-specific visual semantics were invented.
