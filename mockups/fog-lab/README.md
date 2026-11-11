# Fog lab

> **Exploration, 2026-11-10/11: five fog-of-war directions (A–E) and one refinement (A2). The human picked D (survey parcels) and asked for it to look more "unknown"; of D2a–D2c they picked D2c ([below](#the-pick-d-refined-as-d2)). They then asked for "way way darker" fog, and of D2d and D2e ([the dark pass](#the-dark-pass-d2d-and-d2e)) picked **D2d · dark veil**, the final fog. With a halo limb added ([D2d, final](#d2d-final)), it now lives in the asset viewer (`../asset-viewer/fog.js`); the other looks stay here and draw through the viewer's shader.** Fog of war is R5, the product's core signal. A file is fogged when some change since you last charted it isn't yours (#33, PR #50). The feature doc is `docs/features/fog-of-war-art.md` on `docs/art-meaning` (requirements F1–F8). D2d is in the asset viewer; the asset library's Fog group comes next.

Fog lives on the planet's own surface, per file, on #18's surface cell grid (PR #51). It sits under the clouds, turns with the ground and fades with depth per pixel like everything else. Every direction is the same data drawn a different way. The lab imports the asset viewer in library mode, as the debris lab does: its planets, moons, clouds, sky, stars, crew, debris, renderer, camera, loop and depth fade are the viewer's own. The fog reaches the planet shader through the viewer's `makePlanet({ fog })`, and every look here registers into the viewer's fog (`registerFogLook()`), so there's one shader path ([the port](#the-port)). It's a throwaway mockup, not product code.

## Run

```sh
npm ci
npm test      # pure checks + browser checks (headless Chromium + SwiftShader, no socket, no network), one file at a time
npm run lab   # everything in out/, measures.json and measures.md (about 35 min; needs ffmpeg)
npm run dev   # live page at http://127.0.0.1:5194/fog-lab/ (loopback only; PORT=... to change)
```

`node lab.mjs lineups compare d2 closeups reasons footprint coexist loops events measures` names the outputs (no names = all). `node lab.mjs report` rewrites `measures.md` from `measures.json` without rendering. `--quick` runs a smoke version of the measures (fewer phases and seeds; its numbers aren't for the report).

## The data (F1)

- **The grid is #18's.** `surface.js` is a line-for-line port of PR #51's `fibonacciCell(i, n)` and its `Surface` class. That's 256 cells on a Fibonacci sphere, one file per cell. Each folder's continent grows from a seed cell: the top-level folder's at the north pole, each later folder's at the free cell farthest from every earlier seed. Each file claims the free cell nearest its continent's seed, once, at birth. The ties go the same way.
- **The fog is #33's.** A file is clear, charted (drawn the same as clear) or fogged, with a reason. `mock.js` builds mock planets: `src` (48 files in 5 folders), `docs` (12 files) and `big` (64 files). Their files are born one per commit into their folders, so they settle the way `layout()` places them. Coverage charts the first `round(c × N)` files in a folder-clustered order, on the guess that a review covers one folder's agent work at a time. Reasons follow each folder's usual reason, with one file in five something else.
- **Shader cells match #18's grid** (`measures.md` F1). The check renders the cell id under every planet pixel and compares it with the grid computed on the CPU for that pixel. Over 55,411 pixels in four framings (hero, 2.4× closer, 360p, a small planet), no pixel landed on the wrong cell, owner or state. The only mismatches were 335 pixels on a cell edge or corner, within 0.01 rad (the mesh is faceted), and 24 grazing pixels at the limb.

### Footprint: what a file's fog covers

This is the one call the lab can't leave to the data. #18 gives each file **one** of the 256 cells, so a planet with 48 files has 208 cells that belong to nobody.

| footprint | what fog covers | fogged area at 0% / 50% / 100% charted (src, mean over a turn) | visible at 0% (D) |
|---|---|---|---|
| **territory** (approved by the human, computed in the renderer; #18 unchanged) | Every grid cell is shared out among the planet's files in equal shares, each grown from the file's own cell over its neighbours. A file keeps its own cell; files boxed in by others get fewer cells. | 92.9% / 44.4% / 0% of the disc | 68% |
| cell (strict) | The file's own cell, nothing else | 12.7% / 6.0% / 0% | 11% |

With the strict footprint, a planet nobody has charted looks almost clear, so coverage can't be read from the planet at all (F2). Territory meets F2, and the fogged share of the grid tracks the fogged share of the files: within 12 points on every mock planet and coverage, as `test/pure.test.mjs` checks, and within 4 on `src`. It's still per file (F1): charting one file clears only its territory. **The cost:** territory is derived at render time, not stored in the layout. A new file takes cells from its neighbours, so territories shift when files come and go, though settlements never move. Shares are uneven too: on `src` a territory is 1–11 cells (the even share would be 5–6), so charting an edge file clears more ground than charting a file deep inside a continent. `footprint.png` shows both, for D and D2b.

Each footprint has an **anchor**: its cell nearest the footprint's centroid. A file's settlement sits packed in with the rest of its folder near the continent seed, so it's often at one end of its territory. D2 samples a parcel's tone at the anchor and draws its hatching and "?" from there, and every event front starts from it.

## The directions (A–E, A2; D2a–D2c below)

All of them follow the filter rule (§9): fog reuses the colours of what it covers. `fstep()` moves a colour along the ramp it came from, so lava glow steps along the glow ramp. C and D resample the terrain itself, and the event rim is inverted lightness. The only colour fog adds is [OIII] teal, on events only. Fog sits on top of artefacts: an artefact sector in a fogged cell is fogged too.

| | Direction | The idea | At rest | Ambient motion |
|---|---|---|---|---|
| A | **glyph field** | The code layer: a fogged file shows its glyph source (the art direction's §9 candidate, ascii-fx round 2 re-implemented on the surface) | One hand-drawn 5×5 glyph per fogged grid cell, drawn screen-aligned at the cell's projected centre. The glyph is two ramp steps lighter than the terrain, on a ground one step darker. The glyph follows the terrain's luminance: `:` ○ ◎ hatching | A few glyphs swap on slow loop-locked ticks (48 per loop, each cell on its own offset) |
| B | **unlit** | Unsurveyed land is out of the light | The terrain two steps darker on its own ramps; lava glow dims one step | None |
| C | **unrendered** | The planet hasn't been resolved there yet | The terrain resampled on a coarse object-space lattice: flat tiles about 10 px across, never more than a third of the radius, each lit by its own centre | None |
| D | **survey parcels** | A surveyor's map: you know the parcels, not their contents | Each grid cell is flat in the terrain colour at its centre, one step darker, and each fogged file's footprint is outlined by a 2 px line one step lighter | None |
| E | **mist** | Literal fog: low mist hugging unsurveyed ground | Streaks of the terrain's lighter steps that drift west, one turn per loop against the ground (clouds drift east). Lava glow shows through unchanged | The drift |
| A2 | **glyph parcels** | A refined with D's outlines: the code layer, with each file's footprint drawn | A's glyph field, with each fogged file outlined in a 2 px line in A's ink | As A |

**The events are shared** (F5, F6). Each direction has a *thin* look that its fronts use: dots for A and A2, one step darker for B, half-size tiles for C, the lines alone for D, sparse streaks for E.
- **Clear** (charting a file, 1.0 s): a front runs out from the footprint's anchor across the footprint, easing out. It has a 1 px teal core, then a 1.5 px inverted-lightness rim (the §9 wavefront), then a 4.5 px band of thin fog, then clear ground.
- **Planet-clear pulse** (the landing moment, 0.9 s): when the last fogged file on a planet clears, the same core and rim travel once around the whole planet from that file. The flag and beacon are a later feature.
- **Refog** (a later change that isn't yours, 2.4 s): fog closes in from the far edge of the file's footprint toward its anchor, easing in and out. Its edge is 5 px of thin fog that billows as it rolls. There's no rim and no teal, so it can't be read as a glitch or as a second charting.
- **Moons** are test files: each one is fogged or clear as a whole, in the same looks on the moon's own ramp, and its fronts run from pole to pole.

## Measured (`measures.md`)

Visible fog is the share of the disc that differs from fog off by at least 0.02 (about one just-noticeable difference), averaged over every look and 8 faces of one surface turn.

| | A | B | C | D | E | A2 |
|---|---|---|---|---|---|---|
| **F2** visible fog at 0 / 25 / 50 / 75 / 100% charted | 70 / 47 / 34 / 19 / 0% | 70 / 47 / 34 / 19 / 0% | 36 / 24 / 17 / 9 / 0% | 68 / 46 / 33 / 18 / 0% | 68 / 46 / 33 / 17 / 0% | 73 / 49 / 36 / 20 / 0% |
| **F2** ranked right at a glance: 0 vs 25, 25 vs 50, 50 vs 75% (chance 50%) | 88 / 73 / 78% | 88 / 73 / 78% | 79 / 71 / 77% | **90 / 74 / 79%** | 86 / 74 / 81% | 88 / 73 / 78% |
| **F2** ranked right, 50 points apart: 0 vs 50, 25 vs 75% | 93 / 88% | 93 / 88% | 87 / 89% | **95 / 89%** | 93 / 90% | 94 / 89% |
| **F2** contrast on the darkest look (the mean, over renders, of each one's median OKLab change across its fogged pixels) | 0.053 (toxic) | 0.081 (lava) | **0.000** (ocean) | **0.090** (toxic) | 0.026 (lava) | 0.083 (lava) |
| **F3** discs misread, at 0% charted (48 per framing): hero / far | 0 / 0 | **8 / 8** (desert → toxic) | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| **F3** worst margin at 0%, hero / far (> 0: every disc reads as its own band) | 0.041 / 0.020 | −0.124 / −0.043 | 0.089 / 0.045 | **0.068 / 0.043** | 0.036 / 0.020 | 0.050 / 0.021 |
| **F3** per-pixel vote for the planet's own band, worst disc at 0% (hero) | 99.2% | 98.3% | 100% | 99.1% | 97.8% | 98.6% |
| **F8** flicker with the ground held still (artefacts: 18.1%) | < 0.05% | 0% | 0% | 0% | 3.1% | < 0.05% |
| **F8** fogged lava pixels within 0.05 of the ash, cloud and spore ramps (36.8% with fog off) | 21.9% | 9.7% | 33.6% | 30.3% | **48.9%** | 28.0% |

F3 at 50% charted, and with overlays (moons and artefacts at the auto count), is in `measures.md`. Only B misreads there: 2 desert discs at hero, 1 at far and 3 with overlays. The smallest margins elsewhere are A's: 0.028 at far and 0.031 with overlays.

These hold for every direction:
- **100% charted is the planet itself:** 0 px differ from fog off, in every render.
- **Teal:** 0 px at rest over the whole loop. At most 0.19% of the frame during a clear and 0 during a refog, with 0 px left after either.
- **Settled:** after an event the frame equals the same cell drawn in its end state (0 px).
- **Motion:** the clear spreads outward (+8.1 px/s from the files' anchors) and the refog closes inward (−3.7 px/s).
- **Loop:** frame 24 s equals frame 0 (0 px), and the wrap is never bigger than the largest step between frames over the first 4 s (A 3,211 ≤ 3,260 px).
- **Determinism:** the same frame twice is identical.
- **Not clouds:** fog's bulge past the silhouette is 0% (clouds 37.8%, toxic smoke 33.4%). Fog rides the terrain exactly (lock 1.000 a surface turn later; clouds 0.226, ash smoke 0.059, artefacts 0.575 as they simmer). 100% of its pixels are the planet's own ramp colours (clouds 0%, artefacts 82%).

**F3 fidelity.** The lab's clear hero renders measure the same as health-looks' own `measurements.csv`, to its 4 decimal places (144 look × seed pairs; the largest difference is 5×10⁻⁵, the CSV's rounding). The clear centroids pass H5 at hero, far and with overlays, so every miss above comes from the fog.

## First-round recommendation (the human picked D)

**D · survey parcels.** It has the best numbers on every axis that tells the directions apart:
- **Reads coverage best:** two planets 25 points apart rank right 74–90% of the time, and 89–95% at 50 points apart.
- **Highest contrast on the darkest looks:** 0.090 on toxic and 0.107 on lava. A's are 0.053 and 0.054.
- **Widest health margins:** every disc reads as its own band at hero and at far, the worst by 0.068 and 0.043, against A's 0.041 and 0.020.
- **Shows the files themselves (F1):** each fogged file's footprint is a parcel you can count, and a parcel clears as one when you chart it.
- **Fits the product's verb:** you *chart* a file, and D's fog is the unfinished part of a map.

What to weigh:
- **D draws lines on the surface.** They're 2 px parcel boundaries, not object silhouettes, so I don't think the §3 no-outlines rule covers them, but that's the human's call.
- **The lines can look like terrain.** On lava they're yellow over flat glow cells, so the fog can read as crust plates with glowing cracks. On desert they run beside the dune bands. The band still reads (lava margin 0.298), but in a lineup it's the most "is that the planet or the fog?" of the directions.

**If the human wants the code layer (§9), take A · glyph field.** It's the art direction's own candidate and the most Commet-looking fog, and it never resembles terrain. It reads coverage almost as well as D (88 / 73 / 78%). Its costs:
- low contrast on toxic and lava, where the ramps are dark;
- the tightest health margin at far, on desert (0.020).

A2 (A plus D's outlines) fixes the contrast (0.083) and draws the files, but it's the busiest look in the lab.

**Not recommended:**
- **B · unlit.** It fails F3: a fully fogged desert reads as toxic on 8 of 8 seeds, at hero and far. Darkening the ash band takes away the lightness step that separates it from toxic. It also reads as shadow.
- **C · unrendered.** It passes F3 most comfortably but is nearly invisible where the terrain is flat: the median fogged pixel changes by at most 0.011 on ocean, lava, desert and ice. Only 36% of a fully fogged disc changes visibly.
- **E · mist.** It reads well and passes F3, but it lifts lava's crust toward the ash-smoke colours (48.9% of fogged lava pixels, against 36.8% with fog off). It's also the only direction that moves, so it's the one most likely to be taken for weather.

**F4:** keep fog uniform by default. A with reasons (`reasons.png`) works, but `=`, `:` and `>` carry less ink than the uniform ◎ and hatching, so it reads weaker. The drones already show agent work.

**Footprint:** territory, not the strict cell (above). The strict cell can't meet F2 because most of a planet has no file.

## The pick: D, refined as D2

The human picked **D**. They approved its 2 px parcel lines as a fog-only exception to §3's no-outlines rule: the lines stay in the terrain's own ramp colours and go when a file is charted. They also approved the territory footprint, computed in the renderer with #18 unchanged. Their note on D: *"looks good but can we make these areas look even more 'unknown' or 'unseen'?"* D2 offers three strengths of "unseen", with D kept beside them for before and after (`d2-compare.png`, `lineup-D2.png`).

| | D2 variant | At rest |
|---|---|---|
| D2a | **blank map** | Each fogged file's parcel is **one flat tone**: the band's own ramp under the parcel's anchor, shaded only by the light band as plain ground is, so a parcel shows one or two tones. Continents, cracks, craters, dunes and artefacts are gone; clouds and their shadows still pass over. Molten ground **smoulders** in the glow ramp's darkest step, so fog never makes lava look hotter than it is. D's outlines stay. |
| D2b | **terra incognita** | D2a plus sparse diagonal hatching (`\` or `/` per parcel, 6 px apart), one step darker on the same ramp. It's anchored at the parcel's projected centre and drifts two periods per loop, a 1 px step every 2 s. |
| D2c | **veiled** | D2b with the sunlight taken away: the light softens to two steps (lit, and the night side one step down), so parcels lose their terminator crescents. The hatching is sparser and dashed (9 px apart), the outline is only one step lighter, and half the parcels of 7 or more cells get a single "?" (5×5, one step lighter) at their centre, never as a pattern. |

Nothing in D2 darkens a whole ramp, which is what broke B: every parcel tone is the band's own ground at its own light. Only the hatching is a step darker, and only on its lines.

| | D | D2a | D2b | D2c |
|---|---|---|---|---|
| **F3** discs misread or within a glance (48 per framing): hero / far / overlays, at 0% and 50% | 0 | 0 | 0 | 0 |
| **F3** worst margin at 0%, hero / far | 0.068 / 0.043 | 0.052 / 0.039 | 0.056 / 0.041 | 0.039 / 0.027 |
| **F3** worst margin at 50%, hero / far / overlays | 0.087 / 0.047 / 0.091 | 0.075 / 0.045 / 0.080 | 0.069 / 0.043 / 0.075 | 0.083 / 0.042 / 0.084 |
| **F3** per-pixel vote for the planet's own band, worst disc at 0% (hero) | 99.1% | 99.2% | 99.2% | **100%** |
| **F2** visible fog at 0 / 25 / 50 / 75% charted | 68 / 46 / 33 / 18% | 53 / 37 / 26 / 15% | 56 / 38 / 27 / 15% | 65 / 43 / 31 / 17% |
| **F2** ranked right: 0 vs 25, 25 vs 50, 50 vs 75% | 90 / 74 / 79% | 77 / 72 / 78% | 80 / 73 / 79% | **90 / 75 / 79%** |
| **F2** ranked right, 50 points apart | 95 / 89% | 89 / 89% | 90 / 89% | **95 / 91%** |
| **F2** contrast on the darkest look | 0.090 (toxic) | 0.020 (ocean) | 0.046 (ocean) | **0.114** (lava) |
| **F7** loop seamless (wrap ≤ largest step), teal at rest | 2,691 ≤ 2,882, 0 | 2,450 ≤ 2,831, 0 | 3,150 ≤ 3,187, 0 | 2,638 ≤ 2,851, 0 |
| **F8** flicker with the ground held still (artefacts 18.1%) | 0% | 0% | 0% | 0.4% |
| **F8** bulge / lock a turn later / own ramp colours | 0% / 1.000 / 100% | same | same | same |
| **F8** fogged lava pixels within 0.05 of the ash, cloud and spore ramps (36.8% fog off) | 30.3% | 49.4% | 48.1% | 52.8% |

Every band reads in every D2 variant at hero, at far (fade 0.72) and with moons and artefacts. The tightest is D2c at far, fully fogged, where lush and ice clear the nearest other band by 0.027 and 0.029. The events are D's (+8.1 px/s outward, −3.7 px/s inward; at most 0.19% teal, 0 at rest and after).

**My pick: D2c · veiled.**
- **The most "unseen":** fogged parcels lose their terrain detail and their sunlight, and read like a paper map laid over the planet.
- **Best coverage reading in the lab:** 90 / 75 / 79% ranked right at 25 points apart, and 95 / 91% at 50, tying or beating D.
- **Highest contrast on the darkest look:** 0.114, against D's 0.090. D2a and D2b drop to 0.020 and 0.046 on ocean, because a flat water parcel looks like water.
- **The "?" stays occasional:** about one per big parcel, on half of them.
- **What it costs:** the narrowest health margin of the D family, 0.027 at far when fully fogged. That still passes, and no disc is within a glance of another band.

**If the human wants more of the planet's form kept, take D2b.** It keeps the terminator and has wider margins (0.056 hero, 0.041 far), at the cost of weaker coverage reading (80 / 73 / 79%) and flat water parcels that barely show on ocean.

**What D2 changes for lava.**
- **Less glow:** parcels over molten ground smoulder in the rim colour and crust parcels are flat crust, so fogged lava shows less glow than clear lava. It still reads as lava by a wide margin (0.17 at 50% charted, 0.30 fully fogged).
- **Closer to the ash-smoke colours:** 48–53% of fogged lava pixels are within 0.05 of the weather ramps, against 36.8% fog off, because lava's crust ramp sits next to the ash ramp.
- **Still not smoke:** the parcels never bulge (smoke: 0.8%), ride the ground exactly (lock 1.000, smoke 0.059) and have straight parcel edges, so they don't move or shape like smoke.

## The dark pass: D2d and D2e

The human, on D2c: *"try it also but the fog becomes way way darker, so it's super clear that it's hidden."* Two dark variants, shown beside D2c (`dark-compare.png`, `dark-closeups.png`):

| | Variant | At rest |
|---|---|---|
| D2d | **dark veil** | Each parcel is its ramp's darkest step **mixed 65% toward the space colour** (82% on the night side). The hatching is faint (mixed 42%), the "?" is drawn in the ramp's middle step so it stays visible, and the outline is dim (mixed 30%). This breaks the filter rule on purpose: the mixes are new colours. |
| D2e | **dark veil + band edges** | D2d, with each parcel's 2 px outline in the **middle step of the band's own ramp**: lava's glow body (emissive), toxic's dull rust ground, desert's sand, lush's green or blue, ocean's blue, ice's mid blue. The band reads from the edges and from the charted ground while the area stays hidden. Toxic's edges are its dull middle step on purpose: its bright step on black read as lava cracks. |

Fully fogged = 0% charted; 48 discs per framing (6 looks × 8 seeds). Hero/far means the hero framing and depth level 2 (fade 0.72).

| | D2c | D2d | D2e |
|---|---|---|---|
| **F3** discs misread, fully fogged: hero / far | 0 / 0 | **30 / 35** | **19 / 8** |
| **F3** which bands misread (all as toxic), fully fogged | none | hero: desert 8, lush 7, ocean 7, ice 8; far adds lava 8 | hero: desert 8, ice 8, lush 2, ocean 1; far: desert 8 |
| **F3** worst margin, fully fogged: hero / far | 0.039 / 0.027 | −0.184 / −0.438 | −0.215 / −0.061 |
| **F3** discs misread at 50% charted: hero / far / overlays | 0 / 0 / 0 | 9 / 10 / 9 | 5 / 1 / 5 |
| **F3** per-pixel vote for the own band, fully fogged, hero (mean / worst) | 100% / 100% | 64% / 43% | 68% / 48% |
| **F3** the same vote over what still shows a planet colour (edges, charted ground, clouds) | 100% / 100% | 68% / 35% | **75% / 58%** |
| **F2** visible fog at 0 / 25 / 50 / 75% charted, hero | 65 / 43 / 31 / 17% | **79 / 53 / 39 / 21%** | 75 / 50 / 37 / 20% |
| **F2** the same at far | 60 / 40 / 28 / 16% | **71 / 48 / 35 / 19%** | 68 / 47 / 34 / 19% |
| **F2** ranked right, 25 points apart: hero / far | 90 / 75 / 79% · 89 / 76 / 78% | 89 / 73 / 79% · 84 / 73 / 78% | 90 / 73 / 79% · 89 / 75 / 79% |
| **F2** contrast on the darkest look: hero / far | 0.114 / 0.040 | 0.120 / 0.035 | 0.149 / 0.051 |
| **F8** fog pixels within 0.05 of the space colour (hero / far) | 7% / 4% | 44% / 38% | 38% / 27% |
| **F8** … of the look's unlit ground (its ramps' darkest step) | 27% / 23% | 49% / 52% | 36% / 29% |
| **F8** … of lava's crust ramp (the other five looks) | 9% / 7% | **68% / 54%** | **63% / 44%** |
| **F8** fog pixels that are the planet's own ramp colours (lush, 50%) | 100% | 0% | 32% (the edges) |
| **F8** … within 0.05 of the cloud, ash-smoke and spore ramps (lush, 50%; fog off 0%) | 0.1% | 65.5% | 65.2% |
| **F8** limb: median distance of the disc's outer 2 px from space, fogged (clear 0.280) | 0.345 | **0.073** | 0.236 |
| **F8** limb ring within 0.03 of space, mean (worst look): fogged; clear 4.6% (27.6% on lava) | 1.8% (10.7%) | **17.8% (63.3%, lava)** | 10.4% (35.8%, lava) |
| **F7** teal at rest; loop seamless | 0; yes | 0; yes | 0; yes |

What the numbers say:
- **Hidden reads at a glance:** fully fogged, 75–79% of the disc changes visibly (D2c: 65%), and the contrast is the highest of any direction.
- **F3 fails, as expected.** A near-black disc reads as toxic, the darkest warm band.
  - D2d hides every band, and at far even lava.
  - D2e's edges keep lava (emissive) and mostly lush and ocean, but desert and ice still read as toxic.
- **Dark fog looks like lava crust.** On the other bands, 63–68% of the fogged pixels are within 0.05 of lava's crust. That's the worst-band ground, so a fully fogged healthy planet can be mistaken for a dead lava world, the reverse of what fog should say. D2e's band-coloured edges are what tell it apart.
- **Dark fog is also close to smoke colours:** 65% of fogged lush pixels are within 0.05 of the ash smoke's and cloud shadow's darks. Shape and motion still separate them: fog doesn't bulge, and it rides the ground (lock 1.000).
- **The silhouette:**
  - **D2d:** fully fogged, the limb comes within 0.073 of space at hero, against 0.280 clear. On lava, 63% of the outer ring merges into space, and the disc loses its edge.
  - **D2e:** its edges hold the limb at 0.236 (36% merged on lava).
  - **Far:** the depth tint lifts every limb off space, so nothing merges at the far framing.
- **Not the unlit side:** fog parcels sit on the lit side too, with straight parcel edges, hatching and the "?". The terminator still shows across charted ground. By colour alone, though, 36–49% of fog pixels are within 0.05 of the unlit ground.

**My call:**
- **If the human wants it darker, take D2e.** It keeps the lava band, the planet's edge and the parcels' band hue, and it reads as hidden as D2d.
- **What D2e costs:** health no longer reads through fully fogged desert and ice planets, at hero (8/8 seeds each read as toxic) or, for desert, at far. The planet's own label and selection (§6 rule 5) would have to carry those bands.
- **Untested fixes for desert and ice, worth a pass if the human likes D2e:**
  - a lighter veil on those bands, mixed 50% instead of 65%;
  - 3 px edges;
  - edges in the ramp's bright step rather than the middle one.

  Each trades some darkness back.
- **D2d** is the clearest "hidden", but it fails F3 almost everywhere and merges into space at the limb.
- **If health through fog matters more than darkness, stay with D2c.** Every band reads, and the fog is clearly drawn.

The human picked **D2d**, as a deliberate stance: health doesn't read through fully fogged land (*"you can't see the health of code you haven't reviewed"*). It reads on charted land and in the planet's label. So F3 is now: health reads on charted land, and fogged land reads unmistakably as unknown.

## D2d, final

Two fixes on the pick, measured together.

**1. The limb.** Fogged pixels within 2 px of the planet's silhouette take the halo colour `#30285a`, one step above space: the viewer's optional dark-halo shell, and no band colour. That's the smallest change that holds the silhouette.

**2. The cool veil.** D2d's veil was each band's darkest step mixed toward space, so on the five non-lava looks 61.7% of fog pixels (89.6% on toxic) sat within 0.05 of lava's crust. A fogged healthy planet read as a dead lava world, a false worst-band signal. The veil is now cool blue-plum in the halo's hue, whatever the band:

| | colour | OKLab L, chroma |
|---|---|---|
| lit | `#190e3d` | 0.21, 0.085 |
| night | `#110432` | 0.17, 0.085 |
| outline | `#1e1740` | 0.24, 0.075 |
| hatching | `#221a46` | 0.26, 0.08 |
| "?" | `#615999` | 0.50, 0.10 |

The lit and night tones match the darkness of the old mixes. Every veil tone is at least 0.06 from each crust colour and from space (`test/pure.test.mjs` checks it).

Fully fogged, every look, at hero and far (`measures.md`, F8 · the dark pass):

| | D2d first look | **D2d final** | D2c | target |
|---|---|---|---|---|
| Fog px within 0.05 of lava crust, five non-lava looks: hero / far | 61.7% / 36.0% | **0.0% / 0.0%** | 9.2% / 7.3% | ≤ 15% |
| … toxic alone | 89.6% | **0.0%** | 46.2% | well below 89.6% |
| Fog px within 0.05 of space | 39.8% | **0.0%** | 6.8% | — |
| Fog px within 0.05 of the cloud, ash and spore ramps (lush) | 65.5% | **7.7%** | 0.1% | — |
| Outer 2 px ring within 0.03 of space, mean / worst look (clear: 4.6% / 27.6%) | 17.8% / 63.3% (no limb fix) | **0.0% / 0.0%** | 1.8% / 10.7% | ≤ 28% |
| Median distance of that ring from space (clear 0.280) | 0.073 (no limb fix) | **0.161** | 0.345 | — |
| Visible fog, fully fogged: hero / far | 79% / 71% | **82% / 78%** | 65% / 60% | — |
| Coverage ranked right at 25 points apart: hero / far | 89/73/79% · 84/73/78% | **90/73/80% · 91/75/79%** | 90/75/79% · 89/76/78% | — |

**Health reads on charted land.** Take every fogged surface pixel out of the disc and classify what's left (the charted ground, with the clouds and moons over it). At 25, 50 and 75% charted, that's **0/48 misreads at hero and at far**, with none within a glance. The worst margins are 0.053, 0.073 and 0.081 at hero, and 0.026, 0.038 and 0.041 at far. The whole disc, fog included, misreads 24, 13 and 7 of 48 at hero, all as toxic. That's the design: the fogged part reads as unknown, and the planet's label carries the band.

The events and loop are as before: teal at most 0.19% of the frame during a clear, 0 at rest and after; the clear spreads outward at +8.1 px/s and the refog closes inward at −3.7 px/s; the loop is seamless (2,473 ≤ 2,817 px). Fog doesn't bulge past the planet's edge and stays locked to the ground (IoU 1.000). The unlit ground is about as near as it is for D2c: 27% of fog pixels are within 0.05 of a look's darkest step (D2c: 27%).

`lineup-D2d.png` shows the final look on every band at every coverage; `clear-D2d.gif`, `refog-D2d.gif` and `final-events-strip.png` are its events.

## Outputs (`out/`)

| File | Shows |
|---|---|
| `lineup-A.png` … `lineup-E.png`, `lineup-A2.png` | The first round: each direction on every look (lava, toxic, desert, lush, ocean, ice) at 0, 25, 50, 75 and 100% charted, on the `src` planet at t = 2 s, with moons |
| `compare.png` | The first round at 50% on every look, plus a small planet at mid distance and lava at depth level 2 |
| `lineup-D2.png` | D, D2a, D2b and D2c on every look at every coverage |
| `d2-compare.png` | D against D2a, D2b and D2c: every look at 50%, lush and lava fully fogged, two close-ups |
| `closeups.png` | D and D2a–D2c 2.4× closer on lush, lava and ice, and the hero at 360p |
| `reasons.png` | F4: A's uniform glyphs against A with the reason as the glyph |
| `footprint.png` | Territory against the strict cell footprint, D and D2b on lush at every coverage |
| `coexist.png` | F8: D and D2a–D2c with clouds, moons, 8 debris pieces, artefacts and a drone, beside what fog must not be mistaken for (clouds, ash smoke, toxic smoke, artefact sectors) |
| `loop-D.gif`, `loop-D2a.gif`, `loop-D2b.gif`, `loop-D2c.gif` | One seamless 24 s loop each (lush, 50% charted, moons), 15 fps, ×2 crop |
| `clear-D.gif`, `clear-D2c.gif`, `refog-D.gif`, `refog-D2c.gif` | Charting the planet's last three files (0.6 s apart, then the pulse), and two files refogging (0.8 s apart) |
| `clear-strip.png`, `refog-strip.png` | Those events every 0.2 s, D and D2c |
| `dark-compare.png` | The dark pass: D2c, D2d and D2e on every look at 0% and 50% charted, and fully fogged at depth level 2 |
| `dark-closeups.png` | D2c, D2d and D2e 2.4× closer on lush, lava, toxic, desert and ice |
| `loop-D2d.gif`, `loop-D2e.gif` | One seamless 24 s loop each (lush, 50% charted, moons), 15 fps, ×2 crop |
| `clear-D2e.gif`, `refog-D2e.gif`, `dark-events-strip.png` | D2e's clear (the last three files, then the pulse) and refog, and both every 0.2 s |
| `lineup-D2d.png` | **The final fog**, D2d with its cool veil and halo limb, on every look at 0, 25, 50, 75 and 100% charted, with moons |
| `clear-D2d.gif`, `refog-D2d.gif`, `final-events-strip.png` | D2d's clear and refog, and both every 0.2 s |
| `../measures.md`, `../measures.json` | Every number in this README |

## How it's built

| File | What |
|---|---|
| `surface.js`, `mock.js` | Re-exports of `../asset-viewer/fog-layout.js` under the lab's old names: #18's grid (`fibonacciCell`, `Surface`), the demo planets (`mockPlanet`), coverage, reasons, the footprints, the fog state over time and the cell texture (pure) |
| `glyphs.js` | The fog's 5×5 glyphs, from ascii-fx round 2's set. They share none of the artefacts' bug glyphs (pure) |
| `fog.js` | The lab's looks (A–E, A2, D, D2a–D2c, D2e), registered into the viewer's fog (`registerFogLook()`); `fogSpec()` adds A's per-reason uniform. D2d is the viewer's own look |
| `variants.js` | The directions, the looks and the moons' coverage (pure) |
| `lab.js`, `index.html` | The page: scenes from the viewer's factories, render modes (final, fog off, the stage mask, cell ids, the glow sentinel, depth off), sheets, the F1 cell check, the live view |
| `lab.mjs`, `stats.mjs`, `checks.mjs`, `report.mjs` | The runner, the pixel statistics (OKLab, the disc, the look vector and the glance floor from `../health-looks`, read-only), the render checks and `measures.md` |
| `harness.mjs`, `routes.mjs`, `serve.mjs` | Playwright and the allowlist: this folder, three, the viewer's top-level modules, and the drone lab's modules for the drone (plus the astronaut lab's `crew.js` and the library's `drones.js`, which they read) |

**Per fragment** (`fog.js`), the shader takes these steps:
1. **Find the cell.** It finds the nearest of the 256 cells. Cell centres come from a 256×3 float texture, and only the cells whose y is within 1.7 covering radii are searched (77 of 256). `test/pure.test.mjs` checks that the window always holds the two nearest.
2. **Read the cell.** It reads the cell's state, the file that owns it, and any event in progress.
3. **Place the front.** During an event, the angle from the owner's cell sets where the front is.
4. **Draw.** The pixel is drawn in its stage: clear, thin fog, fog, rim or core.

The viewer's `driveFog()` rewrites the 256×3 texture each frame.

## The port

D2d, the territory rule, the events and the shader machinery now live in the asset viewer:
- **`../asset-viewer/fog-layout.js`** (pure): #18's grid, the demo planets, the territory rule, the fog state over time and the cell texture.
- **`../asset-viewer/fog.js`**: the grid search, the fronts, the pulse, the uniforms, `driveFog()`, D2d's look and the look registry.

The viewer's hero planet carries the fog, with controls for on/off, charted share, chart one, refog one and chart all. The lab's other looks register through `registerFogLook()`, so every look draws through one shader path.

`viewer.js` gained `FOG_SPLICE` and `withFog()` (the hook, earlier), and `makePlanet()` takes an optional `{ fog }`. A spec's GLSL is spliced in before the surface's, cloud shadow's and each moon's `main()`, and wraps each body's colour after the artefacts and before the depth fade. Without a spec, `makePlanet()` builds exactly the shaders it did before.

**Evidence:**
- **The lab's outputs:** all 34 in `out/` were byte-identical before and after the move. A clean export of the pre-port commit and the ported lab rendered them, and `shasum` matched. That covers every direction's lineups, loops and events, and D2d as it was then (with the limb fix, before the cool veil).
- **One shader path, after the cool veil:** D2d now lives only in the viewer. `test/viewer-fidelity.test.mjs` renders the lab's D2d tile and the viewer's fogged hero in three cases (fully fogged, half charted, and mid "chart all") and finds 0 px different in each.
- **The viewer:**
  - **Shots:** the 25 `node shots.mjs` hashes match a fresh pre-change run. The hero is remade with fog only when fog is first turned on.
  - **Tests:** 29/29, including the new `test/fog.test.mjs`.
- **The asset library:** its fidelity suite passes (2/2).
- **The lab's own tests:** 17/17 (with the veil-tone check and the lab-vs-viewer fidelity test).

## Open questions and limits

- **The footprint lives in the renderer** (approved). It's derived each time from the layout's settlements, so territories shift when files come and go; the settlements themselves never move.
- **One glance can mislead.** Coverage is folder-clustered, so one face of a 50% planet can show 10% fog and another 78% (the F2 ranges). Over a turn the means track the true share, but two planets seen once rank right only 73–90% of the time at 25 points apart. Selecting a planet should show the count in words (as the health band does, §6 rule 5).
- **Distance.** At hero range a cell is about 9 px, so A's glyphs fit (and grow by whole pixels close up). On discs smaller than about 25 px radius the glyphs drop to one dot per cell. At full fade (about 10 px discs) fog is only a tint over part of the disc; health-looks found that bands don't read there either.
- **Events out of view.** A front that starts on the far side of the planet isn't seen. The scenes here pick start times that face the camera (`facingStart`). The product might turn the planet, or show the front on the selected planet's label.
- **Territory shares are uneven** (1–11 cells on `src` for an even share of 5–6). A file boxed in by others keeps only its own cell.
- **Fog covers artefacts.** In a fogged cell an artefact sector is fogged too, since fog draws over what it covers. It reappears when the file is charted.
- **Moons are whole files.** A fogged moon is fogged all over: in D2 it's one flat tone with D's equator line and, for D2b and D2c, the hatching. With 9 px and 5 px moons, only the big one is large enough for a glyph. Many moons at a glance isn't designed yet (§6).
- **D2c lifts the night side.** Its two light steps put a fogged parcel's night side one step below its lit tone, which is lighter than the clear night ground. That's part of why it reads so well (F2), but fog on the night side shows more than the terrain around it.
- **The mocks aren't real repos.** Folder weights, charting order and reasons are invented (`mock.js`). The real layout.json and fog view drop in where `mockPlanet` and `stateAt` are.
- **Cost isn't measured.** Per fragment the fog searches 77 of 256 cells (two texture fetches each) and, for C and D, resamples the terrain once. SwiftShader timings say nothing about real GPUs.
- **The dark pass breaks the filter rule.** D2d and D2e mix toward the space colour, which is a new colour on the planet, and only the human can wave that through (F8's "own ramp colours" share drops from 100% for them).
- **Repo weight:** out/ is about 27 MB with the dark pass. The four loop GIFs are 2.9–3.2 MB each and the four event GIFs about 0.5 MB each, at ×2. The first round's loop and event GIFs (A, A2, B, C, E) were dropped; their lineups and the comparison sheet stay.
