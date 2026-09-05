# ADR 0001 — PAL executable/data is the behavioral authority

**Status:** Accepted  
**Date:** 2026-09-05

## Decision

For behavior intended to reproduce Road Trip Adventure, the European PAL executable and locally supplied PAL game data are authoritative.

RTAO implements native behavior only when supported by executable/data evidence, deterministic PAL comparison, direct game observation, or another explicitly documented evidence source.

Unknown native behavior stays unknown. Plausible or convenient behavior must not be presented as recovered native behavior.

## Consequences

- Archaeology and implementation should cite relevant addresses, structures, traces, captures, or oracle cases where practical.
- PAL-backed validation is separate from copyright-safe hosted CI because original game inputs remain local.
- Browser convenience code may exist for tooling/development, but it must not silently redefine native gameplay semantics.
- When evidence conflicts with an older RTAO implementation, the evidence wins and the implementation should be corrected.
