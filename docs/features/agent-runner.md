# Feature: Agent runner (the factory's first automated job)

## Status
Ready

## Trigger
Day 4 challenge, "Automate your factory's first job": a trigger (a schedule or a `ready-for-agent` tag) starts the agent with no session open. The agent reads the ticket and project rules, implements, runs checks against the acceptance criteria, opens a PR for Qodo review, investigates findings and fixes confirmed ones, then repeats the checks and review. It has a retry limit, stops for help when stuck, and never merges.

Human decisions (2026-11-09): a launchd schedule on the Mac plus the `ready-for-agent` label; first ticket is #24; Day 4 extras are "Commet sees the factory" and "stop path shown live".

## Requirements
- [ ] **R1 Trigger.** A launchd job on the human's Mac runs the runner every few minutes with no Claude session open. Each tick takes at most one ticket: the oldest open issue labelled `ready-for-agent`. Only one run happens at a time, and a tick with nothing labelled exits quietly.
- [ ] **R2 Claim.** Before any work the runner swaps the label to `agent-working` and comments on the ticket, so a second tick can't take it.
- [ ] **R3 Refuse.** A ticket without an `Acceptance criteria` section is refused before any agent starts: label `agent-needs-help` and a comment saying why.
- [ ] **R4 Work.** The agent runs headless in a fresh worktree under `.sandboxes/` on its own `agent/<N>-<slug>` branch, cut from the session branch. It reads the ticket, AGENTS.md and CLAUDE.md, implements the change, runs build, typecheck, lint and test, and commits following the house rules.
- [ ] **R5 PR.** The branch is pushed and a PR opened against the session branch (never `main`), with the ticket link and an acceptance-criteria table with evidence. Pushes use the human's own gh login so Qodo and CI fire as they do on the human's pushes.
- [ ] **R6 Review loop.** The runner waits for CI and for a completed Qodo review of the exact head commit, with a timeout. Open findings and failed checks go back to the agent, which validates each one (confirmed or rejected, with a reason), fixes the confirmed ones with a failing-first test, re-runs the checks, pushes and replies to the finding. A missing or timed-out review is never treated as clean (AGENTS.md "Working with Qodo").
- [ ] **R7 Retry limit.** At most 2 fix rounds. A third would-be round, a review or CI timeout, a failed agent call or expired credentials all stop the run with `agent-needs-help` and a comment naming the reason.
- [ ] **R8 Guardrails.** The runner never merges, never pushes `main` or the session branch, never force-pushes another branch, and never edits repo settings or secrets. The agent's tools are limited to what the job needs.
- [ ] **R9 End state.** A successful run ends with `agent-done` and a ticket comment summarising checks, review rounds, findings (confirmed or rejected) and retries used. Every run leaves a local log (gitignored) with timestamps for the Day 4 post.
- [ ] **R10 Offline tests.** The runner's decisions (pick, claim, refuse, retry limit, stop reasons, never-merge) are covered by tests that stub `gh`, `git`, `claude` and `qodo`, with no network.
- [ ] **R11 Install and uninstall.** One command loads the launchd job and one removes it. The human decides when it is loaded.
- [ ] **R12 Trust boundary.** The repo is public, so anyone can open an issue. The runner acts only on an issue the repo owner both opened and labelled; anything else is refused without starting an agent. The ticket text is snapshotted at claim time and the agent works from the snapshot. An edit to the issue during the run stops it.
- [ ] **R13 Pre-flight and timers.** Before claiming, the runner checks that Claude credentials (Midway), `gh` and `qodo` all work. If they don't, it logs the reason and leaves the ticket unclaimed. Every agent call and every wait has a wall-clock kill timer, so a hung login prompt can't stall the job.

### Day 4 demo (not runner code)
- [ ] **D1 Happy path.** Label #24 → the scheduled tick runs it end to end → PR with Qodo review → the human decides on the merge.
- [ ] **D2 Stop path shown live.** A deliberately bad ticket (no acceptance criteria) is refused with `agent-needs-help`, with no agent started.
- [ ] **D3 Commet sees the factory.** After the run, `commet scan` on this repo attributes the runner's commits to the headless agent session.

## Assumptions
- [x] **A1 Verified.** Headless `claude -p` works in a launchd-like minimal env (exit 0, 7 s, Bedrock). Midway expiry is a risk → R13.
- [x] **A2 Verified, with traps.** Completion is detectable via `qodo read pr-review-session findings --extended --json`, but `review_complete` is unreliable and a skipped review (`review_effort=skip`) renders as "no issues found".
- [x] **A3 Verified.** Qodo starts a run 5–12 s after a push made from a non-interactive process with the human's credentials.
- [x] **A4 Verified end to end.** A headless commit in a `.sandboxes/` worktree is classed agent (100%), even after the worktree is removed.
- [x] **A5 Verified while logged in.** The `gh` token lives in the keychain, reachable from a gui-domain LaunchAgent; not after a reboot before login [INFERRED].

## Flow
label `ready-for-agent` → launchd tick → runner: lock, pick oldest labelled issue → check ACs (refuse → `agent-needs-help`) → relabel `agent-working`, comment → worktree `agent/<N>-<slug>` from the session branch → `claude -p` (ticket + AGENTS.md + CLAUDE.md) implements, checks and commits → runner pushes, opens PR → wait for CI + Qodo on head SHA → findings? → agent fix round (≤ 2) → push → wait again → `agent-done` + summary comment, or `agent-needs-help` + reason → the human merges or not.

## Research
runner-scout, 2026-11-09 (tags as reported):
- **Claude:** call `~/.toolbox/bin/claude` (a stable symlink; the versioned binary auto-updates almost daily). Auth is Bedrock via `AWS_PROFILE` + ada/Midway (`~/.midway/cookie`, ~20 h lifetime); the wrapper may try `mwinit` when expired, which would hang without a TTY [INFERRED]. Plist PATH: `$HOME/.toolbox/bin:$HOME/.local/share/mise/installs/node/22/bin:/opt/homebrew/bin:$HOME/.qodo/bin:/usr/bin:/bin:/usr/sbin:/sbin`, plus HOME and USER (a plugin hook needs `node`).
- **Flags [PROBED]:**
  - Always pass `--permission-mode dontAsk` (the user default is `auto`).
  - `--allowedTools` / `--disallowedTools` work: a denied push still ends `subtype=success`, with `permission_denials[]` listing it.
  - `--max-turns`: when exceeded, exit 1 with `subtype=error_max_turns`.
  - `--max-budget-usd` and `--append-system-prompt` exist.
  - `--resume <session_id> -p` from the same cwd keeps the context.
  - JSON output fields: `subtype, is_error, result, session_id, num_turns, total_cost_usd, permission_denials, terminal_reason`.
  - Never pass `--no-session-persistence` (it breaks attribution, D3).
- **Qodo:** posts as `qodo-code-review[bot]` in one "Code Review by Qodo" issue comment, edited in place each round, with no check run. A hidden marker in the comment gives the reviewed commit SHA, but it moves before the findings land.
  - Use `qodo read pr-review-session findings --pr-url <url> --extended --json`. It returns `review_runs[]{commit_sha,status,review_effort,review_complete}` and `findings[]{id,action_level,attribution_status,location.file_path}`. OPEN means `pending|partial_implementation|not_implemented|focus_areas_edited`, and the output flags truncation with `qar_operation_result_truncated`.
  - Proposed done-check: the run with `commit_sha == head` has `status=completed`, the output isn't truncated, the marker equals the head SHA, and finding ids are stable on a poll ≥ 3 min after `started_at` [INFERRED settle].
  - `review_effort=skip` → stop with "review skipped". Blocking findings = OPEN with `action_level=action_required`. Poll every 60 s; time out after 30 min with "review incomplete".
- **CI:** clean when every check run on the head SHA is completed with conclusion success.
- **Push:** `git push` uses the osxkeychain helper from Xcode's system gitconfig. Prefer gh's token: `git -c credential.helper= -c credential.helper='!/opt/homebrew/bin/gh auth git-credential' push`.
- **Lock:** macOS has no `flock`; `/usr/bin/lockf -s -t 0 <lockfile> <cmd>` works, and the kernel releases the lock if the process crashes.
- **Labels:** none of the `agent-*` labels exist yet. `gh label create … --force`, `gh issue edit N --add-label … --remove-label …`, `gh issue list --label ready-for-agent --search "sort:created-asc" --limit 1`.
- **Side finding (Rule 1):** the scout's own headless `cd "$R" && git commit` in a temp repo was classed **human**. Possibly a false-human edge next to #11 → Bug Resolution Workflow.

## Tasks
- Runner (R1–R13) → feature agent `runner`, `.sandboxes/runner`, `feature/agent-runner` — In progress
- Demo D1–D3 → lead + human, after the runner merges
