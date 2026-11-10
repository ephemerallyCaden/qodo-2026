## The brief every variant honours

- **Head-is-body.** One rounded head with a face screen, at most a tiny chin pod (E), and no arms.
- **About half an astronaut tall:** 47–48% of a K astronaut (0.95), measured without smoke; `npm test` checks the range.
- **Thruster pack.** Five different layouts, each sputtering smoke. Puffs come in bursts: more when the drone accelerates or banks, and on each bob's upstroke. They drift and fade.
- **Colour.** The base palette is BLK 36: a gear-grey shell with white trim and smoke, the crew's dark visor as the screen, and V2 eyes (`faces.js`) glowing [OIII] teal.
- **The idle loop,** all of it on a 12 s behaviour loop that divides 24 s; the turntable and stills use the 6 s idle loop:
  - a hover bob with puffs;
  - looking around and blinking;
  - a working face (the eyes go and the whole screen flashes with typed ASCII glyphs);
  - banking into the drift.

## Behaviour timeline (12 s motion loop)

| Time (s) | What happens |
|---|---|
| 0–12 | Drifts in a figure 8 (side to side once, front to back twice) and banks into it. Bobs 4 times. Puffs fire in bursts that follow the effort. |
| 1.0 | Blink |
| 1.6–4.8 | Looks to its left, then right, then back (eyes glance and the head turns with them) |
| 5.2 | Blink |
| 5.6–5.8 | The eyes blink shut |
| 5.8–6.0 | Glyphs fill the screen, cell by cell in a hashed order |
| 6.0–10.2 | Working: every cell flips to a new hashed glyph `glyphRate` times a second on its own phase (typing), with the odd blank |
| 10.2–10.45 | The glyphs clear in a scramble |
| 10.45–10.6 | The eyes blink open |
| 10.7 | Blink |
| 10.9–11.95 | A small glance, then settles |

## Intended separate parts

Smoke puffs and sparkles float free by design. Every tile is therefore rendered twice:
- with smoke and sparkles off, the body must be exactly one connected piece;
- with them on, every pixel must still be palette + space.

Each animated GIF must also show smoke in at least half its frames.

## The pick: D-final

The human picked **D · Saucer scout** with an exact parameter set. That set is laid over D verbatim, as **D-final** (`variants.js` `FINAL_PARAMS`). A–E stay in the lab as explorations.
- **Kept from D** (D sets it, the human's set doesn't): `smoke` = round puffs.
- **At the default** (neither sets it): listed under "Variants" above. Notably `glyphRate` 4 and `glyphPx` 1.4 (the new working face), `glance` 4.5, `gaze` 0, `eyeScale` 1, `antTip` 0.018, `ears` none, `topper` none, `accent` none.
- **Set but without visible effect:**
  - `earR` (0.03), because `ears` is none;
  - `accentY` / `accentW` (1 / 0.4), because `accent` is none;
  - `thrSpread` (0.9), because the single under-jet has no spread.

  Turning on ears or an accent would use them as set.
- **Size:** D-final is 39% of a K astronaut's height (the five explorations are 47–48%). It's the human's own size, so the "about half" test covers A–E only.

My earlier recommendation was A · Monitor buddy: the biggest screen and the closest to the "floating monitor buddy". It stands as context only.

## The working face

When the drone works, the eyes blink shut and disappear entirely. The whole screen then flashes with ASCII glyphs as it types:
- **The glyphs:** a 5 × 7 pixel font from the ASCII FX vocabulary (◎ ✕ ▢ + · / \ { } ; < > # = * 0 1), laid out in a grid fitted to the screen. Cells near the screen's rim are left out, so the glyphs stay whole.
- **Rendering:** glyph pixels are squares in eye-box units, evaluated per fragment like the eyes. They're resolution-independent, and only the pixel pass pixelates them.
- **Colour:** each lit glyph takes a hashed tone of the teal glow ramp (`glow[1]`–`glow[3]`) on the dark screen, with no antialiasing (the palette check would catch it).
- **Typing:** each cell flips `glyphRate` times a second on its own hashed phase, and now and then a cell goes blank, like a cursor moving on. Every choice is hashed on the cell and the flip count within the loop, so it's deterministic and loop-locked.
- **Coming back:** the glyphs clear in a hashed scramble, then the eyes blink open.
- **Checks:**
  - `npm test` checks that the eyes and the glyphs never show together, that the work window is all glyphs, and that the rest of the loop is eyes.
  - `npm run lab` probes the rendered face of every variant: eyes are painted red and glyphs green in a debug render. While working there must be glyph pixels and no eye pixels; at rest, eye pixels and no glyph pixels.

`out/working-face.png` steps through it frame by frame.

## The reference (Snowball), and what we didn't copy

From the reference we took:
- the vibe: chunky rounded forms, a dark face screen with glowing eyes, and cute puffs with sparkles;
- that the thrusters are part of the character.

We deliberately didn't recreate it:
- no variant combines a dome, a dark visor band, side fins and twin under-pods;
- the shell is BLK 36 greys and whites, not ice blue;
- the eyes are our own V2 set, not pill eyes;
- the sparkles are pixel `+` crosses, not snowflakes.

## Shell colour: staying off the suit ramp

A white-blue shell melts into the K suits at 180p: the phase-1 `frost` slot test showed it, and so did the first pass at this brief, which lit the shell in the suit's own `#c1d9f2` / `#ffffff`. So the colours swap roles:
- **The shell takes the crew's gear-grey ramp** (`#293268` `#464b8c` `#6b74b2` `#909edd`, the astronauts' mitts, boots and visor rims). The drones read as made of the same stuff as the crew's kit, not as small astronauts.
- **The whites go to the trim:** a white bezel framing the dark screen, white nozzles, rim, ear pods and antenna stalks, and white smoke. Against the grey shell the white bezel is the drone's brightest edge and frames the face, which is where its identity lives.

`npm test` fails if the base shell ever uses a suit colour. In the crew shot the drones now separate by value as well as by size (half height), silhouette (no limbs), the dark face, teal eyes and smoke.

## Phase 2: a brand is a parameter set plus a palette

1. **Silhouette:** `headW/H/D`, `headRound`, `headCorner`, `headTaper`, `headFlat`, `size`, plus `rim` and `chin`.
2. **Logo features:** `ears` (pods or fins), `topper` (goggles or a crest), `antenna`.
3. **Face:** screen size, height and corner shape (`screenW/H/Y`, `screenRound`, `bezel`) place the logo's face area. `eyes` picks the V2 glyph.
4. **Personality:** thruster layout, smoke style, `puffRate`, `sparkles`, bob, drift, bank, glance and gaze.
5. **Colour:** one `palette.js` entry with six slots: shell, trim, screen, glow, accent, smoke.

## Worked example: GitHub Copilot (description only)

*Superseded twice. First by the phase 2 Copilot brand drone (a helmet with goggles, ear pads and a face plate). Then, later on 2026-11-10, by the human's "use the generics shape but just add cute goggles on": Copilot is now D-final's exact shape with flat connected goggles across the top of its screen (see "Brand drones" below). It keeps the goggles with GitHub's permission (human, 2026-11-10). The pills are its eye: a drone-only glyph the human approved (2026-11-10), kept out of `faces.js`, with the V2 Dots as a fallback option.*

**The logo** (`github-copilot-logo.svg`): a wide, rounded helmet head that widens toward the cheeks; two big rounded-rectangle goggle lenses across the top half, almost touching at the bridge; round ear pads low on each side; a wide lower face plate with two upright pill eyes.

**The mapping,** from the base (the values are absolute, so they apply from D-final or any variant):
- **Head:** soften the cube into the helmet: `headW 0.2`, `headH 0.15`, `headD 0.16`, `headRound 0.55`, `headCorner 0.85`, `headTaper 1.12` (wider at the cheeks), `headFlat 0.15` (a flatter chin).
- **Goggles:** `topper goggles`, `gogW 0.075`, `gogH 0.05`, `gogX 0.4` (the lenses nearly meet at the bridge), `gogY 0.45`. The frames take the trim slot (the logo's black outline); the lenses take the screen tones and a glint.
- **Ear pads:** `ears pods`, `earR 0.06`, `earT 0.025`, `earY -0.35` (low, like the logo's).
- **Face plate:** the screen becomes the lower plate: `screenW 0.66`, `screenH 0.4`, `screenY -0.42`, `screenRound 3.5`, `bezel 0.12`.
- **Eyes:** the V2 set has no upright pills. Copilot needs one new glyph ("pills"). Add it to the shared V2 set in `asset-viewer/faces.js`, so astronauts could use it too, rather than as a drone-only shape. That's a small, separate change for the human to approve.
- **Thrusters and smoke:** twin under-pods (the logo has no thrusters, so keep it simple) and round puffs.
- **Palette:** the logo is mono (`#24292f` on white), which suits the grey shell and white trim. The trim takes a charcoal (goggle frames and ear pads), and the accent and smoke tint take Copilot's brand colours (to be confirmed from the brand kit). The glow stays teal or takes the brand colour.
- **Open choice:** the logo's face plate is light with dark eyes, the inverse of our dark screen with glowing eyes. I'd keep the dark screen so every agent's drone shares one face language.

**Microsoft Copilot** (`microsoft-copilot-logo.svg`, two interlocking rounded parallelograms, no face) suggests a slanted rounded-box head (a skew parameter still to add) with the face carried by the screen alone.
