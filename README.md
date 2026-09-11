# Road Trip Adventure Online (RTAO)

Clean-room browser reimplementation of the European PS2 release of **Road Trip Adventure / ChoroQ HG 2**.

**Play the latest public build:** https://je55pr.github.io/rtao/

**DEV player** (built from the `dev` integration branch, expect rough edges): https://je55pr.github.io/rtao/dev/

Both are published from the same Pages site and are republished together whenever either branch is pushed. They keep separate browser storage, so importing your disc into one does not install it for the other.

The GitHub repository is the canonical development source. The project intentionally contains **no original game assets**; the hosted game shell likewise contains none. Supply your own PAL BIN/CUE, cooked ISO, or extracted disc data at runtime.

## Repository map

| Path | Purpose |
| --- | --- |
| [`rtao/`](rtao/) | **Active implementation** — Three.js + TypeScript browser game, tests and capture bundle |
| [`tools/`](tools/) | Maintained archaeology, deterministic capture and evidence-generation utilities |
| [`docs/`](docs/) | Architecture, archaeology notes, evidence and archived historical material |
| [`reference/csharp/`](reference/csharp/) | Earlier C#/MonoGame implementation retained as reference/archaeology, not the active product |
| [`docs/STATUS.md`](docs/STATUS.md) | Concise current implementation/evidence boundary |
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

Races are the current priority. The ordinary vehicle frame now composes movement, ground/obstacle contact, orientation and collision response, matching 1,800 retained PAL updates across three original courses. The next milestone is the supported playable Peach Raceway session, followed by Q's Factory launch and finish-to-Cake integration. Reset/debug and special equipment paths remain gated; see [`docs/PAL_NATIVE_RACE_FRAME_2026-09-05.md`](docs/PAL_NATIVE_RACE_FRAME_2026-09-05.md).

For the concise current boundary, see [`docs/STATUS.md`](docs/STATUS.md). For architecture, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Actionable work is tracked in GitHub issues.

## Clean-room boundary

PAL executable/data supplied by the developer is the behavioral authority. Implementation is written independently from observed formats and behavior. Do not invent missing native behavior to make a feature convenient; keep unknowns explicitly evidence-gated until they are recovered.
