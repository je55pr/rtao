# RTAO install and runtime data pipeline

This note records the v0.4 PAL data-pipeline boundary and optimizations that are safe without weakening recovered native semantics.

## Runtime contract

The PAL disc is compiler input. Installed runtime data lives in OPFS under a versioned import manifest. Render meshes and broad-phase collision are install-time derived artifacts. Raw PAL field/course bytes are deliberately retained where native runtime code still consumes structures that are not represented by those derived caches.

Do not delete raw `FLD/*.BIN` solely because `compiled/field-*.mesh` and `compiled/collision-*.bin` exist. Ordinary outdoor runtime still uses the raw field for native contact/obstacle semantics and dynamic-object extraction. That is an archaeology boundary, not accidental duplication.

## Measured path changes

- SHOP interiors: runtime reads exactly one `0x3f000`-byte (258,048-byte) slot from `SHOP/Txx.BIN` instead of materializing the whole package. First and repeated entries use OPFS Blob slicing.
- Outdoor field load: the raw FLD is read once per field load transaction and the same bytes are reused for native field registration and dynamic-object extraction. This removed the previous immediate second whole-FLD read.
- Decoded outdoor assets now use a 12-entry runtime LRU containing the compiled mesh, compiled collision and retained raw FLD bytes. The live renderer/collision world still owns only the topology-defined nearby 3x3 ring, at most 9 fields, but a short backtrack can rebuild Three.js/DrivingWorld ownership from decoded assets instead of rereading and deserializing OPFS data. Fast startup also shares that same decoded record across initial mesh, collision and dynamic-object setup. The cache is cleared when the active install changes; F3 exposes retained-entry and hit/miss counters.
- Ordinary world residency: traversal is bounded to the topology-defined nearby 3x3 ring, at most 9 fields away from map edges. Eviction disposes field geometry/materials/textures, compiled/native collision and obstacle state, dynamic animation registrations, and resident models/actors. Explicit capture/debug whole-world loading remains separate.
- Immutable installed assets: TIRE/WHEEL/car body source bytes are reused rather than reread for repeated interiors, residents, races, and captures. The byte cache is a 16-entry LRU and is cleared on install replacement, so long traversal cannot retain every encountered car source indefinitely.
- Native sound startup: `SOUND/CQ_MAIN.TVB` is shared between SFX and engine-audio construction, reducing that bank from two OPFS reads to one per active install. On checkpoint-capable installs, ordinary radio startup opens the default 3CH pair as OPFS-backed sources rather than retaining either complete VAG; 1CH remains unopened until native state 1 is selected.

## Install footprint accounting

`ImportManifest.totalBytes` remains the retained source-file byte count for compatibility. New manifests additionally report `derivedBytes` for serialized mesh/collision artifacts and `installedBytes = totalBytes + derivedBytes`.

Initial preflight still checks all selected source bytes because future compiled sizes are unknown until compilation. Once each mesh/collision pair is serialized in memory, the importer re-checks quota for the remaining uncached source bytes plus that newly known derived pair before writing it. This turns derived-cache exhaustion into a deliberate headroom failure rather than relying on an incidental OPFS write failure.

## Remaining large-data work

ZIP imports now distinguish stored from compressed disc entries. A method-0 ISO/BIN is projected directly from its local-entry byte range in the user's ZIP Blob, eliminating the full temporary OPFS disc copy and its extraction pass; DEFLATE entries retain the temporary extraction path because arbitrary ISO sector reads cannot seek independently through a deflate stream without an index. BGM.TVB remains intentionally whole-bank for now: the native sequencer performs synchronous arbitrary tone key-ons, so an async range source requires program-level tone prefetch rather than a timing-changing read inside key-on. `collectReachableTsqToneSlots` now walks each deterministic channel control-flow graph, follows unconditional jumps, terminates loops on revisited program counters, and returns the exact unique tone slots reachable by a program. That provides the evidence boundary for a later header-plus-needed-spans range source without guessing tone usage.

The importer compiles predictor checkpoints for each 1CH/3CH VAG at 2,048-frame intervals and accounts for those indexes as derived bytes. `RadioRangeDecoder` uses those checkpoints to reproduce arbitrary PCM clips exactly while reading only the bounded compressed frame span from persistent OPFS `BlobSource`s. Both 3CH and lazily opened 1CH now use asynchronous stereo range sources, with generation-based cancellation so stop/reset/state changes cannot enqueue stale decoded clips. Installs without checkpoint artifacts fall back to the prior whole-file default 3CH cursor. With the 6,000-sample scheduler chunk, a cold arbitrary seek replays at most 2,047 predictor frames plus 216 clip frames: at 16 encoded bytes/frame that is at most 36,208 encoded bytes per channel (72,416 bytes stereo) for the first chunk, versus materializing the complete stereo VAG pair; sequential chunks normally require only the clip frames after predictor state is warm in a future window-cache refinement. Compressed ZIP disc entries still require temporary expansion before ISO extraction; direct ISO/BIN inputs and stored ZIP disc entries use random-access Blob sources.

## Visibility-mode performance note

The earlier observation that Unlimited can outperform Extended is plausible in the current renderer and should not be treated as an LOD paradox. Extended enables the ordinary-field atmosphere shader's per-fragment sRGB conversions and fog/alpha composition, and its CPU path evaluates per-batch distance culling every rendered frame. Unlimited disables the atmosphere-distance uniform and takes the early no-distance path. It can therefore submit more distant geometry while doing less work per submitted field/batch. This is a code-path explanation, not a claim that Unlimited is always faster on every GPU; profile the actual renderer before changing visibility defaults or residency policy.
