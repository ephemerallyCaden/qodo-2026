# Feature: Agent drones (one look per agent provider)

## Status
Ready (design exploration)

## Trigger
The human, 2026-11-09: "let's also work on specific drone types, so for claude, codex, github copilot etc. First suggest to me a list of agent-providers we should support with our app, making sure they're ones we can actually detect or at least get the info somehow, even if it's asking the user. Then find pictures of their logos or characters, e.g. they all have mascots. Then, use those to inspire variations of our current drone, to resemble the mascots of these AI companies."

## Requirements
- [x] A1 **A supported provider list**, approved by the human (2026-11-10): **Claude Code, Cursor, GitHub Copilot, OpenAI Codex, Google (Gemini CLI, Antigravity, Jules), Devin (including ex-Windsurf), Kiro / Amazon Q, OpenCode and Qodo** get custom drones. The detection matrix is `docs/research/agent-providers.md`. Each provider has a way to be detected (session logs or hooks, commit trailers, bot authors, git-ai notes), or failing that, a way for the user to say which tool made a session or commit. Others fall back to a generic drone, labelled with the tool name when known and "unknown agent" when not.
- [ ] A2 **One drone per supported provider:** a variation of the base drone D-final (`feature/drone-lab`), recognisable as that provider through silhouette, a signature feature and colour, inspired by its mascot or logo. It isn't a copy of it, and no logo is drawn.
- [ ] A3 **The drone family stays one family** (BLK 36 only, human 2026-11-10): same size (about half an astronaut), head-is-body, thruster pack and smoke, screen face with V2 eyes, BLK 36 colours exactly (brand colours mapped to their nearest BLK 36 colours), and the full idle loop (bob, look around, blink, working face, banking).
- [ ] A4 **Readable at 320×180:** each provider's drone can be told apart from the others at the crew close-up and at system distance.
- [ ] A5 **Per-session variety stays inside a provider (R2b):** sessions of one provider differ only in seeded details (e.g. trim or antenna), so two Claude sessions look like two Claude drones.

## Assumptions
- [x] (load-bearing, A1) Which providers leave local or git-visible traces, and in what form. Verified: see `docs/research/agent-providers.md`. About 25 agents can be detected from git alone (trailers and bot authors).
- [x] (A2) Approach: original drones that borrow generic traits (ghost, octopus, cloud head), agent names in plain text outside the pixel pass, and a "not affiliated" line in the README and demo. No logo is drawn. Reference images stay in `.archive/` (gitignored), never in the repo.
- [x] Copilot: GitHub retired the goggled mascot head (its brand guide says not to use it). **The human has GitHub's permission, and the Copilot drone keeps the goggles** (human, 2026-11-10).
- [ ] Qodo is a reviewer: its bot reviews PRs and authors fix commits. Its drone may need a reviewing pose as well as the working face.

## Flow
Scan → session attributed to a tool (R2) → drone seeded from tool + session ID (R2b) → the tool picks the drone family, and the session hash picks the details.

## Research
- Earlier attribution research: `docs/research/agent-attribution.md` (Claude Code logs probed; other tools listed).
- References: `.archive/docs/design/refs/agent-mascots/<provider>/` (with `SOURCES.md` and brand rules), `agent-logos/`, `drone/`.
- Strongest mascot matches: Codex's "Codey" (a pixel robot with a cloud-puff head and `>_` glyph eyes on a dark screen, with idle, blink, error and typing frames), Kiro's white ghost, Jules's white octopus, Cline's antenna robot head, and Qodo's hoodie anteater. Claude Code's Clawd has no official image (block-pixel critter). Cursor, Devin and OpenCode have logo marks only.

## Tasks
- Scout: provider detection matrix and mascot references (2026-11-09/10): done.
- Drone lab phase 2 (feature agent, `feature/drone-lab`): 9 provider drones plus the generic and "unknown agent" drones.

## Completion
- Merged: —
- Date: —
- Verification: —
