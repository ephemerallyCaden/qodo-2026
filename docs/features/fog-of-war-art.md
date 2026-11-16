# Feature: Fog of war (art)

## Status
Complete (art): cloud fog C6 replaces the dark veil (human, 2026-11-16); product drawing (#74) to follow

## Trigger
The human, 2026-11-09: "suggest more things to design and make", then "keep going" (2026-11-10). Fog of war is R5, the product's core signal. Its logic and chart state are in PR #50 (#33), which says "drawing fog waits for the art pass".

## Requirements
Data meaning (R5 and #33):
- [x] F1 **Per file.** Every file is a surface feature (a settlement on #18's surface cell grid). Each one is either **fogged** (some change since you last charted it isn't yours) or **charted**. Fog covers that file's cells, not the whole planet.
- [x] F2 **Coverage reads at a glance.** A planet's charted share (0% → 100%) is readable from its look. A fully charted planet is completely clear. This is private map coverage, never a score.
- [x] F3 (amended by the human: health reads on charted land only; fog hides it) **Health still reads through fog.** A fogged planet's health band (lava → toxic → ash → healthy) must stay identifiable under fog. Following the code layer's filter rule (art direction §9), fog reuses the colours of what it covers rather than painting over them. Measure it with the health-looks classifier.
- [x] F4 (uniform by default; reasons sheet in the lab) **Reasons, maybe.** #33 gives each fogged file a reason (agent, mixed, teammate, unknown, self-committed-agent-written, lineage-unknown). Explore whether fog shows the reason subtly (e.g. glyph choice) or stays uniform. The default is uniform; drones already show agent work.
- [x] F5 **Charting moment.** Charting a file clears its fog with a short wavefront (the §9 inverted-lightness wavefront; [OIII] teal allowed, as it's an event). Clearing a planet's last file can end in a small landing moment, but the flag and beacon are a later feature.
- [x] F6 **Refog.** A later change that isn't yours refogs the whole file, in a distinct "rolling back in" motion so it never looks like a glitch.
- [x] F7 **House rules:** live 3D through the pixel pass; glyphs are hand-drawn 5–8 px pixel glyphs (§9), never font text; deterministic; ambient drift loop-locked to 24 s; per-pixel depth fade; teal under 10% of pixels and only on events.
- [x] F8 **Works with everything else:** clouds, moons (test files can be fogged too), debris, drones and artefacts. It must not be mistaken for clouds, ash smoke, artefacts (glitch sectors) or the toxic band's smoke.

## Assumptions
- [x] (load-bearing for F1) The surface cell grid comes from #18 (PR #51): a 256-cell Fibonacci sphere with one settlement per cell. The lab matches it exactly. Because one cell per file leaves fog too small, the human chose territories in the renderer.
- [ ] The ASCII FX round-2 fog (a glyph field with an inverted wavefront) is a strong starting point: `feature/ascii-fx` 29c64a1 `mockups/ascii-fx/`, with renders in `.archive/art-iteration/07-ascii-fx/`. Its renderer is built at import, so it's a reference to re-implement in the viewer pipeline, not a module to import.

## Flow
Scan → fog view (#33) per file → fogged cells on each planet → you open a diff (or run `commet chart <file>`) → the wavefront clears that file's cells → when the last file clears, the planet is clear.

## Research
- The art direction §9 lists fog of war as a candidate: "fog of war as a glyph field: scene-tile slabs, with an inverted-lightness wavefront where teal helps most".
- #33's fog view: per-file fogged/charted state with reasons, plus per-planet counts.

**Exploration results (2026-11-11, 3c3946a on feature/fog-lab):** directions A glyph field, B unlit, C unrendered, D survey parcels, E mist and A2 (glyphs + parcels).
- **F1:** the shader matches #18's cells on all 55,411 checked pixels.
- **F2:** visible fog is 70/47/34/19/0% at 0–100% charted.
- **F3:** every direction keeps every band readable except B, where a fogged desert reads as toxic.
- **F7:** teal peaks at 0.19% during a clear and is 0 at rest.
- **F8:** fog stays locked to the terrain and uses only the planet's own ramp colours.

**Decided (human, 2026-11-11):**
- Direction **D · survey parcels**, refined to look more "unknown / unseen" (D2a blank map, D2b terra incognita, D2c veiled; being built).
- The 2 px parcel lines are a **fog-only exception** to the no-outlines rule, in the terrain's own colours.
- The fog footprint is a **territory per file computed in the renderer**: every surface cell is shared among the planet's files, grown from each file's own #18 cell. #18 is unchanged; territories reshape slightly as files are added.

**D2c (veiled), measured (ad04ea7); superseded by D2d:**
- **Look:** each fogged file's parcel is one flat tone from the band's own ramp (under the parcel's centre), lit in only two steps, with no terrain detail and no terminator crescents. Molten parcels smoulder in the glow's darkest step. On top: sparse dashed `\ /` hatching one step darker, drifting 1 px per 2 s (loop-locked), softened 2 px parcel lines in the terrain's own colours, and a single "?" on half the parcels of 7+ cells. Clouds and their shadows still pass over.
- **Events:** charting clears a file outward from its parcel's centroid (+8.1 px/s, a 1 px teal core and an inverted-lightness rim); a planet-clear pulse fires when the last file clears; refog closes inward (−3.7 px/s), with no teal.
- **Measured:** no disc misread or within a glance of another band; worst margin 0.039 at hero and 0.027 at far, fully fogged. Visible fog 65% fully fogged. Coverage ranked right 79% (25 points apart) and 91% (50 apart). Dark-look contrast 0.114. Teal 0 at rest, ≤0.19% during a clear. Fog never bulges and stays locked to the ground. Caveat: fogged lava sits near the ash-smoke colours (48–53% within 0.05), but shape and motion separate them.

**D2d approved as final (human, 2026-11-11), after a darker pass (D2d dark veil, D2e dark veil + band edges):**
- **Look:** fogged parcels are the ramp's darkest step mixed 65% toward space (82% on the night side), with faint hatching, a visible "?" and a dim outline.
- **F3 changes by design:** health doesn't read through fully fogged land. It reads on charted land and in the label. Partly charted planets must still read their band from the charted part.
- **Measured risks:**
  - the fogged limb merges toward space (63% of the lava limb ring within 0.03 of space, against 28% clear), so a limb fix is required before the port;
  - dark toxic sits near the lava crust ramp.

**Variant requested (human, 2026-11-14): the fog is the clouds themselves.** "We should try a variant where the fog is the clouds themselves, and the amount of cloud coverage shows the amount of known or unknown there is." Cloud cover rises with the uncharted share (clear planet at 100% charted, overcast at 0%), and charting clears clouds from over that file. Open design questions for the lab: what happens to a planet's ordinary seeded clouds (some bands have none: desert; lava has ash), whether fog clouds look like the normal clouds or a distinct heavier layer, and whether health can show through gaps (which would revive F3 partly). Compared against D2d, the current final.

**Cloud fog adopted (human, 2026-11-16), replacing the dark veil.** After seeing C1–C5 (overcast, storm over weather, broken cloud, storm front, stratus bands) beside D2d: "I like the white clouds, in the storm front style. We should have 0 clouds when a planet is 100% discovered now, and only have clouds proportional to how much is missing." Then: "remove the other fog attempt from the actual app but keep it in the asset gallery to show we had tried it."
- **C6 · white storm front:** C4's domed storm-front puffs in the cream cloud ramp, over each undiscovered file's territory, locked to the ground. Cover = 0.9 × the undiscovered share of the surface **cells** (each file's territory keeps the same 10% gap). Measured on the src demo planet (48 files, 256 cells): at 0/25/50/75/100% of files discovered the undiscovered cell share is 100/70/42/25/0% (the territory rule gives each file an equal share ±1 cell), so the cloud covers 90/63/39/22/0% of the surface (0.89–0.92 × the cell share).
- **Weather:** the cream weather (lush, ocean) is removed while fog is on (in the product, always); lava's ash and toxic's rust smoke stay (health cues). Ice and desert have none.
- **Events:** a clearing file's cloud turns [OIII] teal for the first ~0.6 s of its 1 s clear, then thins away (F5); a refog rolls cloud in from the far edge (2.4 s, no teal).
- **The bulge is kept** (the human's call): the cloud reads well past the silhouette, so a cloudy planet looks bigger than its LOC-based size.
- **Open:** test-file moons are not fogged under cloud fog (the veil fogged them); health shows through the gaps, so F3 partly revives.
- **Where:** `mockups/asset-viewer/fog-cloud.js` (pure: the variants, the placement, the gaps, the fronts) and `planet.setFogClouds()` in viewer.js (no shader hook; off by default). The dark veil (`fog.js` D2d) stays for the fog lab and the asset library's history.

## Tasks
- Exploration lab `mockups/fog-lab/` on `feature/fog-lab` (feature agent): 4–5 distinct fog directions on several bands and coverage levels (0/25/50/75/100% charted), with the clear and refog moments, measured against F3 and F8, for the human to pick.

## Completion
- Merged: feature/asset-library: 3dbfbc4 (the viewer's cloud fog C6, the fog lab's cloud looks) and 13ebffb (the library's fog is C6; its history keeps every fog tried); earlier 12588f7, 1eaa3ef and e66b737 (the dark veil D2d, now replaced). Pushed.
- Date: 2026-11-16 (the dark veil: 2026-11-13)
- Final look (human, 2026-11-16): **C6 · white storm front**, cloud over the undiscovered share (see above). It replaced the dark veil D2d (2026-11-11: cool blue-plum veil, halo limb, fogged haze), which stays in the asset library's history.
- C6 verification: fog off, `shots.mjs` byte-identical to e66b737 (19/19); the viewer's fog test (off is off, none at 100%, cover falls with discovery, no teal at rest, deterministic, loop-locked); library fog pixel-identical to the viewer in four cases (679 and 568 teal px mid-clear, none at rest); the lab's C6 pixel-identical to the viewer's in three cases; health-looks, drone-lab, debris-lab green.
- D2d verification (as recorded 2026-11-13):
  - fog-lab 17/17; viewer 31/31; library fog 4/4 with 4 fidelity cases at 0 px against the viewer (lush 50%, ocean fully fogged with haze, a mid-clear, a mid chart-all with teal); health-looks, debris-lab and drone-lab green.
  - Fog off: shots.mjs hashes identical to 968bc0c.
  - Measured: fog pixels near lava crust 0.0% (from 89.6% on toxic); limb ring merged into space 0.0%; health on charted land 0/48 misreads at 25/50/75% charted.
- For the product (#74): reuse `mockups/asset-viewer/fog-layout.js` (pure: #18's grid, the territory rule, the events, the cell texture) and `fog.js` (the D2d look and the haze rule); the colour and outline exceptions are in art direction §9.
