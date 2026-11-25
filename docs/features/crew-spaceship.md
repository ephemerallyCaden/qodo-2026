# Feature: Crew spaceship (astronauts from git history) and the art renderer

## Status
Research

## Trigger
The human, 2026-11-25: "lets do the astronauts for day 18! and the spaceship, lets get an art renderer going!" Answers the same day:
- "art renderer" means both, lab first: an art lab that renders spaceship designs to pick, then a product renderer that draws the picked ship and the astronauts in the live view;
- the ship: "3-4 variants based on the description of a cartoonish rocket";
- Day 18: "use the most optimal red job from that PR";
- builder: feature agents, not the runner (#218 still open).

Ticket: #207 (understanding mode U8).

## Requirements
- [ ] C1 **Crew from local git history** (#207 AC1): one astronaut per human author in the scan window, merged by email and name aliases (`.mailmap` when present). Bots and agent authors are excluded. No network (R6).
- [ ] C2 **A cartoonish rocket**, chosen by the human from 3–4 lab variants. It must be readable at 320×180 (art direction §1), drawn in the art direction's palettes, and carry the crew.
- [ ] C3 **Astronauts use the asset library's astronaut** (`mockups/asset-viewer/astronaut.js`, art direction §8, BLK 36 exactly). Their bob, sway and blink are loop-locked (§7).
- [ ] C4 **A product art renderer** draws the ship and the astronauts in the live 3D view through the pixel pass. Placement is deterministic, near your star, next to your own drones. The draw budget stays under its cap.
- [ ] C5 **Astronaut panel** (#207 AC3): clicking an astronaut shows their name, the planets and files they touched in the window (counts only, no code) and when they were last active.
- [ ] C6 **Drones are yours only** (#207 AC4): teammates get no drones.
- [ ] C7 **Privacy** (#207 AC5): no email is shown unless it's already in git, and no absolute paths; snapshot rules apply.
- [ ] C8 **Tests** (#207 AC6): alias merging, bot exclusion, a deliberate snapshot golden update, and a render test that fails on empty output.

## Assumptions
- [ ] (load-bearing, C1) The scan already records per-commit authors and person ids (attribution `selfPersonIds`, a human/agent/mixed class). Which fields exist in `snapshot.v1`, and does adding a crew list need a snapshot schema bump?
- [ ] (load-bearing, C4) How the product draws drones today (sprites, billboards or models; which pass; the draw budget). Can astronauts and the ship reuse that path?
- [ ] (C3) How portable `astronaut.js` is: pure drawing code or tied to the viewer, and its dependencies.
- [ ] (C2) Where the ship sits relative to the star and the drones' ring, and how many astronauts fit before it needs an overflow rule.
- [ ] (C7) Do author names or emails already appear in any served response? R14 (local server hardening) applies to any new endpoint.

## Flow
`commet scan` → git log authors in the window → aliases merged, bots/agents dropped → crew list in the snapshot (ids, display names, per-file touch counts) → `commet open` serves it → the view places the ship near the star and an astronaut per crew member → click → panel.

## Research
(pending scout)

## Tasks
- Ship lab: 3–4 cartoonish rocket variants for the human to pick (mockups, not product). Can start now.
- Data, renderer, panel: after research.
