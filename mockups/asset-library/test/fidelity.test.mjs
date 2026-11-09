// R7 fidelity: an asset in the library is pixel-identical to the same asset and configuration
// in the asset viewer (same modules and shaders, no forks). Both apps run side by side in one
// headless Chromium (SwiftShader); every comparison fails on empty output.
//  - lush planet (seed 7) and lava planet (seed 11): the viewer's planet view vs the inspector
//  - crew K: the viewer's crew close-up vs the library's composed copy of the viewer's showcase
//    (and that copy's positions, yaws and phases vs the viewer's own objects)
//  - the library's enums still match the viewer's exports
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openLibrary, openViewer, grabCanvas, diff, stats } from './harness.mjs';
import { showcaseScene } from '../catalogue.js';
import * as S from '../state.js';

// The viewer's screenshot defaults (shots.mjs BASE).
const VIEWER_BASE = { seed: 7, biome: 'lush', size: 1, ringMode: 'thin', depth: true, pixelH: 180, color: 'coral', spin: true, ui: false, palette: 'final', moons: true, halo: false, period: 24, surfaceTurns: 2, cloudTurns: 3, cloudShadow: true, eyes: 'auto', depthMode: 'pixel-smooth', depthBands: '3-band', artefacts: false, artAuto: true, artCount: 3, artTeal: false, cover: null, lavaMode: 'layered', lavaTime: null };
const paused = (t) => ({ ...S.RENDER_DEFAULTS, t, play: false });

const CASES = [
  {
    name: 'lush planet (seed 7, thin ring, moons)',
    viewer: { ...VIEWER_BASE, view: 'planet', time: 3 },
    library: { mode: 'asset', focus: 'planet', framing: 'planet', asset: { kind: 'planet', biome: 'lush', seed: 7 }, render: paused(3) },
    minDrawn: 3000,
  },
  {
    name: 'lava planet (seed 11, layered lava, ash)',
    viewer: { ...VIEWER_BASE, view: 'planet', biome: 'lava', seed: 11, time: 3 },
    library: { mode: 'asset', focus: 'planet', framing: 'planet', asset: { kind: 'planet', biome: 'lava', seed: 11 }, render: paused(3) },
    minDrawn: 3000,
  },
  {
    name: 'crew K astronauts (the crew close-up, t = 1.2)',
    viewer: { ...VIEWER_BASE, view: 'crew', time: 1.2 },
    library: { mode: 'scene', scene: { ...showcaseScene(), framing: 'crew' }, render: paused(1.2) },
    minDrawn: 3000,
  },
];

test('library renders are pixel-identical to the asset viewer', { timeout: 600000 }, async () => {
  const browser = await launch();
  try {
    const [viewer, library] = await Promise.all([openViewer(browser), openLibrary(browser)]);
    for (const c of CASES) {
      await viewer.evaluate((o) => window.viewer.set(o), c.viewer);
      const v = await grabCanvas(viewer);
      await library.evaluate((o) => window.library.set(o), c.library);
      const l = await grabCanvas(library);
      const drawn = stats(l).drawn;
      assert.ok(drawn >= c.minDrawn, `${c.name}: empty or near-empty library render (${drawn} px drawn)`);
      assert.ok(stats(v).drawn >= c.minDrawn, `${c.name}: empty viewer render`);
      const d = diff(v, l);
      console.log(`${c.name}: ${l.w}x${l.h}, ${drawn} px drawn, ${stats(l).colours.size} colours, ${d.length} px differ`);
      assert.equal(d.length, 0, `${c.name}: ${d.length} pixels differ from the viewer`);
    }
    // showcaseScene() hand-copies the viewer's layout: catch drift item by item, not only by pixels
    const layout = await viewer.evaluate(() => {
      const { planets, crew, solos } = window.viewer.internals;
      const r = (v) => +v.toFixed(6);
      return [...planets, ...crew, ...solos].map((o) => ({ pos: o.group.position.toArray().map(r), yaw: r(o.group.rotation.y), phase: r(o.group.userData.phase ?? 0) }));
    });
    const mine = showcaseScene().items.map((it) => ({ pos: it.pos.map((x) => +x.toFixed(6)), yaw: +(it.yaw ?? 0).toFixed(6), phase: +(it.phase ?? 0).toFixed(6) }));
    assert.deepEqual(mine, layout, 'showcaseScene() no longer matches the viewer\'s showcase layout');
    assert.deepEqual([...viewer.errors, ...library.errors].map(String), []);
  } finally {
    await browser.close();
  }
});

test('library enums match the viewer exports', { timeout: 180000 }, async () => {
  const browser = await launch();
  try {
    const page = await openLibrary(browser);
    const got = await page.evaluate(async () => {
      const v = await import('../asset-viewer/viewer.js');
      const f = await import('../asset-viewer/faces.js');
      return { biomes: Object.keys(v.BIOMES), lava: v.LAVA_MODES, depth: v.DEPTH_MODES, bands: Object.keys(v.DEPTH_BANDS), presets: v.RING_PRESETS, eyes: f.EYE_DESIGNS.length, moons: v.MOON_ORBITS, contributors: v.CONTRIBUTOR_KEYS };
    });
    assert.deepEqual(got.biomes, S.BIOME_KEYS);
    assert.deepEqual(got.lava, S.LAVA_MODES);
    assert.deepEqual(got.depth, S.DEPTH_MODES);
    assert.deepEqual(got.bands, S.DEPTH_BANDS);
    assert.deepEqual(got.presets, S.RING_PRESETS);
    assert.equal(got.eyes, S.EYE_COUNT);
    assert.deepEqual(got.moons, S.MOON_DEFAULTS);
    assert.deepEqual(got.contributors, S.CONTRIBUTOR_PRESETS);
  } finally {
    await browser.close();
  }
});
