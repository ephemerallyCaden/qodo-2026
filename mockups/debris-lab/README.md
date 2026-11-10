# Debris lab

> **Exploration, 2026-11-09/10: five space-debris directions (A–E). The human picked A and asked for it in grey and red with real satellite parts (A2), then for neutral grey with red only as an outline and blinking lights (A3). A3 is waiting for their approval.** Debris is stale work (R13): stale PRs, abandoned branches, merged-but-not-deleted branches and orphaned agent branches, drifting near the planets they touch. The feature doc is `docs/features/space-debris.md` on `docs/art-meaning` (requirements D1–D8). The picked direction gets ported into the asset viewer and the asset library later, as its own task.

There's one debris factory (`debris.js`), and it's a modifier any viewer planet can carry. A direction is just a parameter set (`variants.js`): a **kit** (what a piece is), an **arrangement** (where the pieces sit and how they move) and a **cap** (how many are drawn before the rest is counted). A, B and E differ only in arrangement; A, C and D differ only in kit. So any mix, such as "C's blocks in E's wake", is a one-line edit.

The lab imports the asset viewer read-only, in library mode, the way the asset library does: its planets, moons, clouds, sky, stars, crew, renderer, camera, loop and depth fade are the viewer's own. It's a throwaway mockup, not product code.

## Run

```sh
npm install
npm test      # pure checks + browser checks (headless Chromium + SwiftShader, no socket, no network)
npm run lab   # regenerates everything in out/ (about 35 min; needs ffmpeg); node lab.mjs <names> for some
npm run dev   # live page at http://127.0.0.1:5193/debris-lab/ (loopback only; PORT=... to change)
```

`node lab.mjs lineup clutter closeups loops sweep hulls crew a-vs-a2 measures` names the outputs (no names = all). `measures` re-renders the lineups and close-ups it reads; `node lab.mjs report` rewrites `measures.md` from `measures.json` without rendering.

## The directions (A–E, A2 and A3)

| | Direction | Kit (class cue) | Arrangement | Cap |
|---|---|---|---|---|
| A | **derelicts** | hardware: one spacecraft silhouette per class | each piece on its own crooked orbit, about a third retrograde, tumbling | 12 |
| B | **junkyard** | hardware | two churning heaps beside the planet (leading and trailing side) | 20 |
| C | **scrap blocks** | blocks: the block pattern is the class, the block count is the diff | own orbits, as A | 12 |
| D | **tagged canisters** | canisters: one shape, the class is a painted colour band | near-polar orbits, all one way | 12 |
| E | **wake** | hardware | a comet-like tail off one side, youngest item nearest the planet | 10 |
| A2 | **satellites** (A refined) | satellite: grey metal, red paint, solar panels | own orbits, as A | 12 |
| A3 | **outlined satellites** (A2 refined) | outlined: neutral grey, a red 1 px outline, blinking red nav lights | own orbits, as A | 12 |

- **A · derelicts.** Dead spacecraft, each on its own loose orbit and tumbling: a satellite (stale PR), a girder (abandoned branch), a spent stage (merged, not deleted) and a cargo crate (orphaned agent branch). It reads as "a planet with junk around it" from any camera angle.
- **B · junkyard.** A's hardware, parked in two slow heaps beside the disc, never in front of it. The heap size is the count. It's tidy, but pieces in a heap overlap, so classes are harder to tell apart.
- **C · scrap blocks.** Chunky cube scrap in A's orbits. Size is literally the number of blocks (2–10 by diff), the class is how they're arranged (a plus, a forked rod, a slab, a crate), and broken means the blocks come loose in chunks. It's the crunchiest and most "pixel" look, but small diffs (2–4 blocks) all look alike.
- **D · tagged canisters.** Every piece is the same canister; its class is a painted BLK 36 band (yellow PR, orange branch, lilac merged, pink agent). Polar orbits stand across any ring plane. The class reads instantly as long as the band faces the light, and the band stretches D8 (debris is meant to be metal and rust).
- **E · wake.** A's hardware trailing off one side like a comet's tail, ordered by age, so a tidy repo has a short tail and old junk sits at the end. The disc stays clear, but the tail's direction is fixed in the world, so it's tuned for the default camera.

## The pick: A, refined as A2, then A3

### A3: neutral grey, a red outline and nav lights (current)

The human, on A2: "Make it more grey and less blue, it's ok to not use the palette exactly. Then, let's leave the red as an outline effect instead of part of the device, but you can do things like flashing lights on the debris that are red." They kept the bright red `#d83843`. A3 is that (`a2-vs-a3.png`):

- **Metal:** a neutral grey ramp, very slightly warm in the light (`#3d3d3d #616161 #8e8c8a #b4b2b0`). It's off BLK 36, a human-approved exception for debris only. Each step was picked for distance from every planet colour; the nearest are the lava-ash and barren-moon greys, at 0.046–0.053. Solar cells and scorch are the darkest step, so the panels are grey-led.
- **The red outline** (`#d83843`) is an inverted hull: each fragment is drawn again, back faces only, pushed out along its smoothed normals by 1.2 px at each vertex's own depth.
  - It's ordinary geometry in the z-buffer, so it sorts against the planet, clouds and moons with no post pass, and fades with depth per pixel.
  - It covers 84–98% of each silhouette's edge, with at most 1 px anywhere 2 px thick (`test/render.test.mjs`).
  - It's a debris-only exception to the no-outlines rule (art direction §3). Nothing else in the viewer gets it.
  - A3's parts are A2's shapes rebuilt for it: no paint segments, joints overlapping or inside a collar, the satellite's bus taller than its wings, and the solar array's gap wide enough to stay open around the outline. Earlier tries outlined every internal seam, or filled the array's notch.
- **Nav lights:** 2 px `#ff6866` points, two per piece at its tips. Each blinks 8 times per 24 s loop and is lit for 22% of each blink. Every light's phase is seeded, so they never flash together. They're loop-locked and deterministic, and close-ups hold them steady.
- **Age, without paint:**
  - **Intact:** a bright `#d83843` outline and both lights blinking.
  - **Weathered:** the outline dims to `#872a38`, one light is dead, and 30% of the metal is scorched.
  - **Broken:** fragments, both lights dead, a dim outline on the biggest fragment only, and 50% scorch.

**A3 measured** (`measures.md`; A2 for comparison):

| | A3 | A2 |
|---|---|---|
| Class from the silhouette alone, tumbling (chance 25%) | 73.6% | 80.6% |
| … with colour | 74.3% | 77.1% |
| Age steps (close-ups): bright outline share | 39.3% → 0% → 0% | — |
| Age steps: dim outline share | 0% → 40.5% → 29.4% | — |
| Age steps: lit nav lights share | 3.8% → 2.4% → 0% | — |
| Age steps: dark-grey scorch share | 0.8% → 16.3% → 31.5% | — |
| Age steps: separate pieces | 1 → 1 → 3 | 1 → 1 → 3 |
| Health band, 24 items: every band reads as itself | yes; vote share drops at most 0.7 points | yes; at most 0.4 |
| Disc cover over the loop (lush, 24 items), mean / max | 1.9% / 8.0% | 1.1% / 5.0% |
| Grey metal within 0.05 of any planet ramp (ring, moons, cap, ocean, land, ice, cloud, sand, toxic) or the drone tells | **0%** | ocean 16%, ice 57%, cap 4.5% |
| Polar cap within 0.03 | **0%** | 4.5% |
| Red (outline and lights) share of debris pixels | 39.4% | (paint) |
| Debris pixels within 0.05 of the lava ramp | 16.0%, all bright outline | 14.0%, all paint |
| Not a ring: groups, median px, multi-tone (ring 17, 22 px, 65%) | 13, 34 px, 92% | 12, 36 px, 100% |
| Not a moon: roundness (moons 0.81); tumble area CV (moon 0.08) | 0.44; 0.36 | 0.33; 0.42 |
| Loop: a loop later vs frame 0; wrap vs largest step | 0 px; 2,311 ≤ 2,578 px | 0 px; 2,184 ≤ 2,377 px |
| Sweep: teal px during / after; px vs the next scan | 80 / 0; 0 | 80 / 0; 0 |

**The red outline against lava:**
- Every bright outline pixel is `#d83843`, 0.048 from the lava rim `#c9361a`. That's 16.0% of all A3 debris pixels, or 41% of the red ones.
- The dim outline (`#872a38`) and the lights (`#ff6866`) are 0.074 or more from every lava and toxic colour.
- No band reading changes: with 24 items, a lava disc still votes 99.4% lava and a lush disc 99.3% lush.

**What the numbers say:**
- The grey is the clean part. It's nowhere near any planet ramp, so debris can't be mistaken for a polar cap or ice any more.
- The outline costs two things. Cover over the loop rises to 8.0% at most, because each piece is 2 px bigger. The silhouette class read drops to 74%, because the outline rounds the shapes off.
- A3 is still well clear of a ring or a moon, and the health band holds.

**Recommendation:** approve A3. If cover over the disc matters, the outline could go on intact pieces only (one line in `layout.js`), which also gives back some of the class read: without an outline, A2's look reads 7 points better.

### A2: grey and red paint

The human picked **A · derelicts** (2026-11-10) with changes: "A but make them Grey and red, to really be noticeable and look more like satellite pieces. You can add in solar panel pieces and actual satellite looking pieces." For the hull they chose the gear blue-grey. **A2 · satellites** is that refinement, kept beside A for before and after (`a-vs-a2.png`). It's waiting for their approval before the port.

**Pieces** (the `satellite` kit, one shape family per class). Red paint is about a third of every piece, so debris shows at a glance:
- **Stale PR:** a comms satellite, with a red bus and dish between two solar wings. A request sent, with no reply.
- **Abandoned branch:** a snapped radio-mast boom in red and grey bands. A limb that never connected.
- **Merged, not deleted:** a spent stage with a red band and nose. The job was done, but the stage was never jettisoned.
- **Orphaned agent:** a detached 2×2 solar array on a red boom, with a torn mount. Power for work that went nowhere: an agent's part, left behind. I tried a red cross spar first, but it read as a first-aid sign.

**Solar panels:** a cell grid of 2 px lines around cells of at least 2 px at hero range. The cells are the darkest navy, `#12173d`, never an ocean blue. A panel with no room for a cell is a grey metal plate, so the grid is a detail that drops out on small pieces rather than a dark hole in space.

**Colour:**
- **Metal** (`gear-light`, `#293268 #464b8c #6b74b2`) is the human's gear blue-grey lifted one step, so it reads as grey beside the red. It stops below the drone shell's lit `#909edd`.
- **Paint** is BLK 36's reds, `#872a38 #cc5250 #d83843 #ff6866`.

**Age without leaning on red** uses value and structure:
- **Intact:** clean metal and bright paint.
- **Weathered:** 45% of the paint cells chipped to dark mauve (`DULL`, about 0.19 L darker on the lit band), and 30% of the metal scorched to navy.
- **Broken:** 75% of the paint dull, 50% of the metal scorched, and the piece in 2–4 fragments.

Even broken junk keeps some red, so old debris stays noticeable.

**A2 measured** (`measures.md`; A for comparison):

| | A2 | A |
|---|---|---|
| Class from the silhouette alone, tumbling (chance 25%) | 80.6% | 81.3% |
| … with colour (red share, solar-cell navy) | 77.1% | 81.3% |
| Age steps (close-ups): bright paint share | 39.8% → 20.6% → 10.9% | (rust 0% → 49% → 83%) |
| Age steps: navy (scorch) share | 0% → 16.7% → 24.9% | — |
| Age steps: separate pieces | 1 → 1 → 3 | 1 → 1 → 2 |
| Health band, 24 items: every band reads as itself | yes; vote share drops at most 0.4 points | yes; at most 0.8 |
| Disc cover over the loop (lush, 24 items), mean / max | 1.1% / 5.0% | 1.3% / 5.5% |
| Debris pixels within 0.05 of the ring / moons / toxic / drone tells | 0% / 0% / 0% / 0% | 0% / 0% / 0% / 0% |
| … of the lava ramp | **14.0%** (all `#d83843`) | 0% |
| … of the polar cap, within 0.03 | **4.5%** | 27.4% |
| … of the ocean ramps (worst band) | 16.1% (navy scorch and cells against the deepest water `#0f1a4e`, 0.033) | 3.5% |
| … of the ice ramps (worst band) | 57.0% (lit metal `#6b74b2` against ice `#5a78ac`, 0.027) | 14.1% |
| Not a ring: groups, median px, multi-tone (ring 17, 22 px, 65%) | 12, 36 px, 100% | 10, 54 px, 100% |
| Not a moon: roundness (moons 0.81); tumble area CV (moon 0.08) | 0.33; 0.42 | 0.60; 0.32 |
| Loop: a loop later vs frame 0; wrap vs largest step | 0 px; 2,184 ≤ 2,377 px | 0 px; 2,265 ≤ 2,401 px |
| Sweep: teal px during / after; px vs the next scan | 80 / 0; 0 | 96 / 0; 0 |

**`#d83843` against the lava rim:**
- `#d83843` is 0.048 (OKLab) from the lava rim `#c9361a`. It's 14.0% of A2's debris pixels, the paint's lit band, and the only A2 colour within 0.05 of any lava or toxic colour.
- No band reading changes. With 24 items, a lush disc still votes 99.6% lush and a lava disc 99.6% lava.
- Swapping it for `#cc5250` (0.060) would make that 0%, at the cost of a duller red. One line in `palette.js`.

**Proximity, compared with A:** the polar-cap overlap drops from 27.4% to 4.5%, because A2's metal moves `#464b8c` to the terminator band. The ice overlap rises, because the lit metal `#6b74b2` is 0.027 from the ice ramp's `#5a78ac`. On the ice planet itself none of it is within 0.03 (0.0%), and the band reading is unchanged.

A2's recommendation was to approve it in the gear-light metal with `#d83843` paint, swapping to `#cc5250` if the red read too lava-like. The human kept `#d83843` and asked for A3 instead.

## Recommendation (before the pick)

**A · derelicts, in the gear hull (D8 as written).** It's the only direction that reads as "a debris-filled planet" from any camera angle, which matters while the camera mode is still open. Its silhouettes carry the class best of the shape kits (83% from the silhouette alone while tumbling, against 61% for blocks), and it leaves the health band readable on every band (the classifier's vote shifts at most 0.8 points at 24 items). Its one cost is that orbiting junk sometimes crosses the disc: 1.3% of it on average and 5.5% at most over the loop, at 24 items.

- **If the disc must never be crossed:** keep A's kit and swap in B's heaps or E's wake, one line in `variants.js`. Both measure 0.0% cover. They're tuned for the default camera, though, and they re-pack when an item goes.
- **Worth keeping from the others:** E's "age is distance down the tail" is the most legible data mapping in the lab, so try it again once the camera is settled. D's paint read is instant but breaks D8 and hides on the night side, so I'd use it only for the selected piece's UI, if anywhere.
- **Hull:** stay on gear. It has no saturated violet, and its weak spot (27% of debris pixels within 0.03 of the lush and ocean polar cap's `#3f4590`) costs nothing measurable in the band reading. Violet-dark trades that for a cloud-shadow match (32% within 0.05), so it's no better. Violet is the fallback if the human sees pieces melting into caps, with the loudness caveat below.

## Data mapping (D1, D2, D5)

- **Class (D1):** the four R13 classes, read from the piece itself (`kits.js`): a silhouette per class (A, B, E, C) or a paint colour (D).
- **Size (D2):** from the diff size in changed lines, on a log scale (1 line → smallest, 10k+ → biggest): 8.5–16 px long at hero range for the scaled kits, 2–10 blocks for C. A `detail` part (a girder's end plate, the crate lid, canister rims) is dropped from pieces too small to draw it at least 2 px thick, like small planets showing fewer cracks.
- **Age (D2):** three steps from days since the last activity (`AGE_STEPS` in `layout.js`): **intact** under 60 days (clean metal), **rusted** under 180 (about half the panels rust), **broken** after (mostly rust, and the piece floats apart into 2–4 fragments).
- **Clutter (D5):** pieces are drawn biggest diff first, up to the cap. The rest are counted, and the sheets show the count as "+N" at output resolution, outside the pixel pass. The factory also reports a mass figure (total changed lines, R13).
- **Placement** comes from a PRNG seeded by (planet seed, item id). In the orbit arrangements (A, C, D), removing an item never moves the others. Heaps and the wake pack their pieces (by count and by age), so they re-pack.

## Colour (D8)

- **Hull:** `gear` is D8 as written: the crew's gear ramp one step darker (`#12173d #293268 #464b8c #6b74b2`), so dead hardware never shows the drone shell's lit grey (`#909edd`) or its whites.
- **Rust:** D8's four warm reds and mauves (`#66334b #872a38 #8c4b63 #cc5250`), at least 0.060 (OKLab) from every product-planet colour.
- **Teal** (`ACCENTS.reveal`, the viewer's own) appears only on an event: the sweep, or a selected piece (its lit band).
- **A2** uses `gear-light` metal, BLK 36 red paint and dark-navy solar cells (above). Red there is paint, not rust, so A2 ages by chipping, scorch and breaking.
- **Hull options** (`hulls.png`): `violet` (`#29174c #412866 #643499 #8c51cc`) is BLK 36's furthest colour family from the planet ramps. `violet-dark` (`#29174c #29174c #412866 #8c4b63`) keeps the violets to their dark steps with a mauve highlight, after the team lead's §4 caveat (saturated violet against land green reads brighter and nearer than the planet).

**Measured** (`measures.md`, depth fade off so every pixel is an exact palette colour; OKLab distances, 0.02 ≈ one just-noticeable difference). The shares are of debris pixels, for 8 items at planet size 1:

- **Against the planet's own on-screen colours,** in the gear hull: 0% within 0.03 on lava, toxic, ash and ice; **27.4% on lush and ocean** (A). That's the hull's lit step `#464b8c` against the polar cap's `#3f4590`, 0.022 apart. The other directions sit between 4.4% (B, whose heaps put more pieces in shadow) and 18.3%.
- **Against the ring ramp, the warm moons, the worse bands (lava and toxic, the rust risk) and the drone tells** (white trim, lit shell, teal): **0.0% within 0.05** in every direction on every band.
- **Hull options** (direction A): `violet` is 0% within 0.03 everywhere and 4.9% within 0.05, but 3.5% of its pixels sit within 0.05 of the ring ramp's navy. `violet-dark` is 0% within 0.03 too, yet 32% within 0.05 on lush and ocean (`#412866` against the cloud shadow `#30285a`, 0.039). So the safe-on-paper version isn't safe.

**Violet check** (the team lead's §4 caveat; direction A with 24 items):

| hull | planet | bright steps (`#643499` `#8c51cc`) | debris L** median | disc L** median | debris brighter than the disc's p75 | debris chroma | disc chroma |
|---|---|---|---|---|---|---|---|
| gear | lush | 0% | 59.4 | 65.6 | 0% | 0.123 | 0.105 |
| violet | lush | **32.0%** | 60.9 | 65.6 | 0% | **0.148** | 0.105 |
| violet | ocean | **21.7%** | 60.9 | 60.6 | 0% | **0.136** | 0.093 |
| violet-dark | lush | 0% | 48.1 | 65.6 | 0% | 0.122 | 0.105 |

L** is Helmholtz–Kohlrausch lightness (Fairchild and Pirrotta 1991). Even with the saturation boost, no violet pixel looks brighter than three quarters of the planet's disc. But violet is the most saturated thing in the frame (chroma 0.148 against the disc's 0.105), and in `clutter-A.png` and `hulls.png` it's the first thing the eye lands on beside a green planet. On that evidence, violet doesn't read as nearer but does read as louder, which is the §4 risk in a milder form.

## Never mistaken for something else (D4)

| | A | B | C | D | E | ring | moons |
|---|---|---|---|---|---|---|---|
| pixel groups (lush, 8 items) | 10 | 2 heaps | 10 | 11 | 11 | 17 | — |
| median group size (px) | 54 | 262 | 27 | 38 | 41 | 22 | — |
| groups with ≥ 2 tones | 100% | 100% | 100% | 91% | 91% | 65% | 4 tones |
| orbit plane vs the ring plane, median (min) | 48° (16°) | no orbit | 48° (16°) | 80° (53°) | no orbit | 0° | — |
| retrograde | 25% | — | 25% | 0% | — | 0% | 0% |
| area change from tumbling (CV) | 0.32 | 0.27 | 0.33 | 0.24 | 0.16 | — | 0.08 |
| roundness (1 = disc) | 0.60 | 0.46 | 0.47 | 0.55 | 0.51 | — | 0.81 |
| colours within 0.05 of the ring / moons | 0% / 0% | 0% / 0% | 0% / 0% | 0% / 0% | 0% / 0% | | |

- **Not a ring:**
  - Pieces are fewer, bigger, shaded objects: at least 2 tones each, where ring clumps are flat clusters of 1–3 px dots.
  - They aren't in the ring's plane (median 48°, and polar D 80°), a quarter of A's and C's orbits run the other way, and they tumble.
  - Their colours are metal and rust, never the ring's planet-family ramp.
- **Not a moon:** debris is angular (roundness 0.46–0.60 against the moons' 0.81). Its silhouette changes as it tumbles: the area varies 2–4× more than a moon's, whose own change (CV 0.08) is only perspective. And no debris pixel is near the moons' warm peach.
- **Not an artefact:** debris is off-surface geometry. It never draws into the planet's shader, it uses no glyphs, and no debris pixel is a planet colour.
- **Not a drone:** debris never shows the drone's tells (white trim, lit shell `#909edd`, teal eyes; 0 pixels at rest), has no screen or smoke, and is a fraction of a drone's size.
- **The health band still reads.** A nearest-colour classifier votes every disc pixel to the band whose debris-free disc has the nearest colour. With 24 items, every band in every direction still wins its own vote.
  - The vote share drops by at most 0.8 points (A), 0.2 (C) and 3.8 (D), and 0 for B and E.
  - Debris covers 0.8% of the disc in A (3.8% in D) at that moment. Over the loop on lush, cover is 1.3% on average (5.5% at most) for A, 0.8% (3.3%) for C, 1.3% (5.2%) for D, and 0% for B and E.
  - Ocean and ice start near 55% because those two looks share many colours with each other; they still win.
- **Class from the piece itself (D1):** silhouettes alone, while tumbling at hero range, give hardware **83%** (chance is 25%; median aspect 2.7 satellite, 4.5 girder, 1.8 stage, 1.2 crate), blocks 61% (small diffs of 2–4 blocks all look alike), and canisters 18%, by design. Canisters are told apart by paint, which needs the band on the lit side.
- **Age steps (D2), close-ups:** intact 0% rust in one piece; rusted 42–53% rust, still one piece; broken 64–83% rust in 2 or more fragments.

## The sweep (D6)

When a piece's branch or PR is gone on the next scan, the piece breaks apart in 1.2 s on its own clock (seconds since that scan), outside the loop lock. It flashes teal (the whole piece for 0.2 s, then the flash drains down to the lit band by 0.5 s), cracks into its fragments, which burst outward and spin, shrinks from 0.45 s, and is gone at 1.2 s with no trace (`sweepAt` in `layout.js`). The same code drives every direction (`sweep-strip.png`):

- **A, B, E (hardware):** the satellite loses its panels, the girder snaps in two, the stage sheds its nozzle and nose, and the crate splits and loses its lid.
- **C (blocks):** the blocks part into their four chunks and pop.
- **D (canisters):** the canister breaks into two halves at the band.
- **B and E re-pack** at the next scan: the heap shrinks or the wake closes up. That's instant here; a port should ease it over the same 1.2 s.

Measured (`measures.md`): teal shows during the flash (69–126 px, under 0.3% of the frame) and 0 px after. In A, C and D, the frame after the sweep is pixel-identical to the next scan without the item (0 px). B and E differ by 174 and 139 px, which is the re-pack.

## House rules (D7)

- **Live 3D** through the viewer's pixel pass (320×180, nearest), lit in four flat bands and darkened in the planet's shadow (the ring's own shadow test). No sprites or dithering, and no outlines except A3's red debris outline, the human's exception (above).
- **2 px:** every kept part is at least 2 px across at hero range, and a detail drops out rather than thinning (`test/pure.test.mjs`). One exception by design: a satellite panel seen edge-on is 1–2 px thick for a moment as it tumbles.
- **Deterministic:** the same seed, items and time give the same pixels, and nothing reads the clock (only the live page's playback).
- **Loop-locked:** each orbit, heap circle and wake circle makes 1 turn per 24 s, and each tumble 1 or 2. Measured: the frame one loop later is identical to frame 0 in every direction, and the wrap diff (1,900–2,265 px) is under the largest frame-to-frame step (2,061–2,432 px).
- **Depth:** the pieces are meshes in the viewer's z-buffer, so they sort against the planet, its clouds, moons and ring. They fade per pixel with the viewer's own `depthFade()` GLSL and depth uniforms (borrowed from a probe planet's ring material, so `applyDepth()` drives them).

## Outputs (`out/`)

| File | Shows |
|---|---|
| `lineup-A.png` … `lineup-E.png`, `lineup-A2.png`, `lineup-A3.png` | 8 stale items on every health band (lava, toxic, ash, lush, ocean, ice), at planet size 1 and 0.55, same items and seed throughout |
| `clutter-A.png` … `clutter-E.png`, `clutter-A2.png`, `clutter-A3.png` | 0, 1, 3, 8 and 24 items on lush and lava, with the "+N" overflow |
| `closeups-hardware.png`, `closeups-satellite.png` (A2), `closeups-satellite-A3.png`, `closeups-blocks.png`, `closeups-canister.png` | Each kit: four classes × three ages at hero range (×5), three diff sizes, and the ages again 3× closer |
| `loop-A.gif` … `loop-E.gif`, `loop-A2.gif`, `loop-A3.gif` (with the blinking lights) | One seamless 24 s loop per direction on the lush hero with 8 items, 15 fps, ×2 |
| `a-vs-a2.png`, `a2-vs-a3.png` | Before and after: A and A2, and A2 and A3, on lush, ocean, ice, toxic and lava with 8 items, and lush with 24 |
| `sweep.gif` | The sweep in A3, 3.5 s, ×2 |
| `sweep-strip.png` | The sweep in every direction, frame by frame (64 px crops ×3 that follow the piece) |
| `hulls.png` | Direction A on every band in the gear, gear-light, grey, violet and violet-dark hulls |
| `crew-scale.png` | Each direction behind the viewer's crew close-up (the depth view), for scale |
| `measures.md`, `measures.json` | Every number in this README |

## Checks

Every tile `npm run lab` renders goes through `checks.mjs`, and the run fails on any problem. `npm test` runs the same checks on a smaller set. Each tile gets four extra renders with the depth fade off: debris on, debris off (the control), debris as id colours in the scene, and debris ids alone.

- **Empty-output control:** a 0-item tile must show no debris pixels and a planted tile must show some, and a tile that should hold debris and shows none fails.
- **Palette:** every debris pixel is a hull, rust (or, for D, paint) colour; no teal without an event.
- **Pieces:** the planned count, every piece whose centre is in view and not behind a nearer piece draws, and no unplanned id appears. Close-ups show exactly one piece: intact and rusted in one connected piece, broken in at least two.
- **Unclipped:** no debris pixel touches the tile edge.
- **Depth sorting:** pieces behind the planet draw nothing through it (and the test proves some do pass behind).
- **Loop seam:** the frame one loop later is pixel-identical to frame 0, and the wrap diff is no bigger than the largest frame-to-frame step.
- **Sweep:** teal during, none after, and no trace against the next scan.
- **A3 outline and lights:** the outline touches the body everywhere (no floating or 2 px-thick runs beyond 1 px), covers more than 80% of the silhouette's edge, and the lights blink within a loop and repeat exactly a loop later.

## How it's built

| File | What |
|---|---|
| `kits.js` | The five kits (hardware, satellite, outlined, blocks, canister) as part tables per class (pure data): sizes from diffs, the 2 px detail rule, solar-panel grids, fragments, rust cells |
| `layout.js` | Items → pieces (`plan`), the arrangements (`place`, plus `prepare` for the two that pack), loop-locked poses (`fragPoses`) and the sweep's timeline (`sweepAt`). Pure, tested in Node |
| `variants.js` | The directions (A–E, A2, A3), sample stale items, the bands and sizes |
| `palette.js`, `colour.js` | Debris colours (checked against `mapPalette('blk-36')`), OKLab, CIELAB and Helmholtz–Kohlrausch lightness |
| `debris.js` | The factory: `makeDebris()` → `{ group, rebuild(items, variant, { seed, radius, hull }), update(phase, { centre, radius, sweeps, selected }), setDebug, layout }` |
| `lab.js`, `index.html` | The page: scenes from the viewer's factories, off-screen tiles, per-tile stats, sheets, frames, the live view |
| `lab.mjs`, `checks.mjs`, `harness.mjs` | The runner, the shared checks, and the Playwright harness |
| `routes.mjs`, `serve.mjs` | The file allowlist (this folder, three, and `../asset-viewer/*.js` top-level modules only) and the loopback server |

The debris shader is the viewer's toon recipe: four light bands from `dot(normal, light)`, band 0 in the planet's shadow, then rust per cell. Rust is decided per cell of a grid in the piece's own frame (cells at least 2 px), so patches stay on the panel as it tumbles. The debris group is a sibling of the planet's group, not a child: piece sizes follow the diff, not the planet's size (LOC), and orbit radii follow the planet.

## Porting notes

- **Viewer hooks the port needs:** export `DEPTH_GLSL` and the depth uniforms (or put `makeDebris` in `viewer.js`), and `LIGHT_DIR`. The lab borrows them from a probe planet's ring material by regex, and throws if that ever stops matching.
- **Asset library:** a debris entry with direction (or kit and arrangement), item count, age mix, hull and seed controls, plus the sweep.

## Open questions and limits

- **The gear hull sits near the polar cap.** `#464b8c` is 0.022 from the cap's `#3f4590`, so 27% of the debris pixels are near a lush or ocean planet's colours. The band reading doesn't notice, but it's the first thing to check if pieces seem to melt into a cap.
- **Absolute size.** Pieces follow the diff, not the planet. On a small planet (size 0.55) they're big next to the disc, and at system-view distances they shrink below 2 px like every other feature. A screen-space size floor is possible but isn't built.
- **B and E are placed in world space,** on the planet's ±x and along a fixed tail axis, for the viewer's default camera. With free rotation they can cross the disc. A, C and D are camera-agnostic.
- **Re-pack.** In B and E, removing an item moves the other pieces at once (174 and 139 px at the next scan). A port should ease it over the sweep's 1.2 s.
- **Satellite panels** are 1–2 px thick for a moment when seen edge-on. The 2 px rule holds for every designed feature, but not for a flat panel's edge.
- **D's paint is dark on the night side,** so the class is unreadable while a canister is in shadow. Its paint colours are also outside D8's metal and rust.
- **Retrograde is random per item** (about 30% expected). The 8-item lineup sample happens to have none; the 24-item plan has 25%.
- **A3's outline is an exception to §3** (no outlines). It lives only in the debris shader, and the port must keep it debris-only. A3's grey is likewise a debris-only exception to BLK 36.
- **A3's outline adds about 2 px to every piece,** so pieces cover more of the disc (8.0% at most) and silhouettes read a little less well (74%).
- **A2's red sits near the lava rim** (`#d83843`, 0.048), and its lit metal near ice (`#6b74b2`, 0.027). Neither moves a band reading; the swap is `#cc5250`.
- **Flat solar parts** are 1–2 px thick for a moment when seen edge-on, as A's panels are.
- **Repo weight:** each loop GIF is about 2.3–2.5 MB (about 15 MB for the six), ×2 at 15 fps, like the drone lab's.
- **Not built:** clicking a piece (the R13 tooltip and copyable cleanup command, outside the pixel pass) and a debris count or mass figure in the UI. `layout.mass` is computed, though.
