# Feature: Space debris (art)

## Status
In Progress (direction picked; refining)

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
- [x] Manufactured shapes stay readable as junk rather than noise, at 8.5–16 internal px (measured).
- [x] A BLK 36 metal palette separates debris from rings on every band (0% within 0.05). Caveat: it sits close to the polar cap on lush and ocean.
- [ ] Clicking a piece (R13: age, last commit, creator, copyable cleanup command) is UI outside the pixel pass, and out of scope for this art feature.

## Flow
A scan finds stale items → each becomes a piece near the planet it touches → it drifts on a loose, tumbling orbit → it decays as it ages → when the item is gone it breaks apart (sweep) and disappears.

## Research
Rings already take the "thin band of chunky planet-coloured clumps" look (art direction §6), so debris needs a different silhouette, motion and colour family. R13 already asks for visible decay (rust, then broken pieces).

**Exploration results (2026-11-10, ce3e46f and dfa75a4 on feature/debris-lab):** directions A derelicts, B junkyard, C scrap blocks, D tagged canisters and E wake. 0% of debris pixels sit within 0.05 OKLab of the ring, moon, lava or toxic ramps, or of the drone tells. With 24 items the health-band classifier still picks every band. A's class can be read from its silhouette 83% of the time while tumbling (chance is 25%). 2 px features need pieces 8.5–16 px long at hero range (the 2–12 px guess was too small). The gear hull puts 27% of A's pixels within 0.03 of the polar cap #3f4590 on lush and ocean.

**Decided (human, 2026-11-10):** direction **A**, refined: "make them Grey and red, to really be noticeable and look more like satellite pieces. You can add in solar panel pieces and actual satellite looking pieces." Hull: the gear blue-grey. Red becomes deliberate paint, so age needs a cue that doesn't rely on red.

## Tasks
- Exploration lab `mockups/debris-lab/` on `feature/debris-lab` (feature agent): 4–5 distinct debris directions, each shown on several bands and sizes, from tidy to cluttered, for the human to pick. Then the picked direction becomes a viewer factory and an asset-library entry.

## Completion
- Merged: —
- Date: —
- Verification: —
