# Co-change lab

> **Exploration, 2026-11-23: three line styles (A–C) for co-change constellations (#211, R9), and the missing-pair flag. Waiting for the human's pick.** When a planet or a file is focused, faint lines run to its strongest co-change partners (files that usually change in the same commit). Nothing is drawn for unfocused items. When a change touched a file but not its usual partner, the partner gets a flag that reads "usually changes with X". The connections panel (#212) is a separate design. It's a throwaway mockup, not product code.

The lab imports the asset viewer read-only, in library mode, as the fog and debris labs do. The planets, star, sky, stars, clouds, cloud fog (C6), debris, renderer, camera, loop and depth fade are the viewer's own, and the drone is the drone lab's. The lines, the flag and a copy of the product's stub beacon are drawn on the rendered frame at the internal resolution (320×180), before the nearest-neighbour upscale. Labels go on afterwards at output resolution, in the product's bitmap font (`../day1-hype/font.js` MICRO, which `web/src/labels/font.ts` was ported from), on a space-coloured backing as `web/src/labels/overlay.ts` draws them.

## Run

```sh
npm ci
npm test      # pure checks + browser checks (headless Chromium + SwiftShader, no socket, no network), one file at a time (about 1.5 min)
npm run lab   # everything in out/ (about 2.5 min; needs ffmpeg)
npm run dev   # live page at http://127.0.0.1:5195/cochange-lab/ (loopback only; PORT=... to change)
```

`node lab.mjs stills gifs compare markers measures` names the outputs (no names = all). The live page has a line-style picker, a focus picker and a reduced-motion switch (it starts from the system setting). Clicking a planet focuses it, and clicking empty space clears the focus.

## The scene and the data

- **Six planets round the star**, one per top-level folder and one per health band: `src` (lush), `web` (ocean, 50% fogged with the viewer's cloud fog C6), `test` (ice), `docs` (desert, with a thin ring and a beacon), `scripts` (toxic, with 3 debris pieces) and `bench` (lava). A Claude drone works beside `src`. So the lines and the flag are judged beside fog, rings, debris, a drone and a beacon.
- **The history** (`data.js`) is 160 mock commits from a seeded PRNG. Each commit is one of six kinds of change (fog work, scan work, CLI work and so on), and each kind touches its files with set chances, so files in one kind co-change.
- **Pairs are #211's AC1.** For each pair of files, the commits with both over the commits with either (Jaccard). A pair is kept at 0.15 or more and only in the top 5 of either file. There are 36 pairs.
- **Three strength steps:** weak from 0.15, mid from 0.30, strong from 0.50.
- **A planet's line** to another planet takes the step of its strongest file pair with it. `src` has four partner planets: `web` strong (0.88), `test` strong (0.76), `docs` mid (0.31) and `bench` weak (0.27). That's the most a planet draws (4).
- **A file's lines** go one per partner planet, at its strongest partner file there. The partner files are named under their planet's label. A partner on the file's own planet can't be drawn without crossing the disc, so it's named under the focused file instead ("with core/territory.ts").
- **The missing-pair flag (AC4).** The latest change touched `src/core/fog.ts` and `test/fog.test.ts`. Every file left out of it whose partner in it is at least strong (0.50) is flagged. That's one file: `web/src/model/fog.ts`, which usually changes with `src/core/fog.ts` (0.88).

## Recommendation

**A · star chart.** It's the faintest (148 px for four lines, against 373 for B and 889 for C), its three steps change two cues at once (brightness and density), it reads as a constellation, and it adds no motion, so reduced motion costs it nothing. B's beads show direction best and C's bow keeps lines apart best, but neither earns its cost as the default. Worth trying with A: a floor of 3 dots per line, and B's bead as a one-shot draw-in only.

## The options

| | Line style | Strength (weak / mid / strong) | Motion |
|---|---|---|---|
| A | **star chart**: dotted, 2×2 px dots | brighter and denser: `#3b3866` every 6 px, `#9a90e0` every 5 px, `#fff8ff` every 4 px | dots plot outward from the focus |
| B | **signal**: a dim 2 px rail with beads of light | 1, 2 or 3 beads in flight (white head, lavender tail), on a `#3b3866` rail | lines grow outward; beads run from the focus to the partner, one trip per 3 s |
| C | **arcs**: solid quadratic arcs bowed away from the star by 0.22 of the chord | thicker: 2, 3 or 4 px, all `#3b3866` | arcs grow outward |

These rules hold for every option:
- **Focus only.** Lines draw only for the focused planet or file, and an unfocused frame has 0 line pixels.
- **Palette only.** Every line pixel is one of the v2 starfield's three colours, so a constellation is drawn in starlight. The lines aren't depth-faded: like the product's beacons, they're a HUD layer in exact palette colours.
- **Crisp.** Lines are whole w×w stamps every pixel of arc length, at least 2 px thick, with no slivers, anti-aliasing or blending.
- **They don't fight anything.** A stamp is drawn only where every pixel is empty space (space or a starfield pixel) and isn't within 1 px of anything else. Anything else means discs, clouds and cloud fog, rings, moons, debris, the drone, the star and its corona, every label's backing and the flag and beacon boxes. A line stops 1 px short and carries on past the object.
- **Draw-in.** Over 0.7 s from the focused end, strongest first, 0.1 s apart, easing out. The span starts where the line leaves the focused disc's circle, so dots and beads don't shift as clouds move at the limb.
- **Reduced motion.** Lines appear at once, B's beads hold where they were, and the scene freezes on the frame where reduced motion was switched on (art direction §7).

## The flag

A flat teal pair glyph, 12×6 px: a filled dot (`#00bc9c`) linked to an empty ring (`#00ffd5`). The ring is the pair's missing half. It stands 2 px beside the flagged file's planet at mid height, on the side with room for its text, and keeps that side as focus changes. It shows whether or not anything is focused, because it's an alert, and it's sparse. Its two lines of text ("web/src/model/fog.ts" / "usually changes with src/core/fog.ts") show when its pair is in focus: its own planet, the planet of the file it usually changes with, or that file.

Teal is the [OIII] accent, reserved for code-layer events and HUD marks. A change that skipped its usual partner is an event. Here is how the flag differs from the other signals (`markers.png`):

| Signal | Its look | How the flag differs |
|---|---|---|
| Fog (C6) | white storm cloud on the disc | the flag is off the disc, flat, teal |
| Beacon | 8×8 lamp on a 2 px mast above the disc, BLK 36 blue-white | the flag is beside the disc, with no mast, in teal |
| Debris | grey 3D pieces, 1 px red outline, blinking red lights, tumbling | the flag is flat, still and teal |
| Drone | 3D BLK 36 figure with a dark screen and teal eyes | the flag shares the teal but not the shape: no body or screen, beside a planet, not orbiting |
| Rings | planet-coloured bands round the disc | the flag is a small glyph, not a band |

## Measured (`out/measures.json`)

The frame is 57,600 px, with `src` focused and loop time 4 s.

| | A | B | C |
|---|---|---|---|
| line px, planet focus (4 lines) | 148 (0.26%) | 373 (0.65%) | 889 (1.54%) |
| line px, file focus (3 lines) | 156 | 381 | 786 |
| line px with nothing focused | 0 | 0 | 0 |
| flag px (teal) | 44 (0.08%) | 44 | 44 |

**Contrast** (OKLab ΔE):
- **Against space:** dim 0.216, mid 0.544 and bright 0.828. Neighbouring steps are 0.329 and 0.312 apart.
- **Against planet colours:** the line colours sit 0.048–0.051 from the nearest one (`#9a90e0` against the polar cap's `#98a3e8`, `#3b3866` against a crevasse blue). They never touch a disc, so that doesn't matter.
- **The strong step:** `#fff8ff` is 0.022 from cloud cream `#fffaf0`. The 1 px gap keeps a strong line off a white-clouded limb, but it can look as if it touches. A's strong dots have this risk; B's bead heads do too.

## Checks

`checks.mjs` checks every frame the runner writes and the tests reuse it. It fails on:
- an empty scene;
- a focused frame with no line, or an unfocused frame with any;
- an overlay pixel that isn't exactly its palette colour, or a pixel that changed outside the overlay;
- a line pixel on a blocked pixel, or a 1 px sliver;
- teal on 10% of the frame or more.

`npm test` adds:
- **Pure checks:** Jaccard, the threshold and the cap on a hand-computed fixture, the demo's partners and its one flag, determinism, the rasteriser's 2 px stamps, mask and dots, draw-in, beads, palette membership, the flag's 2 px strokes and the route allowlist.
- **Browser checks:** every option on planet and file focus; nothing focused; the same cell twice; draw-in; B's beads moving; the overlay a loop later (24 s); reduced motion frozen and fully drawn; label backings in UI colours with no line under them; and the live page binding with no errors.

## Outputs (`out/`)

| File | Shows |
|---|---|
| `option-A.png`, `option-B.png`, `option-C.png` | 1280×720: `src` focused, its four lines, the flag with its text |
| `option-A-file.png` … | 1280×720: `src/core/fog.ts` focused, its partner files named under their planets |
| `option-A.gif` … | 640×360, 6 s at 15 fps: nothing focused (0–0.8 s), `src` focused and its lines drawing in, then `src/core/fog.ts` focused at 3.6 s |
| `compare.png` | The three options side by side: planet focus, file focus, and 0.35 s into the draw-in |
| `markers.png` | ×4 crops: the flag beside the fogged planet, with its text, and the beacon, ring, debris, drone and `src` |
| `measures.json` | Overlay pixel counts per option and focus |

## How it's built

| File | What |
|---|---|
| `data.js` | The planets, files, mock history, pairs (Jaccard, threshold, cap), steps, partners, missing-pair flags and #18 settlements. Pure, tested in Node |
| `raster.js` | Resampling, w×w stamps, the span, draw-in, dots, beads, the busy mask and its 1 px gap, marker shapes. Pure |
| `variants.js` | The options, colours, the flag and beacon shapes, the GIF's timeline |
| `lab.js`, `index.html` | The page: the scene from the viewer's factories, the overlay, labels, sheets and the live view |
| `lab.mjs`, `checks.mjs`, `harness.mjs` | The runner, the shared checks and the Playwright harness |
| `routes.mjs`, `serve.mjs` | The file allowlist (this folder, three, `../asset-viewer/*.js`, the drone lab's top-level modules, the crew colours, the asset library's `drones.js` and the day-1 font) and the loopback server |

## Open questions and limits

- **Porting the mask.** The lab builds it from the rendered frame, reading back every pixel that isn't space. The product's pixel pass would need the same from its colour target, or an id target, plus the label rectangles. Disc circles alone miss clouds, rings and debris past the limb.
- **File focus looks like planet focus.** A file's line starts at its settlement but is hidden over the disc, so it leaves the limb towards its partner, much as the planet's line does. The labels carry the file names. `src/core/*` settles at the south pole (#18 seeds a planet's second continent there), so its lines leave from the bottom.
- **Tests are moons in the product.** Here `test/` is a planet. A file and its own test is the commonest pair, and "you changed X but not its test" is the most useful flag, but moons are 5–9 px. Lines and flags on moons aren't designed.
- **The camera stays put.** The product's focus glides in, so partners can leave the frame. Edge markers for off-screen partners aren't designed.
- **Flag lifetime.** The flag here shows until the data changes. Whether a later change that touches the partner clears it, or charting does, is open.
- **The planet-line strength** is the strongest file pair between the two planets. A sum or a planet-level Jaccard would rank big planets higher.
