# Qodo: Opportunities, Risks, Mitigations, and the 3 Highest-Wow Features

*Written 2026-11-03 from three sources: the feature-inventory scout (`qodo-feature-inventory.md`), the risk scout, and the user's own app.qodo.ai screenshots (`qodo-app-observed.md`). It assumes a pixel-art game project built by an agent factory (see `docs/ideas/day1-brainstorm-2-pixel.md`).*

## Risks that cut across every opportunity (deal with these in Week 1)

| # | Risk | Evidence | Mitigation |
|---|---|---|---|
| X1 | **Qodo skips PRs opened by agents.** `ignore_bot_pr=true` is the default, and authors named `claude`/`codex`/`*-bot`, or PR bodies containing "created automatically by", count as bots. | Qodo docs | Set `[github_app] ignore_bot_pr = false` in `.pr_agent.toml` on the default branch (putting it under `[github]` does nothing). Open a test PR on Day 1 to prove the change took. |
| X2 | **Trial is 14 days, hackathon is 30.** Usage stops when the trial ends, and on Day 1 one participant's trial was only extended after a manual fix. | Pricing docs, discussion #2 | Post in Discussions now and ask filiphric to confirm the hackathon license is extended. Keep open-source PR-Agent (your own API key) set up as a fallback reviewer. |
| X3 | **A failed or skipped review looks the same as a clean one.** "Something went wrong" ran for 12 days, rate-limit skips are silent, and clipped diffs aren't flagged. | pr-agent #3256, #2522, #2565 | The gate must find a completed review whose `commit_sha` matches the PR head, with `meta.coverage.complete`. A missing review means **escalate, never approve.** |
| X4 | **Qodo can't see binary assets.** PNG sprites and audio files don't show up in the diff it reads. | Qodo reviews code diffs | Keep game data as text: Tiled/LDtk JSON levels, palette JSON, chart JSON. A CI linter posts a **text report** on the PR so Qodo and humans review the same facts. |
| X5 | **Results aren't reproducible.** Multiple agents feed a judge, with no fixed seed. Studies of LLMs with "deterministic" settings still see accuracy vary by up to 15% between runs. | arXiv 2408.04667, 2308.02828 | Qodo is *advisory* evidence, not the sole arbiter. Hard rules go into deterministic checks (linter, solver bot), and Qodo layers judgement on top. |

---

## Opportunity 1: The Agentic PR Review is the factory's reviewer
Specialist agents run in parallel and a judge agent filters them. Severity tiers are `action_required`, `remediation_recommended` and `informational`. There's a persistent re-review on every push, plus a PR summary with a **diagram**.

| Risk | Mitigation |
|---|---|
| 1. **Noise**, e.g. "a ton of noise about persistence" and 11 findings on a visual-only PR, so real issues get buried. | Use the **Precision** preset (not Recall) on the game repo. Set `inline_comments_severity_threshold` to `action_required`. Add a `REVIEW.md` saying what *not* to flag (hackathon scope). |
| 2. **Recall falls on big PRs.** The undefined variable it caught in a 1-file PR was missed in a 5–6-file PR. | Keep tickets small: one room or one mechanic per PR. Hold agents to a hard diff-size budget, and split anything bigger. |
| 3. **Game logic is outside what it understands.** It won't know a jump arc must clear 3 tiles (Swarmbreak saw it miss a design flaw). | Write design invariants down as rules and skills (Opportunity 2). Prove them with the solver bot, not the reviewer. |
| 4. **Latency.** A review takes "a few minutes", which stalls fast agent loops. | Run a local `qodo review --fast` before opening the PR (Opportunity 4). The PR review then becomes a confirmation step, not the iteration loop. |
| 5. **Docs and product disagree** (v1 commands removed, `/checks` documented as both live and removed). | Prove each config key on a throwaway PR before relying on it. Record what works in CLAUDE.md. |

## Opportunity 2: Review Standards and Skills encode your art direction and game rules
Rules can be generated in plain language, with severity and path scopes. `SKILL.md` files are imported from `.claude/skills/*` and enforced by the **Skill insight** agent. Rule Miner learns rules from PR history, and REVIEW.md is read by every review agent.

| Risk | Mitigation |
|---|---|
| 1. **Skills and Skill insight are Beta/Research Preview** and could be withdrawn or change mid-hackathon. | Keep the same rules in a repo file (CLAUDE.md / AGENTS.md) that Qodo imports *and* your coding agent reads. One source feeds both. |
| 2. **The ruleset drifts on its own.** Qodo auto-deactivates rarely-fixed rules, and mined rules auto-activate for orgs created after Sept 1. | Lock the rules you care about, and set mined rules to land in "Pending" rather than going straight to active. Snapshot the rule list each week for evidence. |
| 3. **Rules can't see pixels.** A rule like "only palette colours" can't be checked against a PNG. | Split responsibilities. Code and data rules go to Qodo (e.g. "palette refs must come from `palette.json`", "no hardcoded hex colours", "entities snap to an 8 px grid"). Pixel rules go to the CI linter. |
| 4. **An agent could weaken the rules inside its own PR** by editing REVIEW.md or a skill file. | Protect `REVIEW.md`, `.claude/skills/**` and `.pr_agent.toml` with CODEOWNERS plus a CI check, so any edit is forced to escalate. |
| 5. **Rule Miner needs history** (it mines about the last 1,000 merged PRs), and a fresh repo has none. Pro Team may also exclude the "self-learning system". | Don't plan around Rule Miner. Write the rules by hand in Week 2. Any mined rules that appear late are a bonus. |

## Opportunity 3: Ticket compliance and Requirement gaps make a game-design ticket the spec
Qodo pulls GitHub Issues, Linear or Jira tickets, linked from the PR body or the branch name. Two related checks:
- **Requirement gap**: the Spec agent reports requirements in the linked ticket that the code doesn't meet.
- **`check_pr_additional_content`**: flags changes the ticket didn't ask for.

| Risk | Mitigation |
|---|---|
| 1. **Spec gaps are Research Preview**, and the docs say specs come from Confluence or Notion, so a GitHub Issue body may not count as a "spec". | Test both on Day 2 with a single throwaway PR. If GitHub Issues fall short, fall back to ticket compliance, which does read GitHub Issues. |
| 2. **Vague tickets give vague checks.** "A spooky crypt room" can't be verified. | Use a ticket template with testable acceptance criteria, e.g. "reachable only after double-jump", "≤ 3 enemies", "uses tileset `crypt`". The same fields drive the solver bot. |
| 3. **Linking breaks silently** if the branch name or PR body doesn't match the fixed patterns, and you get no ticket context. | The agent's PR template always includes `Closes #N`. CI fails the PR if the link is missing. |
| 4. **Only one spec URL and one design URL per PR** (the first one wins). | One ticket per PR, which also helps recall (see Opportunity 1, risk 2). |
| 5. **"Additional content" false positives** on legitimate refactors that come with a feature. | Only allow refactors as separate tickets. Treat the flag as an escalation signal, not a hard block. |

## Opportunity 4: The Agentic Toolbox (CLI and MCP) as the agent's self-check and the gate's data source
- `qodo review --json` runs a local pre-PR review on the same engine as PR review.
- `qodo read pr-review-session findings --json` reads findings from an open PR.
- **Review Resolver** marks findings implemented or dismissed.
- MCP server; a Claude Code plugin is available.

| Risk | Mitigation |
|---|---|
| 1. **There's no verdict API, and exit codes don't mean "findings exist".** | Gate on the JSON, not the exit code: `action_required` count, `finding_state.introduced`, and `meta.coverage.complete`. Write a contract test for that JSON shape and run it every day. |
| 2. **The CLI updates itself silently** (installed via `curl \| sh`), so behaviour can change overnight. | Log `qodo --version` with every gate decision. If the JSON contract test fails, escalate everything until it's fixed. |
| 3. **The `decisions` session-context field suppresses re-flagging.** An agent can use it to quietly silence findings. | Only the factory harness writes `.qodo/session-context.json`, never the coding agent. Log what it contains on the PR. |
| 4. **Credit cost per local review is undocumented.** About 18 reviews per 2,500 credits on Pro Team means agent loops could drain the budget. | Cap local reviews at 2 per ticket and use `--fast`. Check the usage page daily in Week 3. |
| 5. **Dismissals can hide real issues.** Review Resolver lets the agent dismiss findings as "intentional". | Agents may *mark implemented* only. Any *dismiss* forces escalation to a human, with the reason shown. |

## Opportunity 5: Design gaps vs Figma turn a visual mock into the spec
The UI agent (`enable_ui_agent`, Research Preview) compares UI changes to a linked Figma design.

| Risk | Mitigation |
|---|---|
| 1. **Research Preview, behaviour undocumented.** It may not work on canvas or pixel-art UIs at all. | Run a cheap Day 2 experiment: one HUD mock in Figma and one PR. If it gives nothing useful, drop it. Only a sunk hour lost. |
| 2. **It probably reads code against design properties, not rendered pixels.** A canvas-drawn game exposes few DOM properties. | Point it at the DOM/CSS parts (menus, HUD overlays, title screen), not at gameplay canvas. |
| 3. **The Figma connection may be gated by tier** or need a paid Figma plan. | Check Integrations on your account first. A free Figma plan supports sharing links. |
| 4. **Pixel art at 1× in Figma loses crispness or scale cues.** | Export frames at integer scale and note the scale in the frame name. |
| 5. **Mock and game drift apart over time**, so the check flags intended changes. | Version the mocks: each ticket links a specific Figma frame version, and updating the mock is its own ticket. |

## Opportunity 6: Blast radius, PR Triage, and Presets give approve/escalate its signals
- **Blast radius**: Small/Medium/Large as a native PR label (Research Preview).
- **PR Triage**: Policies (SLA, priority from high-severity findings × blast radius) and a "Next action".
- **Presets**: Recall, Precision, Velocity, Automation (adds Auto fix), and Customization.

| Risk | Mitigation |
|---|---|
| 1. **PR Triage has no API and doesn't gate**; it only ranks. | Use the label, which the GitHub API can read, inside your own GitHub Action. Use the PR Triage board as a screenshot or demo of the human escalation queue. |
| 2. **The blast-radius label is off by default** (`publish_blast_radius_labels=false`) and is Research Preview. | Turn it on in Week 1. If it's missing, the gate treats the PR as "Large", which means escalate. |
| 3. **Blast radius measures code reach, not game risk.** Changing a physics constant is "Small" but breaks every level. | Add your own risk tags. Any change to `physics/`, `audio-sync/` or `palette.json` escalates regardless of the label. |
| 4. **The Automation preset turns on Auto fix**, so agents fixing agents can loop. | Stay on Precision. Run Auto fix only manually, capped at 1 fix PR per ticket. |
| 5. **Self-review approval** (`approve_pr_on_self_review`) depends on a human ticking a checkbox, so it doesn't work for an autonomous factory. | Don't use it as the gate. The factory's own check run is the approval. |

## Opportunity 7: Analytics and the Findings page feed a factory scoreboard
- Impact / By repo / By author views.
- **CSV export of up to 10k findings** with `attribution_status` (implemented / dismissed / detected_after_merge …).
- An org-wide Findings page.

| Risk | Mitigation |
|---|---|
| 1. **Admin only, Beta, and export is manual.** There's no API to automate it. | Export weekly by hand and commit the CSV into the repo as dated evidence. That's also good material for the final submission. |
| 2. **Pro Team may exclude "advanced analytics".** | Check what your account shows. If it's missing, build the same metrics from `qodo read … --json` logs your gate already stores. |
| 3. **Small numbers.** 20 PRs can't support claims of statistical significance. | Report counts and specific examples ("caught 4/6 off-palette refs"), not percentages with false precision. |
| 4. **"Resolved" overstates the truth.** The ICSE study found 73.8% marked resolved but questioned whether the fixes were actually implemented. | Cross-check any finding marked resolved against the commit that resolved it before claiming it as a catch. |
| 5. **Metrics without a story bore judges.** | Render them in-world: a pixel-art "castle chronicle" or scoreboard screen (your strength). |

---

## The 3 Qodo features with the most wow to use

Each one is unexpected for a game project, shows up on screen in a demo, and fits one of the weekly themes.

### 1. Skills as your art director: Review Standards + Skill insight (Week 2)
Write `.claude/skills/pixel-art-direction/SKILL.md` and `.claude/skills/level-design/SKILL.md`. These are the **same files your coding agent reads**. Qodo imports them and flags violations on every PR, e.g. "Skill insight: entity spawned off the 8 px grid" or "hardcoded colour `#3fa2c8` is not in palette.json".
- **Wow moment:** one file teaches both the agent that writes the code and the reviewer that checks it your taste. The PR shows Qodo enforcing *art direction*, not just catching bugs.
- **Main risk:** Beta. **Mitigation:** the rules also live in CLAUDE.md.

### 2. A game-design ticket becomes a verified spec: Ticket compliance + Requirement gap (Week 1→3)
A GitHub Issue such as "Flooded crypt, reachable only after double-jump, ≤ 3 bats, crypt tileset" drives three things:
- the coding agent builds it;
- Qodo checks the PR against the ticket and flags what's missing or unrequested;
- the solver bot proves the room is reachable.
- **Wow moment:** a game-design brief written in plain English gets *audited* by an AI reviewer, side by side with a replay GIF from the bot.
- **Main risk:** Spec gaps are Research Preview. **Mitigation:** ticket compliance does work with GitHub Issues. Test on Day 2.

### 3. A closed-loop gate: Agentic Toolbox `qodo review --json` + Review Resolver + blast-radius label (Weeks 3–4)
The flow:
1. The agent self-reviews locally before opening the PR and fixes `action_required` findings.
2. Qodo reviews the PR.
3. Your Action reads the findings JSON, the blast-radius label, the linter and the solver bot.
4. The PR either **auto-merges** or **escalates to you** with the evidence attached: findings, replay GIF, before/after frames.
- **Wow moment:** a ticket in, then a merged and playable room out, untouched. The PR Triage board shows only the PRs that need *your* taste. That is literally the hackathon's Week 4 theme, done visibly.
- **Main risks:** no verdict API, and silent failures. **Mitigation:** gate on the JSON with coverage plus SHA checks, and treat a missing review as escalate.

**Wildcard worth one hour on Day 2:** **Design gaps vs Figma.** If the UI agent can compare your HUD or menu against a Figma mock, it's the most visual Qodo feature there is, and probably no other entrant will use it. If it fails on pixel art, you've lost an hour.
