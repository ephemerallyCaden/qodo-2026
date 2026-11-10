// Trial looks in the browser: the dustier-ash trial changes the shipped desert's pixels only where
// they are ash ramp colours (sand and rock, each into its trial step); it never leaks into the base
// palette, the palette edits or other tiles, even when the catalogue renders while the stage shows
// it; and the side-by-side comparison reloads to the same pixels. Every render check fails on
// empty output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openLibrary, grabCanvas, diff, stats, settle, hexInt, rgbAt } from './harness.mjs';
import { TRIALS } from '../trials.js';
import { V2_PLANET_RAMPS } from '../../asset-viewer/planet-ramps.js';
import * as S from '../state.js';

const T = TRIALS['dusty-ash'];
// shipped colour -> its trial colour, per role and step
const TO_TRIAL = new Map(T.roles.flatMap((role) => V2_PLANET_RAMPS[role].map((hex, i) => [hexInt(hex), hexInt(T.palette.set[role][i])])));
// moons off: the warm moons reuse three sand colours
const desert = (more = {}, render = { depth: false }) => ({ mode: 'asset', focus: 'planet', framing: 'planet', asset: { kind: 'planet', biome: 'desert', seed: 3, ring: 'off', moons: false, ...more }, render: { t: 3, play: false, ...render } });
const grabCompare = (page) => grabCanvas(page, '#cmp-view');

test('the trial differs from the shipped desert only in the ash ramp colours, each into its trial step', { timeout: 600000 }, async () => {
  const browser = await launch();
  try {
    const a = await openLibrary(browser);
    let changed = 0, kept = 0;
    for (const seed of [3, 31, 90]) {
      // depth fade off, so every surface pixel is a ramp colour exactly
      await a.evaluate((s) => window.library.set(s), { ...desert({ seed }) });
      const shipped = await grabCanvas(a);
      await a.evaluate(() => window.library.set({ ...window.library.state(), asset: { ...window.library.state().asset, trial: 'dusty-ash' } }));
      const trial = await grabCanvas(a);
      assert.equal(await a.evaluate(() => window.library.state().asset.seed), seed, 'the flip keeps the seed');
      assert.ok(stats(shipped).drawn > 3000, `seed ${seed}: empty render`);
      const d = diff(shipped, trial);
      for (const px of d) {
        const from = rgbAt(shipped, px), to = rgbAt(trial, px);
        assert.ok(TO_TRIAL.has(from), `seed ${seed} px ${px}: #${from.toString(16)} changed, but it isn't an ash ramp colour`);
        assert.equal(to, TO_TRIAL.get(from), `seed ${seed} px ${px}: #${from.toString(16)} became #${to.toString(16)}, not its trial step`);
      }
      // and every ash ramp pixel did change
      for (let px = 0; px < shipped.data.length / 4; px++) if (TO_TRIAL.has(rgbAt(shipped, px))) assert.notEqual(rgbAt(trial, px), rgbAt(shipped, px), `seed ${seed} px ${px}: an ash pixel kept its shipped colour`);
      changed += d.length;
      kept += stats(shipped).drawn - d.length;
    }
    assert.ok(changed > 3000, `${changed} ash px changed`);
    console.log(`dusty-ash: ${changed} ash ramp px changed (each to its trial step), ${kept} other drawn px identical, over seeds 3, 31, 90`);
    assert.deepEqual(a.errors.map(String), []);
  } finally {
    await browser.close();
  }
});

test('the trial never leaks: the base palette, the edits and the catalogue keep the shipped look', { timeout: 600000 }, async () => {
  const browser = await launch();
  try {
    // boot straight into the trial comparison, so the catalogue thumbnails render while the stage shows the trial
    // (the default render settings: catalogue thumbnails follow the stage's depth settings)
    const b = await openLibrary(browser, { hash: S.encodeHash({ ...desert({ trial: 'dusty-ash' }, {}), trialCompare: true }) });
    await b.waitForFunction(() => window.library.thumbsDone);
    const a = await openLibrary(browser);
    await a.waitForFunction(() => window.library.thumbsDone);
    for (const id of ['planets-2', 'trials-4', 'trials-5', 'planets-0', 'planets-4']) { // desert (shipped) tiles, lava, lush
      const [ta, tb] = [await grabCanvas(a, `[data-id="${id}"] canvas`), await grabCanvas(b, `[data-id="${id}"] canvas`)];
      assert.ok(stats(ta).drawn > 200, `${id}: empty tile`);
      assert.equal(diff(ta, tb).length, 0, `${id} differs when the catalogue renders beside the trial`);
    }
    const [trialA, trialB] = [await grabCanvas(a, '[data-id="planets-3"] canvas'), await grabCanvas(b, '[data-id="planets-3"] canvas')];
    assert.equal(diff(trialA, trialB).length, 0, 'the trial tile itself is the same either way');
    assert.ok(diff(trialA, await grabCanvas(a, '[data-id="planets-2"] canvas')).length > 300, 'the trial tile shows the trial');
    for (const p of [a, b]) {
      const base = await p.evaluate(() => window.library.basePalette());
      assert.deepEqual([base.sand, base.rock], [V2_PLANET_RAMPS.sand, V2_PLANET_RAMPS.rock], 'the base palette is the shipped one');
      assert.deepEqual(await p.evaluate(() => window.library.state().palette), {}, 'no palette edits');
    }
    // the composer shows a trial planet in the shipped look (one palette per scene)
    await b.evaluate(() => window.library.tab('scene'));
    await b.click('text=+ inspected asset');
    assert.equal(await b.evaluate(() => window.library.state().scene.items.at(-1).trial), null);
    assert.deepEqual([...a.errors, ...b.errors].map(String), []);
  } finally {
    await browser.close();
  }
});

test('the side-by-side comparison: shipped and trial, same seed and camera, reload to identical pixels', { timeout: 600000 }, async () => {
  const browser = await launch();
  try {
    const a = await openLibrary(browser);
    const state = { ...desert({ seed: 31, trial: 'dusty-ash', moons: true }, { t: 5.5 }), trialCompare: true, camera: { pos: [2.6, 0.9, 6.1], target: [0, 0, 0] } };
    const hash = await a.evaluate((s) => window.library.set(s), state);
    await settle(a);
    const [stage, cmp] = [await grabCanvas(a), await grabCompare(a)];
    for (const g of [stage, cmp]) assert.ok(stats(g).drawn > 3000, `empty pane (${stats(g).drawn} px)`);
    assert.ok(diff(stage, cmp).length > 1000, 'the two looks render the same');
    assert.match(await a.textContent('#pane-cmp figcaption'), /shipped/);
    assert.match(await a.textContent('#pane-main figcaption'), /dustier ash.*trial/);
    // the comparison is the inspector's own render of the shipped look
    await a.evaluate(() => window.library.set({ ...window.library.state(), trialCompare: false, asset: { ...window.library.state().asset, trial: null } }));
    assert.equal(diff(await grabCanvas(a), cmp).length, 0, 'the comparison pane differs from the shipped look in the inspector');
    const b = await openLibrary(browser, { hash });
    await settle(b);
    assert.equal(await b.evaluate(() => window.library.hash()), hash);
    assert.equal(diff(stage, await grabCanvas(b)).length, 0, 'the trial pane differs after reload');
    assert.equal(diff(cmp, await grabCompare(b)).length, 0, 'the shipped pane differs after reload');
    assert.deepEqual([...a.errors, ...b.errors].map(String), []);
  } finally {
    await browser.close();
  }
});
