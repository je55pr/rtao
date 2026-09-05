# RTA Flower seed interior regression — 2026-09-01

Papaya Island Flower (area 9, fixed slot 16) is the fifteenth named generic
interior regression and the third PAL-backed namespace-15 quest-item case.

The real executable flow establishes:

- ordinary slot-01 greeting and terminal action `0x03 [0]`;
- slot 03 checks indexed item `[15,41]` and branches to slot 04;
- slot 04 asks about the flower seed and enters zero-mode action
  `0x05 [0,0,0]`;
- the item remains present at that native 0–99 numeric selection boundary;
- slot 06 clears `[15,41]`, displays the original acceptance/reward text, and
  reaches action `0x07 [15,1]`.

The regression deliberately tests the original check and later consumption as
separate boundaries. A later native trace proved the zero-mode action is the
same 0–99 selector as Laz; both return targets are zero, so confirmation exits
without a save mutation. It does not itself connect ordinary entry to slot 06.

The 1280×960 SwiftShader capture is 2,776,710 bytes with SHA-256
`81703303c183a98d98141c8eaac989914fcd6b717c3eb3dacca1b9fffd932978`.
Two consecutive captures matched byte-for-byte. Visual inspection found a
coherent room with flowered walls, plants, furniture, textured floor, live
Flower/player cars and sensible fixed-camera staging. No blank or catastrophic
rendering failure was present.
