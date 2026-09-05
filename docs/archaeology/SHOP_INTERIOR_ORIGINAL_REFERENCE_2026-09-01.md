# RTA fixed-interior original-reference pass — 2026-09-01

## Scope and source map

This pass stayed on the Three.js/TypeScript generic fixed-SHOP milestone. It did
not reopen outdoor day/night work.

Current-status update: the later bounded trailing-zero recovery decoded every
fixed entity, including Peach FM. Its action `0x05 [0,0,0]` now has a proven
structural width; only the original host/UI/state meaning remains unknown. See
`DIALOGUE_BOUNDED_ZERO_RECOVERY_2026-09-01.md`.

The public RoadTripAdventure YouTube archive was mapped in the Work browser:

- Channel: <https://www.youtube.com/@roadtripadventure183>
- Peach Town playlist (29 videos):
  <https://www.youtube.com/playlist?list=PLeOzyfoJsUJRL6a8i2-VVFv9Sc6vRTC9e>
- Peach Bartender, 23 seconds: <https://www.youtube.com/watch?v=v2CyxHLkUk8>
- Peach Part Shop, 18 seconds: <https://www.youtube.com/watch?v=4lOplDAQ9nU>
- Peach Body Shop + Stamp, 34 seconds: <https://www.youtube.com/watch?v=D9cstn_LoD8>
- Fuji City playlist (33 videos):
  <https://www.youtube.com/playlist?list=PLeOzyfoJsUJRBUQX7xgeWWysKRe6KMv5P>
- Fuji Parts Shop, 18 seconds: <https://www.youtube.com/watch?v=GihmXlxubTw>
- Fuji Body Shop, 21 seconds: <https://www.youtube.com/watch?v=z8CzpdrVmTI>

The browser could inspect and verify every playlist/video page, title, order and
duration. The YouTube media CDN did not deliver the video streams or storyboard
images to this cloud-browser session, so frame-level timing could not be
inspected. That limitation is recorded rather than silently replacing the
footage with guesses.

Additional original-game visual/data references:

- MobyGames Peach FM screenshot:
  <https://www.mobygames.com/game/34657/road-trip/screenshots/ps2/684735/>
- MobyGames Body Shop screenshot:
  <https://www.mobygames.com/game/34657/road-trip/screenshots/ps2/684738/>
- RTA Guide parts list and prices: <https://www.roadtripguide.info/items/parts>
- RTA Guide body list and prices: <https://www.roadtripguide.info/items/bodies>

## Repeated dynamic-room evidence

The surviving original Peach FM image shows the common fixed-interior
composition clearly: the staff car is back-left, the player car is
foreground-right, both face inward, and the dialogue box occupies the lower
screen. The current fixed-camera projection and the previously recovered
Q's Factory car transforms reproduce that staging at the same screen positions.

This is not a generic substitute body. The PAL executable already supplies the
fixed interaction's exact `bodyId` and RGB444 primary/secondary paint. Relevant
Peach examples are:

| Slot | Interaction | Body | Primary | Secondary |
| ---: | --- | ---: | --- | --- |
| 01 | Parts Shop Staff | Q31 | 51, 89, 191 | 216, 216, 25 |
| 02 | Body Shop Staff | Q32 | 204, 38, 25 | 204, 51, 25 |
| 04 | Bartender | Q68 | 25, 25, 63 | 216, 216, 216 |
| 06 | Peach FM Front Desk | Q118 | 102, 191, 140 | 102, 191, 140 |
| 07 | Kinsera | Q122 | 25, 140, 216 | 25, 140, 216 |
| 08 | Kevin's mom | Q48 | 216, 25, 25 | 216, 25, 25 |

The shared `ShopInteriorRoomView` now renders its existing authored
floor/scenery base, clears depth, and adds live decoded staff/player cars plus
their floor shadows. Q's Factory remains on its specialised platform renderer.

## Peach Parts Shop host

The Parts Shop external action remains opcode `0x13` with decoded return slot
`02`. Peach now opens a typed catalogue host rather than the generic unsupported
boundary. The catalogue contains nine documented Peach stock entries:

| Category | Item | Price |
| --- | --- | ---: |
| Tyre | Sports Tyre | 1,000 Cake |
| Tyre | Off Road Tyre | 500 Cake |
| Engine | Panther | 500 Cake |
| Steering | Quick | 500 Cake |
| Brake | Soft Pad | 1,000 Cake |
| Wheel | Mesh | 500 Cake |
| Wheel | Spoke 1 | 500 Cake |
| Horn | Air Horn | 1,000 Cake |
| Meter | Digital Meter | 100 Cake |

Keyboard/click browsing, category/item wrapping and the original dialogue
return edge are implemented. Purchases are intentionally not claimed yet:
Cake balance, ownership and original save-table mutations remain undecoded.

## Validation

- Web tests: 23/23 files, 74/74 tests passed.
- TypeScript/Vite production build: passed (39 modules).
- Sandbox capture bundle: passed (34 modules, 1,454.93 kB).
- Python capture helpers: `py_compile` passed.
- Bartender dynamic capture repeated byte-for-byte:
  2,618,318 bytes, SHA-256
  `bdb4116028dd1d9c8f76db9415083c6ca264a93373669e7064067e87f6f19e0d`.
- Parts Shop: 2,689,255 bytes,
  `4b61e8053c9af0329af09e7c59ecf482c0560e40307e1c4a865d446dd333e44d`.
- Body Shop: 2,139,811 bytes,
  `fba54bf5c878c7bb38b66642fe7cf5feee4982eb87403f02d8ea62cfbc561a3e`.
- Peach FM: 2,596,156 bytes,
  `f36c36ec89c738159082aa0fcab16168ae0a2349f31ae3ee5468bb560c1f4668`.
- Kinsera: 2,403,364 bytes,
  `9315b7994dc8990b0105e3210a2d6787156664f37b26dac33ea94a8fd4b1538b`.
- Kevin's mum: 2,925,429 bytes,
  `24a799e2ae18149c3b12fa99121ef8c5df4511c7fdfacd198aba5d384619e29c`.

All six 1280x960 captures were visually inspected. Geometry, authored scenery,
floor textures, staff bodies/paint, player car, camera scale and inward staging
are coherent. Peach FM is a particularly strong comparison: the Q118 staff car
and both screen positions align with the surviving original-game screenshot.
No blank frame, missing texture or catastrophic rendering failure was observed.

## Exact remaining gaps

1. This Work browser could not inspect the YouTube stream frames, so exact fade
   duration, cursor animation, menu sound and per-frame transition timing from
   those videos remain unavailable here.
2. Peach Parts Shop Cake balance, ownership flags, purchase mutation and save
   persistence are not decoded. The current catalogue is browse-and-return only.
3. Peach FM entity 6 contains the structurally decoded action
   `0x05 [0,0,0]`. Its original host/UI/state meaning remains unproven and must
   not be guessed; room and dialogue metadata are no longer decoder-deferred.
4. Exact native world-space car transform constants have not yet been tied to
   an executable address. Their fixed-screen result is nevertheless strongly
   cross-checked by the original Peach FM image and six room captures.
