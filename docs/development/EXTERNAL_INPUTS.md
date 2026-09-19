# External inputs deliberately not bundled

RTAO is a clean-room source repository. Large, copyrighted, machine-local or reproducible inputs are deliberately kept outside Git.

Useful inputs that may be supplied locally when needed include:

- a user-owned European PAL Road Trip Adventure game image (`BIN/CUE`, ISO, archive or extracted files supported by the relevant tool);
- the PAL `SLES_513.56` executable for opt-in native/oracle tests;
- npm dependencies / a compatible `node_modules` cache when network package restore is unavailable;
- Chromium/Chrome plus Playwright for deterministic browser capture tooling.

The maintained project has no C#/MonoGame build dependency. Historical .NET/NuGet references may still appear inside `docs/archive/` records from the retired implementation, but they are not current setup requirements.

Never add original game assets, disc images, extracted proprietary data, credentials or secrets to the repository.
