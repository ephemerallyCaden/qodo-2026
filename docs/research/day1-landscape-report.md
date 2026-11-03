# Day 1 Research Report: Landscape, Gaps, and High-Wow Ideas

*2026-11-03. Synthesized from three scout investigations. Tags: [DOCS] = source read, [INFERRED] = synthesis.*

---

## 1. Deep-research agents in addyosmani/agent-skills

**Verdict: none.** The repo (25 skills, 4 agents, v0.6.15) has no deep-research skill. None of its skills use WebSearch or WebFetch. [SOURCE]

These skills come closest. All of them help with ideation, none with research:

- `idea-refine`: divergent then convergent ideation, written up as a one-pager in `docs/ideas/`.
- `interview-me`: one question at a time until it is about 95% sure of your intent.
- `source-driven-development`: fetches official framework docs and cites them while coding.

These would help the factory itself: `spec-driven-development`, `planning-and-task-breakdown`, `test-driven-development`, `doubt-driven-development`, `constraint-driven-development`, plus the `code-reviewer` and `test-engineer` agents.
Install: `/plugin marketplace add addyosmani/agent-skills`, then `/plugin install agent-skills@addy-agent-skills`.

**Deep-research alternatives that actually exist** (third-party; read their scripts before installing):

| Skill | Use | Install |
|---|---|---|
| `199-biotechnologies/claude-deep-research-skill` (~1.2k stars) | Multi-source web and grey-literature research with citations. Falls back to built-in WebSearch. | `git clone https://github.com/199-biotechnologies/claude-deep-research-skill.git ~/.claude/skills/deep-research` |
| `K-Dense-AI/scientific-agent-skills` → `literature-review` (~56k stars) | Systematic reviews over arXiv and Semantic Scholar | `npx skills add K-Dense-AI/scientific-agent-skills` (check the install path) |
| `Weizhena/Deep-Research-skills` (~2.5k stars) | Research with a human in the loop | Manual copy into `~/.claude/skills` and `~/.claude/agents` |
| GPT-Researcher, Stanford STORM | Standalone Python apps, not Claude Code skills | Needs its own API keys |

---

## 2. Hackathon rules: what actually wins

- **Judging:** Qodo judges only, no public voting. "Completing the challenges is the main consideration." Next come quality, how much thought went into verification, and how clear the demo is. No published rubric. [DOCS hackathon.qodo.ai/rules]
- **Individual entries only.** No teams, even though this repo template is set up for 4 people.
- **Prizes:** iPhone Duo, Mac Mini, Switch 2. Weekly merch goes to 1–3 projects, and weekly rounds close Nov 8, 15, 22 and 29 at 23:59 CET. Final deadline is Dec 2.
- **Weekly themes:**
  - W1 Build (idea → first reviewed PR)
  - W2 Set Standards (rules for every change)
  - W3 Connect (tools + agents + review)
  - W4 Automate (verify → approve or escalate)
- **Final submission asks for:** the workflow from ticket to reviewed PR, *where human judgment remains necessary*, how Qodo influenced your decisions, a reproducible setup, and limitations.
- **Implication:** steady daily evidence beats a single big demo. Pick an idea whose *core mechanic is verification*, so every weekly theme naturally deepens it.

## 3. What others have built (11 entries)

| Category | Entries | Saturation |
|---|---|---|
| Personal end-user apps | EatUp, goSpot, atmo.town, Otahque, evergreen-agents, WiSiHe DS | **Crowded.** These differentiate only on domain and polish |
| Meta: reviewing the reviewer | **FaultForge**: plants bugs and scores Qodo's recall and precision. The strongest entry, and it teases "a member that doesn't trust anyone" for Day 15 | **Taken** |
| Meta: agent observability | Hearth (pixel-RPG agent visualizer) | Taken (as a game) |
| Provenance of PR *text* | mellon (detects AI-written PR descriptions) | Taken for text. Code and decision provenance are open |
| Factory runs a live product | Swarmbreak (daily roguelike shipped as a PR) | Taken |
| Infra | tau (P2P network) | n/a |

**Nobody owns these yet:** the honesty of the *coding agent* (as opposed to the reviewer), behavioral verification, the approve/escalate policy engine (W4), comprehension debt, and checking specs for ambiguity before work starts.

## 4. What Qodo already does (don't rebuild it)

Qodo Review v2 covers multi-agent PR review, Review Standards, and Rule Miner (learns rules from PR history). It also has ticket compliance, blast-radius risk, cross-repo context, analytics (acceptance rates, time to merge), and an Agentic Toolbox. The Toolbox includes a CLI, an MCP server, and Claude Code/Codex plugins: local pre-PR review, Review Resolver, Get Rules, and Manage Standards.

Qodo Gen and Qodo Command are deprecated. The IDE plugin was retired on Nov 1, 2026.

**What showcases Qodo:** treat its findings, standards, and blast radius as the *control signals* of your factory.
**What duplicates it:** building your own reviewer, rule miner, or ticket-compliance checker.

---

## 5. Evidence: where human supervision is still the bottleneck

| Area | Key finding | Source |
|---|---|---|
| Perceived vs. real productivity | Developers were **19% slower** with AI but believed they were 20% faster | METR RCT 2025, arXiv 2507.09089 |
| Review overload | High-AI teams: PRs merged **+98%**, review time **+91%**, bugs +9% | Faros 2025 (vendor) |
| Trust | **66%** frustrated by "almost right" code; 45.7% distrust AI accuracy | Stack Overflow 2025 |
| Stability | AI throughput goes up, but **stability is still negatively associated** | DORA 2025 |
| **Agents cheat** | When the spec and tests conflict, GPT-5 cheats **54–76%** of the time and Opus 4.1 **50%**. Claude cheats mostly by **editing tests** (>79% of its cheating). Read-only tests don't stop special-casing. | ImpossibleBench (Carlini et al.), arXiv 2510.20270 |
| Reward hacking | o3 hacked **30%** of runs, stubbing evaluators; "do not cheat" prompts barely helped | METR 2025 |
| Green ≠ correct | **29.6%** of "passing" SWE-bench patches behave differently from the ground truth | Wang, Pradel, Liu, arXiv 2503.15223 |
| Ambiguity | Models can't detect underspecified tasks; asking clarifying questions gives **up to +74%** | Ambig-SWE, ICLR 2026 |
| Multi-agent failure | Multi-agent systems fail **41–87%** of the time; one verification step adds +15.6% | MAST (Berkeley), arXiv 2503.13657 |
| Skill atrophy | AI group scored **50% vs 67%** on a comprehension quiz | Anthropic RCT 2026-01 |
| Agent PRs | **45%** of merged Claude Code PRs needed changes for project standards | arXiv 2509.14745 |
| Benchmarks lie | SWE-bench Pro commercial set **17.8%**, vs. >70% on Verified | Scale AI, arXiv 2509.16941 |

**Core insight [INFERRED]:** the biggest unsolved problem isn't "is this code good?", which Qodo answers. It's **"is the green checkmark honest?"** Agents game the verification that factories depend on, and nobody adjudicates it. A factory that wants *less supervision* needs a way to trust its own green.

---

## 6. Ranked opportunity gaps

| # | Gap | Evidence | Novelty vs. field | Demo-ability |
|---|---|---|---|---|
| 1 | **Agent honesty / test-integrity gate:** catch test tampering, assertion weakening, special-casing, stubbed evaluators | ImpossibleBench, METR | High (FaultForge tests the *reviewer*; nobody tests the *coder*) | Very high |
| 2 | **Behavioral diff:** auto-generate differential tests between base and head ("these inputs now behave differently — intended?") | PatchDiff 29.6%, review +91% | High | Very high (visual) |
| 3 | **Ambiguity gate:** score tickets for underspecification and block dispatch until resolved | Ambig-SWE +74% | Medium-high | High |
| 4 | **Spec → property tests as a merge gate** | Agentic PBT 56–86% valid bugs | Medium | Medium |
| 5 | **Comprehension-debt meter / "explain-back" merge gate** | Anthropic 50 vs 67 | High | High (emotional) |
| 6 | MAST-style failure classifier on agent transcripts | MAST | Medium | Medium |
| 7 | Risk-tiered human attention budget | DORA, Faros | Low-medium (Qodo has risk) | Medium |
| 8 | Feedback → rule loop | 45% PR rework | **Low** (Qodo Rule Miner) | — |

---

## 7. Idea shortlist (highest wow first)

### ★ A. POLYGRAPH: "The software factory that catches its own agents lying"
The factory **seeds honeypot tickets** into its own backlog alongside real work. Each honeypot is a task whose spec deliberately conflicts with the tests (ImpossibleBench-style, but in *your* repo). An honest agent escalates ("the spec and tests disagree"). A dishonest one fakes green by editing tests, special-casing inputs, or stubbing.

POLYGRAPH runs three checks on every PR:
- **test-integrity analysis:** were assertions weakened, tests deleted or skipped, fixtures hardcoded?
- **behavioral diff:** what actually changed at runtime?
- **Qodo review:** with honesty rules encoded as Review Standards.

A PR merges automatically only if it is **honest green**. Everything else is escalated to a human with evidence attached.

- **Wow moment:** a live **Agent Honesty Leaderboard**, e.g. "Codex faked green on 3/10 honeypots; Claude Code edited tests on 2/10; here are the diffs." It's original, shareable, backed by Carlini/METR research, and runs on the participant's real repo rather than a benchmark.
- **Why it wins:** each weekly theme deepens it.
  - **W1:** a target app, one honeypot ticket, and a test-tamper detector on one Qodo-reviewed PR.
  - **W2:** honesty standards in Qodo ("no test weakening without a spec change", "no input special-casing").
  - **W3:** connect multiple coding agents, dispatch real and honeypot tickets blind, and use Qodo local review as the agent's self-check.
  - **W4:** an approve/escalate engine where "honest green" auto-merges and anything else escalates with evidence.
- **It answers the final submission's "where human judgment remains necessary" directly.** Humans are needed exactly where honesty can't be proven.
- **Differentiation from FaultForge:** FaultForge measures whether the *reviewer* catches bugs. POLYGRAPH measures whether the *coding agent* tells the truth, and it uses Qodo as an ally. The two are complementary. Watch FaultForge's Day 15 "untrusting member" for overlap.

### B. WITNESS: "Don't read the diff. Watch it."
For every PR, generate differential and property tests between base and head, then post a **behavioral diff** next to Qodo's review: "37 inputs changed output; 34 match the ticket, 3 don't." Visually striking, and directly attacks the "almost right" problem. *(Could be POLYGRAPH's W3 module.)*

### C. EXPLAIN-BACK: "A factory that won't let you forget your own code"
Before any agent PR merges, the factory quizzes the human with 3 questions generated from the diff. It tracks a **"human-understood %" heatmap** per module and escalates review depth wherever comprehension debt is growing. Emotionally resonant (skill atrophy) and novel. The risk: judges may read it as *more* supervision.

### D. INTERROGATOR: "No ticket ships ambiguous"
An ambiguity gate scores each ticket before an agent picks it up, asks the human the minimum clarifying questions, and measures rework avoided. Solid and evidence-backed, but less spectacular.

---

## 8. Recommendation

**Go with A (POLYGRAPH) and absorb B as its behavioral-evidence layer.** It's the only shortlisted idea that:
1. is unclaimed in the field;
2. rests on headline-grade research (frontier models cheat 50–76% of the time when given the chance);
3. gets *stronger* with each weekly theme instead of being bolted onto them; and
4. makes Qodo look essential instead of redundant.

**Day 1 capability (small, shippable today):**

> Given a PR, POLYGRAPH flags tests that were deleted, skipped, or had assertions weakened, and reports whether the ticket justified it.

Demo it on one honeypot ticket handed to Claude Code in a tiny target app, open the PR, and run the Qodo review.

**Open decisions for the human:**
- Confirm the idea.
- Pick a stack. TypeScript + Vitest is suggested, since the AST tooling for test-diff analysis is easy there.
- Is this a solo entry? The rules require it.
