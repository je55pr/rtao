# RTAO shared agent conventions

This repository is a shared development surface for human contributors and coding agents, currently including ChatGPT, Codex and Claude.

## Canonical source and ownership

- GitHub `main` is the canonical project state.
- The active game is **`rtao/`** (Three.js / TypeScript).
- **`reference/csharp/`** is the earlier C#/MonoGame implementation retained for archaeology and comparison. Do not treat it as the active product unless a task explicitly targets it.
- `RTA_CURRENT_STATE.md` is the concise human-readable current evidence boundary.
- `RTA_STATE.json` is the concise machine-readable current state.
- The final pre-GitLab state blobs are preserved verbatim under `docs/archive/state/` for historical lookup; do not use them as current instructions.
- `docs/development/DEFINITION_OF_DONE.md` defines the minimum completion bar for maintenance and PAL-backed behavior work.

## Evidence rule

The PAL executable and supplied PAL game data are authoritative for native behavior.

- Implement only evidence-backed behavior.
- Do not fill unknown native behavior with plausible guesses.
- Keep unresolved behavior explicitly gated and documented.
- Preserve cited traces/oracles/evidence unless deterministic regeneration exists and the replacement has been verified.
- Never commit original copyrighted game data, disc images, extracted proprietary assets, credentials, tokens, or other secrets.

## Branches and ownership

Every agent-authored task branch must identify the environment actually doing the work:

- `chatgpt/<task>` — work performed directly by ChatGPT in a normal ChatGPT conversation/session.
- `codex/<task>` — work performed by a Codex coding agent/session.
- `claude/<task>` — work performed by Claude.

Do not create generic agent branches such as `feature/...`, `fix/...`, `work/...` or an unprefixed task name. The prefix describes **who is making the commits at that moment**, not who requested the work or which model family may exist underneath the product.

Keep a branch's original ownership prefix for its lifetime. If another agent needs to make substantial changes rather than merely review it, that agent should normally branch from the relevant commit using its own prefix instead of silently taking ownership of the existing branch.

Before starting work, inspect open branches/PRs relevant to the same subsystem. One branch should have one primary owner. Do not independently modify the same subsystem on multiple active branches unless the overlap is deliberate and communicated.

Normal development targets a task branch and pull request rather than direct commits to `main`. Keep commits small and coherent enough to review and revert independently.

## Reviews and pull requests

Use `.github/pull_request_template.md` for normal PRs.

For cross-agent review:

- the author owns the source branch;
- the reviewer inspects the actual diff, tests and evidence independently rather than trusting the PR summary;
- reviewers should leave comments/suggestions rather than silently rewriting the author's branch unless explicitly asked;
- a reviewer must not claim a test or PAL comparison passed unless they ran or independently verified it;
- resolve disagreements in the PR so the reasoning remains visible in project history;
- behavior work and structural refactors should normally be separate PRs.

If two agents may appear under the same GitHub account, record the actual author/reviewer environment in the PR description or review comment. Branch prefixes are provenance, not access-control boundaries.

## Before changing behavior

1. Read `docs/STATUS.md`, `RTA_CURRENT_STATE.md` and `RTA_STATE.json`.
2. Read the relevant archaeology/evidence under `docs/archaeology/` and `docs/evidence/`.
3. Inspect the current implementation/tests in `rtao/` rather than relying on chat memory.
4. Inspect open PRs/branches touching the same subsystem.
5. Identify the exact evidence boundary before adding behavior.
6. Read `docs/development/DEFINITION_OF_DONE.md` before declaring the work complete.

## Validation

The CI-safe browser gate is:

```bash
cd rtao
npm run check
```

Its component commands are intentionally explicit:

```bash
npm run test:unit
npm run typecheck
npm run build:web
npm run build:capture
```

PAL-backed tests are a separate local gate:

```bash
RTA_PAL_EXECUTABLE=/path/to/SLES_513.56 npm run test:pal
```

Some cases also require `RTA_PAL_BIN`. PAL-backed tests require local original-game inputs and may not be executable in every agent runtime. If a full PAL gate cannot be run, say so explicitly; do not imply it passed.

C# reference work, when specifically needed, is self-contained under:

```bash
cd reference/csharp
```

## Project tracking

Use GitHub issues for new actionable work rather than creating new chat handoff/checkpoint documents. Prefer the archaeology/parity templates under `.github/ISSUE_TEMPLATE/` when they fit.

Current-state documents remain useful for concise evidence boundaries, but they should not become a second detailed backlog competing with GitHub issues.

## Repository hygiene

- `tools/` contains maintained reusable utilities; one-off historical sandbox scripts belong in `docs/archive/`.
- `docs/evidence/` contains retained primary evidence such as traces, deterministic reports and captures.
- `docs/archaeology/` contains interpreted subsystem research notes.
- Generated output belongs in ignored `artifacts/`, `.dev-cache/`, build or coverage directories unless it is deliberately retained as evidence.
- Do not create ZIP checkpoints, chat handoff manifests or restoration files for normal GitHub development. Git history, branches, PRs and tags replace that workflow.
- Update path references when moving files. Historical files under `docs/archive/` may retain old paths when they describe the historical environment.
- Keep line endings and editor behavior consistent with `.gitattributes` and `.editorconfig`.
