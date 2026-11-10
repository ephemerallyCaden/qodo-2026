# Health looks: do the planet looks inform?

A measurement lab for [`docs/features/planet-health-looks.md`](../../docs/features/planet-health-looks.md) (H1–H6, on `docs/art-meaning`). A planet's look encodes its code health, worst to best **lava → toxic → ash (the desert look) → healthy**, and the healthy band has three looks picked by seed: **lush, ocean and ice** (art direction §6, "What a planet tells you"). This lab renders every look the way the product would and measures whether the bands read as one ordered scale, whether the healthy looks read as one band, and whether both survive distance, size, overlays and colour-vision deficiency.

It measures only. It changes no palette, ramp or viewer code; fixes are proposals for the human (as #19 was). A throwaway mockup, not product code.

- **Results:** [`REPORT.md`](REPORT.md) (generated: every verdict and number), [`measurements.csv`](measurements.csv) (every render × vision), the sheets in [`sheets/`](sheets/), and [`PROPOSALS.md`](PROPOSALS.md) (the fixes, measured).
- **Findings and proposals:** [below](#findings-and-proposals).

## Run

```sh
npm ci
npm run measure   # node measure.mjs: ~1350 renders, 15-40 min on a loaded machine; writes measurements.csv, sheets/*.png, REPORT.md
node proposals.mjs --ash 0.7:0,0.6:-0.05,0.6:-0.1   # the fixes, measured (reads measurements.csv): PROPOSALS.md, ~800 renders
node trial-sheet.mjs   # sheets/lineup-trial.png: the lineup with P2's dustier ash beside the shipped ash, numbers from PROPOSALS.md (~60 renders)
npm test          # unit tests (Node) + render tests (headless Chromium + SwiftShader)
```

`node measure.mjs --seeds 4 --conditions hero,full --workers 1` runs a subset; the conditions must include `hero`, the baseline for H1, H2, H5 and H3's comparison. `node measure.mjs --report` rebuilds REPORT.md from measurements.csv without rendering. Rendering goes through the asset library page by Playwright request interception and the library's own file allowlist (`../asset-library/routes.mjs`, imported read-only), with three from this folder's `node_modules`. No socket is opened and any other request is aborted. There's no dev server.

## What's rendered

Every planet is built by the asset viewer's factories through `window.library.set()`, exactly as `mockups/toxic-band/lineup.mjs` does: what's measured is what ships (the library is pixel-identical to the viewer, and its fidelity test checks that). The frame is 320×180 internal pixels, paused at t = 3 s, with the final palette and the shipped depth fade (pixel-smooth). Rings are off (they're out of the product view); clouds are each biome's own weather at its shipped cover.

| | |
|---|---|
| Looks | lava, toxic, desert (the ash band), lush, ocean, ice. Gas giant and barren moon are library-only, so they're out of scope |
| Seeds | 1–24 for every look (H5 asks for 20+ per band; the healthy band gets 72) |
| Conditions (H3) | `hero` (the viewer's planet framing: an 82 px disc, fade 0.18), `mid` (d 12, fade 0.45), `far` (d 21.3, depth level 2: fade 0.72), `full` (d 56: full fade 0.88 on a ~10 px disc, the art direction's worst case), `small` (the library's smallest size, 0.25, at the hero distance), `small-far` (size 0.25 as a ~10 px disc), `overlays` (hero plus both moons and artefacts at the auto count, teal off), `overlays-full` (the same at full fade) |
| Visions (H4) | normal, protanopia, deuteranopia, tritanopia |

The cameras sit on the hero view's line (`VIEWS.planet`), so the light falls the same way in every condition. `lab.mjs` holds these inputs, and `test/lab.test.mjs` checks the constants it copies from `viewer.js` (field of view, hero camera, depth-fade range and strengths).

## The measurements

Each render is measured on the planet's pixels: every pixel that differs from the same camera's empty frame (all planet layers hidden), within 1.12 radii of the disc centre. So stars and space never count; clouds, the haze, moons in front of the disc and artefacts do. Colours are converted to **OKLab** (Ottosson 2020), a perceptual space where a Euclidean step of about 0.02 is a just-noticeable difference, so lightness, colour and texture share one unit.

| Statistic | Definition | Why it stands for "reads as" |
|---|---|---|
| **lightness** `L` | Mean OKLab L over the disc | What a small or distant disc integrates to; the "darker" in "worse is hotter and darker" |
| **warmth** `warm` | The mean colour's projection on the warm axis: OKLab (a, b) onto the hue of the lava glow's body colour (`glow[1]` `#ff761a`, h ≈ 47°) | How much fire-coloured colour the disc shows. Neutral pixels add nothing; blues and greens subtract. The pole is read from the shipped ramps, not fitted |
| **glow** `glow` | The share of the disc painted by the emissive ramp and at least 0.1 L lighter than the median of the rest | Light the planet makes itself. The emissive pixels are found exactly: each lava render is repeated with the glow ramp swapped for sentinel colours (a palette edit), and the pixels that change are the ones it painted. The statistics are always taken on the shipped pixels |
| chroma `C`, hue | Mean per-pixel OKLab chroma; the hue angle of the mean colour | Colourfulness, and which colour family |
| texture `Lsd`, `edge` | The standard deviation of L; the mean \|ΔL\| between 4-adjacent planet pixels | Value contrast and fine structure: cracks, crater rims, cloud edges |

**Why the glow measure is exact and not a heuristic.** Two heuristics were tried first and rejected on renders. "Bright pixels on the night side" counted ice, whose night side is light (the ice ramp is bright even unlit), and sunlit clouds past the terminator (the cloud bands stay lit to n·l = −0.3). "Bright and saturated against the planet's base" counted lush's lime highlights. Only the lava branch of the planet shader reads the glow ramp (`bool glow = uBiome == 4`, checked by `test/lab.test.mjs`), and `test/render.test.mjs` checks that the sentinel edit leaves lush and toxic pixel-identical. Toxic's ember veins aren't emissive in the shader (they're its ground ramp's top step), so they show up in texture, not in glow.

**The look vector** is `[L, a, b, C, Lsd, edge, glow]`. All but glow are in OKLab units; glow is a share of the disc, so 5% of the disc glowing weighs as much as a 0.05 colour step. Distances are Euclidean, with no per-feature scaling fitted to the data.

**Colour-vision deficiency** uses Machado, Oliveira & Fernandes, "A Physiologically-based Model for Simulation of Color Vision Deficiency" (IEEE TVCG 15(6), 2009), with the severity-1.0 (dichromat) matrices in linear RGB, clamped. The same pixels are measured under each matrix, so the mask doesn't move, and neither do the emissive pixels.

## The checks

| | Check | Threshold |
|---|---|---|
| **H1** ordered | For each neighbouring pair of bands (lava→toxic, toxic→ash, ash→healthy) and each of lightness (should rise), warmth (should fall) and glow (should fall): the band-mean **step** in the expected direction, and the **gap** between the two bands' seed ranges (negative = overlap). H1 passes when **no statistic reverses** and **every step is separated by at least one statistic**: the seed ranges don't overlap and the means differ by at least the glance floor | A step of −0.02 or worse (one JND against the expected way) is a reversal; a smaller one is flat. Separation needs gap > 0 and step ≥ 0.05. "Neither band glows" (ash, healthy) is a flat tie, not a reversal |
| | *Strict reading*, reported alongside: every statistic separates every step | Can't pass by design: ash and healthy both have no glow |
| **H2** grouped | Centroids of each look over its 24 seeds. The largest distance between two healthy looks must be smaller than the smallest distance from a healthy look to ash (desert), and that one at least the glance floor. Each healthy look is also flagged if it sits nearer ash than its nearest sibling (the "ice reads as stale" risk) | 0.05 |
| **H3** robust | Check by check: every H1 step and H2 that holds at `hero` (normal vision) still holds at every other condition. A step that already fails at `hero` is H1's failure and is listed, not counted again | as H1, H2 |
| **H4** CVD | Check by check: every H1 step and H2 that holds for normal vision at a condition still holds under each simulated deficiency there (so H4 isolates the deficiency; failures from distance are H3's) | as H1, H2 |
| **H5** seeds | Each seed is read as the band of its nearest look centroid, with its own look's centroid computed without it (leave-one-out). It fails if that's another band, or if another band's look centroid is within the glance floor of it (confusable at a glance). The verdict is at `hero`; every condition and vision is reported | 0.05 |
| **H6** sheet | `sheets/lineup.png`, `sheets/lineup-cvd.png`, `sheets/seeds.png` exist, with every number in `REPORT.md` | — |

**The glance floor (0.05) and the reversal tolerance (0.02).** Two separate small discs seen at a glance need more than a just-noticeable difference (about 0.02 in OKLab for touching patches). 0.05 is 2.5 JND, a lenient floor that favours the design. A reversal has to be visible, so a step against the expected way counts only from one JND; the first full run used half a JND (0.01), and the one thing that changes is noted under H4 below. The report prints raw steps and distances, so a stricter reading can be applied to it. The tolerance and floor live in `analyse.mjs`, the glow lift and disc reach in `metrics.mjs`.

## Sheets (`sheets/`)

| File | Shows |
|---|---|
| `lineup.png` | The bands in order with the three healthy looks together, one row per condition (hero, mid, far, full, small, small-far, overlays, overlays-full). Each tile is the typical seed of its look (the one nearest its centroid at hero), cropped and upscaled by a whole factor (the factor is in the row label). Under each tile: L, warmth, glow, and the band it measures as |
| `lineup-cvd.png` | The same at hero and at full fade under each simulated vision |
| `seeds.png` | All 24 seeds of every look at hero and at full fade, with misread or confusable seeds marked |
| `lineup-trial.png` | `lineup.png` with a **desert (trial)** column after desert: P2's dustier ash (the asset library's `dusty-ash` trial look, the same pixels as P2's palette edits) on the desert's typical seed. Under it are PROPOSALS.md's numbers for that variant, normal vision: the hero means, then per condition H2's margin, H5's closest look and H1's failing steps. Written by `trial-sheet.mjs`, not `measure.mjs`; nothing is measured anew |

## Files

| File | What |
|---|---|
| `lab.mjs` | Looks, bands, seeds, conditions (and the named baseline and full-fade ones), library states, the viewer constants |
| `metrics.mjs` | OKLab, the Machado matrices, disc geometry, `measure()` |
| `analyse.mjs` | `checkH1`, `checkH2`, `checkH5`, and the wording every report uses for them |
| `report.mjs` | Verdicts (H3 and H4 check by check), `REPORT.md`, `measurements.csv` |
| `sheets.mjs` | The sheet layouts (the lineup takes an optional trial column) |
| `harness.mjs` | Headless Chromium + SwiftShader, the library page, renders (pixels cross as base64), a browser pool, PNG encoding |
| `measure.mjs` | The run |
| `proposals.mjs` | The fixes, measured: an exact emulation of the full-distance fade, and ash-look variants by palette edit |
| `trial-sheet.mjs` | `sheets/lineup-trial.png`: the lineup with the asset library's dustier-ash trial beside the shipped ash, and the parser for its PROPOSALS.md numbers |
| `test/` | `metrics`, `analyse` and `lab` tests (Node); `render.test.mjs` (browser): renders aren't empty and the mask is the disc, renders are deterministic, the sentinel touches lava only, and `measurements.csv` matches a fresh render |

## Findings and proposals

From the full run (4608 measurements; every number below is in `REPORT.md` or `PROPOSALS.md`). Hero means, normal vision:

| band | lightness | warmth | glow | ground L |
|---|---|---|---|---|
| lava | 0.420 | +0.060 | 0.376 | 0.217 |
| toxic | 0.438 | +0.052 | 0 | 0.431 |
| ash (desert) | 0.643 | **+0.084** | 0 | 0.668 |
| healthy (lush / ocean / ice) | 0.639 (0.664 / 0.596 / 0.658) | −0.054 | 0 | — |

| | Result | What fails, and by how much |
|---|---|---|
| **H1** | **FAIL** | At hero, every step is separated by one cue: lava→toxic by glow (+0.376, ranges 0.276 apart), toxic→ash by lightness (+0.205), ash→healthy by warmth (+0.138). But **warmth reverses at toxic→ash**: the desert shows more warm colour than toxic (+0.084 vs +0.052, a −0.032 step, ranges overlapping by 0.039). The ash band is the warmest-looking surface in the scale, against "worse is hotter". Lightness is flat at ash→healthy (−0.004): healthy isn't lighter than ash, so that step rests on warmth alone |
| **H2** | pass | At hero the healthy siblings are ≤ 0.095 apart and the nearest healthy look is 0.139 from ash (margin +0.045). **Ice doesn't read as stale:** it's the healthy look farthest from ash (0.191). The weakest is **lush** (0.139), whose green land is the healthy colour nearest the desert's tan |
| **H3** | **FAIL** | (1) **Full fade erases the bands.** At d ≥ 44 (fade 0.88) on a 10 px disc, toxic, ash and the three healthy looks land within about 0.05 of each other in lightness and colour (L 0.243–0.287, chroma 0.027–0.052). 120 of 144 seeds are within a glance of another band, and the nearest healthy look is 0.032 from ash. Only lava survives, because its glow fades at half strength. The art direction's own worst case (§6 rule 3) fails. The fade causes it, not the size: the smallest planet as a 10 px disc at fade 0.53 (`small-far`) passes H2 and H5. (2) **lava→toxic lightness reverses beyond hero** (mid −0.038, far −0.083, full −0.113): the half-strength glow keeps lava bright while toxic fades. Lava's ground stays darker than toxic's (0.22–0.26 vs 0.24–0.43), and read on the ground the reversal disappears at every condition. Overlays (moons and artefacts) lose nothing |
| **H4** | **FAIL** | Red-green deficiency at small sizes: **lush moves toward ash** because its land turns olive-tan. Protanopia, smallest size: H2 margin −0.008 (lush–desert 0.117 vs ocean–ice 0.125); deuteranopia −0.001; protanopia `small-far` −0.001. Protanopia at far: ash→healthy warmth step +0.044, under the glance floor. Tritanopia loses nothing. At the half-JND tolerance of the first run, deuteranopia also read ash→healthy lightness as reversed at hero, mid and small (−0.017, below one JND) |
| **H5** | pass | At hero 0 of 144 seeds misread, none within a glance; the closest is lush seed 14, 0.131 from desert. It passes at every condition except `full` and `overlays-full` (see H3) |
| **H6** | pass | `sheets/lineup.png`, `sheets/lineup-cvd.png`, `sheets/seeds.png`; numbers in `REPORT.md` |

**The assumption holds.** Simple render statistics separate the bands wherever a person could. Where they don't (full fade), the sheets show dim dots that are just as hard to tell apart by eye.

### Confusable pairs

1. **toxic ↔ ash on warmth** at every condition but full fade. Ash has the more saturated warm colour.
2. **lava ↔ toxic on lightness** from mid distance on. This one is by design (the glow is meant to stay bright), but rule 1 ("darker") doesn't say so.
3. **toxic ↔ ash ↔ healthy at full fade** (10 px, fade 0.88): toxic→ocean, desert↔lush, ice→desert and ice→toxic are all under 0.05.
4. **lush ↔ ash under protanopia and deuteranopia** at the smallest size.

### Proposals (for the human; none applied)

| | Change | Measured effect | Cost |
|---|---|---|---|
| **P1** | **Cap the planets' far fade at 0.72** (depth level 2) instead of 0.88. It's a depth constant in the viewer (§5); the crew could keep 0.88 | Measured on the 10 px full-distance disc with an exact emulation (12/12 renders byte-identical to the shipped fade at 0.88). H2 passes (nearest healthy→ash 0.066, margin +0.020) and H5 passes (0 within a glance, closest 0.058). Only the glow's lightness reversal is left in H1. Under protanopia, 1 seed comes within a glance (0.045). **0.8 is not enough:** 12 seeds within a glance, and H1 ash→healthy unseparated | Distant planets keep more colour, so depth reads a little less strongly. The fade was the human's pick |
| **P2** | **A darker, dustier ash band:** the desert's `sand` and `rock` ramps at OKLab chroma ×0.6 and lightness −0.1, hue kept: `sand #422718 #774e33 #a57d56 #c1a67e #d8cfaf`, `rock #110805 #2c1b13 #513728 #785d46` | Fixes H1 at hero under every vision. Ash's warmth drops to +0.048 (below toxic's +0.052), and both of its steps become separated by lightness (0.555 between toxic 0.438 and healthy 0.639). Widens H2 at hero (margin +0.045 → +0.062) and at the smallest size (+0.013 → +0.023). Fixes **H4's small-size failures** too (protanopia +0.026, deuteranopia +0.007) | **At far (fade 0.72, 27 px) ash comes within a glance of toxic** (29 seeds; toxic→ash unseparated), because the fade compresses lightness. The milder variants trade differently and are worse overall: C×0.7 (chroma only) breaks H2 at the smallest size (−0.005); C×0.6 L−0.05 breaks it under protanopia and deuteranopia (−0.006, −0.015). The ash band's look changes from sunny desert to dusty ash, which matches its name |
| **P3** | **Wording, no palette change.** Rule 1 reads "worse is hotter and darker": say that "darker" means the ground, since lava's glow stays bright with distance by design. Also say that toxic and ash are both warm and are told apart by lightness | With lightness read on the non-emissive ground, the lava→toxic reversal disappears at every condition. Warmth would then order only ash→healthy (warm → cool) | Doesn't fix the full-fade collapse (P1) or the red-green small-size grouping (P2) |

P1 and P2 together, at 0.72 on the 10 px disc: H2 passes (+0.020) and H5 passes for normal vision and tritanopia; protanopia and deuteranopia have 1 seed within a glance. The far-distance toxic↔ash confusion from P2 stays, because the cap doesn't change `far` (already 0.72). So **P1 is the clear recommendation; P2 needs the human's call between the hero/small gains and the far-distance cost**, or a further ash variant. P3 should go with either. Any palette or depth change needs the human's sign-off before it reaches the art direction (as #19 did).
