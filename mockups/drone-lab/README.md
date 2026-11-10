# Drone lab

> **Exploration, 2026-11-06: five base drones (A–E) to the human's brief. The human picked D; D-final (D with the human's exact parameters) is the base drone.** Phase 2 (2026-11-10) adapts it into one drone per approved agent provider, plus a generic and an "unknown agent" drone, each a parameter set plus a palette: see [Phase 2](#phase-2-brand-drones).
>
> **The brand drones are original designs. They aren't affiliated with or endorsed by Anthropic, Anysphere (Cursor), GitHub, OpenAI, Google, Cognition (Devin), Amazon (Kiro), the OpenCode project or Qodo.** No logo is drawn, and names appear only as plain-text labels outside the pixel pass.

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
npm test      # pure-JS checks: params, variety, attachment, size, loop lock, smoke, palettes, server allowlist, brands (A3, A5, the A4 report)
npm run lab   # regenerates everything in out/: about 2 min for A–E and D-final, plus about 6 min for the brand GIFs on an idle machine (headless Chromium + SwiftShader, no socket, no network; needs ffmpeg)
npm run dev   # live page at http://127.0.0.1:5192/ (loopback only; PORT=... to change)
```

`node lab.mjs final working` renders just the named outputs (`lineup`, `crew`, `closeups`, `turntable`, `motion`, `final`, `working`, `params`; for the brands `brands`, `brand-closeups`, `seeds`, `squads`, `brand-gifs`, `a4`; and `identity`, the A–E / D-final pixel-identity check). Add `brand=copilot,codex` to limit `brand-closeups` and `brand-gifs` to those drones.

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
| `params.md` | Every parameter with its range and meaning, each variant's values, the palette slots, the behaviour timeline, the pick (D-final) and its provenance, the working face, and the brand drones (parameters, palettes, colour mapping, per-session variety, A4 numbers) |
| `brands-lineup.png` | All 11 brand drones from the front, 3/4 and side, 180p crops ×3, labelled outside the pixel pass |
| `brand-<id>-closeup.png` | One brand drone at the 2× close-up: front, 3/4, side, back 3/4 |
| `brand-<id>-turntable.gif`, `brand-<id>-motion.gif` | One brand drone's 6 s turntable and 12 s motion loop (drift, bank, puffs, look-around, its working face), 15 fps, seamless |
| `brands-seeds.png` | A5: three sessions of each drone, differing only in seeded details |
| `brands-crew-closeup.png` | K astronauts with the brand drones at the viewer's crew close-up (four 320×180 frames, all 11 drones) |
| `brands-crew-system.png` | All 11 drones and two K astronauts at the viewer's system-view distance (320×180, ×4) |
| `brands-a4.json` | The A4 distinctness measurements: per scale, view and pair, the silhouette IoU, the mean-colour ΔE and the score |

Every tile `npm run lab` renders is checked, and the run fails if any check fails:
- only the drone's palette plus space appears (plus BLK 36 crew colours in the crew shot), so there's no antialiasing and no dithering;
- with smoke and sparkles off (they float free by design), the body is exactly one connected piece. Animated loops run this check on every third frame;
- no tile is empty (a control render of a hidden drone must come back empty first);
- nothing is clipped by the tile edge;
- each GIF shows smoke in at least half its checked frames;
- each GIF's frame one loop later is pixel-identical to frame 0;
- the face probe passes for every variant and every brand drone (and for Copilot's and Codex's V2 fallback eyes): while working, glyph pixels and no eye pixels; at rest, eyes and no glyphs;
- A–E and D-final are pixel-identical to their renders before the brand geometry existed (25 hashed tiles in `test/identity.json`);
- every pair of brand drones passes A4 at the crew close-up and at system distance (see below).

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

## Phase 2: brand drones

One drone per approved provider (human, 2026-11-10), plus **generic** (every other detected tool: D-final exactly, with the tool's name as a label) and **unknown agent** (agent evidence with no known tool). Each is D-final with a parameter set laid over it plus a palette (`brands.js`, `palette.js` `BRAND_PALETTES`). They borrow a silhouette, one or two signature features and a colour from the provider's mascot or logo, without copying it. The full parameter, palette and colour tables are generated into `out/params.md`.

| Drone | Covers | Inspired by | What makes it that provider | Eyes |
|---|---|---|---|---|
| Claude Code | CLI, web, Action | Clawd, the CLI's block critter | a wide flat block body on four stubby legs (two pairs), side stubs, terracotta orange; its working face is an asterisk spinner | Dots |
| Cursor | IDE, CLI, cloud | the isometric cube logo | a crisp graphite cube with a white top facet (the logo's light facet) and a flat screen; sputters precise dots | LED bar |
| GitHub Copilot | cloud agent, CLI, app, VS Code | the goggled helmet (kept with GitHub's permission) | big pilot goggles across the top of a wide helmet, low ear pads, a lower face plate with upright pill eyes; blue to violet with cyan frames | Pills (drone-only) |
| OpenAI Codex | CLI, cloud | Codey, the Codex pet | a cloud-puff head round a big navy screen with `>_` prompt eyes, sky blue, puffing round clouds; works in prompt characters | Prompt `>_` (drone-only) |
| Google | Jules, Gemini CLI, Antigravity | the Jules octopus | a tall purple dome on six curling lilac tentacles that sway with the bob | Dots |
| Devin | cloud, CLI, Devin Desktop (ex-Windsurf) | the three-hexagon logo | a near-black hexagonal head between two white hexagonal side pods (three hexagons in a row) | Three eyes |
| Kiro | Kiro CLI/IDE/cloud, Amazon Q | the Kiro ghost | a white ghost dome shaded in Kiro purple, with a scalloped hem that wobbles; trails wisps and floats high | Dots |
| OpenCode | CLI, GitHub agent | the pixel block "O" | a tall sharp white block whose square screen is a thick ring round a dark-over-grey split core | Cyclops (a ring, the "O") |
| Qodo | the review bot and its fix commits | the hoodie anteater | a purple hooded head with a long white snout and a shades-shaped visor; **reviews**: it dips its head and reads diff marks (`+ · = ✕`) row by row | Slant (shades) |
| generic | every other detected tool | — | D-final exactly, named by a label | Binocular |
| unknown agent | agent evidence with no known tool | — | D-final's saucer in a dusty plum no provider uses, no white trim, dim eyes in a narrow faceless visor, and a question-mark antenna | Visor slit |

### Colour (BLK 36 only)

Brand colours were sampled from the references and mapped to BLK 36 by OKLab distance. Every brand palette is BLK 36 only, and the glow stays [OIII] teal, so every drone shares one face language. Where a palette doesn't use the nearest entry, `brands.js` `BRAND_COLOURS` says why, and `npm test` fails if a reason is missing. The full table, with distances, is in `out/params.md`. The notable calls:
- **Claude's terracotta `#d77757`** is a poor match. Its nearest, `#ff6866` (ΔE 0.079), is a pink-red coral (hue 24° against 39°) and the coral contributor's brightest tone. The lit front takes `#ff965f` (the hue) and turned faces take `#cc5250` (the lightness), so the shell averages to a terracotta orange (measured mean hue 26°).
- **Teal slates are off limits.** The nearest BLK 36 entry to Cursor's and OpenCode's greys is `#0f4a4c`, which is ΔE 0.037 from the [OIII] event teal `#004538` and would read as an event. They use the gear greys and navies instead.
- **Codex** isn't its nearest `#909edd`, because that is the generic drone's shell (A4 measured them too alike). It uses a lighter, cyan-leaning sky ramp (`#4185d8` `#5ab9e5` `#a5e6ff`).
- **Copilot's** lit helmet is `#8c51cc`, one step darker than the nearest `#b991f2`, so it stays blue-to-violet and apart from Kiro's lilac.

### Eye glyphs (art direction §8)

Nine drones use their closest V2 design (above). Copilot and Codex each have a glyph of their own, which the human approved on 2026-11-10:
- **Pills** (Copilot): two upright rounded bars, the goggled head's eyes. The V2 fallback is Dots.
- **Prompt `>_`** (Codex): a chevron and a cursor, Codey's eyes. The V2 fallback is Happy (`^ ^`, one of Codey's own expressions).

**They are drone-only.** They live in `drone.js` (`droneEyeLit`), not in `asset-viewer/faces.js`, so the crew keeps the 10 V2 designs and drones have 12. The V2 fallback stays available as an `eyes` option (`brands.js` `v2Eyes`, face-probed by the lab), but no output renders it.

### A4: telling them apart

Measured by `node lab.mjs a4` into `out/brands-a4.json`, for every pair of the 11 drones in the front and 3/4 views (smoke off):
- **silhouette:** the IoU at the best alignment (centroids matched, then the best shift within 2 px);
- **colour:** the OKLab distance ΔE between the mean colours.

A pair scores max((1 − IoU) / 0.25, ΔE / 0.06), and must score at least 1 in both views. The run fails otherwise, and `npm test` re-checks the saved report.
- **0.25:** after the best alignment, at most 75% of the silhouettes' union is shared.
- **0.06 OKLab:** about three just-noticeable differences, and about half of BLK 36's smallest step between neighbouring ramp tones.

| Scale | Drone height | Gated | Closest pair (score: IoU, ΔE) | Smallest ΔE | Largest IoU |
|---|---|---|---|---|---|
| crew close-up | 37 px | yes | **Cursor–Devin** (1.10: 0.73, 0.036) | Cursor–Devin 0.036 | generic–unknown 0.96 |
| system distance (5.98, the viewer's system view) | 18 px | yes | **Cursor–Devin** (1.10: 0.73, 0.055) | Cursor–Devin 0.055 | generic–unknown 0.96 |
| far (the mid depth step) | 6 px | no (info) | Qodo–generic (0.84: 0.86, 0.050) | Google–Qodo 0.022 | Claude–Qodo 0.88 |

- **The closest pair is Cursor–Devin.** Both are near-black with white details, so they separate by shape: a cube with a white top against a hexagon between white pods.
- **The next closest:** at the close-up, Copilot–Qodo (1.14) and Devin–unknown (1.19); at system distance, Codex–generic (1.16) and Copilot–Qodo (1.19).
- **Generic–unknown** share D-final's silhouette (IoU 0.96), so they separate by colour alone (ΔE 0.18).
- **At 6 px** the purples (Google, Qodo, Kiro, Copilot) and generic start to merge. That scale isn't gated, and it's where the name labels carry identity.

### A5: per-session variety

`sessionLook(brand, session)` hashes `<brand>:<session>` into seeded details only:
- a trim from the brand's own list (2–3 BLK 36 ramps);
- one small shape detail per brand (Claude's leg length, Copilot's ear pads, Codex's puff size, Qodo's snout, and so on);
- personality: `puffRate`, `gaze`, `glance`, `lookYaw` and ±2 sparkles;
- a phase, so sessions bob out of step.

The silhouette, shell, screen, glow, accent and smoke never vary, so two Claude sessions look like two Claude drones (`brands-seeds.png`). `npm test` checks 40 sessions per drone: everything else is identical, the varied values stay inside their bounds, the same session always gives the same look, and the sessions really do differ.

### New geometry (all off by default, so A–E and D-final are unchanged)

| Param | Used by | What |
|---|---|---|
| `headHex` | Devin | blend the head toward a front-facing hexagonal prism, point up |
| `ears` = hex pods | Devin | front-facing hexagonal side pods |
| `crown` (`crownN`, `crownR`, `crownArc`, `crownZ`) | Codex | puffs round the top of the head, a cloud outline |
| `skirt` = stub legs / tentacles / ghost hem (`skirtN`, `skirtL`, `skirtR`, `skirtSpread`, `skirtZ`, `skirtCurl`, `skirtWave`) | Claude, Google, Kiro | legs in two pairs; a ring of curling tentacles; a scalloped hem. Tentacles and hem wobble with the bob (loop-locked) |
| `snout` (`snoutL`, `snoutR`, `snoutY`, `snoutDrop`) | Qodo | a long tapered snout out of the lower face |
| `antenna` = question hook | unknown | a stalk curled into a "?" |
| `accent` = top facet | Cursor | the top face in the accent colour |
| `screenFlat` | Claude, Cursor, Devin, OpenCode | a planar screen with straight edges on a flat face |
| `screenSplit`, `splitY` | OpenCode | the screen's lower part in its second tone |
| `glyphSet` | Claude, Codex, Qodo | the working face's glyphs: an asterisk spinner, prompt characters, or diff marks read row by row |
| `workNod` | Qodo | the head dips while working (reviewing) |
| `eyes` = Pills / Prompt `>_` | Copilot, Codex | the two drone-only eyes (approved 2026-11-10; not in `faces.js`) |

The live page (`npm run dev`) has the brand drones in its picker, and picking one switches to its palette.

