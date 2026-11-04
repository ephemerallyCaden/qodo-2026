# Commet: Delivery Plan

*2026-11-04. Deadlines: Nov 8, 15, 22, 29, Dec 2. Design: `docs/design/system-design.md`. **Blocker:** CONSTITUTION.md approval is required before any product PR to `main`. Escalate today.*

## 1. Task breakdown

Size: S ≤ ½ day, M ≈ 1 day, L ≈ 2 days of agent time plus review. "Avoid" lists the files a task must not touch when running in parallel. The schema file `src/core/snapshot/types.ts` has a **single owner per day** (the team lead serialises changes to it), and only T0 or the named task may change `package.json` or the lockfile.

**Week 1: core loop**

| ID | Title | Req | Acceptance criteria (testable) | Deps | Size | ∥ | Avoid |
|---|---|---|---|---|---|---|---|
| T0 | Scaffold, lint and CI | R8 | `npm run build/typecheck/lint/test` exit 0 on a clean clone. A file in `src/core` that calls `Math.random()` or `Date.now()` fails lint. `src/core` importing `node:fs` fails lint. The CI workflow runs on PRs. CLAUDE.md Build & Test lists the verified commands. | none | S | no | — |
| T1 | Day-1 thin scan with Claude attribution (§5) | R1, R2 | See §5 | T0 | M | no | — |
| T2 | Full git ingestion | R1, R3 (IDs) | Fixture goldens pass for every scenario in design §10. Renaming a file keeps its `fileId`. A file deleted inside a merge is absent. Shallow clone → exit 3 with the unshallow hint. The window `until` equals HEAD's committer date under a faked clock. Exclusion rules and counts appear in the snapshot. Files over the cap get `overflow:true`. The schema freezes at `schemaVersion: 1`. | T1 | L | partly | `src/attrib/**` |
| T3 | Attribution complete | R2, R2b, R6 | Trailers and bot authors classed `agent` (high). git-ai notes read when present. The events cache makes a scan with the raw logs deleted byte-identical to one with them. Commits outside coverage are `unknown`, never `human`. Teammate commits without a trailer, bot or note are `unknown`. Subagent sessions have a `parentKey`. Pseudo-sessions are labelled `inferred`. | T1 | M | yes, with T2/T4 | `src/scan/**` and the schema (request changes via the lead) |
| T4 | Layout core | R3, R8 | `layout()` is pure. Property tests: adding files or dirs moves existing bodies by 0, a rename keeps the cell, and output is byte-identical across runs. Biome is from the hash only. Root files sit on `d_root`. | T2 schema | M | yes | `src/scan`, `web/` |
| T5 | Fog and chart core | R5 | `fog()` is pure. Charting clears exactly that file. A later fogging commit refogs it. A self-human commit does not. Baseline clears everything at or before its seq. A chart SHA not in the window counts as fogged. | T2 schema | S | yes | `web/`, `src/server` |
| T6 | Hardened server | R14 | All 10 builder-security tests pass (design §9). `PUT /api/chart` persists atomically with mode 0600. A stream client gets `snapshot-changed` within 500 ms of a rescan. `/api/diff` rejects unknown fileIds. | T0 (types from T2) | M | yes | `web/src/scene/**` |
| T7 | Pixel renderer foundation | R4, R8 | The canvas is 320×180 with an integer CSS upscale. Planets are instanced in ≤ 3 draw calls. The `CameraMode` interface has ortho-snapped implemented. `frame()` is pure (the same n gives an identical FrameSpec). `?frame=N` renders deterministically twice. Depth fade uses `uEye`. | T4 | L | yes, with T6 | `src/server`, `src/attrib` |
| T8 | Fog, charting UI, labels and focus | R4, R5 | Click a planet to focus it. The file list shows fogged files. Opening a diff charts the file, and the planet clears when all files are charted. Labels render on the native canvas through the bitmap font (a test asserts no DOM text inside the scene). First-run baseline prompt. Reduced motion freezes n=0 and uses cuts. | T5, T6, T7 | M | no | — |
| T9 | Render goldens and budgets | R8 | The Playwright SwiftShader job renders 3 frames from the fixture. Anti-empty asserts. Draw calls ≤ 100. A changed golden fails CI unless the commit carries a `Golden-Update:` reason. Docker image pinned by digest (can slip to week 2; see §3). | T7 | M | yes, with T8 | `web/src/scene/**` |
| T10 | 2D map toggle | R4 | The toggle shows a top-down Canvas2D map from the same `layout()`. Fog is hatched. It works with WebGL disabled. | T4, T5 | S | yes | 3D shaders |

**Week 2: R7, R9, R10, plus perf**

| ID | Title | Req | Acceptance criteria | Deps | Size | ∥ |
|---|---|---|---|---|---|---|
| T11 | Hooks install, remove and event | R7 | Asks before writing. An existing hook is chained, and its exit code is preserved. `remove` restores the files byte-for-byte. PostToolUse appends a valid `commet.edit/1` event and nothing else (canary test). A post-commit triggers a rescan. | T3 | M | yes |
| T12 | Co-change and the silence flag | R9 | Thresholds documented and recorded in the snapshot. The fixture's co-changing pair is detected. The flag "usually changes with X (not touched)" appears for a single-sided change. Deterministic. | T2 | M | yes |
| T13 | Captain's log beacons | R10 | An optional ≤ 120-character note is stored in `beacons.json` and rendered as a beacon. HTML in the text renders literally. Never written to git. | T6, T8 | S | yes |
| T14 | Drones (after the art pass) | R2b | One drone per session, seeded from `sessionKey`. Two scans give identical drones. No prompt or title is shown. The UI shows "inferred" pseudo-sessions. | T7, art | M | yes |
| T15 | Perf bench and large fixture | R8 | `--bench` JSON output. CI fails on a regression over 50%. The git/git number is recorded. | T2 | S | yes |

**Week 3: R11, R12, Codex, warp**

| ID | Title | Req | Acceptance criteria | Deps | Size |
|---|---|---|---|---|---|
| T16 | Terminal mode | R11 | `commet term` prints planets, fog, drones and beacons from the same `layout()` and `fog()`. Golden text output. Works with `NO_COLOR`. | T4, T5 | M |
| T17 | Status message | R12 | `commet status --day` gives a deterministic star chart PNG plus text. The preview lists every path, branch and model revealed. The redact flags remove them (test). No scores. | T16 | M |
| T18 | Codex parser | R2 | Allowlist parser pinned to a Codex sample fixture. Canaries pass. Sessions are keyed `codex:`. | T3 | S |
| T19 | Warp between systems | R4 | A repo list from local config. Warp is a cut under reduced motion. Each system's layout is unaffected by the others. | T7 | M |

**Week 4: extension, polish, demo**

| ID | Title | Req | Acceptance criteria | Deps | Size |
|---|---|---|---|---|---|
| T20 | VS Code extension | shape | A webview loads the same bundle. Data comes over `postMessage` from the extension host, so **no port is opened**. Strict webview CSP. Chart writes go to the same files. | T8 | M |
| T21 | Space debris (if capacity allows) | R13 | Local branch and worktree debris classes with documented thresholds. Copyable cleanup commands only. PR debris only with an opt-in token. No per-person tallies. | T2 | M |
| T22 | Demo prep | — | A scripted demo on this repo's own history and on one public repo. A recorded run. `/demo` script. | all | S |

**Factory tasks (F)**

| ID | Task | Week |
|---|---|---|
| F1 | `scripts/qodo-local.sh` (local review) and the triage checklist | 1 |
| F2 | REVIEW.md, project skills, and a rewritten reviewer agent | 2 |
| F3 | Commet hooks on this repo, Qodo Toolbox and MCP in the agent loop | 3 |
| F4 | `factory/gate.ts` approve/escalate gate | 4 |

## 2. Sequencing

| Window | Work | Ships to `main` |
|---|---|---|
| Nov 4 (Wed) | Constitution approval (human), T0, T1 | Day-1 PR: scan with attribution |
| Nov 5 (Thu) | T2; T3 ∥ | Ingestion and attribution PR |
| Nov 6 (Fri) | T4, T5 ∥ T6 | Layout, fog and server PR (security check) |
| Nov 7 (Sat) | T7; T9 ∥ (snapshot side) | Renderer PR |
| Nov 8 (Sun) | T8, T9 (render goldens), T10 if time | **Nov 8 deliverable** |
| Nov 9–15 | T11, T12, T13, T15, art pass, then T14, F2 | Nov 15: R7, R9, R10 |
| Nov 16–22 | T16, T17, T18, T19, F3 | Nov 22: R11, R12, Codex |
| Nov 23–29 | T20, polish, T21 (optional), F4 | Nov 29: extension and polish |
| Nov 30–Dec 2 | T22, freeze | Dec 2: demo |

**Critical path to Nov 8:** T0 → T1 → T2 (schema freeze) → T4 → T7 → T8 → T9. T3, T5 and T6 hang off the schema freeze and run in parallel. Any slip in T2 slips everything, so T2 gets the strongest agent and the lead's first review slot each day.

## 3. Capacity check

**The full Nov 8 slice isn't realistic in four days** as specified. R4 alone ("planet focus, warp, 2D map, reduced motion") plus porting the asset viewer to instancing is about 3 days. On top of that, constitution approval and Qodo review cycles add latency to every PR to `main`, and the fog and drone visuals aren't designed yet.

**Must-ship by Nov 8** (the loop: scan → see fog → open diff → fog clears, deterministic and verified):
- T0–T6 in full, except git-ai notes (move to week 2 if T3 runs long).
- T7 with **one camera mode** (ortho-snapped), **two biomes** (lush, desert), no clouds-on-every-planet (clouds on the focused planet only), no moons, no artefacts.
- T8 with placeholder fog (design §12) and a session *list* in the UI instead of 3D drones.
- T9: snapshot and property goldens plus a draw-call budget. One render golden in CI using Playwright's bundled SwiftShader.
- Reduced motion (freeze plus cuts) is cheap and stays in.

**Slip to Nov 15:**
- the pinned-digest Docker golden job;
- the 2D map toggle (T10);
- the live stream push (the UI polls on focus, a small fallback);
- git-ai notes and pseudo-sessions;
- the remaining biomes, rings, moons and artefacts;
- the other camera modes.

**Slip to later:** warp (already Nov 22) and 3D drones (blocked on art).

Applying this cut keeps the Nov 15 load reasonable (R7, R9, R10 plus the slips, about 6 agent-days). R13 stays unscheduled. Recommend it only if the Nov 29 polish has slack.

## 4. Factory evolution per weekly theme

**Week 1 (Build).** Added this week:
- CI with lint-enforced determinism and import boundaries;
- golden and property tests with the `Golden-Update:` discipline;
- the privacy canary test;
- the builder-security test suite;
- F1: `qodo review --json` run locally before each PR, then the PR review, then triage that checks `status`, `commit_sha` and `coverage.complete`;
- a PR template with dependency justifications and a text visual report.

**Week 2 (Set Standards), F2:**
- **REVIEW.md** at the repo root, which every Qodo agent reads. It lists the product principles as review checks, what must never appear in outputs, and "golden changes need a reason".
- **Skills** (`.claude/skills/<name>/SKILL.md` with `name`/`description` frontmatter, applied by Qodo as rule enforcement):
  - `commet-determinism`: no clocks or unseeded randomness in pipeline, layout or render; codepoint sorting; integer-only snapshot numbers; pure `layout`, `fog` and `frame`;
  - `commet-privacy`: allowlist-only parsing, no absolute paths, never touching the denylisted records, HMAC only, 0600 state;
  - `commet-local-server`: the 10 R14 controls;
  - `commet-pixel-rules`: labels outside the pixel pass, no dithering or outlines, teal only for events, biomes decorative.
- Qodo Rules imported from CLAUDE.md. Recurring week 1 findings become rules, each logged in JOURNAL with what Qodo caught or missed.
- Rewrite `.claude/agents/reviewer.md` to enforce the gates (conflict 8).
- Track skill metrics (Triggered, Detected, Merged violations) as the evidence for the week.

**Week 3 (Connect), F3:**
- Install Commet's own R7 hooks on this repo, so the factory's agent sessions become drones in Commet. That makes it the demo's dogfood.
- Wire the Qodo Agentic Toolbox CLI and MCP server into Claude Code feature agents: fetch rules before coding, read PR findings, mark resolved through the Review Resolver.
- Codex support (T18) widens the agent set.
- R12 status messages drive the daily hackathon posts. The human posts them manually after the preview.

**Week 4 (Automate), F4:**
- `factory/gate.ts` reads:
  - the Qodo findings JSON (completed, head SHA, coverage complete, empty `decisions` field);
  - CI results;
  - golden-diff status (unchanged, or changed with a reason);
  - budgets (draw calls, scan time, snapshot size);
  - security-suite status for PRs touching `src/server`.
- **Approve** means zero `action_required` findings, all gates green, and no change to the server, privacy or hooks. The gate then auto-merges feature → session.
- **Escalate** writes a JOURNAL entry and a PR comment with the reasons, for any `action_required` finding, network-surface change, golden change, budget regression or missing review.
- `main` still needs the human. The gate only prepares the PR to `main` with a verdict summary.

**Needs the human's decision:** let the lead open PRs into `session/*` branches, so Qodo reviews every task PR and not just the daily PR to `main`. The constitution only mentions PRs to `main`. Weigh this against Qodo credit cost.

## 5. Day 1 deliverable: thin `commet scan`

**Goal:** on this repo's own history, `commet scan` reports which commits Claude Code wrote, reproducing the research probe (≥ 90% of added lines matched on most commits). Two commits in one PR: `chore: scaffold` (T0) and `feat(scan): thin scan with Claude Code attribution`. Budget ≤ 1,200 changed lines, excluding the lockfile and fixtures.

**In:**
- **CLI:** `commet scan [--window N] [--no-ingest] [--out]` with exit codes 0, 2, 3 and 4.
- **Git:**
  - shallow refusal;
  - window anchored to HEAD's committer date;
  - `ls-tree` file list;
  - empty-tree numstat for LOC and binary detection;
  - first-parent window log with numstat;
  - `-U0` patches for commits inside coverage;
  - a built-in exclusion list (lockfiles, binaries, `node_modules`, `dist`) recorded in the snapshot.
- **Claude parser:**
  - discovery by `cwd` resolved to the git common dir, with the worktree prefix fallback;
  - allowlist extraction of `structuredPatch` and `bashEditDiff`;
  - subagent files;
  - `git commit` SHA evidence.
- **Hashing:** HMAC line hashing with `.git/commet/key` (0600). Events are held in memory; no cache file yet.
- **Matcher:** verbatim matching, last writer wins, commit classes agent/mixed/human/unknown with coverage, and `selfCommittedAgentWritten`.
- **Output:**
  - Session records for main and subagent sessions;
  - canonical JSON written to `.git/commet/snapshot.json` with `schemaVersion: "0.1"` (explicitly unstable until T2 freezes v1);
  - files keyed by path with a provisional `fileId = hash(path)`;
  - a stdout summary table.
- **Tests:**
  - one scripted fixture repo plus one synthetic Claude log;
  - a golden snapshot;
  - scan twice gives identical bytes;
  - the privacy canary test (prompt, `originalFile`, `last-prompt`, `attachment`, `cwd` and code canaries all absent);
  - an absolute-path regex test;
  - lint bans on `Math.random` and `Date.now`.

**Out** (named so reviewers can hold the line):
- rename lineage and stable `fileId`/`dirId` (T2);
- `check-attr` exclusions, the file cap and the belt (T2);
- trailers, bot authors and git-ai notes (T3);
- `events.jsonl` caching and pseudo-sessions (T3);
- layout, fog, server and web (T4–T8);
- hooks (T11);
- co-change (T12);
- `commet open`;
- Docker;
- any dependency beyond `typescript`, `vitest`, `eslint` and `@noble/hashes`.

**Acceptance:**
1. On `session/day1-ideation`, the scan finishes in under 2 s and prints per-class counts. The PR includes that text output and a comparison with the research probe ("20 of 24 commits ≥ 90% matched"). A large mismatch is investigated before merge, not waived.
2. A `--depth 1` clone exits 3.
3. Running the scan twice gives identical SHA-256 hashes of the output.
4. Every canary test passes, and fails if the canaries are removed from the fixture.
5. The local Qodo review has zero `action_required` findings. The PR to `main` has a completed Qodo review on the head SHA.
6. JOURNAL records what Qodo caught.

### Critical Files for Implementation
- <main-checkout>/docs/features/codebase-space-explorer.md
- <main-checkout>/docs/research/agent-attribution.md
- <main-checkout>/docs/research/technical-risks.md
- <main-checkout>/docs/design/art-direction.md
- <main-checkout>/CONSTITUTION.md
- Reference mockups (not product code): `feature/hype-gif:mockups/asset-viewer/viewer.js` (`planet-ramps.js`, `palette-map.js`) and `feature/camera-mockups:mockups/camera-modes/cameras.js`
