# RTA Body Shop catalogue reconstruction — 2026-09-01

## Result

Peach Town and Fuji City Body Shop interactions now open a typed original-stock
catalogue from their executable dialogue streams. The current body is replaced
live in the foreground preview as the selection changes. Closing the catalogue
follows the original return slot and the room's normal exit restores the paused
overworld state.

Q's Factory remains on its specialised composition. No outdoor renderer,
day/night, SHOP backdrop, dialogue-decoder, or purchase semantics were changed.

## Original evidence

- PAL executable entity 2 is `Body Shop`. Slot 01 asks `Do you want a new
  body?`; Yes reaches the opcode-`0x13` shop host with return slot 03, while No
  and the host return reach `Come again!`.
- Peach and Fuji stock membership follows the location catalogue at
  <https://www.roadtripguide.info/items/bodies>. Every ordinary body costs 500
  Cake. Reward-only bodies are deliberately excluded from shop stock.
- The surviving original catalogue screenshot at
  <https://www.mobygames.com/game/34657/road-trip/screenshots/ps2/684738/>
  confirms a multi-entry body browser with a selected Q-body and price display.
- The mapped original-video references remain in
  `SHOP_INTERIOR_ORIGINAL_REFERENCE_2026-09-01.md`. Work could verify their
  titles and durations, but not retrieve YouTube frame media.

Peach stock contains 20 bodies; Fuji stock contains 22. The complete typed
tables and names are in `web/src/game/bodyCatalog.ts`.

## Runtime implementation

- `BodyShopCatalogueSession` provides validated selection and wrapped keyboard
  navigation without coupling stock evidence to DOM code.
- Runtime imports retain every referenced `CAR2/Qxx.BIN` body needed by the two
  catalogues.
- `ShopInteriorRoomView.setPlayerCar()` swaps only the foreground player mesh,
  preserving the decoded room, executable-selected staff car, paint, camera,
  and current accessory appearance.
- Mouse, keyboard, return-to-counter, farewell, clean exit, and outdoor resume
  paths are supported.
- A generic mouse-choice defect found by the browser probe was fixed: entering
  a non-default choice no longer repeatedly replaces the button before its
  click can fire. The same minimal guard protects Q's Factory choices.

Purchasing is intentionally deferred. Cake balance, ownership flags and
original save-table mutation are not yet decoded, so the runtime does not
pretend that previewing an item buys it.

## Validation

- Vitest: 24/24 files, 78/78 tests passed.
- Vite production build: passed, 40 modules.
- Sandbox capture bundle: passed, 34 modules.
- Full PAL BIN/CUE browser path under Chrome 151 + SwiftShader: passed with no
  page errors or console warnings/errors.
- Peach flow: original Yes branch -> 20-item catalogue -> Q013 Silvia S15 live
  preview -> Return to counter -> `Come again!` -> clean town exit.
- Screenshot: `SHOP_PEACH_BODY_CATALOGUE_UI_2026-09-01.png`, 1328x996,
  1,273,637 bytes, SHA-256
  `de2b63bd2913c67d6f75003fc58f5da888bb185aaa1ba42c1180b3ef3016336b`.
- Visual inspection passed: authored scenery and floor textures are present;
  staff/player geometry is visible; Q013 is framed sensibly; no blank frame,
  missing-room composition, or catastrophic rendering failure was observed.

## Remaining limitation

Body purchase/equip ownership and persistence are the only deliberate product
gap in this tranche. Exact original cursor animation, sound, and transition
timing also remain unavailable from the currently retrievable video evidence.
