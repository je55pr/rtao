# RTA Paint Shop host-boundary pass — 2026-09-01

## Result

Peach Paint Shop now opens reliably from a fresh PAL browser import, presents
its original executable dialogue, identifies its contextual paint-selector
boundary, follows the authored slot-04 farewell, and restores the overworld.
The later `PAINT_SHOP_TRANSACTIONAL_BODY_COLOUR_2026-09-01.md` pass completes
the native RGB444 body/two-tone selector, 100-Cake transaction and persistence.
Only the separate wheel-colour palette and teammate selection remain deferred.

## Evidence and fixes

- Paint Shop entity 3 enters slot 02 and explains body/teammate colour,
  directional selection and two-tone support.
- Slot 03 records 100 Cake for body or wheels and 200 Cake for both.
- Paint's action `0x03 [0]` is contextual: it launches the paint service. The
  same bytes terminate Bartender-style ordinary conversations. A tested
  entity-aware host presentation now preserves that distinction and returns
  Paint Shop to slot 04.
- A fresh browser import initially failed before dialogue because the retained
  car set guaranteed only residents, Q's Factory and Body Shop stock. The
  generic runtime can enter all mapped rooms, so imports now retain every
  executable-mapped fixed-interaction staff body. This restored Paint's Q34 and
  removes the same latent failure from other less-common rooms.

This boundary pass intentionally invented no colour or save behavior. The
subsequent executable trace supplied that evidence and is documented in
`PAINT_SHOP_TRANSACTIONAL_BODY_COLOUR_2026-09-01.md`.

## Validation

- Context/importer targeted tests: 9/9 passed.
- Full suite: 24 files, 79 tests passed.
- Production build and sandbox capture bundle passed.
- Full PAL browser flow under Chrome 151 + SwiftShader passed: slot 02 -> Paint
  selector boundary -> slot 04 farewell -> clean exit, with no page errors.
- 1280x960 capture: 1,770,233 bytes; SHA-256
  `365552a2f17c395b4e15ea6041ea12595020d7c44bf2ef9b8dc8ffd0411434c6`.
- Visual inspection passed: authored paint machinery/palette/floor, staff Q34,
  player car, textures and camera are coherent with no catastrophic failure.

## Remaining gap

The RGB444 primary/secondary mutation and body-side 100-Cake persistence are
now implemented. Remaining work is the exact 12-step wheel-colour render
mapping, its separate 100-Cake component, the combined 200-Cake path and
teammate selection.
