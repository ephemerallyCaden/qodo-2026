# Agent providers: offline detection and drone references (scout report, 2026-11-10)

*Scout report for `docs/features/agent-drones.md`, verified from each tool's source, docs and public commits. Tags: [SOURCE], [DOCS], [PROBED], [INFERRED]. The per-group evidence (A1–A4, with permalinks) and the downloaded mascot references live in `<main-checkout>/.archive/docs/design/refs/agent-mascots/` (gitignored, local only). Checks of which tools are installed on the developer's machine are left out of this copy.*

**Decided (human, 2026-11-10):** custom drones for Claude Code, Cursor, GitHub Copilot, OpenAI Codex, Google (Gemini CLI, Antigravity, Jules), Devin, Kiro / Amazon Q, OpenCode and Qodo. Every other detected agent uses the generic drone with its name. Drones use BLK 36 only. The Copilot drone keeps the goggles: the human has GitHub's permission.

## Part A: verified so far

### git-ai (reference implementation, github.com/git-ai-project/git-ai @ 5420ab9, ~3k stars)
- **Notes ref:** `refs/notes/ai`, under **Git AI Standard v3.0.0** (`specs/git_ai_standard_v3.0.0.md`). [SOURCE]
- **Session key:** `"s_" + SHA256("<tool>:<conversation_id>")[0..14]`, the same as our identity key. Human keys are `h_` + 14 hex. [SOURCE spec L145–187]
- **`agent_id.tool` values:**
  - the spec lists `cursor, claude, windsurf, copilot, gemini, codex, amp, droid, pi, opencode`;
  - the README adds Continue, Junie, Rovo Dev and Firebender;
  - presets exist for `claude, codex, cursor, gemini, github_copilot/{cli,ide}, windsurf, amp, droid, opencode, cline, continue_cli, firebender, pi, ai_tab`. [SOURCE `src/commands/checkpoint_agent/presets/`]
- **Privacy:**
  - session records carry an optional `human_author` (an email), and `metadata.humans[].author` is `"Name <email>"`. Never output either.
  - Legacy prompt records (before v1.3.4) could carry a `messages` array (prompt text) and `messages_url`. **Never read `messages` or `messages_url`.** [SOURCE spec L238–271, E-002]
  - git-ai syncs notes on push and fetch, so teammates' notes can reach a clone (fits R6). [SOURCE README]
- **Bot author email map** (`src/authorship/agent_detection.rs` @ 5420ab9). Use it as Commet's seed table: [SOURCE]
  - `cursoragent@cursor.com` → cursor-agent
  - `*+copilot@users.noreply.github.com` (suffix match after the numeric id) → github-copilot-agent
  - `*+devin-ai-integration[bot]@users.noreply.github.com` → devin
  - `noreply@anthropic.com` → claude-web (**as the author email**; the same email appears in local Claude Code `Co-Authored-By` trailers [INFERRED], so treat author and trailer separately)
  - `noreply@openai.com` → codex-cloud
  - `roomote@roocode.com` → roo-background
- **GitHub login map:** `copilot-swe-agent[bot]`, `devin-ai-integration[bot]`, `cursor[bot]`. [SOURCE]
- **Runtime env detection** (`src/authorship/background_agent.rs`), useful only for a Commet hook running inside a cloud agent: `CLAUDE_CODE_REMOTE=true` → claude-web; `HOSTNAME=cursor` and `CURSOR_AGENT=1` → cursor-agent; `CODEX_INTERNAL_ORIGINATOR_OVERRIDE` / `CODEX_THREAD_ID` → codex-cloud; a Devin directory → devin; any `CLOUD_AGENT_*` / `GIT_AI_CLOUD_AGENT` variable. [SOURCE]

### Agent Trace
- v0.1.0 RFC, January 2026, hosted under the `cursor` GitHub org. [DOCS agent-trace.dev]
- Contributor types are `human|ai|mixed|unknown`. Storage is unspecified (files, git notes or a DB). [DOCS]
- Listed partners: Amp, Cline, Cognition, git-ai, Jules, OpenCode, Vercel, and others. [DOCS]
- `github.com/cursor/agent-trace` still returns 404. No confirmed emitters, so it's no v1 input. [PROBED]

### This repo [PROBED]
`git log --all`: 297 commits, all authored as the human (committers are the human or `GitHub <noreply@github.com>`). **Zero agent trailers.** The only trailers are `Golden-Update:`. Transcript matching is the only signal on our own repo.

---

## Part A matrix (consolidated from A1–A4 plus my own checks)

Tier uses R2's terms: **H** = high (logs, hooks, trailers, bot author); **M** = medium (counts or file-level only); **L** = heuristics; **U** = user-declared only. "git-only" means it can be detected from the clone alone, with no logs.

| Provider | Best offline signal | Exact trailer / author (default) | Local logs (safe fields) | Hook | git-ai | Tier |
|---|---|---|---|---|---|---|
| Claude Code | transcripts with hunks (already built) | `Co-Authored-By: <model, e.g. Claude Opus 5.5> <noreply@anthropic.com>` (default; no "Generated with" in commits; PR footer has it); web: author `Claude <noreply@anthropic.com>` + `Claude-Session:`; Action: `claude[bot] <41898282+claude[bot]@…>` (wrong id: GitHub shows github-actions) | `~/.claude/projects/…jsonl` | yes | yes | H |
| Cursor (IDE/CLI) | `ai-code-tracking.db` `scored_commits` **keyed by SHA** + trailer | `Co-authored-by: Cursor <cursoragent@cursor.com>` (since mid-2026, tool-added, default on); older `Made-with: Cursor` | `ai_code_hashes`, `agent-transcripts/` | `hooks.json` afterFileEdit… | yes | H |
| Cursor cloud | git-only author | `Cursor Agent <cursoragent@cursor.com>` (a USER account, id 199161495); PR by `cursor[bot]`; branch `cursor/*` | — | cloud | yes | H |
| Copilot cloud agent | git-only author | `copilot-swe-agent[bot] <198982749+Copilot@users.noreply.github.com>`; branch `copilot/*` | — | cloud | yes | H |
| Copilot CLI / app | trailer + `session-state/<id>/events.jsonl` (has `headCommit`, `filesModified`) | `Co-authored-by: Copilot <223556219+Copilot@…>` (default on, model-instructed); app: `Copilot App <223556219+…>` + `Copilot-Session: <uuid>` | `~/.copilot/session-state/`, `session-store.db` `session_files` | yes (also reads `.claude/settings.json`) | yes | H |
| Copilot in VS Code | trailer when enabled; `chatEditingSessions/state.json` file hashes | `Co-authored-by: Copilot <copilot@github.com>` (`git.addAICoAuthor`, default off; it was on 2026-04-16→05-03) | workspaceStorage | yes | yes | M (H with trailer) |
| Codex CLI | rollouts (`cwd`, `git{commit_hash,branch}`, `PatchApplyEnd` paths) + `state_5.sqlite` threads | `Co-authored-by: Codex <noreply@openai.com>` (prompt-only, server setting, often absent) | `~/.codex/sessions/…jsonl` | yes (trusted by hash) | yes | H |
| Codex cloud | bot email (two author names) | `199175422+chatgpt-codex-connector[bot]@users.noreply.github.com`; usual PR flow is human-authored, branch `codex/*` only | — | — | yes | H (bot) / L (branch) |
| Gemini CLI | chats JSONL with per-edit `filePath` + `diffStat` (no git fields) | none | `~/.gemini/tmp/<slug>/chats/` (30-day retention) | yes | yes | H session / M commit |
| Antigravity | hooks + trailer | `Co-Authored-By: Antigravity <noreply@google.com>` (about 34k commits) | `~/.gemini/antigravity*/` (`code_tracker` dir names give repo + SHA) | yes | ext only | H |
| Jules | git-only author | `google-labs-jules[bot] <161369871+google-labs-jules[bot]@…>` (default mode) | — | — | no | H / U ("User only" mode) |
| Devin (cloud, CLI, Desktop = ex-Windsurf) | git-only author + trailer | cloud author `Devin AI <158243242+devin-ai-integration[bot]@…>`; CLI `Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@…>` (default on, about 323k commits) | CLI SQLite (path TBD); Windsurf `.pb` is encrypted (don't) | yes (Devin and Windsurf hooks) | yes | H |
| OpenCode | `opencode.db` `session_v2` + per-step `snapshot.files[]` | none locally; GitHub agent `opencode-agent[bot] <opencode-agent[bot]@users.noreply.github.com>` | `~/.local/share/opencode/opencode.db` | plugins | yes | H |
| Cline | **`refs/cline/checkpoints/<sid>/<n>` in the repo (git-only)** + `sessions.db` + hooks with HEAD and branch | none | `~/.cline/data/sessions/sessions.db` (NEVER the `prompt` column) | yes | yes | H |
| Aider | git-only trailer | `Co-authored-by: aider (<model>) <aider@aider.chat>` (default since 0.85). A ` (aider)` committer suffix = HUMAN changes | none (history .md files are never-read) | none | no | H |
| Qwen Code | git-only trailer **+ `refs/notes/ai-attribution`** | `Co-authored-by: Qwen-Coder <qwen-coder@alibabacloud.com>` (deterministic) | `~/.qwen/projects/…/chats/*.jsonl` (cwd, gitBranch) | yes | no | H |
| Crush | trailer + in-repo `.crush/crush.db` `files(session_id,path,…)` | default `Assisted-by: Crush:<model>`; alt `Co-Authored-By: Crush <crush@charm.land>` | in-repo | yes | no | H |
| Mistral Vibe | `meta.json` has `git_commit`, `git_branch`, cwd | `Co-Authored-By: Mistral Vibe <vibe@mistral.ai>` (prompt, default on) | `~/.vibe/logs/session/` | yes | no | H |
| OpenHands | per-edit paths + hooks; cloud author | `openhands <openhands@all-hands.dev>` (user `openhands-agent`); trailer prompt-instructed | `~/.openhands/conversations/` | yes | no | H |
| Kilo Code | `kilo.db` per-step files; bot | `kiloconnect[bot]` (id 240665456, login `kilo-code-bot[bot]`); its trailer names the human | `~/.local/share/kilo/kilo.db` | plugins | no | H |
| Goose | `sessions.db` (no git, no file fields outside content) | none | `~/.local/share/goose/sessions/sessions.db` | plugin hooks (AfterFileEdit) | no | M (H with hook) |
| Continue (unmaintained) | `cn` trailer; IDE dev_data `editOutcome` | `Co-Authored-By: Continue <noreply@continue.dev>` (`cn` only) | `~/.continue/` | `cn` (Claude format) | yes | M / H |
| Zed agent | `sidebar_threads` metadata (ACP agents keep transcripts elsewhere) | none (its Co-authored-by lines are humans) | Zed `db.sqlite` | none | no | M |
| Roo Code (DISCONTINUED 2026-05-15) | Roomote bots | `roomote-v0[bot]` + `Co-authored-by: Roo Code <roomote@roocode.com>` | legacy globalStorage | none | email only | M / H (bot) |
| Kiro CLI / IDE | V3 hooks: **File Create/Save/Delete fire only for agent changes**; V2/V3 `~/.kiro/sessions/` (cwd, times) | none locally | classic `kiro-cli/data.sqlite3` `conversations_v2` (stale since 2026-09) | `.kiro/hooks/*.json`, `~/.kiro/hooks/` | no | H (hooks) / M (counts) |
| Kiro cloud agent | git-only author | `Kiro Agent <244629292+kiro-agent@users.noreply.github.com>`; PR `kiro-agent[bot]` | — | — | no | H |
| Amazon Q (CLI, IDE, GitHub agent) | Q CLI `amazon-q/data.sqlite3` `file_line_tracker` counts; IDE LokiJS history; GitHub agent author | `amazon-q-developer[bot] <208079219+…>`, messages start `[skip ci]` | `~/.aws/amazonq/history/` | CLI agent-config hooks (no session id) | no | M local / H bot |
| Amp | git-only trailer | **`Amp-Thread-ID: https://ampcode.com/threads/T-…`** + `Co-authored-by: Amp <amp@ampcode.com>` (default on); orbs author `Amp <amp@ampcode.com>` | server-side; cache `~/.local/share/amp/threads/` | plugin API (experimental) | yes | H |
| Factory Droid | git-only trailer + hooks | `Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@…>` (default on); cloud author `Factory: <org>` | `~/.factory/sessions/` | yes (Claude-like) | yes | H |
| Junie | trailer (undocumented) / Action identity / CLI hooks | `Co-authored-by: Junie <junie@jetbrains.com>`; Action `junie-agent <247260674+…>` | `~/.junie` (undocumented) | CLI EA (Claude-compatible) | via IntelliJ plugin | H / L (IDE alone) |
| Augment | bot / hooks | Cosmos: `augmentcode[bot] <185243770+…>`; no trailer locally | `~/.augment` (undocumented) | yes (`file_changes[].path`) | no | H / M |
| Qodo (sponsor) | bot | `qodo-code-review[bot] <151058649+…>` reviews AND authors `fix:` commits (no trailer). The IDE plugin is retired and Command is deprecated (skills inside other agents now) | `~/.qodo/config.json` only (never `auth.key`) | none | no | H (bot) / U (local) |
| Warp | trailer | `Co-Authored-By: Warp <agent@warp.dev>` (default on); cloud identity the same | `warp.sqlite` (`ai_queries.working_directory`, `commands.is_agent_executed`) | none | no | H / M |
| Replit Agent | trailers + author | `Replit-Commit-Author: Agent`, `Replit-Commit-Session-Id`, … ; author now `Replit Agent <agent@replit.com>` | cloud only | none | no | H |
| Trae | trailer (TRAE CLI) | `Co-authored-by: TRAE CLI <traecli@bytedance.com>` | trae-agent `./trajectories/*.json` (no repo field) | — | no | H / M |

**Cross-cutting findings**
- **One shared hook file can fire for several tools.** Copilot, Devin, Continue `cn` (and possibly others) also read Claude-format `.claude/settings.json` hooks. A Commet hook must take the tool from its payload, not from the file's location, or it will double-count.
- **Bot ids beat names.**
  - Copilot uses `copilot@github.com` (VS Code), id 223556219 (CLI) and id 198982749 (cloud).
  - Codex uses one email under two author names.
  - Kilo's git name differs from its login.
  - git-ai's `+copilot@` suffix rule conflates the Copilot CLI with the cloud agent.
  - Match on (numeric id, author vs trailer position).
- **Several trailers ask the human to vouch for agent work.** Copilot cloud, Cursor cloud, Devin cloud, OpenCode and Kilo bots add `Co-authored-by: <human>`. That must never make a commit `human` (Rule 1).
- **Prompt-instructed trailers can be missing** (Codex, Copilot CLI, Crush, Vibe, OpenHands, Continue). Absence proves nothing. Parse trailer keys case-insensitively, and accept `Assisted-by`.
- **Some trailers survive a human's rewrite** (Cursor through amend and squash), so a trailer means "agent involved", not "100% agent".
- **Git-only signals worth reading in v1:** `refs/notes/ai` (git-ai), `refs/notes/ai-attribution` (Qwen), `refs/cline/checkpoints/*`, the bot-author table, the trailer table, and branch prefixes (`copilot/`, `cursor/`, `codex/`, `devin/`, `jules-`) as low-tier hints only.

## Recommended v1 (ranked: detection confidence × how widely solo developers use the tool)

**Key point: detection and drones are separate costs.**
- A trailer or bot-author row costs **one table entry**, so v1 can *detect* about 25 tools from git alone.
- A local log parser costs a parser, a sample fixture (R2) and privacy canaries (Rule 2), so keep parsers to a few.
- A bespoke drone costs an art pass, so give one to about 8 brands. Every other detected tool gets the generic drone plus its name as a text label.

**Bespoke drones (8):**

| # | Brand drone | Covers | v1 detection | Tier | Why |
|---|---|---|---|---|---|
| 1 | Claude Code | CLI, web, Action | transcripts (built) + trailer + web/Action authors | H | Primary tool here |
| 2 | Cursor | IDE, CLI, cloud | **parser:** `ai-code-tracking.db` `scored_commits` (keyed by SHA, cheap join) + trailer + `cursoragent` author | H | Biggest IDE agent |
| 3 | GitHub Copilot | cloud agent, CLI, app, VS Code | git-only: cloud bot id 198982749, CLI trailer id 223556219, VS Code `copilot@github.com` | H (M in VS Code without trailer) | Most-installed |
| 4 | OpenAI Codex | CLI, cloud | **parser:** rollouts (cwd, git SHA and branch, patch paths) + bot email 199175422 | H (cloud PRs authored by the human: L) | Top CLI |
| 5 | Google | Gemini CLI, Antigravity, Jules | Antigravity trailer `noreply@google.com`; Jules bot 161369871; Gemini CLI has no trailer (parser later; no git fields) | H (Gemini CLI: M) | Jules octopus as the drone basis |
| 6 | Devin (Cognition) | Devin cloud, CLI, Desktop (formerly Windsurf) | git-only: bot 158243242 as author or trailer (about 323k commits) | H | Windsurf is now Devin Desktop |
| 7 | Kiro (Amazon) | Kiro CLI/IDE/cloud, Amazon Q | **parser or hook:** V3 file hooks (agent-only events) or `~/.kiro/sessions`; git-only `kiro-agent` and `amazon-q-developer[bot]` | H with hook / M | Easy to dogfood |
| 8 | OpenCode | CLI, GitHub agent | git-ai notes + `opencode-agent[bot]`; parser `opencode.db` later | H | 225k stars |

**Detected in v1 but drawn with the generic drone + name label:**
- **Trailer or author rows:** Aider (`aider (<model>)`), Amp (`Amp-Thread-ID`), Factory Droid, Warp, Junie, Qwen (+ `refs/notes/ai-attribution`), Crush (`Assisted-by: Crush:`), Mistral Vibe, OpenHands, Continue `cn`, Replit, Trae.
- **Bot rows:** Augment, Kilo, Roomote, Qodo (`qodo-code-review[bot]`).
- **Cline:** `refs/cline/checkpoints/*` in the repo, git-only.
- **Next drone candidates** (big user bases): Cline (5.9M installs; its robot head is an easy drone), Aider, Amp, Factory.
- **Sponsor:** Qodo's bot authors fix commits, so a Qodo "reviewer" drone is a design choice (see Open questions).

**Always present:**
- **git-ai notes reader** (`refs/notes/ai`): each `agent_id.tool` maps to its brand drone if known, otherwise the generic drone. Never read `messages`, `messages_url` or `human_author`.
- **User-declared route:** the user tags a branch, commit range or pseudo-session as `<tool>`, stored locally (e.g. `.git/commet/declared.json`), labelled "declared", tier U.
  - It can turn `unknown` into `agent (declared)`, but can never produce `human` or attribute lines.
  - Reliability is only as good as the user's memory. Show it visually distinct from detected sessions.
  - Needed for the Codex cloud human-authored PRs (only a `codex/` branch hint), Jules "User only" mode, local Qodo skills, Zed, Goose, Windsurf without hooks, and any tool with attribution turned off.
- **Generic "unknown agent" drone:** for agent evidence with no known tool. Examples: an unrecognised `[bot]` author, a git-ai tool not in the table, low-tier branch-prefix hints (`copilot/`, `cursor/`, `codex/`, `devin/`, `jules-`).

**Parser order:** Claude (done) → Cursor db → Codex rollouts → Kiro hooks or sessions → Copilot CLI session-state → OpenCode db. All SQLite parsers need a read-only driver; see Open questions.

## Part B: mascot / logo references

Files are under `.archive/docs/design/refs/agent-mascots/<provider>/`; source URLs are in `SOURCES.md`. Hex values are sampled from the files; "→" is the nearest BLK 36 entry by OKLab distance (for Rule 5).

| Provider | Key files | Silhouette and signature traits | Brand hex → BLK 36 | Motion / personality cues | Restrictions |
|---|---|---|---|---|---|
| Claude Code | `claude-code/claude-icon.png`, `claude-code-terminal.webp` | **Clawd**: a tiny block-pixel critter from the CLI (`▐▛███▜▌ / ▝▜█████▛▘ / ▘▘ ▝▝`): wide flat body, two dark eye notches, a wing/arm stub each side, four stubby legs. The Claude spark (a 12-ray asterisk) is the logo. | `#D77757` → `#FF6866` (alt `#C16A7D`; or the `#FF965F` / `#CC5250` / `#872A38` ramp) | Squat, scuttling; "Simmering…" asterisk spinner | Anthropic TM: no alterations, no implied endorsement, approval for use. No official Clawd image file found. |
| OpenAI Codex | `codex/codex-pets-spritesheet.webp` (Codey), `codex-blossom-icon.png`, `codex-cli-splash.png` | **Codey** (official pet): a cloud-puff head with a dark rounded **screen face** whose eyes are `>_` glyphs, a small blue body with `>-` on the chest, stubby arms and legs. The closest match to our drone. | body `#6E9BFA` → `#909EDD` / `#4185D8`; screen `#232D66` → `#293268`; glyphs cyan | Sheet 8×9 of 192×208 frames: idle, blink (`‿‿`), walk, wave, jump, error (`x x`, `> <`), thinking, laptop-typing, happy (`^ ^`) | No licence terms stated; OpenAI brand page 403 |
| GitHub Copilot | `github-copilot/mona-2026-versions.png`, `copilot-mascot-head-RETIRED.png`, `copilot-logo-DEPRECATED.png`, `copilot-product-lockups.png`, `github-copilot-og.jpg`; old `../agent-logos/github-copilot-logo.svg` | The goggle head is **retired (early 2026)** and the standalone icon is deprecated. Current: the Invertocat lockup; Mona (a cat-octopus) in a pearl variant reserved for AI/Agents: cat ears, big eyes, tentacle skirt. | pearl Mona blue bg `#3094FF` → `#4185D8`; face `#F8B4C3` → `#FFCCD0`; logo mono `#24292F` | Expressive, energetic | "Do not use new or existing imagery featuring the mascot head"; public mascot use needs GitHub approval; no mascot as app branding |
| Cursor | `cursor/brand-logo-1..6` | Isometric hexagonal **cube** with a light arrow facet (2D, 2.5D and 3D variants) | `#14120B` → `#12173D`; cream `#F0EFEA` → `#FFFFFF`; greys `#72716D`, `#43413C` | Precise, minimal | Only rule: say "Cursor", not "Cursor AI" |
| Gemini CLI | `gemini-cli/gemini-cli-icon.png` | A `>` prompt chevron inside a rounded square with a blue→violet→red gradient rim | `#1881FD` → `#4185D8`; `#AC87EB` → `#B991F2`; `#EE4D5D` → `#FF6866`; bg `#1E1E2E` | Terminal-native | Google brand rules not reviewed |
| Jules | `jules/jules-og-image.png`, `jules-avatar-profile.png` (30 px pixel art), `jules-comic-computer.png` | **White octopus**: domed head, two oval eyes, curled tentacles. The site's art is pixel art already. | `#642CC2` → `#643499`; favicon `#715CD7`; white | Curious helper, comic panels | None found |
| Kiro (Amazon) | `kiro/kiro-apple-icon.png`, `kiro-icon.svg` | **White ghost**: rounded dome, wavy hem, two black oval eyes | `#9046FF` → `#8C51CC`; white; black eyes | Floaty, wobbling hem (fits a hover drone) | No brand page; AWS trademark guidelines apply |
| Aider | `aider/aider-logo.svg` | Wordmark only, no mascot | `#14B014` → `#42BC7F` | Terminal green | None found |
| Cline | `cline/cline-icon.png`, `cline-favicon-256.png` | **Robot head**: rounded square, antenna nub on top, `<` `>` chevron "ears", two pill eyes (no arms, head-is-body) | `#343B42` → `#0F4A4C`; white | Friendly bot | Brand page lists "Bot Icons"; no written rules |
| Roo Code (**discontinued 2026-05-15**; skip) | `roo-code/roo-code-icon.png`, `roo-logo.svg` | Leaping **kangaroo** silhouette | black and white | Bouncy hop | roocode.com/brand now redirects to roomote.dev |
| Kilo Code | `kilo-code/kilo-logo.png` | Pixel-font "KILO" wordmark | `#F7F569` → `#FFE091`; bg `#16161C` | Pixel-native | None found |
| goose (Block / AAIF) | `goose/goose-desktop-icon-512.png`, `goose.svg`, `goose-logo-black.png` | **Flying goose** silhouette: wings spread, long neck forming an X | black and white | Flight and banking | None found |
| OpenCode | `opencode/opencode-avatar-dark-1024.png`, `opencode-logo-dark-square.svg` | A **pixel block "O"**: a light square ring around a split dark/grey core | `#0C0C0C`, `#EEEEEE`, `#4B4B4B` | Pixel-native, brutalist | Brand page offers files; no rules seen |
| Amp | `amp/amp-app-icon.png`, `amp-logo-dark.svg` | `amp` wordmark with a triple-stroke m | cream `#DFDFC1` → `#FFE091`; dark green `#2C3A2A` → `#0F4A4C` | Calm | None stated |
| Factory | `factory/factory-icon.svg` | A six-blade **pinwheel / flower** outline | `#020202` / `#FAFAFA` | Spinning | None found |
| Devin | `devin/devin-icon.png`, `devin.svg` | Three **hexagons** joined | `#0E1015` + white | — | Cognition (see Windsurf) |
| Windsurf (now **Devin Desktop**; fold into the Devin drone) | `windsurf/windsurf-*-symbol.*` | Wave "W" | `#0B100F` / white | Surfing wave | No outline, effects, rotation, gradient, recolouring or stretching; contact them for other uses |
| Qodo (sponsor; the IDE plugin is retired, so the bot is what remains) | `qodo/qodo-mascot-skate.svg` | **Anteater** in a purple hoodie with a `q` logo, sunglasses, on a skateboard | `#7A68FA` → `#8C51CC` | Cool, skating | Brand page 404; none found |
| Junie | `junie/junie-apple-touch-icon.png`, `junie-favicon.svg` | Blocky green **plus / J** glyph | `#48E054` → `#8CFF9B` | — | JetBrains brand page not readable |
| Augment | `augment/augment-android-chrome-512.png` | A **face** made of curly braces `{• •}` with two "hair" strokes | mono black | Cheeky | None found |
| OpenHands | `openhands/openhands-logo*.svg` | Hand mark | — | — | — |
| Continue, Crush, Qwen, Warp, Replit, Zed, Antigravity | see folders | Continue: hex-chain; **Crush: pixel heart with a face** (`#6B50FF` bg, pink `#FF54F9`); Qwen: blue `#082DFF`; Warp: slanted panes; Replit: orange `#FF3C01`; Zed: blue `#1D67F6` Z; Antigravity: rainbow-gradient arch | — | — | — |

**Best drone fits** (already a face or a creature): Codex Codey, Cline bot, Kiro ghost, Jules octopus, Clawd, Qodo anteater, Augment brace-face, Crush heart, goose.

---

## Open questions (for the lead or the human)

1. **Copilot drone basis.** The params.md worked example uses the goggle head, which GitHub retired in early 2026 ("Do not use new or existing imagery featuring the mascot head"; public mascot use needs approval). Options: pearl-Mona-inspired cat ears and tentacle skirt (still a GitHub mascot), an Invertocat motif, or a generic drone in Copilot colours.
2. **Rule 5 vs brand colours.** The crew uses BLK 36, never retuned. Do brand drones use BLK 36 ramps (nearest-colour table in Part B), or does the human approve a named "agent brand" palette? Clawd orange `#D77757` has no close BLK 36 match (`#FF6866`/`#FF965F` are the nearest).
3. **Trademark posture.** Anthropic forbids altered marks and implied endorsement, Windsurf forbids modification, GitHub requires approval for mascots. Proposal:
   - original drones that borrow only generic traits (ghost, octopus, cloud-head, antenna nub, colour family);
   - agents named in plain text;
   - a "not affiliated" line in the README and the demo.
4. **SQLite dependency.** The Cursor, Codex, Kiro, OpenCode, Cline and Copilot CLI stores are SQLite. `node:sqlite` isn't in Node 20, which we support. Options: a new dependency (better-sqlite3 or a WASM build, which needs a one-line justification) or raising the Node floor. Open read-only and immutable.
5. **Rule 1 edge cases** to add to `classify()`'s test table:
   - **Human co-author on an agent commit.** Several cloud agents (Copilot, Cursor, Devin, Amp, OpenCode, Kilo, Junie, Claude Action) add `Co-authored-by: <human>`. That must never make a commit `human`.
   - **Aider's ` (aider)` committer suffix** means the human's changes, not the agent's.
   - **Trailers surviving a human rewrite** (Cursor through amend and squash) mean "agent involved", not "100% agent".
   - **Prompt-instructed trailers can be absent** (Codex, Copilot CLI, Crush, Vibe, OpenHands, Continue), so a missing trailer proves nothing.
   - **Parse trailer keys case-insensitively and dedupe** (GitHub squash merges recase and repeat them), and accept `Assisted-by`.
6. **Shared hook files.** Copilot, Devin, Continue `cn`, Junie and Augment also read Claude-format `.claude/settings.json` hooks. If R7's Commet hook goes there, it must identify the tool from the payload, or it will double-count or mislabel sessions.
7. **Privacy canaries to add (Rule 2).** Never output:
   - Cursor `scored_commits.commitMessage`;
   - git-ai `human_author` and `messages`;
   - human co-author emails from trailers;
   - Cline `sessions.prompt`;
   - Codex `threads.first_user_message`/`title`;
   - Zed, Kiro and Copilot titles;
   - hook payload content fields (Factory `tool_input`, Augment `file_changes.content`, Cursor `edits`);
   - `~/.qodo/auth.key` and `~/.jules/cache/oauth_creds.json` (credentials: never open).
8. **Clawd.** No official standalone image was found; the description comes from the CLI's block art.
9. **Qodo.** Its bot is both reviewer and fix-commit author. Does it get a sponsor drone (an anteater-inspired "reviewer" drone), or the generic drone?
10. **Not researched:** Amp's GitHub App login, Junie's and Devin CLI's local session paths, the Kiro IDE and Trae IDE stores, the Amazon Q GitLab identity, the Bugbot reviewer login, the legacy Windsurf trailer, the Jules co-author string, the qwen-code-action identity, and public-commit checks of the Qwen, Crush and Continue trailers. GitHub search rate limits blocked some probes.
