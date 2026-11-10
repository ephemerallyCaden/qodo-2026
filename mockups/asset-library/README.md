# Asset library

A demo playground for every Commet asset built so far: browse them, open one on a large live stage, change any setting, compose several into a scene, edit single palette colours, and save the result as a URL, a JSON block or a PNG. A history tab shows how each asset family got to its final look. The feature doc is [`docs/features/asset-library.md`](../../docs/features/asset-library.md), and the style is [`docs/design/art-direction.md`](../../docs/design/art-direction.md).

The library doesn't have its own renderer. Every planet, moon, ring, cloud layer and astronaut is built by the asset viewer's own factories (`../asset-viewer/viewer.js`), drawn by its renderer and camera, and posed and depth-tinted by its own helpers. An asset in the library is therefore pixel-identical to the same asset in the viewer, and `npm test` checks that.

A throwaway mockup, not product code.

## Run

```sh
npm install
npm run dev     # http://127.0.0.1:5190/asset-library/  (loopback only; PORT=... to change)
npm test        # state unit tests + browser tests (headless Chromium + SwiftShader, no socket, no network)
npm run shots   # review screenshots in out/ (node shots.mjs <name> for one)
```

The server binds `127.0.0.1` and nothing else, and answers only GET and HEAD. It serves only an allowlist (`routes.mjs`): this folder, three from this folder's `node_modules`, the top-level modules of `../asset-viewer` and `../explorations/astronaut-lab`, and the archived renders the history tab names (below). The page makes no other requests. The browser tests are slow on a busy machine (each file boots SwiftShader; 1–3 minutes each).

**The art archive.** The history tab's archived renders are read from the local art archive, `<main-checkout>/.archive/art-iteration/`. It's gitignored and local only, and nothing from it is copied into git. `ART_ARCHIVE=/path npm run dev` points at another copy. The server finds the default through `git rev-parse --git-common-dir`, then serves it read-only at `/art-archive/<path>`, with these limits:
- only the image files `history.js` names (an exact allowlist), and only PNG and GIF;
- only when the file's real path, after symlinks, is a file inside the archive's real root;
- traversal, encoded or not, is rejected, and nothing is listed.

Without the archive, the history tab still works and says which images aren't available.

## Using it

| Area | What it does |
|---|---|
| Catalogue (left) | Thumbnails grouped by type: astronauts (crew K), planets, moons, rings, clouds, FX, palettes and explorations. Each planet tile says what its look means (art direction §6). The bands run worst to best: lava, toxic (the ember band, #19) and ash (the desert look), then healthy, whose three looks are lush, ocean and ice. Gas giant and barren moon are badged **library extra**, and ring tiles are badged **meaning open**. Final assets carry a teal **final** badge. The exploration archive has dashed amber tiles and an **exploration** badge. ASCII FX that live only in the ascii-fx mockup are listed as **not yet ported**. Click a tile to open it |
| Stage (centre) | The asset at the internal resolution (320×180 by default), upscaled by the largest whole factor that fits. Drag to orbit, scroll to zoom. The badge says whether it's a final asset or an exploration |
| inspect | Every control for the open asset (below) |
| compose scene | Add planets and astronauts (or the asset in the inspector), duplicate or remove them, click one on the stage to select it, **shift-drag** to move it in the view plane, or set x, y and z (depth) exactly. The selected item gets the same controls as the inspector. Presets: the viewer's depth scene, and a planet with three crew |
| palette | The base palette with every colour as a swatch. Click a swatch to edit it with a colour picker or a hex value, copy its hex, or reset it to the base. Edits apply live to the stage and every thumbnail. There is no whole-palette swapping |
| history | The iteration view (R10): pick a family (crew, planets and biomes, toxic, lava, clouds, rings, palettes, depth, ASCII FX, drones) and its timeline lists every step, oldest to final. Each step shows its date, commit, what changed and why. Its badges say how it shows: **live**, **archived image** or **no render**, then **final**, **exploration** or a tag. A live step renders on the stage with today's code, as an old parameter set or an old palette on today's shapes. Lab variants, the 25 Lospec palettes, the depth bands, the lava modes and the ring presets are picked from a list. An archived step shows its render from the local archive as whole pixels. **compare** puts a second step beside it, side by side or stacked, oldest first. A live step with no history colours can **open in inspector** (or the composer) to configure further. Palette edits don't apply here, and history colours never reach the catalogue, the inspector or the palette tab |
| copy URL / copy JSON / import JSON | The whole configuration (asset or scene, render settings, camera, palette edits) is the URL hash. Copy JSON gives the same thing as a readable block; import JSON accepts one back. Out-of-range or unknown values fall back to their defaults |
| PNG / PNG ×4 | The current frame at internal resolution, or upscaled ×4 with nearest neighbour |

Inspector controls by asset:
- **Astronaut (crew K):** contributor colour (the three BLK 36 presets, or any colour), eye design (auto from the handle, or any of the 10 V2 designs), eye glow colour, handle, bob phase, view angle, blink, framing (full figure, crew close-up, face close-up).
- **Planet:** biome, seed, size, lava mode, ring (off/thin/wide, width, distance), clouds (cover, float, shadow), moons (on/off; size, orbit, tilt, yaw and phase per moon), artefacts (on, auto by size or 1–5 sectors, teal accent), dark halo, and layer isolation (body, haze, clouds, ring), so moons, rings or clouds can be shown on their own. Moons, rings, clouds and FX are planet configurations that open with their own control group first.
- **Exploration (astronaut A–J):** variant, contributor preset, eyes, view angle, sway. These render through the astronaut lab's own module (`../explorations/astronaut-lab/astronaut.js`), read-only.
- **Render (all):** time (pinned or playing), rotate, pixel height, depth fade, depth mode and bands, loop period, surface and cloud turns.

The planet controls say what the biome means, and the ring controls say that a ring's meaning is open.

**Free contributor colours.** The art direction keeps the crew on BLK 36 exactly. Any other colour is a playground override, and the inspector says so. Its darker and lighter steps are walked over BLK 36 with the viewer's own ramp builder (`rampThrough` in `palette-map.js`), so a BLK 36 colour gets exactly its preset ramp.

**Determinism.** A URL renders a still frame at its pinned time, unless it says `play`. The same URL always gives the same pixels: a pinned frame reads neither the clock nor `Math.random` (only playback reads the clock, to advance the time).

## How it's built

| File | What |
|---|---|
| `state.js` | The state object, its defaults and `normalise()`, the one validation boundary for URLs and pasted JSON. Also the hash and JSON encodings. Pure, so it's tested in Node |
| `palette.js` | The base palette (the viewer's `final` plus the [OIII] teal), the editor's groups, and the edits. They live in one viewer palette, `PALETTES.library`, rewritten in place when the edits change; the viewer then drops its cached depth fades. History palettes are separate viewer palettes (`history-main`, `history-cmp`, `history-thumb`), active only while a history step renders |
| `engine.js` | `Stage`: a scene of items built from the viewer's factories, posed and tinted in the viewer's frame order. Also the stage render and the off-screen render (one target per size: catalogue and timeline thumbnails, the history comparison) |
| `catalogue.js` | The catalogue entries (starting configurations), what each planet look means (`BIOME_MEANING`), and the scene presets |
| `history.js` | The iteration view's data: ten families of dated steps (what changed, why, live view or archived image), the history palettes copied from git (checked against it by the tests), and `IMAGES`, the archive allowlist. Pure |
| `library.js` | The UI: catalogue, inspector, composer, palette editor, presets, the iteration view, and `window.library` for the tests |
| `routes.mjs`, `serve.mjs` | `route()`, the one routing decision (the file allowlist and the archive route), and the loopback dev server. The test harness intercepts requests with the same `route()` |
| `shots.mjs`, `test/` | Screenshots and tests, both through Playwright request interception |

**Changes to the asset viewer** (behaviour-preserving; its `npm test` passes and its screenshots are pixel-identical):
- `viewer.js` exports its factories (`makePlanet`, `makeAstronaut`, `makeSky`, `makeStars`), renderer, camera, controls and views. The glue that `frame()`, `applyState()` and `resize()` used inline is now exported helpers (`poseWorld`, `depthLevelAt`, `applyDepth`, `setLoop`, `setPixelSize` / `setViewSize`, `usePalette`, `retint`). `usePalette(name, { edited: true })` clears the depth-fade cache for a palette edited in place.
- `window.ASSET_VIEWER_LIBRARY = true`, set before the module loads, is library mode: no showcase scene, UI or animation loop.
- The astronaut's eye light is its own uniform (`uEyeGlow`), the same colour as before by default; `setColor(key, eyeGlow)` takes an optional eye-light key, and `resolve()` reads a `#rrggbb` key as that colour. `group.userData.blink = false` holds the eyes open. `makePlanet` returns its parts and moons, and `makeAstronaut` returns its material. `rebuild` takes an optional cloud float.
- `palette-map.js` exports `rampThrough()`.
- `shots.mjs` captions the toxic row of the variety sheet `toxic`, no longer `toxic (extra)`, since toxic is now a health band (#19).

## Tests

| File | Checks |
|---|---|
| `test/state.test.mjs` | `normalise()` clamps ranges, checks enums and hex colours, drops malformed palette paths; hash and JSON round-trip every catalogue entry and both scene presets; bad input is rejected |
| `test/fidelity.test.mjs` | R7: a lush planet (seed 7), a lava planet (seed 11) and the crew close-up (six K astronauts, four planets) are pixel-identical to the asset viewer at the same config; the showcase preset's positions, yaws and phases match the viewer's objects; the library's enums match the viewer's exports |
| `test/presets.test.mjs` | R5/R8: config → URL → a fresh page load renders identical pixels (a free-colour astronaut at 240p with a moved camera, a scene in object depth with palette edits, a custom ring); copy JSON → import dialog renders identical pixels; PNG ×1 is the stage and ×4 is whole 4×4 blocks |
| `test/palette.test.mjs` | R4: editing one colour changes exactly that role's pixels (land, ring, lava glow, suit, a contributor ramp), and reset restores the frame; the swatch → hex → reset UI |
| `test/scene.test.mjs` | R3: a planet with three astronauts renders the same frame after other work and in a fresh page, with every item in the frame; click selects, shift-drag moves only the selection, and the list adds and removes items |
| `test/routes.test.mjs` | R11 and R8 (Node, a temp fixture archive): the archive route serves only allowlisted PNG/GIF files inside the archive's real root, to GET and HEAD. It rejects traversal (plain, `%2e%2e`, `..%2f`, double-encoded, backslash, null byte, malformed), symlinks out of the archive, image names on non-images, directories, listings, unlisted files and other methods. Without an archive every archive request is a 404. The dev server binds 127.0.0.1 only |
| `test/history.test.mjs` | R9 and R10 (Node): planet tiles say their meaning worst to best, extras and rings are tagged, and no Nov 3 meaning or acid lime is left outside the history. Every family is dated oldest to final, with one final step and what changed and why for each. Every live step and option is a valid state that survives the URL. The history state is clamped. The copied history palettes match git at their source commits, and every step's commit exists |
| `test/history-view.test.mjs` | R10 and R11 in the browser: the acid-lime step shows lime on the stage while the catalogue's toxic tile stays ember, even when it renders during the history view. The final toxic step is the inspector's toxic pixel for pixel. Three history URLs with comparisons reload to identical pixels in both panes. An archived step shows the fixture archive's image, or says it isn't available without the archive. The tab, step and compare clicks work, and **open in inspector** keeps the pixels |

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
| `history-toxic.png` | The toxic timeline: acid lime (live, in history colours) beside rust-ember (final) |
| `history-crew.png` | The V1 ASCII glyph faces (archived image) beside K (live, final) |
| `history-palettes.png` | The v1 pastels beside research ×2, both live on today's shapes |
| `history-depth.png` | The reverted depth colour budgets (archived) beside pixel-smooth (live) |
| `history-planets.png` | The planets' final step: the health bands worst to best, live |
| `history-lab.png` | Astronaut lab variant C, live, picked from the A–J list |
| `history-drones.png` | The gear-grey drone shells beside D-final, both archived images |
| `history-no-archive.png` | The crew's archived step without the archive: "archived image not available" |
