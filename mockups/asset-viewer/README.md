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
npm test         # cloud regression tests: puff handedness (det > 0), hollow-ring renders (32 framings + 12 hero-loop frames; LOOP_FRAMES=48 for all), shading direction (follows the mass dome), CPU/GPU simplex parity; artefacts: off = pixel-identical, on = visible, deterministic, loop-locked; cloud shadow: no phantoms, drifts with the clouds; depth colour budgets
```

`node shots.mjs depth-scene crew-closeup` captures just the named shots.

## Controls

| Control | Effect |
|---|---|
| planet / crew / depth | Camera presets: the planet close-up, the three-astronaut line-up, and the depth scene |
| studio / system | The hero planet alone (for biome comparison), or a mixed system of 8 planets plus the crew |
| biome | lush, ocean, ice, desert, lava, plus extras: gas giant, barren moon, toxic |
| size | Planet scale, 0.25–2.2 (size stands for LOC) |
| seed, new planet | Regenerates land, sea level, cloud heaps and ring dust. All three planet copies share the seed |
| clouds | Cloud cover (share of the visible disc, 0–45%) for the hero planets. Defaults to the biome's `WEATHER.cover` and resets when the biome changes |
| ring | off, thin, or wide. Wide marks a shared lib; rings are a modifier on any biome |
| contributor | Sets the backpack-stripe, shoulder-band and face colour of the solo astronauts in the depth scene. The crew line-up always shows all three |
| eyes | One of the 10 V2 eye designs for every astronaut; `auto` hashes it from the contributor's handle |
| pixel h | Internal height from 120 to 480. Width is 16:9, and the canvas is upscaled by the largest integer factor that fits, with nearest-neighbour filtering |
| depth fade | Turns the depth colour budgets on or off; the line below it counts visible objects per depth level |
| rotate | Pauses or resumes planet and cloud spin |
| moons | Two small orbiting moons on the hero planet |
| dark halo | Optional teal-GIF look: a ~2 px bg+1 halo around planets (off by default) |
| artefacts | Planet artefacts (off by default): corrupted sectors that glitch the planet's own colours, on every planet. **sectors** sets how many (1–5, seeded from the planet seed); **teal accent** adds the optional [OIII] teal on a few core glyphs |
| loop (s), surface turns, cloud turns | The shared loop: period (default 24 s) and whole surface and cloud-layer turns per loop (default 2 and 3, so clouds drift at 1.5× the ground). Every layer completes whole cycles per loop |
| cloud shadow | A faint one-step-darker shadow of the clouds on the terrain, offset along the light (on by default) |
| palette | **final** (default: BLK 36 crew and space + Earth-like planets), v2, v1, or any of the 25 Lospec palettes (plus spares) |
| drag / scroll | Orbits and zooms the camera |

## How it's built (`viewer.js`)

- **Pixels**: the WebGL canvas *is* the internal resolution (320×180 by default, `antialias: false`). CSS scales it by an integer with `image-rendering: pixelated`. There's no post pass, because every shader already outputs exact palette colours. There's no dithering and no outline.
- **Shading**: toon bands. `dot(normal, light)` picks one of four ramp entries, so each surface is made of flat colour bands. The key light comes from the top left, about 40° off the default view, which gives Planetarium's concentric crescents.
- **Planet**: a sphere whose shader uses 3D simplex fbm for land and ocean, with shallow-water and highland steps and noisy polar caps.
- **Clouds**: each puff instance is built on a right-handed tangent frame (`cloud-frame.js`, det > 0, with a pole fallback). A mirrored instance gets back-face culled into a hollow ring; `npm test` guards this. Instanced icosphere puffs are squashed to 60% along the radial axis and **float** a small gap above the terrain (`WEATHER.float`, bases at about r = 1.05), so the clouds read as a separate layer that still bulges past the silhouette. **Mass shading:** the cloudy sites are joined into masses (union-find over neighbours), and each puff carries its mass's anchor, a point below the mass centre by about the mass radius. The shading normal is a scalar blend of the mass dome (anchor → fragment, a continuous field, so neighbouring puffs agree and internal seams vanish), the planet radial and a little of the puff's own normal for a lumpy edge; parts that point into the puff are dropped so undersides stay shaded. Puffs are at least ~0.06 R, wider than half the site spacing, so the puffs in a mass always overlap into one clump. **Cloud shadow:** the same instances, projected along the light onto the planet and drawn as the terrain one light band darker (shadows that would reach more than 0.1 R from their cloud, near the terminator, are dropped). Placement is noise-driven, like Planetarium. A mid-frequency fbm field makes several merged masses, and a latitude-stretched field makes long east-west streaks. Wherever both fields are low the sky stays clear. Cover is a **quantile**, not a fixed threshold: the densest `cover × gain` share of the sky sites get weather, so every seed lands near the same cover. `WEATHER` in `viewer.js` is the one place to tune it per biome (`gain` converts site share to disc share for that weather's puff size; smaller puffs get denser sites so masses stay solid). Denser spots get bigger, higher puffs, so cores merge and dome past the silhouette, and a few small strays scatter at the edges of the weather. Every puff gets at least one smaller satellite beside it, and thin weather and strays get 2–3, so no lone sphere reads as a white ball. The cloud layer turns `cloudTurns` per loop against the surface's `surfaceTurns`, so it slides over the terrain.
- **Ring**: one thin band of 1,500 points, densest in the middle. Every dot is exactly 1 internal pixel at every resolution. Points in the planet's shadow use the darkest ring colour.
- **Astronaut**: one signed-distance body, raymarched inside a proxy box and composited with `gl_FragDepth`. It's made from primitives in chibi proportions: a helmet sphere (about the top 55%), a short torso, a rounded-box torso, a backpack wider than the torso, mitts and boots. Each arm and leg is one continuous bent tube (shoulder→elbow→wrist, hip→knee→ankle), smooth-unioned so the bend has no seam. Elbows and knees are softly bent, and they flex with the idle bob. Because it is one surface, one lighting pass shades the whole body. Cast shadows (arm on torso, helmet on shoulders) and contact occlusion come from marching the same field toward the light, then snapping to the 4-step suit ramp. The suit is a cool white. The visor is a ~4:3 rounded-rect "screen" (a superellipse in yaw and pitch) with a gear-tone bezel, in two near-black blue tones plus a fixed 3 px monitor-style glint in the screen's top-left corner, clear of the face. **Contributor colour** is on the backpack stripe and a band around each upper arm (shoulder bands), so it's readable from any angle.
- **Faces** (`faces.js`): the ApprenticeHack Avatar V2 eye designs, eyes only. There are 10: dots, cyclops, visor slit, binocular, three eyes, happy, LED bar, heartbeat, slant and X eyes. They are evaluated **analytically per fragment** as 2D SDFs in visor-screen space (`EYES_GLSL`, inside the astronaut shader), so they are resolution-independent: the normal internal-resolution render pixelates them like the rest of the model. Geometry follows `js/avatar-v2.js`: `s` is a 32×24 screen box and `e = min(s.h, s.w*0.5)*1.12`, with the same offsets, radii and round-cap strokes. Eyes are centred on the 4:3 screen and glow, unlit, in the contributor colour; pupils (cyclops, binocular) cut back to the visor colour. One deviation: `happy` uses a thinner stroke (e*0.11) than the source. The design comes from ApprenticeHack's `hashStr(handle + 'e')`: `@caden` gets visor slit, `@mira` gets dots and `@juno` gets X eyes. Each astronaut blinks every ~4.3 s with a quick, staggered Y-squash (`uBlink`). A small fixed glint sits in the screen's top-left corner, clear of the eyes.
- **Artefacts** (`artefacts.js`, ported from the ASCII FX round 2 pick, concept 3 "planet artefacts" in its filter form; `feature/ascii-fx` 29c64a1): `ARTEFACTS_GLSL` runs inside the planet surface shader, whose colour is now a `surface(p, band)` function. Sectors are fixed directions in the planet's own frame, so they turn with it and pass under the clouds. Each sector is a screen-aligned grid of 6 px glyph cells (×2 at 360p) anchored at its projected centre, squashed by how much it faces the camera. Every cell calls `surface()` again: a bug glyph in the terrain's inverted lightness on a darker band, a flat terrain block, terrain moshed in from elsewhere, flipped light bands, or torn rows. Changes from the reference: projection, sector size and cell scale are worked out in the shader, so it works for any planet and camera (planets under 12 px radius are skipped); sector longitudes step by the golden angle so one usually faces the camera; and a glyph that would vanish into its band (lava's near-black crust) switches to inverted lightness, so lava stays legible. Glitches re-roll on a loop-locked tick (180 per surface turn; every per-cell rate, 2–6 ticks, divides it). With artefacts off the output is pixel-identical to the shader without them (`npm test`).
- **Depth colour budgets** (`DEPTH_LEVELS` in `viewer.js`, one data table): the further away something is, the fewer colours it uses. Each whole object (never per pixel) picks a level from its camera distance (12, 26, 44):

  | Level | Tones per ramp | Draws | Cap (planet / astronaut) |
  |---|---|---|---|
  | near | full (4–5) | everything: clouds, cloud shadow, ring, moons, artefacts | 24 / 16 |
  | mid | 3 | clouds, ring (2 tones), moons, artefacts; no cloud shadow | 14 / 10 |
  | far | 2 | body, ring (1 tone), haze; no clouds, moons or artefacts | 6 / 5 |
  | silhouette | 1 | one flat shape | 1 / 1 |

  Tones merge through a per-level LUT on the ramp data (e.g. a 5-step ramp reads `[0, 1, 1, 3, 3]` at mid and `[0, 0, 3, 3, 3]` far), so every shader just indexes its ramp as before. The fade tints each reduced colour toward the palette's depth tint (`#1b1f4a`, then `#17172f`) and **snaps it onto that ramp's own reduced colours or the tint**, so a fade steps down the object's own ramp with no lerped in-between colours. Lava glow is emissive and never snaps to the tint, so a far lava world still glows. The silhouette is one flat colour (the depth tint). Astronauts follow the same budgets with their BLK 36 ramps. The UI shows how many visible objects sit at each level under **depth fade**. `npm test` renders every object of the depth scene alone (lush and lava) and checks the caps, that colours never increase with distance, and that nothing renders empty.

## Palette

v2 is the current palette. v1 (the batch 1 pastels) stays selectable from the `palette` control for comparison; `screenshots/palette-before-after.png` shows v1 on the left and v2 on the right.

| Ramp (dark → light) | v2 (current) | v1 (batch 1) |
|---|---|---|
| space | `#0d0b16` | `#2b2535` |
| stars | `#3b3866` `#9a90e0` `#fff8ff` | `#5d5372` `#a99cbf` `#f4ecf7` |
| ocean | `#141d5c` `#1d3fa6` `#2b6ee0` `#4ea3f7` `#94dcff` | `#2f3a62` `#3f5794` `#5a7fc0` `#80a9dc` `#acd3ee` |
| land | `#123d33` `#1d7350` `#38a85a` `#7cd65a` `#d0f56c` | `#33504a` `#4c7a5a` `#6fa36a` `#9cc678` `#cfe39a` |
| polar cap | `#3f4590` `#98a3e8` `#dfe5ff` `#ffffff` | `#6e6a86` `#b9b3c9` `#e6e0ee` `#fbf8ff` |
| cloud | `#30285a` `#8f74b0` `#f2d8b8` `#fffaf0` | `#6e6274` `#b39c94` `#e3cdb0` `#fff6e4` |
| ring | `#3a2a78` `#8463e6` `#ff86bf` `#ffd38a` | `#5d4e72` `#8f7fae` `#d8a9b8` `#f2d6b3` |
| contributor coral | `#5c1838` `#cc3f4f` `#ff7663` `#ffbb8c` | `#6e3a4c` `#b85c66` `#f08e7f` `#ffc4a8` |
| contributor mint | `#0e4247` `#0fa384` `#33e6a8` `#a6ffd8` | `#2c5a5a` `#3f9886` `#6fd1b0` `#bff2da` |
| contributor lilac | `#2a1a74` `#6948ea` `#a27aff` `#dac9ff` | `#433a74` `#7563bd` `#a993ec` `#dccfff` |
| depth tints | `#1b1f4a` (0.38, 0.72), `#17172f` (0.88) | `#262a46` (0.35, 0.7), `#110f18` (0.88) |
| suit (cool white, both) | `#68718f` `#a3aec8` `#d3dcea` `#f2f6fc` | |
| gear: mitts, boots, backpack, visor rim (both) | `#4a5170` `#77819f` `#a2adc6` `#c4cee0` | |
| visor (both) | `#0f1329` `#232f58`, glint `#f4f8ff` | |

## The "final" palette

`final` (the default, the human's call after revision 5):
- **Astronauts:** suit, gear, visor, contributor accents and eye glow use **BLK 36 exactly** (tile `palettes/19-blk-36.png`).
- **Everything else is v2:** space `#0d0b16`, stars, depth tints, and the planets, clouds, caps and haze (`V2_PLANET_RAMPS` in `planet-ramps.js`: the v2 lush ramps plus naturalistic biome ramps in the same spirit).
- **Clouds:** keep the v2 tones, with the purple mid-shadow swapped for v2's warm cream `#f2d8b8`.
- **Ring:** no pink, violet or yellow. It's built only from v2 planet-family colours: ocean darkest `#141d5c` (debris in the planet's shadow), cloud cream `#f2d8b8` (most debris), ocean step `#4ea3f7` and pale ocean `#94dcff`.
- **Lava:** the crust is truly near-black.
- **Toxic:** ochre sludge seas, acid-lime growth and purple fungus, so it can't be read as lush.

`final-blk` keeps the revision 5 mix for comparison: BLK 36 crew, banded BLK 36 space, and the research ×2 13-colour shared planet set with its own planet depth family (`RESEARCH_RAMPS` and `PLANET_DEPTH`; the OKLCH/source table is in `planet-ramps.js`).

Non-colour revision 5 work applies to both presets:
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
| ice | stable, rarely touched | white strata with networks of blue crevasses (ridged noise) | pale haze |
| desert | stale, low coverage | wind-dune bands and sparse Worley craters (dark floor, bright rim) | none (no clouds) |
| lava | churn / bugfix hotspot | dark crust from the palette's darkest ~45%; emissive fissures that ignore lighting | ash/smoke puffs |
| ringed | shared lib, many dependents | any base + a wide two-lane ring | the ring |
| gas giant *(extra)* | very large modules | turbulent alternating bands + a storm | — |
| barren moon *(extra)* | tiny / dead modules | grey, densely cratered | — |
| toxic *(extra)* | overgrown / risky | dark sludge sea with glowing veins, acid-lime land, fungal blooms | spore puffs + lime haze |

The haze is a 1.06× shell drawn only as a thin crescent on the lit limb, so it reads as atmosphere rather than an outline. Ash and spore puffs reuse the cloud system with their own ramp, cover and lift. Lava ash reads the surface shader's own fissure field on the CPU (`snoise.js`, a float32-exact port of the GLSL simplex noise; `npm test` checks it against the GPU), so smoke only rises from the glowing fissures of a few active regions, as short, flat plumes trailing east.

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
| `screenshots/astronaut-before-after.png` | Crew before (rev 2: ASCII faces, longer limbs) vs after (V2 eyes, chibi), made once with ffmpeg |
| `screenshots/depth-scene.png` | Planet and astronaut copies at all four depth steps, fade on |
| `screenshots/depth-scene-off.png` | Same scene, fade off, for comparison |
| `screenshots/pixel-120.png` | Chunkier pixels: 213×120 ×6 |
| `screenshots/pixel-360.png` | Finer pixels: 640×360 ×2 |
| `screenshots/palettes/contact-sheet.png` | The 25 palettes, 5×5, numbered and labelled; `NN-<slug>.png` are the full-size frames |
| `screenshots/planets/variety-sheet.png` | Every biome (and extra) × 3 seeds in the final palette, S/M/L/XL sizes, rings as a modifier; `planets/<biome>-<seed>.png` are the full frames |
| `screenshots/planets/hero-loop.gif` | 24 s seamless loop of the lush hero planet with moons and ring (surface 2 turns, clouds 3) |
| `screenshots/planets/cloud-drift-24s.gif`, `cloud-drift-36s.gif` | The two cloud-drift options: 24 s at 2:3 (default) and 36 s at 3:4, 15 fps |
| `screenshots/clouds-blend-before-after.png` | Cloud close-up before (separate puffs on the surface, at 34bf42b) and after (floating, overlapping, mass-shaded clumps) |
| `screenshots/artefacts.png` | Planet artefacts on every biome, plus the teal accent on lush. Each tile is the whole second where artefacts change the most pixels |
| `screenshots/planets/artefacts-loop.gif` | The hero loop with artefacts on: 24 s at 15 fps (one frame per glitch tick), 2× |
| `screenshots/lush-before-after.png` | Lush planet close-up at ea84759 (v2 ramps) vs the research ×2 set |
| `screenshots/planet-halo.png` | The optional dark-halo toggle |
| `screenshots/planets/system-shot.png` | 8 mixed planets at several depths and sizes plus the crew (previews the GIF composition) |
| `screenshots/palette-before-after.png` | Depth scene, v1 palette (left) vs v2 (right). `palette-v1-depth.png` is its input |
