# Feature: Commet (project concept)

## Status
Research. Concept decided 2026-11-03; design audit decisions applied 2026-11-04. CONSTITUTION.md approved 2026-11-04. Baseline chart approved (design §5.5). Camera: **free**, not snapped (human, 2026-11-04). Product principles live there and aren't repeated here. **Pending:** camera choice (mockups in progress, R4).

## Trigger
- "a gamified github codebase space explorer… 3D.js art-wise, but with a pixel renderer over the top… planets procedurally generated… target intermediate to senior engineers."
- "go with the solo idea, but also have support for collaboration just the features only ever affect client-side."

## Concept
You are the astronaut and your AI agents are your drone crew. Anything you didn't write yourself shows up as uncharted territory. You chart it by reviewing the change, so your mental model keeps up with code your agents write. Teammates appear only from local git history, and nothing you do leaves your machine.

**Scope rule:** Commet is not a task tracker. Features that help you understand what changed are in. Features that decide or assign what to do next are out. Commet may read intent from existing sources but never stores or edits task state.

**Shape:** one `commet` npm package (scanner, CLI, terminal mode) plus one web bundle. `commet open` serves the bundle locally; a VS Code extension later wraps the same bundle in a webview. Every view reads the same snapshot and the same local state in `.git/commet/`.

**Space mapping:** one repo = one star system. Top-level directories are planets, second-level directories are moons, and files are surface features; deeper folders fold into their moon. Warping between systems means warping between repos (later).

## Requirements
**Core**
- [ ] R1. `commet scan` turns a local clone into a versioned snapshot. Identical input gives byte-identical output.
  - Input = git state plus the attribution event cache in `.git/commet/`, so agent logs expiring after 30 days don't change past snapshots.
  - The history window is anchored to HEAD's commit date, never the wall clock.
  - No absolute paths, code or prompt text in the snapshot. Agent edits are stored only as line hashes plus safe metadata.
  - Refuses shallow clones with instructions to unshallow (Commet never fetches).
  - Default window 12–24 months and a file cap (~5k); overflow is shown as an asteroid belt. Exclusion rules (vendor, generated, lockfiles, binaries) are recorded in the snapshot.
- [ ] R2. Agent attribution, confidence-ranked: session logs/hooks (high) → trailers and bot authors (high when present) → heuristics (low, labelled "possibly agent") → unknown. Never guess silently, and flag "committed by you, written by an agent". **v1 sources:** Claude Code logs (matched to this repo, including its worktrees, via `git rev-parse --git-common-dir`), trailers, bot authors and git-ai notes. Codex comes in week 3. Each log parser is pinned to a sample-log fixture because no tool documents its format.
- [ ] R2b. Per-session attribution. Each session is its own drone, seeded from a hash of tool + session ID. Show safe metadata only (time, branch, model), never prompts. Without logs, fall back to pseudo-sessions inferred from commit clustering, labelled "inferred".
- [ ] R3. Stable layout per the space mapping above: append-only orbit slots, and file identity survives renames. Adding files never moves existing planets. Size = lines of code. **Biomes are decorative**, picked by a hash of the planet's stable ID; they carry no data.
- [ ] R4. three.js pixel view: planet focus, warp between systems, 2D map toggle, reduced motion (animation frozen on a fixed frame, rendering only on interaction, cuts instead of glides). Labels use a crisp bitmap pixel font drawn at native resolution outside the pixel pass. **Camera: free movement (human, 2026-11-04). Not snapped.** Which free mode (ortho free rotation or perspective free flight) is still to be confirmed; the camera module stays pluggable.
- [ ] R5. Fog of war, per file. Fog covers every change you didn't write yourself: agents, teammates and unknown attribution. Opening a file's diff charts it, and a planet clears when all its files are charted. Any later change refogs the whole file. **First-run baseline (approved 2026-11-04):** an explicit, undoable "chart everything up to <HEAD> as my baseline" action, so the whole repo isn't fogged on day one. Comprehension questions are an optional alternative way to chart, generated from git only in v1 (no LLM). State is local only.
- [ ] R6. Teammates' astronauts and territory come from local git history, with no network calls. Teammates' agent logs never reach your machine, so their agent work is visible only through trailers, bot authors or pushed git-ai notes. Anything else they committed shows as **unknown**, never as human.
- [ ] R7. `commet hook install` adds a git post-commit/post-merge hook and a Claude Code hook that refresh the snapshot and record session events (hashes and safe metadata only) to `.git/commet/events.jsonl`. It asks before writing to `.git/hooks/` or `.claude/settings.local.json`, chains existing hooks rather than replacing them, and `commet hook remove` undoes it.
- [ ] R8. Factory-verifiable: golden snapshots on fixture repos, layout property tests, a deterministic render mode for golden images, draw-call budgets. A frame is a pure function of (snapshot, chart state, camera, frame number).
- [ ] R14. Hardened local server. `commet open` binds 127.0.0.1 only, rejects requests whose Host header isn't localhost (blocks DNS rebinding), requires a per-launch secret token from the opened URL, sends no CORS headers, and accepts writes only for chart state and beacons. It pushes live updates when the snapshot changes. Must pass the builder-security check before merge.

**Candidates (approved 2026-11-04)**
- [ ] R9. Co-change constellations: lines between files that usually change together, from git history only. If a change touches a file but not its usual partner, flag the partner: "usually changes with X (not touched)". Deterministic, documented thresholds.
- [ ] R10. Captain's log beacons: an optional one-line note when charting, shown as a beacon on the planet. Stored in `.git/commet/beacons.json` (not git notes, which attach to commits and can be pushed).
- [ ] R11. Terminal mode: the snapshot as an ASCII view (reusing ascii-fx), showing fog, drones and beacons. Doubles as a screen-reader fallback. Exempt from the live-3D art rule.
- [ ] R12. Status message: an on-demand, deterministic pixel star chart plus a text summary for a day or week (what changed, by which sessions, what's still uncharted). You share it manually, after a preview that lists everything it reveals (paths, branch names, models), with an option to redact paths and branches. First use: daily hackathon posts about Commet's own repo and factory. No scores.
- [ ] R13. Space debris (human, 2026-11-04). Old unmerged branches and stale PRs drift as debris near the planets they touch, so you can see how tidy your versioning and PR habits are.
  - Debris classes (thresholds are deterministic, documented and configurable):
    - **stale PR**: open, no activity for 14+ days
    - **abandoned branch**: not merged into the default branch, last commit 30+ days ago
    - **merged-but-not-deleted branch**: merged, branch still exists
    - **orphaned agent worktree or branch**: an agent session's branch or `.git/worktrees` entry that never merged
  - Size scales with diff size, and visible decay (rust, then broken pieces) shows age.
  - Data sources:
    - Local: `git for-each-ref`, `git branch --merged`, `git worktree list`, remote-tracking refs.
    - PRs: only through the opt-in, read-only GitHub token. Without it, branch debris still works.
  - Clicking a piece shows its age, its last commit, and which session or person created it, then gives a **copyable** cleanup command (`git branch -d …` / `gh pr close …`). Commet never deletes, closes or posts anything itself.
  - Shown as repo-level tidiness: total debris count and a rough mass figure. No per-person tallies.

## Week plan (human, 2026-11-04)
| Deadline | Ships |
|---|---|
| Nov 8 | R1, R2/R2b (v1 sources), R3, R4 (one system), R5, R8, R14 |
| Nov 15 | R7, R9, R10 |
| Nov 22 | R11, R12, Codex support |
| Nov 29 | VS Code extension, polish |
| Dec 2 | Demo |

R13 isn't scheduled yet.

## Open assumptions
- Scan time on large repos is unmeasured end to end (git/git numstat alone: 3.6 s for 2 years). Benchmark before fixing the first-run experience.
- Not yet designed (art direction): drones, fog, beacons, constellations, the suspicious-silence flag, debris, labels/UI.

## Flow
Agent session or merge → hook runs `commet scan` → snapshot → the local server pushes it to the web view (or terminal mode reads it) → unwritten-by-you changes render as fog, with drones → you open diffs to chart them → chart state saved in `.git/commet/`.

## Research
- Attribution: `docs/research/agent-attribution.md`
- Architecture and risks: `docs/research/technical-risks.md`
- Art direction: `docs/design/art-direction.md`
- Background (gitignored): `.archive/docs/research/codebase-map-failure-audit.md`, `.archive/docs/features/briefs/`

## Tasks
None yet.
