---
name: Parity bug
about: Report a deterministic PAL/RTAO behavior difference
title: ''
labels: ''
assignees: ''
---

## PAL observation

<!-- What does the PAL game/executable demonstrably do? -->

## RTAO observation

<!-- What does the current implementation do instead? -->

## Reproduction

- Relevant field/course/interior/system:
- Deterministic seed/case, if applicable:
- Capture/test command:

## Evidence

- PAL/native addresses or routines:
- Trace/oracle/capture files:

## Suspected boundary

<!-- State the narrowest known implementation area. Do not guess missing native behavior. -->

## Exit criteria

- [ ] Difference reproduced deterministically where practical
- [ ] Fix is evidence-backed
- [ ] Regression test/capture added
- [ ] `cd rtao && npm run check` passes
- [ ] PAL-backed validation passes when required and available
