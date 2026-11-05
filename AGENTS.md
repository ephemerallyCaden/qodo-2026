# AGENTS.md: Commet house rules

For every coding agent, reviewer and Qodo. Everyone follows Setup, Testing and PRs, then the rules for their work:
- **Coding rules (1–3):** changes to `src/**`, `test/**` or CI.
- **Art rules (4–5):** anything that renders: renderer, shaders, mockups.
- **Design rules (6):** anything that shapes what the user sees or how Commet motivates them.

## What we're building
**Commet** is a local-first, pixel-art 3D explorer for developers who work with AI coding agents. `commet scan` reads a git clone and the machine's agent session logs (Claude Code today) to find which commits an agent wrote, even under a human's account. Each directory becomes a system of planets, one per file. Code a session creates starts hidden; you chart it by reviewing the change or answering one question about it.

## Setup
Node ≥ 20.19, npm. From the repo or worktree root:
```sh
npm ci && npm run build      # CLI entry: dist/cli.js
```

## Testing
CI runs `npm ci` → build → typecheck → lint → test on Node 20 and 22. Run the same before committing:
```sh
npm run build && npm run typecheck && npm run lint && npm test
node dist/cli.js scan --out /tmp/snap.json   # manual smoke test in any clone
```
- One test: `npx vitest run -t "<name>"`.
- Goldens (`test/golden/`) change only on purpose: `UPDATE_GOLDEN=1 npm test`, plus a `Golden-Update: <reason>` commit line.
- Before a PR, run `qodo review --base $(git merge-base HEAD origin/main) --json` and resolve every `action_required` finding as in the review loop below.
- `commet scan` exit codes: 0 ok, 1 internal, 2 usage, 3 shallow clone, 4 not a repo / no HEAD, 5 state error.

## Dev tips
- `JOURNAL.md` and `.archive/` are gitignored and missing from worktrees. Use the main checkout: `$(git rev-parse --path-format=absolute --git-common-dir)/..`.
- Reproduce bugs on the commit the human is running, not your branch.
- Render tests must fail on a blank frame. One once passed after a shader compile error.
- Local servers bind `127.0.0.1` and read their port from `PORT` (VS Code often holds 5181).
- `CLAUDE_CONFIG_DIR` points `commet scan` at fixture transcripts.

## Working with Qodo
- Qodo can't see images. Report visual results in PRs as text: test output, pixel and colour counts.
- A skipped review looks like a clean one. Confirm a review completed on the head commit before merging.
- Keep `ignore_bot_pr = false`, or agent PRs go unreviewed.
- **Run the review loop after every push to a PR.** Start a background watcher for Qodo's review of the exact head SHA (`gh pr view <N>`, or `get-pr-review-findings` via `qodo read`). Give it a 30-minute timeout. On a timeout or a failed command, report "review incomplete", never "clean". An empty findings list counts only once the review is confirmed complete on that SHA. Then, for each finding:
  1. **Validate it first.** Qodo is sometimes wrong. Confirm it with a failing test or a concrete trace through the code (the `qodo-review-resolver` workflow does this with citations).
  2. **Real:** fix it with a test that fails without the fix, amend the PR's commit, and `git push --force-with-lease` to the same PR.
  3. **Wrong or out of scope:** record a reason and the evidence (`false_positive`, `intentional`, `deferred`, `rejected`); deferred findings get an issue, and if unsure, ask `@qodo`. Agents may dismiss recommendations themselves. Dismissing an `action_required` finding needs the human's approval, recorded in JOURNAL.
  4. Repeat until the latest head's completed review has no `action_required` finding that isn't fixed or human-approved, then report. Recommendations are optional.
- Export findings to `.archive/docs/hackathon/evidence/pr<N>-qodo-review-r<round>-comments.json`.
- A finding seen twice becomes a proposed rule here or a Qodo review standard.

## Daily Discussion posts
- Draft each day's post at `.archive/docs/hackathon/day<N>-discussion-post.md`, following that day's template. Create it if missing.
- After each change, add to its `## Notes`: the biggest Qodo lesson, a telling number, anything on the day's theme.
- Never post it. Posting needs the human.

## Coding rules

### Rule 1: Evidence or unknown
*Commet never shows a reassuring state it can't prove: without evidence a commit is `unknown`, a file is uncharted and a link isn't drawn.*
- **Applies to:** `src/scan/**`, `src/attrib/**`, `src/core/classify.ts`, and as they land: fog and charting, constellations, debris, any UI showing a class or "charted" state.
- **Rule:**
  - Only `classify()` produces `human`, and only when all hold: the author is you; a session log covers the time; that log fully parsed; not a merge; no agent ran the commit; under 30% of lines matched agent edits.
  - A file is charted only after its diff was opened or its question answered. Any later change refogs it.
  - Constellations and "usually changes with X" flags need their documented threshold.
  - No silent drops: every `continue`, `catch`, size cap or unreadable input widens a blind span or bumps a visible counter.
  - New inputs go through the deciding function and get a row in its test table.
- **Why:** a false reassurance clears fog over code nobody reviewed, the worst bug Commet can have. On Day 1 the commit guarantee broke 12 ways (Qodo 3, bar-raiser 3, Qodo on the fix 6), every one a silent `continue` or a missing input.
- **Checked by:** `test/classify.test.ts`, `test/never-human.test.ts`; in review, any unrecorded drop or bypass of the deciding function.

### Rule 2: Private by construction
*Read agent logs only through the field allowlist, output no prompts, code or absolute paths, and send nothing off the machine.*
- **Applies to:** `src/attrib/parsers/**` and any new log reader, all output (snapshot, stdout, stderr, status messages), and the future `src/server/**`.
- **Rule:**
  - Read only named fields. Never read, store, hash or output prompt or message text, `originalFile`, `last-prompt`, `history.jsonl`, `file-history/`, `attachment` or `api-request*`. Bash commands may only be regex-tested, then discarded.
  - Refuse symlinks before reading; re-check the realpath against the deny list.
  - No absolute paths in any output.
  - No telemetry, uploads, remote servers or GitHub posts. GitHub API calls are read-only and opt-in. The only server, `commet open`, binds 127.0.0.1 with a Host check, a per-launch token and no CORS.
  - Every new log field gets a privacy canary.
- **Why:** the logs hold prompts, secrets and whole files; Commet is only trustworthy if provably local. Qodo's first review found two leaks: a symlink exposing denied logs, and metadata carrying an absolute path.
- **Checked by:** `test/privacy.test.ts` (canaries, absolute paths); from R14, a server security suite.

### Rule 3: Same input, same output
*No clocks, unseeded randomness or locale ordering in pipeline, layout or render code: same input, same bytes, same pixels.*
- **Applies to:** `src/core/**`, `src/scan/**`, `src/attrib/**`, and layout and render code as it lands.
- **Rule:**
  - No `Math.random`, `Date.now`, `new Date()`, `performance.now` or `localeCompare`. Use the seeded PRNG; sort by codepoint.
  - Same repo and logs → byte-identical snapshot. Same snapshot, camera and frame → identical pixels.
- **Why:** the factory verifies the product with goldens, and a planet that moves between runs breaks the user's mental map.
- **Checked by:** ESLint bans in `src/core`, `src/scan` and `src/attrib` (render and layout code is review-only until lint covers it), golden byte compares, a scan-twice SHA-256 test.

## Art rules
For the main 3D view; the 2D map, terminal mode and status card have their own specs. Source of truth: `docs/design/art-direction.md`. Don't revive anything in its §11 (rejected directions) without new evidence and the human's sign-off. `art-direction-history.md` is a record, not a menu.

### Rule 4: Pixel honesty
*Render at low resolution, upscale nearest-neighbour, light in our own banded shaders, and skip the usual "make it pretty" defaults.*
- **Applies to:** `web/**`, all GLSL (`**/*.glsl` and inline), `mockups/**`.
- **Rule:**
  - Render into a 320×180 target (default) and upscale by a whole number, nearest-neighbour only.
  - No anti-aliasing (`antialias: false`, `setPixelRatio(1)`), linear filtering or mipmaps, outlines, dithering, or sprite sheets.
  - No stock lit materials (`MeshStandard`, `MeshPhysical`, `MeshPhong`, `MeshLambert`), shadow maps or extra lights. Light in our shaders from the one key-light direction.
  - No easing, tweens or springs on planetary motion (spin, orbits, moons, rings, clouds); constant rates only. Stars never twinkle.
  - No post-processing (bloom, blur, FXAA/SMAA, SSAO, vignette, chromatic aberration, grain) unless art direction changes first.
  - Quantised colour bands; lines ≥ 2 internal px (stars and ring dots exactly 1 px); every animated layer completes whole cycles per loop (24 s).
  - **Exceptions:** the per-pixel depth fade is the one gradient. Labels and UI render outside the pixel pass, in the bitmap font.
- **Why:** three.js defaults and polish passes give smooth gradients and soft edges, which is a blurry 3D render, not pixel art.
- **Checked by:** asset-viewer render tests (line width, depth, loop seam); in review, any AA, filtering, stock material, planetary easing, post-pass or in-pass text.

### Rule 5: Palette consistency
*Every rendered colour comes from a named palette, never an inline literal, and nothing is pure black.*
- **Applies to:** `web/**`, all GLSL, `mockups/**`, except the palette modules.
- **Rule:**
  - No hex, `rgb()` or colour `vec3` written inline. World = v2 ramps (`V2_PLANET_RAMPS`); crew = BLK 36, never retuned; accent = [OIII] teal, code-layer events only, under 10% of the frame.
  - Rings and clouds use only their planet family's colours: never pink, violet or yellow.
  - No `#000000`, including the clear colour and page background. Space is `#0d0b16`.
  - Glitches reuse the colour they cover; only teal may be added.
  - **Exceptions:** lava glow is unlit but still from the v2 lava ramp. The depth fade is the only off-palette output.
- **Why:** Qodo can't see renders, but it can see a colour literal in a diff. One stray magenta reads as pasted on.
- **Checked by:** in review, any colour literal outside palette modules, a new palette, or `#000000` / `0x000000`.

## Design rules

### Rule 6: Understanding, not output
*Commet rewards understanding code, never producing it.*
- **Applies to:** every feature, UI surface and piece of copy, including fog, status messages, debris, teammates and recaps.
- **Rule:**
  - No XP, points, levels, badges or streaks for commits, PRs, lines or sessions.
  - No leaderboards or per-person scores, counts or rankings. Repo totals are fine.
  - Fog clears only through review (opening a diff, answering a question), never through time, more commits or a button.
  - No guilt mechanics: nothing decays, nags or punishes a break.
  - Not a task tracker: read intent from existing sources; never store, assign or edit tasks.
- **Why:** rewarding output is what makes agent-written code pile up unread. Output rewards get gamed, and scoring people turns a tool into surveillance.
- **Checked by:** in review, any score, streak, ranking, per-person count or non-review way to clear fog.

## PRs and commits
| Type | Title | Base |
|---|---|---|
| Day | `Day <N>: <what it delivers>`, one per day | `main` |
| Feature | `feat(<area>): <behaviour>` | session branch |
| Fix | `fix(<area>): <what was wrong>`, linking the issue or review | session branch |
| Design | `design: <decision>`, no product code | session branch |
| Docs / chore | `docs: …` / `chore: …` | session branch |

- Feature, fix and design PRs reach `main` inside that day's Day PR. One type per PR.
- Put `Closes #<issue>` in the description so Qodo checks ticket compliance.
- Conventional commits (`feat`, `fix`, `design`, `docs`, `test`, `chore`), small and focused. Stage explicit paths; never `git add -A` (other sessions share this checkout).
- Never merge into or push `main`; the human merges.
- Justify new dependencies in one line in the PR.
- Bug fixes include a test that fails without the fix; reproduce before changing app code.
