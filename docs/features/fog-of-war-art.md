# Feature: Fog of war (art)

## Status
Research (design exploration)

## Trigger
The human, 2026-11-09: "suggest more things to design and make", then "keep going" (2026-11-10). Fog of war is R5, the product's core signal. Its logic and chart state are in PR #50 (#33), which says "drawing fog waits for the art pass".

## Requirements
Data meaning (R5 and #33):
- [ ] F1 **Per file.** Every file is a surface feature (a settlement on #18's surface cell grid). Each one is either **fogged** (some change since you last charted it isn't yours) or **charted**. Fog covers that file's cells, not the whole planet.
- [ ] F2 **Coverage reads at a glance.** A planet's charted share (0% → 100%) is readable from its look. A fully charted planet is completely clear. This is private map coverage, never a score.
- [ ] F3 **Health still reads through fog.** A fogged planet's health band (lava → toxic → ash → healthy) must stay identifiable under fog. Following the code layer's filter rule (art direction §9), fog reuses the colours of what it covers rather than painting over them. Measure it with the health-looks classifier.
- [ ] F4 **Reasons, maybe.** #33 gives each fogged file a reason (agent, mixed, teammate, unknown, self-committed-agent-written, lineage-unknown). Explore whether fog shows the reason subtly (e.g. glyph choice) or stays uniform. The default is uniform; drones already show agent work.
- [ ] F5 **Charting moment.** Charting a file clears its fog with a short wavefront (the §9 inverted-lightness wavefront; [OIII] teal allowed, as it's an event). Clearing a planet's last file can end in a small landing moment, but the flag and beacon are a later feature.
- [ ] F6 **Refog.** A later change that isn't yours refogs the whole file, in a distinct "rolling back in" motion so it never looks like a glitch.
- [ ] F7 **House rules:** live 3D through the pixel pass; glyphs are hand-drawn 5–8 px pixel glyphs (§9), never font text; deterministic; ambient drift loop-locked to 24 s; per-pixel depth fade; teal under 10% of pixels and only on events.
- [ ] F8 **Works with everything else:** clouds, moons (test files can be fogged too), debris, drones and artefacts. It must not be mistaken for clouds, ash smoke, artefacts (glitch sectors) or the toxic band's smoke.

## Assumptions
- [ ] (load-bearing for F1) The surface cell grid's geometry and size per planet come from #18 (PR #51, `feature/18-layout`). The lab mocks files on cells the same way #18 lays them out, and matches its cell count and arrangement.
- [ ] The ASCII FX round-2 fog (a glyph field with an inverted wavefront) is a strong starting point: `feature/ascii-fx` 29c64a1 `mockups/ascii-fx/`, with renders in `.archive/art-iteration/07-ascii-fx/`. Its renderer is built at import, so it's a reference to re-implement in the viewer pipeline, not a module to import.

## Flow
Scan → fog view (#33) per file → fogged cells on each planet → you open a diff (or run `commet chart <file>`) → the wavefront clears that file's cells → when the last file clears, the planet is clear.

## Research
- The art direction §9 lists fog of war as a candidate: "fog of war as a glyph field: scene-tile slabs, with an inverted-lightness wavefront where teal helps most".
- #33's fog view: per-file fogged/charted state with reasons, plus per-planet counts.

## Tasks
- Exploration lab `mockups/fog-lab/` on `feature/fog-lab` (feature agent): 4–5 distinct fog directions on several bands and coverage levels (0/25/50/75/100% charted), with the clear and refog moments, measured against F3 and F8, for the human to pick.

## Completion
- Merged: —
- Date: —
- Verification: —
