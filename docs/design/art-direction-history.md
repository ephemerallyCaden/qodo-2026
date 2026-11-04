# Art Direction History: Commet

*How the settled style in `art-direction.md` was reached: a decision log, most recent last. `art-direction.md` is the source of truth; this file is context only.*

## History

*The original decisions came from the human's design Q&A on 2026-11-03.*

### References
- **Planets:** Daniel Linssen, *Planetarium* (managore.itch.io/planetarium). Keep all of its elements: pastel palette, puffy cream clouds that spill past the silhouette, scattered-pixel rings, single-pixel starfield, tiny lowercase pixel font.
- **Resolution / pixel feel:** *A Short Hike*. No public default internal resolution; it scales by a factor (presets 125–250%, "big and crunchy" at lowest). Uses a soft outline effect; no source mentions dithering. We default to 320×180 with a live slider so the human can tune by eye.

### Initial decisions (2026-11-03, largely superseded)
| Area | Decision |
|---|---|
| Asset format | **Live 3D only.** three.js meshes and shaders with a pixel post-process. No sprite sheets or pre-rendered 2D. |
| Planets | Procedural shader planets (sphere, noise, palette-quantised bands, separate cloud and ring layers). |
| Planet meaning | Health shown as biome: lush with clouds = healthy, tested, active; ocean/ice = stable, rarely touched; desert/crater = stale, low coverage; lava = churn/bugfix hotspot; rings = shared lib with many dependents; size = LOC. |
| Palette | Planetarium pastels kept, plus **depth**: distant objects fade toward the dark space colour (about -35% value and cooler hue at mid range, about -70% far, almost silhouettes), snapped to palette steps with no smooth gradients. Planetarium had no depth cue; this is the "darker" ask. |
| Astronaut | Procedural 3D from primitives, pixel-filtered like everything else. Chunky toy proportions: oversized round helmet (~40% of height), reflective visor, stubby limbs, boxy backpack. Cream/pastel suit; visor and backpack stripe carry the contributor colour. |
| Outlines | None, matching the references. |

### Scope: batch 1 (for review before any GIF)
One lush planet (clouds + optional ring) and one astronaut in 3 contributor colours, in a live viewer page: orbit camera, pixel post-process, depth darkening (show a near and a far copy to prove it), seed slider. Screenshots go to the human for sign-off. Other biomes come after approval. The GIF comes after that.

### Revision 1 (human review of batch 1, 2026-11-03)
- Clouds: closer to Planetarium. More, smaller, slightly flattened clumps, still breaking the silhouette.
- Ring: thin band; dots always 1 internal pixel.
- Depth: 4 steps per object; the furthest are near-black silhouettes.
- Astronaut: bluer cool-white suit; unified self-shadowing across parts (limbs shadow the body); each limb is one continuous bent tube with an elbow or knee, in a relaxed pose; visor is 2-tone near-black blue plus a white glint (no contributor colour on the visor). Contributor colour (coral/mint/lilac) moves to the backpack stripe and one trim.

### Revision 2 (human review, 2026-11-03)
- Astronaut body, limbs, self-shadowing and contributor shoulder bands are approved.
- Clouds: noise-clustered with varied sizes (merged masses, streaks, scattered puffs, empty regions), not an even scatter.
- Visor: wide letterbox shape, 2 near-black blue tones plus a white glint.
- Palette: more vibrant overall (less pastel). Space is much darker, near-black with a blue-plum hint. Depth fade re-tuned to match.
- Revision 2 addendum: visor is a ~4:3 monitor-screen ratio (replaces letterbox). ASCII faces from ApprenticeHack's avatar-renderer.js (eye-pair plus mouth glyphs in the contributor colour, screen-glow, deterministic per handle) are drawn as crisp pixel glyph bitmaps on the 3D visor. Head bigger (~45–50% of height), body smaller.

### Revision 3 (human review, 2026-11-03)
- Approved: 4:3 screen visor and the bigger-head proportions. Faces shrinking at a distance is accepted.
- Glint: small, in the screen's top-left corner, never over the face.
- Faces: use ApprenticeHack **V2 eye designs** (eyes only, no mouths, not ASCII glyphs). Source being located.
- Palette v2 rejected (lost cohesion, too Earth-like). Choosing from 25 mockups, each mapped strictly to an existing published pixel-art palette.
- Revision 3 addition: chibi proportions, with much shorter stubby limbs (still single bent tubes) and the torso re-tuned to match.

### Revision 4 (human, 2026-11-03, relayed via session qodo-2026-ff)
- Palette: astronauts, space, stars and depth use **BLK 36** (#19 on the contact sheet). Planets use the Earth-like v2 ramps (lush, plus naturalistic ramps for the other biomes).
- Eyes: drawn resolution-independent (per-fragment shapes on the visor), pixelated only by the render pass. Not pre-rasterised.
- Planet variety: 6 health biomes plus extras (gas giant, barren moon, toxic), with size from LOC.

### Revision 5 (human, 2026-11-03)
- The Planetarium vibe isn't nailed yet. New refs are in `refs/` (planetarium-teal-ring.png; vibe-neon-ring-gif-frame.png). A scout is measuring the differences.
- Space: BLK 36 near-black plus a subtle vertical gradient to deep BLK 36 navy/violet, quantised into 3–4 bands.
- ASCII/cyberbrutalist flourishes: a custom pixel glyph set (5–8 px; ◎ ✕ ▢ + · hatching, blocks, code glyphs) in one acid "system" accent (lime by default, [OIII] teal variant). Concepts mocked up as animated loops: fog of war as a glyph field, darting glitch packets, static planet artefacts, ASCII post-shader modes. Refs: refs/ascii-*.png.
- Moodboard: refs/moodboard-planet-gif/planet.gif. The human finds it mesmerising: an animated teal planet with clouds sliding around the silhouette, small peach moons orbiting in front and behind, chunky ring clumps, a dark rim. ~6.7 s loop.

### Revision 6 (human, 2026-11-03, after the Planetarium measurements)
- Background: BLK 36's darkest navy/plum (not pure black), banding to a lighter BLK 36 navy-violet at the bottom (3–4 hard bands).
- Planets: **one shared ~10–12 colour set** built by the research ×2 policy (measured true colour, uniform OKLCH chroma ×~2). Each planet uses 4–6 colours. Accents (lava blackbody glow, [OIII] teal reveal) are exempt. Astronauts and stars stay BLK 36.
- Shading: keep the lit directional terminator, using shared darks.
- Planetarium fixes: chunky ring clumps in shared colours, clouds ≤2 tones, hero planet 42–50% of frame, sparse dim stars, optional orbiting moons, optional halo/dust-streak toggles.

### Revision 7 (human, 2026-11-03), supersedes the colour parts of revision 6
- Astronauts: BLK 36 exactly (blueish suit tint). **Everything else reverts to v2 colours** (f4ceea0): planets, clouds, space, stars, depth. The shared research palette, ×2 policy and BLK 36 space gradient are dropped.
- Exception: the ring uses v2 planet-family colours (no pink/violet/yellow).
- The non-colour Planetarium fixes from revision 6 still apply (chunky ring, loop-lock, moons, framing, halo toggle).

### ASCII FX round 1 → 2 (human, 2026-11-03)
- Accent: **[OIII] teal**, lime dropped.
- Planet artefacts are favoured. **All effects to be tried as "filters"**: glitch cells take the colour of the scene area they cover (step, invert, slip, posterise) rather than an added accent. Teal only where an accent is needed. Round 2 renders filter and filter+teal variants.
- Round 2 (29c64a1): every effect has filter and filter+teal variants. Picks: fog = scene-tile slabs plus inverted-lightness wavefront (teal helps most here); artefacts = bug glyphs in the terrain's inverted lightness inside the planet shader (filter-only); terminal = lighter-on-darker glyph tiles of the cell colour; tags = an inverted-lightness slab.
- Clouds (human, 2026-11-03): float slightly above the surface (gap ~r 1.04–1.08, optional offset shadow) and drift slightly faster than the surface. Loop-safe default: 24 s loop, surface 2 turns : clouds 3; 36 s at 3:4 as the alternative.
- Clouds: blend into soft continuous clumps (merged masses, fewer internal puff edges, unified lumpy silhouette).
- 2026-11-03 (planet-polish 9797b2f): **the default loop is now 24 s (surface 2 turns : clouds 3)**, replacing 12 s. Clouds float at r≈1.05 with an offset cloud shadow and are mass-shaded into blended clumps; cover is ~28% (lush/ocean/toxic) and ~8% lava ash. Planet artefacts (filter form) are a viewer toggle, with teal as a sub-toggle.
- ~~**Depth colour budgets**~~ **REVERTED 2026-11-04 by the human ("clips the threshold too much"); back to the v2 smooth depth fade with full colours.** Original decision (2026-11-03): near = full ramp with all detail; mid = 3 tones, no cloud shadow, ring 2 tones; far = 2 tones, clouds merged or off, ring 1 tone, no moons or artefacts; silhouette = 1 tone plus at most a 1 px rim. The depth fade snaps to the reduced ramp, per object (replaces the old lerped depth steps). Enforced by a colour-count test. Implemented in 2aa584a (DEPTH_LEVELS table).
- Depth fade (human, 2026-11-04): thresholds are chosen **per pixel** from fragment distance, not per object, so straddling objects get different levels across their surface. Default is stepped bands (crisp edges); object and pixel-smooth stay as viewer options for A/B.
- Lava fissures and ice crevasses (human, 2026-11-04): thicker (≥2 internal px main lines, 1 px tips), pointed and jagged so they read through the pixel filter.
- Lava and ice (human, 2026-11-04): more open areas (pure lava pools/seas on lava worlds, open water leads on ice worlds) alongside the cracks. Lava is more orange, with yellow only as accents. Lava rock is shaded slightly bluer.
- New ref: `<main-checkout>/.archive/docs/design/refs/planet-variety-grid-64.png`, a 64-planet pixel-art grid (dithered and hatched shading, orange lava with yellow accents, ice sheets over blue water, chunky moons, asteroid belts, swirl storms).
