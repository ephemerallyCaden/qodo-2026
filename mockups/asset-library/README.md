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

The server binds `127.0.0.1` and nothing else, and answers only GET and HEAD. It serves only an allowlist (`routes.mjs`): this folder, three from this folder's `node_modules`, the top-level `*.js` modules of `../asset-viewer`, `../explorations/astronaut-lab`, `../drone-lab` and `../debris-lab` (never their tests, outputs, scripts or `node_modules`), and the archived renders the history tab names (below). The page makes no other requests. The browser tests are slow on a busy machine (each file boots SwiftShader; 1–3 minutes each).

**The art archive.** The history tab's archived renders are read from the local art archive, `<main-checkout>/.archive/art-iteration/`. It's gitignored and local only, and nothing from it is copied into git. `ART_ARCHIVE=/path npm run dev` points at another copy. The server finds the default through `git rev-parse --git-common-dir`, then serves it read-only at `/art-archive/<path>`, with these limits:
- only the image files `history.js` names (an exact allowlist), and only PNG and GIF;
- only when the file's real path, after symlinks, is a file inside the archive's real root;
- traversal, encoded or not, is rejected, and nothing is listed.

Without the archive, the history tab still works and says which images aren't available.

## Using it

| Area | What it does |
|---|---|
| Catalogue (left) | Thumbnails grouped by type: astronauts (crew K), drones, planets, moons, rings, debris, clouds, FX, palettes and explorations. A thumbnail renders when its tile scrolls near the view. Each planet tile says what its look means (art direction §6). The bands run worst to best: lava, toxic (the ember band, #19) and ash (the desert look), then healthy, whose three looks are lush, ocean and ice. Gas giant and barren moon are badged **library extra**, and ring tiles are badged **meaning open**. Beside desert, **dustier ash · trial** is a proposed ash look (health-looks P2), badged **trial**; the **Trial: dustier ash** group lays it in the lineup, lava → toxic → ash → ash (trial) → lush down, hero | mid distance across. Final assets carry a teal **final** badge. The exploration archive has dashed amber tiles and an **exploration** badge. ASCII FX that live only in the ascii-fx mockup are listed as **not yet ported**. Click a tile to open it |
| Stage (centre) | The asset at the internal resolution (320×180 by default), upscaled by the largest whole factor that fits. Drag to orbit, scroll to zoom. The badge says whether it's a final asset or an exploration |
| inspect | Every control for the open asset (below) |
| compose scene | Add planets and astronauts (or the asset in the inspector), duplicate or remove them, click one on the stage to select it, **shift-drag** to move it in the view plane, or set x, y and z (depth) exactly. The selected item gets the same controls as the inspector. Presets: the viewer's depth scene, and a planet with three crew |
| palette | The base palette with every colour as a swatch. Click a swatch to edit it with a colour picker or a hex value, copy its hex, or reset it to the base. Edits apply live to the stage and every thumbnail. There is no whole-palette swapping |
| history | The iteration view (R10): pick a family (crew, planets and biomes, toxic, lava, clouds, rings, debris, palettes, depth, ASCII FX, drones) and its timeline lists every step, oldest to final. Each step shows its date, commit, what changed and why. Its badges say how it shows: **live**, **archived image** or **no render**, then **final**, **exploration** or a tag. A live step renders on the stage with today's code, as an old parameter set or an old palette on today's shapes. Lab variants, the 25 Lospec palettes, the depth bands, the lava modes and the ring presets are picked from a list. An archived step shows its render from the local archive as whole pixels. **compare** puts a second step beside it, side by side or stacked, oldest first. A live step with no history colours can **open in inspector** (or the composer) to configure further. Palette edits don't apply here, and history colours never reach the catalogue, the inspector or the palette tab |
| copy URL / copy JSON / import JSON | The whole configuration (asset or scene, render settings, camera, palette edits) is the URL hash. Copy JSON gives the same thing as a readable block; import JSON accepts one back. Out-of-range or unknown values fall back to their defaults |
| PNG / PNG ×4 | The current frame at internal resolution, or upscaled ×4 with nearest neighbour |

Inspector controls by asset:
- **Astronaut (crew K):** contributor colour (the three BLK 36 presets, or any colour), eye design (auto from the handle, or any of the 10 V2 designs), eye glow colour, handle, bob phase, view angle, blink, framing (full figure, crew close-up, face close-up).
- **Planet:** biome, seed, size, lava mode, ring (off/thin/wide, width, distance), clouds (cover, float, shadow), moons (on/off; size, orbit, tilt, yaw and phase per moon), artefacts (on, auto by size or 1–5 sectors, teal accent), dark halo, and layer isolation (body, haze, clouds, ring), so moons, rings or clouds can be shown on their own. Moons, rings, clouds, debris and FX are planet configurations that open with their own control group first. **Debris** (stale work, R13) can go on any planet. Its controls:
  - on/off, the count (0–24, with the clutter-scale buttons 0, 1, 3, 8, 24), the age mix and a seed (the planet's by default, as the viewer);
  - each piece's kind, age and diff size (an edit turns the viewer's demo items into edited ones);
  - **sweep one**, which breaks the biggest remaining piece apart and starts playback, and **restore swept**;
  - a **selected** piece, drawn in [OIII] teal.

  Past 12, pieces are counted, not drawn. Debris is the asset viewer's own (`makePlanet().setDebris`, A3). A desert planet also has **look: shipped (final) | dustier ash (trial)**, which keeps the seed, and **compare side by side**, which shows the shipped look and the trial in two panes with one camera. The note quotes the measured hero means from `../health-looks/PROPOSALS.md`.
- **Drone (an agent session):** provider (any of the 11: the 10 distinct drones and the unknown agent, which is the generic drone with its own label), or an exploration variant A–E. Also:
  - session seed (the A5 seeded details: trim, one shape detail, personality, sparkles), or the provider's own look;
  - face (idle, working with typed glyphs, or the 12 s motion loop), blink, smoke;
  - view angle (front, 3/4, side, back, or the slider), and a phase offset for scenes;
  - framing (the lab's full tile, or its ×2 close-up);
  - under **drone-lab parameters**, every lab parameter as a slider over the drone's look (edited ones are marked).

  Drones come from the drone lab's own modules (`../drone-lab/drone.js`, `brands.js`), read-only, posed as the lab's `renderTile` poses them (`drones.js`). So they're pixel-identical to the lab, in the lab's own BLK 36 palettes (palette edits don't apply). In a scene they fly beside the crew and planets, but they take no depth fade: their shader is the lab's.
- **Exploration (astronaut A–J):** variant, contributor preset, eyes, view angle, sway. These render through the astronaut lab's own module (`../explorations/astronaut-lab/astronaut.js`), read-only.
- **Render (all):** time (pinned or playing), rotate, pixel height, depth fade, depth mode and bands, loop period, surface and cloud turns.

The planet controls say what the biome means, and the ring controls say that a ring's meaning is open.

**Free contributor colours.** The art direction keeps the crew on BLK 36 exactly. Any other colour is a playground override, and the inspector says so. Its darker and lighter steps are walked over BLK 36 with the viewer's own ramp builder (`rampThrough` in `palette-map.js`), so a BLK 36 colour gets exactly its preset ramp.

**Determinism.** A URL renders a still frame at its pinned time, unless it says `play`. The same URL always gives the same pixels: a pinned frame reads neither the clock nor `Math.random` (only playback reads the clock, to advance the time).

## How it's built

| File | What |
|---|---|
| `state.js` | The state object, its defaults and `normalise()`, the one validation boundary for URLs and pasted JSON. Also the hash and JSON encodings. Pure, so it's tested in Node |
| `palette.js` | The base palette (the viewer's `final` plus the [OIII] teal), the editor's groups, and the edits. They live in one viewer palette, `PALETTES.library`, rewritten in place when the edits change; the viewer then drops its cached depth fades. Look palettes (`lookPalette`) are separate viewer palettes, one per history step's or trial's colours, built once and active only while that step or trial renders: never palette edits, never the base |
| `engine.js` | `Stage`: a scene of items built from the viewer's factories, posed and tinted in the viewer's frame order. Also the stage render and the off-screen render (one target per size: catalogue and timeline thumbnails, the history comparison) |
| `catalogue.js` | The catalogue entries (starting configurations), what each planet look means (`BIOME_MEANING`), and the scene presets |
| `debris-spec.js` | Debris on a planet: the viewer's demo items and clutter scale, the setDebris spec a planet's debris state becomes, and the next piece a sweep takes. Pure |
| `drones.js` | Drones: the drone lab's providers, variants, parameters and palettes (read-only), and how a drone item maps onto the lab's cell: its look, its working face and motion, its pixel size and the lab's framing (checked against `lab.js` by the tests). Pure |
| `trials.js` | Trial looks: a proposed change shown beside the shipped look. `dusty-ash` is health-looks P2 (sand and rock at OKLab chroma ×0.6, lightness −0.1), checked against `PROPOSALS.md` and the lab's formula by the tests. Pure |
| `history.js` | The iteration view's data: ten families of dated steps (what changed, why, live view or archived image), the history palettes copied from git (checked against it by the tests), and `IMAGES`, the archive allowlist. Pure |
| `library.js` | The UI: catalogue, inspector, composer, palette editor, presets, the iteration view, trial looks, and `window.library` for the tests. Every render goes through `useLook(stage, look)`, which activates the look's palette and depth and loop settings and retints a stage only when its own look changed |
| `routes.mjs`, `serve.mjs` | `route()`, the one routing decision (the file allowlist and the archive route), and the loopback dev server. The test harness intercepts requests with the same `route()` |
| `shots.mjs`, `test/` | Screenshots and tests, both through Playwright request interception |

**Changes to the asset viewer** (behaviour-preserving; its `npm test` passes and its screenshots are pixel-identical):
- `viewer.js` exports its factories (`makePlanet`, `makeAstronaut`, `makeSky`, `makeStars`), renderer, camera, controls and views. The glue that `frame()`, `applyState()` and `resize()` used inline is now exported helpers (`poseWorld`, `depthLevelAt`, `applyDepth`, `setLoop`, `setPixelSize` / `setViewSize`, `usePalette`, `retint`). `usePalette(name, { edited: true })` clears the depth-fade cache for a palette edited in place.
- `window.ASSET_VIEWER_LIBRARY = true`, set before the module loads, is library mode: no showcase scene, UI or animation loop.
- The astronaut's eye light is its own uniform (`uEyeGlow`), the same colour as before by default; `setColor(key, eyeGlow)` takes an optional eye-light key, and `resolve()` reads a `#rrggbb` key as that colour. `group.userData.blink = false` holds the eyes open. `makePlanet` returns its parts and moons, and `makeAstronaut` returns its material. `rebuild` takes an optional cloud float.
- `palette-map.js` exports `rampThrough()`.
- `shots.mjs` captions the toxic row of the variety sheet `toxic`, no longer `toxic (extra)`, since toxic is now a health band (#19).
- `serve.mjs` binds `127.0.0.1` only, like this library and the labs; it no longer reads `HOST`. `PORT` still picks the port.
- `package.json` runs its tests one file at a time (`--test-concurrency=1`), as the shared machine needs.

The drone lab (`../drone-lab/`) and the debris lab (`../debris-lab/`) are unchanged: the library imports their modules read-only. Importing the debris lab's `variants.js` registers its kits, arrangements and colours with the viewer's debris, so the history draws its directions A–E and A2 live; every library and look palette carries the debris role.

## Tests

| File | Checks |
|---|---|
| `test/state.test.mjs` | `normalise()` clamps ranges, checks enums and hex colours, drops malformed palette paths; hash and JSON round-trip every catalogue entry and both scene presets; bad input is rejected |
| `test/fidelity.test.mjs` | R7: a lush planet (seed 7), a lava planet (seed 11) and the crew close-up (six K astronauts, four planets) are pixel-identical to the asset viewer at the same config; the showcase preset's positions, yaws and phases match the viewer's objects; the library's enums match the viewer's exports |
| `test/presets.test.mjs` | R5/R8: config → URL → a fresh page load renders identical pixels (a free-colour astronaut at 240p with a moved camera, a scene in object depth with palette edits, a custom ring); copy JSON → import dialog renders identical pixels; PNG ×1 is the stage and ×4 is whole 4×4 blocks |
| `test/palette.test.mjs` | R4: editing one colour changes exactly that role's pixels (land, ring, lava glow, suit, a contributor ramp), and reset restores the frame; the swatch → hex → reset UI |
| `test/scene.test.mjs` | R3: a planet with three astronauts renders the same frame after other work and in a fresh page, with every item in the frame; click selects, shift-drag moves only the selection, and the list adds and removes items |
| `test/routes.test.mjs` | R11 and R8 (Node, a temp fixture archive): the archive route serves only allowlisted PNG/GIF files inside the archive's real root, to GET and HEAD. It rejects traversal (plain, `%2e%2e`, `..%2f`, double-encoded, backslash, null byte, malformed), symlinks out of the archive, image names on non-images, directories, listings, unlisted files and other methods. Without an archive every archive request is a 404. Of the drone lab, only its top-level `*.js` modules are served (its `out/` GIFs, `test/identity.json`, scripts, pages and `node_modules` are 404s). The dev server binds 127.0.0.1 only |
| `test/history.test.mjs` | R9 and R10 (Node): planet tiles say their meaning worst to best, extras and rings are tagged, and no Nov 3 meaning or acid lime is left outside the history. Every family is dated oldest to final, with one final step and what changed and why for each. Every live step and option is a valid state that survives the URL. The history state is clamped. The copied history palettes match git at their source commits, and every step's commit exists |
| `test/trials.test.mjs` | The trial (Node): `dusty-ash` matches `PROPOSALS.md`'s ramps and hero means and the lab's formula; it changes sand and rock only, into colours the shipped palette doesn't have. The state keeps a trial to its own biome and out of scenes. The trial tile sits beside desert, and the lineup group runs worst to best at hero and mid (distance 12) |
| `test/debris.test.mjs` | Debris. Three planets with debris are pixel-identical to the viewer's: lush with 8 mixed pieces, toxic with 24 old pieces (12 drawn), and the biggest of 3 pieces 0.4 s into its sweep. Each case's debris is checked to be in the frame. The selected piece shows teal, and only then; a scene keeps a planet's debris. The debris state is clamped to real items and survives the URL. The Debris group holds the clutter scale, each kind at each age, every band, and debris alone |
| `test/drones.test.mjs` | Drones: ten are pixel-identical to the drone lab's own render (its capture page, read-only) at the same provider, session, time and view, smoke on: Copilot, Codex and Qodo front and 3/4, Claude working close up, a session of the unknown agent, exploration B from the side, and Kiro in the motion loop with edited parameters. Drones in a scene with the crew and a planet are each in the frame and reload to the same pixels; a click selects one, and shift-drag moves only it. The history's live drones equal the inspector's. The library's framing constants match `lab.js`, the catalogue holds the 11 drones and A–E, and drone state is clamped and survives the URL |
| `test/trials-view.test.mjs` | The trial in the browser. With the depth fade off, every pixel that changes from the shipped desert (seeds 3, 31, 90) is an ash ramp colour turned into its own trial step, and every ash ramp pixel changes. The catalogue renders the same while the stage shows the trial, and the base palette and edits stay shipped. The side-by-side panes reload to identical pixels, and the shipped pane is the inspector's shipped render |
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
| `history-debris.png` | The debris lab's direction B (junkyard), live through its registered kits, beside the final A3 |
| `history-no-archive.png` | The crew's archived step without the archive: "archived image not available" |
| `trial-compare.png` | The dustier-ash trial beside the shipped desert, same seed and camera |
| `inspector-drone.png`, `drone-working.png` | The GitHub Copilot drone close up with its controls; Qodo's working face |
| `drones-catalogue.png` | The **Drones** group: the 11 provider drones and the explorations A–E |
| `inspector-debris.png`, `debris-catalogue.png` | Debris on lush (8 pieces) with the debris section open and a selected piece; the **Debris** group |
| `drone-scene.png` | The drone lab's crew shot as a scene: astronaut, Claude Code drone, astronaut, a Copilot drone behind, the hero planet |
| `trial-lineup.png` | The **Trial: dustier ash** group: lava → toxic → ash → ash (trial) → lush, hero and mid |
