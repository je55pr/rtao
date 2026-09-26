# RTAO install and runtime data pipeline

This note records the v0.4 PAL data-pipeline boundary and optimizations that are safe without weakening recovered native semantics.

## Runtime contract

The PAL disc is compiler input. Installed runtime data lives in OPFS under a versioned import manifest. Render meshes and broad-phase collision are install-time derived artifacts. Raw PAL field/course bytes are deliberately retained where native runtime code still consumes structures that are not represented by those derived caches.

Do not delete raw `FLD/*.BIN` solely because `compiled/field-*.mesh` and `compiled/collision-*.bin` exist. Ordinary outdoor runtime still uses the raw field for native contact/obstacle semantics and dynamic-object extraction. That is an archaeology boundary, not accidental duplication.

## Measured path changes

- SHOP interiors: runtime reads exactly one `0x3f000`-byte (258,048-byte) slot from `SHOP/Txx.BIN` instead of materializing the whole package. First and repeated entries use OPFS Blob slicing.
- Outdoor field load: the raw FLD is read once per field load transaction and the same bytes are reused for native field registration and dynamic-object extraction. This removed the previous immediate second whole-FLD read.
- Ordinary world residency: traversal is bounded to the topology-defined nearby 3x3 ring, at most 9 fields away from map edges. Eviction disposes field geometry/materials/textures, compiled/native collision and obstacle state, dynamic animation registrations, and resident models/actors. Explicit capture/debug whole-world loading remains separate.
- Immutable installed assets: TIRE/WHEEL/car body source bytes are reused rather than reread for repeated interiors, residents, races, and captures. The byte cache is a 16-entry LRU and is cleared on install replacement, so long traversal cannot retain every encountered car source indefinitely.
- Native sound startup: `SOUND/CQ_MAIN.TVB` is shared between SFX and engine-audio construction, reducing that bank from two OPFS reads to one per active install. Ordinary radio startup now reads/retains only the recovered default 3CH stereo pair; the dormant 1CH pair is loaded once only if native state 1 is selected.

## Install footprint accounting

`ImportManifest.totalBytes` remains the retained source-file byte count for compatibility. New manifests additionally report `derivedBytes` for serialized mesh/collision artifacts and `installedBytes = totalBytes + derivedBytes`.

Initial preflight still checks all selected source bytes because future compiled sizes are unknown until compilation. Once each mesh/collision pair is serialized in memory, the importer re-checks quota for the remaining uncached source bytes plus that newly known derived pair before writing it. This turns derived-cache exhaustion into a deliberate headroom failure rather than relying on an incidental OPFS write failure.

## Remaining large-data work

The importer compiles predictor checkpoints for each 1CH/3CH VAG at 2,048-frame intervals and accounts for those indexes as derived bytes. `RadioRangeDecoder` uses those checkpoints to reproduce arbitrary PCM clips exactly while reading only the bounded compressed frame span from persistent OPFS `BlobSource`s. The active 3CH scheduler now consumes that asynchronous stereo range source with generation-based cancellation, so stop/reset/state changes cannot enqueue stale decoded clips. Installs without checkpoint artifacts fall back to the prior whole-file cursor; dormant 1CH remains lazy and currently uses that compatibility path when selected. ZIP imports also still require temporary expansion of the contained disc image before ISO extraction; direct ISO/BIN imports already use random-access sources.
