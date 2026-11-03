# JOURNAL

## Project State
- Phase: Day 1 ideation (Qodo "Build a Software Factory in 30 Days", started 2026-11-02).
- Idea: research complete → `docs/research/day1-landscape-report.md`. POLYGRAPH shelved by the human (2026-11-03). Human's strength: frontend art and visualisation. Brainstorm 2 (pixel-art games, since the human does pixel-art frontends, metroidvanias and rhythm games) is in `docs/ideas/day1-brainstorm-2-pixel.md`. Top 3: The Growing Castle, Sprite Synth, Beatsmith. Awaiting a pick.

## Architecture Decisions

## Interface Contracts

## Task Log
- [2026-11-03] Session start on `session/day1-ideation`. Spawned 3 scouts: addyosmani/agent-skills deep-research inventory, hackathon entries landscape, academic research on agentic-coding gaps.

- [2026-11-03] All 3 scouts reported. Key facts: agent-skills has no deep-research skill; hackathon is individual-only, judged by Qodo on challenge completion; FaultForge owns 'review the reviewer'. Report written.

- [2026-11-03] Confirmed the hackathon framing: the project is any app, the factory is the agent→standards→tests→Qodo workflow around it, and both are judged. Qodo feature inventory saved (`docs/research/qodo-feature-inventory.md`). Brainstormed 10 visual ideas; top 3 are Cartographer, Explorables, Chartroom.

- [2026-11-03] Brainstorm 2: 10 pixel-art game ideas. Factory thesis: "the factory can't see or play the game, so we teach it to" (pixel-art linter + bot playtester + visual evidence; game feel always goes to the human).

- [2026-11-03] Risk scout reported. Wrote `docs/research/qodo-opportunities-risks.md`: 7 opportunities × 5 risks + mitigations, 5 cross-cutting risks, top-3 wow features (Skills as art director, ticket → verified spec, closed-loop Toolbox gate; Figma design-gaps as a wildcard).

## Known Issues and Caveats
- Qodo trial ends around Nov 17 (14 days left on Nov 3). Need to confirm the hackathon license or an extension.
- Qodo can't see binary assets (PNG/audio). Keep game data as text (JSON levels/palettes/charts) and post the CI linter output as a text PR comment.
- A failed or skipped Qodo review looks like a clean one. The gate must require a completed review on the head SHA; no review means escalate.
- Qodo `ignore_bot_pr` defaults to true, so agent-opened PRs aren't auto-reviewed unless it's set to false.
- CLAUDE.md is still the unfilled hackathon template; fill once idea + stack are chosen. No CONSTITUTION.md yet (draft after idea is chosen).

## Failed Approaches

## Learning Summaries
