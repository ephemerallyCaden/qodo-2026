# Agent attribution from local signals (scout report, 2026-11-03)

**Bottom line:** we can reliably flag "committed by you, written by an agent" using only local data. The best signal is the agent's own session log, matched line by line against commits. **Probed on this repo: all 24 commits are authored as the human with no trailers, yet 20 of them had ≥90% of their added lines matched to Claude Code transcript edits.** Content heuristics can never reach high confidence.

## Claude Code transcripts (v2.1.31x, PROBED)
- **Location:** `~/.claude/projects/<cwd-slug>/<sessionId>.jsonl`.
- **Fields on every line:** `type, sessionId, timestamp, cwd, gitBranch, version, isSidechain, agentId, uuid, parentUuid`.
- **Edit/Write results** are in `toolUseResult`:
  - `{type: create|update, filePath, structuredPatch[{oldStart, oldLines, newStart, newLines, lines}]}`.
  - The same object also has `originalFile` (the full prior file). **Never read it.**
- **Bash edits:** `toolUseResult.bashEditDiff{files[{filePath, hunks}]}`.
- **Commits:** `toolUseResult.gitOperation.commit{sha, branch}` exists but is rare. Instead, match commit SHAs in the output of `git commit` runs. That linked 11 of 24 commits on this repo.
- **Subagents:** `<session>/subagents/agent-<id>.jsonl` and `.meta.json{agentType, description, toolUseId, spawnDepth}`.
- **Session records:** `ai-title`, `custom-title`, `agent-name`, `cost-state{totalLinesAdded, …}`.
- **Never read:** `last-prompt`, `history.jsonl`, `file-history/`, `api-request*`, `attachment`.
- **Retention:** `cleanupPeriodDays` defaults to **30 days**, so past history is covered for about 30 days only. A hook is needed to keep data going forward.

## Other tools
| Tool | Local data | Edit detail | Hooks |
|---|---|---|---|
| Codex CLI | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (`session_meta{id, cwd, git{commit_hash, branch}}`) | `PatchApplyEnd` unified_diff | `hooks.json` PostToolUse |
| Gemini CLI | `~/.gemini/tmp/<hash>/chats/session-*.jsonl` | `FileDiff` | AfterTool, SessionEnd |
| Cursor (PROBED) | `~/.cursor/ai-tracking/ai-code-tracking.db` (`scored_commits` with AI-vs-human line counts per commit); `state.vscdb` `cursorBlame:<sha>` | Counts only | `afterFileEdit`; adds a `Made-with: Cursor` trailer |
| Copilot (VS Code) | `chatEditingSessions/<id>/state.json` | File-level hashes | preview hooks |
| Kiro CLI (PROBED) | `data.sqlite3` `conversations_v2` → `file_line_tracker` | Per-file counts | — |
| Cline / Roo | `tasks/<id>/task_metadata.json` | Files only | PostToolUse |
| Windsurf | hook transcripts | old/new strings | yes |
| Aider / Amp | Add `Co-authored-by` trailers by default | — | — |

No tool documents or versions its log format. Hook payloads are documented and converging on Claude Code's field names.

## Hooks and git
- **Claude Code PostToolUse** receives `session_id, transcript_path, cwd, tool_name, tool_input, tool_response, tool_use_id`.
- **Local event log:** a hook can append to `.git/commet/events.jsonl` with no network access.
- **Git notes:** a `post-commit` hook can write a note under `refs/notes/commet`. The commit SHA doesn't change, and notes aren't pushed by default.
- **Rewrites:** `post-rewrite` plus `notes.rewriteRef` carry notes through amend and rebase.

## Existing standards and tools
- **Agent Trace** v0.1.0 RFC (Jan 2026): line ranges mapped to conversations, contributor type `human | ai | mixed | unknown`. No confirmed emitters, and the GitHub repo returned 404.
- **git-ai** already records authorship notes in `refs/notes/ai`, with session keys `s_<sha256("tool:conversation_id")[:14]>`, across 14 agents. **Commet should read these notes when present.**

## Ranked signals
1. Our own hook log written into git notes (very high confidence; from now on).
2. Existing git-ai notes (very high).
3. Transcript hunks matched to commit lines (**high**; covers the last ~30 days).
4. The agent ran `git commit` (high that the agent committed; doesn't say who wrote each line).
5. Trailers or bot authors (high when present; precision 75–90%).
6. Cursor vendor database (medium-high; counts only).
7. Copilot / Kiro / Cline file-level data (medium).
8. CLAUDE.md or AGENTS.md present in the repo (repo-level only).
9. Commit heuristics: **low**. AUC 0.79–0.86, which at a 6% agent share means ~2 of 3 flags are actually human.
10. Code-content detectors: **very low**. AUC 0.5–0.8, and renaming identifiers breaks them.

## Matching algorithm
1. Hash each added line, after normalising whitespace and skipping trivial lines (under 8 characters, lone braces).
2. Index by `(path, hash)` → `(session_key, ts)`.
3. For each commit, match each added line on the same path (following renames). The edit's timestamp must fall between the previous commit to that file and the commit date; fall back to author date.
4. **Last writer wins:** if several sessions match, the latest one before the commit owns the line. Naive matching gave 2–5 candidate sessions per commit.
5. Classify each line:
   - **verbatim:** exact hash match;
   - **agent-modified:** ≥0.6 similarity to an agent line;
   - **human:** otherwise.
6. Classify each commit:
   - **agent:** ≥90% of lines agent-attributed;
   - **mixed:** 30–90%, shown as a percentage;
   - **human with traces:** under 30%;
   - **unknown:** no logs cover that time window. **Never label this as human.**
7. Matching uses content, not SHAs, so it survives amend, squash and rebase.

## Per-session attribution (R2b)
- **Session IDs:**
  - Claude Code: `sessionId`. Subagents are `(sessionId, agentId)`, linked to their parent via `meta.toolUseId`.
  - Worktrees: group by `git rev-parse --git-common-dir`.
  - Others: Codex `session_meta.id`, Gemini `sessionId`, Cursor `conversationId`.
- **Safe to show by default:** start/end time, branch, model, tool version, kind (main / subagent / teammate), agentType, files touched, lines added/removed, linked commits.
- **Opt-in only:** `aiTitle`, `customTitle`, subagent description. These are model-generated from prompts, so medium risk.
- **Never show:** prompts or message text.
- **Session ↔ commit** is many-to-many with weights: `commit.sessions[{session_key, lines}]`.
- **Pseudo-session fallback** (no logs): same author (after mailmap), same branch, gaps ≤45 minutes. Label it "inferred work session".
- **Identity key:** `s_ + sha256("<tool>:<session_id>")[:14]`, compatible with git-ai. Subagents use `sha256("<tool>:<sid>:<agentId>")`. This key seeds the drone's name and sprite. It is unsalted so teammates resolve to the same identities; raw IDs never leave the machine.

> **Note (2026-11-04).** "Teammates resolve to the same identities" only applies to data that reaches your clone: pushed git-ai notes, trailers and bot authors. Teammates' session logs never reach your machine, so their agent work committed under their own name shows as **unknown** (R6).

## Data contract
```
AgentEditEvent { schema:"commet.edit/1"; event_id; tool; tool_version?; session_key; parent_session_key?;
  subagent_id?; agent_type?; model?; ts; repo_root; cwd_rel?; branch?; head_sha?; path;
  op: create|update|delete|rename; old_path?; capture: edit_tool|bash_diff|apply_patch|hook;
  source: transcript|hook|git_note|vendor_db;
  hunks[{old_start, old_lines, new_start, new_lines, added_hashes[], removed_hashes[]}] }
Session { session_key; tool; kind: main|subagent|teammate|pseudo; parent_session_key?; started_at; ended_at;
  branch?; model?; files_touched; lines_added; lines_removed; commits[]; title? (opt-in); inferred }
CommitAttribution { sha; class: agent|mixed|human|unknown; agent_line_share; sessions[{session_key, lines}];
  evidence[]; tier: very_high|high|medium|low }
```

## Privacy rules
- Open SQLite read-only (`mode=ro&immutable=1`).
- Read explicit field paths only. Cursor stores user content as JSON keys, so never walk all keys.
- Drop disallowed line types before parsing.
- Store line hashes as HMAC with a per-repo key.
- Cache in `.git/commet/` with mode 0600.
- No network.

## MVP (Day 1–2)
1. Trailers and bot authors.
2. Claude Code transcript ingest, including worktrees and subagents.
3. Matcher and Session records.
4. Read git-ai notes if present.
5. Optional: a PostToolUse hook that appends to `.git/commet/events.jsonl`.

**Defer:** Codex (next easiest), Gemini, Cursor and Copilot readers; writing git notes and rewrite handling; trailer injection; heuristics; Agent Trace export.

## Open questions
- Does a resumed Claude session keep its `sessionId`?
- Does PostToolUse `tool_response` include `structuredPatch`?
- Is `gitOperation` really that rare, or are we missing commits?
- Are the 3 partially matched commits actually human-written?
- Should Commet build on git-ai instead of its own hook?
