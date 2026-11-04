# AGENTS.md: Commet house rules

Every agent that works on this repo reads this file: coding agents, reviewers, and Qodo.

## What we're building
**Commet** (commit × comet) is a local-first, pixel-art 3D explorer for a solo developer who works with AI coding agents. `commet scan` reads a local git clone and that machine's agent session logs (Claude Code today). It works out which commits an agent actually wrote, including commits the agent made under your own git identity. Commet then renders the repo as a star system, where agent work shows up as uncharted territory that you chart by reviewing it.

Nothing leaves the machine. Principles are in `CONSTITUTION.md`, requirements in `docs/features/codebase-space-explorer.md`, and the technical design in `docs/design/system-design.md`.

## Setup
Node ≥ 20.19 and npm. From the repo (or worktree) root:
```sh
npm ci              # install, exactly as locked
npm run build       # tsc → dist/ (CLI entry: dist/cli.js)
```

## How to check the work
Run all four before you commit. CI runs the same steps on Node 20 and 22.
```sh
npm run typecheck   # strict tsc over src/ and test/
npm run lint        # ESLint, including the determinism and module-boundary rules
npm test            # Vitest: unit, golden snapshots, property tests, privacy canaries
node dist/cli.js scan --out /tmp/snap.json   # smoke test inside any git clone
```
Exit codes for `commet scan`: 0 ok, 1 internal, 2 usage, 3 shallow clone, 4 not a repo, 5 state error.

## Project rules

### Rule 1: The "Unknown, Never Human" Rule
- **Applies to:** `src/attrib/**`, `src/scan/**`, `src/core/classify.ts`, and anything that decides or displays a commit's class.
- **Rule:**
  - A commit may be labelled `human` only by `classify()`, and only when every one of these holds:
    - the author is you;
    - an agent session log covers the time;
    - that log was fully parsed;
    - it is not a merge;
    - no agent ran the commit;
    - fewer than 30% of its lines matched agent edits.
  - Any code path that skips, drops or can't parse log data (`continue`, `catch`, a size cap, an unreadable file) must widen a blind or partial span, or increment a counter shown in the summary.
  - If in doubt, the answer is `unknown`.
- **Why:** Commet's whole promise is to show you code you haven't really understood. Calling a commit "human" when it was agent-written is the worst bug we can ship, because it clears the fog over code nobody reviewed. On Day 1 this rule failed in **twelve different ways**:
  - Qodo's first review found 3 of them;
  - a bar-raiser pass found 3 more;
  - Qodo's reviews of the fix found another 6.

  Every one was a silent `continue` or a missing input to the decision.
- **How it's checked:** `test/classify.test.ts` (an exhaustive table plus a property test of the invariant) and `test/never-human.test.ts`.

### Rule 2: Agent logs are read through an allowlist
- **Applies to:** `src/attrib/parsers/**`, and any new reader of agent logs (Codex, Cursor and so on).
- **Rule:**
  - Read only explicitly named fields.
  - Never read, store, hash or output prompt or message text, `originalFile`, `last-prompt`, `history.jsonl`, `file-history/`, `attachment` or `api-request*` records.
  - A Bash command string may only be tested with a regex, and is then discarded.
  - Refuse symlinks before reading, and re-check the realpath against the deny list.
  - Every new field needs a privacy canary in the fixtures.
- **Why:** These logs hold your prompts, secrets and whole files. Qodo's first review found two leaks in our "private" parser: a symlink that made denied logs readable, and model and branch metadata that could carry an absolute path into the snapshot.
- **How it's checked:** `test/privacy.test.ts` plants canaries and fails if any reaches the snapshot, stdout or stderr.

### Rule 3: Same input, same bytes
- **Applies to:** `src/core/**`, `src/scan/**`, `src/attrib/**`, and from week 2 the layout and render code.
- **Rule:**
  - Don't use clocks, randomness or locale-dependent comparisons (`Math.random`, `Date.now`, `new Date()`, `performance.now`, `localeCompare`).
  - Sort by codepoint.
  - The same repo and logs must give a byte-identical snapshot.
  - Change golden files only on purpose, with a `Golden-Update: <reason>` line in the commit message.
- **Why:** The factory verifies the product with golden snapshots and, later, golden images. A planet that moves between runs breaks the user's mental map. Nondeterminism also makes every review and test result meaningless.
- **How it's checked:** ESLint bans these calls, a golden byte-compare test, and a test that scans twice and compares the SHA-256.

### Rule 4: Nothing leaves the machine
- **Applies to:** the whole repo, especially any future `src/server/**`.
- **Rule:**
  - No telemetry, no uploads, no remote servers, and nothing posted to GitHub.
  - GitHub API calls are read-only and explicitly opt-in.
  - The only server is `commet open`, which binds to 127.0.0.1 only, checks the Host header, requires a per-launch token and sends no CORS headers.
  - No absolute paths in any output.
- **Why:** Commet reads your private agent logs. People will only trust a tool like that if it's provably local. Any network-facing change also needs the human's approval (`CONSTITUTION.md`).
- **How it's checked:** the absolute-path assertions in the privacy tests, and (from R14) the server security suite.

### Rule 5: Every fix ships with a test that fails without it
- **Applies to:** every `fix:` commit and every PR that resolves a review finding.
- **Rule:**
  - A bug fix includes a test that fails on the code before the fix.
  - Bugs are reproduced first, with a failing test, before anyone changes app code.
  - Tests check what the spec says, not what the code currently does.
- **Why:** On Day 1 every Qodo finding was fixed this way. The one place we had encoded current behaviour, a privacy test that matched paths by substring, turned out to be a bug in its own right.
- **How it's checked:** in review, by asking "does this test fail without the change?"

## Working agreements
- Stage explicit paths only. Never run `git add -A`; other sessions share this checkout.
- Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), small and focused.
- Never merge into or push `main`. The human merges.
- New dependencies need a one-line justification in the PR description.
