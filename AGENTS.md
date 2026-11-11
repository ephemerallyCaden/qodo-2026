# AGENTS.md: Commet house rules

For every coding agent, reviewer and Qodo. Everyone follows Setup, Testing and PRs, then the rules for their work:
- **Coding rules (1–3, 7):** changes to `src/**`, `test/**` or CI.
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
- Before a PR, run `qodo review --base "$(git merge-base HEAD "$BASE")" --json`, where `BASE` is the PR's base branch (e.g. `BASE=origin/session/week1`). Resolve `action_required` findings as in the review loop below for **at most 3 local rounds**, then open the PR anyway, listing any still-unresolved findings in its description. The loop continues in the PR review, and the merge gate (no unresolved `action_required`) applies there. (On #16, six local rounds took over 2 hours.)
- `commet scan` exit codes: 0 ok, 1 internal, 2 usage, 3 shallow clone, 4 not a repo / no HEAD, 5 state error.

## Dev tips
- `JOURNAL.md` and `.archive/` are gitignored and missing from worktrees. Use the main checkout: `$(git rev-parse --path-format=absolute --git-common-dir)/..`.
- Reproduce bugs on the commit the human is running, not your branch.
- Render tests must fail on a blank frame. One once passed after a shader compile error.
- Local servers bind `127.0.0.1` and read their port from `PORT` (VS Code often holds 5181).
- `CLAUDE_CONFIG_DIR` points `commet scan` at fixture transcripts.

## Working with Qodo
- Qodo can't see images. Report visual results in PRs as text: test output, pixel and colour counts.
- A skipped review looks like a clean one. Before merging, confirm the head commit was reviewed: `qodo read pr-review-session findings --pr-url <url> --extended` must list a `review_runs[]` entry with `commit_sha` equal to the head, `status: completed` and `review_effort` other than `skip`. `review_complete` is not a signal. PR #9 and PR #27 were merged on `skip` runs.
- Keep `ignore_bot_pr = false`, or agent PRs go unreviewed.
- **Run the review loop after every push to a PR.** Start a background watcher for Qodo's review of the exact head SHA (`gh pr view <N>`, or `get-pr-review-findings` via `qodo read`). Give it a 30-minute timeout. On a timeout or a failed command, report "review incomplete", never "clean". An empty findings list counts only once the review is confirmed complete on that SHA. Then, for each finding:
  1. **Validate it first.** Qodo is sometimes wrong. Confirm it with a failing test or a concrete trace through the code (the `qodo-review-resolver` workflow does this with citations).
  2. **Real:** fix it with a test that fails without the fix, amend the PR's commit, and `git push --force-with-lease` to the same PR.
  3. **Wrong or out of scope:** record a reason and the evidence (`false_positive`, `intentional`, `deferred`, `rejected`); deferred findings get an issue, and if unsure, ask `@qodo`. Agents may dismiss recommendations themselves. Dismissing an `action_required` finding needs the human's approval, recorded in JOURNAL.
  4. Repeat until the latest head's completed review has no `action_required` finding that isn't fixed or human-approved, then report. Recommendations are optional.
- Export findings to `.archive/docs/hackathon/evidence/pr<N>-qodo-review-r<round>-comments.json`.
- A finding seen twice becomes a proposed rule here or a Qodo review standard.

## Agent runner (`factory/`)
Dev tooling, not Commet: Rule 2's "no GitHub posts" covers the product, not this. The runner's only GitHub writes, all made with the human's own gh login:
- labels on issues the owner opened and labelled (`ready-for-agent` → `agent-working` → `agent-done` / `agent-needs-help`);
- comments on that issue and on the PR the run opened;
- pushes to `agent/<N>-<slug>` and one PR per run against the session branch.

It never merges, pushes `main` or a session branch, force-pushes, or edits repo settings or secrets (runtime guard: `factory/guard.ts`). It keeps Rule 2's local-data rules: no absolute paths in output or posts, an agent's Bash commands kept only as regex categories, logs only under `.git/factory/`.

Installing it is the lead's job, without asking the human. Whenever a change to `factory/` merges into the session branch, the lead runs `npm run factory -- install` from an up-to-date checkout of that branch (with `npm ci` first). The installed copy in `.git/factory/bin` only updates on install, so skipping this leaves an old runner ticking. The human may still uninstall it at any time.

Where it differs from the review loop above:
- Fix rounds add new commits and never force-push.
- No local `qodo review` before the PR: the PR review is the gate.
- Findings and dispositions live in the run log and one PR comment per fix round.
- An `action_required` finding the agent rejects stops the run with `agent-needs-help` for the human's decision.

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
- **Applies to:** `src/attrib/parsers/**` and any new log reader, all output (snapshot, stdout, stderr, status messages), and the future `src/server/**`. Not `factory/**`: dev tooling, not Commet. See 'Agent runner' below.
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
- **Checked by:** ESLint bans in `src/core`, `src/scan`, `src/attrib`, `web/src` and the render stand-in, golden byte compares, render goldens (`npm run test:render`), and a scan-twice SHA-256 test.

### Rule 7: NUL-framed git output
*A repository path can hold any byte except NUL, so git output that lists paths is read with `-z` and parsed by position on `\0`, never framed by another byte; patch text, which can hold NUL too, is parsed by its hunk counts.*
- **Applies to:** the scanner and attribution code (`src/scan/**`, `src/attrib/**`): every git call whose output lists repository paths (`--name-only`, `--name-status`, `--numstat`, `--raw`, `ls-tree`, `ls-files`, `grep`) or carries patch text (`-p`).
- **Rule:**
  - A path-listing git call passes `-z` and separates `--format` fields with `%x00`; no `%x01`, `%n` or other byte frames a record or a field that can hold a path.
  - The NUL tokens are parsed in order, a commit header recognised by its position (such as an empty token where a status or path would be) and each status taking its one or two paths, never by first splitting the output into commit chunks on a marker byte.
  - A path token is never trimmed, stripped or rewritten; the only byte dropped is the one newline git writes after a format line's closing NUL, before its first path or status.
  - Only a final header field may lack its closing NUL (an empty last commit has no paths after it), and only when it is complete and well-formed (e.g. a full 40-hex SHA); a malformed final header or any other unterminated token is a cut-off record, refused or counted under Rule 1, never half-read.
  - Patch text (`-p`) can't be NUL-framed, because a text diff can itself hold NUL (past git's 8,000-byte binary check, or under a `diff` attribute) and U+0001: it is read line by line, the `@@` hunk counts tell content from headers, and paths come from the C-quoted `+++ b/…` header via `headerPath`, or from the `--- a/…` header when `+++` is `/dev/null` (a deleted file).
  - Each new parser of path-bearing output gets a failing-first test whose filename contains U+0001, a newline and a tab.
- **Why:** git-output framing broke parsing 5 times in 3 days, all caught by Qodo: three U+0001 splits (PR #3, #16 local r2 and r4), a stripped leading newline (#16 local r1) and a dropped final record (PR #20 r2). The first fix missed its sibling in the same file (#24, still open), and two new parsers copied the `%x01` pattern two days later.
- **Checked by:** the U+0001 fixtures in the scan tests; in review, any path-listing git call without `-z`, or `%x01` / `'\x01'` framing. Not yet in lint: once #24 lands, `npm run lint` will also ban `\x01` and `%x01` in `src/scan` and `src/attrib`.

## Art rules
These cover the main 3D view; the 2D map, terminal mode and status card have their own specs.
Source of truth: `docs/design/art-direction.md`. These rules summarise it and change only after it does. Don't revive anything in its §11 (rejected directions) without new evidence and the human's sign-off; `art-direction-history.md` is a record, not a menu.

### Rule 4: Pixel honesty
*Render at low resolution, upscale nearest-neighbour, light in our own banded shaders, and skip the usual "make it pretty" defaults.*
- **Applies to:** three.js and GLSL rendering code for the main 3D view: everything under `web/` and `mockups/`, and GLSL anywhere, in `.glsl` files or inline shader strings (`web/**`, `mockups/**`, `**/*.glsl`).
- **Rule:**
  - The scene renders into a low-resolution target (320×180 by default) that is upscaled by a whole-number factor with nearest-neighbour only, such as CSS `image-rendering: pixelated` or a `NearestFilter` blit.
  - The `WebGLRenderer` is created with `antialias: false` and `setPixelRatio(1)`.
  - Every texture and render target samples with `NearestFilter` and `generateMipmaps = false`, never `LinearFilter` or a mipmap filter (three.js's texture defaults).
  - No outlines and no dithering: no `OutlinePass` or edge-detection outline, no `dithering: true` on a material, and no ordered or noise dither in a shader.
  - No sprite sheets: scene objects are drawn live by meshes and shaders.
  - No stock lit material: `MeshStandardMaterial`, `MeshPhysicalMaterial`, `MeshPhongMaterial`, `MeshLambertMaterial` or `MeshToonMaterial`.
  - No shadow maps: `renderer.shadowMap.enabled`, `castShadow` and `receiveShadow` stay off.
  - Our shaders light surfaces from the one key-light direction, with no extra lights (`AmbientLight`, `HemisphereLight`, `PointLight`, `SpotLight`, `RectAreaLight` or a second `DirectionalLight`).
  - Planetary motion (spin, orbits, moons, rings, clouds) runs at constant rates, its phase a fixed rate times time, never through an easing curve, a tween (tween.js, GSAP) or a spring or damping (`MathUtils.damp`); camera motion isn't covered by this rule.
  - Stars never twinkle: a star's brightness and size never vary with time.
  - No post-processing beyond the nearest-neighbour upscale: no `EffectComposer` pass or full-screen shader for bloom (`UnrealBloomPass`), blur, FXAA or SMAA, SSAO, vignette, chromatic aberration or film grain.
  - Surface colour comes in quantised bands: a shader picks one band of its ramp per pixel and never blends smoothly between ramp colours.
  - Drawn lines, such as cracks, fissures and crevasses, are at least 2 internal px wide; stars and ring dots are exactly 1 internal px.
  - Every animated layer completes a whole number of cycles per loop (24 s), so the loop has no seam.
  - **Exception:** the per-pixel depth fade toward the depth tint is the one gradient.
  - **Exception:** labels and UI render outside the pixel pass, in the bitmap font, never into the low-resolution target (no `TextGeometry` or font-rendered canvas text in the scene).
- **Why:** three.js defaults and polish passes give smooth gradients and soft edges, which is a blurry 3D render, not pixel art.
- **Checked by:** asset-viewer render tests (line width, depth, loop seam); in review, any AA, filtering, stock material, planetary easing, post-pass or in-pass text.

### Rule 5: Palette consistency
*Every rendered colour comes from a named palette, never an inline literal, and nothing is pure black.*
- **Applies to:** the same rendering code as Rule 4 (everything under `web/` and `mockups/`, and GLSL anywhere), except palette modules: files whose only job is to define the named colours (e.g. `src/core/palette.ts` and the asset viewer's `planet-ramps.js` and `palette-map.js`).
- **Rule:**
  - Render code and shaders hold no colour literal (a `'#rrggbb'` string, a `0xRRGGBB` number, `rgb()`, or a literal `vec3`, `vec4` or `new Color(…)` used as a colour); colours are read from a palette module by role.
  - World colours (planets, clouds, rings, space, stars) come from the v2 ramps (`V2_PLANET_RAMPS`).
  - Crew colours come from BLK 36 (`mapPalette('blk-36')`), used exactly and never retuned.
  - The only accent is [OIII] teal (`#004538` `#007c66` `#00bc9c` `#00ffd5`), used for code-layer events only and on under 10% of the frame's pixels.
  - Rings and clouds use only their planet family's colours, never pink, violet or yellow.
  - Nothing is pure black: no `#000000`, `0x000000`, `rgb(0, 0, 0)` or `black`, including `setClearColor`, `scene.background` and the page background; space is `#0d0b16`.
  - Code-layer glitch cells only reuse the colour they cover (a darker or lighter step, inverted lightness, a channel slip, a posterise), and the only colour they may add is teal.
  - **Exception:** lava glow is unlit, but its colours still come from the v2 lava ramp.
  - **Exception:** the depth fade is the only off-palette output.
- **Why:** Qodo can't see renders, but it can see a colour literal in a diff. One stray magenta reads as pasted on.
- **Checked by:** in review, any colour literal outside palette modules, a new palette, or `#000000` / `0x000000`.

## Design rules

### Rule 6: Understanding, not output
*Commet rewards understanding code, never producing it.*
- **Applies to:** every feature, UI surface and piece of copy, including fog, status messages, debris, teammates and recaps.
- **Rule:**
  - Nothing awards XP, points, levels, badges or streaks for commits, PRs, lines or sessions.
  - No leaderboard, ranking, or per-person score or count (such as commits or lines per person) appears anywhere; repo totals are fine.
  - Fog clears only on review, when a file's diff is opened or its question answered; no timer, elapsed time, new commit or button (such as "chart all") clears it.
  - No guilt mechanics: nothing decays, nags or punishes a break (no state that worsens with time away, no repeated reminders, no penalties).
  - Commet is not a task tracker: it reads intent from sources that already exist and never stores, assigns or edits tasks.
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
- Put `Closes #<issue>` and the ticket's acceptance criteria in the description so Qodo checks ticket compliance. `Closes` only auto-closes on the default branch, so after a PR merges into a session branch, close the issue by hand with the evidence.
- After a Day PR lands on `main`, merge `main` back into the session branch, so agents branching from it see the same rules (AGENTS.md was once missing from `session/week1`).
- Conventional commits (`feat`, `fix`, `design`, `docs`, `test`, `chore`), small and focused. Stage explicit paths; never `git add -A` (other sessions share this checkout).
- Never merge into or push `main`; the human merges.
- Justify new dependencies in one line in the PR.
- Bug fixes include a test that fails without the fix; reproduce before changing app code.
