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
| contributor | Sets the backpack-stripe, shoulder-band and face colour of the solo astronauts in the depth scene. The crew line-up always shows all three |
| eyes, mouth | Face override for every astronaut; `auto` hashes the face from the contributor's handle |
| pixel h | Internal height from 120 to 480. Width is 16:9, and the canvas is upscaled by the largest integer factor that fits, with nearest-neighbour filtering |
| depth fade | Turns depth darkening on or off |
| rotate | Pauses or resumes planet and cloud spin |
| palette | v2 (current) or v1 (batch 1 pastels), for comparison |
| drag / scroll | Orbits and zooms the camera |

## How it's built (`viewer.js`)

- **Pixels**: the WebGL canvas *is* the internal resolution (320×180 by default, `antialias: false`). CSS scales it by an integer with `image-rendering: pixelated`. There's no post pass, because every shader already outputs exact palette colours. There's no dithering and no outline.
- **Shading**: toon bands. `dot(normal, light)` picks one of four ramp entries, so each surface is made of flat colour bands. The key light comes from the top left, about 40° off the default view, which gives Planetarium's concentric crescents.
- **Planet**: a sphere whose shader uses 3D simplex fbm for land and ocean, with shallow-water and highland steps and noisy polar caps.
- **Clouds**: instanced icosphere puffs squashed to 60% along the radial axis, so they hug the surface. Placement is noise-driven, like Planetarium. A low-frequency fbm field makes a few large merged masses, and a latitude-stretched field makes long east-west streaks. Wherever both fields are low the sky stays clear. Denser spots get bigger, higher puffs, so cores merge and dome past the silhouette, and a few small strays scatter at the edges of the weather. Every puff gets at least one smaller satellite beside it, and thin weather and strays get 2–3, so no lone sphere reads as a white ball. Each puff's normal is blended with the planet's radial direction, so a mass shades as one body with a lumpy edge. The clouds spin slightly faster than the ground.
- **Ring**: one thin band of 1,500 points, densest in the middle. Every dot is exactly 1 internal pixel at every resolution. Points in the planet's shadow use the darkest ring colour.
- **Astronaut**: one signed-distance body, raymarched inside a proxy box and composited with `gl_FragDepth`. It's made from primitives: a helmet sphere (the top 48%, so the head is big and the body small), a rounded-box torso, a backpack wider than the torso, mitts and boots. Each arm and leg is one continuous bent tube (shoulder→elbow→wrist, hip→knee→ankle), smooth-unioned so the bend has no seam. Elbows and knees are softly bent, and they flex with the idle bob. Because it is one surface, one lighting pass shades the whole body. Cast shadows (arm on torso, helmet on shoulders) and contact occlusion come from marching the same field toward the light, then snapping to the 4-step suit ramp. The suit is a cool white. The visor is a ~4:3 rounded-rect "screen" (a superellipse in yaw and pitch) with a gear-tone bezel, in two near-black blue tones plus a small white glint. **Contributor colour** is on the backpack stripe and a band around each upper arm (shoulder bands), so it's readable from any angle.
- **Faces** (`faces.js`): ASCII faces after the ApprenticeHack avatars. There are 13 eye sets and 9 mouths, with eye glyphs spaced evenly about the centre and an optional mouth below. Each is a hand-drawn pixel bitmap, because font text turns to mush at this resolution. They're stamped into a 32×24 texture per astronaut and sampled with `texelFetch` from the visor's yaw/pitch coordinates, so they turn with the head and one texel is about one pixel in the crew close-up. Faces glow in the contributor colour and ignore scene lighting. Eyes and mouth are picked from the contributor's handle with ApprenticeHack's `hashStr(handle + 'e' / 'm')`: `@caden` (coral) gets `⌐■_■` + `ᴗ`, `@mira` (mint) gets `■■■■` + `▽`, and `@juno` (lilac) gets `◕   ↼` + `—`.
- **Depth darkening**: each whole object picks one of four levels from its camera distance (switch points at 12, 26 and 44). Its ramps are swapped for precomputed steps: `lerp(colour, #1b1f4a, 0 / 0.38 / 0.72)`, then `lerp(colour, #17172f, 0.88)` for the last step. That gives about -35% value at mid, about -70% far, and a dark navy silhouette with a faint hint of colour furthest out. The silhouette tint sits a touch above the near-black space so it still reads. Every step is a fixed palette colour; there are no gradients.

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

## Screenshots

| File | Shows |
|---|---|
| `screenshots/planet-closeup.png` | Seed 7 with ring, 320×180 ×4 |
| `screenshots/planet-no-ring.png` | Same, ring off |
| `screenshots/planet-seed-311.png` | Another seed |
| `screenshots/crew-closeup.png` | Coral, mint and lilac astronauts with their three hashed faces |
| `screenshots/crew-face-switch.png` | Same crew with the face switch set to `◉   ◉` + `◡` |
| `screenshots/depth-scene.png` | Planet and astronaut copies at all four depth steps, fade on |
| `screenshots/depth-scene-off.png` | Same scene, fade off, for comparison |
| `screenshots/pixel-120.png` | Chunkier pixels: 213×120 ×6 |
| `screenshots/pixel-360.png` | Finer pixels: 640×360 ×2 |
| `screenshots/palette-before-after.png` | Depth scene, v1 palette (left) vs v2 (right). `palette-v1-depth.png` is its input |
