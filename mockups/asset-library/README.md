# Asset library

A demo playground for every Commet asset built so far: browse them, open one on a large live stage, change any setting, compose several into a scene, edit single palette colours, and save the result as a URL, a JSON block or a PNG. The feature doc is [`docs/features/asset-library.md`](../../docs/features/asset-library.md), and the style is [`docs/design/art-direction.md`](../../docs/design/art-direction.md).

The library doesn't have its own renderer. Every planet, moon, ring, cloud layer and astronaut is built by the asset viewer's own factories (`../asset-viewer/viewer.js`), drawn by its renderer and camera, and posed and depth-tinted by its own helpers. An asset in the library is therefore pixel-identical to the same asset in the viewer, and `npm test` checks that.

A throwaway mockup, not product code.

## Run

```sh
npm install
npm run dev     # http://127.0.0.1:5190/asset-library/  (loopback only; PORT=... to change)
npm test        # state unit tests + browser tests (headless Chromium + SwiftShader, no socket, no network)
npm run shots   # review screenshots in out/ (node shots.mjs <name> for one)
```

The server binds `127.0.0.1` and nothing else. It serves only an allowlist (`routes.mjs`): this folder, three from this folder's `node_modules`, and the top-level modules of `../asset-viewer` and `../explorations/astronaut-lab`. The page makes no other requests. The browser tests are slow on a busy machine (each file boots SwiftShader; 1–3 minutes each).

## Using it

| Area | What it does |
|---|---|
| Catalogue (left) | Thumbnails grouped by type: astronauts (crew K), planets by biome, moons, rings, clouds, FX, palettes and explorations. Final assets carry a teal **final** badge. The exploration archive has dashed amber tiles and an **exploration** badge. ASCII FX that live only in the ascii-fx mockup are listed as **not yet ported**. Click a tile to open it |
| Stage (centre) | The asset at the internal resolution (320×180 by default), upscaled by the largest whole factor that fits. Drag to orbit, scroll to zoom. The badge says whether it's a final asset or an exploration |
| inspect | Every control for the open asset (below) |
| compose scene | Add planets and astronauts (or the asset in the inspector), duplicate or remove them, click one on the stage to select it, **shift-drag** to move it in the view plane, or set x, y and z (depth) exactly. The selected item gets the same controls as the inspector. Presets: the viewer's depth scene, and a planet with three crew |
| palette | The base palette with every colour as a swatch. Click a swatch to edit it with a colour picker or a hex value, copy its hex, or reset it to the base. Edits apply live to the stage and every thumbnail. There is no whole-palette swapping |
| copy URL / copy JSON / import JSON | The whole configuration (asset or scene, render settings, camera, palette edits) is the URL hash. Copy JSON gives the same thing as a readable block; import JSON accepts one back. Out-of-range or unknown values fall back to their defaults |
| PNG / PNG ×4 | The current frame at internal resolution, or upscaled ×4 with nearest neighbour |

Inspector controls by asset:
- **Astronaut (crew K):** contributor colour (the three BLK 36 presets, or any colour), eye design (auto from the handle, or any of the 10 V2 designs), eye glow colour, handle, bob phase, view angle, blink, framing (full figure, crew close-up, face close-up).
- **Planet:** biome, seed, size, lava mode, ring (off/thin/wide, width, distance), clouds (cover, float, shadow), moons (on/off; size, orbit, tilt, yaw and phase per moon), artefacts (on, auto by size or 1–5 sectors, teal accent), dark halo, and layer isolation (body, haze, clouds, ring), so moons, rings or clouds can be shown on their own. Moons, rings, clouds and FX are planet configurations that open with their own control group first.
- **Exploration (astronaut A–J):** variant, contributor preset, eyes, view angle, sway. These render through the astronaut lab's own module (`../explorations/astronaut-lab/astronaut.js`), read-only.
- **Render (all):** time (pinned or playing), rotate, pixel height, depth fade, depth mode and bands, loop period, surface and cloud turns.

**Free contributor colours.** The art direction keeps the crew on BLK 36 exactly. Any other colour is a playground override, and the inspector says so. Its darker and lighter steps are walked over BLK 36 with the viewer's own ramp builder (`rampThrough` in `palette-map.js`), so a BLK 36 colour gets exactly its preset ramp.

**Determinism.** A URL renders a still frame at its pinned time, unless it says `play`. The same URL always gives the same pixels: a pinned frame reads neither the clock nor `Math.random` (only playback reads the clock, to advance the time).

## How it's built

| File | What |
|---|---|
| `state.js` | The state object, its defaults and `normalise()`, the one validation boundary for URLs and pasted JSON. Also the hash and JSON encodings. Pure, so it's tested in Node |
| `palette.js` | The base palette (the viewer's `final` plus the [OIII] teal), the editor's groups, and the edits. They live in one viewer palette, `PALETTES.library`, rewritten in place when the edits change; the viewer then drops its cached depth fades |
| `engine.js` | `Stage`: a scene of items built from the viewer's factories, posed and tinted in the viewer's frame order. Also the stage render and the off-screen thumbnail render |
| `catalogue.js` | The catalogue entries (starting configurations) and the scene presets |
| `library.js` | The UI: catalogue, inspector, composer, palette editor, presets, and `window.library` for the tests |
| `routes.mjs`, `serve.mjs` | The file allowlist and the loopback dev server |
| `shots.mjs`, `test/` | Screenshots and tests, both through Playwright request interception |

**Changes to the asset viewer** (behaviour-preserving; its `npm test` passes and its screenshots are pixel-identical):
- `viewer.js` exports its factories (`makePlanet`, `makeAstronaut`, `makeSky`, `makeStars`), renderer, camera, controls and views. The glue that `frame()`, `applyState()` and `resize()` used inline is now exported helpers (`poseWorld`, `depthLevelAt`, `applyDepth`, `setLoop`, `setPixelSize` / `setViewSize`, `usePalette`, `retint`). `usePalette(name, { edited: true })` clears the depth-fade cache for a palette edited in place.
- `window.ASSET_VIEWER_LIBRARY = true`, set before the module loads, is library mode: no showcase scene, UI or animation loop.
- The astronaut's eye light is its own uniform (`uEyeGlow`), the same colour as before by default; `setColor(key, eyeGlow)` takes an optional eye-light key, and `resolve()` reads a `#rrggbb` key as that colour. `group.userData.blink = false` holds the eyes open. `makePlanet` returns its parts and moons, and `makeAstronaut` returns its material. `rebuild` takes an optional cloud float.
- `palette-map.js` exports `rampThrough()`.

## Tests

| File | Checks |
|---|---|
| `test/state.test.mjs` | `normalise()` clamps ranges, checks enums and hex colours, drops malformed palette paths; hash and JSON round-trip every catalogue entry and both scene presets; bad input is rejected |
| `test/fidelity.test.mjs` | R7: a lush planet (seed 7), a lava planet (seed 11) and the crew close-up (six K astronauts, four planets) are pixel-identical to the asset viewer at the same config; the showcase preset's positions, yaws and phases match the viewer's objects; the library's enums match the viewer's exports |
| `test/presets.test.mjs` | R5/R8: config → URL → a fresh page load renders identical pixels (a free-colour astronaut at 240p with a moved camera, a scene in object depth with palette edits, a custom ring); copy JSON → import dialog renders identical pixels; PNG ×1 is the stage and ×4 is whole 4×4 blocks |
| `test/palette.test.mjs` | R4: editing one colour changes exactly that role's pixels (land, ring, lava glow, suit, a contributor ramp), and reset restores the frame; the swatch → hex → reset UI |
| `test/scene.test.mjs` | R3: a planet with three astronauts renders the same frame after other work and in a fresh page, with every item in the frame; click selects, shift-drag moves only the selection, and the list adds and removes items |

Every render test fails on empty output.

## Not ported

The ASCII FX candidates other than planet artefacts are fog of war, glitch packets, terminal, drifting bands, the pixel ↔ glyph transition and decode tags. They exist only in `feature/ascii-fx` (29c64a1, `mockups/ascii-fx/fx.js`). Fog, packets and tags are choreography written for that mockup's own system scene. Terminal, bands and the transition need its post pass (a cell-stats pass, the composite shader, the glyph atlas and three data layers), and `fx.js` builds its renderer at import time, so it can't be imported. Porting them would mean copying about 300 lines of shader from an unmerged branch, so they show in the catalogue as **not yet ported**. The clean route is the same extraction the viewer got (export the post pass from `fx.js`), done once that branch lands.

## Screenshots (`out/`)

| File | Shows |
|---|---|
| `catalogue.png` | The whole catalogue (tall viewport) |
| `inspector-astronaut.png`, `inspector-astronaut-face.png` | K in a free colour with binocular eyes; the face close-up |
| `inspector-planet.png`, `inspector-moon.png`, `inspector-ring.png`, `inspector-clouds.png`, `inspector-fx.png` | One of each planet-based asset type, with its controls |
| `inspector-exploration.png` | Lab variant C, badged as an exploration |
| `palette-editor.png` | Three edited land and ocean colours, live on the stage and the thumbnails |
| `scene.png`, `scene-showcase.png` | A lava planet with three crew and a selection; the viewer's depth scene rebuilt as a composition |
| `narrow-1280.png` | The narrower layout at 1280 px |
