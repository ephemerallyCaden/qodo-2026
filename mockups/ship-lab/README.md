# Ship lab

> **Exploration, 2026-11-25: four cartoon-rocket directions (A–D) for the crew's spaceship, waiting for the human's pick.** The ship carries an astronaut for each teammate from local git history, near your star and next to your own drones (#207, `docs/features/crew-spaceship.md` on `session/week1`, C2 and C3). The human asked for "3-4 variants based on the description of a cartoonish rocket". This is a throwaway mockup, not product code. The product renderer (C4) comes after the pick.

The crew aboard are the asset viewer's own astronauts (`makeAstronaut`, in library mode, BLK 36 exactly, with its loop-locked bob, sway and blink). The drones in the system shots are the drone lab's (`makeDrone`, brand looks). Both are imported read-only. The ship is one raymarched SDF hull (`ship.js`), lit like the crew: one key light, four quantised bands, self-shadowing and contact occlusion.

## Run

```sh
npm ci        # or: cp -cR from a sibling lab with the same lockfile (three 0.187.0, playwright 1.64.1)
npm test      # pure checks + browser checks (headless Chromium + SwiftShader, no socket, no network), about 1 min
npm run lab   # regenerates out/ (about 2 min; needs ffmpeg) and copies it to the evidence folder when that exists
npm run dev   # live page at http://127.0.0.1:5195/ship-lab/ (loopback only; PORT=... to change)
```

`node lab.mjs contact crew teal gifs distinct` renders only the named outputs. Add `evidence` to copy `out/` to `<main-checkout>/.archive/docs/hackathon/evidence/ship-lab/`. No names renders everything and copies.

## The directions

| | Direction | Silhouette | Crew seen as | Colours (BLK 36) |
|---|---|---|---|---|
| A | **Finned classic** | tall bullet, ogive nose, three swept fins, bell nozzle | a helmet behind a porthole of their own, two staggered columns | white body, red nose, fins and bands |
| B | **Chubby capsule** | fat gumdrop on three stubby legs, bumper ring, antenna with a blinking ball | upper bodies behind one wraparound "bus windscreen", a front row of 4 and a raised back row of 4 | orange body, white trim |
| C | **Bubble top** | short finned rocket under a big glass dome | full figures standing inside the dome, a front row on the floor and a back row on a bench | mauve body, white fins and collar, dark glass like the crew's visors |
| D | **Ringed retro** | onion body, needle nose with a ball, three thin legs, a wide flat ring like a planet's | full figures standing on the open ring, spread round the front, with chasing marquee lights on the rim | navy body, white nose, orange ring |

Shared by all four:
- **Metal:** the crew's gear greys (`#293268` → `#909edd`) for nozzles, legs and window frames.
- **Glass:** the crew's visor near-blacks (`#12173d`, `#29174c`).
- **Flame:** unlit red → orange → yellow → white.

So every ship reads as the crew's kit.

## Crew count and overflow

Each direction is a builder (`ship-spec.js` `BUILDERS`): a crew count in, a ship spec out (hull parts, paint bands, windows, domes, lights, flames, seats).

**The proposed overflow rule:**
- **1–8:** the crew rides on one deck.
- **9–16:** the crew rides on two. The ship grows a second deck:
  - A stretches by eight more portholes;
  - B gets a taller body with a second window band;
  - C stacks a second dome;
  - D adds a second, smaller ring higher up, so the lower deck stays in view from above.
- **Past 16:** the 16 most recently active ride, and a `+N` label counts the rest. The label is in the bitmap font, outside the pixel pass; the crew sheet stands in for it with a badge.

The cap keeps the draw cost at one hull plus 16 astronauts.

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
| `checks.mjs` | The tile and seam checks. |

**Windows and glass are see-through.** Where a window or dome shows, the hull writes the depth of the far wall inside it. So an astronaut seated inside wins the depth test there and loses it everywhere else. That needs no sorting and no transparency.

**The dome's shine is fixed in view space:** an arc and a dash on the upper left, plus a lit-limb sliver. It's like a cartoon glass highlight, never a full outline. The dome's far wall is two-toned by the front's reflection, like the crew's visors.
