# Astronaut lab

> **Exploration, 2026-11-04: 10 variants. Outcome: final = K (C with A's backpack and smooth white suit); to be ported into asset-viewer.**

A lineup of astronaut designs to pick from (A–J), plus the pick, K, focused on proportions and joint connections. There's one parameterised astronaut (`astronaut.js`): a raymarched SDF like the asset viewer's, with the same banded lighting, unified self-shadowing, 4:3 screen visor, V2 eyes and BLK 36 crew colours. Each variant is only a parameter set (`variants.js`), so picking elements from different variants means mixing parameters. A throwaway mockup, not product code.

## Run

```sh
npm install
npm run lab   # regenerates everything in out/ (headless Chromium + SwiftShader, no socket, no network; needs ffmpeg)
npm run dev   # live mixer at http://127.0.0.1:5186/ (loopback only; PORT=... to change)
```

`node lab.mjs lineup closeups` renders just the named outputs (`lineup`, `poses`, `closeups`, `turntable`, `final`, `params`).

## Outputs (`out/`)

| File | Shows |
|---|---|
| `lineup.png` | Every variant from the front, 3/4 and side, as 100×128 crops of the standard 320×180 crew close-up, ×3 |
| `lineup-poses.png` | Idle float (t = 0) and mid-bob (t = 1.5 s) at 3/4 and side, with sway |
| `lineup-turntable.gif` | All variants turning together: one turn and one bob per 6 s loop, 15 fps, seamless |
| `<letter>-closeup.png` | One variant with the camera at half distance (twice the pixels), ×4: 3/4, side and back 3/4 |
| `final-compare.png` | The pick: A, C and K from the front, 3/4 and side, idle and mid-bob, ×3 |
| `K-turntable.gif` | K alone at the 2× close-up scale, turning: one turn and one bob per 6 s loop, 15 fps, seamless |
| `params.md` | Every variant's parameters and its leaning, in plain words |

Every tile `npm run lab` renders is checked, and the run fails if any check fails:
- only BLK 36 crew colours plus space appear (no antialiasing, no dithering);
- the silhouette is one connected piece (no floating parts or gaps);
- the figure isn't clipped by the tile edge;
- each turntable's frame 90 is pixel-identical to frame 0.

The crew colours are also checked against what `../../asset-viewer/palette-map.js` resolves for BLK 36.

## K, the final

K is C (hard-suit engineer) with A's backpack and a smooth white suit. All of C's grey (gear) detailing stays: the ring collars at the shoulders (in the contributor colour) and hips, the glove and boot cuffs, the neck seal, the mitts, the boots, the chest panel and the visor bezel. Every white-on-white detail goes back to A:
- elbows and knees are one smooth bent tube, not accordion ribs;
- the torso has A's corner radius instead of C's bevelled box edges;
- A's limb, bend and neck blends replace C's crisp white creases.

C's proportions are kept. The full parameter set is the K row of `out/params.md` (anything not listed there is A's default in `params.js`).

## How it's built

- **`params.js`:** every parameter, with its range and meaning. Lengths are in figure heights: the figure is always exactly 1 tall before the scene scale (0.95, as in the viewer). That's why mixing never changes the overall size, only the proportions.
- **`astronaut.js`:** `layout(params)` places every part. Shoulders, the backpack and the hips are attached to the torso's real surface, found by bisecting a JS port of the torso field, so any torso shape stays connected. `pose(t)` bends the limbs on the viewer's loop-locked cycle. The shader reads everything from uniforms, so sliders never recompile it. Limbs blend into the core (helmet, torso, pack) but not into each other, so a mitt resting on a thigh stays a mitt.
- **Joint types:**
  - shoulders and hips: blended, a ring collar, or a ball;
  - elbows and knees: one smooth bent tube, a ball, or accordion ribs.
  - Rings, balls, cuffs and the neck seal join with a small crisp blend, so they read as separate parts through shading alone (no outlines).
- **`lab.js`:** the sheet renderer and the live mixer. Each tile is a crop of a 180-tall frame at the viewer's camera (35° FOV, the crew close-up offset), so the pixel density matches the game. Labels are drawn at output resolution, outside the pixel pass.
- **Read-only import:** the eyes come from `../../asset-viewer/faces.js` (`EYES_GLSL`); the dev server allowlists that one file outside this folder.
