// R10 and R11 in the browser: a live history step renders its old look on the stage only (the
// catalogue keeps today's), the final step is the inspector's asset pixel for pixel, a history
// URL with a comparison reloads to the same pixels, and archived steps show the archive's image,
// or say it isn't there. Archived images come from a temp fixture archive, never the real one.
// Every render check fails on empty output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { launch, openLibrary, grabCanvas, pageErrors, diff, stats, settle, hexInt } from './harness.mjs';
import { makeArchive, png } from './fixture-archive.mjs';
import * as H from '../history.js';
import * as S from '../state.js';
import { V2_PLANET_RAMPS } from '../../asset-viewer/planet-ramps.js';

// The depth fade tints even the hero a little, so looks are told apart by hue, not exact colours:
// acid lime is yellow-green, rust-ember is red-orange (hues of the ramps' saturated steps).
const hue = (c) => {
  const r = (c >> 16) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  if (!d || d / max < 0.4 || max < 0.25) return null; // greys, darks and pastels carry no look
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const LIME = [65, 125], EMBER = [5, 45];
const count = (grab, [lo, hi]) => { let n = 0; for (const [c, k] of stats(grab).colours) { const h = hue(c); if (h !== null && h >= lo && h <= hi) n += k; } return n; };
const inRange = (hex, [lo, hi]) => hue(hexInt(hex)) >= lo && hue(hexInt(hex)) <= hi;
const history = (h, t = 3) => ({ mode: 'history', history: h, render: { t, play: false } });
const grabCompare = (page) => grabCanvas(page, '#cmp-view');
// the windows hold the ramps they stand for
for (const k of ['toxic', 'spore']) H.VENDORED.acid.set[k].slice(1).forEach((x) => { if (hue(hexInt(x)) !== null && !inRange(x, LIME)) throw new Error(`acid ${k} ${x} outside the lime window`); });
for (const x of V2_PLANET_RAMPS.toxic.slice(1)) if (hue(hexInt(x)) !== null && !inRange(x, EMBER)) throw new Error(`ember ${x} outside its window`);

test('a live history step shows its old palette on the stage only; its final step is the inspector\'s asset', { timeout: 600000 }, async () => {
  const browser = await launch();
  try {
    // boot straight into the acid-lime step, so the catalogue thumbnails render while history colours are active
    const b = await openLibrary(browser, { hash: S.encodeHash(history({ family: 'toxic', step: 0 })) });
    await b.waitForFunction(() => window.library.thumbsDone && window.library.histDone, null, { timeout: 300000 });
    await settle(b);
    const lime = await grabCanvas(b);
    assert.ok(stats(lime).drawn > 3000, `empty render (${stats(lime).drawn} px)`);
    assert.ok(count(lime, LIME) > 1000, `the stage shows the acid-lime look (${count(lime, LIME)} px)`);
    const tile = await grabCanvas(b, '[data-id="planets-1"] canvas');
    assert.equal(tile.data.length, 160 * 90 * 4);
    assert.ok(count(tile, EMBER) > 200, `the toxic tile is ember (${count(tile, EMBER)} px)`);
    assert.equal(count(tile, LIME), 0, 'no lime in the catalogue');
    // the final step against the inspector's toxic tile, same time
    await b.evaluate((s) => window.library.set(s), history({ family: 'toxic', step: 2 }));
    const ember = await grabCanvas(b);
    await b.evaluate(() => window.library.open('planets-1', { render: { t: 3, play: false } }));
    await settle(b);
    const inspector = await grabCanvas(b);
    assert.ok(stats(ember).drawn > 3000);
    assert.equal(count(ember, LIME), 0, 'no lime on the final step');
    assert.equal(diff(ember, inspector).length, 0, 'the final toxic step differs from the inspector');
    // and back: the inspector's palette tab holds no edits
    assert.deepEqual(await b.evaluate(() => window.library.state().palette), {});
    console.log(`toxic: acid step ${count(lime, LIME)} lime px; tile ${count(tile, EMBER)} ember px, 0 lime; final step = inspector (${stats(ember).drawn} px drawn)`);
    assert.deepEqual(b.errors.map(String), []);
  } finally {
    await browser.close();
  }
});

test('a history URL with a comparison reloads to identical pixels in both panes', { timeout: 600000 }, async () => {
  const browser = await launch();
  try {
    const a = await openLibrary(browser);
    const cases = [
      history({ family: 'depth', step: 1, compare: 5 }), // object mode beside pixel-smooth, on the viewer's depth scene
      history({ family: 'palettes', step: 2, option: 18, compare: 0 }), // BLK 36 of the 25, beside the v1 pastels
      history({ family: 'crew', step: 7, option: 2, compare: 8 }), // lab variant C beside K
    ];
    for (const c of cases) {
      const hash = await a.evaluate((s) => window.library.set(s), c);
      const stage = await grabCanvas(a), cmp = await grabCompare(a);
      for (const g of [stage, cmp]) assert.ok(stats(g).drawn > 3000, `${c.history.family}: empty pane (${stats(g).drawn} px)`);
      assert.ok(diff(stage, cmp).length > 1000, `${c.history.family}: the two steps look the same`);
      const b = await openLibrary(browser, { hash });
      await settle(b);
      assert.equal(await b.evaluate(() => window.library.hash()), hash);
      const d1 = diff(stage, await grabCanvas(b)).length, d2 = diff(cmp, await grabCompare(b)).length;
      console.log(`${c.history.family} ${c.history.step}/${c.history.compare}: ${stats(stage).drawn} + ${stats(cmp).drawn} px drawn, ${d1} + ${d2} px differ after reload`);
      assert.equal(d1, 0, 'the stage differs after reload');
      assert.equal(d2, 0, 'the comparison differs after reload');
      assert.deepEqual(pageErrors(b), []); // (no archive here: the timeline's archived thumbnails are 404s)
      await b.close();
    }
    assert.deepEqual(pageErrors(a), []);
  } finally {
    await browser.close();
  }
});

test('archived steps show the archive\'s image, or say it is not there; the UI opens, selects and compares steps', { timeout: 600000 }, async () => {
  const crew0 = H.family('crew').steps[0].img;
  const archive = await makeArchive({ [crew0]: png(64, 36, [0x30, 0x28, 0x5a]) });
  const browser = await launch();
  try {
    const a = await openLibrary(browser, { archive });
    await a.waitForFunction(() => window.library.thumbsDone); // a quiet page: clicks wait for steady frames
    await a.click('[data-tab="history"]');
    let st = await a.evaluate(() => window.library.state());
    assert.deepEqual([st.mode, st.history.family, st.history.step], ['history', 'crew', H.family('crew').steps.length - 1], 'the tab opens the first family at its final step');
    await a.click('.timeline [data-step="0"]');
    await a.waitForFunction(() => document.querySelector('#pane-main img.arch')?.naturalWidth > 0);
    await settle(a);
    const shown = await a.evaluate(() => {
      const img = document.querySelector('#pane-main img.arch');
      return { w: img.naturalWidth, visible: !img.hidden, canvas: !document.getElementById('view').hidden, miss: !document.querySelector('#pane-main .miss').hidden, cap: document.querySelector('#pane-main figcaption').textContent };
    });
    assert.deepEqual({ ...shown, cap: undefined }, { w: 64, visible: true, canvas: false, miss: false, cap: undefined });
    assert.match(shown.cap, /archived image/);
    // compare it with the final step (live): two panes, the comparison rendered off-screen
    await a.click('.timeline [data-step="8"] button');
    await settle(a); // the comparison draws on the next frame
    st = await a.evaluate(() => window.library.state());
    assert.equal(st.history.compare, 8);
    assert.ok(stats(await grabCompare(a)).drawn > 3000, 'the live comparison is empty');
    // the drone lab's first round has no render at all
    await a.evaluate(() => window.library.set({ mode: 'history', history: { family: 'drones', step: 0 } }));
    assert.match(await a.textContent('#pane-main .miss'), /no render was archived/);
    assert.deepEqual(pageErrors(a), []);

    // without an archive the same step says so, and nothing else breaks
    const b = await openLibrary(browser, { hash: await a.evaluate(() => window.library.set({ mode: 'history', history: { family: 'crew', step: 0 } })) });
    await b.waitForFunction(() => !document.querySelector('#pane-main .miss').hidden);
    assert.match(await b.textContent('#pane-main .miss'), /archived image not available/);
    assert.deepEqual(pageErrors(b), []);
  } finally {
    await browser.close();
    await rm(archive, { recursive: true, force: true });
  }
});

test('a live step without history colours opens in the inspector with the same pixels', { timeout: 600000 }, async () => {
  const browser = await launch();
  try {
    const a = await openLibrary(browser);
    const lava = H.family('lava').steps.findIndex((s) => s.live?.options); // the A/B modes
    await a.evaluate((s) => window.library.set(s), history({ family: 'lava', step: lava, option: 1 }, 7.75));
    const before = await grabCanvas(a);
    assert.ok(stats(before).drawn > 3000);
    await a.click('text=open in inspector');
    await settle(a);
    const st = await a.evaluate(() => window.library.state());
    assert.deepEqual([st.mode, st.asset.biome, st.asset.lavaMode, st.render.t], ['asset', 'lava', 'full-warp', 7.75]);
    assert.equal(diff(before, await grabCanvas(a)).length, 0, 'the inspector renders the step differently');
    assert.deepEqual(pageErrors(a), []); // (no archive here: the timeline's archived thumbnails are 404s)
  } finally {
    await browser.close();
  }
});
