# ADR 0002 — TypeScript browser implementation is canonical

**Status:** Accepted  
**Date:** 2026-09-05

## Decision

The active product is the TypeScript / Three.js implementation under `rtao/`.

The former C#/MonoGame implementation has been retired from the live source tree after reusable tooling and unique PAL evidence were preserved in maintained browser/tests/docs/tooling surfaces. Historical records remain under `docs/archive/`, but there is no second implementation target.

## Consequences

- All maintained implementation work targets `rtao/`.
- Preserved historical observations can inform evidence work but do not override PAL authority.
- Build/test health for the browser implementation is the normal hosted CI gate.
- Reusable archaeology utilities belong in `tools/`; historical records belong under `docs/archive/` rather than a second source implementation.
