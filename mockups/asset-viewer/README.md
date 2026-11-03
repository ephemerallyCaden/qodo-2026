# Asset viewer: batch 1

Live three.js viewer for the first Codebase Space Explorer assets: one lush planet and one astronaut in three contributor colours. Art direction is in [`docs/design/art-direction.md`](../../docs/design/art-direction.md). The planet style follows Daniel Linssen's *Planetarium*, and the pixel feel follows *A Short Hike*.

Everything is real-time 3D. Nothing in the viewer is a sprite or pre-rendered image.

## Run

```sh
npm install
npm run dev      # http://127.0.0.1:5180/  (loopback only; PORT=... to change)
npm run shots    # re-capture screenshots/ in headless Chromium (no server, no network)
```

`node shots.mjs depth-scene crew-closeup` captures just the named shots.

## Controls

| Control | Effect |
|---|---|
| planet / crew / depth | Camera presets: the planet close-up, the three-astronaut line-up, and the depth scene |
| seed, new planet | Regenerates land, sea level, cloud heaps and ring dust. All three planet copies share the seed |
| ring | Shows or hides the scattered-pixel ring |
| contributor | Sets the colour of the solo astronauts in the depth scene. The crew line-up always shows all three |
| pixel h | Internal height from 120 to 480. Width is 16:9, and the canvas is upscaled by the largest integer factor that fits, with nearest-neighbour filtering |
| depth fade | Turns depth darkening on or off |
| rotate | Pauses or resumes planet and cloud spin |
| drag / scroll | Orbits and zooms the camera |

## How it's built (`viewer.js`)

- **Pixels**: the WebGL canvas *is* the internal resolution (320×180 by default, `antialias: false`). CSS scales it by an integer with `image-rendering: pixelated`. There's no post pass, because every shader already outputs exact palette colours. There's no dithering and no outline.
- **Shading**: toon bands. `dot(normal, light)` picks one of four ramp entries, so each surface is made of flat colour bands. The key light comes from the top left, about 40° off the default view, which gives Planetarium's concentric crescents.
- **Planet**: a sphere whose shader uses 3D simplex fbm for land and ocean, with shallow-water and highland steps and noisy polar caps.
- **Clouds**: instanced icosphere puffs grouped into domed heaps (bigger, higher puffs in the middle). They sit on golden-spiral sites that are kept more often in two latitude belts. Each puff's normal is blended with the planet's radial direction, so a heap shades as one mass with a lumpy edge. Heaps poke out past the planet's silhouette. The clouds spin slightly faster than the ground.
- **Ring**: three lanes of `gl_PointSize = 1` points (12% are 2 px). Points in the planet's shadow use the darkest ring colour.
- **Astronaut**: built from primitives, 1 unit tall. The helmet sphere (r 0.21) is the top 40%. It has a partial-sphere visor, a rounded-box torso, a backpack wider than the torso, and capsule limbs with boots. The visor and backpack stripe use the contributor ramp. The visor fakes a reflection, banding the reflected ray's height and adding a glint lobe, so it shifts as you orbit. It has an idle float with staggered phases.
- **Depth darkening**: each object picks a level from its camera distance (under 12 is near, under 26 is mid, beyond that is far). Its ramps are swapped for precomputed steps: `lerp(colour, #262a46, 0 / 0.35 / 0.7)`. That gives about -35% value at mid and about -70% far, both shifted toward a cool blue-plum. Every step is a fixed palette colour; there are no gradients.

## Palette

| Ramp (dark → light) | Hex |
|---|---|
| space | `#2b2535` |
| stars | `#5d5372` `#a99cbf` `#f4ecf7` |
| ocean | `#2f3a62` `#3f5794` `#5a7fc0` `#80a9dc` `#acd3ee` |
| land | `#33504a` `#4c7a5a` `#6fa36a` `#9cc678` `#cfe39a` |
| polar cap | `#6e6a86` `#b9b3c9` `#e6e0ee` `#fbf8ff` |
| cloud | `#6e6274` `#b39c94` `#e3cdb0` `#fff6e4` |
| ring | `#5d4e72` `#8f7fae` `#d8a9b8` `#f2d6b3` |
| suit | `#8f8087` `#cdb9a6` `#eadcc6` `#fbf3e4` |
| visor glint | `#fffaf0` |
| contributor coral | `#6e3a4c` `#b85c66` `#f08e7f` `#ffc4a8` |
| contributor mint | `#2c5a5a` `#3f9886` `#6fd1b0` `#bff2da` |
| contributor lilac | `#433a74` `#7563bd` `#a993ec` `#dccfff` |
| depth tint | `#262a46` (mixed in at 0.35 for mid and 0.7 for far) |

## Screenshots

| File | Shows |
|---|---|
| `screenshots/planet-closeup.png` | Seed 7 with ring, 320×180 ×4 |
| `screenshots/planet-no-ring.png` | Same, ring off |
| `screenshots/planet-seed-311.png` | Another seed |
| `screenshots/crew-closeup.png` | Coral, mint and lilac astronauts |
| `screenshots/depth-scene.png` | Near, mid and far planet and astronaut copies with depth fade on |
| `screenshots/depth-scene-off.png` | Same scene, fade off, for comparison |
| `screenshots/pixel-120.png` | Chunkier pixels: 213×120 ×6 |
| `screenshots/pixel-360.png` | Finer pixels: 640×360 ×2 |
