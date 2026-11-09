# Feature: Agent drones (one look per agent provider)

## Status
Research

## Trigger
The human, 2026-11-09: "let's also work on specific drone types, so for claude, codex, github copilot etc. First suggest to me a list of agent-providers we should support with our app, making sure they're ones we can actually detect or at least get the info somehow, even if it's asking the user. Then find pictures of their logos or characters, e.g. they all have mascots. Then, use those to inspire variations of our current drone, to resemble the mascots of these AI companies."

## Requirements
- [ ] A1 **A supported provider list**, approved by the human. Each provider has a way to be detected (session logs or hooks, commit trailers, bot authors, git-ai notes), or failing that, a way for the user to say which tool made a session or commit. Others fall back to a generic drone, labelled with the tool name when known and "unknown agent" when not.
- [ ] A2 **One drone per supported provider:** a variation of the base drone D-final (`feature/drone-lab`), recognisable as that provider through silhouette, a signature feature and colour, inspired by its mascot or logo. It isn't a copy of it, and no logo is drawn.
- [ ] A3 **The drone family stays one family:** same size (about half an astronaut), head-is-body, thruster pack and smoke, screen face with V2 eyes, BLK 36 colours exactly (brand colours mapped to their nearest BLK 36 colours), and the full idle loop (bob, look around, blink, working face, banking).
- [ ] A4 **Readable at 320×180:** each provider's drone can be told apart from the others at the crew close-up and at system distance.
- [ ] A5 **Per-session variety stays inside a provider (R2b):** sessions of one provider differ only in seeded details (e.g. trim or antenna), so two Claude sessions look like two Claude drones.

## Assumptions
- [ ] (load-bearing, A1) Which providers leave local or git-visible traces, and in what form. The scout is researching this (2026-11-09).
- [ ] (A2) Taking a provider's visual cues for an internal, non-commercial hackathon mockup is acceptable if no logo or mascot is reproduced. Reference images stay in `.archive/` (gitignored), never in the repo.

## Flow
Scan → session attributed to a tool (R2) → drone seeded from tool + session ID (R2b) → the tool picks the drone family, and the session hash picks the details.

## Research
- Earlier attribution research: `docs/research/agent-attribution.md` (Claude Code logs probed; other tools listed).
- Existing references: `.archive/docs/design/refs/agent-logos/` (GitHub Copilot and Microsoft Copilot SVGs), `.archive/docs/design/refs/drone/`.

## Tasks
- Scout: provider detection matrix and mascot references (2026-11-09).
- Then: the drone lab, phase 2 (feature agent, `feature/drone-lab`), once the human approves the list.

## Completion
- Merged: —
- Date: —
- Verification: —
