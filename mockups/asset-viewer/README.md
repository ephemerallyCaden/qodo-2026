# Asset viewer: batch 1

Live three.js viewer for the first Codebase Space Explorer assets: one lush planet and one astronaut in three contributor colours. Art direction is in [`docs/design/art-direction.md`](../../docs/design/art-direction.md). The planet style follows Daniel Linssen's *Planetarium*, and the pixel feel follows *A Short Hike*.

Everything is real-time 3D. Nothing in the viewer is a sprite or pre-rendered image.

## Run

```sh
npm install
npm run dev      # http://127.0.0.1:5180/  (loopback only; PORT=... to change)
npm run shots    # re-capture screenshots/ in headless Chromium (no server, no network)
npm run palettes # 25 Lospec-palette renders + labelled contact sheet in screenshots/palettes/
npm run planets  # variety sheet, system shot, hero-loop.gif, artefacts-loop.gif, cloud-drift-24s/36s.gif, colour counts + loop-seam tests
node shots.mjs --star  # the star: close-up sheet, Day 1 GIF comparison, loop GIF (seam test), system shot in screenshots/star/
npm test         # cloud regression tests: puff handedness (det > 0), hollow-ring renders (32 framings + 12 hero-loop frames; LOOP_FRAMES=48 for all), shading direction (follows the mass dome), CPU/GPU simplex, Voronoi-cell and pool-field parity; artefacts: off = pixel-identical, on = visible, deterministic, loop-locked, 3–10 cells across a sector at any zoom; cloud shadow: no phantoms, drifts with the clouds; depth: object mode unchanged, pixel-stepped splits a straddling planet; lava/ice line (gap) width ≥ 2 px and a ground / crack / open mix; animated lava: seamless loop, yellow 5–15% of glow, no 1 px shimmer, and on layered lava the crack gaps and pools change over the loop while crust plates stay pixel-still; rings: width × distance sweep (chunky share, bounds, density, moons), front arc over the disc, 1 px dust, loop-locked; crew (variant K): one connected silhouette, BLK 36 + space only and unclipped at 180p in every view, bob phase and colour, and the shoulder rings carry the contributor colour; debris: off leaves no trace, on draws only A3's colours on every biome, deterministic and loop-locked, the outline material and the off-palette greys only on debris, and the sweep flashes teal and leaves no trace; star: off leaves no trace, the Day 1 bands in order and in the GIF sun's proportions, a lumpy flat-band corona, v2 world colours only, not a lava planet (lightness, dark and light shares at the same size and distance), loop-locked and seamless, emissive, faded at STAR_FADE, moonlets at one size; fog (D2d): off leaves no trace and 100% charted is the planet itself, fogged pixels are only the veil's colours and the halo limb on every biome, teal only while "chart all" runs, deterministic and loop-locked
```

The browser tests are slow on a busy machine, and `node --test` runs the files in parallel. Next to other SwiftShader work, run them one browser at a time: `node --test --test-concurrency=1 <files>`.

`node shots.mjs depth-scene crew-closeup` captures just the named shots. `node shots.mjs --planets system-shot hero-loop` does the same for the planet outputs (variety-sheet, system-shot, or any loop name), keeping the rest.

## Controls

| Control | Effect |
|---|---|
| planet / crew / depth | Camera presets: the planet close-up, the three-astronaut line-up, and the depth scene |
| studio / system / star | The hero planet alone (for biome comparison), a mixed system of 8 planets plus the crew, or the star alone (`VIEWS.star`: the planet view's line at distance 12) |
| biome | lush, ocean, ice, desert, lava, plus extras: gas giant, barren moon, toxic |
| size | Planet scale, 0.25–2.2 (size stands for LOC) |
| seed, new planet | Regenerates land, sea level, cloud heaps and ring dust. All three planet copies share the seed |
| clouds | Cloud cover (share of the visible disc, 0–45%) for the hero planets. Defaults to the biome's `WEATHER.cover` and resets when the biome changes |
| ring | off, thin, or wide: presets that set the two sliders below. Wide marks a shared lib; rings are a modifier on any biome |
| width, distance | Ring **width** (0.03 thread → 1.0 wide belt) and **distance** (inner radius, 1.2 just above the cloud tops → 2.8 far out), in planet radii (`RING` in `viewer.js`). Per-planet data values reserved for codebase metrics (mapping TBD). Defaults are the thin preset, 0.22 at 1.69 |
| contributor | Sets the backpack-stripe, shoulder-ring and face colour of the solo astronauts in the depth scene. The crew line-up always shows all three |
| eyes | One of the 10 V2 eye designs for every astronaut; `auto` hashes it from the contributor's handle |
| pixel h | Internal height from 120 to 480. Width is 16:9, and the canvas is upscaled by the largest integer factor that fits, with nearest-neighbour filtering |
| depth fade | Turns depth darkening on or off |
| depth mode | `pixel-smooth` (default: a continuous per-pixel fade), `pixel-stepped` (per-pixel levels with crisp edges), `object` (the original whole-object fade) or `levels` (debug colours per level) |
| depth bands | Band preset for `pixel-stepped`: `3-band` (the original thresholds), `6-band`, `8-band` |
| lava | Animated lava (`LAVA_MODES`): **`layered`** (default: crust plates over a moving molten layer; cracks are gaps between plates), `static-painted` (the 3b6a482 `flow` mode, pixel-identical, for A/B: orange fissures painted on the crust, only the pool fill churning), `full-warp` (the whole surface is the warped field, classic look, for comparison). `viewer.set({ lavaTime: s })` pins the molten field to a loop time, even with spin off (`lavaTime: 0` is the still check) |
| rotate | Pauses or resumes planet and cloud spin |
| moons | Two small orbiting moons on the hero planet |
| dark halo | Optional teal-GIF look: a ~2 px bg+1 halo around planets (off by default) |
| artefacts | Planet artefacts (off by default): corrupted sectors that glitch the planet's own colours, on every planet. **auto (by size)** (default) scales the sector count with planet size: 1 on the smallest (0.25) up to 5 on the biggest (2.2), linear in radius and rounded; **sectors** is a manual override (1–5); sector positions are seeded from the planet seed. **teal accent** adds the optional [OIII] teal on a few core glyphs |
| debris | Space debris on the hero planet (off by default): stale work as A3 satellites (below). **pieces** picks 0, 1, 3, 8 or 24 demo stale items (biggest diffs first, up to 12 drawn; the layout counts the rest, for a "+N" label once the UI has one), **age** the mix (mixed, fresh, weathered, old), and **sweep one** breaks the biggest piece left apart. All deterministic from the seed |
| star (system), size, corona, spin, granulation, moonlets | The star (`star.js`, below). **star (system)** puts it in the system view, upper left at `SYSTEM_STAR` (off by default, so every other render is unchanged); the star view always shows it. **size** is its radius (0.5–3, default 1.6), **corona** the flat-band crown and halo (on by default), **spin** whole turns per loop (0–3, default 1), **granulation** how far the cells wobble the band edges (0–2, 1 = the Day 1 sun), **moonlets** 0–12 |
| loop (s), surface turns, cloud turns | The shared loop: period (default 24 s) and whole surface and cloud-layer turns per loop (default 2 and 3, so clouds drift at 1.5× the ground). Every layer completes whole cycles per loop |
| cloud shadow | A faint one-step-darker shadow of the clouds on the terrain, offset along the light (on by default) |
| palette | **final** (default: BLK 36 crew and space + Earth-like planets) or any of the 25 Lospec palettes (plus spares) |
| drag / scroll | Orbits and zooms the camera |

## How it's built (`viewer.js`)

- **Pixels**: the WebGL canvas *is* the internal resolution (320×180 by default, `antialias: false`). CSS scales it by an integer with `image-rendering: pixelated`. There's no post pass, because every shader already outputs exact palette colours. There's no dithering and no outline.
- **Shading**: toon bands. `dot(normal, light)` picks one of four ramp entries, so each surface is made of flat colour bands. The key light comes from the top left, about 40° off the default view, which gives Planetarium's concentric crescents.
- **Planet**: a sphere whose shader uses 3D simplex fbm for land and ocean, with shallow-water and highland steps and noisy polar caps.
- **Clouds**: each puff instance is built on a right-handed tangent frame (`cloud-frame.js`, det > 0, with a pole fallback). A mirrored instance gets back-face culled into a hollow ring; `npm test` guards this. Instanced icosphere puffs are squashed to 60% along the radial axis and **float** a small gap above the terrain (`WEATHER.float`, bases at about r = 1.05), so the clouds read as a separate layer that still bulges past the silhouette. **Mass shading:** the cloudy sites are joined into masses (union-find over neighbours), and each puff carries its mass's anchor, a point below the mass centre by about the mass radius. The shading normal is a scalar blend of the mass dome (anchor → fragment, a continuous field, so neighbouring puffs agree and internal seams vanish), the planet radial and a little of the puff's own normal for a lumpy edge; parts that point into the puff are dropped so undersides stay shaded. Puffs are at least ~0.06 R, wider than half the site spacing, so the puffs in a mass always overlap into one clump. **Cloud shadow:** the same instances, projected along the light onto the planet and drawn as the terrain one light band darker (shadows that would reach more than 0.1 R from their cloud, near the terminator, are dropped). Placement is noise-driven, like Planetarium. A mid-frequency fbm field makes several merged masses, and a latitude-stretched field makes long east-west streaks. Wherever both fields are low the sky stays clear. Cover is a **quantile**, not a fixed threshold: the densest `cover × gain` share of the sky sites get weather, so every seed lands near the same cover. `WEATHER` in `viewer.js` is the one place to tune it per biome (`gain` converts site share to disc share for that weather's puff size; smaller puffs get denser sites so masses stay solid). Denser spots get bigger, higher puffs, so cores merge and dome past the silhouette, and a few small strays scatter at the edges of the weather. Every puff gets at least one smaller satellite beside it, and thin weather and strays get 2–3, so no lone sphere reads as a white ball. The cloud layer turns `cloudTurns` per loop against the surface's `surfaceTurns`, so it slides over the terrain.
- **Ring**: clustered chunky debris (≥ 70% 2×2 and plus clumps, the rest 1 px dust; every dot is exactly 1 internal pixel at every resolution). Points in the planet's shadow use the darkest ring colour. Geometry comes from two data values, **width** and **distance** (`ringLanes()`): up to width 0.3 the ring is one lane; past it a gap opens between an inner and an outer lane (a Cassini-style division, 0.2 / 0.72 of the width at 0.72). Clusters scale with each lane's area (the thin ring's 15 clusters per its area), so density is the same at any size. The thin preset (0.22 at 1.69) is the previous default ring exactly; the wide preset (0.72 at 1.54) keeps the old lanes (1.54–1.78 and 1.98–2.26) at the same density, so its lanes now have 15 and 22 clusters instead of 22 and 18. When the ring is pushed past 1.69, the moon orbits scale out by `distance / 1.69`, so they keep their place relative to the ring. `npm test` (`test/rings.test.mjs`) sweeps the sliders (chunky share, bounds, density, moons) and renders: the front arc over the disc, no back arc over it, 1 px dust at 180p and 360p, and a seamless loop.
- **Astronaut** (`astronaut.js`; variant K from the astronaut lab, `mockups/explorations/astronaut-lab`, the human's pick on 2026-11-04): one signed-distance body, raymarched inside a proxy box and composited with `gl_FragDepth`. It's the lab's C (hard-suit engineer) with A's backpack and a smooth white suit. Proportions are chibi: the helmet sphere is 57% of the figure, over a short rounded-box torso and stubby limbs. Each white arm and leg is one continuous smooth bent tube (shoulder→elbow→wrist, hip→knee→ankle), and the elbows and knees flex with the idle bob. The hard-suit detail is only on the grey gear parts: ring collars where the arms and legs leave the body, glove and boot cuffs, and a neck seal where the helmet meets the torso. They join with a small crisp blend, so they read as separate pieces through shading alone, with no outlines. Limbs blend into the core (helmet, torso, pack) but not into each other, so a mitt resting on a thigh stays a mitt. `layout()` attaches the shoulders, hips and backpack to the torso's real surface, and `pose()` is loop-locked to the cycle. Figure units are 1 tall, scaled by 0.95 with the boot sole 0.03 above the origin. Because it's one surface, one lighting pass shades the whole body. Cast shadows (arm on torso, helmet on shoulders) and contact occlusion come from marching the same field toward the light, then snapping to the 4-step suit ramp. The suit is a cool white. The visor is a ~4:3 rounded-rect "screen" (a superellipse in yaw and pitch) with a gear-tone bezel, in two near-black blue tones, plus a fixed 3 px monitor-style glint in the screen's top-left corner, clear of the face. **Contributor colour** is on the shoulder ring collars and the backpack stripe, so it's readable from any angle. `node debug/compare-k.mjs` checks the port against the lab: 0 differing pixels in 12 front, 3/4 and side tiles, idle and mid-bob, at 1× and 2×.
- **Faces** (`faces.js`): the ApprenticeHack Avatar V2 eye designs, eyes only. There are 10: dots, cyclops, visor slit, binocular, three eyes, happy, LED bar, heartbeat, slant and X eyes. They are evaluated **analytically per fragment** as 2D SDFs in visor-screen space (`EYES_GLSL`, inside the astronaut shader), so they are resolution-independent: the normal internal-resolution render pixelates them like the rest of the model. Geometry follows `js/avatar-v2.js`: `s` is a 32×24 screen box and `e = min(s.h, s.w*0.5)*1.12`, with the same offsets, radii and round-cap strokes. Eyes are centred on the 4:3 screen and glow, unlit, in the contributor colour; pupils (cyclops, binocular) cut back to the visor colour. One deviation: `happy` uses a thinner stroke (e*0.11) than the source. The design comes from ApprenticeHack's `hashStr(handle + 'e')`: `@caden` gets visor slit, `@mira` gets dots and `@juno` gets X eyes. Each astronaut blinks every ~4.3 s with a quick, staggered Y-squash (`uBlink`). A small fixed glint sits in the screen's top-left corner, clear of the eyes.
- **Artefacts** (`artefacts.js`, ported from the ASCII FX round 2 pick, concept 3 "planet artefacts" in its filter form; `feature/ascii-fx` 29c64a1): `ARTEFACTS_GLSL` runs inside the planet surface shader, whose colour is now a `surface(p, band)` function. Sectors are fixed directions in the planet's own frame, so they turn with it and pass under the clouds. Each sector is a screen-aligned grid of 6 px glyph cells (×2 at 360p) anchored at its projected centre, squashed by how much it faces the camera. **Glyph clamp** (`ART_CELLS`, 3–10): a sector always spans 3 to 10 cells across. Zooming in grows the glyph pixel by whole internal pixels (6, 12, 18 px cells…) instead of adding cells, and zooming out holds a sector at 3 cells; discs too small to hold that (under 13.5 px radius at 180p) are skipped. Without the clamp, the very close zoom in `test/artefact-clamp.test.mjs` drew a 33 × 27 grid of 6 px cells; now it draws about 10 × 9 cells of 18 px (36 px at 360p). The default hero is pixel-identical. That test reads the shader's artefact debug view (`viewer.set({ artDebug: true })`: each cell painted with its index, row slip off) at far, default and very close zoom (180p and 360p), and checks the bounds, the rendered extent and whole-pixel square cells. Every cell calls `surface()` again: a bug glyph in the terrain's inverted lightness on a darker band, a flat terrain block, terrain moshed in from elsewhere, flipped light bands, or torn rows. Changes from the reference: projection, sector size and cell scale are worked out in the shader, so it works for any planet and camera (planets too small for a 3-cell sector are skipped); sector longitudes step by the golden angle so one usually faces the camera; and a glyph that would vanish into its band (lava's near-black crust) switches to inverted lightness, so lava stays legible. Glitches re-roll on a loop-locked tick (180 per surface turn; every per-cell rate, 2–6 ticks, divides it). With artefacts off the output is pixel-identical to the shader without them (`npm test`).
- **Debris** (`debris.js`, `debris-kits.js`, `debris-layout.js`, `debris-palette.js`; designed in `../debris-lab`, the human's pick A3 on 2026-11-10). Stale work (R13: stale PRs, abandoned, merged-but-not-deleted and orphaned agent branches) drifts near the planet it touches. It's a planet modifier like the ring: `makePlanet()` composes a debris set, `planet.setDebris({ items, seed, sweeps, selected })` turns it on (null turns it off), and with it off nothing is drawn and every render is pixel-identical to before.
  - **Pieces:** one shape family per class. Stale PR: a comms satellite (a bus and dish between solar wings). Abandoned branch: a snapped radio-mast boom. Merged, not deleted: a spent stage. Orphaned agent: a detached 2×2 solar array. Size follows the diff (log scale, 11.5–19 px across at hero range). Solar panels draw a grid of 2 px lines around cells of at least 2 px, or stay plain plates when too small.
  - **Look:** neutral grey metal (`#3d3d3d #616161 #8e8c8a #b4b2b0`), a 1 px red outline (`#d83843`) and two blinking red nav lights per piece (`#ff6866`, 8 blinks per 24 s loop, each on its own seeded phase). Pieces are lit in four flat bands and darkened in the planet's shadow. The outline is an inverted-hull shell pushed out 1.2 px at each vertex's own depth (`VIEW_SIZE`), so it's ordinary geometry in the z-buffer: depth-sorted against the planet, clouds, moons and ring with no post pass. Everything fades per pixel through the same `depthFade()`.
  - **Motion and age:** each piece is on its own crooked orbit (one turn per loop, about a third retrograde) and tumbles a whole number of turns per loop. Placement is seeded by (planet seed, item id), so removing an item moves no other piece. Age shows without paint. Intact: bright outline, both lights. Weathered (60+ days): the outline dims to `#872a38`, one light is dead, 30% of the metal is scorched. Broken (180+ days): fragments, lights dead, a dim outline on the biggest fragment only, 50% scorched.
  - **The sweep** (an item gone on the next scan) is a one-shot on its own clock, outside the loop lock: a teal flash, a burst into fragments, a shrink, and nothing after 1.2 s.
  - **The human's two exceptions, debris only:** the grey is off BLK 36 ("more grey and less blue, it's ok to not use the palette exactly"), and the outline breaks the art direction's no-outlines rule (§3). Both live only in the debris modules, and `test/debris.test.mjs` checks that no other material carries either.
  - **The debris lab** draws its explorations (directions A–E and A2) through this same factory, registering their kits, arrangements and colours into the registries here.
- **Star** (`star.js`; `docs/features/star-art.md` S1–S7). The Day 1 GIF's sun, ported: that sun was the D1 star (`feature/day1-gifs` fd931c1, `mockups/day1-gifs/star.js`), drawn with this viewer's own noise and depth fade, so the port keeps D1's bands, cuts and corona exactly. `makeStar()` (built once by `starFactory()` with the viewer's vertex shader, noise, depth GLSL, loop and moon material) returns `{ group, set({ size, spin, granulation, corona, moonlets }), update(phase), parts }`.
  - **Disc:** five flat bands by limb angle (`mu`, limb darkening), dark → light: red-orange limb `#c9361a`, orange `#ff761a`, yellow `#ffc93c`, cream `#fff0b8`, cream-white core `#fffaf0` (cuts 0.27 / 0.5 / 0.72 / 0.9). A granulation field (fbm cells plus fine simplex grain) wobbles the band edges; it churns on a circle in noise space, one lap per loop, while the sphere turns `spin` whole turns per loop, so the loop is seamless.
  - **Corona:** a billboard built in the vertex shader, in the plane through the star's centre that faces the eye, so it hugs the disc's silhouette from any camera. Two flat bands, no dithering: the red-orange crown licks just past the limb, then a thin dark-red halo `#481a18` with a lumpy edge (1.13–1.27 radii) whose lumps ride the same loop circle. `depthWrite` off, drawn after the disc.
  - **Colour:** the ramps are palette roles, `star` and `corona` (`bindPalettes()` in `star.js`), taken from the v2 world family with no new colour: the lava glow, then the sand and cloud tops; the glow rim and gas giant B's darkest. Published palettes get the same roles from their own ramps. Teal is never on the star.
  - **Emissive** everywhere (no terminator, no crust), and faded per pixel at `STAR_FADE` = 0.15 of the strength, D1's (the team lead's call, 2026-11-11, over the doc's first default of lava glow's 0.5). At the GIF's scale 0.15 reproduces the GIF sun's colours exactly, core `#e6e2de`; at 0.5 the core greys to `#adabb4` and the star reads as a dull ember (`screenshots/star/star-vs-day1.png`). Fully faded (past 44 units) the core is `#e0dcd7`, OKLab L 0.90, still lighter than lava's hottest glow up close (`#ffc93c`, L 0.86), so the cream core stays the system's hottest point at any distance; at 0.5 it would be `#99969b`, L 0.68.
  - **Moonlets** (root files and unmatched tests): the planets' moon look (`moonMaterial()`, the same material the moons use), one size (0.11) whatever the star's size, on one orbit at 1.7 star radii, slots golden-ratio steps apart and nearly in the orbital plane, one orbit per surface turn.
  - **Measured** (`npm test`, `test/star.test.mjs`): band radii from the centre 11.7 / 21.4 / 29.6 / 34.7 / 38.8 / 42.9 px (core → halo) at the star view. At the GIF's scale (a 1.6 star at about 23 units) it draws 1806 px against the GIF sun's 1782, with band shares within 4 points of the GIF's (core 12 vs 16%, cream 22 vs 20, yellow 17 vs 21, orange 13 vs 14, red-orange 15 vs 11, dark red 20 vs 18). At STAR_FADE the crops share the GIF's exact colours. Against the lava planet (seed 11, size 1.6, same distance, depth on): mean OKLab L 0.69 vs 0.42 at 12 units and 0.66 vs 0.40 at 26; near-black share 20% (only the halo) vs 47% and 42%; 52% and 64% of the star is lighter than lava's hottest pixel. Loop seam 1197 px vs a median step of 1190.
- **Fog of war** (`fog.js`, `fog-layout.js`; R5, designed in `../fog-lab`, the human's pick **D2d · dark veil** on 2026-11-11). Fog covers every file changed by someone other than you since you last charted it. It sits on the planet's surface, under the clouds, and turns and fades with the ground. Each pixel finds its cell on #18's 256-cell Fibonacci grid; in a fogged cell the planet is hidden. The **fog** control (planet view) turns it on. **charted** sets the demo planet's charted share (0/25/50/75/100%). **chart one** clears the next fogged file in charting order, **refog one** refogs the last one charted, and **chart all** clears every fogged file 0.12 s apart and ends in the planet-clear pulse. All of them are deterministic and run on their own clock, like the debris sweep.
  - **The look:** each fogged file's parcel is a cool blue-plum veil in the halo's hue, whatever the band: `VEIL` lit `#190e3d`, `#110432` on the night side. It's as dark as the band's darks mixed toward space, but at least 0.06 (OKLab) from every lava-crust colour and from space, so a fogged planet reads cool-dark and never as lava's warm-dark crust, which would be a false worst-band signal. It carries faint dashed hatching (`#221a46`) that drifts two periods per loop, a dim outline (`#1e1740`), and a mid-lavender "?" (`#615999`) on half the parcels of 7 or more cells. The fogged limb (the outer 2 px, `LIMB_PX`) is the halo colour `#30285a`, one step above space, so a fully fogged planet's silhouette never merges into space. The lit-limb haze (ocean, ice, toxic) is hidden wherever the cell under it is fogged, so no band-coloured rim gives the band away; it returns as each file is charted.
  - **Health doesn't read through fog, by design** (the human: you can't see the health of code you haven't reviewed). It reads on charted land and in the planet's label.
  - **The human's two exceptions, fog only:** the 2 px parcel outlines are allowed under §3's no-outlines rule (in the planet's own darks, gone once the file is charted); and the veil's five colours are new, against the filter rule (§9). The only other colour fog adds is [OIII] teal, on events.
  - **The territory rule** (`footprint()`, computed in the renderer; #18 is unchanged). #18 gives each file one cell. The rule shares every cell among the planet's files in equal shares (±1 cell), each grown round-robin from the file's own cell, so a fully fogged planet is completely fogged and the fogged share of the surface tracks the fogged share of the files. It's derived each time from the settlements, so territories shift as files come and go; the settlements never move. Each footprint has an anchor, its cell nearest the centroid: the parcel's hatching and "?" are drawn from it and its event fronts start there. `fog-layout.js` is pure and can be reused by the product with layout.json's settlements and the fog view in place of the demo planets.
  - **Events** (`EVENT`, on their own clock):
    - clear (1.0 s): a front out from the anchor, with a 1 px teal core and a 1.5 px inverted-lightness rim, then the parcel outlines alone, then clear ground;
    - the planet-clear pulse (0.9 s): the core and rim once around the planet from the last file charted;
    - refog (2.4 s): the veil closes in from the footprint's far edge with a billowing edge, no rim and no teal.
  - **Moons** are test files: each is fogged or clear as a whole.
  - **One shader path:** `makePlanet({ fog: fogSpec() })` splices the fog into the planet's surface shader, its cloud shadow and each moon's shader (`FOG_SPLICE`, `withFog()`), wrapping the colour after the artefacts and before the depth fade, and into the haze, which discards a pixel over a fogged cell (`fogHaze()`, for looks registered with `hidesHaze`: D2d). `driveFog()` sets the cell texture and uniforms each frame. The fog lab's other looks (A–E, A2, D, D2a–D2c, D2e) register through `registerFogLook()` and draw through the same path.
  - **Off is off:**
    - a planet made without a spec builds the shipped shaders byte for byte;
    - the hero is remade with a fog spec only the first time the fog control is turned on, so until then the viewer is unchanged;
    - with the spec and fog off, every pixel is as before;
    - the 19 `node shots.mjs` outputs match a fresh pre-change run byte for byte, and the asset library's fidelity suite passes.

    `test/fog.test.mjs` checks:
    - off leaves no trace, and 100% charted is the planet itself;
    - on every biome, fogged pixels are only the veil's five colours and the halo, and fog changes the disc (it fails on empty output);
    - on ocean, ice and toxic, fully fogged, at most 5% of the haze's pixels are left (the rest show what's behind it);
    - teal appears only while "chart all" runs and none after, and the planet ends fully charted;
    - fog is deterministic and loop-locked.
- **Depth darkening**: each whole object picks one of four levels from its camera distance (switch points at 12, 26 and 44). Its ramps are swapped for precomputed steps: `lerp(colour, #1b1f4a, 0 / 0.38 / 0.72)`, then `lerp(colour, #17172f, 0.88)` for the last step. That gives about -35% value at mid, about -70% far, and a dark navy silhouette with a faint hint of colour furthest out. The silhouette tint sits a touch above the near-black space so it still reads. Every step is a fixed palette colour; there are no gradients. **Depth mode** (`DEPTH_MODES`, viewer control): `pixel-smooth` (**default**, the human's pick) grades continuously per pixel on log distance from 5 to 44 through the palette's depth steps, so distance reads across every planet. `pixel-stepped` picks the level per fragment from its own camera distance, with the same thresholds, tints and strengths, so a planet, ring, cloud layer or astronaut that straddles a threshold shows its near part at the nearer level with a crisp pixel edge (a big planet's limb vs its centre, a ring's far arc vs its near arc). `object` is the original per-object fade (ramps pre-faded on the CPU; pixel-identical to 735b3b5). `levels` paints each fragment in its level colour (red, green, blue, yellow) for debugging. Every fading shader (surface, artefacts, clouds, cloud shadow, ring, moons, haze, halo, astronauts) calls the same `depthFade()` (`DEPTH_GLSL`); the thresholds are `DEPTH_RANGES` and the strengths come from the palette's `depth` table. Lava glow fades at half strength, so a far lava world still glows. In the pixel modes, Lospec palettes are lerped but not snapped back onto their own colours (snapping is per object only). **Depth bands** (`DEPTH_BANDS`, viewer control, per-pixel modes only): `3-band` (default, the original thresholds), `6-band` and `8-band` (levels on geometric thresholds from 6 to 44, thin near and wide far, interpolating the palette's 4 steps for the same overall strength range). pixel-smooth grades on log distance from 5 to 44. `screenshots/depth-options-sheet.png` compares object, 3-, 6-, 8-band and smooth across the depth scene, system and hero frames; `planets/depth-6band.gif`, `depth-8band.gif` and `depth-smooth.gif` are 6 s system-view loops.

## The "final" palette

`final` (the default, the human's call after revision 5):
- **Astronauts:** suit, gear, visor, contributor accents and eye glow use **BLK 36 exactly** (tile `palettes/19-blk-36.png`).
- **Everything else is v2:** space `#0d0b16`, stars, depth tints, and the planets, clouds, caps and haze (`V2_PLANET_RAMPS` in `planet-ramps.js`: the v2 lush ramps plus naturalistic biome ramps in the same spirit).
- **Clouds:** keep the v2 tones, with the purple mid-shadow swapped for v2's warm cream `#f2d8b8`.
- **Ring:** no pink, violet or yellow. It's built only from v2 planet-family colours: ocean darkest `#141d5c` (debris in the planet's shadow), cloud cream `#f2d8b8` (most debris), ocean step `#4ea3f7` and pale ocean `#94dcff`.
- **Lava:** the crust is truly near-black, with cool blue-grey shadows (`#0b0a10` `#17151d` `#262129`, warming to `#382c30` in full light). The glow is orange with yellow only as an accent: rim `#c9361a`, body `#ff761a`, hottest cores `#ffc93c` (was `#d63c1a` `#ff8a1e` `#ffe066`).
- **Toxic:** ochre sludge seas, acid-lime growth and purple fungus, so it can't be read as lush.

Non-colour revision 5 work:
- **Rings:** chunky 2×2/plus clustered debris, with the front arc over the disc and the back arc hidden.
- **Hero:** ~45% of frame height in close-ups.
- **Stars:** sparse and static.
- **Extras:** moons and the dark-halo toggle.
- **Lava ash:** light, low, streaky smoke plumes off the fissures (below).
- **Motion:** loop-locked (below).

## Motion (loop-locked)

Everything shares one loop, `LOOP = { period, surfaceTurns, cloudTurns }` (default 24 s, 2, 3), so a loop is seamless. `npm run planets` checks the seam: the diff from the last frame to the first must be ≤ a typical frame-to-frame diff.
- **Planets:** the surface turns `surfaceTurns` times per loop (right → left; one turn per 12 s at the default, as before).
- **Clouds:** the cloud layer turns `cloudTurns` times, so it drifts over the terrain. Whole turns are what keep the loop seamless, which is why a "slightly faster" drift needs a longer loop: 24 s at 2:3 gives clouds 1.5× the ground (default), 36 s at 3:4 gives 1.33×. 12 s at 1:2 would be 2×.
- **Per surface turn** (one cycle, `period / surfaceTurns`): the ring's 5-fold debris pattern flows 1/5 of a turn, each moon orbits once on an inclined ellipse (in front at the bottom, behind the disc; the speed swing comes only from projection), artefact glitches run 180 ticks, and the crew bob, sway and blink once.

`screenshots/planets/hero-loop.gif` is the lush hero with moons: one 24 s loop at 100/3 fps (800 frames), rendered from the canvas at internal resolution and upscaled 2×. `cloud-drift-24s.gif` (default, 2:3) and `cloud-drift-36s.gif` (3:4) compare the two drift options at 15 fps.

A periodic evolving field would allow slower drift without a longer loop: e.g. clouds that also morph, where each mass's puffs grow and shrink on a whole number of cycles per loop, would hide the layer's offset at the seam. That isn't built; the two whole-turn options are.

## Biomes (revision 4)

Each biome is a branch of one planet shader. Its ramps are re-keyed per biome (`BIOMES` in `viewer.js`) and come only from the active palette (`palette-map.js` adds the biome roles). Shading uses the same flat light bands everywhere.

| Biome | Meaning (art direction) | Surface | Silhouette break |
|---|---|---|---|
| lush | healthy, tested, active | sea + land + polar caps | cloud masses and streaks |
| ocean | stable, rarely touched | blue "water" ramp, sea level ~0.7, so only a few islands | thin, small clouds + lit-limb haze |
| ice | stable, rarely touched | white strata broken into sheets by jagged, crystalline blue crevasses (deeper blue at the core), with open dark-blue water (v2 `water` ramp) in leads and polynyas between them, fringed one step paler at the shore | pale haze |
| desert | stale, low coverage | wind-dune bands and sparse Worley craters (dark floor, bright rim) | none (no clouds) |
| lava | churn / bugfix hotspot | dark, slightly blue crust plates from the palette's darkest ~45%, floating on a moving molten layer that shows through jagged gaps between the plates (the cracks) and where whole plates are missing (open pools, lakes and seas): mostly orange, a cooler red in swirls, yellow only as hot accents; all glow ignores lighting | ash/smoke puffs |
| ringed | shared lib, many dependents | any base + a wide two-lane ring | the ring |
| gas giant *(extra)* | very large modules | turbulent alternating bands + a storm | — |
| barren moon *(extra)* | tiny / dead modules | grey, densely cratered | — |
| toxic *(extra)* | overgrown / risky | dark sludge sea with glowing veins, acid-lime land, fungal blooms | spore puffs + lime haze |

The haze is a 1.06× shell drawn only as a thin crescent on the lit limb, so it reads as atmosphere rather than an outline. Ash and spore puffs reuse the cloud system with their own ramp, cover and lift. Lava ash reads the surface shader's own fissure and pool fields on the CPU (`snoise.js`: ports of the GLSL simplex noise, the integer cell hash, the Voronoi cells and the pool field; `npm test` checks them against the GPU), so smoke only rises from the glowing fissures and pool shores of a few active regions, as short, flat plumes trailing east.

**Animated lava** (`LAVA_FLOW`, `lavaFlow()` in the planet shader): a domain-warped FBM after Íñigo Quílez, `f(p + w·r)` with `r = noise(p + w·q + drift)` and `q = noise(p + drift)`, two warp passes and a 3-octave FBM on top. Each pass's input rides its own circle in noise space (`uLavaTime` = cos, sin of the lava angle, one cycle per surface turn), so the rock swirls, churns and returns to itself: the loop is seamless. The value is mapped through the lava ramps in **bands**, never a gradient. The cuts sit on the field's measured quantiles. **`layered`** (default) is two layers. The bottom layer is the molten field over the whole sphere: cooler rim colour below the 20% quantile, orange, and yellow only above 89% (`LAVA_FLOW.layer`), with dark cooling skins (10%) only out in open pools, more than 2 px from a shore, so a crack never crusts over. The top layer is the crust plates, lit by the terminator as before. A crack is simply a **gap** between two plates where no crust is drawn, and a pool or sea is where whole plates are missing, so cracks and pools show the same moving field and flow into each other; nothing is painted on the crust any more. Each plate's 1 px edge facing a gap or a pool is the crust's warm top step `#382c30` (one crust step darker and no edge were tried: darker is invisible on the near-black crust, and the lit edge reads as the plate sitting above the lava at 180p). Plate, gap and pool geometry stay static (the same `plates()`, `crackWidth()` and `poolField()`), so ash placement and the CPU/GPU parity tests are untouched; only the molten layer moves. `static-painted` is the 3b6a482 `flow` mode, pixel-identical (6 frames checked): pools churn, and the field slides each painted fissure pixel's core position. `full-warp` paints crust (40%), rim, orange and yellow (top 6%) from the field alone and ignores the cracks and pools (ash still follows the hidden fissure field there). The field is evaluated once per fragment in `main()`, not inside `surface()`, because `surface()` is inlined at every artefact resample and each copy of the warped FBM adds seconds of SwiftShader compile time. Measured (`node debug/measure-lava-flow.mjs`, studio S/M/L × 4 phases): layered glow is 16% rim, 75% orange, **9% yellow**, 3.5% isolated 1 px glow pixels (static-painted 36 / 56 / 9%, 6.6%); with the planet held still, 63–91% of crack-gap pixels and 65–72% of pool pixels change colour over the loop and no plate pixel does. Frame cost is unchanged (one shader program; the mode is a uniform branch). `npm test` (`test/lava-flow.test.mjs`) guards all of this.

**Fissures and crevasses** (`plates()` and `crackWidth()` in the planet shader, `CRACKS` for frequency and mask cut): Voronoi cell edges, i.e. straight segments that meet at pointed junctions, using the exact distance to the cell edge. A low-frequency mask picks which edges show and how wide, so cracks branch and taper to ~1 px tips, then stop rather than breaking into dots. Width is in **screen pixels** (lava up to ~3 px, ice ~2.4 px), worked out from the fragment's screen derivatives, so lines stay bold at any size; small planets raise the mask cut, so they show fewer cracks rather than solid fissure. On layered lava these cracks are the gaps between crust plates (see Animated lava). Median line (gap) width at 180p (`node debug/measure-line-width.mjs`, guarded by `npm test`) went from 1 px (16–27% isolated pixels on lava, 50–62% on ice) to 4–5 px on lava and 3–4 px on ice, with ≤ 1.5% isolated pixels.

**Lava pools and ice water** (`poolField()` in the planet shader, `CRACKS.*.pool`): whole Voronoi plates of the crack network are open, where the crust or the ice sheet has broken away, so shores are the same straight, jagged edges as the cracks. A low-frequency field over the plates (`scale`, in cells) clusters them into lakes and seas, and a per-plate jitter adds lone pools. The open share of the whole sphere is a **quantile** per seed (`share`: lava 30%, ice 27%; `poolCut()` samples the CPU port), like cloud cover. A crack never runs along a shore (the shore band marks that edge instead), so there are no clipped 1 px slivers. `node debug/measure-line-width.mjs` classifies pixels with the shader's regions debug view (`viewer.set({ regions: true })`: ground blue, crack red, open green); `npm test` also guards the mix (ground ≥ 40%, cracks ≥ 3%, open 10–55%). Averaged over a turn (6 phases) at S/M/L, ground / cracks / open are 58 / 9–12 / 30–33% on lava and 56–63 / 11–16 / 26–27% on ice; a single face ranges from 14% to 51% open.

### Measured cloud cover

`node debug/measure-cloud-cover.mjs` renders flat ID passes of the studio view (8 seeds × 8 loop phases, 360p) and reports the share of the visible disc hidden by weather, plus how much weather bulges past the silhouette (as a share of the disc area):

| Weather (biome) | `WEATHER.cover` | Measured mean | Per-seed range | Bulge |
|---|---|---|---|---|
| cloud (lush) | 0.27 | 28.3% | 20.9–36.2% | 16.1% |
| thin (ocean) | 0.27 | 28.4% | 21.9–35.7% | 11.9% |
| spore (toxic) | 0.27 | 28.5% | 22.1–35.4% | 12.8% |
| ash (lava) | 0.08 | 7.9% | 5.9–9.1% | 0.4% |

(Floating, overlapping clumps; bulge grew from ~3–6% to 12–16% once the layer floated.)

Before this tuning (fixed thresholds, solid puffs) lush averaged 22% but swung from 14% to 39% between seeds, and the hero (seed 7) hit 47% at t = 3 s, because one big mass faced the camera.

## Palette exploration (`palettes.js`, `palette-map.js`)

The 25 published palettes are hardcoded from lospec.com, with each one's source URL. They were fetched once at authoring time and are never fetched at runtime. `palette-map.js` maps each one onto the viewer's roles using **only that palette's colours**:
- **Ramps:** each ramp starts from an anchor picked by hue, then walks darker and lighter by nearest chroma (OKLab a/b), so it follows the palette's own hand-made ramps and hue shifts. Chromatic ramps never climb into the palette's white.
- **Space:** the palette's darkest colour, preferring a cool one if it's within a hair.
- **Ocean and land:** chosen from stylised pairings (teal + lime, violet + mint, blue + ochre, purple + lime, cyan + pink). Earth blue + green is penalised.
- **Depth:** tints toward the palette's darks, then snaps each step back onto a palette colour. Levels 2 and 3 snap to its darkest 40% and darkest 3, and never to the space colour itself, so silhouettes stay visible.

Every tile is the same shot: the `depth` view (crew in front, hero planet, then the mid, far and silhouette copies), seed 7, time 2, 320×180. Swaps after review: Lost Century → Pear36 and Island Joy 16 → Lospec500 (no usable dark), Ammo-8 → TwilioQuest 76 (monochrome green), Fantasy 24 → BLK 36 (red-brown space). The swapped-out palettes stay selectable as spares.

| # | Palette | Author | Colours | Source |
|---|---|---|---|---|
| 01 | Resurrect 64 | Kerrie Lake | 64 | https://lospec.com/palette-list/resurrect-64 |
| 02 | Apollo | AdamCYounis | 46 | https://lospec.com/palette-list/apollo |
| 03 | Sweetie 16 | — | 16 | https://lospec.com/palette-list/sweetie-16 |
| 04 | PICO-8 | — | 16 | https://lospec.com/palette-list/pico-8 |
| 05 | Endesga 32 | ENDESGA | 32 | https://lospec.com/palette-list/endesga-32 |
| 06 | Endesga 64 | ENDESGA | 64 | https://lospec.com/palette-list/endesga-64 |
| 07 | AAP-64 | Adigun A. Polack | 64 | https://lospec.com/palette-list/aap-64 |
| 08 | DawnBringer 16 | — | 16 | https://lospec.com/palette-list/dawnbringer-16 |
| 09 | DawnBringer 32 | — | 32 | https://lospec.com/palette-list/dawnbringer-32 |
| 10 | Pear36 | PineappleOnPizzaComissions Open | 36 | https://lospec.com/palette-list/pear36 |
| 11 | Oil 6 | — | 6 | https://lospec.com/palette-list/oil-6 |
| 12 | Twilight 5 | Star | 5 | https://lospec.com/palette-list/twilight-5 |
| 13 | SLSO8 | Luis Miguel Maldonado | 8 | https://lospec.com/palette-list/slso8 |
| 14 | Nyx8 | — | 8 | https://lospec.com/palette-list/nyx8 |
| 15 | TwilioQuest 76 | Kerrie Lake | 76 | https://lospec.com/palette-list/twilioquest-76 |
| 16 | CC-29 | Alpha6 | 29 | https://lospec.com/palette-list/cc-29 |
| 17 | Journey | PineappleOnPizzaComissions Open | 64 | https://lospec.com/palette-list/journey |
| 18 | Vinik24 | Vinik | 24 | https://lospec.com/palette-list/vinik24 |
| 19 | BLK 36 | BurakoIRL | 36 | https://lospec.com/palette-list/blk-36 |
| 20 | Zughy 32 | — | 32 | https://lospec.com/palette-list/zughy-32 |
| 21 | Rosy 42 | PineappleOnPizzaComissions Open | 42 | https://lospec.com/palette-list/rosy-42 |
| 22 | Lospec500 | — | 42 | https://lospec.com/palette-list/lospec500 |
| 23 | Bubblegum 16 | PineappleOnPizzaComissions Open | 16 | https://lospec.com/palette-list/bubblegum-16 |
| 24 | Steam Lords | Slynyrd | 16 | https://lospec.com/palette-list/steam-lords |
| 25 | NA16 | Nauris | 16 | https://lospec.com/palette-list/na16 |


## Screenshots

| File | Shows |
|---|---|
| `screenshots/planet-closeup.png` | Seed 7 with ring, 320×180 ×4 |
| `screenshots/planet-no-ring.png` | Same, ring off |
| `screenshots/planet-seed-311.png` | Another seed |
| `screenshots/crew-closeup.png` | Coral, mint and lilac astronauts with their three hashed eye designs |
| `screenshots/crew-face-switch.png` | Same crew with the eye switch set to Binocular |
| `screenshots/faces-sheet.png` | All 10 V2 eye designs on the same head close-up |
| `screenshots/crew-before-after.png` | Crew before (variant A, the earlier chibi) vs after (variant K: ring collars, cuffs, neck seal), made once with ffmpeg |
| `screenshots/astronaut-before-after.png` | Crew before (rev 2: ASCII faces, longer limbs) vs after (V2 eyes, chibi), made once with ffmpeg |
| `screenshots/depth-scene.png` | Planet and astronaut copies at all four depth steps, fade on |
| `screenshots/lava-ice-before-after.png` | Lava and ice at S/M/L (variety-sheet tiles): e917540 cracks only (top) vs open lava pools and ice water, orange lava and bluer crust (bottom) |
| `screenshots/depth-mode-compare.png` | Depth scene and a planet straddling the 12-unit threshold, `object` vs `pixel-stepped` |
| `screenshots/depth-scene-off.png` | Same scene, fade off, for comparison |
| `screenshots/pixel-120.png` | Chunkier pixels: 213×120 ×6 |
| `screenshots/pixel-360.png` | Finer pixels: 640×360 ×2 |
| `screenshots/palettes/contact-sheet.png` | The 25 palettes, 5×5, numbered and labelled; `NN-<slug>.png` are the full-size frames |
| `screenshots/rings-sheet.png` | Ring width (rows: thread 0.04, default 0.22, wide belt 0.72) × distance (columns: 1.25 hugging, 1.69 default, 2.6 far) on the lush hero with moons; the centre tile is the default |
| `screenshots/planets/variety-sheet.png` | Every biome (and extra) × 3 seeds in the final palette, S/M/L/XL sizes, rings as a modifier; `planets/<biome>-<seed>.png` are the full frames |
| `screenshots/lava-modes.png` | The lava hero (seed 11) in layered, static-painted and full-warp at t = 3 s and 9 s |
| `screenshots/lava-layers-before-after.png` | Lava at S/M/L (variety-sheet tiles): 3b6a482 `flow`, i.e. `static-painted` (top), vs `layered` crust plates over the molten layer (bottom) |
| `screenshots/planets/lava-layered.gif`, `lava-flow.gif`, `lava-fullwarp.gif` | One 24 s loop of the lava hero (moons, ash) at 15 fps in the layered (default), static-painted (the 3b6a482 flow) and full-warp modes |
| `screenshots/planets/hero-loop.gif` | 24 s seamless loop of the lush hero planet with moons and ring (surface 2 turns, clouds 3) |
| `screenshots/planets/cloud-drift-24s.gif`, `cloud-drift-36s.gif` | The two cloud-drift options: 24 s at 2:3 (default) and 36 s at 3:4, 15 fps |
| `screenshots/clouds-blend-before-after.png` | Cloud close-up before (separate puffs on the surface, at 34bf42b) and after (floating, overlapping, mass-shaded clumps) |
| `screenshots/artefacts.png` | Planet artefacts: lush at S/M/L/XL (1, 3, 4 and 5 sectors by size), every other biome, and the teal accent. Each tile is the loop time where artefacts change the most pixels |
| `screenshots/planets/artefacts-loop.gif` | The hero loop with artefacts on: 24 s at 15 fps (one frame per glitch tick), 2× |
| `screenshots/lush-before-after.png` | Lush planet close-up at ea84759 (v2 ramps) vs the research ×2 set |
| `screenshots/planet-halo.png` | The optional dark-halo toggle |
| `screenshots/planets/system-shot.png` | 8 mixed planets at several depths and sizes plus the crew (previews the GIF composition) |
| `screenshots/star/star-sheet.png` | The star: sizes 1.0 / 1.6 / 2.4 at the star view and 1.6 at 26 and 44 units (columns); corona on, corona off, corona on at lava glow's fade 0.5 (the rejected option), and a lava planet at the same size and distance (rows) |
| `screenshots/star/star-vs-day1.png` | The Day 1 GIF's sun (frame 0, from the local archive) beside ours at its scale: fade 0.15 (the default, D1's), 0.5 (lava glow's), and no fade, 60 × 60 px at ×4 |
| `screenshots/star/star-loop.gif` | One 24 s loop of the star close-up with 3 moonlets, 15 fps, 2× (the seam test passes) |
| `screenshots/star/system-shot.png` | The system view with the star on, upper left |
