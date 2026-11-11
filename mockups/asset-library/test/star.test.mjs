// The star in the library (star-art.md S7): the viewer's makeStar, so a star in the library is
// pixel-identical to the viewer's at the same configuration (R7), alone, with its corona off at
// another size, granulation and spin, with moonlets, and in the viewer's system view among the
// planets and the crew. The star state is clamped and survives the URL; the Star group holds the
// star, its corona off, its moonlets and a small system scene; the star's colours are editable.
// Every render comparison fails on empty output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openLibrary, openViewer, grabCanvas, grabTile, pageErrors, diff, stats, rgbAt, hexInt } from './harness.mjs';
import * as S from '../state.js';
import { GROUPS, starSystemScene, STAR_SPOT } from '../catalogue.js';

const VIEWER_BASE = { seed: 7, biome: 'lush', size: 1, ringMode: 'thin', depth: true, pixelH: 180, color: 'coral', spin: true, ui: false, palette: 'final', moons: true, halo: false, period: 24, surfaceTurns: 2, cloudTurns: 3, cloudShadow: true, eyes: 'auto', depthMode: 'pixel-smooth', depthBands: '3-band', artefacts: false, artAuto: true, artCount: 3, artTeal: false, cover: null, lavaMode: 'layered', lavaTime: null,
  star: false, starSize: 1.6, starSpin: 1, starGranulation: 1, starCorona: true, starMoonlets: 0 };
const paused = (t) => ({ ...S.RENDER_DEFAULTS, t, play: false });
const star = (asset, t) => ({ mode: 'asset', focus: 'star', framing: 'star', asset: { kind: 'star', ...asset }, render: paused(t) });
// The viewer's system view (viewer.js SYSTEM, the crew line-up and SYSTEM_STAR), as a library scene.
const SYSTEM = [
  { biome: 'lush', seed: 7, size: 1.0, ring: 'thin', pos: [0.75, 0.15, 0] },
  { biome: 'gas', seed: 5, size: 2.2, ring: 'off', pos: [-10.5, 2.4, -17] },
  { biome: 'ice', seed: 21, size: 0.62, ring: 'off', pos: [5.4, 0.1, -3.2] },
  { biome: 'lava', seed: 11, size: 0.7, ring: 'off', pos: [3.3, -0.9, 0.9] },
  { biome: 'desert', seed: 3, size: 0.85, ring: 'wide', pos: [-1.0, 3.4, -9] },
  { biome: 'ocean', seed: 42, size: 1.25, ring: 'off', pos: [7.2, 3.6, -19] },
  { biome: 'moon', seed: 9, size: 0.28, ring: 'off', pos: [2.15, 1.3, -0.5] },
  { biome: 'toxic', seed: 13, size: 1.1, ring: 'off', pos: [13, 1.2, -36] },
].map((p, i) => ({ kind: 'planet', ...p, moons: i === 0, ...(S.RING_PRESETS[p.ring] ? { ringWidth: S.RING_PRESETS[p.ring].width, ringInner: S.RING_PRESETS[p.ring].inner } : {}) }));
const CREW = starSystemScene().items.filter((it) => it.kind === 'astronaut');

const CASES = [
  { name: 'the star (corona on)', viewer: { view: 'star', time: 3 }, library: star({}, 3) },
  { name: 'corona off, size 1.0, granulation 1.6, 2 turns', viewer: { view: 'star', time: 7.5, starCorona: false, starSize: 1, starGranulation: 1.6, starSpin: 2 }, library: star({ corona: false, size: 1, granulation: 1.6, spin: 2 }, 7.5), minDrawn: 1200 },
  { name: '5 moonlets, size 2.2', viewer: { view: 'star', time: 9, starMoonlets: 5, starSize: 2.2 }, library: star({ moonlets: 5, size: 2.2 }, 9) },
  { name: 'the viewer\'s system view with the star', viewer: { view: 'system', time: 2, star: true },
    library: { mode: 'scene', scene: { items: [...SYSTEM, ...CREW, { kind: 'star', pos: STAR_SPOT }], selected: -1, framing: 'system', camera: null }, render: paused(2) } },
];

test('the star: state clamped and round-tripped; the Star group; its colours are editable', () => {
  const s = S.normaliseStar({ size: 9, spin: 1.6, granulation: -1, corona: 'yes', moonlets: 99, pos: [1, 'x', 3] });
  assert.deepEqual(s, { kind: 'star', size: 3, spin: 2, granulation: 0, corona: true, moonlets: 12, pos: [1, 0, 3] });
  assert.deepEqual(S.normaliseItem({ kind: 'star' }), S.STAR_DEFAULTS);
  const st = S.normalise(star({ size: 2.1, corona: false, moonlets: 4 }, 5));
  assert.equal(st.focus, 'star');
  assert.equal(st.framing, 'star');
  const sc = S.normalise({ mode: 'scene', scene: starSystemScene() });
  assert.equal(sc.scene.items.filter((it) => it.kind === 'star').length, 1, 'scenes keep their star');
  for (const x of [st, sc]) {
    assert.deepEqual(S.decodeHash(S.encodeHash(x)), x);
    assert.deepEqual(S.fromJSON(S.toJSON(x)), x);
  }
  const g = GROUPS.find((x) => x.id === 'star');
  assert.deepEqual(g.items.map((it) => it.title), ['star', 'corona off', 'with moonlets', 'star system']);
  assert.deepEqual(g.items.slice(0, 3).map((it) => [it.state.asset.corona ?? true, it.state.asset.moonlets ?? 0]), [[true, 0], [false, 0], [true, 5]]);
  const kinds = sc.scene.items.map((it) => it.kind);
  assert.ok(kinds.filter((k) => k === 'planet').length >= 3 && kinds.filter((k) => k === 'astronaut').length === 3, `the system scene: ${kinds}`);
  assert.equal(sc.scene.items.filter((it) => it.kind === 'planet' && it.debris.on).length, 1, 'one debris planet');
  assert.ok(GROUPS.find((x) => x.id === 'palettes').items.some((it) => it.palette === 'star'), 'a star palette tile');
});

test('a star in the library is pixel-identical to the viewer\'s, alone and in the system view', { timeout: 600000 }, async () => {
  const browser = await launch();
  try {
    const [viewer, library] = await Promise.all([openViewer(browser), openLibrary(browser)]);
    for (const c of CASES) {
      await viewer.evaluate((o) => window.viewer.set(o), { ...VIEWER_BASE, ...c.viewer });
      const v = await grabCanvas(viewer);
      await library.evaluate((o) => window.library.set(o), c.library);
      const l = await grabCanvas(library);
      const d = diff(v, l).length;
      console.log(`${c.name}: ${stats(l).drawn} px drawn, ${stats(l).colours.size} colours, ${d} px differ from the viewer`);
      assert.ok(stats(l).drawn > (c.minDrawn ?? 3000), `${c.name}: empty render`);
      assert.equal(d, 0, `${c.name}: ${d} px differ from the viewer`);
    }
    // the system case has the star in the frame: the same scene without it differs
    const sys = CASES.at(-1).library;
    await library.evaluate((o) => window.library.set(o), sys);
    const withStar = await grabCanvas(library);
    await library.evaluate((o) => window.library.set({ ...o, scene: { ...o.scene, items: o.scene.items.filter((it) => it.kind !== 'star') } }), sys);
    const starPx = diff(withStar, await grabCanvas(library)).length;
    assert.ok(starPx > 300, `the star drew only ${starPx} px in the system view`);

    // the enums mirror the viewer's exports
    const got = await library.evaluate(async () => {
      const v = await import('../asset-viewer/viewer.js');
      return { ranges: v.STAR, defaults: v.STAR_DEFAULTS, system: v.SYSTEM_STAR };
    });
    assert.deepEqual(got.ranges, S.STAR_RANGES);
    const { kind, pos, ...defaults } = S.STAR_DEFAULTS;
    assert.deepEqual(got.defaults, defaults);
    assert.deepEqual(got.system, STAR_SPOT, 'the star\'s system spot');

    // the base palette carries the star's roles, and an edited star colour is the star's: the core (frame centre, depth off) takes it
    const base = await library.evaluate(() => window.library.basePalette());
    assert.deepEqual([base.star, base.corona], [['#c9361a', '#ff761a', '#ffc93c', '#fff0b8', '#fffaf0'], ['#c9361a', '#481a18']]);
    const flat = { ...star({}, 3), render: { ...paused(3), depth: false } };
    await library.evaluate((o) => window.library.set(o), flat);
    const centre = (g) => rgbAt(g, (g.h / 2) * g.w + g.w / 2);
    assert.equal(centre(await grabCanvas(library)), hexInt(base.star[4]), 'the centre is not the core colour');
    await library.evaluate((o) => window.library.set(o), { ...flat, palette: { 'star.4': '#e0a020' } });
    assert.equal(centre(await grabCanvas(library)), hexInt('#e0a020'), 'the core does not follow its palette edit');
    assert.deepEqual([...viewer.errors, ...library.errors].map(String), []);
  } finally {
    await browser.close();
  }
});

test('the Star group\'s tiles render, and the system tile opens in the composer', { timeout: 600000 }, async () => {
  const browser = await launch();
  try {
    const page = await openLibrary(browser);
    for (const it of GROUPS.find((g) => g.id === 'star').items) {
      const tile = await grabTile(page, it.id);
      assert.ok(stats(tile).drawn > 300, `${it.title}: empty thumbnail (${stats(tile).drawn} px)`);
    }
    await page.evaluate(() => window.library.open('star-3'));
    const st = await page.evaluate(() => window.library.state());
    assert.equal(st.mode, 'scene');
    assert.deepEqual(st.scene, S.normalise({ mode: 'scene', scene: starSystemScene() }).scene, 'the composer holds the system scene');
    assert.deepEqual(pageErrors(page), []);
  } finally {
    await browser.close();
  }
});
