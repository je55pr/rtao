# RTA Laz numeric-interior regression — 2026-09-01

Mushroom Road Laz (area 10, fixed slot 00) is now the fourteenth named generic
interior regression. It exercises a different interaction shape from the Peach
quest-item rooms while remaining a lightweight single-room capture.

The PAL executable establishes:

- entity `Laz`, 13 variants;
- ordinary entry at slot 01 with the original “Why don't you relax” greeting;
- post-text action `0x05 [22,9,8]` at slot 07, immediately following “How many
  are there?” about the number of windmills;
- correct answer `22`, correct-result slot 09, incorrect-result slot 08.

Follow-up executable tracing proved that action `0x05` is a 0–99 numeric
selector: callback `0x0023be00` starts at 1, clamps at 0/99 and returns the
second or third operand according to whether the chosen value matches the
first. The fixed-interior runtime now implements that exact UI and routing.
The all-zero form uses the same selector and returns slot zero for either
result; it is no longer an unresolved separate mode.

The 1280×960 SwiftShader capture is 2,581,798 bytes with SHA-256
`8050791e60a5a2328c92de47a4d045e3b8c1128e64b20d457ee7840872ee5940`.
Two consecutive captures matched byte-for-byte. Visual inspection found a
coherent textured office/house room, furniture, floor/walls, live Laz/player
cars and sensible fixed-camera staging with no blank or catastrophic output.

A later 1400×1100 runtime/UI capture is 1,481,140 bytes with SHA-256
`a456553606bd044dbc0830a8e043e7961771f07eb999aa800242a74aff8cb12f`.
PAL Chrome/SwiftShader confirmed `22 -> 0x09` and initial `1 -> 0x08`.
