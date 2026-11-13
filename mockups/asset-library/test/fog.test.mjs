// Fog of war in the library: a fogged planet is pixel-identical to the asset viewer's hero at the same
// configuration (R7: at rest, fully fogged on a hazy biome, and mid-clear); the chart buttons add the
// viewer's events; scenes keep a planet's fog; the history draws the fog lab's directions live and ends
// on the inspector's D2d; the fog state is clamped and survives the URL; the catalogue's Fog group.
// Every render comparison fails on empty output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openLibrary, openViewer, grabCanvas, grabTile, pageErrors, diff, stats, hexInt } from './harness.mjs';
import * as S from '../state.js';
import { GROUPS } from '../catalogue.js';
import { FOG_COVERAGES, FOG_LOOKS, chartEvents, fogStatus } from '../fog-spec.js';
import { DIRECTION_IDS } from '../../fog-lab/fog.js'; // (registers the lab's looks; three loads in Node)
import { ACCENTS } from '../../asset-viewer/planet-ramps.js';
import { COVERAGES as VIEWER_COVERAGES, EVENT } from '../../asset-viewer/fog-layout.js';

const VIEWER_BASE = { seed: 7, biome: 'lush', size: 1, ringMode: 'thin', depth: true, pixelH: 180, color: 'coral', spin: true, ui: false, palette: 'final', moons: true, halo: false, period: 24, surfaceTurns: 2, cloudTurns: 3, cloudShadow: true, eyes: 'auto', depthMode: 'pixel-smooth', depthBands: '3-band', artefacts: false, artAuto: true, artCount: 3, artTeal: false, cover: null, lavaMode: 'layered', lavaTime: null, view: 'planet', debris: false };
const paused = (t) => ({ ...S.RENDER_DEFAULTS, t, play: false });
const planet = (more, fog, t) => ({ mode: 'asset', focus: 'fog', framing: 'planet', asset: { kind: 'planet', biome: 'lush', seed: 7, ...more, fog: { on: true, ...fog } }, render: paused(t) });
const teal = new Set(ACCENTS.reveal.map(hexInt));
const tealPx = (g) => [...stats(g).colours].filter(([c]) => teal.has(c)).reduce((n, [, k]) => n + k, 0);

// "chart one" at 10.7 s on the lush hero at 25%: the file the viewer's button would pick, on the visible hemisphere
// (at 50% the next file is never in view on this planet); caught 0.3 s in, while the teal front is under way
const clearing = chartEvents({ seed: 7, fog: { charted: 0.25, seed: null, events: [], moonEvents: [] } }, 'one', 10.7).events;
// "chart all" from 0% pressed at 2.3 s, caught at 3 s: files clearing 0.12 s apart and the fogged moons
const chartAll = chartEvents({ seed: 7, fog: { charted: 0, seed: null, events: [], moonEvents: [] } }, 'all', 2.3);
const CASES = [
  { name: 'lush, 50% charted', viewer: { fogCharted: 0.5, time: 3 }, library: planet({}, { charted: 0.5 }, 3) },
  { name: 'ocean (seed 42), fully fogged: the haze fogged too', viewer: { biome: 'ocean', seed: 42, fogCharted: 0, time: 5.5 }, library: planet({ biome: 'ocean', seed: 42 }, { charted: 0 }, 5.5) },
  { name: 'lush, 25%, a file 0.3 s into its clear (the teal front)', flat: true, viewer: { fogCharted: 0.25, fogEvents: clearing, time: 11 }, library: planet({}, { charted: 0.25, events: clearing }, 11), teal: true },
  { name: 'lush, mid "chart all" from 0% (files clearing in turn, moons too)', flat: true, viewer: { fogCharted: 0, fogEvents: chartAll.events, fogMoonEvents: chartAll.moonEvents, time: 3 }, library: planet({}, { charted: 0, events: chartAll.events, moonEvents: chartAll.moonEvents }, 3), teal: true },
];

// (timeouts: 30 min, as the machine is shared and a fog shader compiles slowly in SwiftShader)
test('a fogged planet is pixel-identical to the viewer\'s, mid-clear included', { timeout: 1800000 }, async () => {
  const browser = await launch();
  try {
    const viewer = await openViewer(browser);
    const library = await openLibrary(browser);
    for (const cs of CASES) {
      // flat: depth off, as the viewer's tests do, so [OIII] teal is its exact colour (the depth fade tints it)
      const c = cs.flat ? { ...cs, library: { ...cs.library, render: { ...cs.library.render, depth: false } } } : cs;
      await viewer.evaluate((o) => window.viewer.set(o), { ...VIEWER_BASE, fog: true, fogEvents: [], fogMoonEvents: [], ...(c.flat && { depth: false }), ...c.viewer });
      const v = await grabCanvas(viewer);
      await library.evaluate((o) => window.library.set(o), c.library);
      const l = await grabCanvas(library);
      // and the same planet without fog, so the fog is known to be in the frame
      await library.evaluate((o) => window.library.set({ ...o, asset: { ...o.asset, fog: { ...o.asset.fog, on: false } } }), c.library);
      const bare = await grabCanvas(library);
      const d = diff(v, l).length, fogPx = diff(l, bare).length;
      console.log(`${c.name}: ${stats(l).drawn} px drawn, ${fogPx} px of fog, ${tealPx(l)} teal, ${d} px differ from the viewer`);
      assert.ok(stats(l).drawn > 3000, `${c.name}: empty render`);
      assert.ok(fogPx > 300, `${c.name}: no fog in the frame (${fogPx} px)`);
      assert.equal(d, 0, `${c.name}: ${d} px differ from the viewer`);
      if (c.library.asset.fog.events?.length) { // the event is in the frame: unlike the same fog with no events
        await library.evaluate((o) => window.library.set({ ...o, asset: { ...o.asset, fog: { ...o.asset.fog, events: [], moonEvents: [] } } }), c.library);
        assert.ok(diff(l, await grabCanvas(library)).length > 20, `${c.name}: the event changes nothing in the frame`);
      }
      if (c.teal) {
        assert.ok(tealPx(l) > 0, `${c.name}: no teal front`);
        // teal marks the event only: none before it starts, none once it's over
        const evs = c.library.asset.fog.events, first = Math.min(...evs.map((e) => e.at)), last = Math.max(...evs.map((e) => e.at));
        for (const [when, t] of [['before', first - 0.2], ['after', last + EVENT.clear + EVENT.pulse + 0.5]]) {
          await library.evaluate((o) => window.library.set(o), { ...c.library, render: { ...c.library.render, t } });
          assert.equal(tealPx(await grabCanvas(library)), 0, `${c.name}: teal ${when} the event`);
        }
      }
    }
    assert.deepEqual([...viewer.errors, ...library.errors].map(String), []);
  } finally {
    await browser.close();
  }
});

test('the chart buttons add the viewer\'s events; scenes keep fog; the history\'s directions are live and end on the inspector\'s D2d', { timeout: 1800000 }, async () => {
  const browser = await launch();
  try {
    const page = await openLibrary(browser);
    const st = () => page.evaluate(() => window.library.state());
    // a DOM click: Playwright's click waits for steady frames, and every frame renders fog thumbnails (a big shader to compile in SwiftShader)
    const press = (name) => page.getByRole('button', { name, exact: true }).evaluate((b) => b.click());
    // the buttons, at a pinned 3 s: each adds what fog-spec's chartEvents gives (the viewer's rule) and plays
    const base = planet({}, { charted: 0.5 }, 3);
    await page.evaluate((s) => window.library.set(s), base);
    await press('chart one');
    let s = await st();
    assert.deepEqual(s.asset.fog.events, chartEvents(S.normalise(base).asset, 'one', 3).events);
    assert.equal(s.render.play, true, 'a chart button plays the stage');
    for (const [name, kind] of [['refog one', 'refog'], ['chart all', 'all']]) {
      await page.evaluate((x) => window.library.set(x), base);
      await press(name);
      s = await st();
      assert.deepEqual(s.asset.fog.events, chartEvents(S.normalise(base).asset, kind, 3).events, name);
    }
    assert.ok(s.asset.fog.events.length > 3 && s.asset.fog.moonEvents.length === 1, 'chart all at 50%: every fogged file and the fogged (small) moon');
    // a scene keeps the planet's fog
    const scene = { mode: 'scene', scene: { items: [{ ...base.asset, pos: [0, 0, 0] }], selected: -1, camera: { pos: [1.92, 1.12, 6.69], target: [0, 0, 0] } }, render: base.render };
    await page.evaluate((x) => window.library.set(x), scene);
    const inScene = await grabCanvas(page);
    assert.deepEqual((await st()).scene.items[0].fog, S.normalise(base).asset.fog);
    await page.evaluate((x) => window.library.set(x), { ...scene, scene: { ...scene.scene, items: [{ ...base.asset, pos: [0, 0, 0], fog: { on: false } }] } });
    assert.ok(diff(inScene, await grabCanvas(page)).length > 300, 'the scene draws the planet\'s fog');
    // the history: each direction live (the fog lab's registered looks), each unlike the final D2d
    const H = await import('../history.js');
    const fam = H.family('fog');
    const shot = async (step, option = 0) => { await page.evaluate((x) => window.library.set(x), { mode: 'history', history: { family: 'fog', step, option }, render: paused(3) }); return grabCanvas(page); };
    const final = await shot(fam.steps.length - 1, 2); // (50% charted)
    const looks = [];
    for (let o = 0; o < 5; o++) looks.push(await shot(0, o)); // A-E
    looks.push(await shot(1)); // A2
    for (let o = 0; o < 3; o++) looks.push(await shot(2, o)); // D2a-D2c
    looks.push(await shot(3)); // D2e
    for (const [i, g] of looks.entries()) {
      assert.ok(stats(g).drawn > 3000, `direction ${i}: empty`);
      assert.ok(diff(g, final).length > 50, `direction ${i} looks like D2d`);
    }
    assert.ok(diff(looks[0], looks[1]).length > 50, 'A and B differ');
    await page.evaluate((x) => window.library.set(x), planet({ ring: 'off' }, { charted: 0.5 }, 3));
    assert.equal(diff(final, await grabCanvas(page)).length, 0, 'the history\'s D2d differs from the inspector');
    // the Fog group's tiles render: one per band fully fogged, and the four demos
    const items = GROUPS.find((g) => g.id === 'fog').items;
    for (const it of [...items.filter((x) => x.state.asset.fog.charted === 0 && !x.state.asset.fog.events.length), ...items.slice(-4)]) {
      const tile = await grabTile(page, it.id);
      assert.ok(stats(tile).drawn > 300, `${it.title}: empty thumbnail (${stats(tile).drawn} px)`);
    }
    // the three event tiles show their event, as opened: teal on a clear (depth off, as above), a visible front on a refog
    for (const [it, kind] of items.slice(-4, -1).map((it, i) => [it, ['clear', 'refog', 'clear'][i]])) {
      const st = S.normalise(it.state), at = (events) => ({ ...st, asset: { ...st.asset, fog: { ...st.asset.fog, events } }, render: { ...st.render, t: it.t, play: false, depth: false } });
      await page.evaluate((x) => window.library.set(x), at(st.asset.fog.events));
      const during = await grabCanvas(page);
      await page.evaluate((x) => window.library.set(x), at([]));
      assert.ok(diff(during, await grabCanvas(page)).length > 40, `${it.title}: no visible front`);
      if (kind === 'clear') assert.ok(tealPx(during) > 0, `${it.title}: no teal on the tile's frame`);
      else assert.equal(tealPx(during), 0, `${it.title}: teal on a refog`);
    }
    assert.deepEqual(pageErrors(page), []);
  } finally {
    await browser.close();
  }
});

test('the fog state is clamped to real files, and survives the URL', () => {
  const f = S.normaliseFog({ on: 'yes', charted: 0.4, seed: -4, events: [{ file: 'nope', kind: 'clear', at: 1 }, { file: 'src/core/f1', kind: 'zap', at: 1 }, 'x'], moonEvents: [{ moon: 2, kind: 'clear', at: 1 }, { moon: 1, kind: 'refog', at: 1e9 }], look: 'Z' }, 7);
  assert.deepEqual(f, { on: false, charted: 0.5, seed: 1, events: [], moonEvents: [{ moon: 1, kind: 'refog', at: 3600 }], look: 'D2d' });
  assert.equal(S.normaliseFog({ look: 'D2c' }, 7).look, 'D2c', 'a known exploration keeps its look');
  const st = S.normalise(planet({}, { charted: 0.25, seed: 12, events: [{ file: 'src/core/f1', kind: 'clear', at: 2 }] }, 3));
  assert.deepEqual(S.decodeHash(S.encodeHash(st)), st);
  assert.equal(st.focus, 'fog');
  assert.equal(st.asset.fog.events.length, 1, 'an event on a real file is kept');
  assert.deepEqual(S.normalise({ mode: 'scene', scene: { items: [{ kind: 'planet', fog: { on: true, charted: 0 } }] } }).scene.items[0].fog.charted, 0, 'scenes keep fog');
  assert.deepEqual(S.normalise({}).asset.fog.on, false, 'a planet has no fog unless asked');
  assert.deepEqual(FOG_COVERAGES, VIEWER_COVERAGES, 'the viewer\'s charted shares');
  assert.deepEqual([...FOG_LOOKS].sort(), [...DIRECTION_IDS].sort(), 'the fog lab\'s registered directions');
});

test('the Fog group: every band at every charted share, the chart buttons mid-event, and fog with debris', () => {
  const items = GROUPS.find((g) => g.id === 'fog').items;
  assert.ok(items.every((it) => it.final && it.state.asset.fog.on && it.state.focus === 'fog'));
  const st = items.map((it) => S.normalise(it.state).asset);
  const rest = st.filter((a) => !a.fog.events.length && !a.debris.on);
  assert.deepEqual([...new Set(rest.map((a) => a.biome))], ['lava', 'toxic', 'desert', 'lush', 'ocean', 'ice'], 'every band, worst to best');
  for (const b of ['lava', 'toxic', 'desert', 'lush', 'ocean', 'ice']) assert.deepEqual(rest.filter((a) => a.biome === b).map((a) => a.fog.charted), FOG_COVERAGES, b);
  // the three chart tiles are caught mid-event, and their charted share moves the right way
  const demos = items.slice(-4, -1);
  for (const [it, kind] of demos.map((it, i) => [it, ['clear', 'refog', 'clear'][i]])) {
    const a = S.normalise(it.state).asset;
    const { st: fs } = fogStatus(a, it.t);
    assert.ok(a.fog.events.length && a.fog.events.every((e) => e.kind === kind), it.title);
    assert.ok([...fs.active.values()].some((x) => x.progress > 0 && x.progress < 1), `${it.title}: no event under way at ${it.t} s`);
  }
  assert.ok(st.at(-1).debris.on && st.at(-1).fog.on, 'fog with debris');
});
