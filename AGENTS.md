# RTAO shared agent conventions

This repository is a shared development surface for human contributors and coding agents, currently including ChatGPT, Codex and Claude.

## Canonical source and ownership

- GitLab `main` is the canonical project state.
- The active game is **`rtao/`** (Three.js / TypeScript).
- **`reference/csharp/`** is the earlier C#/MonoGame implementation retained for archaeology and comparison. Do not treat it as the active product unless a task explicitly targets it.
- `RTA_CURRENT_STATE.md` is the concise human-readable current evidence boundary.
- `RTA_STATE.json` is the concise machine-readable current state.
- The final pre-GitLab state blobs are preserved verbatim under `docs/archive/state/` for historical lookup; do not use them as current instructions.

## Evidence rule

The PAL executable and supplied PAL game data are authoritative for native behavior.

- Implement only evidence-backed behavior.
- Do not fill unknown native behavior with plausible guesses.
- Keep unresolved behavior explicitly gated and documented.
- Preserve cited traces/oracles/evidence unless deterministic regeneration exists and the replacement has been verified.
- Never commit original copyrighted game data, disc images, extracted proprietary assets, credentials, tokens, or other secrets.

## Branches and reviews

Every agent-authored task branch must identify the environment actually doing the work:

- `chatgpt/<task>` — work performed directly by ChatGPT in a normal ChatGPT conversation/session.
- `codex/<task>` — work performed by a Codex coding agent/session.
- `claude/<task>` — work performed by Claude.

Do not create generic agent branches such as `feature/...`, `fix/...`, `work/...` or an unprefixed task name. The prefix describes **who is making the commits at that moment**, not who requested the work or which model family may exist underneath the product.

Keep a branch's original ownership prefix for its lifetime. If another agent needs to make substantial changes rather than merely review it, that agent should normally branch from the relevant commit using its own prefix instead of silently taking ownership of the existing branch.

Prefer small, coherent commits with descriptive messages. Do not have multiple agents casually write to `main` in parallel.

For cross-agent review:

- the author owns the source branch;
- the reviewer inspects the actual diff, tests and evidence independently;
- reviewers should leave comments/suggestions rather than silently rewriting the author's branch unless explicitly asked;
- resolve disagreements in the MR so the reasoning remains visible in project history.

## Before changing behavior

1. Read `docs/STATUS.md`, `RTA_CURRENT_STATE.md` and `RTA_STATE.json`.
2. Read the relevant archaeology/evidence under `docs/archaeology/` and `docs/evidence/`.
3. Inspect the current implementation/tests in `rtao/` rather than relying on chat memory.
4. Identify the exact evidence boundary before adding behavior.

## Validation

Primary browser gate:

```bash
cd rtao
npm run check
```

PAL-backed tests require local original-game inputs and may not be executable in every agent runtime. If a full gate cannot be run, say so explicitly; do not imply it passed.

C# reference work, when specifically needed, is self-contained under:

```bash
cd reference/csharp
```

## Repository hygiene

- `tools/` contains maintained reusable utilities; one-off historical sandbox scripts belong in `docs/archive/`.
- `docs/evidence/` contains retained primary evidence such as traces, deterministic reports and captures.
- `docs/archaeology/` contains interpreted subsystem research notes.
- Generated output belongs in ignored `artifacts/`, `.dev-cache/`, build or coverage directories unless it is deliberately retained as evidence.
- Do not create ZIP checkpoints, chat handoff manifests or restoration files for normal GitLab development. Git history, branches, MRs and tags replace that workflow.
- Update path references when moving files. Historical files under `docs/archive/` may retain old paths when they describe the historical environment.
