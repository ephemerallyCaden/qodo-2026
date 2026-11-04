# Commet

> A local-first, pixel-art 3D explorer that helps a solo developer working with AI coding agents keep a real mental model of their own codebase. Entry for Qodo's "Build a Software Factory in 30 Days" hackathon (Nov 2 – Dec 2, 2026, solo).

**Read first:** `CONSTITUTION.md` (principles, autonomy, quality gates; currently a draft), `docs/features/codebase-space-explorer.md` (requirements R1–R14, week plan), `JOURNAL.md` (state and decisions), `docs/design/art-direction.md` (the Current spec section is the visual source of truth).

## Stack (pinned at scaffold; see CONSTITUTION.md)
- TypeScript (strict), Node ≥ 20, npm.
- One `commet` npm package: scanner + CLI (native `git` via child_process, no language parsers) + terminal mode.
- One web bundle: Vite, three.js `WebGLRenderer`, GLSL. Served by `commet open` on a hardened 127.0.0.1 server (R14).
- Tests: Vitest (unit, golden, property), Playwright + SwiftShader for golden images.
- No remote servers, telemetry or uploads. GitHub API calls only as explicit read-only opt-ins.

## Build & Test
**Not scaffolded yet.** The product has no build, test or lint commands until the scaffold task lands; record the verified commands here when it does.

The design mockups live on `feature/hype-gif` under `mockups/asset-viewer/` (`npm install && npm test` there). They are throwaway prototypes, not product code.

## Layout (planned)
- `snapshot.v1.json` produced by `commet scan`; local state in `.git/commet/` (snapshot, chart state, beacons, events).
- `layout(snapshot) → positions` is a pure function. Space mapping: repo = system, top-level dirs = planets, second-level dirs = moons, files = surface features.

## Rules
- Read files before editing. Don't guess what exists.
- No features beyond the task. Match existing patterns; don't refactor adjacent code.
- **Determinism:** no `Math.random` in pipeline, layout or render code; use the pinned seeded PRNG and hash. No wall-clock time in snapshots.
- **Privacy:** never copy code, prompt text or absolute paths from agent logs into any output. Never read `originalFile`, `last-prompt`, `history.jsonl`, `file-history/`, `api-request*` or `attachment` records (see `docs/research/agent-attribution.md`).
- **Golden and property tests** are updated deliberately with a reason, never regenerated just to pass. Render tests must fail on empty output.
- Run build/test after changes. Fix what you break.
- **Stage explicit paths only.** Never `git add -A` or `git add .`; other sessions write files in this checkout.
- New dependencies need a one-line justification in the PR description.

## Branching
- `main` changes only with the human's approval. Never merge into or push `main`.
- Work happens on `session/<name>` branches; feature agents use `feature/<name>`, debuggers `debug/<name>`, each in a worktree under `.sandboxes/`.
- Integrate by rebase + fast-forward. The team lead merges; other agents only commit on their own branch.
- Commits: conventional style (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), small and focused.

## Gotchas
- `JOURNAL.md` and `.archive/` are gitignored and absent from worktrees. Reference them by absolute path, e.g. `<main-checkout>/JOURNAL.md` and `<main-checkout>/.archive/...`, where `<main-checkout>` is `$(git rev-parse --path-format=absolute --git-common-dir)/..`.
- Qodo can't see binary files. Report visual results as text (test output, colour counts) in PRs.
- `refs/notes/commet` is reserved for attribution events, not user notes.

## Context management
- When context feels long (50+ tool calls, or responses getting shorter): write your current plan to PLAN.md, then run `/compact`.
- Compact after finishing research, a bug fix or a feature, not during active implementation or debugging.

## Agent auto-routing
- After writing code that changes behaviour: run `/verify`.
- When a build or test fails: run `/fix` with the error output.
- Before committing: review `git diff --cached` for debug code, secrets and stray files.
- When exploring unfamiliar code: use the `explorer` agent.
