# Commet: System Design (v1)

*Status: draft for implementation, 2026-11-04. Source of truth for scope: `docs/features/codebase-space-explorer.md`. Principles: `CONSTITUTION.md`. Visual rules: `docs/design/art-direction.md`, "Current spec" section.*

## 1. Overview

Commet turns a local git clone, plus the user's own agent session logs, into a deterministic snapshot. It renders the snapshot as a pixel-art star system where code you didn't write yourself is fogged until you review it.

**Goals (by requirement):** deterministic scan and snapshot (R1); confidence-ranked agent and session attribution (R2, R2b, R6); a stable, append-only layout (R3); the pixel view with planet focus, 2D map and reduced motion (R4); per-file fog and charting (R5); hooks (R7); factory-verifiable outputs (R8); and the hardened local server (R14). Later: co-change constellations (R9), beacons (R10), terminal mode (R11), status message (R12) and debris (R13).

**Non-goals (v1):**
- task tracking or assignment (scope rule);
- per-person scores of any kind;
- language parsers;
- blame (technical-risks #4);
- any network call other than the explicit, read-only GitHub opt-in (R13 only);
- writing git notes (`refs/notes/commet` stays reserved and unused in v1, because notes can be pushed, the same reasoning as R10);
- live presence;
- LLM comprehension questions;
- WebGPU.

## 2. Architecture

```
                       ┌───────────── user machine only ──────────────────────────────┐
 git repo ─────────────┤                                                              │
 (native git, -z)      │  src/scan  ── ingest ──► lineage (rename map, fileIds)       │
                       │            ── ls-tree/numstat ──► files, LOC, exclusions     │
 ~/.claude/projects/** │  src/attrib ─ allowlist parser ─► AgentEditEvent ─┐          │
 (read-only)           │            (HMAC line hashes)                     ▼          │
 refs/notes/ai (git-ai)│                                  .git/commet/events.jsonl    │
                       │                                   (append-only cache, 0600)  │
                       │  src/attrib/match ◄── events + commits ──► CommitAttribution │
                       │                                   + Session[]                │
                       │  src/core/snapshot ── canonical JSON ──► .git/commet/        │
                       │                                          snapshot.v1.json    │
 hooks (R7):           │                                                              │
  .git/hooks/post-commit, post-merge ─► `commet scan --quiet`                         │
  .claude/settings.local.json PostToolUse ─► `commet hook event` (append events)      │
                       │                                                              │
                       │  src/server (127.0.0.1, Host check, token, no CORS)          │
                       │    GET  /            static bundle (no repo data)            │
                       │    GET  /api/snapshot, /api/chart, /api/beacons, /api/diff   │
                       │    PUT  /api/chart   POST /api/beacons                       │
                       │    GET  /api/stream  (fetch-streamed SSE: snapshot-changed)  │
                       │          ▲ fs.watch(snapshot.v1.json)                        │
                       │          │                                                   │
                       │  web/ (Vite bundle): layout() → frame() → three.js           │
                       │         pixel canvas (320×180) + label canvas (native)       │
                       │  src/term (R11): snapshot + chart → ASCII on stdout          │
                       │                                                              │
                       │  local state .git/commet/: snapshot.v1.json, events.jsonl,   │
                       │    chart.json, beacons.json, key (HMAC, 0600), config.json   │
                       └──────────────────────────────────────────────────────────────┘
```

`src/core` is pure, isomorphic TypeScript (no `node:*` imports, no DOM), shared by the CLI, the terminal mode and the web bundle. Layout, fog and `frame()` live there, so the web view and terminal mode can't disagree.

## 3. Package layout

One npm package, `commet`. The `bin` is `dist/cli.js`, and `dist/web/` holds the built bundle.

```
src/core/        pure: types, canonical-json, hash (sha256 via @noble/hashes), prng (sfc32),
                 layout/, fog/, camera/ (pose math, no three), frame/ (FrameSpec), cochange/
src/scan/        node: git runner, lineage, files, exclusions, people, window, commits
src/attrib/      node: parsers/claude.ts, trailers.ts, gitai.ts, cache.ts, match.ts, sessions.ts
src/state/       node: .git/commet IO (atomic write, 0600), key.ts, config.ts
src/server/      node: http server, token, routes, watch
src/hooks/       node: install/remove/event
src/term/        node: ASCII renderer (R11)
src/cli/         node: argv parsing, commands, exit codes
web/src/         browser: main.ts, loop.ts, renderer/, scene/, shaders/, labels/, map2d/, ui/
test/            fixtures/build/*.ts, fixtures/claude/*.ts, golden/, property/, render/
factory/         gate.ts, qodo-triage.ts (Weeks 2–4)
```

Module boundaries are enforced with ESLint `no-restricted-imports`:
- `core` imports nothing outside `core`;
- `web` imports only `core`;
- `scan`, `attrib` and `server` never import `web`;
- only `src/attrib/parsers/*` may open files under `~/.claude`.

Key public interfaces:

```ts
// src/scan
export function scan(opts: ScanOptions): Promise<SnapshotV1>;
interface ScanOptions { repoDir: string; windowMonths: number /*24*/; maxFiles: number /*5000*/;
  ingest: boolean /*read agent logs into cache*/; hmacKey: Uint8Array; selfEmails: string[] }
export class ShallowCloneError extends Error {}        // → exit 3
// src/attrib
export function ingestClaude(commonDir: string, key: Uint8Array): AsyncIterable<AgentEditEvent>;
export function matchCommits(commits: CommitPatch[], events: AgentEditEvent[], cov: Coverage[]):
  Map<Sha, CommitAttribution>;
export function sessionKey(tool: Tool, id: string, agentId?: string): SessionKey;
// src/core
export function serializeSnapshot(s: SnapshotV1): string;           // canonical, byte-stable
export function layout(s: SnapshotV1): Layout;                       // pure
export function fog(s: SnapshotV1, c: ChartStateV1): FogState;       // pure
export function frame(s: SnapshotV1, c: ChartStateV1, cam: CameraState, n: number,
  opts: FrameOptions): FrameSpec;                                    // pure
// src/server
export function startServer(o: { stateDir: string; webRoot: string; port?: number }):
  Promise<{ url: string /* includes #t=token */; close(): Promise<void> }>;
```

## 4. Data contracts

```ts
type Sha = string; type IsoUtc = string;          // 'YYYY-MM-DDTHH:MM:SSZ', always UTC
type FileId = `f_${string}`; type DirId = `d_${string}`;
type PersonId = `p_${string}`; type SessionKey = `s_${string}`;
type Tool = 'claude-code' | 'codex' | 'git-ai' | 'trailer' | 'bot';

interface SnapshotV1 {
  schemaVersion: 1;
  generator: { name: 'commet'; version: string };     // never a scan timestamp
  repo: { repoId: string /*sha256(sorted root commit shas)[:16]*/; head: Sha; headDate: IsoUtc;
          branch: string; selfPersonIds: PersonId[] };
  window: { months: number; since: IsoUtc; until: IsoUtc /* = headDate */; firstParent: true };
  limits: { maxFiles: number; overflowFiles: number };   // overflow → asteroid belt
  exclusions: { rulesetVersion: string; rules: { id: string; kind: 'glob'|'attr'|'binary';
                pattern: string }[]; counts: Record<string, number> };
  coverage: { tool: Tool; from: IsoUtc; to: IsoUtc }[];  // when logs could have seen edits
  dirs: { id: DirId; path: string; depth: 0|1|2; parent?: DirId; bornSeq: number;
          bornDate: IsoUtc }[];                          // depth 0 = synthetic root planet
  files: { id: FileId; path: string; aliases: string[]; dirId: DirId; loc: number;
           bornSeq: number; overflow: boolean; fogSeq: number | null }[];
  people: { id: PersonId; displayName: string; isSelf: boolean; isBot: boolean }[];
  commits: { seq: number; sha: Sha; date: IsoUtc; authorDate: IsoUtc; author: PersonId;
             subject: string; files: [fileIdx: number, added: number, removed: number,
             agentLines: number][]; attribution: CommitAttribution }[];   // first-parent order
  sessions: Session[];
  coChange?: { a: FileId; b: FileId; support: number; confAB: number; confBA: number }[]; // R9
}
interface CommitAttribution {
  class: 'agent' | 'mixed' | 'human' | 'unknown';
  agentLineShareMilli: number;          // integer 0..1000; no floats anywhere in the snapshot
  sessions: { sessionKey: SessionKey; lines: number }[];
  evidence: { kind: 'transcript_match'|'trailer'|'bot_author'|'git_ai_note'|'hook_event'
              |'agent_ran_commit'; detail: string /* enum-like token, never free text */ }[];
  tier: 'very_high' | 'high' | 'low' | 'none';
  selfCommittedAgentWritten: boolean;   // "committed by you, written by an agent"
}
interface Session {
  key: SessionKey; tool: Tool; kind: 'main'|'subagent'|'teammate'|'pseudo';
  parentKey?: SessionKey; agentType?: string /*allowlisted enum*/; startedAt: IsoUtc; endedAt: IsoUtc;
  branch?: string; model?: string; toolVersion?: string; filesTouched: number;
  linesAdded: number; linesRemoved: number; commits: Sha[]; inferred: boolean; seed: number /*uint32*/;
}
// .git/commet/events.jsonl: one per line, canonical JSON, sorted by (ts, eventId) on read
interface AgentEditEvent {
  schema: 'commet.edit/1'; eventId: string /*sha256(tool:session:toolUseId|uuid)[:16]*/;
  tool: Tool; toolVersion?: string; sessionKey: SessionKey; parentSessionKey?: SessionKey;
  agentType?: string; model?: string; ts: IsoUtc; repoId: string;   // NOT repo_root
  branch?: string; headSha?: Sha; path: string /*repo-relative POSIX*/;
  op: 'create'|'update'|'delete'|'rename'; oldPath?: string;
  capture: 'edit_tool'|'bash_diff'|'apply_patch'|'hook'; source: 'transcript'|'hook'|'git_note';
  hunks: { oldStart: number; oldLines: number; newStart: number; newLines: number;
           addedHashes: string[]; removedHashes: string[] }[];  // HMAC-SHA256(key,line)[:16]
}
interface ChartStateV1 { schema: 'commet.chart/1'; repoId: string; baseline?: { sha: Sha };
  charted: Record<FileId, { sha: Sha /*HEAD when charted*/; via: 'diff'|'quiz' }> }
interface BeaconsV1 { schema: 'commet.beacons/1';
  beacons: { id: string; target: FileId | DirId; text: string /*≤120, plain*/; sha: Sha }[] }
```

**Must never appear** in the snapshot, the cache, the chart or beacons:
- absolute paths, `cwd`, home directories, `repo_root`;
- source code lines (only HMAC hashes, and only in the cache; **line hashes never enter the snapshot**);
- prompts or message text, `aiTitle`/`customTitle` (opt-in later, not v1), and subagent descriptions;
- raw session IDs (only `sessionKey`);
- emails (only `PersonId` hashes);
- wall-clock time.

Commit subjects are git data the user already has, so they're allowed. The R12 preview lists them.

## 5. Algorithms

Determinism applies throughout:
- Git always runs with `LC_ALL=C`, `-c core.quotepath=off -c diff.renameLimit=4000 -c log.showSignature=false -c log.showRoot=true -c diff.submodule=short --no-ext-diff --no-textconv --no-color --use-mailmap -z` (the full pin list is `CONFIG` in `src/scan/git.ts`). Results never depend on user diff config.
- Sorting is by codepoint (`localeCompare` is lint-banned).
- `canonicalJson` sorts keys and rejects non-integer numbers.

### 5.1 Git ingestion
1. **Preflight.** If `git rev-parse --is-shallow-repository` is true, refuse with exit 3 and print `git fetch --unshallow`. Commet never fetches.
2. **Anchor.** `until = HEAD %cI` converted to UTC, and `since = until − windowMonths` (calendar months, UTC). The wall clock is never read.
3. **Lineage pass** over *full* first-parent history: `git log --first-parent -m --reverse --name-status -M50% --format=%H%x00%cI`.
   - It's cheap: 0.53 s for 2 years of git/git, and it doesn't need numstat.
   - It's needed because IDs must not depend on the sliding window.
   - `fileId = 'f_' + sha256(birthPath + '#' + birthOrdinal)[:12]`, where `birthOrdinal` counts earlier births at the same path. That makes it rebase-proof, since no SHA is involved.
   - Rename (`R`) rows carry the ID forward. Copies (`C`) are new births.
   - Never use `--follow`.
   - `dirId` uses the same scheme. A directory move transfers its `dirId` when ≥50% of its files move together within one commit.
4. **Ground truth** is `git ls-tree -r -z HEAD`. Every file at HEAD exists and nothing else does, which fixes deletions made inside merges.
5. **LOC and binary.** One call: `git diff --numstat -z <empty-tree> HEAD`. A `-` row means binary, so the file is excluded.
6. **Exclusions.** A built-in ruleset (versioned `rulesetVersion`) covers vendor, `node_modules`, `dist`, lockfiles and minified files. On top of that, `git check-attr -z --stdin linguist-generated linguist-vendored binary`. All rules and counts go into the snapshot.
7. **Window commits.**
   - `git log --first-parent -m --numstat -M --since=<since> HEAD` gives per-file added and removed lines.
   - Trailers come from `%(trailers:key=Co-authored-by,valueonly)` and the `Made-with` trailer, normalised to a tool token.
   - Bot authors match `[bot]` or noreply bot patterns.
   - Commits touching more than 200 files are kept, but get `bulk` evidence and are excluded from co-change.
8. **File cap.** Rank files by `(lastTouchedSeq desc, path asc)`. The top 5,000 are in. The rest get `overflow: true` and render as the asteroid belt.
9. **People.** `PersonId = 'p_' + sha256(lowercased mailmapped email)[:12]`. Self is `git config user.email` plus `config.json selfEmails`, canonicalised with `git check-mailmap "<user.name> <user.email>"` (the name matters for entries that match on name and email) and lowercased, so it compares equal to mailmapped commit authors. One comparison feeds matching, `people[].isSelf` and `selfPersonIds` (Issue #5 case 5).

### 5.2 Attribution matcher
1. **Discovery.**
   - Enumerate `~/.claude/projects/*/*.jsonl`, `*/subagents/agent-*.jsonl` **and `*/subagents/workflows/*/agent-*.jsonl`** (workflow subagents; found in the Day 1 build).
   - Before every read: refuse symlinks (`lstat`) and re-check the realpath against the deny list (Qodo PR #3 finding #2).
   - **Unreadable transcripts (Qodo PR #8 #2).** A transcript refused by that check (a symlink, a denied real path), or failing to open or read, could be this repo's. It's counted as unavailable, and its span becomes blind: from its birth time (the epoch when missing or later than the mtime) to its mtime. A symlink is not followed even to stat, and the file behind it can keep growing, so its span covers all time (Qodo PR #10 #6). The same holds when lstat fails. A readable transcript with no datable record is ignored.
   - Read the first allowlisted record carrying `cwd`, past the first line if needed. The head read covers the first 4 MiB; only a transcript with no `cwd` there is read on, one at a time, up to the 200 MiB file cap. Lines over the 4 MiB line cap are skipped. The span starts at the first timestamped record.
   - If that `cwd` still exists, resolve it with `realpath.native` (which also gives the on-disk case and resolves `/var` to `/private/var`). It's ours when its checkout is one of our worktrees, also compared by native realpath, or when `git -C cwd rev-parse --git-common-dir` resolves to our common dir.
   - If the `cwd` is gone (a deleted worktree), match by prefix against our worktree paths from `git worktree list` plus the repo root. A gone `cwd` outside them counts as another repo's.
   - **Path shapes (Qodo PR #8 #3).** Paths are judged by their own shape, not the host OS, so Windows logs read the same everywhere. A drive-letter (`C:\`, `C:/`) or UNC (`\\host\share`) path gets forward slashes, is absolute by `path.win32` rules (POSIX paths by `path.posix`), and compares case-insensitively. This applies to cwds, edit paths, worktree roots and native realpaths.
   - **Sessions started outside the repo (Qodo PR #8 #7).** A transcript whose live `cwd` is outside every worktree root may still edit the repo by absolute path. Checking one costs a chunked byte search for the repo roots as they appear in JSON strings: one needle per root not under another, plus the escaped-backslash form for a Windows root. Only on a hit does the bounded line reader parse results that name a root.
     - *Verdicts:* an allowlisted edit path under a root (outside `.git/`) makes it a **foreign** transcript, parsed with the repo roots only, so its `cwd` is neither a root nor an alias. It becomes an unattributed blind span when it can't be decided: a result naming a root can't be parsed, `readable()` refuses the file at inspection time (Qodo PR #10 #4), or the file is larger than the 200 MiB cap and nothing was found in the part read (Qodo PR #10 #1). Otherwise it's ignored.
     - *Fast path:* during discovery, only outside sessions whose span overlaps a self-authored, non-merge window commit are searched. The span runs from the first datable record (or the birth time, if earlier) to the mtime, and is unbounded when the mtime predates the first record. A session last modified before the window start can't overlap.
     - *Safety net:* the matcher has no lower bound on edit time, so an outside session that ended before a commit can still hold its lines. After matching, while any commit comes out `human`, every pending outside session that started by that commit's time is searched, parsed, and attribution re-run, until no new human commit appears. Skipping therefore never yields `human`. A repo with no human commits pays no further search.
     - *Known gap:* the byte search is case-sensitive, so an outside session that spells a Windows root in a different case is missed. Sessions inside the repo are compared case-insensitively and are unaffected.
     - *Known gap:* commits before the first transcript coverage (minus a day) have no patches, so a foreign session found by the safety net only adds coverage and evidence for later commits.
   - **Unattributed:** a transcript with no `cwd` in any record, or whose `cwd` can't be resolved (relative, realpath failure, or a git failure inside our tree), could belong to any repo. Its span, from its first and last timestamps, becomes a blind span and is counted in the summary.
   - Store the match method, never the `cwd`.
2. **Parse with the allowlist (§6).** Read `Edit`/`Write` `toolUseResult.structuredPatch`, `toolUseResult.content` (Write `create` only, hashed immediately and never stored), `bashEditDiff`, and `git commit` result SHAs (giving `agent_ran_commit` evidence with detail `git_commit_output`).
   - **Git commands (Qodo PR #6 #2).** `git commit -q`, or a command whose output is discarded, prints no SHA. So each Bash call's `input.command` is tested against one regex: `git` (after any `-C <dir>`, `-c k=v` or `--option`) followed by `commit`, `merge`, `cherry-pick`, `revert`, `am`, `pull` or `rebase`. It matches anywhere in a `&&`/`;`/pipe chain or a `bash -c` string. The command text is **only tested**: it is never stored, hashed, logged or output, and a privacy canary in a command guards this. A match marks every commit whose committer time falls in [call − 1 s, result + 1 s] as agent-run. The result is the one whose `tool_result.tool_use_id` names that tool use: one assistant record can hold parallel tool uses whose results arrive in any order, and that pairing also times edits. Any user record whose `tool_use_id` names the call closes its window, whatever the shape of `toolUseResult`. A failed or refused command logs a plain string there, and nothing is read from it except its existence (Qodo PR #8 #6). A call with no logged result runs until the file's mtime. The evidence is `agent_ran_commit` with detail `git_command`, used only when no output SHA linked the commit; the session is linked with 0 lines. The regex is over-broad on purpose (`echo git commit` matches), since it can only rule out `human`. In a transcript of this repo, any commit in the window counts, wherever the command pointed (`-C`, `cd`). In a **foreign** transcript, whose `cwd` is outside the repo, the window is added only when the command could act on this repo (Qodo PR #10 #5). The checked targets are `cd`/`pushd`, `-C` (attached or not), `--git-dir`/`--work-tree` and `GIT_DIR=`/`GIT_WORK_TREE=`. The window is added when one of them resolves under a root (absolute, or relative to the `cwd` and each earlier target, also through its realpath), or can't be resolved (`$VAR`, `~`, globs, substitutions). With no target, git runs in the outside `cwd`, so no window is added.
   - **Path mapping.** Edit paths are mapped onto real paths before being made repo-relative: under the session's `cwd`, onto `realpath.native(cwd)`; above it, onto the real root through the logical root alias. The alias is the logical `cwd` minus the `cwd`'s real repo-relative subpath, compared case-insensitively. So `/link/repo/README.md` lands from a `/link/repo/sub` session.
   - **Partial transcripts.** Some drops lose a record that could hold or time an edit. Each one is counted once per record and makes the transcript *partial*:
     - a line over the 4 MiB cap (an Edit of any file over ~2 MB, because `originalFile` comes along);
     - a malformed line;
     - an edit or commit result missing `sessionId`, `uuid` or `timestamp`, or an edit-capable call (`Edit`, `Write`, `MultiEdit`, `NotebookEdit`, `Bash`) missing `uuid` or `timestamp`, which can't be linked to or timed against its result;
     - an edit path that is relative, or absolute and inside any of the repo's paths (logical or real `cwd`, root alias, any worktree root), but still doesn't relativise. Checkout `.git/` internals are exempt.
   - The partial span is the transcript span joined with the span from the nearest datable record before the first drop to the nearest one after the last. Past either end, the file's birth time bounds it below (the epoch if the birth time is missing or later than the first record), and its mtime bounds it above.
   - Denylisted records, and edits outside every repo path (another repo, a home dotfile), are dropped deliberately and don't count.
3. **Normalise and hash.** Trim, collapse whitespace runs to one space, and skip lines under 8 characters or made only of brackets and punctuation. The hash is `HMAC-SHA256(key, line)[:16]`. The key is `.git/commet/key`: 32 random bytes made once by `src/state/key.ts`, the only randomness permitted, and it's an *input*. Tests inject a fixed key.
4. **Cache.** Events are appended to `events.jsonl` and deduplicated by `eventId`. The scan reads the cache, never the raw logs, so log expiry doesn't change past snapshots.
5. **Match.**
   - Only commits after `min(coverage.from) − 1 day` are fetched with `git log -p -U0 --first-parent`, which bounds the cost.
   - For each added line on file F in commit C, the candidates are events on F's lineage paths whose ts is ≤ `C.committerDate + 1 s`. Event ts is the tool-call record's time, not the result's. **There is no lower bound:** with parallel worktrees and fast-forward integration, the previous commit to F is often authored after C's edits. *(As built on Day 1; Qodo PR #3 #1 removed the author-date fallback.)*
   - **Last writer wins:** the owner is the max ts, with ties broken by `eventId` ascending.
6. **Line class (v1):** `verbatim` or `unmatched`. **Deferred:** `agent-modified`, through a keyed 64-bit SimHash per line (`addedSimhash?` is reserved in the schema), behind its own property test.
7. **Commit class.** One pure function, `classify()` in `src/core/classify.ts`, decides it from `counted`, `shareMilli`, `matched`, `ranCommit`, `isMerge`, `isSelf`, `covered` and `partial`. It has an exhaustive decision-table test and a property test. The first matching row wins:

   | Condition | Class | Tier |
   |---|---|---|
   | git-ai note or hook event *(T3, not built yet)* | `agent` or `mixed` (by share) | very_high |
   | Trailer or bot author *(T3, not built yet)* | `agent` | high |
   | Merge commit (two or more parents, from `%P`) | `unknown`: merged-in lines must never clear fog | none |
   | No countable added lines | `unknown` | none |
   | Share ≥ 900‰ | `agent` | high |
   | Share 300–899‰ | `mixed` | high |
   | Share under 300‰, author is self, `covered`, not `partial`, and no session ran it (no output SHA, no git command window) | `human` (any matched line means "with traces") | high |
   | Share under 300‰, anything else: not self (R6), outside coverage, in a blind or partial span, or `agent_ran_commit` | `unknown`, never `human` | none |

   An agent-run commit with share 0 (the agent wrote it with a heredoc, `sed -i` or codegen, then ran `git commit`) is `unknown` and keeps its `agent_ran_commit` evidence and session. The UI can show it as "committed by an agent session; authorship unverified" (Issue #5). **Residual risk, accepted:** an agent heredoc that a human later commits leaves no allowlisted signal, so it can still be `human`.

   **Coverage** is the union of per-transcript spans `[first record, last record] ± 5 min`, over the transcripts that were read. *Blind spans* come from transcripts that are oversized, unreadable or unattributed. *Partial spans* come from transcripts that dropped a record (item 2). A commit is `covered` when its committer time is inside coverage and inside no blind span; it can be `human` only if it's also inside no partial span. Matched lines count as agent evidence wherever they fall (Qodo PR #3 #6), so a share of 300‰ or more is `agent` or `mixed` even outside coverage. The scan summary prints the dropped-record and unattributed counts, with "never classed human", only when they're above zero.

   `selfCommittedAgentWritten = author ∈ self && class ∈ {agent, mixed}`.
8. Heuristics ("possibly agent", low tier) aren't in v1.

### 5.3 Sessions and drone seeding
- `sessionKey = 's_' + sha256('<tool>:<sessionId>')[:14]`, which is compatible with git-ai. Subagents use `'<tool>:<sid>:<agentId>'`, with `parentKey` taken from `meta.toolUseId`.
- Resumed sessions keep the same key if the `sessionId` persists. That's an open question in the research, so pin it with a fixture.
- `startedAt` and `endedAt` are the min and max event ts. The commits field is many-to-many, weighted by lines.
- **Pseudo-sessions:** self commits with no session match, grouped by author with gaps ≤ 45 min. `kind: 'pseudo', inferred: true`, labelled "inferred work session".
- **Seed:** `seed = u32(sha256(sessionKey)[0..4])`. It feeds `sfc32` and drives the drone's name syllables, sprite variant and orbit phase. This is decorative-but-identity: it's stable per session and encodes no other data.

### 5.4 Layout (pure, append-only)
- **Planets** are depth-1 dirs. Root-level files sit on a synthetic root planet (`d_root`) in reserved slot 0.
- **Ring:** `bucket = UTC quarter of bornDate`. The ring index is the rank of that bucket among non-empty buckets, sorted ascending. New buckets only append outward.
- **Radius:** `R0 + ringIndex × GAP`. `GAP` is at least 2× the clamped max planet radius (`radius = clamp(a·log2(1+loc))`), so size growth never forces a move.
- **Angle:**
  - Process dirs in `(bornSeq, id)` order.
  - Start at `θ = 2π·u32(hash(id))/2³²`. If it lies within `minSep` of a placed sibling, step θ by the golden angle until free. If the ring is full, overflow to a half-ring.
  - Earlier-born dirs are placed first, so **only newcomers ever move**.
  - Deleted dirs leave holes. Nothing compacts.
- **Moons** are depth-2 dirs around their planet, on the same scheme. Deeper dirs fold into their moon.
- **Surface features:**
  - Each planet has a fixed 256-cell lat/long grid, independent of size.
  - `cell = hash(fileId) mod 256`, linear-probed in `bornSeq` order.
  - Overflow files still *reserve* their cell, so crossing the cap never shuffles others.
  - Files beyond 256 per planet go to that planet's local belt.
- **Biome and ring style:** `hash(dirId)` picks from the biome table. Decorative only.
- **Properties (tests):** adding commits that only add files or dirs moves existing bodies by exactly 0. A rename preserves `fileId` and the cell. `layout(s)` is byte-equal across runs and platforms; positions are rounded to 1e-6 before any comparison.

### 5.5 Fog and chart state
- **Fogging changes.** A (commit, file) pair fogs the file when `author ∉ self || class ∈ {unknown, agent} || agentLines > 0`. `file.fogSeq` is the latest such commit's `seq`.
- **The rule:** `fogged(f) = fogSeq ≠ null && !(chartSeq(f) ≥ fogSeq) && !(baselineSeq ≥ fogSeq)`. `chartSeq` resolves the charted SHA to its `seq`. A SHA that isn't in the window (rewritten history or an old branch) counts as **not charted**, which is conservative.
- **Charting** means opening the file's diff: `charted[f] = {sha: HEAD}`. Any later fogging commit refogs the whole file automatically, because its seq is higher. A self-human edit doesn't refog.
- **Planets** clear when all their non-overflow files are clear. That's a derived count, not a score.
- **Baseline (needs the human's OK).**
  - Problem: everything outside log coverage is `unknown`, so first run fogs the whole repo.
  - Proposal: the first-run UI offers "Chart everything up to <HEAD short SHA> as my baseline". It's an explicit action, recorded as `baseline.sha`, and can be undone. Nothing happens silently.
- Chart state carries no timestamps, so `fog()` is a pure function of its two inputs.

### 5.6 Co-change (R9, sketch)
- **Input:** window commits with 2 to 30 non-excluded files.
- **Pair metrics:** for each file pair, `support`, `confAB = support/count(A)` and `confBA`.
- **Edges:** keep pairs with `support ≥ 5 && max(conf) ≥ 0.6 && jaccard ≥ 0.3`, then the top 3 partners per file by `(conf desc, support desc, id asc)`. All thresholds live in `core/cochange/thresholds.ts` and are recorded in the snapshot.
- **Silence flag:** for the commits since `chartSeq`, if A was touched and its partner B wasn't, show "usually changes with B (not touched)".
- Edge count is capped at 2,000.

## 6. Privacy enforcement

1. **Allowlist parser** (`src/attrib/parsers/claude.ts`).
   - Before `JSON.parse` of a line, a cheap prefix scan drops records whose `type` is `last-prompt`, `attachment` or `api-request*`.
   - After parsing, a typed extractor copies only these explicit paths: `type, sessionId, timestamp, cwd (first line, in-memory only), gitBranch, version, isSidechain, agentId, uuid, toolUseResult.{type, filePath, structuredPatch[].{oldStart,oldLines,newStart,newLines,lines}}, toolUseResult.bashEditDiff.files[].{filePath,hunks}`, the commit SHA regex on Bash results, `message.content[].{type,name,id}` (tool uses), `message.content[].{type,tool_use_id}` (tool results), and `message.model`. The two IDs pair each tool use with its own result (Qodo PR #6 #7). They stay in memory and are never output.
   - A `toolUseResult` that is a plain string (an error) is never read; its record only closes a pending git call (§5.2.2).
   - `message.content[].input.command` of a Bash call is the one exception: it is tested against the git-commit regex (§5.2.2) and never stored, hashed, logged or output. For a foreign transcript, it is also scanned in memory for the directories git is pointed at, to decide whether the command targets this repo. Only that yes/no answer is kept.
   - `lines` are hashed immediately and the strings are discarded.
   - It never walks keys and never touches `originalFile`.
   - Line length is capped at 4 MB and file size at 200 MB. Over-cap and malformed lines that could hold an edit are counted, skipped, and make their transcript's span partial (§5.2.2).
   - `history.jsonl` and `file-history/` are never opened. A path denylist is asserted in tests.
2. **Read-only SQLite** (Cursor and Kiro, later): open with `file:…?mode=ro&immutable=1` through a wrapper that is the only SQLite import. Queries are named constants, and there's no `SELECT *`.
3. **Lint rules** (`eslint.config.js`), applied in `src/{core,scan,attrib}` and `web/src/{scene,renderer,frame}`:
   - `no-restricted-properties` bans `Math.random`, `Date.now`, `performance.now` and `crypto.randomUUID`;
   - `no-restricted-syntax` bans `new Date()` without arguments and `localeCompare`.
   - Exceptions are file-scoped: `src/state/key.ts`, `src/server/token.ts`, and `web/src/loop.ts` (the one clock read).
4. **Leak tests** (`test/privacy.test.ts`):
   - Synthetic logs plant canaries (`CANARY_PROMPT_7f3a`, `CANARY_ORIGINAL_9b1c`, `/Users/canary-home/…`, a code line `const CANARY_CODE = 1;`) in prompts, `originalFile`, `last-prompt`, `attachment` and `cwd`.
   - Run `scan` and assert that no canary, home directory, repo absolute path or `/^([A-Za-z]:\\|\/|~)/` path value appears in the snapshot, the events cache, stdout or stderr.
   - The test fails if the fixture loses its canaries, which guards against a vacuous pass.
   - A commit subject planted with `/Users/canary-home/…`, `C:\Users\…`, `~/…` and a de-rooted home dir must not appear in any output (Qodo PR #8 #4).
5. **Commit subjects** are repo text, but they can carry private paths. Before they reach the snapshot or the summary, `redactPaths()` replaces private paths in each whitespace-separated word with `<path>` (Qodo PR #8 #4):
   - An absolute, `~`, drive-letter or UNC path is redacted wherever it starts a word, or follows one of `=:,;(<[{'"` `` ` `` `@` inside it (`--prefix=/home/alice/app`, `path:/Users/bob/x`), up to the word's end. This holds whoever's path it is (Qodo PR #10 #7).
   - A de-rooted home or temp dir (`Users/me/x`, `tmp/x/y`) is matched by whole segments, with the same rules as `metaToken`.
   - Home and temp dirs are split on `/` and `\`. A Windows-shaped one drops its drive segment and compares case-insensitively, so `Users\Alice\secret.txt` is redacted for `C:\Users\Alice` (Qodo PR #10 #2).
   - Plain relative paths (`src/x.ts`) are kept, as are brackets, quotes and trailing punctuation around a redacted path.
6. All `.git/commet/*` files are mode 0600, the directory is 0700, and writes are atomic (tmp + rename). The state dir is lstat-checked: created with 0700 when absent, and a symlink or non-directory there is refused with exit 5, so state is never written or chmodded through a planted link (Qodo PR #8 #5). When two first scans race, the loser accepts mkdir's EEXIST and lstat-checks the path again, so a link planted in the race is still refused (Qodo PR #10 #3).

## 7. Rendering architecture

**What the mockups proved:**
- The asset viewer showed the canvas can *be* the internal resolution (320×180, `antialias:false`, `setPixelRatio(1)`), with a CSS integer upscale and `image-rendering: pixelated`.
- Shaders emit exact ramp colours, so no post-pass is needed.
- The SDF astronaut, mass-shaded instanced clouds, 1 px ring points, loop lock and SwiftShader headless determinism all work.
- The camera mockup showed `pose → quantise → render`, whole-pixel pan snapping (99.8% pixel match on a 3 px pan), ortho astronaut ray patching, and crawl metrics: ortho-snapped orbit 2%, ortho-free 14%, perspective 23%.

**Pixel pipeline:**
- Scene layers: stars, then planets, clouds and shadows, rings, moons, features, fog, drones and beacons. The label overlay is a separate 2D canvas.
- No global palette quantisation (conflict 1). Every shader calls a shared `depthFade(worldPos, uEye)`. `uEye` is a uniform, never `cameraPosition`, because under ortho `cameraPosition` sits 400 units back.
- The pixel-smooth fade is the only off-palette output.
- Ramps are uploaded as one `DataTexture` built from `V2_PLANET_RAMPS` and BLK 36, ported as data from `planet-ramps.js` and `palette-map.js`.

**Camera abstraction** (`src/core/camera`, pure; adapter in `web/src/renderer/camera3.ts`):
```ts
interface CameraPose { target: Vec3; yaw: number; pitch: number; dist: number }
interface CameraMode {
  id: 'ortho-snapped' | 'ortho-free' | 'perspective';
  quantise(p: CameraPose, vp: { w: number; h: number }): CameraPose;       // pure
  eye(p: CameraPose): Vec3;                                               // depth/star eye
  projection(p: CameraPose, vp): { kind: 'ortho'|'persp'; viewHeight: number; fov?: number };
  step(p: CameraPose, input: CameraInput): CameraPose;                    // drag/zoom/keys
  transition(a: CameraPose, b: CameraPose, reducedMotion: boolean): (u: number) => CameraPose;
}
interface CameraState { mode: CameraMode['id']; pose: CameraPose }
```
The default mode is `ortho-snapped` until the human picks. The other two are registered behind `?camera=`. The `step()` and `transition()` semantics are what differ per mode, and nothing else imports mode specifics.

**Labels:**
- Drawn on a native-resolution 2D canvas with the bitmap font (port of `font.js` MICRO/BIG glyph tables) at integer scale.
- Anchors come from `project(worldPos)` snapped to device pixels. The text is never parsed as HTML.
- Only the focused planet, its moons and its features get labels, at most 50.
- Diffs and panels use DOM `textContent` only.

**Instancing budget** (per frame, largest fixture):

| Layer | Draw calls |
|---|---|
| Planets (one `InstancedMesh`, per-instance seed and biome) | 1 |
| Clouds and cloud shadows | 2 |
| Rings (Points) | 1 |
| Moons | 1 |
| Features | 1 |
| Fog | 1–2 |
| Drones | 1 |
| Beacons | 1 |
| Constellations (`LineSegments`) | 1 |
| Belt and debris | 2 |
| Stars | 1 |
| Astronaut (focus only) | 1 |

That's ≤ 20 typical, with a **hard budget of 100 draw calls and ≤ 50k instances**. The asset viewer uses per-planet meshes, so porting it to instancing is real work (T7).

**`frame(snapshot, chart, camera, n, opts) → FrameSpec`:**
- Pure. It returns typed arrays of instance attributes plus a uniforms record.
- `t = (n mod LOOP_FRAMES) / 30`, with `LOOP_FRAMES = 720` (24 s).
- The renderer only uploads FrameSpec. It holds no logic.
- Live mode: `web/src/loop.ts` computes `n` from `performance.now()`.
- Test mode: `?frame=N&cam=<base64 pose>&fixture=<name>` plus `window.__commet.renderFrame(n): Promise<ImageData>`, using `preserveDrawingBuffer` in test builds only.

**Reduced motion** (`prefers-reduced-motion` or a toggle): `n` is fixed at 0, rendering happens only on input or data change, transitions are cuts, and the drone idle and fog wavefront are frozen.

**2D map toggle:** a top-down orthographic projection of `layout()` drawn in Canvas2D: crisp discs sized by LOC, fog as a flat hatch, bitmap labels. It's a separate format per art direction §10, and it's also the no-WebGL fallback.

## 8. CLI and UX

| Command | Purpose | Key flags |
|---|---|---|
| `commet scan` | Writes `.git/commet/snapshot.v1.json` | `--window 24` (months), `--max-files 5000`, `--no-ingest`, `--out <file>`, `--quiet`, `--bench` |
| `commet open` | Scans if stale, serves, opens the browser | `--port <n>`, `--no-browser`, `--camera <mode>` |
| `commet hook install` / `hook remove` | R7 | `--yes`, `--git-only`, `--claude-only` |
| `commet hook event` | Internal; reads the PostToolUse JSON from stdin | |
| `commet term` | R11 | |
| `commet status` | R12 | `--day`, `--week`, `--redact-paths`, `--redact-branches` |

**Exit codes:**

| Code | Meaning |
|---|---|
| 0 | OK |
| 1 | Internal error |
| 2 | Usage error |
| 3 | Shallow clone refused |
| 4 | Not a git repo, or no HEAD |
| 5 | State or schema error (corrupt or newer `.git/commet` file) |
| 6 | Server bind failure |
| 7 | User declined a hook prompt |

**First run.** `npx commet open` prints progress to stderr, then a summary. For example:

> 312 files (41 excluded: lockfile 3, binary 12, generated 26), window 2024-11-04→2026-11-04, 46 commits: agent 31 · mixed 6 · human 2 · unknown 7. Claude Code logs cover 2026-10-06→2026-11-04. Logs expire after 30 days; run `commet hook install` to keep coverage.

The browser then shows the baseline prompt (§5.5).

**Hooks.** `hook install` shows the exact lines it will write. Existing `post-commit` and `post-merge` hooks are chained: the original is renamed to `*.commet-chained` and called first, and its exit code is preserved. The Claude entry is merged into `.claude/settings.local.json` with a `"commet"` marker. `remove` restores the hooks byte-for-byte.

## 9. Local server (R14)

**Threats:**
1. Malicious websites in the user's browser: CSRF, DNS rebinding, cross-origin reads.
2. Other local users or processes reaching loopback.
3. Hostile repo content (paths, subjects) reaching the UI.
4. Path traversal through static serving.

**Controls:**
- **Bind:** `127.0.0.1` literally, never `localhost`, `0.0.0.0` or `::`. Default port 4319, with fallback to an ephemeral port.
- **Host check:** reject with 421 unless `Host ∈ {127.0.0.1:<port>, localhost:<port>}` exactly.
- **Token:** 32 bytes from `crypto.randomBytes` per launch, delivered in the URL **fragment** (`#t=`), so it never appears in logs or Referer.
  - The app sends it as `Authorization: Bearer` on every `/api/*` call, checked with `timingSafeEqual`.
  - Static assets contain no repo data and need no token.
  - EventSource can't send headers, so the live stream uses `fetch` plus a ReadableStream.
- **No CORS headers at all.** A cross-origin preflight for `Authorization` therefore fails.
- **Request checks:** if `Origin` or `Sec-Fetch-Site` is present, it must be same-origin. Writes require `Content-Type: application/json` and a body ≤ 64 KB.
- **Response headers:** `Content-Security-Policy: default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `Cache-Control: no-store` on the API.
- **Static serving:** a precomputed `Set` of files under `dist/web`, built from the Vite manifest at startup. Any other path returns 404. Paths are never joined from the URL.
- **Endpoints:**

  | Endpoint | Behaviour |
  |---|---|
  | `GET /api/snapshot` | Returns the snapshot |
  | `GET /api/chart`, `GET /api/beacons` | Return local state |
  | `GET /api/diff?fileId=` | Runs `git diff <charted\|baseline\|window-start>..HEAD -- <path from snapshot>`. Argv only, never a shell. The fileId must exist in the snapshot. Output is streamed and never persisted. |
  | `PUT /api/chart` | Schema-validated. Every fileId must exist, and the SHA must equal the current HEAD. |
  | `POST /api/beacons` | Text ≤ 120 characters, control characters stripped, target must exist |
  | `GET /api/stream` | Sends `snapshot-changed {head}` when `fs.watch` sees the snapshot change (debounced 250 ms) |

  Every other method or path returns 404 or 405.

**Builder-security check (must pass before merge):**
1. A socket test proves the server isn't reachable on a non-loopback interface.
2. A `Host: evil.example` request gets 421.
3. Missing or wrong tokens get 401 on every `/api/*` route.
4. No `Access-Control-*` header on any response.
5. A cross-origin `Origin` on writes gets 403.
6. Traversal attempts (`/../`, `%2e%2e`, absolute paths) get 404.
7. The token doesn't appear in any log line or response body.
8. Diff and file arguments can't be injected: `--output=` and `-` prefixes are rejected.
9. The CSP header is present.
10. The state files are 0600.

These live as `test/server/security.test.ts`, and the PR description lists the results as text.

## 10. Testing strategy and factory gates

- **Fixture repos** come from `test/fixtures/build/*.ts`. Each one is a git script with fixed `GIT_AUTHOR_*`/`GIT_COMMITTER_*` dates, `init.defaultBranch=main` and `commit.gpgsign=false`. Scenarios:
  - rename, rename-and-edit, and a path re-created after deletion;
  - a delete inside a merge;
  - a directory move (≥50%);
  - a bot author and a `Co-authored-by` trailer;
  - lockfile, binary, and `linguist-generated`;
  - unicode and space paths, plus root-level files;
  - a repo over the cap (6k files);
  - a shallow clone (`git clone --depth 1 file://…`).
- **Synthetic Claude logs** come from `test/fixtures/claude/*.ts`: the v2.1.31x shape with subagents, a resumed session, a Bash edit diff, a `git commit` result, and the canaries (§6). One hand-scrubbed real sample per parser version pins the format.
- **Golden snapshots** are byte-exact `test/golden/*.snapshot.json`. An update needs the `UPDATE_GOLDEN=1` env var plus a `Golden-Update: <reason>` line in the commit message, which CI checks.
- **Property tests** use fast-check, with fixed seeds for CI reproduction:
  - append-only layout;
  - rename keeps the ID;
  - scanning twice gives identical bytes;
  - shuffling the event cache order gives the same output;
  - a faked `Date` gives the same output;
  - charting never adds fog;
  - a fogging commit refogs exactly the files it touched.
- **Golden images:**
  - Playwright runs in a pinned `mcr.microsoft.com/playwright@sha256:…` image with `--use-gl=swiftshader`. It reads the 320×180 internal canvas (not a page screenshot) at fixed frames 0, 180 and 360 for each camera mode.
  - Tolerance is 0 pixels in the pinned container. If flakes appear, allow ≤ 0.1% with a written justification.
  - **Anti-empty asserts:** ≥ 12 unique colours, and ≥ 5% of pixels that aren't space.
  - Each test also asserts off-palette pixels = 0 with the depth fade off.
- **Budgets:** draw calls ≤ 100, triangles ≤ 500k and instances ≤ 50k, read from `renderer.info`, plus scan time (§11).
- **CI** (`.github/workflows/ci.yml`):
  - Job `check` runs on Node 20 and 22: `npm ci`, lint, typecheck, unit/golden/property tests, `vite build`.
  - Job `render` runs in the container: golden images and budgets.
  - Job `report` posts a *text* summary to the PR: colour counts, draw calls, scan times, golden diffs as pixel counts. Qodo can't see binaries, so this is how visual results reach it.
- **Qodo per PR:**
  1. The feature agent runs `qodo review --base <session-head> --json` locally and fixes every `action_required` finding. Agents never populate the `decisions` field; the gate rejects any non-empty `decisions` field.
  2. The PR is opened, with `ignore_bot_pr=false` set.
  3. Triage uses `qodo read pr-review-session findings --pr-url … --json`. The result is accepted only if `status == completed`, `commit_sha == head` and `meta.coverage.complete`. A missing review means escalate.
  4. Each finding is fixed, or waived by the human with the waiver recorded in JOURNAL.

## 11. Performance budgets

| Budget | Target | How it's measured |
|---|---|---|
| Scan, this repo | ≤ 2 s | `commet scan --bench` writes per-phase JSON timings to stderr |
| Scan, synthetic large fixture (5k files, 20k commits) | ≤ 8 s | CI bench job; fails on a regression over 50% from the stored baseline |
| Scan, git/git with a 24-month window | ≤ 15 s cold | Manual benchmark recorded in JOURNAL (open assumption in the feature doc) |
| Snapshot size, 5k files | ≤ 3 MB raw, ≤ 600 KB gzip | Asserted on the large fixture. The skeleton/chunk split is deferred, with the field reserved, until this budget breaks. |
| Web: snapshot load to first frame | ≤ 1.5 s | Playwright `performance.mark`, reported but not gated |
| Frame time | 60 fps at 1280×720 on integrated GPUs | Manual, via `?stats` |
| GPU usage | ≤ 100 draw calls, ≤ 50k instances, ≤ 50 labels | Gated in CI |
| Server | `/api/snapshot` ≤ 50 ms; stream push ≤ 500 ms after the write | Test |

## 12. Risks and open decisions

**Blocked on the camera choice:**
- `step()` and `transition()` per mode;
- whether ortho modes need the astronaut ortho-ray patch (yes for both ortho modes);
- artefact cell sizing, which assumes perspective;
- the golden image matrix.

Everything else is mode-agnostic. **Decided (human, 2026-11-04): perspective free flight.** Earlier recommendation was ortho-snapped (2% crawl, matches technical-risks #9). Use ortho-free only if the human rejects 45° yaw cuts. Perspective shimmers.

**Blocked on art direction:**
- **Drones:** v1 renders a placeholder: a 3 px BLK 36 glyph on an orbit seeded from the session, with no data beyond identity.
- **Fog:** the placeholder is a flat dark veil band at one depth step, plus a teal wavefront on charting (teal is reserved for events). The glyph-field candidate is still undecided.
- **Beacons, constellations, debris, warp, label/UI layout:** they keep the FrameSpec slots, and their shaders are placeholders until designed.
- **Risk:** a placeholder that looks like data. Every placeholder must encode its data or be absent.

**Other risks:**
- The Claude log format drifts (pinned fixtures; the parser reports a version mismatch as a warning, not silent loss).
- Matching slows down on huge patches (bounded to the coverage window).
- The Qodo trial ends around Nov 17 (confirm the hackathon licence).
- Constitution approval is pending.
- Instancing the asset viewer's per-planet shaders.
- The baseline-chart decision (§5.5).
- The SimHash `agent-modified` class (§5.2).
- Whether to build on git-ai notes instead of our own hook: v1 reads notes and writes `events.jsonl` only.

## Appendix A: Conflicts between source docs, with recommended resolutions
*Items marked **needs the human** wait on your OK; the rest are the team lead's call per the constitution.*

1. **Palette post-pass and dithering.** `technical-risks.md` §3 and the day1-hype mockup use a palette-quantisation post-pass with Bayer dithering. Art direction bans dithering and makes the per-pixel *smooth* depth fade the default, and that fade is off-palette by design. The asset viewer already proved the alternative: no post-pass, with shaders emitting palette colours directly. **Recommendation: adopt the asset viewer approach. No global quantise pass.**
2. **Depth fade default.** The asset viewer README says `pixel-stepped` is the default. Art direction (and the JOURNAL, 2026-11-04) say `pixel-smooth`. **Art direction wins.**
3. **Data in visual properties.** The asset viewer biome table gives biomes health meanings and says a wide ring means "shared lib". Failure audit D5 says craters mean bug-fix churn and rings mean tests. All of these conflict with "biomes are decorative". **Recommendation: biomes and rings are both hash-picked and decorative.**
4. **Orbit radius.** D5 says orbit radius should encode coupling. R3 and technical-risks say radius comes from the first-seen bucket. **The feature doc wins: radius is time-based, and co-change is shown as constellation lines (R9).**
5. **Hype GIF.** It draws labels inside the pixel pass and shows a "PR QUALITY 34→92" meter. That breaks principle 2 (no scores) and principle 4 (labels outside the pixel pass). **Don't port either.**
6. **`repo_root` in the event schema.** The research `AgentEditEvent` stores `repo_root`, which is an absolute path. **Replace it with `repo_id`.**
7. **Line similarity.** The research matcher asks for "≥0.6 similarity to an agent line", but we only keep HMAC line hashes, so similarity can't be computed. **v1 matches verbatim lines only, and the `agent-modified` class is deferred (§5.2).**
8. **The reviewer agent.** `.claude/agents/reviewer.md` is the 24-hour-hackathon template: "Do NOT flag missing tests, performance". That contradicts the factory gates. **Rewrite it in Week 2.**
9. **Your own old commits become fog.** R5 fogs "unknown", and R2 says your commits outside log coverage are unknown. So on first run the whole repo is fogged. **Recommendation: an explicit, user-initiated baseline chart (§5.5). Needs the human's OK.**
10. **Log discovery.** Your `~/.claude/projects/` has no slugs for the `.sandboxes/*` worktrees, and does have one for a subdirectory (`…-qodo-2026-docs-design-colour-research`). **Discover logs by the `cwd` field resolved to the git common dir, not by slug prefix.**
