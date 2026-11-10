# Commet

> A local-first, pixel-art 3D explorer that helps a solo developer working with AI coding agents keep a real mental model of their own codebase. Entry for Qodo's "Build a Software Factory in 30 Days" hackathon (Nov 2 – Dec 2, 2026, solo).

**Read first:** `AGENTS.md` (house rules shared by every agent and by Qodo), `CONSTITUTION.md` (principles, autonomy, quality gates; approved), `docs/features/codebase-space-explorer.md` (requirements R1–R14, week plan), `JOURNAL.md` (state and decisions), `docs/design/art-direction.md` (the Current spec section is the visual source of truth).

## Stack (pinned at scaffold; see CONSTITUTION.md)
- TypeScript (strict), Node ≥ 20, npm.
- One `commet` npm package: scanner + CLI (native `git` via child_process, no language parsers) + terminal mode.
- One web bundle: Vite, three.js `WebGLRenderer`, GLSL. Served by `commet open` on a hardened 127.0.0.1 server (R14).
- Tests: Vitest (unit, golden, property), Playwright + SwiftShader for golden images.
- No remote servers, telemetry or uploads. GitHub API calls only as explicit read-only opt-ins.

## Build & Test
Node ≥ 20.19, npm. From the repo (or worktree) root:
- `npm ci`: install (lockfile-exact).
- `npm run build`: `tsc` to `dist/` (the bin is `dist/cli.js`).
- `npm run typecheck`: strict `tsc --noEmit` over `src/`, `test/` and `factory/`.
- `npm run lint`: ESLint. Bans `Math.random`, `Date.now`, `performance.now`, `crypto.randomUUID`, `new Date()` and `localeCompare` in `src/{core,scan,attrib}`, and Node built-ins in `src/core`.
- `npm test`: Vitest (unit, golden, privacy canaries, lint rules). Golden snapshots live in `test/golden/`; regenerate only deliberately with `UPDATE_GOLDEN=1 npm test` and a `Golden-Update: <reason>` line in the commit.
- `node dist/cli.js scan [--window <months>] [--no-ingest] [--out <file>]`: run inside a clone. Writes `<git-common-dir>/commet/snapshot.json`. Exit codes: 0 ok, 1 internal, 2 usage, 3 shallow clone, 4 not a repo / no HEAD, 5 state error. `CLAUDE_CONFIG_DIR` overrides `~/.claude`.
- `npm run factory -- labels|install|uninstall|tick [--once|--dry-run [--issue N]]`: the agent runner (`factory/`, built separately, not in the published package; see AGENTS.md "Agent runner"). `labels` and `install` are the human's to run. Runner state (lock, `ticks.jsonl`, `runs/`, the installed copy) lives in `<git-common-dir>/factory/`, never in the work tree.

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
