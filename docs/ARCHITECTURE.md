# RTAO architecture

## Active runtime

`rtao/` is the active browser implementation. It uses TypeScript, Three.js, Vite and browser-local storage/import paths.

The key architectural boundary is clean-room and data-driven: original PAL game data is supplied locally by the developer at runtime and is never stored in the repository.

## Major layers

- `rtao/src/disc/` — ISO/BIN/CUE and random-access source handling.
- `rtao/src/importer/` — local import/install workflow and browser worker boundary.
- `rtao/src/formats/` — engine-neutral decoding of HG2/PS2 formats and executable-derived tables.
- `rtao/src/game/` — simulation, progression, renderer composition and native-behavior translations.
- `rtao/src/storage/` — browser persistence/OPFS contract.
- `rtao/tests/` + `rtao/test-support/` — PAL-backed/native scalar oracle tests.
- `rtao/src/sandboxCaptureRunner.ts` + `rtao/scripts/build-sandbox-capture.mjs` — deterministic blank-page capture/evidence bundle.

## Behavior and evidence

PAL executable/data is the behavioral authority. Native translations should remain narrow and testable; uncertainty stays explicit rather than being hidden behind plausible tuning.

Primary supporting material:

- `docs/STATUS.md` — concise current implementation/evidence boundary;
- GitHub issues — actionable work and task status;
- `docs/archaeology/` — interpreted subsystem notes;
- `docs/evidence/` — retained traces, oracles, deterministic captures and logs.

## Reference implementation

`reference/csharp/` contains the earlier C#/MonoGame implementation. It remains useful for archaeology and format comparisons, but it is not a co-equal product target and must not silently override PAL evidence.

## Generated/local data

Build output, captures, local caches and supplied game data stay outside tracked source unless a specific deterministic artifact is deliberately retained under `docs/evidence/`.

The pre-restructure detailed browser-port architecture document is preserved at `docs/archive/WEB_PORT_PRE_RTAO_LAYOUT_2026-09-05.md` for historical context.
