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
- `npm ci`: install (lockfile-exact). In a new sandbox whose `package-lock.json` matches the session worktree's, clone instead: `cp -cR <session-worktree>/node_modules .` (seconds, no network, no extra disk on APFS).
- `npm run build`: `tsc` to `dist/` (the bin is `dist/cli.js`), then `vite build --config web/vite.config.ts` to `dist/web/` (the view `commet open` serves).
- `npx vite --config web/vite.config.ts`: the view's dev server on 127.0.0.1, with fixtures via `?fixture=mini|empty|invalid|missing`. Render test mode is `?test=1` (`window.__commet`).
- `npm run typecheck`: strict `tsc --noEmit` over `src/`, `test/` and `factory/`.
- `npm run lint`: ESLint. Bans `Math.random`, `Date.now`, `performance.now`, `crypto.randomUUID`, `new Date()` and `localeCompare` in `src/{core,scan,attrib}`, `web/src` and the render stand-in, Node built-ins in `src/core`, and U+0001 / `%x01` git-output framing in `src/{scan,attrib}` (AGENTS.md Rule 7).
- `npm run test:render`: Playwright + SwiftShader render tests (R8). A global setup builds `dist/web` first, so the specs always drive the current view. Goldens are authoritative only in CI's pinned container; locally the golden compare is informational (`test/render/README.md`).
- While working, run only the tests you touched (`npx vitest run <files>`), then typecheck and lint before you report. CI on the task PR is the full gate. Full local runs (no PR, or CI down) go through `lockf -k /tmp/commet-fullsuite.lock <cmd>`. See AGENTS.md Testing.
- `npm test`: Vitest (unit, golden, privacy canaries, lint rules). Test temp dirs only via `test/fixtures/tmp.ts` (`tempDir()`), cleaned per file and checked per run (#53). Golden snapshots live in `test/golden/`; regenerate only deliberately with `UPDATE_GOLDEN=1 npm test` and a `Golden-Update: <reason>` line in the commit.
- `node dist/cli.js scan [--window <months>] [--no-ingest] [--out <file>] [--root <dir>]... [--no-root] [--ask]`: run inside a clone. Writes `<git-common-dir>/commet/snapshot.json` and `layout.json` (`--out x.json` writes `x.json` plus `x.layout.json`). Exit codes: 0 ok, 1 internal, 2 usage, 3 shallow clone, 4 not a repo / no HEAD, 5 state error. `CLAUDE_CONFIG_DIR` overrides `~/.claude`.
- `node dist/cli.js open [--port <n>] [--no-open]`: serves the view, its layout and live fog, and accepts chart writes (`POST /api/chart`, recorded at the head the view saw, #58), on 127.0.0.1 only (R14, `docs/contracts/phase2.md`). It prints `http://127.0.0.1:<port>/#t=<token>` once and needs a snapshot first (exit 5 otherwise). `--no-open` keeps the token out of process lists. Exit 6: server bind failure.
- `node dist/cli.js chart status | baseline [--undo] | [--] <file>`: fog of war and chart state (R5). Chart state lives in `<git-common-dir>/commet/chart.json` (ids and SHAs only, mode 0600), with `chart.lock` as its write lock. A bad path or a folder exits 2; damaged or symlinked state exits 5 and is never reset.
- `npm run factory -- labels|install|uninstall|tick [--once|--dry-run [--issue N]]`: the agent runner (`factory/`, built separately, not in the published package; see AGENTS.md "Agent runner"). The lead runs `install --interval 900 --base <current session branch>` itself (no human step) after any `factory/` change merges, and again whenever the session branch changes; see AGENTS.md "Agent runner". Runner state (lock, `ticks.jsonl`, `runs/`, the installed copy) lives in `<git-common-dir>/factory/`, never in the work tree.

The design mockups live on `feature/hype-gif` under `mockups/asset-viewer/` (`npm install && npm test` there). They are throwaway prototypes, not product code.

## Layout
- `snapshot.json` and `layout.json` produced by `commet scan`; local state in `.git/commet/` (snapshot, layout, `config.json` with the saved content roots, `chart.json` + `chart.lock`, beacons, events).
- `layout(snapshot, history)` (`src/core/layout`) is a pure function. `history` comes from the full lineage replay, so layout.json can't be rebuilt from snapshot.json alone. Shape: `LayoutV1` in `src/core/contract/layout.ts`.
- Space mapping (#18): repo = star; top-level folders holding a non-test, non-test-data file = planets; second-level folders = continents; files = settlements; test files = moons of the planet they test; root files and unmatched tests = moonlets; test data is counted on the star, never drawn.
- Content roots (#71): the first `scan` in a terminal guesses the main code folder (e.g. `src`) and asks to confirm; the answer is saved in `config.json`. Each root's subfolders become content planets (slots 0–7); other top-level folders are outer planets (from slot 9). Files directly in a root are star moonlets. Without a TTY, the scan uses the saved answer or the guess and never asks. `--root`, `--no-root` and `--ask` override.

## Rules
- Read files before editing. Don't guess what exists.
- No features beyond the task. Match existing patterns; don't refactor adjacent code.
- **Determinism:** no `Math.random` in pipeline, layout or render code; use the pinned seeded PRNG and hash. No wall-clock time in snapshots.
- **Privacy:** never copy code, prompt text or absolute paths from agent logs into any output. Never read `originalFile`, `last-prompt`, `history.jsonl`, `file-history/`, `api-request*` or `attachment` records (see `docs/research/agent-attribution.md`).
- **Golden and property tests** are updated deliberately with a reason, never regenerated just to pass. Render tests must fail on empty output.
- Test what you change as you go; CI runs the full gate on the PR. Fix what you break.
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
- Before you report a finished task: typecheck, lint and the touched tests (no `/verify` after every edit, no `/simplify` sweeps).
- When a build or test fails: run `/fix` with the error output.
- Before committing: review `git diff --cached` for debug code, secrets and stray files.
- When exploring unfamiliar code: use the `explorer` agent.
