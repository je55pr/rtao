## Summary

<!-- What changed, and why? Keep this focused on the behavior or maintenance goal. -->

## Author / environment

- Primary author: <!-- ChatGPT / Codex / Claude / human -->
- Working environment: <!-- normal ChatGPT connector / Codex / local checkout / other -->

## Evidence boundary

<!-- For native/gameplay behavior, identify the PAL evidence that permits this change. For pure maintenance/refactors, say "No gameplay behavior change". -->

- PAL/native addresses or routines:
- Evidence / archaeology files:
- Known unknowns intentionally left gated:

## Validation

- [ ] `cd rtao && npm run check`
- [ ] PAL-backed validation run when required and available
- [ ] Visual/deterministic capture checked when the change is visual
- [ ] I have not claimed a validation step passed unless it actually ran

PAL validation command(s), environment, and result:

<!-- e.g. RTA_PAL_EXECUTABLE=... npm run test:pal -->

## Review focus

<!-- What should an independent reviewer scrutinise most carefully? -->

## Project state

- [ ] Relevant current-state/evidence docs updated if the evidence boundary changed
- [ ] No original game data, extracted proprietary assets, credentials, tokens, or secrets added
- [ ] Refactor-only changes avoid unrelated gameplay behavior changes
- [ ] Behavior changes avoid unrelated architectural churn
