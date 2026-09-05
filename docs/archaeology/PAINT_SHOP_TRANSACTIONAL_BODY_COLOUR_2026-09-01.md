# RTA transactional Paint Shop body colour — 2026-09-01

## Result

Peach Paint Shop now implements the evidence-backed body/two-tone half of the
original service. The player can edit both RGB444 tones in their native 0–15
channel domain, preview the result on the live Q62, confirm an exact 100-Cake
transaction, persist the packed native configuration word, follow the original
slot-04 farewell and return to the unchanged overworld session.

Wheel colour remains explicit deferred work. The executable proves its separate
100-Cake component and 12-step selector, but the renderer-side palette mapping
has not yet been named confidently. Consequently the combined 200-Cake path is
not exposed prematurely.

## Native executable evidence

The Paint editor is `0x00258480`. It edits a temporary car-configuration copy
and dispatches nine cursor modes through table `0x0030c620`:

- six modes clamp the two consecutive RGB444 colours' R/G/B nibbles to `0..15`;
- one mode selects the two-tone editing branch;
- one mode advances the persisted 12-step wheel-colour selector;
- one mode changes the active body/wheel target.

The confirmed-purchase callback begins at `0x00258878`. It locates the selected
car's 28-byte configuration record at `0x01824f80 + carIndex * 0x1c`, compares
the draft and saved 32-bit colour word, then computes:

```text
bodyCost  = ((saved ^ draft) & 0x00ffffff) != 0 ? 100 : 0
wheelCost = ((saved ^ draft) >> 24) != 0 ? 100 : 0
totalCost = bodyCost + wheelCost
```

At `0x00258914` it calls the proven Cake helper `0x0023f7b8(totalCost, slot)`.
Only the confirmed path then writes the draft word to configuration offset
`+0x00` and the wheel cursor byte to `+0x05`. The surrounding host checks the
balance before reaching this callback, so unaffordable confirmation does not
partially mutate colour state.

The body-colour intensity table already used by the PAL outdoor decoder remains
`[25,38,51,63,76,89,102,114,127,140,153,165,178,191,204,216]`.

## Web implementation

- Added `paintShop.ts` with exact RGB444 channel packing, native body-price
  comparison, clamped selector state and atomic Cake/configuration mutation.
- Recovered save schema 6 adds nullable `paintWord`; schema 5 and older saves
  migrate without fabricating native paint state. Until a legacy player first
  confirms paint, the selector uses the nearest RGB444 representation of the
  port's established pink Q62 as an explicitly labelled compatibility seed.
- The selector exposes primary/secondary R/G/B channels, live swatches,
  keyboard and mouse control, Cake balance, unchanged/insufficient feedback,
  Cancel rollback and confirmation.
- `Q62CarModel.setPaints` rebuilds only the baked body-colour groups, so preview
  changes are immediate without re-decoding the car or disturbing wheels and
  equipped accessories.
- Persisted paint is applied to outdoor, Q's Factory, generic-room and Body Shop
  player-car construction. No body purchase is conflated with painting or
  equipping.

## Validation

- Vitest: 28/28 files and 121/121 tests passed.
- TypeScript/Vite production build: passed (44 modules).
- Sandbox capture bundle: passed (37 modules, 1,469.34 kB).
- Chrome Headless Shell 151 + SwiftShader opened Peach Paint Shop at slot 02,
  changed primary blue, displayed the original 100-Cake price, saved
  `paintWord = 0x00b8f4af`, reduced Cake from 1,000 to 900 and returned through
  original slot 04 text: `Come again, if you want to change your colour.`
- Selector frame: 1400×1100, 973,620 bytes, SHA-256
  `e2ecfd71b26c5a3be3084e21c670744c23a7c1c2a038e8286c4049f4ede4e7fe`.
- Post-purchase frame: 1400×1100, 1,127,432 bytes, SHA-256
  `88741a2955ce652802a9e2d63a802076fc790b6cd60bdcc3063b2dbce9da3eab`.
- Visual inspection passed: authored scenery/textures, staff and repainted Q62,
  camera, selector layout and farewell frame are coherent; no blank frame,
  missing geometry or catastrophic rendering failure was present.

## Remaining boundary

Recover how the 12-step wheel selector maps configuration byte `+0x03` and
cursor byte `+0x05` to rendered wheel colour before enabling wheel-only or
combined 200-Cake painting. Teammate selection also remains outside this host
until the shared selected-car transition is represented. Neither limitation
blocks the now-transactional player body/two-tone service.
