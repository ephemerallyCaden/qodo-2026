# Feature: Asset Library (demo playground)

## Status
In Progress

## Trigger
The human, 2026-11-06: "let's get on building some form of gallery, so we can see all the assets we've worked on individually, and have a place to pull them from or reference them from if need be. This asset library should basically be the demo playground where we can see and select all our assets, the astronauts, planets, moons, and configure them however we want to test how they look. For the astronaut it should be like we can select any face colour and any face etc."

Design answers (2026-11-06):
- Layout: **catalogue + inspector, plus scene composition.**
- Scope: astronauts, planets, moons, **rings and clouds as assets**, **ASCII FX**, the **exploration archive** (marked not final), and **palettes**. Palettes start from the current palette, and individual colours are editable; no whole-palette swapping.
- Saving: **URL + copy JSON**, plus a PNG snapshot.

## Requirements
- [ ] R1 **Catalogue:** a browsable thumbnail grid grouped by type: Astronauts, Planets (by biome: lush, ocean, ice, desert, lava, gas giant, moon, toxic), Moons, Rings, Clouds, FX, Palettes, and Explorations (archive).
- [ ] R2 **Inspector:** selecting an item opens it on a large live 3D stage (same pixel pipeline, 24 s loop) with every relevant control.
  - **Astronaut:** contributor colour (any colour, not just presets), eye design (any of the 10 V2), eye glow colour, handle/seed, pose/bob phase, view angle, blink on/off.
  - **Planet:** biome, seed, size, ring (width/distance/off), clouds (cover/float/shadow), moons, halo, artefacts (count/teal), lava mode, depth mode.
  - **Moons, rings, clouds:** their own parameters.
  - **FX:** planet artefacts plus the ASCII FX concepts (fog, packets, terminal/bands/transition, tags) as toggleable overlays where they exist in code.
- [ ] R3 **Compose scenes:** drop several assets into one scene (e.g. a planet with moons plus 3 astronauts at chosen positions and depths), move and select each, and configure each through the inspector.
- [ ] R4 **Palette editor:** the current palettes are the base (v2 world, BLK 36 crew, [OIII] teal accent, lava ramps). Each colour swatch is editable individually, with hex copy and reset-to-base, and the change applies live to every asset.
- [ ] R5 **Presets:** every configuration (single asset or composed scene, including palette edits) is encoded in the URL and exportable/importable as a JSON parameter block, with a PNG snapshot button.
- [ ] R6 **Explorations:** astronaut variants A–J (from the archived lab) and other non-final looks are browsable but clearly badged "exploration, not final". The final assets are visually distinguished.
- [ ] R7 **Fidelity:** an asset rendered in the library is pixel-identical to the same asset and configuration in the asset viewer (same shaders and modules, no forks).
- [ ] R8 **Local-only and deterministic:** the server is 127.0.0.1 only, there's no network at runtime, and the same URL always renders the same pixels.

**Round 2 (human, 2026-11-09)**
- [x] R9 **Current looks only, labelled by meaning:** the toxic planet is the ember health band (#19), not the old acid-lime look. Planet tiles say what their look means (lava, toxic, ash and healthy bands; lush, ocean and ice as the three healthy looks; gas giant and barren moon as library extras), per the art direction §6. Rings are badged "meaning open".
- [x] R10 **Iteration view:** a history of the art, showing how each asset family got to its final look (crew, planets and biomes, toxic, lava, clouds, rings, palettes, depth, ASCII FX, drones). Each family is a dated timeline, oldest to final, and each step says what changed and why. Steps that the current code can still render (an old palette or parameter set) are live on the stage; the others show their archived render, badged "archived image". The final step is marked final.
- [x] R11 **History stays local:** archived renders are read from `<main-checkout>/.archive/art-iteration/` (gitignored, local only) through the server's allowlist. They aren't copied into git. Without the archive the view still works and says the images aren't available.

## Assumptions
- [x] The asset viewer's modules can be reused. astronaut.js, artefacts.js, planet-ramps.js, faces.js and palette-map.js are ES modules; viewer.js currently builds its UI at import time and exports little, so a small behaviour-preserving extraction (planet/moon/ring factories) may be needed. The asset viewer's tests must stay green and its output pixel-identical.
- [ ] (R10) Most history steps can't be re-rendered live, because their code is gone or superseded. `.archive/art-iteration/04-timeline/` holds one render per viewer revision (named `NN-<commit>-<what changed>--<view>`), `06-explorations/` and `07-ascii-fx/` hold the labs, and `docs/design/art-direction-history.md` gives the reasons. Not load-bearing: either source alone makes a useful timeline.
- [ ] The ASCII FX concepts other than artefacts live only in the ascii-fx mockup (feature/ascii-fx, vendored world.js). They're included only where they can be ported cheaply; otherwise they're listed as "not yet ported" in the catalogue.

## Flow
Open the library → browse the catalogue → click an asset → it renders on the stage → tweak controls (the URL updates) → optionally "add to scene" → compose several assets → edit palette colours → copy URL or JSON, or snapshot a PNG.

## Tasks
- Task: build the asset library in `mockups/asset-library/` (feature agent, branch feature/asset-library), covering R1–R8, in milestones.
- Task: R9–R11 (feature agent, branch feature/asset-library): done, a6cc792..68da3d9 (library 40/40, viewer 26/26). The history tab has 10 family timelines; the `/art-archive/` route serves an exact allowlist of PNG and GIF files on 127.0.0.1, read-only, with realpath containment.
- Dustier-ash trial + viewer bind: done (4af1dc2..6a332dc).
- Drones group: done (b1e89ef..b2afd10). 11 provider drones + A–E explorations, a full inspector, drones in scenes, and 10 drones at 0 px against the drone lab's capture page. Known gap: drones in scenes get no depth fade.
- Debris group: done (b3811cc..69c3116). 24 tiles, an inspector debris section with sweep and selection, debris in scenes, a live debris history (A–E, A2, A3), and 3 cases at 0 px against the viewer. Thumbnails now render on scroll. Library 59/59, viewer 28/28, health-looks 24/24, drone-lab 21/21, debris-lab 24/24.

## Completion
- Merged: —
- Date: —
- Verification: —
