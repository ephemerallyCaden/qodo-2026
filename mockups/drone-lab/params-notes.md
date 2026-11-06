## Intended separate parts

Every direction is one connected silhouette, except the anti-grav option: each of its `halos` (0–2) is a free-floating glow ring under the lens, kept at least 2 px clear of the lens and of each other. `npm run lab` checks each tile for exactly `1 + halos` pieces (anti-grav) or 1 piece (everything else); in the crew shot, 2 more for the astronauts.

## Recommendation: F · Beanie copter

- **Cutest, and the most character per pixel.** A wide headphone head with a screen face, a beanie rotor, a tiny body and nub arms reads as a toy robot buddy, not a vehicle.
- **Clearly not crew.** Next to two K astronauts it's about 55% of their height, with no legs, a warm shell (against their white suits) and a propeller on top. It still shares their gear greys, visor tones and screen-face language, so it belongs in the same cast.
- **Exercises every module a brand needs.** The head is the face module (shape, ears, topper, screen, eyes); the body carries the brand band; the propulsion and extras are free per brand. Its face screen is big and unobstructed, so brand eye glyphs read at 180p.
- **Stable at 180p.** One silhouette from every angle, the rotor reads as a propeller even edge-on, and the pill eyes stay 2+ px wide.

Why the base shell is warm: in the live page's crew view, the `frost` slot test (a white-blue shell) makes any direction blend into the white-suited crew at 180p. Brand palettes should keep the shell clearly off the crew's suit ramp.

Runner-up: **A · Bubble buddy**. It's the most neutral base and its anti-grav halos are the clearest "hovering" read, but the halos add a lot of teal under every drone, and it has no body to carry a brand band.

## Phase 2: a brand is a parameter set plus a palette

1. **Silhouette:** `headW/H/D`, `headRound`, `headCorner`, `headTaper` and `headFlat` cover capsule, dome, box and pebble heads and everything between them, continuously.
2. **Logo features:** `ears` (pods, fins) and `topper` (goggles, crest) give the head the logo's protrusions.
3. **Face:** the screen's size, height and corner shape (`screenW/H/Y`, `screenRound`, `bezel`) place the logo's face area; `eyes` picks the glyph. The three drone-only glyphs (pills, blocks, prompt `>_`) live in `drone.js` (`droneEyeLit`), so a brand that needs a new glyph adds one there without touching the astronaut's V2 set.
4. **Colour:** one `palette.js` entry with five slots: shell, trim, screen, glow, accent.
5. **Personality (optional):** propulsion, antenna, arms and accent placement.

## Worked example: GitHub Copilot (description only)

**The logo** (`github-copilot-logo.svg`): a wide, rounded helmet head that widens toward the cheeks; two big rounded-rectangle goggle lenses across the top half, almost touching at the bridge; round ear pads low on each side; a wide lower face plate with two upright pill eyes.

**The mapping,** starting from F:
- **Head:** `headW 0.23`, `headH 0.165`, `headRound 0.55`, `headCorner 0.85`, `headTaper 1.12` (wider at the cheeks, as in the logo), `headFlat 0.15` (a flatter chin).
- **Goggles:** `topper goggles`, `gogW 0.085`, `gogH 0.06`, `gogX 0.4` (the lenses nearly meet at the bridge), `gogY 0.42`. The frames take the trim slot (the logo's black outline); the lenses take the screen tones and a glint.
- **Ear pads:** `ears pods`, `earR 0.07`, `earT 0.03`, `earY -0.35` (low, like the logo's).
- **Face plate:** the screen becomes the lower plate: `screenW 0.66`, `screenH 0.4`, `screenY -0.42`, `screenRound 3.5`, `bezel 0.12`, `eyes pills`, `eyeScale 1.1`.
- **Body and hover:** keep F's small body (it carries the brand band) and the beanie rotor (a goggled pilot in a propeller cap). For a pure logo-head, use `body off` and anti-grav with one halo.
- **Palette:** the logo is mono (`#24292f` on white). A charcoal shell would vanish against space at 180p, so the shell takes a light grey-white ramp. The trim takes the charcoal (goggle frames and ear pads, the logo's black parts), and the accent and glow take Copilot's brand colours (to be confirmed from the brand kit).
- **One open choice:** the logo's face plate is light with dark eyes, the inverse of our dark screen with glowing eyes. I'd keep the dark screen with glowing pills, so every agent's drone shares one face language. If the human prefers the literal look, add a per-brand `screenInvert` (screen from the shell's light tones, eyes from the trim's dark ones).

A quick render of this parameter set on the base palette already reads as the logo: goggles over a pill-eyed face plate between low ear pads.

**Microsoft Copilot** (`microsoft-copilot-logo.svg`, two interlocking rounded parallelograms, no face) is the harder case. It suggests a slanted box head (`headRound 0`, a skew parameter still to add) or two-tone shell halves, with the face carried by the screen alone.
