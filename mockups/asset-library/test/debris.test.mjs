// Space debris in the library: a planet with debris is pixel-identical to the asset viewer's at the
// same configuration (R7, including a sweep frame); the selected piece glows teal; scenes keep a
// planet's debris; the debris state is clamped and survives the URL; the catalogue's Debris group.
// Every render comparison fails on empty output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openLibrary, openViewer, grabCanvas, pageErrors, diff, stats, hexInt } from './harness.mjs';
import * as S from '../state.js';
import { GROUPS } from '../catalogue.js';
import { DEBRIS_COUNTS, AGE_MIXES, CLASSES, AGES, itemsOf, nextSweep } from '../debris-spec.js';
import { TEAL } from '../../asset-viewer/debris-palette.js';

const VIEWER_BASE = { seed: 7, biome: 'lush', size: 1, ringMode: 'thin', depth: true, pixelH: 180, color: 'coral', spin: true, ui: false, palette: 'final', moons: true, halo: false, period: 24, surfaceTurns: 2, cloudTurns: 3, cloudShadow: true, eyes: 'auto', depthMode: 'pixel-smooth', depthBands: '3-band', artefacts: false, artAuto: true, artCount: 3, artTeal: false, cover: null, lavaMode: 'layered', lavaTime: null, view: 'planet' };
const paused = (t) => ({ ...S.RENDER_DEFAULTS, t, play: false });
const planet = (more, debris, t) => ({ mode: 'asset', focus: 'debris', framing: 'planet', asset: { kind: 'planet', biome: 'lush', seed: 7, ...more, debris: { on: true, ...debris } }, render: paused(t) });

const CASES = [
  { name: 'lush, 8 mixed items', viewer: { debrisCount: 8, debrisAge: 'mixed', debrisSwept: [], time: 3 }, library: planet({}, { count: 8, mix: 'mixed' }, 3) },
  { name: 'toxic (seed 13), 24 old items: 12 drawn, the rest counted', viewer: { biome: 'toxic', seed: 13, debrisCount: 24, debrisAge: 'old', debrisSwept: [], time: 7.5 }, library: planet({ biome: 'toxic', seed: 13 }, { count: 24, mix: 'old' }, 7.5) },
  // the sweep: the biggest of 3 breaks apart from 2.6 s; 0.4 s in (outside the loop lock)
  { name: 'lush, 3 items, the biggest 0.4 s into its sweep', viewer: { debrisCount: 3, debrisAge: 'mixed', debrisSwept: [{ id: 'item-2', at: 2.6 }], time: 3 }, library: planet({}, { count: 3, mix: 'mixed', sweeps: [{ id: 'item-2', at: 2.6 }] }, 3) },
];

test('a planet with debris is pixel-identical to the viewer\'s, sweep frame included', { timeout: 600000 }, async () => {
  const browser = await launch();
  try {
    const viewer = await openViewer(browser);
    const library = await openLibrary(browser);
    for (const c of CASES) {
      await viewer.evaluate((o) => window.viewer.set(o), { ...VIEWER_BASE, debris: true, ...c.viewer });
      const v = await grabCanvas(viewer);
      await library.evaluate((o) => window.library.set(o), c.library);
      const l = await grabCanvas(library);
      // and the same planet without debris, so the debris is known to be in the frame
      await library.evaluate((o) => window.library.set({ ...o, asset: { ...o.asset, debris: { ...o.asset.debris, on: false } } }), c.library);
      const bare = await grabCanvas(library);
      const d = diff(v, l).length, debrisPx = diff(l, bare).length;
      console.log(`${c.name}: ${stats(l).drawn} px drawn, ${debrisPx} px of debris, ${d} px differ from the viewer`);
      assert.ok(stats(l).drawn > 3000, `${c.name}: empty render`);
      assert.ok(debrisPx > 30, `${c.name}: no debris in the frame (${debrisPx} px)`);
      assert.equal(d, 0, `${c.name}: ${d} px differ from the viewer`);
    }
    assert.deepEqual([...viewer.errors, ...library.errors].map(String), []);
  } finally {
    await browser.close();
  }
});

test('the selected piece glows teal, and only then; scenes keep their planets\' debris', { timeout: 600000 }, async () => {
  const browser = await launch();
  try {
    const page = await openLibrary(browser);
    const teal = new Set(TEAL.map(hexInt));
    const tealPx = (g) => [...stats(g).colours].filter(([c]) => teal.has(c)).reduce((n, [, k]) => n + k, 0);
    const base = { ...planet({ ring: 'off', moons: false }, { count: 3, mix: 'fresh' }, 3), render: { ...paused(3), depth: false } }; // (no fade: exact ramp colours)
    await page.evaluate((s) => window.library.set(s), base);
    const plain = await grabCanvas(page);
    await page.evaluate((s) => window.library.set({ ...s, asset: { ...s.asset, debris: { ...s.asset.debris, selected: 'item-2' } } }), base);
    const picked = await grabCanvas(page);
    assert.equal(tealPx(plain), 0, 'no teal without a selection');
    assert.ok(tealPx(picked) > 5, `the selected piece shows teal (${tealPx(picked)} px)`);
    assert.ok(diff(plain, picked).length < 400, 'only the selected piece changes');
    // a scene: the planet keeps its debris (and its selection)
    const scene = { mode: 'scene', scene: { items: [{ ...base.asset, pos: [0, 0, 0], debris: { ...base.asset.debris, selected: 'item-2' } }], selected: -1, camera: { pos: [1.92, 1.12, 6.69], target: [0, 0, 0] } }, render: base.render };
    await page.evaluate((s) => window.library.set(s), scene);
    const st = await page.evaluate(() => window.library.state());
    assert.deepEqual(st.scene.items[0].debris.selected, 'item-2');
    assert.ok(tealPx(await grabCanvas(page)) > 5, 'the scene draws the planet\'s debris');
    assert.deepEqual(page.errors.map(String), []);
  } finally {
    await browser.close();
  }
});

test('debris under a look palette (the dusty-ash trial) and in the history\'s live directions A–E, A2, A3', { timeout: 600000 }, async () => {
  const browser = await launch();
  try {
    const page = await openLibrary(browser);
    const grabWith = async (s, on) => { await page.evaluate((x) => window.library.set(x), { ...s, asset: { ...s.asset, debris: { ...s.asset.debris, on } } }); return grabCanvas(page); };
    // the trial's own viewer palette draws debris too (its colours are fixed, from the debris role)
    const trial = planet({ biome: 'desert', seed: 3, trial: 'dusty-ash' }, { count: 8 }, 3);
    const [withD, without] = [await grabWith(trial, true), await grabWith(trial, false)];
    assert.ok(diff(withD, without).length > 100, 'debris on the trial planet');
    // the history: each direction live (the debris lab's kits), each unlike the final A3
    const H = await import('../history.js');
    const fam = H.family('debris');
    const shot = async (step, option = 0) => { await page.evaluate((x) => window.library.set(x), { mode: 'history', history: { family: 'debris', step, option }, render: paused(3) }); return grabCanvas(page); };
    const final = await shot(fam.steps.length - 1);
    const looks = [];
    for (let o = 0; o < 5; o++) looks.push(await shot(0, o));
    looks.push(await shot(1));
    for (const [i, g] of looks.entries()) {
      assert.ok(stats(g).drawn > 3000, `direction ${i}: empty`);
      assert.ok(diff(g, final).length > 50, `direction ${i} looks like A3`);
    }
    assert.ok(diff(looks[0], looks[1]).length > 50, 'A and B differ');
    // the final step is the inspector's debris on the lush hero
    await page.evaluate((x) => window.library.set(x), planet({ ring: 'off' }, { count: 8, mix: 'mixed' }, 3));
    assert.equal(diff(final, await grabCanvas(page)).length, 0, 'the history\'s A3 differs from the inspector');
    assert.deepEqual(pageErrors(page), []);
  } finally {
    await browser.close();
  }
});

test('the debris state is clamped to real items, and survives the URL', () => {
  const d = S.normaliseDebris({ on: 'yes', count: 99, mix: 'ancient', seed: -4, items: 'x', sweeps: [{ id: 'item-1', at: 5 }, { id: 'nope', at: 1 }, { id: 'item-1', at: 9 }], selected: 'nope' });
  assert.deepEqual(d, { on: false, count: 24, mix: 'mixed', seed: 1, items: null, sweeps: [{ id: 'item-1', at: 5 }], selected: null, direction: 'A3' });
  assert.equal(S.normaliseDebris({ direction: 'Z' }).direction, 'A3', 'the final direction unless a known exploration');
  assert.equal(S.normaliseDebris({ direction: 'C' }).direction, 'C');
  const e = S.normaliseDebris({ on: true, items: [{ id: 'a', cls: 'agent', diff: 1e9, age: -3 }, { id: 'a' }, { id: 'bad id!' }, { id: 'b', cls: 'nope' }], selected: 'b', sweeps: [{ id: 'item-0', at: 1 }] });
  assert.deepEqual(e.items, [{ id: 'a', cls: 'agent', diff: 100000, age: 0 }, { id: 'b', cls: 'pr', diff: 240, age: 21 }]);
  assert.deepEqual([e.selected, e.sweeps], ['b', []], 'sweeps and the selection name current items only');
  const st = S.normalise(planet({}, { count: 8, mix: 'old', seed: 12, sweeps: [{ id: 'item-0', at: 2 }], selected: 'item-3' }, 3));
  assert.deepEqual(S.decodeHash(S.encodeHash(st)), st);
  assert.equal(st.focus, 'debris');
  assert.equal(nextSweep(st.asset.debris), 'item-2', 'the next sweep: the biggest not yet swept (the viewer\'s rule)');
  assert.deepEqual(S.normalise({ mode: 'scene', scene: { items: [{ kind: 'planet', debris: { on: true, count: 3 } }] } }).scene.items[0].debris.count, 3, 'scenes keep debris');
});

test('the Debris group: the clutter scale, each kind at each age, every band, and debris alone', () => {
  assert.deepEqual(S.normalise({}).asset.debris.on, false, 'a planet has no debris unless asked');
  const items = GROUPS.find((g) => g.id === 'debris').items;
  assert.ok(items.every((it) => it.final && it.state.asset.debris.on && it.state.focus === 'debris'));
  const st = items.map((it) => S.normalise(it.state).asset);
  assert.deepEqual(st.slice(0, 5).map((a) => itemsOf(a.debris).length), DEBRIS_COUNTS);
  const kinds = st.slice(5, 17).map((a) => itemsOf(a.debris));
  assert.deepEqual(kinds.map((ks) => `${ks[0].cls} ${AGES.findIndex((g, i) => ks[0].age >= g && (i === 2 || ks[0].age < AGES[i + 1]))}`), CLASSES.flatMap((c) => [0, 1, 2].map((a) => `${c} ${a}`)));
  for (const ks of kinds) assert.ok(ks.length === 3 && ks.every((k) => k.cls === ks[0].cls), 'three pieces of one kind and age');
  assert.deepEqual(st.slice(17, 23).map((a) => a.biome), ['lava', 'toxic', 'desert', 'lush', 'ocean', 'ice']);
  assert.deepEqual(st[23].layers, { surface: false, haze: false, clouds: false, ring: false }, 'debris alone: the host hidden');
  assert.equal(items.length, 24);
  assert.ok(AGE_MIXES.includes('mixed'));
});
