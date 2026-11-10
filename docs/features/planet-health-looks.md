# Feature: Planet health looks that inform

## Status
Research complete; fixes awaiting the human (2026-11-10)

## Trigger
The human, 2026-11-09: "planet looks are not just decorative, but make sure that they inform properly." Decided the same day: ocean and ice are alternate looks for the healthy band; gas giant and barren moon are library-only.

## Requirements
These are the legibility rules in the art direction §6, made measurable:
- [ ] H1 **Ordered:** the four bands (lava, toxic, ash, healthy) form one visual scale at a glance. Measured as the ordered reading: every step from lava to healthy is separated by at least one cue (lightness, warmth or glow), and no cue reverses beyond one JND. The strict reading (every cue separates every step) can't pass by design, because neither ash nor healthy glows.
- [ ] H2 **Healthy looks group together:** lush, ocean and ice sit closer to each other than to ash, measured as a colour and texture distance on renders over several seeds. If ice reads as stale (it falls nearer ash), the report says so and proposes a fix.
- [ ] H3 **Distance and size:** H1 and H2 still hold at the smallest planet size, at the far depth levels (full fade), and with clouds and artefacts on.
- [ ] H4 **Colour-vision deficiency:** H1 and H2 still hold under simulated protanopia, deuteranopia and tritanopia (a standard simulation matrix, documented).
- [ ] H5 **Seed variety:** across 20+ seeds per band, no seed of one band measures as another band.
- [ ] H6 **A lineup a person can check:** one sheet with the bands in order, the healthy looks together, at hero, mid and far distance, plus each measurement in text (Qodo can't see images).

## Assumptions
- [ ] Simple render statistics (OKLab lightness, chroma and hue; emissive-pixel share; texture contrast) are enough to separate the bands. If they aren't, the report says which pair is confusable.
- [ ] Palette changes that come out of this need the human's sign-off before they reach the art direction (as #19 did).

## Research
- Toxic was redesigned as the ember band (#19) with a lineup lava → toxic → ash → lush (`mockups/toxic-band/lineup.mjs` on `feature/19-toxic-band`).
- Band thresholds and inputs (debt markers per 1k LOC, opt-in Qodo findings) are #17 and #18, built on the product line.

- **Results (2026-11-10, a422f73 on feature/health-looks; 6 looks × 24 seeds × 8 conditions × 4 visions = 4608 measurements):**
  - H1 FAIL: warmth reverses at toxic → ash (desert +0.084 vs toxic +0.052); lightness is flat at ash → healthy.
  - H2 pass (margin +0.045). Disproved: ice does NOT read as stale; it's the healthy look farthest from ash.
  - H3 FAIL: at the 0.88 fade, toxic, ash and healthy collapse together and only lava reads. The fade causes it, not the size.
  - H4 FAIL: under protanopia and deuteranopia at small sizes, lush drifts toward ash.
  - H5 pass. H6 pass.
- **Proposals (none applied):** P1 cap the planets' far fade at 0.72 (fixes H3, 12/12 byte-exact emulation); P2 a darker, dustier ash (fixes H1 and H4, but brings ash near toxic at far); P3 rule-1 wording (applied to art direction §6).

## Tasks
- Verification lab `mockups/health-looks/` (feature agent, branch `feature/health-looks`): renders, measurements and a report. It makes no palette changes, only proposals.

## Completion
- Merged: —
- Date: —
- Verification: —
