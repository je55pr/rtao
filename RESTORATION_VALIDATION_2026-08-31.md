# Restoration validation — 2026-08-31

## Completed

- Reconstructed proven Aug-31 source changes onto recovered Aug-30 snapshot.
- `Rta.Tools` Release build: 0 warnings / 0 errors.
- PAL world TEX0 census: 423,182 primitives; all TFX=0 / TCC=1.
- Pure TypeScript field-lighting assertions passed.
- Compiled field cache v7 round-trip assertion passed.
- Syntax-only transpilation: 59/59 `web/src/**/*.ts` files, 0 syntax errors.

## JavaScript environment validation

The offline npm dependency tree has now been restored and the pending browser-side validation was completed successfully:

```bash
cd web
npm run check
```

Result:

- **21/21** Vitest files passed
- **61/61** tests passed
- production `vite build` passed
- sandbox `npm run build:capture` passed

Additional cleanup completed during this validation pass:

- split a direct-file-only importer into `web/src/importer/directSource.ts` for the sandbox capture bundle;
- `sandboxCaptureRunner.ts` now uses the documented direct ISO/BIN/CUE workflow instead of pulling in ZIP/OPFS import code unnecessarily;
- removed the prior `@zip.js/zip.js` `import.meta` warning from the capture build;
- reduced `sandbox-dist/rta-sandbox-capture.js` from ~1.63 MB to ~1.41 MB (gzip ~353 KB to ~287 KB).

Still pending once a usable PAL BIN/CUE or ISO is available in this sandbox: run deterministic PAL captures for:

- Peach day / night Original / night Extended;
- Fuji day / night Original / night Extended;
- bridge day / night;
- Q's Factory.

## Remaining sandbox limitation

- The supplied PAL game image is currently present only as `.7z`. The sandbox has no 7-Zip extractor available, so real-disc Chromium capture regeneration is still blocked until the image is extracted to `.cue` + `.bin` (or converted/supplied as `.iso`).

## Deliberately not promoted

The exact PS2 GS byte-space `/128` MODULATE shader experiment remains outside the normal renderer. It was valuable negative evidence but produced a dramatically over-bright scene, indicating another missing compositing/render stage. Preserve TFX/TCC state and resume the experiment only as archaeology, not as a visual tuning shortcut.


## Post-checkpoint source changes now included

- Added corrected no-double-scale GS colour-domain helpers/tests (`fieldGsColor.ts`).
- Updated `worldView.ts` textured MODULATE and untextured direct-GS colour paths.
- Extended C# census to distinguish textured vs untextured field primitives; latest known counts are 418,115 textured and 5,067 TME=0.
- The pending npm/Vite/Vitest validation is now complete; only real-disc Chromium image comparisons remain once a usable PAL BIN/CUE or ISO is available in the sandbox.
