# Useful supplied inputs — updated 2026-08-31

## Bundled here

### Three.js/TypeScript source baseline
The **root of this ZIP** is the complete clean source extracted from:

`RTA_ThreeJS_night_work_snapshot_2026-08-30.zip`

It includes the web port, C# source/tests/tools, deterministic capture runner, night-lighting files present at snapshot time, docs, and archaeology notes.

### `reference/RoadTripAdventureMonoGame-interiors.zip`
Useful earlier MonoGame/C# archaeology/reference source containing disc readers, PAL identity helpers, VIF/DMA/GIF/GS parsers, ELF tools, SHOP decoding, overworld/dialogue code and regression tests.

It is reference material, not the canonical Three.js source.

## Available separately to the user / current project environment

- `Road Trip Adventure (Europe) (En,Fr,De).7z` — original PAL game data for real-disc captures/archaeology. Do not bundle into project deliverables.
- `dotnet-sdk-10.0.400-linux-x64.tar.gz` — offline .NET SDK used for archaeology tooling.
- MonoGame/NVorbis `.nupkg` files — offline dependencies for the C# reference project.
- Node dependency/native-binding archives used by the browser build environment.

Do not ask the user to re-upload these unless they are genuinely unavailable in the next runtime.

## Historical File Library fallbacks

If a reconstruction detail is missing, useful historical artifacts include:

- `RTA_TS_capture_runner_cumulative.patch`
- `RTA_TS_stabilisation_capture_harness.patch`
- MonoGame renderer archaeology patches such as `RoadTripAdventureMonoGame-daylight-alpha-fix.patch`
