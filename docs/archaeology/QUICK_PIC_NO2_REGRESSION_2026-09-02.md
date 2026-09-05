# Peach Quick-Pic No.2 regression — 2026-09-02

## Result

Peach Town Quick-Pic No.2 is now a second complete executable-defined booth
regression using the existing data-generic Quick-Pic implementation. This
validates that No.1 was not accidentally hard-coded.

- Fixed interaction: area 1, local slot 19.
- Dialogue entity: `Quick-Pic Shop No.2`.
- Six decoded variants and four action shapes.
- Greeting host boundary: `0x02 [0,81]`, narrowly bridged to question slot 02.
- Untaken state remains in slot 02; persisted photo 2 branches to the authored
  retake prompt in slot 03.
- Taking the picture reaches `0x11 [2,6]`; applying it stores Quick-Pic bit 2
  and preserves the original slot-06 return edge.

The deterministic 1280x960 SwiftShader capture was produced twice
byte-for-byte:

- Size: 1,942,698 bytes.
- SHA-256: `026e56ec5da3f388206c6362eab912ae582226a3faf6efb68dbe2dae39dff8a9`.
- The hash equals Peach No.1 because these adjacent booths use the same fixed
  room composition, staff/player definitions and camera; the independent
  dialogue entity and photo-number state are what this regression distinguishes.

Visual inspection passed: the colourful authored booth room, checker floor,
camera machine, staff car and player car are all visible and textured; the
camera is coherent and there is no blank or catastrophic rendering failure.

## Chrome scratch limitation

Chrome 151 itself is healthy, but the Work scratch persistence layer truncated
the 196,975,952-byte `chrome-headless-shell` ELF to 173,932,544 bytes between
commands. The truncated executable had invalid dynamic/section offsets and
segfaulted immediately. Extracting the supplied archive under `/tmp` preserved
the complete executable and restored direct and Playwright launches. Future
Work captures should keep this large browser binary in `/tmp` (or another
non-persisted temporary path) while source and results remain in scratch.

## Validation

- Unit suite after the added generic-booth and zero-target regressions:
  28 files / 130 tests passed.
- Production Vite build passed.
- Sandbox capture bundle build passed.
- Targeted Quick-Pic No.2 dialogue/state/capture regression passed.

The exact PS2 photo-screen framing/effects remain intentionally unrecovered;
this tranche changes no rendering semantics.
