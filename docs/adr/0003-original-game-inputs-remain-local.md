# ADR 0003 — Original game inputs remain local

**Status:** Accepted  
**Date:** 2026-09-05

## Decision

RTAO does not distribute or commit original Road Trip Adventure game data, disc images, extracted proprietary assets, or executable bytes.

Users/developers supply their own PAL game inputs locally. Hosted GitLab CI runs only tests/builds that do not require those copyrighted inputs.

PAL-backed oracle suites may run in trusted local environments or a future self-managed runner where the original inputs never become repository content or hosted CI artifacts.

## Consequences

- `.iso`, `.bin`, `.cue`, archives and extracted original assets remain excluded from version control.
- Deterministic derived fixtures may be committed only when they are lawful, minimal, and intentionally retained as project test/evidence data.
- MR descriptions must state when PAL validation could not be run rather than implying hosted CI proves native parity.
