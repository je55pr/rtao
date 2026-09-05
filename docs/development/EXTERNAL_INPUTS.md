# External inputs deliberately not bundled

RTAO is a clean-room source repository. Large, copyrighted, machine-local or reproducible inputs are deliberately kept outside Git.

Useful inputs that may be supplied locally when needed include:

- a user-owned European PAL Road Trip Adventure game image (`BIN/CUE`, ISO, archive or extracted files supported by the relevant tool);
- the PAL `SLES_513.56` executable for opt-in native/oracle tests;
- an offline .NET SDK/toolchain when working in a restricted runtime;
- MonoGame/NVorbis `.nupkg` files when an offline C# reference restore is required;
- npm dependencies / a compatible `node_modules` cache when network package restore is unavailable;
- Chromium/Chrome plus Playwright for deterministic browser capture tooling.

The C# reference source itself is tracked directly under [`../../reference/csharp/`](../../reference/csharp/); no source ZIP is required for normal Git development.

When preserving an offline NuGet cache in a checkout, the historical repo-root `local-packages/` location remains supported by `reference/csharp/NuGet.Config` and is ignored by Git.

Never add original game assets, disc images, extracted proprietary data, credentials or secrets to the repository.
