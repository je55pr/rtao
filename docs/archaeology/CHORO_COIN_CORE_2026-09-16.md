# PAL ChoroQ coin core trace — 2026-09-16

## Result

The PAL executable now identifies the complete ordinary-world ChoroQ coin
placement/count/pickup state needed for a browser gameplay core. This slice does
not guess rendering, Coin Radar presentation, or memory-card byte offsets.

`SYS/COIN.BIN` is the shared coin render asset on the European PAL disc:

- size: **5,056 bytes**;
- SHA-256: `0a721d58ad30c53f6a3e40b31bdca79fa22b5b3d82e2d6c28eaf39b1e515587d`;
- HG2 section offsets: `0x10`, `0x0a30`, `0x13c0`.

Placement is not stored in that asset. The executable owns a fixed table at
`0x002a9020`: exactly **100 records × 16 bytes**. Each record is:

```text
+0x00  f32 source-local X
+0x04  f32 Y
+0x08  f32 Z
+0x0c  u32 ordinary-world area code
```

The active parser exposes the authored coordinates and resolves the area code
to the established `FLD/abc` topology without altering the source data.
## Pickup and availability bits

Native routine `0x00243708` scans indices `0..99` in table order. For each
record it calls `0x0023f750`, which tests the corresponding bit in the
availability words rooted at `0x018254c8`; a clear bit means that coin has
already been collected.

The routine then requires the current area code to match the record, computes
3D distance to the authored position, and compares it strictly against the
single-precision constant **1.4** at `0x002437ec`–`0x002437f8`. On pickup,
`0x00243808`–`0x00243848` clears that coin's availability bit before calling
`0x0023f4c8`.

`0x0023f4c8` popcounts the availability words. The native collected count used
by dialogue is therefore the fixed total `100` minus that available-bit count.
The browser recovered state stores collected indices, which is exactly the
complement needed to reproduce this state while remaining independent of
unrecovered memory-card layout.

## Coine opcode 0x1a

The pre-text dispatcher sends opcode `0x1a` to `0x0023caa8`. That handler calls
`0x0023f4c8`, subtracts the result from 100, and redirects through operand 1
when the collected count is **greater than or equal to operand 0**.

Coine's PAL entity in area 9 contains the complete ladder:

```text
[10,5] [20,8] [30,11] [40,14] [50,17]
[60,20] [70,23] [80,26] [90,29] [100,32]
```
Slot 32 is the 100-coin path and is additionally guarded by stamp 46; the
following completion text states that all ChoroQ coins in the world were
collected. The runtime opcode is now named `BranchIfChoroCoinCountAtLeast`.

The PAL item description for Coin Radar says it “Shows the ChoroQ coins on the
map.” That establishes the feature relationship but not the exact map marker
presentation, so no Radar UI is invented here.

## Browser implementation boundary

This checkpoint adds:

- executable-backed parsing of all 100 placement records;
- the established field-X reflection only when converting a placement into the
  browser driving coordinate frame;
- native index-order, same-field, strict `< 1.4` pickup semantics;
- collected-index progress and count in the shared recovered runtime state;
- backward-compatible schema-10 recovered persistence for collected indices;
- executable-backed dialogue branching for opcode `0x1a`;
- deterministic unit tests plus a PAL-only placement/Coine oracle;
- direct `SYS/COIN.BIN` decoding as a standalone HG2 object: one mesh section,
  three MSCALF-4 strips / 44 triangles, local radius about `1.00125`, and a
  64x64 PSMT4 image backed by a CT32 CLUT;
- visible uncollected coin instances at the executable-authored placements, with
  restored collected indices omitted as fields are loaded;
- live driving-loop pickup through the recovered strict 3D/table-order core, with
  the collected instance removed and the existing revision save path queued;
- `SYS/COIN.BIN` retained by browser imports, with cache schema 4 preventing an
  older cache that lacks the asset from being treated as current.

The coin mesh is intentionally static: PAL placement/model/texture are recovered,
but no native per-frame coin transform has been established. Pickup audiovisual
effects, exact Coin Radar marker presentation, and original memory-card
offsets/packing for the availability bits also remain deliberately absent.
