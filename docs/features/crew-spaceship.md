# Feature: Crew spaceship (astronauts from git history) and the art renderer

## Status
In Progress (data + API merged in #226; ship R2-4 picked; renderer next)

## Trigger
The human, 2026-11-25: "lets do the astronauts for day 18! and the spaceship, lets get an art renderer going!" Answers the same day:
- "art renderer" means both, lab first: an art lab that renders spaceship designs to pick, then a product renderer that draws the picked ship and the astronauts in the live view;
- the ship: "3-4 variants based on the description of a cartoonish rocket";
- Day 18: "use the most optimal red job from that PR";
- builder: feature agents, not the runner (#218 still open).

Ticket: #207 (understanding mode U8).

## Requirements
- [x] C1 **Crew from local git history** (#207 AC1): one astronaut per human author in the scan window, merged by email and name aliases (`.mailmap` when present). Bots and agent authors are excluded. No network (R6).
- [ ] C2 **A cartoonish rocket**, chosen by the human from 3–4 lab variants. **Picked (human, 2026-11-25): R2-4 "Round lander"** (`feature/ship-lab`, `mockups/ship-lab/`, round 2): the fattest round finned rocket, a red belly band of portholes, four splayed fins with ball feet, a blunt dome nose with a blinking antenna, the captain's gold porthole above the band. BLK 36 only, ship scale 0.6, 8 per deck, a second deck for 9–16, "+N" past 16. It must be readable at 320×180 (art direction §1), drawn in the art direction's palettes, and carry the crew.
- [ ] C3 **Astronauts use the asset library's astronaut** (`mockups/asset-viewer/astronaut.js`, art direction §8, BLK 36 exactly). Their bob, sway and blink are loop-locked (§7).
- [ ] C4 **A product art renderer** draws the ship and the astronauts in the live 3D view through the pixel pass. Placement is deterministic, near your star, next to your own drones. The draw budget stays under its cap.
- [ ] C5 **Astronaut panel** (#207 AC3; data and `GET /api/crew-detail` done in #226, the clickable panel lands with the renderer, C4): clicking an astronaut shows their name, the planets and files they touched in the window, with a touch count each (no code), and when they were last active. Allowed by the Rule 6 amendment (human, 2026-11-25): never ranked, sorted or compared by those numbers, one person at a time, no headline total, crew ordered by person id.
- [x] C6 **Drones are yours only** (#207 AC4): teammates get no drones.
- [x] C7 **Privacy** (#207 AC5): no email is shown unless it's already in git, and no absolute paths; snapshot rules apply.
- [x] C9 **You're the captain** (human, 2026-11-25): your own astronaut is aboard and marked as captain, and your other emails merge into you (`selfEmails`, system design §5.1.9).
- [x] C10 **Aliases** (human, 2026-11-25): `.mailmap` when present, plus exact author-name matches.
- [x] C11 **Fixture crew** (human, 2026-11-25): the film and render tests use a deterministic fixture repo with 4–6 invented teammates; no real people's names in posts.
- [ ] C8 **Tests** (#207 AC6): alias merging, bot exclusion, a deliberate snapshot golden update, and a render test that fails on empty output. (All but the render test done in #226; the render test lands with the renderer, C4.)

## Assumptions
- [x] (load-bearing, C1) Verified (crew-scout L1): the snapshot (`schemaVersion '0.2'`) has `people: {id, displayName, isSelf}[]` and `Commit.author`. `PersonId` is `p_` plus a sha256 of the lowercased mailmapped email (raw email never stored). `.mailmap` is honoured, but name aliases aren't merged and bots aren't detected (`people[].isBot` is planned in system-design). No schema bump: optional fields plus `needsRescan`, as with `cochange`.
- [x] (load-bearing, C4) Verified: each drone is one raymarched SDF proxy box (one draw call) in `SystemScene.fleet.group` through the pixel pass; placement is pure (model, home, seed, frame); `DRONE_CAP` is 16; the budget is 100 draw calls / 500k triangles; picking is CPU pick spheres → panel → `dock.ts`. Astronauts and the ship can reuse the pattern.
- [x] (C3) Verified: `astronaut.js` is pure (three.js only, with a loop-locked pose and `ASTRO_SDF_GLSL`); the `makeAstronaut` wrapper uses viewer globals the product mostly has (`palette.crew`, depth fade, light). Missing: 8 of the 10 V2 eyes. The precedent is the drone port (87ffe32, one commit).
- [x] (C7) Verified: names are already served raw in `GET /api/snapshot`; emails are in no response. New routes go in the server's routes Map, which inherits every gate (Host, origin, token, method), and must be added to `security.test.ts`. Plan: `GET /api/crew` and `GET /api/crew-detail?person=&at=`, mirroring drones and drone-detail.
- [ ] (C2) Ship placement relative to the star lane, which the star-home drones share; crew cap and overflow (from the lab).
- [ ] Commet's own repo has one author (you), so it draws only the captain; hence C11.
## Flow
`commet scan` → git log authors in the window → aliases merged, bots/agents dropped → crew list in the snapshot (ids, display names, per-file touch counts) → `commet open` serves it → the view places the ship near the star and an astronaut per crew member → click → panel.

## Research
- crew-scout L1 (2026-11-25): see Assumptions. Data and API built on feature/crew-data (267b39c, 5c68a83): CrewView has no per-person counts; CrewDetail has touch counts per file and planet, sorted by path. Known limit: the window is first-parent only, so a teammate whose work only arrives inside merge commits isn't in the crew (documented in the contract).
- Ship lab round 1 (A–D): the human wants A's finned classic but shorter, fatter and rounder, with chunky window rims; round 2 is in progress. Overflow approved: 8 per deck, 2 decks, "+N" past 16. Ship scale 0.6.

## Tasks
- Ship lab: 3–4 cartoonish rocket variants for the human to pick (mockups, not product). Can start now.
- Data, renderer, panel: after research.
