# Road Trip Adventure browser port — mobile/chat handoff

Prepared 2026-08-29 for continuing development in a regular ChatGPT conversation.

## Read this first

This file is the current handoff and supersedes the older root-level `HANDOFF_NEXT_CHAT.md` and `RTA_NEXT_CHAT_HANDOFF_COLOR.md`. Those older files remain useful archaeology history, but their milestone/next-step sections are stale.

The project is a clean-room reimplementation of the PAL PS2 release of Road Trip Adventure / ChoroQ HG 2. The original C# solution remains intact as a behavioural and reverse-engineering reference. The active direction is the parallel browser-native implementation under `web/`, using TypeScript, Three.js, Vite and browser-local storage.

No original game image or extracted copyrighted assets are included in this handoff ZIP. The owner supplies their own game image at runtime.

## Current browser-port state

The web port currently supports:

- drag/drop or file-picker import of a cooked ISO, ZIP containing ISO, ZIP containing BIN+CUE, or direct BIN/CUE;
- fully local processing with no upload or server dependency;
- extraction and installation into Origin Private File System storage, restored on later loads without processing the source again;
- batched raw MODE2/2352 reads (one contiguous backing-file read instead of one OPFS read per sector);
- executable-derived selection of only the car bodies the current browser runtime needs;
- all 64 ordinary world fields rendered as one persistent Three.js world;
- X and Z toroidal world wrapping across the original staggered field topology;
- original field textures, vertex colours, STQ texture coordinates, alpha-tested materials, billboards, collision surfaces, roads and daytime SORA sky;
- a fixed-step playable Q62 with real body/tire data, wheel steering/spin, four-contact terrain attitude, chase camera and surface-dependent handling;
- 70 executable-derived outdoor residents with original body IDs, paints and 69 moving routes;
- non-blocking resident model streaming: the world/driving controls become usable before every traffic mesh is decoded, with Peach Town prioritised;
- 235 fixed interaction zones plus six Peach Town resident greetings from executable dialogue;
- Q's Factory entered from its real Peach Town trigger, with a reference-calibrated fixed camera, `SHOP/T00.BIN` backdrop/materials, original Q62/Q28 car meshes and the executable-defined menu/dialogue flow;
- Change Parts as a complete development-facing loop: 55 immediately available test items across all 14 original categories, live car/stat preview, Apply/Cancel semantics, provisional performance tuning and per-import OPFS persistence.

### Travel-friendly stabilisation added later on 2026-08-29

- The browser world's north/south wrap is explicitly documented and tested as an intentional quality-of-life extension. Do not revert it merely because the C# reference only proves east/west wrapping.
- Compiled-field cache version 4 suppresses renderer-equivalent repeated static triangles inside one exact HG2 chunk/material state, using the proven Fuji one-millimetre position / 1e-5 UV tolerance. Existing local installs rebuild field meshes once on next launch. The compiled package retains a per-field suppression count and startup logs every non-zero `FLD/NNN:count`, so the first ordinary real-disc run produces useful evidence without requiring a dedicated visual test.
- Three.js now submits global chunk-64 static backing geometry before local opaque detail, matching the proven Fuji facade/lattice ordering from the reference renderer.
- A deterministic visual-capture harness is available through `?capture=world`, `peach`, `fuji`, `white-mountain`, `papaya`, or `qfactory`. Captures are exact 1280x960 off-screen renders; outdoor capture mode omits nondeterministic traffic/player vehicles and skips their asynchronous model loads entirely, Q's Factory freezes its rotating platform at animation time 0, and the result page exposes the PNG SHA-256 plus links between scenes.
- The C# premultiplied-alpha edge fix was deliberately **not** copied blindly. Three.js r185 premultiplies fragment output when `Material.premultipliedAlpha` is enabled, so combining that with already-premultiplied texture bytes would double-darken partial alpha. Revisit the browser cutout-edge fix with visual captures rather than translating the C# implementation literally.

The most recent performance repair is important: raw BIN files previously issued an asynchronous storage read for every 2,352-byte sector, causing roughly ten seconds of delay per car. `web/src/disc/randomAccess.ts` now reads a contiguous raw span once and projects the 2,048-byte user-data sectors in memory. A clean-origin test using the real 285 MiB archive completed extraction, 64-field compilation and runtime-file caching in about 45 seconds total on the test machine; there was no per-car stall. All 70 residents attached in roughly six additional background seconds while driving was already enabled.

## Deliberately temporary systems

Do not mistake the following for decoded final-game behaviour:

- all development parts are currently available with no ownership, price or unlock rules;
- parts performance multipliers are provisional tuning;
- wheels, lights, wings, propellers/turbines, roof options and stickers use simple Three.js preview meshes rather than decoded original accessory assets;
- horn and meter choices persist but do not yet change audio or HUD rendering;
- driving remains intentionally arcade-like and can feel rubber-band-y;
- race selection, race runtime and Save Data remain explicit Q's Factory host-action boundaries;
- only Q's Factory has a completed SHOP composition; broader SHOP scenes should use original-game visual references rather than copying unfinished C# composers.

The future RPG layer should decide availability/ownership while continuing to consume the typed catalogue/loadout APIs in `web/src/game/parts.ts`. Avoid entangling unlock logic with the selector UI.

## Key TypeScript files

- `web/src/main.ts` — application composition, import lifecycle, world startup, interactions, Q's Factory session, Change Parts UI and persistence.
- `web/src/importer/importGame.ts` — atomic local install, runtime-file selection, field compilation and manifest publication.
- `web/src/importer/source.ts` — ISO/ZIP/BIN+CUE source handling.
- `web/src/disc/randomAccess.ts` — Blob/OPFS access and batched raw MODE2 projection.
- `web/src/storage/opfs.ts` — versioned OPFS contract.
- `web/src/formats/fieldGeometry.ts`, `fieldCollision.ts`, `gsTextures.ts` — browser-native format/geometry compilation.
- `web/src/formats/overworld.ts`, `dialogue.ts`, `shopInterior.ts` — executable residents/interactions/dialogue and SHOP decoding.
- `web/src/game/worldTopology.ts`, `worldCollision.ts`, `worldView.ts` — wrapped topology, collision and persistent rendering.
- `web/src/game/captureScenes.ts`, `capturePixels.ts`, `renderCapture.ts` — canonical capture catalogue, WebGL row normalization and exact-size PNG rendering.
- `web/src/sandboxCaptureRunner.ts`, `web/scripts/build-sandbox-capture.mjs` — single-file blank-page injected capture service used when browser URL navigation is policy-blocked; supports prepared outdoor sessions and real Q's Factory capture from disc data.
- `web/src/game/carView.ts`, `drivingGame.ts`, `worldSimulation.ts` — live cars, driving and traffic.
- `web/src/game/interiorView.ts`, `interiorFlow.ts` — Q's Factory scene and dialogue-to-host boundary.
- `web/src/game/parts.ts` — temporary test catalogue, typed loadouts, aggregate performance/appearance and save migration.
- `web/src/styles.css` — app, dialogue, factory and parts-selector presentation.
- `docs/WEB_PORT.md` — detailed architecture, storage contract, supported input and current validation evidence.

## C# reference projects

- `src/Rta.Disc` — BIN/CUE, ISO and directory access.
- `src/Rta.Formats` — engine-neutral binary decoding.
- `src/Rta.Tools` — archaeology/inspection utilities.
- `src/Rta.Game` — MonoGame reference runtime.
- `tests/Rta.Tests` — dependency-free C# regression runner.

Keep these projects intact until the browser implementation has genuine parity. Port proven behaviour or format evidence where helpful, but do not translate temporary C# solutions line-for-line.

## Validation at handoff

The last fully dependency-backed validation in the original handoff passed:

```text
web: 16 test files, 39 tests passed
web: strict TypeScript compilation passed
web: Vite production build passed
C#: RoadTripAdventure.slnx build passed with 0 warnings and 0 errors
```

The travel-friendly stabilisation plus sandbox capture work now raises the web suite to **18 test files / 50 tests**. With the supplied offline Node dependency tree and Linux native bindings, `npm run check` has now been run successfully in the ChatGPT sandbox: all 50 tests pass, strict TypeScript compilation passes, and the Vite production build passes. A separate injected-browser capture bundle also builds successfully with `npm run build:capture`, which is now included in `npm run check`. Real PAL BIN/CUE validation produced byte-identical repeated captures for Peach Town (`d9ae535434acf083c78c8766df6209a642922bd61aabeefc4a2cd8f5a690409d`) and Q's Factory (`205cb32d1709617dd4a950d9358f09f592399aef6981895b97950321b801867a`).

Commands:

```bash
cd web
npm install
npm run check

cd ..
dotnet build RoadTripAdventure.slnx --no-restore
```

The `local-packages/` folder is included so the MonoGame reference has its previously captured package source available. Generated `node_modules`, `dist`, `bin`, `obj`, test output, emulator captures and the original game ZIP are intentionally excluded.

## Sensible next slices

Good next vertical slices, roughly in priority order:

1. Replace the temporary parts inventory with decoded ownership/prices/unlocks and original accessory assets while retaining the current selector/loadout boundary.
2. Implement Q's Factory race selection and a small playable race loop.
3. Add browser-native save/profile state beyond the development parts file.
4. Reduce world/collision package startup time with progressive or interest-region loading; the car bottleneck is fixed, but all 64 field/collision packages are still opened before driving is enabled.
5. Port night vertex colours, the decoded SORA night layer and time-of-day transitions.
6. Generalise SHOP interiors one scene at a time using online/original-game visual references.
7. Add original UI, audio and remaining gameplay systems.

When continuing, make sensible in-scope choices, implement and test rather than waiting for design approval. Preserve the local-only asset boundary and keep the C# reference untouched unless the task specifically concerns it.

## Travel-mode development priority

Until the owner says hands-on PC playtesting is available, prefer work that can be closed with automated tests, decoded-data evidence or deterministic captures. Keep a small explicit deferred playtest queue instead of blocking on driving feel.

Good immediate slices are:

1. Extend the now-working real-disc capture service with additional comparison poses tied to original-game screenshots as those references are revisited; Peach already has a pinned town camera and Q's Factory is captured directly from disc data.
2. Continue porting recent C# archaeology regressions into synthetic TypeScript fixtures where possible (five-register material state, GS alias/CSM1/STQ cases, day-black/night-lit classification) without requiring original assets in the repository.
3. Use captures to finish the Three.js-specific transparent-edge treatment rather than copying MonoGame alpha state literally.
4. Continue Q's Factory and additional SHOP/interior composition because fixed-camera scenes can be judged from screenshots rather than controller feel.
5. Port night vertex colours/SORA night state and palm-crown structure/animation in deterministic visual slices.

Defer controller tuning, collision feel and other subjective movement work until human playtesting is explicitly available.
