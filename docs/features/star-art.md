# Feature: The star (art)

## Status
In Progress

## Trigger
The human, 2026-11-11, pointing at the Day 1 hype GIF (`.archive/docs/hackathon/day1-images/art-1-system-loop.gif`): "look at the sun in this render, we want to make it like this not whatever the star system is now."

Today the product view (PR #55) draws the star unlit, in three flat glow bands from the lava glow ramp. The asset viewer has no star at all.

## Requirements
- [ ] S1 **The Day 1 look:** a banded pixel sphere with a hot cream-white core shading through yellow and orange to a deep red-orange limb and a dark-red rim (limb darkening). Its surface churns with granulation (fbm), so it never looks flat. Reference: the D1 star, `feature/day1-gifs:mockups/day1-gifs/star.js` (see Research).
- [ ] S2 **Corona, house-rule version:** the D1 corona is already undithered (flat crown + halo bands); the older hype-gif corona dithered. Dithering is banned (art direction §3), so any corona is flat colour bands with a lumpy, ray-modulated edge that bulges past the disc, like clouds do. Render it with and without, so the human can choose.
- [ ] S3 **Palette:** the star's ramp comes from the world (v2) family, e.g. the lava glow `#d63c1a #ff8a1e #ffe066` topped with cream `#fffaf0`, with a deep crimson limb. It must not be mistaken for a lava planet (it's emissive everywhere, has no crust, and is bigger). Teal is never on the star.
- [ ] S4 **Motion:** the granulation turns and churns loop-locked to the 24 s loop (whole cycles), with no visible seam.
- [ ] S5 **House rules:** live 3D through the pixel pass; nearest pixels; no outlines or dithering; deterministic; per-pixel depth fade at **0.15** strength (decided 2026-11-11). It reproduces the GIF's colours exactly at its scale, whereas lava glow's 0.5 turned the cream core grey (#adabb4) and the star read as a dull ember. It still fades with distance, just less.
- [ ] S6 **Meaning:** one star per repo, a constant look (no data in its colour). Root files and unmatched tests are moonlets around it (#18); the star's moonlets reuse the moon look.
- [ ] S7 **In the asset viewer and library:** a `makeStar` factory in the viewer (the source of truth), a Star group in the library (the star alone, with moonlets, and a small system shot with planets), inspector controls (size, spin, granulation, corona on/off), and library renders pixel-identical to the viewer's.

## Assumptions
- [ ] **Open (for the human):** the art direction keys the planets' light top-left at about 40° for close-ups. With the star in frame (system view), the planets' lit sides should face the star. That's a product view decision (PR #55) to settle with the camera work; out of scope here.

## Research
- **Day 1 sun (the GIF's actual source):** `feature/day1-gifs:mockups/day1-gifs/star.js` (fd931c1, the "D1 star"). It already reuses the viewer's noise and depth GLSL and is undithered. Measured at internal resolution: disc `#c9361a #ff761a #ffc93c #fff0b8 #fffaf0` (the viewer's glow ×3, the sand top, the cloud top), corona crown `#c9361a` + halo `#481a18`, with band radii core ρ<0.44, cream <0.69, yellow <0.87, orange <0.96. D1 used a 0.15 depth fade (at half strength its core went grey at 25 units). The older `feature/hype-gif:mockups/day1-hype/scene.js` STAR_FRAG dithers and isn't the source.
- Product star today: PR #55 `web/src/render/shaders.ts` `STAR_FRAG` ("unlit, three glow bands from the limb in"), using `palette.world.glow`.

## Tasks
- Star in the asset viewer + library (feature agent, `feature/star`).

## Completion
- Merged: —
- Date: —
- Verification: —
