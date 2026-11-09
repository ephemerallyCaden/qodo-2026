# Feature: Space debris (art)

## Status
Research (design exploration)

## Trigger
The human, 2026-11-09: "let's start working on what a debris-filled planet would look like, should be modular to other planets."

Decided the same day: **debris owns all stale work** (stale PRs and stale branches). Rings no longer mean unmerged branches, which supersedes #18.

## Requirements
Data meaning (from R13 in `codebase-space-explorer.md`):
- [ ] D1 **One piece per stale item** touching the planet. There are four classes: stale PR (open, no activity for 14+ days), abandoned branch (unmerged, last commit 30+ days ago), merged-but-not-deleted branch, and orphaned agent worktree or branch. The class can be read from the piece itself, not only from a tooltip.
- [ ] D2 **Size follows diff size, and decay shows age:** fresh stale pieces are intact, then they rust, then they break into smaller fragments. There are at least 3 readable age steps.
- [ ] D3 **Modular:** debris is a modifier any planet can carry, on every health band, size and healthy look, with or without clouds and moons. It's one factory with a parameter set (count, classes, sizes, ages, seed), like the ring.
- [ ] D4 **Never mistaken for something else.** Debris must not read as a ring (an orderly band in planet colours), a moon (a warm sphere), an artefact (glyphs in the surface) or a drone. It must also not read as a health band: a lush planet with debris still reads as healthy.
- [ ] D5 **Scales from tidy to cluttered:** 0, 1, 3, 8 and 20+ pieces all read clearly, and the busiest case doesn't hide the planet's health band. Beyond a cap the rest is a counted number (as #18 does for moons).
- [ ] D6 **Sweep moment (R13):** when a piece's branch or PR is gone on the next scan, it breaks apart in a short animation. Design it as a one-shot that ends with no trace, and keep it out of the loop lock.
- [ ] D7 **House rules:** live 3D through the pixel pass, no sprites, outlines or dithering; at least 2 px features at 320×180; deterministic from a seed; loop-locked motion (a whole number of cycles per 24 s); depth-sorted against the planet, its moons and clouds; depth fade per pixel.
- [ ] D8 **Colour:** debris is man-made, so its colours come from the crew's BLK 36 gear and metal family, not the planet ramps (which belong to rings and clouds). BLK 36 has no true browns, so rust and decay use its warm reds and mauves (`#cc5250` `#872a38` `#8c4b63` `#66334b`). [OIII] teal appears only on an event (the sweep, or a selected piece).

## Assumptions
- [ ] Manufactured shapes (hull plates, girders, panels, canisters, a broken satellite) at 2–12 internal px can stay readable as junk rather than noise. The exploration tests this.
- [ ] A BLK 36 metal palette separates debris from rings well enough on every band (measure it, e.g. the share of debris pixels within a small colour distance of the planet's own colours).
- [ ] Clicking a piece (R13: age, last commit, creator, copyable cleanup command) is UI outside the pixel pass, and out of scope for this art feature.

## Flow
A scan finds stale items → each becomes a piece near the planet it touches → it drifts on a loose, tumbling orbit → it decays as it ages → when the item is gone it breaks apart (sweep) and disappears.

## Research
Rings already take the "thin band of chunky planet-coloured clumps" look (art direction §6), so debris needs a different silhouette, motion and colour family. R13 already asks for visible decay (rust, then broken pieces).

## Tasks
- Exploration lab `mockups/debris-lab/` on `feature/debris-lab` (feature agent): 4–5 distinct debris directions, each shown on several bands and sizes, from tidy to cluttered, for the human to pick. Then the picked direction becomes a viewer factory and an asset-library entry.

## Completion
- Merged: —
- Date: —
- Verification: —
