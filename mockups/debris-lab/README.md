# Debris lab

> **Exploration, 2026-11-09/10: five space-debris directions (A–E) for the human to pick from.** Debris is stale work (R13): stale PRs, abandoned branches, merged-but-not-deleted branches and orphaned agent branches, drifting near the planets they touch. The feature doc is `docs/features/space-debris.md` on `docs/art-meaning` (requirements D1–D8). The picked direction gets ported into the asset viewer and the asset library later, as its own task.

There's one debris factory (`debris.js`), and it's a modifier any viewer planet can carry. A direction is just a parameter set (`variants.js`): a **kit** (what a piece is), an **arrangement** (where the pieces sit and how they move) and a **cap** (how many are drawn before the rest is counted). A, B and E differ only in arrangement; A, C and D differ only in kit. So any mix, such as "C's blocks in E's wake", is a one-line edit.

The lab imports the asset viewer read-only, in library mode, the way the asset library does: its planets, moons, clouds, sky, stars, crew, renderer, camera, loop and depth fade are the viewer's own. It's a throwaway mockup, not product code.

## Run

```sh
npm install
npm test      # pure checks + browser checks (headless Chromium + SwiftShader, no socket, no network)
npm run lab   # regenerates everything in out/ (about 25 min; needs ffmpeg); node lab.mjs <names> for some
npm run dev   # live page at http://127.0.0.1:5193/debris-lab/ (loopback only; PORT=... to change)
```

`node lab.mjs lineup clutter closeups loops sweep hulls crew measures` names the outputs (no names = all). `measures` re-renders the lineups and close-ups it reads.

## The five directions

| | Direction | Kit (class cue) | Arrangement | Cap |
|---|---|---|---|---|
| A | **derelicts** | hardware: one spacecraft silhouette per class | each piece on its own crooked orbit, about a third retrograde, tumbling | 12 |
| B | **junkyard** | hardware | two churning heaps beside the planet (leading and trailing side) | 20 |
| C | **scrap blocks** | blocks: the block pattern is the class, the block count is the diff | own orbits, as A | 12 |
| D | **tagged canisters** | canisters: one shape, the class is a painted colour band | near-polar orbits, all one way | 12 |
| E | **wake** | hardware | a comet-like tail off one side, youngest item nearest the planet | 10 |

- **A · derelicts.** Dead spacecraft, each on its own loose orbit and tumbling: a satellite (stale PR), a girder (abandoned branch), a spent stage (merged, not deleted) and a cargo crate (orphaned agent branch). It reads as "a planet with junk around it" from any camera angle.
- **B · junkyard.** A's hardware, parked in two slow heaps beside the disc, never in front of it. The heap size is the count. It's tidy, but pieces in a heap overlap, so classes are harder to tell apart.
- **C · scrap blocks.** Chunky cube scrap in A's orbits. Size is literally the number of blocks (2–10 by diff), the class is how they're arranged (a plus, a forked rod, a slab, a crate), and broken means the blocks come loose in chunks. It's the crunchiest and most "pixel" look, but small diffs (2–4 blocks) all look alike.
- **D · tagged canisters.** Every piece is the same canister; its class is a painted BLK 36 band (yellow PR, orange branch, lilac merged, pink agent). Polar orbits stand across any ring plane. The class reads instantly as long as the band faces the light, and the band stretches D8 (debris is meant to be metal and rust).
- **E · wake.** A's hardware trailing off one side like a comet's tail, ordered by age, so a tidy repo has a short tail and old junk sits at the end. The disc stays clear, but the tail's direction is fixed in the world, so it's tuned for the default camera.

## Recommendation

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

- **Live 3D** through the viewer's pixel pass (320×180, nearest), lit in four flat bands and darkened in the planet's shadow (the ring's own shadow test). No sprites, outlines or dithering.
- **2 px:** every kept part is at least 2 px across at hero range, and a detail drops out rather than thinning (`test/pure.test.mjs`). One exception by design: a satellite panel seen edge-on is 1–2 px thick for a moment as it tumbles.
- **Deterministic:** the same seed, items and time give the same pixels, and nothing reads the clock (only the live page's playback).
- **Loop-locked:** each orbit, heap circle and wake circle makes 1 turn per 24 s, and each tumble 1 or 2. Measured: the frame one loop later is identical to frame 0 in every direction, and the wrap diff (1,900–2,265 px) is under the largest frame-to-frame step (2,061–2,432 px).
- **Depth:** the pieces are meshes in the viewer's z-buffer, so they sort against the planet, its clouds, moons and ring. They fade per pixel with the viewer's own `depthFade()` GLSL and depth uniforms (borrowed from a probe planet's ring material, so `applyDepth()` drives them).

## Outputs (`out/`)

| File | Shows |
|---|---|
| `lineup-A.png` … `lineup-E.png` | 8 stale items on every health band (lava, toxic, ash, lush, ocean, ice), at planet size 1 and 0.55, same items and seed throughout |
| `clutter-A.png` … `clutter-E.png` | 0, 1, 3, 8 and 24 items on lush and lava, with the "+N" overflow |
| `closeups-hardware.png`, `closeups-blocks.png`, `closeups-canister.png` | Each kit: four classes × three ages at hero range (×5), three diff sizes, and the ages again 3× closer |
| `loop-A.gif` … `loop-E.gif` | One seamless 24 s loop per direction on the lush hero with 8 items, 15 fps, ×2 |
| `sweep.gif` | The sweep in the recommended direction, 3.5 s, ×2 |
| `sweep-strip.png` | The sweep in every direction, frame by frame (64 px crops ×3 that follow the piece) |
| `hulls.png` | Direction A on every band in the gear, violet and violet-dark hulls |
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

## How it's built

| File | What |
|---|---|
| `kits.js` | The three kits as part tables per class (pure data): sizes from diffs, the 2 px detail rule, fragments, rust cells |
| `layout.js` | Items → pieces (`plan`), the arrangements (`place`, plus `prepare` for the two that pack), loop-locked poses (`fragPoses`) and the sweep's timeline (`sweepAt`). Pure, tested in Node |
| `variants.js` | The five directions, sample stale items, the bands and sizes |
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
- **Repo weight:** each loop GIF is about 2.3–2.5 MB (12 MB for the five), ×2 at 15 fps, like the drone lab's.
- **Not built:** clicking a piece (the R13 tooltip and copyable cleanup command, outside the pixel pass) and a debris count or mass figure in the UI. `layout.mass` is computed, though.
