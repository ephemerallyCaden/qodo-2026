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
| contributor | Sets the backpack-stripe and shoulder-band colour of the solo astronauts in the depth scene. The crew line-up always shows all three |
| pixel h | Internal height from 120 to 480. Width is 16:9, and the canvas is upscaled by the largest integer factor that fits, with nearest-neighbour filtering |
| depth fade | Turns depth darkening on or off |
| rotate | Pauses or resumes planet and cloud spin |
| drag / scroll | Orbits and zooms the camera |

## How it's built (`viewer.js`)

- **Pixels**: the WebGL canvas *is* the internal resolution (320×180 by default, `antialias: false`). CSS scales it by an integer with `image-rendering: pixelated`. There's no post pass, because every shader already outputs exact palette colours. There's no dithering and no outline.
- **Shading**: toon bands. `dot(normal, light)` picks one of four ramp entries, so each surface is made of flat colour bands. The key light comes from the top left, about 40° off the default view, which gives Planetarium's concentric crescents.
- **Planet**: a sphere whose shader uses 3D simplex fbm for land and ocean, with shallow-water and highland steps and noisy polar caps.
- **Clouds**: many small clumps of instanced icosphere puffs, squashed to 60% along the radial axis so they hug the surface. Each clump domes in the middle, so it still bumps past the silhouette at the limb. They sit on 150 golden-spiral sites that are kept more often in two latitude belts. Each puff's own normal is blended with the planet's radial direction, giving every clump a cream top and a shaded underside. The clouds spin slightly faster than the ground.
- **Ring**: one thin band of 1,500 points, densest in the middle. Every dot is exactly 1 internal pixel at every resolution. Points in the planet's shadow use the darkest ring colour.
- **Astronaut**: one signed-distance body, raymarched inside a proxy box and composited with `gl_FragDepth`. It's made from primitives: a helmet sphere (the top 40%), a rounded-box torso, a backpack wider than the torso, mitts and boots. Each arm and leg is one continuous bent tube (shoulder→elbow→wrist, hip→knee→ankle), smooth-unioned so the bend has no seam. Elbows and knees are softly bent, and they flex with the idle bob. Because it is one surface, one lighting pass shades the whole body. Cast shadows (arm on torso, helmet on shoulders) and contact occlusion come from marching the same field toward the light, then snapping to the 4-step suit ramp. The suit is a cool white. The visor is near-black blue in two tones plus a white glint. **Contributor colour** is on the backpack stripe and a band around each upper arm (shoulder bands), so it's readable from any angle.
- **Depth darkening**: each whole object picks one of four levels from its camera distance (switch points at 12, 26 and 44). Its ramps are swapped for precomputed steps: `lerp(colour, #262a46, 0 / 0.35 / 0.7)`, then `lerp(colour, #110f18, 0.88)` for the last step. That gives about -35% value at mid, about -70% far, and a near-black silhouette with a faint pastel hint furthest out. Every step is a fixed palette colour; there are no gradients.

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
| suit (cool white) | `#68718f` `#a3aec8` `#d3dcea` `#f2f6fc` |
| gear (mitts, boots, backpack, visor rim) | `#4a5170` `#77819f` `#a2adc6` `#c4cee0` |
| visor | `#0f1329` `#232f58` |
| visor glint | `#f4f8ff` |
| contributor coral | `#6e3a4c` `#b85c66` `#f08e7f` `#ffc4a8` |
| contributor mint | `#2c5a5a` `#3f9886` `#6fd1b0` `#bff2da` |
| contributor lilac | `#433a74` `#7563bd` `#a993ec` `#dccfff` |
| depth tint | `#262a46` (0.35 mid, 0.7 far), `#110f18` (0.88 silhouette) |

## Screenshots

| File | Shows |
|---|---|
| `screenshots/planet-closeup.png` | Seed 7 with ring, 320×180 ×4 |
| `screenshots/planet-no-ring.png` | Same, ring off |
| `screenshots/planet-seed-311.png` | Another seed |
| `screenshots/crew-closeup.png` | Coral, mint and lilac astronauts |
| `screenshots/depth-scene.png` | Planet and astronaut copies at all four depth steps, fade on |
| `screenshots/depth-scene-off.png` | Same scene, fade off, for comparison |
| `screenshots/pixel-120.png` | Chunkier pixels: 213×120 ×6 |
| `screenshots/pixel-360.png` | Finer pixels: 640×360 ×2 |
