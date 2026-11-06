# Drone lab

> **Exploration, 2026-11-06: five base drones (A–E) to the human's brief. The human picked D; D-final (D with the human's exact parameters) is the base drone.** Phase 2 adapts it into one drone per AI agent brand, as a parameter set plus a palette each.

In Commet, drones are AI coding-agent sessions: one drone per session, flying with the human crew (the K astronauts).

This lab has one parameterised drone (`drone.js`). It's a raymarched SDF in the astronaut's pipeline, with the same banded lighting, unified self-shadowing, contact occlusion and V2 screen eyes.

Every variant follows the brief:
- head-is-body;
- about half an astronaut tall;
- a thruster pack sputtering chunky smoke puffs;
- a BLK 36 gear-grey shell with white trim, a dark screen and teal eyes;
- no arms;
- the full idle loop: bob and puffs, looking around and blinking, a working face where the eyes go and the screen flashes with typed ASCII glyphs, and banking into its drift.

Each variant is only a parameter set (`variants.js`), and each palette is one six-slot object (`palette.js`). It's a throwaway mockup, not product code.

## Run

```sh
npm install
npm test      # pure-JS checks: params, variety, attachment, size, loop lock, smoke, palettes, server allowlist
npm run lab   # regenerates everything in out/ in about 2 min (headless Chromium + SwiftShader, no socket, no network; needs ffmpeg)
npm run dev   # live page at http://127.0.0.1:5192/ (loopback only; PORT=... to change)
```

`node lab.mjs final working` renders just the named outputs (`lineup`, `crew`, `closeups`, `turntable`, `motion`, `final`, `working`, `params`).

## Outputs (`out/`)

| File | Shows |
|---|---|
| `final-closeup.png` | D-final, the base drone: 3/4, front and side, close up |
| `final-with-crew.png` | D-final between two K astronauts at the viewer's crew close-up (320×180, ×4) |
| `final-turntable.gif`, `final-motion.gif` | D-final's 6 s turntable and 12 s motion loop (drift, bank, puffs, look-around, the glyph-typing face) |
| `working-face.png` | The working face frame by frame: blink shut, glyphs fill and type, scramble out, blink open |
| `base-lineup.png` | The explorations A–E from the front, 3/4 and side, as 100×100 crops of the standard 320×180 frame, ×3; the human's pick (D) has a teal frame |
| `base-with-crew.png` | Each variant hovering between two K astronauts at the viewer's crew close-up (full 320×180 frames, ×3) |
| `<letter>-turntable.gif` | One variant at the 2× close-up: one turn per 6 s idle loop (bob, sway, puffs, a blink), 15 fps, seamless |
| `<letter>-motion.gif` | The 12 s behaviour loop with the camera fixed: drift and banking, bursts of puffs, looking around, blinking, and the working face (glyph typing). 15 fps, seamless |
| `<letter>-closeup.png` | One variant with the camera at half distance, ×3: front, 3/4, side, back 3/4 |
| `params.md` | Every parameter with its range and meaning, each variant's values, the palette slots, the behaviour timeline, the pick (D-final) and its provenance, the working face, and the GitHub Copilot mapping |

Every tile `npm run lab` renders is checked, and the run fails if any check fails:
- only the drone's palette plus space appears (plus BLK 36 crew colours in the crew shot), so there's no antialiasing and no dithering;
- with smoke and sparkles off (they float free by design), the body is exactly one connected piece. Animated loops run this check on every third frame;
- no tile is empty (a control render of a hidden drone must come back empty first);
- nothing is clipped by the tile edge;
- each GIF shows smoke in at least half its checked frames;
- each GIF's frame one loop later is pixel-identical to frame 0;
- the face probe passes for every variant: while working, glyph pixels and no eye pixels; at rest, eyes and no glyphs.

## How it's built

- **`params.js`:** every parameter, with its range and meaning, in groups:
  - head (the shape family covering dome, capsule, cube, teardrop and saucer, plus rim, chin pod, ears, topper, antenna, size);
  - face (screen shape and V2 eyes, gaze, glance, the working face's glyph rate and size);
  - thrusters (five layouts, nozzle shape, smoke style, puff size and rate, sparkles);
  - motion (bob, drift, bank, head turn);
  - accent.
- **`drone.js`:**
  - `layout(params)` attaches every add-on (rim, ears, goggles, crest, antennae, nozzles) to the head's real surface, found by bisecting a JS port of the head field.
  - `bodyAt(t)` drifts the drone in a figure 8, bobs it and banks it into its velocity.
  - `behaviour(t)` schedules the glances, blinks and the working phase; `faceAt` turns it into eyes or glyphs, never both.
  - `smokeAt(t)` emits puffs: fixed slots per nozzle, each firing at most once per 1.5 s. Whether a slot fires depends on the effort at its birth: acceleration, banking and the bob's upstroke. A puff is born at the nozzle mouth where the nozzle was at its birth, so trails follow the motion. It slows, rises, drifts on a hashed breeze, grows and then shrinks, stepping a band darker as it fades. Every hash is keyed on the cycle within the loop, so the smoke repeats exactly.
  - Sparkles are crisp 1-pixel dots and `+` crosses, drawn at their projected pixel in the same shader.
  - The shader reads everything from uniforms, so sliders never recompile it. Smoke is shaded in its own three bands and casts no shadows; the body self-shadows as the astronaut does.
- **`palette.js`:** six slots: shell (4), trim (4), screen (3), glow (4, emissive), accent (4) and smoke (3). `base` is the human's BLK 36 + teal (a gear-grey shell, kept off the suit ramp, with white trim); `ember` is a slot-test swap (not a brand).
- **`lab.js`:** the sheet renderer, the crew shot (the viewer's crew framing and spacing) and the live page (variant picker, sliders, palette, views including a fixed-camera motion view, and toggles for motion and smoke). Labels are drawn at output resolution, outside the pixel pass.
- **Read-only imports:**
  - `../asset-viewer/faces.js` (the V2 eyes);
  - the K astronaut and BLK 36 crew roles from `../explorations/astronaut-lab/`.

  The dev server allowlists exactly those files outside this folder. `lab.mjs` re-checks the crew colours against `../asset-viewer/palette-map.js`.
