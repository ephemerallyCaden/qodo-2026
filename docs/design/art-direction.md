# Art Direction: Commet

*The settled visual style of Commet. This is a definition, not a plan: it says what everything looks like and why. If a rule here conflicts with a mockup, this document wins. How each rule was reached is in `art-direction-history.md`. The reference implementation is the asset viewer on `feature/hype-gif` (`mockups/asset-viewer/`).*

## 1. The feel

Commet is **a calm, hand-held pocket universe of your codebase, with the code layer glitching through it.**

You look down at a small, softly lit solar system that loops on its own. Clouds drift, moons swing past and rings shimmer, and the whole scene comes back to where it started without a seam. It reads like a toy you could hold. Over that natural world sits a thin, honest layer of *code*: glyphs, corrupted sectors and decoded labels. It never looks like decoration. It looks like the planet itself briefly showing its source.

**Pillars**
1. **Softness first.** The natural world is gentle, rounded and warm-lit. Nothing is harsh except the code layer, and that only in small doses.
2. **Pixel honesty.** Everything is real 3D, then rendered small and blown up. Every pixel on screen is a real low-resolution pixel. No fake pixel art, no sub-pixel smoothing; surfaces are banded, and only distance is allowed to grade smoothly.
3. **Readable at 180 pixels tall.** Every feature must survive the internal resolution: lines at least 2 px, faces as shapes rather than text, and clear value contrast. If it can't be read at 320×180, it doesn't ship.
4. **Mesmerising loops.** Every moving layer completes a whole number of cycles per loop. The eye never catches a reset.
5. **The code layer is a filter, not a sticker.** Glitches reuse the colours of whatever they cover. One accent colour, used sparingly, marks events.

## 2. Influences

| Influence | What we take | What we deliberately don't |
|---|---|---|
| **Daniel Linssen, *Planetarium*** (2015, managore.itch.io/planetarium), our primary reference | Puffy cream clouds that spill past the planet's silhouette. Chunky ring debris drawn in the planet's own colours. Sparse, static 1 px stars. A single hero planet at about half the frame height. Small warm moons orbiting in front of and behind the disc. The hypnotic, perfectly looping motion. | Its mid-plum background, fully flat shading and 7–9 colour scenes. We keep a lit terminator, a darker space and a richer palette. |
| **The animated teal planet GIF** (moodboard) | The *mesmerising* quality, measured: every layer locked to one loop period, the surface turning one revolution per loop, clouds creeping along the rim and bunching at the limb, warm peach cloud shadows, and moons whose speed changes only through circular projection. | Its GIF compression streaks, which are artefacts, not design. |
| **Adam Robinson-Yu, *A Short Hike*** | The pixel feel: 3D drawn at a low internal resolution and blown up with nearest-neighbour, flat shading, no anti-aliasing, "big and crunchy" pixels. | Its soft outlines. We have none. |
| **64-planet pixel-art grid** (moodboard) | Variety within one family. Orange lava worlds with yellow accents, white ice sheets over blue water, cool-shaded rock, chunky moons and asteroid belts. | Its dithered and hatched shading (we use flat bands). |
| **Cyberbrutalist ASCII references** (acid-lime glyph grid, glyph mosaic) | The glyph vocabulary for the code layer: ◎ ✕ ▢ + · \ / hatching, solid slabs, `{ } ; < > # = *`. Glyph choice driven by content. | Acid lime as a colour. Our accent is teal. |
| **ApprenticeHack avatar V2** (the human's own work) | The robot eye designs on a dark screen visor. | V1's ASCII glyph faces and the mouths. |
| **True-colour planetary science** (verified research) | What *not* to do. Real rings are never magenta or violet, true planet colour is muted, and lava glows by blackbody temperature. Teal is the most physically justified accent on black ([OIII] emission). | Literal true colour. Ours is deliberately richer (see §4). |

## 3. Rendering format

- **Live 3D only.** three.js meshes and GLSL shaders render into a low-resolution target, which is upscaled by the largest integer factor that fits. No sprite sheets and no pre-rendered 2D assets.
- **Internal resolution:** 320×180 by default, for a 1280×720 output at ×4. It's adjustable with a live slider (120–480 px tall). Below about 150 px the astronaut visor gets cramped.
- **Nearest-neighbour only.** No anti-aliasing, no bilinear filtering. Surface colour arrives in quantised bands. The one sanctioned gradient is the per-pixel depth fade (§5).
- **No outlines and no dithering.** Shapes are defined by colour bands, light and silhouette alone.
- **Deterministic.** The same seed and time always give the same pixels. No `Math.random` in render code.
- **Labels and UI** are drawn at native resolution **outside** the pixel pass, in a crisp bitmap pixel font (Planetarium-style tiny lowercase).

## 4. Colour

### Philosophy
- **Two palettes, one for each kind of thing.**
  - **The world** (planets, clouds, rings, space, stars) uses our own **v2** palette: an Earth-anchored family, punchier than true colour.
  - **The crew** (astronauts) uses **BLK 36** (BurakoIRL, lospec.com/palette-list/blk-36), a published pixel-art palette. Its cool blue-whites make the suits read as clean, slightly sci-fi objects against the warmer, more natural world.
- **Why not literal true colour.** Verified measurements show real planets are very muted. Earth's ocean is a slate navy `#2a3543`, forest is near-grey, and Saturn's rings have chroma near zero. We tested a palette built strictly from measured colours with a uniform ×2 saturation boost. It was coherent but too dull for this game, so we rejected it. v2 is a deliberate stylisation: real **lightness and hue relationships**, with richer saturation.
- **Why not Planetarium's pastels.** Planetarium's 7–9 pastel colours on mid-plum read as too soft and too flat for a world with depth. We keep its *shapes and motion*, not its colours.
- **Cohesion rules.** Warm highlights trend toward cream, shadows toward deep navy. Rings and clouds only reuse planet-family colours. Accents stay small. No colour appears in one place without a relative elsewhere in the scene.

### Space and stars (v2)
| Role | Colours | Why |
|---|---|---|
| Space | `#0d0b16` flat | Near-black with a hint of blue-plum. Darker than Planetarium so planets and the depth fade have room to breathe, but never pure black, which reads as dead. |
| Stars | `#3b3866` `#9a90e0` `#fff8ff` | Mostly dim, 1 px, static, with no twinkle. Real stars sit on an orange→white→pale-blue line, so there are no green or saturated stars. |

### Planet family (v2)
All ramps run dark → light, and the shader picks a band per pixel from lighting and terrain.

| Ramp | Colours | Notes |
|---|---|---|
| Ocean | `#141d5c` `#1d3fa6` `#2b6ee0` `#4ea3f7` `#94dcff` | The dominant hue family. Deep navy shadows give Earth its weight. |
| Land | `#123d33` `#1d7350` `#38a85a` `#7cd65a` `#d0f56c` | Lush greens rising to a lime highlight. |
| Polar cap | `#3f4590` `#98a3e8` `#dfe5ff` `#ffffff` | A cool white, kept bluer than the clouds. |
| Cloud | `#30285a` `#f2d8b8` `#f2d8b8` `#fffaf0` | Cream with a **warm** shadow (from the moodboard GIF). The old purple mid-shadow was removed because it clashed. |
| Water (ocean world) | `#0f1a4e` `#18378f` `#2560c8` `#3f92ec` `#86ccff` | |
| Ice | `#5a78ac` `#93b6dc` `#c6e0f4` `#e6f4ff` `#ffffff` | Crevasses use `#16234e` `#24407e` `#3a64b0` `#6a96d6`. |
| Sand / desert | `#6a3a1e` `#a8602c` `#d8944a` `#f0c27a` `#fff0b8` | Iron-oxide tans, never red (Mars is butterscotch). |
| Lava crust | `#0e0809` `#0e0809` `#1c0f0d` `#2e1712` `#432118` | Truly near-black, as real lava rock is (albedo ≲0.1), so the glow carries the planet. *Being shifted slightly bluer (§6).* |
| Lava glow | `#d63c1a` `#ff8a1e` `#ffe066` | Emissive and unlit. Hue follows blackbody temperature. *Being shifted more orange, with yellow only on the hottest cores (§6).* |
| Ash | `#1a1719` `#332e30` `#565052` `#827b7c` | |
| Gas giant | A: `#5a2e1c`→`#fff0d0`; B: `#481a18`→`#ffc6a0` | Jupiter-like cream zones and salmon-brown belts. |
| Moon / barren | `#26262c` `#4a4a54` `#76767f` `#a4a4ac` `#d2d2d6` | Neutral regolith grey. Told apart by craters, not hue. |
| Small orbiting moons | `#a8602c` `#d8944a` `#f0c27a` `#f2d8b8` | Warm peach spheres, as in the moodboard GIF. |
| Toxic (ember) | ground `#3a1c12`→`#e88a34`; slag seas `#150e0e`→`#643218`; crusts (fungus role) `#7a4a1e`→`#e8b45c`; smoke (spore role) `#2a2022`→`#b49680` | The second-worst health band, between lava and desert: cooled slag seas with ember veins, rust ground and dull smoke. Hues sit between lava glow and sand (#19). |
| Haze | ocean `#86ccff`, ice `#ffffff`, toxic `#e07a48` | A thin lit-limb sliver, never an outline. |
| Halo (optional) | `#30285a` | A 1–2 px dark back-shell, one step above space. Off by default. |
| Star (the repo) | disc `#c9361a` `#ff761a` `#ffc93c` `#fff0b8` `#fffaf0`; corona crown `#c9361a`, halo `#481a18` | The Day 1 sun (human, 2026-11-11): five flat limb bands, hottest at the centre, with churning granulation; a flat undithered corona. Emissive; depth fade 0.15, so its cream core stays the hottest point at any distance. Built from the glow, sand, cloud and gas-giant ramps, so no new colours. |

### Rings
`#141d5c` (in the planet's shadow) · `#f2d8b8` (most debris) · `#4ea3f7` · `#94dcff` (specks).

**Rule: rings use only the planet family's own colours, never pink, violet or yellow.** Two reasons:
- **Physics.** No natural ring process makes magenta. Ring colours come from ice and contaminants (cream and tan), fine dust (cool grey) or darkening (charcoal).
- **Perception.** A saturated magenta ring is a near-complement of the land green. Against black it looks brighter and nearer than the planet (the Helmholtz–Kohlrausch effect), so it reads as pasted on.

### Crew (BLK 36, exactly)
| Role | Colours |
|---|---|
| Suit | `#4185d8` `#5ab9e5` `#c1d9f2` `#ffffff`: the blueish cool white the human chose |
| Gear (mitts, boots, backpack, visor rim) | `#293268` `#464b8c` `#6b74b2` `#909edd` |
| Visor | `#12173d` `#29174c`: two near-black tones |
| Glint | `#ffffff` |
| Contributor colours | From BLK 36, hashed per contributor. Shown on shoulder bands, the backpack stripe and the eye glow. |

The crew palette is never retuned. Use the BLK 36 mapping as it is.

### Accent: [OIII] teal
`#004538` `#007c66` `#00bc9c` `#00ffd5`
- **The only accent colour,** reserved for the code layer: events, reveal wavefronts and HUD marks.
- **Why teal:** it is a real emission line (oxygen [OIII], 500.7 nm) and bright to the eye. It sits next to the dark-adapted eye's peak sensitivity, so it's literally the first colour you notice in space, and it can't be confused with any natural surface colour in the palette.
- **Use:** small areas only, under about 10% of pixels. Acid lime was tried and rejected as too loud.

## 5. Depth

- **Fade:** distant objects fade toward the space colour using the v2 depth tint `#1b1f4a`, at strengths 0 / 0.38 / 0.72, then toward `#17172f` at 0.88. Every object keeps its full colours.
- **Per pixel:** the fade level is chosen **per pixel** from each fragment's own camera distance, with thresholds at **12 / 26 / 44**. A planet that straddles a threshold shades its near side and far side differently, and a ring's far arc fades more than its near arc.
- **Smooth (default):** the fade is a **continuous per-pixel blend** toward the depth tint ("pixel-smooth"), so distance grades softly across every planet and ring. It's the one deliberate gradient in the style, chosen by the human over stepped bands for its smoothness. Object-level, 3-band and 6/8-band stepped fades remain as viewer options.
- **Scaled to the system (human, 2026-11-11, #59):** the fade's reach grows with the system, so a whole system seen from its start pose isn't washed out. The first step (0 → 0.38, out to about 10 units, the hero's range) stays as tuned, so a focused planet and its moons fade exactly as in the viewer. Past an extent of 8.4 render units (the `mini` fixture's size), the 0.72 and 0.88 steps move out in proportion to the extent, and always at least as far as the farthest planet seen from the start pose. So the farthest planet of any system's start pose fades by 0.72 or less, the level up to which the health bands still read. The 0.88 step still applies to anything beyond the system, such as when flying out. Code: `web/src/model/depth.ts`.
- **Overview readability:** at a system's start pose, the farthest planet on screen fades by at most 0.72, and its health band still separates from the next band (≥ 0.05 OKLab). Measured on Commet's own repo with `--root src`: before this change every planet sat at 0.84–0.88 and toxic, ash and healthy were 0.03 apart; after it they sit at 0.58–0.72 and 0.07 apart. Checked by `test/render/overview.spec.ts`.
- **Lava** glow fades at half strength, so a distant lava world still glows.
- **Rejected:** cutting colour counts with distance (5/3/2/1 tones). It clipped the look too hard.

## 6. Planets

### Form and shading
- **Shape:** a procedural shader sphere with noise-driven terrain, quantised into colour bands.
- **Light:** a **lit directional terminator**, keyed top-left at about 40°, which gives soft concentric crescents. Its dark side uses each ramp's own darks.
- **Framing:** the hero planet fills **42–50% of frame height** in close-ups, alone, with little clutter.
- **Meaning:** a planet's look shows its **code health** (below). Cleaning code heals the planet. **Planet size = lines of code.**

### What a planet tells you
Every visual property of a planet either carries data or is seeded variety that stays inside one meaning (constitution principle 4; human, 2026-11-06 and 2026-11-09).

| Channel | Encodes | Source |
|---|---|---|
| Look (health band) | Code health, worst to best: **lava → toxic → ash (the desert look) → healthy** | Debt markers per 1k LOC, plus open Qodo findings when opted in (#17/#18). Thresholds live in one constants file |
| Healthy look | Nothing (seeded variety): **lush, ocean or ice**, all three meaning "healthy" | Hash of the planet's stable ID |
| Size | Lines of code (clamped log) | #18 |
| Moons | Test files | #18 |
| Debris | Stale work: stale PRs and abandoned, merged-but-not-deleted or orphaned agent branches | R13; PRs only with the opt-in token |
| Rings | **Open (human, 2026-11-09).** No longer unmerged branches. Rings need a new meaning or stay out of the product view | — |
| Fog, drones, constellations, beacons | Charting (R5), agent sessions (R2b), co-change (R9), notes (R10) | — |

Gas giant and barren moon are **asset-library extras**, never shown in the product view.

**Legibility rules.** Health must inform, not decorate:
1. **Ordered at a glance.** The bands read as one scale, from molten through smouldering and dry to living, so you can rank two planets without a legend. Each step is carried by at least one cue, and no cue runs backwards: lava → toxic by glow, toxic → ash by lightness (both are warm; ash is the lighter ground), ash → healthy by temperature (cool blues and greens under clouds). "Darker" means the ground: lava's glow stays bright with distance by design (§5).
2. **Variety never crosses a band.** Seeded variation (continent shapes, cloud masses, crater layout, the lush/ocean/ice choice) stays recognisably inside its band. A healthy look must never read as a worse band; the known risk is ice reading as "frozen, stale".
3. **Survives distance and size** (on charted land; fog hides health on purpose, see §9). The band stays identifiable on the smallest and farthest planets (about 10 px discs at full depth fade), with clouds, debris and artefacts on top. **Limit (human, 2026-11-10):** the 0.88 full fade stays, for depth. At that distance only lava still reads (measured in `mockups/health-looks/`), so a far planet's band is carried by its label and by selecting it (rule 5), and the look takes over as you fly closer. The bands must stay readable up to the 0.72 level.
4. **Not by hue alone.** Bands also differ in value structure and texture (glowing fissures, slag seas, dunes and craters, clouds and water), so they stay distinct under common colour-vision deficiencies.
5. **Explained on demand.** Selecting a planet shows its band in words and its inputs, e.g. "toxic: 14 debt markers per 1k LOC, Qodo findings unknown". Unknown inputs are labelled unknown (AGENTS.md Rule 1), never shown as healthy.
6. **No look without a meaning.** A biome, modifier or effect enters the product view only with a row in the table above.

### Biomes
| Biome | Look |
|---|---|
| Lush (healthy) | Ocean plus green continents, polar caps, clustered cream clouds. |
| Ocean (healthy) | Mostly water with a few islands, thin clouds and a lit-limb haze. |
| Ice (healthy) | White strata over **open dark-blue water leads**, cut by bold jagged crevasses. |
| Desert / crater (ash band) | Wind-dune bands and Worley craters with a dark floor and bright rim. No clouds. |
| Lava (worst band) | Near-black, slightly blue-shaded crust broken by **open molten lava pools** and bold glowing fissures. Low, streaky ash smoke rises off the fissures. |
| Toxic (second-worst band) | Between lava and desert: cooled slag seas with ember veins, rust ground, oxidised orange crusts, dull rust smoke and a warm haze. |
| Gas giant (library extra) | Turbulent alternating bands and a storm. Large sizes only. |
| Barren moon (library extra) | Small, grey, densely cratered. |

### Cracks (lava fissures, ice crevasses)
- **Shape:** Voronoi-edge cracks with straight segments, pointed junctions and branching. Never wobbly noise contours.
- **Width:** main lines are **at least 2 internal px** (measured median 3–5 px), tapering to 1 px tips. They never break into isolated pixels.
- **Scale:** width is set in screen pixels, so lines stay bold at every planet size. Small planets show fewer cracks rather than filling solid.
- **Mix:** each planet balances three things: solid ground, crack networks, and open pools (lava) or water (ice).

### Clouds
- **Altitude:** clouds float as their own layer, with bases at r ≈ 1.05, and cast a faint shadow on the terrain, one band darker and offset along the light. Only clouds actually between the surface and the light cast shadows.
- **Form:** clouds **blend into soft continuous clumps**. Each mass is shaded as a single dome, with a lumpy outline that bulges past the silhouette.
- **Cover:** about **28%** of the visible disc on lush, ocean and toxic, and about **8%** ash on lava. Cover comes from a quantile of the weather density, so it's consistent across seeds.
- **Placement:** noise-clustered into merged masses and east–west streaks, with clear sky between them. Never an even polka-dot scatter.
- **Colour:** two tones, cream plus a warm shadow. Exception: toxic's weather is dull rust smoke (the spore ramp, chroma under 0.05), so it never reads as desert cream.

### Rings
- **Shape:** a thin band of chunky debris. At least 70% of particles are 2×2 or plus-shaped clumps forming clusters, and every dot stays exactly 1 internal pixel at every resolution.
- **Depth sorting:** the front arc is drawn over the disc, and the back arc is hidden behind it.
- **Colour:** the planet's own colours (§4).
- **Meaning:** rings are a modifier on any biome, not a biome. **What they encode is open** (human, 2026-11-09): they no longer mean unmerged branches, because stale work is debris. Until rings get a meaning they stay in the asset library and out of the product view.
- **Parameters:** ring **width** (thread → wide belt) and ring **distance** (hugging the surface → far out) are per-planet values with viewer sliders. Particle density scales with ring area.

### Debris
Stale work (R13) drifts near the planets it touches, as tumbling satellite parts on crooked orbits: a modifier on any planet, whatever its band (human, 2026-11-10; `docs/features/space-debris.md`).
- **Kind by shape:** stale PR = a comms satellite (bus, solar wings, dish); abandoned branch = a snapped mast boom; merged but not deleted = a spent stage; orphaned agent branch = a loose solar array.
- **Size** follows the diff on a log scale (8.5–16 px at hero range). Beyond a cap of 12, the rest is a "+N" count drawn outside the pixel pass.
- **Colour (two debris-only exceptions, approved by the human):** neutral grey metal #3d3d3d #616161 #8e8c8a #b4b2b0, off BLK 36; and a **1 px red outline** #d83843, although outlines are banned everywhere else (§3). Two 2 px red nav lights #ff6866 blink 8 times per loop with staggered phases.
- **Age:** intact (bright outline, lights on) → weathered (dim outline #872a38, one light out, scorch) → broken (fragments, lights dead).
- **Sweep:** when the branch or PR is gone, the piece flashes teal and breaks apart in 1.2 s, leaving no trace.

### Moons
Two per featured planet (about 9 px and 5 px). They are 3-tone warm spheres on inclined elliptical orbits, passing in front at the bottom and fully behind the disc, depth-sorted. Their speed changes come only from circular projection, with no easing. Moons mean test files (#18, up to 24 per planet with the rest counted); how many moons read at a glance isn't designed yet.

## 7. Motion

- **Loop lock:** every layer completes a whole number of cycles per loop. The default loop is **24 s**:
  - the surface turns **2** times, right to left, at about 1 rad/s;
  - clouds turn **3** times, drifting 1.5× faster than the surface so they visibly slide over the terrain;
  - each moon orbits once per surface turn;
  - ring debris flows 1/5 turn per surface turn;
  - the crew's bob, sway and blink are locked to whole cycles.
- **Alternative loop:** 36 s at 3:4.
- **Parallax order:** stars are static, then ring, surface, small moon and large moon, each moving faster.
- **Seamless test:** the difference between the last frame and the first must be no more than a normal frame-to-frame difference.
- **Reduced motion** freezes on a fixed frame.

## 8. Astronauts (the crew)

- **Construction:** a procedural raymarched SDF figure: one continuous surface lit in a single pass, with real self-shadowing (the helmet shadows the shoulders, the arms shadow the torso).
- **Proportions:** chibi. The helmet is about **55%** of the figure's height, with a short, narrow torso. Arms and legs are stubby **single continuous bent tubes** with soft elbows and knees that flex with the idle bob.
- **Visor:** a **4:3 rounded "monitor" screen** in two near-black tones, with a small fixed glint in the top-left corner that never overlaps the eyes.
- **Eyes:** the **ApprenticeHack V2** designs, eyes only:
  - **The set:** dots, cyclops, visor slit, binocular, three, happy, LED bar, heartbeat, slant, X.
  - **Rendering:** evaluated as resolution-independent shapes on the visor, so only the pixel pass pixelates them. They glow unlit in the contributor colour.
  - **Choice:** each contributor's design is picked from a hash of their handle.
  - **Blink:** each astronaut blinks every few seconds.
  - At a distance the eyes shrink with the figure; that's accepted.
- **Contributor identity:** shoulder bands, the backpack stripe and the eye glow.

**Drones (agent sessions).** Each supported provider has its own variation of the base drone D-final, in BLK 36 only and with V2 eyes (`docs/features/agent-drones.md`, `feature/drone-lab`). Drones may also use two provider eye designs, approved by the human on 2026-11-10: **Pills** (Copilot) and a **`>_` prompt** (Codex). That makes 12 eye designs for drones; astronauts keep the 10 V2 designs. OpenCode's and Kiro's near-suit whites are approved too: they stay apart from the crew by size, shape and the dark screen.

## 9. The code layer (ASCII / cyberbrutalist)

- **Glyphs:** custom hand-drawn pixel glyphs at 5–8 px, never font text.
  - **Vocabulary:** ◎ ✕ ▢ + · \ / hatching, solid brutalist slabs, and code glyphs `{ } ; < > # = *`.
  - **Choice:** glyphs are chosen by luminance or content (land, water, cloud).
- **The filter rule:** glitch cells take the colour of the scene they cover, as a darker or lighter step, inverted lightness, a channel slip or a posterise. They never add a new colour. Teal (§4) appears only where something needs to read as an *event*.
- **Adopted: planet artefacts.**
  - **Look:** corrupted sectors inside the planet's own surface shader. A bug glyph in the terrain's inverted lightness sits on a darker band of the same terrain, mixed with flat terrain blocks, terrain moshed in from elsewhere on the planet, flipped light bands and torn rows.
  - **Behaviour:** sectors rotate with the planet and pass under clouds. On lava, glyphs switch to whichever colour contrasts more, so they stay legible.
  - **Count:** scales with planet size, from **1 sector on the smallest planets to 5 on the biggest**, deterministic from the seed.
  - **Glyph clamp:** each sector holds a bounded number of glyph cells across it (lower and upper limits). Zooming in makes cells larger instead of multiplying them, and zooming out never shrinks a sector below the lower limit.
  - **Controls:** a viewer toggle, off by default, with teal as a sub-toggle and a manual sector override.
- **Adopted: fog of war (human, 2026-11-11; `docs/features/fog-of-war-art.md`).** Each uncharted file is a **dark veil**: its territory (each file's share of the planet's surface cells, computed when drawing) becomes its ramp's darkest step mixed well toward space, with faint drifting `\ /` hatching, a dim 2 px parcel line (a **fog-only exception** to the no-outlines rule), and a visible "?". Hidden reads unmistakably at a glance. The veil's mix toward space adds colours, a **fog-only exception** to the filter rule below (the human chose the dark veil, 2026-11-11); its darks lean cool (toward space and `#30285a`) so a fogged planet never reads as warm lava crust. **Fog hides health on purpose:** you can't see the health of code you haven't reviewed, so the band reads only on charted land and in the planet's label. A fogged planet keeps its silhouette against space. Charting clears a parcel outward from its centre with the inverted-lightness wavefront and a 1 px teal core; refog rolls back in with no teal.
- **Candidates, not yet adopted:**
  - glitch packets whose heads carry their source planet's colour;
  - terminal and drifting-band view modes;
  - a pixel↔glyph mosaic transition;
  - decode tags, as inverted-lightness label slabs.

## 10. Spec at a glance and scope

**Scope.** These rules apply to the main 3D view. The 2D map, terminal mode (R11) and status-message card (R12) are separate formats.

| Area | Settled |
|---|---|
| References | *Planetarium* (primary), the teal planet GIF, *A Short Hike* (pixel feel), the 64-planet grid, cyberbrutalist ASCII refs, ApprenticeHack V2 eyes |
| Format | Live 3D with a pixel post-process; 320×180 default; nearest upscale; no outlines, AA or dithering |
| Camera | **Pending:** ortho snapped vs ortho free rotation vs perspective free flight (mockups in progress) |
| Palette | Crew = **BLK 36** exactly; world = **v2**; rings = planet-family colours only |
| Accent | **[OIII] teal**, events only, under 10% of pixels |
| Depth | v2 fade with full colours; **pixel-smooth** per-pixel blend by distance (stepped and object modes as options); its reach scales with the system, so the farthest planet at the start pose fades ≤ 0.72 (#59) |
| Planet meaning | Code-health bands lava → toxic → ash → healthy (lush, ocean or ice); size = LOC; moons = tests; debris = stale work; fog, drones and constellations carry the rest (§6 "What a planet tells you") |
| Planet types | Healthy: lush, ocean, ice. Ash: desert/crater. Toxic. Lava. Library extras: gas giant, barren moon |
| Shading | Quantised bands, lit directional terminator, hero at 42–50% of frame, optional moons and halo |
| Cracks | ≥2 px jagged Voronoi cracks plus open lava pools / ice water |
| Clouds | Float r≈1.05, offset shadow, 1.5× drift, blended clumps, ~28% cover (lava ash ~8%) |
| Rings | Thin chunky clumps, 1 px dots, front arc over disc; meaning open, library only until it has one |
| Motion | 24 s loop lock (surface 2 : clouds 3); 36 s 3:4 alternative; reduced motion freezes |
| Astronaut | Chibi SDF, 4:3 screen visor, ApprenticeHack V2 eyes, BLK 36 |
| Code layer | Filter-style glyphs; planet artefacts adopted as a toggle |
| Labels and UI | Bitmap pixel font at native resolution, outside the pixel pass |

**Not designed yet:** per-agent drones (the base drone D-final is picked on `feature/drone-lab`), captain's log beacons, co-change constellations, the suspicious-silence flag, many moons at a glance, warp transitions, and the label/UI layout.

**In progress:** lava and ice open areas, orange lava with yellow accents, and bluer lava rock (§6); the pixel-smooth default switch (§5).

## 11. Rejected directions (don't revisit without new evidence)

| Direction | Why it was rejected |
|---|---|
| Decorative, hash-picked biomes | Planet looks now encode code health (human, 2026-11-06 and 2026-11-09). Seeded variety lives only inside a band. |
| Rings as unmerged branches (#18) | Stale work is debris (R13; human, 2026-11-09). Rings' meaning is open. |
| Acid-lime and violet toxic | Read as a different world, not as "less bad than lava", and the violet broke the ring hue rule. Replaced by ember for the health band (#19). |
| Sprite sheets / pre-rendered 2D | Breaks live 3D and the per-pixel depth fade. |
| Planetarium pastels (v1) | Too soft and flat for a world with depth. |
| Research "true colour ×2" shared palette | Coherent but too muted. |
| Apollo and the other Lospec palettes for the world | v2 is preferred; BLK 36 is kept for the crew only. |
| BLK 36 banded space gradient | Space stays flat v2. |
| Pink, violet or yellow ring dust | Not physical, and clashes (§4). |
| Acid lime accent | Too loud; teal is quieter and physically justified. |
| ASCII glyph faces and mouths | Replaced by ApprenticeHack V2 eyes. |
| Depth colour budgets (5/3/2/1) | Clipped the look too hard. |
| Copying the moodboard GIF's vertical streaks | They're GIF compression artefacts. |

## 12. Where the numbers live

The asset viewer is the reference implementation (`mockups/asset-viewer/`):
- **`planet-ramps.js`:** `V2_PLANET_RAMPS` (the world palette).
- **`palette-map.js`:** `mapPalette('blk-36')` (the crew).
- **`viewer.js`:** `DEPTH_RANGES` (12/26/44), `LOOP` (24 s, 2:3), `WEATHER` (cover and float), `CRACKS` (crack frequency and cut).
- **`npm test`** guards the solid clouds, the cloud shadow, crack width, per-pixel depth and loop seams.

References live in `<main-checkout>/.archive/docs/design/refs/`. That folder is gitignored, so use absolute paths: `planetarium-teal-ring.png`, `moodboard-planet-gif/planet.gif`, `vibe-neon-ring-gif-frame.png`, `planet-variety-grid-64.png`, `ascii-cyberbrutalist-lime.png`, `ascii-glyph-mosaic.png`. The colour research is in `.archive/docs/design/colour-research/`.
