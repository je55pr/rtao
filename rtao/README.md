# Road Trip Adventure Online (RTAO)

This directory is the **active Three.js + TypeScript implementation** of RTAO.

The earlier C#/MonoGame reconstruction is retained separately under `../reference/csharp/` for archaeology and comparison; new player-facing work should normally happen here.

## Development

```bash
npm install
npm run dev
```

Run the standard browser regression/build gate with:

```bash
npm run check
```

`npm run check` runs Vitest, strict TypeScript/build validation, and the deterministic sandbox capture bundle build.

## Game data

Open the local URL shown by Vite and choose a PAL Road Trip Adventure ISO/ZIP or PAL BIN/CUE input supported by the importer. Game data is processed locally in the browser and is not part of this repository.

Original game data, extracted proprietary assets and derived caches must never be committed.

## Deterministic capture / archaeology helpers

Reusable repository-level utilities live in [`../tools/`](../tools/). Build the browser capture bundle first when a helper requires it:

```bash
npm run build:capture
```

Examples from the repository root:

```bash
python3 tools/executable_probe.py ADDRESS LENGTH OUTPUT.bin
python3 tools/dialogue_trace.py OUTPUT.json AREA:SLOT
python3 tools/race_course_probe.py OUTPUT.json
python3 tools/shop_room_capture.py AREA SLOT OUTPUT.png
python3 tools/shop_readiness.py OUTPUT.json --markdown OUTPUT.md
python3 tools/shop_regression.py OUTPUT_DIR
python3 tools/sandbox_fixture.py refresh 223 113 220
```

PAL/browser capture tools commonly use `RTA_GAME_DIR` and `RTA_CHROMIUM_EXECUTABLE` environment variables.

## Architecture and evidence boundary

- Current development status: [`../docs/STATUS.md`](../docs/STATUS.md)
- Current state: [`../RTA_CURRENT_STATE.md`](../RTA_CURRENT_STATE.md)
- Architecture: [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)
- Archaeology notes: [`../docs/archaeology/`](../docs/archaeology/)
- Primary retained evidence: [`../docs/evidence/`](../docs/evidence/)
- Shared agent/contributor rules: [`../AGENTS.md`](../AGENTS.md)

The PAL executable/data is the authority for native behavior. Missing behavior stays evidence-gated rather than being guessed.
