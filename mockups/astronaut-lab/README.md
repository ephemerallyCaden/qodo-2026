# Astronaut lab

A lineup of astronaut designs to pick from, focused on proportions and joint connections. There's one parameterised astronaut (`astronaut.js`): a raymarched SDF like the asset viewer's, with the same banded lighting, unified self-shadowing, 4:3 screen visor, V2 eyes and BLK 36 crew colours. Each variant is only a parameter set (`variants.js`), so picking elements from different variants means mixing parameters. A throwaway mockup, not product code.

## Run

```sh
npm install
npm run lab   # regenerates everything in out/ (headless Chromium + SwiftShader, no socket, no network; needs ffmpeg)
npm run dev   # live mixer at http://127.0.0.1:5186/ (loopback only; PORT=... to change)
```

`node lab.mjs lineup closeups` renders just the named outputs (`lineup`, `poses`, `closeups`, `turntable`, `params`).

## Outputs (`out/`)

| File | Shows |
|---|---|
| `lineup.png` | Every variant from the front, 3/4 and side, as 100×128 crops of the standard 320×180 crew close-up, ×3 |
| `lineup-poses.png` | Idle float (t = 0) and mid-bob (t = 1.5 s) at 3/4 and side, with sway |
| `lineup-turntable.gif` | All variants turning together: one turn and one bob per 6 s loop, 15 fps, seamless |
| `<letter>-closeup.png` | One variant with the camera at half distance (twice the pixels), ×4: 3/4, side and back 3/4 |
| `params.md` | Every variant's parameters and its leaning, in plain words |

Every tile `npm run lab` renders is checked, and the run fails if any check fails:
- only BLK 36 crew colours plus space appear (no antialiasing, no dithering);
- the silhouette is one connected piece (no floating parts or gaps);
- the figure isn't clipped by the tile edge;
- the turntable's frame 90 is pixel-identical to frame 0.

The crew colours are also checked against what `asset-viewer/palette-map.js` resolves for BLK 36.

## How it's built

- **`params.js`:** every parameter, with its range and meaning. Lengths are in figure heights: the figure is always exactly 1 tall before the scene scale (0.95, as in the viewer). That's why mixing never changes the overall size, only the proportions.
- **`astronaut.js`:** `layout(params)` places every part. Shoulders, the backpack and the hips are attached to the torso's real surface, found by bisecting a JS port of the torso field, so any torso shape stays connected. `pose(t)` bends the limbs on the viewer's loop-locked cycle. The shader reads everything from uniforms, so sliders never recompile it. Limbs blend into the core (helmet, torso, pack) but not into each other, so a mitt resting on a thigh stays a mitt.
- **Joint types:**
  - shoulders and hips: blended, a ring collar, or a ball;
  - elbows and knees: one smooth bent tube, a ball, or accordion ribs.
  - Rings, balls, cuffs and the neck seal join with a small crisp blend, so they read as separate parts through shading alone (no outlines).
- **`lab.js`:** the sheet renderer and the live mixer. Each tile is a crop of a 180-tall frame at the viewer's camera (35° FOV, the crew close-up offset), so the pixel density matches the game. Labels are drawn at output resolution, outside the pixel pass.
- **Read-only import:** the eyes come from `../asset-viewer/faces.js` (`EYES_GLSL`).
