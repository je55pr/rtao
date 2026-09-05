# Road Trip Adventure Online (RTAO)

Clean-room browser reimplementation of the European PS2 release of **Road Trip Adventure / ChoroQ HG 2**.

The GitLab repository is the canonical development source. The project intentionally contains **no original game assets**; supply your own PAL BIN/CUE, cooked ISO, or extracted disc data at runtime.

## Repository map

| Path | Purpose |
| --- | --- |
| [`rtao/`](rtao/) | **Active implementation** — Three.js + TypeScript browser game, tests and capture bundle |
| [`tools/`](tools/) | Maintained archaeology, deterministic capture and evidence-generation utilities |
| [`docs/`](docs/) | Architecture, archaeology notes, evidence and archived historical material |
| [`reference/csharp/`](reference/csharp/) | Earlier C#/MonoGame implementation retained as reference/archaeology, not the active product |
| [`RTA_CURRENT_STATE.md`](RTA_CURRENT_STATE.md) | Concise human-readable current evidence boundary |
| [`RTA_STATE.json`](RTA_STATE.json) | Concise machine-readable current state |
| [`AGENTS.md`](AGENTS.md) | Shared working conventions for ChatGPT, Claude and future contributors |

## Quick start

```bash
cd rtao
npm install
npm run dev
```

Run the browser regression/build gate with:

```bash
cd rtao
npm run check
```

PAL-backed tests additionally use locally supplied original-game inputs through environment variables such as `RTA_PAL_EXECUTABLE`, `RTA_PAL_BIN`, and `RTA_GAME_DIR`. Original game data must never be committed.

## Current development focus

Races are the current priority. Native course collision queries are verified; the next evidence-gated work is the seven-probe contact producer around `0x0021C280` and the native orientation/VU transform helpers around `0x002086C0` / `0x00208738`. The first playable Peach Raceway should only be connected after those native paths are closed and verified.

For the concise current status, see [`docs/STATUS.md`](docs/STATUS.md). For architecture, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). For the full current task/evidence boundary, see [`RTA_CURRENT_STATE.md`](RTA_CURRENT_STATE.md).

## Clean-room boundary

PAL executable/data supplied by the developer is the behavioral authority. Implementation is written independently from observed formats and behavior. Do not invent missing native behavior to make a feature convenient; keep unknowns explicitly evidence-gated until they are recovered.
