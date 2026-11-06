# Drone lab

> **Exploration, 2026-11-06, phase 1: six base-model directions (A–F); recommended: F · Beanie copter.** Phase 2 adapts the base into one drone per AI agent brand, as a parameter set plus a palette each.

In Commet, drones are AI coding-agent sessions: one drone per session, flying alongside the human crew (the K astronauts). This lab has one parameterised drone (`drone.js`): a raymarched SDF in the astronaut's pipeline, with the same banded lighting, unified self-shadowing, contact occlusion and screen eyes (the V2 set plus three drone-only glyphs). Each direction is only a parameter set (`variants.js`) and each palette is one five-slot object (`palette.js`), so a brand reskin is data, not new code. It's a throwaway mockup, not product code.

## Run

```sh
npm install
npm test      # pure-JS checks: params, attachment, loop lock, palettes, server allowlist
npm run lab   # regenerates everything in out/ (headless Chromium + SwiftShader, no socket, no network; needs ffmpeg)
npm run dev   # live page at http://127.0.0.1:5192/ (loopback only; PORT=... to change)
```

`node lab.mjs lineup crew` renders just the named outputs (`lineup`, `crew`, `closeups`, `turntable`, `params`).

## Outputs (`out/`)

| File | Shows |
|---|---|
| `base-lineup.png` | Directions A–F from the front, 3/4 and side, as 100×100 crops of the standard 320×180 frame, ×3; the recommendation has a teal frame |
| `base-with-crew.png` | The recommendation hovering between two K astronauts at the viewer's crew close-up (full 320×180 frame, ×4) |
| `base-turntable.gif` | The recommendation at the 2× close-up scale: one turn per 6 s loop, 15 fps, seamless |
| `base-lineup-turntable.gif` | All six directions turning together, same loop |
| `<letter>-closeup.png` | One direction with the camera at half distance, ×4: front, 3/4, side, back 3/4 |
| `params.md` | Every parameter with its range and meaning, each direction's values, the palette slots, the recommendation, and the GitHub Copilot mapping |

Every tile `npm run lab` renders is checked, and the run fails if any check fails:
- only the drone's palette plus space appears (plus BLK 36 crew colours in the crew shot), so there's no antialiasing and no dithering;
- the silhouette has exactly its intended pieces: 1, plus each free-floating anti-grav halo (plus the two astronauts in the crew shot);
- no tile is empty (a control render of a hidden drone must come back empty first, so a blank pipeline can't pass);
- nothing is clipped by the tile edge;
- each turntable's frame 90 is pixel-identical to frame 0.

## How it's built

- **`params.js`:** every parameter, with its range and meaning, in groups: head (the swappable face module: shape family, ears, topper), face (screen and eyes), body, hover, extras. Lengths are world units, the same as the crew's (a K astronaut is 0.95 tall).
- **`drone.js`:**
  - `layout(params)` attaches every add-on (ears, goggles, crest, antennae, arms, rotor arms, ring, lens, nozzle) to the shell's real surface, found by bisecting a JS port of the shell field. So any head or body shape stays connected.
  - `pose(t)` moves everything in whole cycles per 6 s loop (so also per 24 s scene loop): two bobs, one sway, twelve rotor turns, twelve plume flickers, four halo breaths, a lagging antenna.
  - The shader reads everything from uniforms, so sliders never recompile it.
  - Add-ons join the shell with a small crisp blend, so they read as separate parts through shading alone (no outlines). Emissive parts (eyes, antenna tips, lens, halos, ring core, plume) are unlit in the glow slot.
- **`palette.js`:** five slots: shell (4 bands), trim (4), screen (2 near-blacks plus the glint), glow (4, emissive) and accent (4).
  - `base`: a warm BLK 36 shell, the crew's gear greys as trim, the crew's visor tones, and the [OIII] teal as glow.
  - `frost`: a slot-test swap (not a brand).
- **`lab.js`:** the sheet renderer, the crew shot and the live page.
  - Each tile is a crop of a 180-tall frame at the viewer's camera (35° FOV, the crew close-up offset), so the pixel density matches the game.
  - The crew shot uses the viewer's own crew framing and spacing.
  - Labels are drawn at output resolution, outside the pixel pass.
- **Read-only imports:** `../asset-viewer/faces.js` (the V2 eyes), plus the K astronaut and BLK 36 crew roles from `../explorations/astronaut-lab/`. The dev server allowlists exactly those files outside this folder. `lab.mjs` re-checks the crew colours against `../asset-viewer/palette-map.js`.
