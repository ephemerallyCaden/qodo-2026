# Qodo platform feature inventory (scout report, 2026-11-03)

Sources: docs.qodo.ai, including llms-full.txt (D); the qodo-ai/qodo-skills and PR-Agent source (S); the user's screenshots (O); pricing (P). RP means Research Preview.

## Headline facts
- **No public REST API for findings.** The machine-readable paths are the Agentic Toolbox CLI (`qodo review --json`, `qodo read pr-review-session findings --pr-url <URL> --json`) and the MCP server (`https://sdk.qodo.ai/v1/tools/mcp/`, Bearer key).
- **Qodo never blocks a merge.** Any gate has to read the findings JSON or the blast-radius label and enforce it in CI.
- **`ignore_bot_pr` defaults to true.** PRs opened by agent or bot accounts get no automatic review until you set it to false.
- **Local review accepts a session-context `decisions` field,** and the reviewer won't re-flag decisions listed there. A misbehaving agent could use it to suppress findings.
- **Pricing:** 14-day trial. Pro Team excludes the "self-learning system". The hackathon gives free licenses, but the tier isn't stated.

## PR review
| Feature | Notes |
|---|---|
| Agentic review (`/agentic_review`) | Specialist agents run in parallel and a judge agent merges their output. Each finding has a severity (`action_required` / `remediation_recommended` / `informational`), a category, evidence, and a prompt you can hand to an agent. Works on GitHub, GitLab, Bitbucket, Azure DevOps and Gerrit. |
| Finding types | Bugs (always on), Rule enforcement, Skill insights (RP), Cross-repo (Beta), Spec gaps (RP), **Design gaps vs Figma (RP, `enable_ui_agent`)** |
| Review effort | Auto / Fast / Balanced / Deep |
| Re-review on push, incremental review | Updates a single persistent comment |
| PR summary (`/agentic_describe`) | Tags, time estimate, walkthrough, **diagram**, file overview |
| Blast radius label | Small / Medium / Large as a native PR label (RP, `publish_blast_radius_labels`). Readable through the forge API. |
| Chat (`@qodo`) | Explain a finding, or dismiss it with a reason |
| Committable suggestions | Beta |
| Remediation / Auto fix agent | Opens a fix PR or pushes the fix (RP) |
| **Requirement gaps (Spec agent)** | Spec linked from the PR description (Confluence or Notion); one spec URL and one design URL per PR |
| **Ticket compliance** | Jira, Linear, GitHub Issues, GitLab, Azure DevOps, Monday. Ticket comes from the PR description or the branch name. `check_pr_additional_content` flags changes unrelated to the ticket. |
| **Design deviations vs Figma** | `enable_ui_agent` (RP) |
| Cross-repo conflicts, Relevance (past PR history), web search of dependency docs | Beta / RP |
| CI failure feedback (`/checks`) | The docs contradict each other on whether it's been removed |
| Self-review checkbox, then Qodo approves | GitHub only. The only documented approval hook. |
| Noise controls, ignore rules, resolved-finding tracking, custom instructions | Configured in `.pr_agent.toml` or the portal |

## Rules and standards
- **Rules:** generate from natural language. Severity is Error / Warning / Recommendation. Scope can be global, org, repo, or path. (Beta)
- **Import from repo files:** AGENTS.md, CLAUDE.md, SKILL.md, `.cursor/rules`, and others. Rules resync on every push.
- **Rule Miner:** mines the last ~1000 merged PRs, then re-runs every 2 weeks. A pending-rules queue holds suggestions for approval.
- **Skills:** `SKILL.md` files with `name` and `description` frontmatter, under `.claude/skills/*` or `skills/*`. A skill is applied either as rules enforcement or as steering. Metrics: Triggered, Detected, Merged violations.
- **REVIEW.md:** a file at the repo root that every review agent reads (RP).

## Context
- Context Engine and PR-history indexing.
- Cross-repo relationships with a map view.
- Software Map (Beta).

## Agentic Toolbox (GA)
- **Install:** `curl -fsSL https://get.qodo.ai | sh` (needs Node 20+).
- **CLI:** `qodo login`, `qodo tools`, `qodo review`.
- **Local review:**
  - `qodo review --base <sha> --json [--ticket URL] [--fast|--deep]`
  - Async: `--async`, then `qodo review status <id>`. Exit codes: 0 done, 2 still running, 1 failed.
  - Results land in `findings[]` and `finding_state.{introduced,still_open,resolved,dismissed}`.
  - If `meta.coverage.complete` is false, treat the review as incomplete.
- **Review Resolver:** reads PR findings, marks them implemented, dismisses them. Check `status == completed` and that `commit_sha` is the PR head before trusting a result.
- **Other tools:**
  - Codebase Wisdom: find, grep, blame, PR history, similar code.
  - Get Rules and Manage Standards: CRUD on rules.
- **Plugins:** Claude Code, Codex, Kiro.

## Portal
- **Analytics:** Impact, By repo, By author. CSV export of up to 10k findings with `attribution_status` (Beta, admin only).
- **Findings page:** findings across the whole org.
- **PR Triage (RP):** List and Board views. Policies set SLA days and priority rules (high-severity count × blast radius, SLA breach, inactivity). It suggests a "Next action" (close with reason, add reviewer, copy as prompt) but **has no gating and no API.**
- **Presets:** Recall, Precision, Velocity, Automation (turns on Auto fix), Customization. Each applies at workspace, org, or repo scope.

## Deprecated or renamed
- Qodo Merge is now Qodo Review.
- Qodo Gen and Qodo Command are deprecated.
- The IDE plugin was retired on 2026-11-01.
- The v1 commands (`/improve`, `/test`, …) were removed on 2026-10-01.

## Still unknown (needs an authenticated look)
- MCP tool schemas
- Whether Qodo publishes GitHub check runs
- Credit cost per review, and rate limits
- Whether the Toolbox and Rule Miner are included in the hackathon license
- Whether the Spec agent accepts a GitHub Issue body as the spec
- Whether `/checks` still works
