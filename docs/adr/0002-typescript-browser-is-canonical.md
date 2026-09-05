# ADR 0002 — TypeScript browser implementation is canonical

**Status:** Accepted  
**Date:** 2026-09-05

## Decision

The active product is the TypeScript / Three.js implementation under `rtao/`.

The C#/MonoGame tree under `reference/csharp/` is retained for archaeology, historical comparison, and recovered knowledge. It is not a second production implementation and should not receive mirrored feature work by default.

## Consequences

- New player-facing implementation work targets `rtao/` unless a task explicitly concerns C# archaeology/reference behavior.
- C# observations can inform evidence work but do not override PAL authority.
- Build/test health for the browser implementation is the normal hosted CI gate.
- We avoid maintaining two active products or requiring every feature change to be duplicated across languages.
