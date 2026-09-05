# ADR 0004 — Separate structural refactors from behavior changes

**Status:** Accepted  
**Date:** 2026-09-05

## Decision

Large structural refactors and PAL-backed behavior changes should normally be separate merge requests.

A refactor MR should preserve behavior and use existing tests/captures to demonstrate that preservation. A behavior MR should focus on the recovered behavior and its evidence rather than carrying unrelated architectural churn.

## Consequences

- Cross-agent review is easier because reviewers can distinguish architecture risk from parity risk.
- Regressions are easier to bisect and revert.
- The planned decomposition of `rtao/src/main.ts` should proceed as multiple small behavior-neutral extraction MRs.
- Exceptions are allowed only when separation would materially increase risk or duplicate work, and the MR should explain why.
