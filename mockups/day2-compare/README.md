# Day 2 comparison: three.js defaults vs Commet house rules

The same scene built twice: once the way a coding agent builds it with three.js defaults, and once by the asset viewer under the house rules (`AGENTS.md` Rules 4 and 5). A checker then turns each render into a line of numbers, because Qodo can't see images.

The scene is the asset viewer's hero lush planet (seed 7) with its clouds, thin ring and two moons, plus the three-astronaut crew. Both builds use the viewer's depth-view camera at loop time 0 s. The viewer's depth copies and solo astronauts are hidden.

## Run

```sh
(cd ../asset-viewer && npm ci)   # the house render loads the asset viewer
npm ci
npm run render                   # out/*.png, out/checker.txt, scene-palette.json (~45 s)
node render.mjs --gif            # the same, plus out/motion.gif (~5 min)
node check.mjs <file.png> ...    # one line per file; exit 1 on a blank or empty image, 2 on no arguments
npm test                         # checker tests (synthetic images, blank rejection, PNG decoder, checker.txt up to date)
```

Everything runs in headless Chromium (SwiftShader). Pages are served through Playwright request interception (`static.mjs`), so no socket is opened and nothing touches the network. Two runs give byte-identical outputs.

## Outputs (`out/`)

| File | What |
|---|---|
| `defaults.png` | The defaults build at 1280×720 |
| `house.png` | The house-rules render: 320×180 internal, ×4 nearest to 1280×720 |
| `house-320x180.png` | The same at its internal resolution |
| `compare.png` | Both side by side at the same display size, with captions outside the images |
| `checker.txt` | The checker line for each render, plus the motion speed ranges |
| `motion.gif` | Eased (defaults) vs constant-rate (house) motion over one 24 s loop, 6 fps, side by side |

## The defaults build (`defaults/main.js`)

This is what an agent produces when nobody stops it. The goal is a plausible "nice" three.js scene, not a sabotaged one:
- `MeshStandardMaterial` everywhere, plus a `MeshPhysicalMaterial` clearcoat visor;
- an `AmbientLight` and a `DirectionalLight` with `PCFSoftShadowMap` shadows;
- `antialias: true` and `setPixelRatio(devicePixelRatio)` at full window size;
- mipmapped, linear-filtered canvas textures with maximum anisotropy;
- `EffectComposer` → `RenderPass` → `UnrealBloomPass` → `OutputPass`, with glowing emissive eyes;
- `OrbitControls` damping, and GSAP-style repeating tweens on the spin, clouds and moons.

It keeps the house build's inputs, so the only difference is the pipeline. The colours come from the same palette modules (v2 ramps, BLK 36 crew roles). The continents come from the viewer's own noise field and seed 7. Camera, light direction, ring tilt, moon orbits and crew placement are the viewer's (`scene.js`).

Judgement calls:
- **Colours from the palette modules, not literals.** An agent would type hex values. Taking them from the modules keeps the comparison about rendering, not colour choice.
- **No background set.** three.js clears to its default black, which is what an agent gets without trying.
- **No tone mapping.** This is three's default (`NoToneMapping`). ACES would be a common addition, but it would shift the v2 colours further.
- **MSAA on the composer's target** (`samples: 4`). `antialias: true` doesn't reach an `EffectComposer`, and three's documented fix is a multisampled target. Without it the build would look jagged, which would be sabotage-by-omission.
- **devicePixelRatio is 1** in headless Chromium, so the canvas is 1280×720. On a retina display it would be 2560×1440, with even more colours.
- **Seeded PRNG for the stars and ring bands.** An agent would use `Math.random`. The seed keeps the render reproducible, and it doesn't change the look.
- **Eased motion** is a repeating tween per layer, e.g. `gsap.to(planet.rotation, { y: -2 * Math.PI, duration: 12, repeat: -1 })` with GSAP's default `power1.out` ease, and `sine.inOut` on the moons. Its periods match the house loop, so at 0 s (and every 12 s) both builds show the same pose. The stills are taken there.
- **Transparent cloud sphere.** Thin clouds over black space at the limb read as dark streaks. That's what a transparent `MeshStandardMaterial` shell does, so it is left in.

## The checker (`check.mjs`)

It reads a PNG (`png.mjs`: 8-bit RGB/RGBA, no interlace) and reports:
- **unique colours**;
- **on palette**: the pixel is exactly one of our colours. Those are the v2 world ramps (`V2_PLANET_RAMPS`), the v2 space and stars, the BLK 36 crew roles from art-direction §4 (not all 36 colours: BLK 36 includes `#000000`), and the [OIII] teal ramp;
- **depth fade**: the pixel equals `mix(paletteColour, tint, a)` within **±1.5/255 per channel**. The tint runs along v2's depth tints (`#1b1f4a` to `#17172f`) and `a` is at most 0.88, v2's top strength. That covers everything the pixel-smooth depth fade can output;
- **off palette**: everything else;
- **pure black**: exactly `#000000`;
- **near black**: every channel at most 8/255, such as the faint bloom haze over a black clear colour. v2 space `#0d0b16` is not near black;
- **teal**: exactly on the teal ramp.

An image is rejected as blank when under 1% of its pixels differ from its most common colour. The v2 space, star and depth values live only in `viewer.js`, which needs a browser, so `render.mjs` copies them from the live viewer into `scene-palette.json`. A test pins them to the art-direction values.

Nearest-neighbour upscaling doesn't change any of these numbers: `house-320x180.png` and `house.png` give the same line.

The depth-fade test is a geometric one, so some dark pixels in the defaults render pass it by coincidence. Read the defaults' depth-fade share as "near a fade line", not as a fade.

## Asset viewer change

`viewer.js` gains one additive line at the end, `window.viewer.internals = { … }`, so this page can hide the depth copies and solos and read the frame. It matches the camera-mode mockups' line on `feature/camera-mockups`, plus `planets`, `crew` and `solos`.
