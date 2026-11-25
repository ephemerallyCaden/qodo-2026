# Ship lab

> **Exploration, 2026-11-25: four cartoon-rocket directions (A–D) for the crew's spaceship, waiting for the human's pick.** The ship carries an astronaut for each teammate from local git history, near your star and next to your own drones (#207, `docs/features/crew-spaceship.md` on `session/week1`, C2 and C3). The human asked for "3-4 variants based on the description of a cartoonish rocket". This is a throwaway mockup, not product code. The product renderer (C4) comes after the pick.

**The repo owner rides as the captain** (human, 2026-11-25): seat 0 of every ship, in a gold captain's cap and a seat of their own. Crew order is by person id, never by activity.

The crew aboard are the asset viewer's own astronauts (`makeAstronaut`, in library mode, BLK 36 exactly, with its loop-locked bob, sway and blink). The drones in the system shots are the drone lab's (`makeDrone`, brand looks). Both are imported read-only. The ship is one raymarched SDF hull (`ship.js`), lit like the crew: one key light, four quantised bands, self-shadowing and contact occlusion.

## Run

```sh
npm ci        # or: cp -cR from a sibling lab with the same lockfile (three 0.187.0, playwright 1.64.1)
npm test      # pure checks + browser checks (headless Chromium + SwiftShader, no socket, no network), about 1-2 min
npm run lab   # regenerates out/ (about 2 min; needs ffmpeg) and copies it to the evidence folder when that exists
npm run dev   # live page at http://127.0.0.1:5195/ship-lab/ (loopback only; PORT=... to change)
```

`node lab.mjs contact crew captain teal gifs distinct` renders only the named outputs; add `round=2` for the round-2 variations (into `out/round2/`, copied to `.../evidence/ship-lab/round2/`). Add `evidence` to copy `out/` to `<main-checkout>/.archive/docs/hackathon/evidence/ship-lab/`. No names renders everything and copies.

## The directions

| | Direction | Silhouette | Crew seen as | Colours (BLK 36) |
|---|---|---|---|---|
| A | **Finned classic** | tall bullet, ogive nose, three swept fins, bell nozzle | a helmet behind a porthole of their own, two staggered columns | white body, red nose, fins and bands |
| B | **Chubby capsule** | fat gumdrop on three stubby legs, bumper ring, antenna with a blinking ball | upper bodies behind one wraparound "bus windscreen", in raised rows | orange body, white trim |
| C | **Bubble top** | short finned rocket under a big glass dome | full figures standing inside the dome, a row on the floor and a back row on a riser | mauve body, white fins and collar, dark glass like the crew's visors |
| D | **Ringed retro** | onion body, needle nose with a ball, three thin legs, a wide flat ring like a planet's | full figures standing on the open ring, spread round the front, with chasing marquee lights on the rim | navy body, white nose, orange ring |

| | Captain's seat |
|---|---|
| A | the big gold-framed porthole under the nose, above every teammate's |
| B | alone at the front of the window, middle; the rows of four and three are raised behind |
| C | front and centre on a gold pedestal; four stand behind, three on a riser at the back |
| D | at the front of the ring on a white podium; the teammates alternate either side |

**The captain's cap** (`ship-spec.js` `CAP`, the same in every ship) is a flared gold crown (`#872a38` → `#ffe091`) over a navy hat band, with a navy peak over the visor. It's sized up from life so it reads at 320×180: 25–96 px at the close-up, and still 6–17 px at system distance. It's its own small SDF, attached inside the captain's body group, so it bobs and sways with the figure. The viewer's astronaut is unchanged.

Shared by all four:
- **Metal:** the crew's gear greys (`#293268` → `#909edd`) for nozzles, legs and window frames.
- **Glass:** the crew's visor near-blacks (`#12173d`, `#29174c`).
- **Flame:** unlit red → orange → yellow → white.

So every ship reads as the crew's kit.

## Round 2: shorter, fatter, rounder (R2-1..R2-5)

The human, 2026-11-25: "I imagined one like the finned classic but shorter, fatter and rounder, and the window has a chunkier rim and is a bit chunkier in general". All five round-2 variations are A made over (`ship-r2.js`, `node lab.mjs round=2` into `out/round2/`). They keep A's colours (white body, red nose and fins) and the captain rule (the cap plus a seat of their own).

**What they share:**
- **Body:** round and fat (radius 1.12–1.28 against A's 0.8), a short capsule of two spheres.
- **Chunky parts:** fins 0.34 thick, a fat bell nozzle tucked into the round bottom, and a short bullet nose with a round tip.
- **Windows:** exact circles on the body, each with a raised torus rim that is lit like the hull. The rims are the crew's gear greys; the captain's is gold.
- **Rim placement:** each rim sits just outside its opening, so a chunky rim doesn't shrink the window.
- **Window insides:** a lighter BLK 36 indigo (`#36277f`), so the crew's dark visors read in them. Round 1 keeps the visor near-black there.
- **Fit:** all five fit the near frame (5.98) without pulling back with up to 8 aboard. A pulled back to 8.7.

| | Variation | Crew seen as | Captain |
|---|---|---|---|
| R2-1 | **A porthole each** | a round porthole each, in honeycomb rows (2, 3, 2) | the big gold-rimmed porthole at the top |
| R2-2 | **One big window** | upper bodies together behind one big round window | front and centre, low in the window |
| R2-3 | **Glass nose** | full figures in a clear nose dome on a chunky red collar | front and centre on a gold pedestal |
| R2-4 | **Round lander** | the honeycomb in a red belly band, on four splayed fins with ball feet, dome nose and antenna | the big gold-rimmed porthole above the band |
| R2-5 | **Bridge window** | the captain and two teammates in a big gold-rimmed bridge window, the rest in small portholes beneath | front and centre in the bridge |

**Rules round 2 adds, each found by the checks:**
- **No side portholes:** no porthole turns more than 0.62 rad (36°) from the front. Past that, from the front, a helmet behind its window hides in the hull's depth.
- **No low rows:** the lowest row sits just above the lower sphere's equator. A standing astronaut behind a lower window would hang out of the round bottom. A pure test checks that every boot stays inside the hull.
- **Second deck:** it stretches the capsule with three more honeycomb rows. R2-2 becomes a double bubble with a second big window.

**Distinctness:** pairs are reported, not gated, because round 2's are variations of one brief. R2-1 and R2-5 share a silhouette on purpose; their closest score is 0.22–0.28.

## The pick: R2-4c-final

The human picked R2-4c with R2-4's red belly band back (2026-11-25). R2-4c-final (`node lab.mjs round=final` into `out/final/`) is R2-4c's hull, portholes and seats exactly, plus R2-4's band: red paint on the body from cy − 0.3 to top + 0.12. Its numbers are `R24C` in `ship-r2.js`, built by `buildR24c(n, { band: true })`.

## The fly-by (Day 18 hype shot), v2: nose first

`node flyby.mjs` (or `npm run flyby`) renders R2-4c-final with six aboard (the captain and five teammates) flying past a still camera near the star. Two of your drones drift in the middle distance. It takes about a minute and writes `out/flyby/`:
- `frames/` at 320×180;
- `ship-flyby.gif`: ×3 nearest-neighbour, 960×540, 120 frames at 20 fps, the frames' exact colours;
- `still.png`;
- `report.json`.

The human, on v1: "can we have the rocket fly so that the tip of the rocket is actually pointed in the direction its moving, and also can we animate the fire a bit more dynamically". v1 (upright, leaning into its travel) is at d6b1cfb.

**Nose first.** The ship flies on its side. It's rolled in the camera's view plane so its nose points along its travel on screen: left to right, the nose right, the flame trailing left. Its front (the portholes) faces the camera, and it banks up to 0.06 rad about its own axis. The path is `flyby.js`, a pure function of the frame number at the lab's stepped clock. It's laid out on screen: the ship's middle runs on a gentle climbing arc, level as it enters and about 10° up as it leaves. Its distance from the camera swoops from 10.5 to 4.7 and back.
- **Hold:** 10 frames of empty stars.
- **Entry:** fast from the left, nose first (on screen from frame 15).
- **Glide:** slow across the middle, the close pass at 4.7 units.
- **Exit:** fast to the right; the last puff leaves by the edge on frame 109, then 10 frames of empty stars.

**Upright crew** (`ship.js` `setUpright(up, { sink })`, the fly-by only):
- **The turn:** each rider turns about its own window's line of sight by the angle that undoes the hull's roll (80–92°). Its head points to the screen's up, and its helmet stays where it was in the opening.
- **The captain:** turns about the point it was dropped from for the cap (the seat's `pivot`, `ship-r2.js`), so the cap stays above the helmet in its porthole.
- **The sink:** on its side, a rider's body runs round the hull's curve instead of down its length. Each one sinks straight back from the ship's front (the way the camera looks) to keep its boots inside the hull: 0.32 for the captain (round the upper dome), 0.14 for the teammates. Seen from the front, each face stays where it was in its window, only deeper.

The see-through windows need nothing new: the hull writes the far wall's depth wherever a window shows, in its own frame, rolled or not.

**The lively flame** (`ship-spec.js` `flameLive`, `LIVE`; `makeShip(..., { live: true })`, the fly-by's own ship). Every layer is whole cycles per 12 s and hashes the step, never `Math.random`:
- **Length:** steps every frame (20 a second, 240 per cycle). It surges 2.5 times a second and flickers per step, with a kick on about one step in six.
- **Tip:** jitters across and in depth each step.
- **Heat:** the bands shift each step, alternating a white core and a yellow one, and jump per sixth of the length, so the band edges lick.
- **Puffs:** six slots, one born every 0.1 s inside the flame. Each drifts 2.3 back and fades white → yellow → orange → red, then goes; about one in three is a quick, small spark.

All four colours are the flame ramp (`#d83843` `#ff965f` `#ffe091` `#ffffff`). Without `live` the shader source is the idle flame's, unchanged, so every other shot keeps its pixels.

**Checks** (`flyby.mjs`, exit 1 on any):
- **Colours:** every colour is BLK 36 or the viewer's world palette. The only teal is the drones' eyes, checked against a render without them.
- **On screen:** the ship enters from off screen and leaves by the edge.
- **Nose first:** in every frame, the hull's axis on screen is within 6° of its travel, nose leading.
- **Upright:** every rider is within 6° of upright on screen, and the cap is above the captain's helmet, within 25°.
- **Still (frame 59):** every astronaut and the cap clear the close-up minimums. The ship and crew are one piece with the flame and its puffs left out. The close pass crops the fins on purpose.
- **In their windows:** no rider's or the cap's px fall outside the window openings (nobody pokes through the hull). This is checked at frames 34, 59 and 85, from the shot's camera and four others round the ship, at ×2.
- **Whole-ship frame (85):** it shows the flame, unclipped.
- **The flame:** with the ship held still, every frame's flame differs from the one before by at least a quarter of its px, and by at least 5× v1's idle flame (median).
- **Determinism:** a re-render is pixel-identical.

## Round 2b: R2-4's windows alike and in a line (R2-4b, R2-4c)

The human picked R2-4, then: "I just don't like R2-4 the fact the windows are different colours, they should all be the same colour and also stack them vertically in a line instead of being stacked randomly." (`node lab.mjs round=2b` into `out/round2b/`.)

**What both new variations change:** every porthole is alike, one size (radius 0.24) and one grey rim, the captain's too, and there's no belly band. The captain reads by the cap and by sitting in the top porthole. The portholes had to grow from 0.2 to 0.24: in a 0.2 porthole the captain's cap and visor don't both fit, and the cap check measured 0 px.

| | Variation | What it is | Two decks (9–16) |
|---|---|---|---|
| R2-4b | **One column** (as asked) | every porthole in a single vertical line down the front, the captain at the top. Eight in a line stretch the lander into a tall capsule: 4.85 units against R2-4's 2.93, so the near framing pulls back. | a second column beside the first, on the same rows, so the ship gets no taller. One column of 16 would be about 7.7 units tall. |
| R2-4c | **Straight columns** (an alternative reading) | three straight vertical columns under the captain, keeping R2-4's round, fat proportions (3.19 units) | three more rows of three |



Each direction is a builder (`ship-spec.js` `BUILDERS`): a crew count in, a ship spec out (hull parts, paint bands, windows, domes, lights, flames, seats).

**The proposed overflow rule:** 8 seats per deck, the captain's included.
- **1–8:** the crew rides on one deck.
- **9–16:** the crew rides on two. The ship grows a second deck:
  - A stretches by eight more portholes;
  - B gets a taller body with a second window band;
  - C stacks a second dome;
  - D adds a second, smaller ring higher up, so the lower deck stays in view from above.
- **Past 16:** the captain and the first 15 teammates by person id ride (never by activity), and a `+N` label counts the rest. The label is in the bitmap font, outside the pixel pass; the crew sheet stands in for it with a badge.

The limit keeps the draw cost at one hull, 16 astronauts and the cap.

## Scale

Ship and crew are drawn at `SHIP_SCALE` 0.6 of the viewer's crew figure, so an astronaut aboard is 0.57 units: still bigger than a drone, which is about half the viewer's astronaut. That keeps an eight-seat ship from dwarfing the star (radius 1.6 by default). The product can scale ship and crew as one unit. `out/report.md` gives every hull height.

## Framings (internal 320×180)

| Name | What | Why |
|---|---|---|
| close-up | the whole ship at 72% of the frame height | the hero framing |
| crew close-up | the viewer's crew close-up density: 2.7 units from the crew, centred on their helmets | the crew as the viewer shows them |
| near | 5.98, the drone lab's system distance (drones are 19 px there), or farther if the ship would leave the frame (A pulls back) | compares with the drone A4 numbers |
| system | 18.8, beside the star with three drones, looking down 28° like the product's start pose (drones are 6 px) | the ship as you'd see it in the system view |

Views: front, and 3/4 (the ship turned 34°). The GIFs use a gentler turn (17°).

## Motion (art direction §7)

Every idle layer completes a whole number of cycles in the crew's 12 s cycle. That cycle is the viewer's `cycle()`, its 24 s loop over 2 surface turns, so the layers also loop on the viewer's 24 s and the product's 48 s.
- **Ship:** bob 2 per cycle, sway 1.
- **Flame:** a breath 3 times per cycle, plus a hashed flicker that steps 48 times per cycle.
- **Lights:** D's ring lights chase in 48 steps; B's beacon blinks 6 times.
- **Crew:** bob, sway and blink are the viewer's own.

Nothing reads a clock or `Math.random`. Flicker and blinks hash the step within the cycle, so the frame one cycle later is pixel-identical to frame 0 (checked).

## Outputs (`out/`)

| File | Shows |
|---|---|
| `ship-lab-contact.png` | A–D, a crew of 3: close-up front and 3/4, crew close-up, near (with drones and the star behind), system (beside the star with drones), ×2 |
| `ship-lab-captain.png` | The captain in A–D: a captain close-up, then 8 aboard at the close-up, near and system distances |
| `ship-lab-crew.png` | A–D with 1, 3, 8, 12 (two decks) and 20 (two decks + "+4") aboard, close-up front, ×2 |
| `ship-lab-teal.png` | The option only: thrust in [OIII] teal, for if the burn ever marks an event. No direction needs teal at rest, so it's not a default |
| `ship-<id>-loop.gif` | One 12 s cycle at the close-up, a crew of 3, 15 fps, ×2, no dither |
| `report.md`, `report.json` | Sizes in px per framing, colours per slot, crew-count tiles, seams, distinctness, checks |

## Checks

`npm run lab` fails if any of these fails, and `npm test` re-runs them on a sample.

**Every tile:**
- **Colours:** only the ship's BLK 36 palette and the crew's BLK 36 roles; no teal outside the option tiles.
- **One piece:** the hull is one connected piece, and the crew is connected to it (aboard).
- **Complete:** there's a flame, the tile isn't empty, and the ship isn't clipped (the crew close-up crops on purpose).
- **Crew count:** the number of astronauts drawn is right.

**Crew visibility:** each astronaut's own pixels come from a render without it. In the front view they must clear these minimums:

| Framing | Minimum |
|---|---|
| close-up | 20 px with a 3×3 block |
| crew close-up | 200 px with a 6×6 block |
| near | 12 px with a 2×2 block |

- Two-deck ships are taller, so their crew is gated at the near distance only.
- Turned views and the system distance are reported, not gated. A window side turned away hides its crew, as it should.

**The captain's cap:** what it adds (from a render without it) must clear 6 px with a 2×2 block at the close-up, 40 px with 4×4 in the captain close-up, and 8 px with 2×2 at the near distance. Seat 0 is the only captain, and in every ship it's the prime seat (pure test).

**Other checks:**
- **Thin parts:** every part, window frame and light is at least 2 px across at the near distance (pure test).
- **Distinctness:** every pair of directions scores ≥ 1 at the close-up, near and system distances, in both views. The score is the drone lab's A4: max((1 − IoU) / 0.25, ΔE / 0.06).
- **Loops:** each GIF's frame one cycle later is pixel-identical to frame 0, and its last → first step is no outlier (≤ 1.5× the largest step inside).
- **Server:** it serves only `routes.mjs`'s allowlist (this lab's page and top-level `*.js`, the viewer's and the drone lab's top-level `*.js`, and `explorations/astronaut-lab/crew.js`, which the drone lab's palette reads). Everything else is 403, and the page makes no other request.

## How it's built

| File | What it does |
|---|---|
| `ship-spec.js` | The builders, seats, the crew plan, and the idle motion as functions of time. Pure. |
| `ship-glsl.js` | Compiles a spec to GLSL: the parts as constants, smooth unions, and the paint regions (slot, see-through window, frame, nav light). Pure. |
| `ship.js` | The material and the ship object. |
| `palette.js` | The ship's ramps. |
| `variants.js` | The four directions. |
| `lab.js` | The page: tile renders, stats, sheets, loops. |
| `lab.mjs` | The runner. |
| `flyby.js`, `flyby.mjs` | The fly-by's path (pure: nose first, on its side) and its runner. |
| `checks.mjs` | The tile and seam checks. |

**Windows and glass are see-through.** Where a window or dome shows, the hull writes the depth of the far wall inside it. So an astronaut seated inside wins the depth test there and loses it everywhere else. That needs no sorting and no transparency.

**The dome's shine is fixed in view space:** an arc and a dash on the upper left, plus a lit-limb sliver. It's like a cartoon glass highlight, never a full outline. The dome's far wall is two-toned by the front's reflection, like the crew's visors.
