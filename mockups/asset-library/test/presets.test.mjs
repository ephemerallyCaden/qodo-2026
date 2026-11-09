// R5 presets and R8 determinism: a configuration survives the URL (config -> URL -> a fresh page
// load -> identical pixels) and the JSON block (copy JSON -> import JSON in another page ->
// identical pixels), including palette edits, free colours and a moved camera; the PNG snapshot
// is the stage exactly, upscaled by whole pixels. Every comparison fails on empty output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openLibrary, grabCanvas, diff, stats, settle } from './harness.mjs';
import { crewScene } from '../catalogue.js';

const CONFIGS = [
  {
    name: 'astronaut: free colour, custom eye glow, palette edit, moved camera, 240p',
    state: {
      mode: 'asset', focus: 'astronaut', framing: 'body', camera: { pos: [0.9, 0.8, 2.1], target: [0, 0.5, 0] },
      asset: { kind: 'astronaut', color: '#e0a020', eyeGlow: '#00ffd5', handle: '@you', eyes: 7, phase: 2.4, yaw: -0.6, blink: false },
      render: { t: 5.3, play: false, pixelH: 240 }, palette: { 'suit.2': '#ffccd0' },
    },
  },
  {
    name: 'scene: lava planet + 3 crew, object depth, edited glow',
    state: { mode: 'scene', scene: crewScene(), render: { t: 7.75, play: false, depthMode: 'object' }, palette: { 'glow.1': '#ff965f', 'space': '#12173d' } },
  },
  {
    name: 'ringed ice planet: custom ring, moon orbits, cloud cover, artefacts',
    state: {
      mode: 'asset', focus: 'ring', framing: 'planet',
      asset: { kind: 'planet', biome: 'ocean', seed: 99, size: 1.3, ring: 'wide', ringWidth: 0.55, ringInner: 2.1, cover: 0.4, float: 0.1, artefacts: true, moonOrbits: [{ size: 0.15, orbit: 2.4, incl: 0.8, yaw: 1, offset: 0.3 }, { size: 0.05, orbit: 1.5, incl: -0.2, yaw: 0, offset: 0.9 }] },
      render: { t: 11.1, play: false },
    },
  },
];

test('config -> URL -> fresh page load renders identical pixels', { timeout: 600000 }, async () => {
  const browser = await launch();
  try {
    const a = await openLibrary(browser);
    for (const c of CONFIGS) {
      const hash = await a.evaluate((s) => window.library.set(s), c.state);
      const before = await grabCanvas(a);
      assert.ok(stats(before).drawn > 3000, `${c.name}: empty render (${stats(before).drawn} px)`);
      const b = await openLibrary(browser, { hash });
      await settle(b);
      const after = await grabCanvas(b);
      assert.deepEqual(await b.evaluate(() => window.library.hash()), hash, `${c.name}: the reloaded page holds a different state`);
      const d = diff(before, after);
      console.log(`${c.name}: ${before.w}x${before.h}, ${stats(before).drawn} px drawn, hash ${hash.length} chars, ${d.length} px differ after reload`);
      assert.equal(d.length, 0, `${c.name}: ${d.length} px differ after reload`);
      assert.deepEqual(b.errors.map(String), []);
      await b.close();
    }
    assert.deepEqual(a.errors.map(String), []);
  } finally {
    await browser.close();
  }
});

test('copy JSON -> import JSON (the dialog) renders identical pixels; bad JSON is refused', { timeout: 300000 }, async () => {
  const browser = await launch();
  try {
    const a = await openLibrary(browser);
    const b = await openLibrary(browser);
    const c = CONFIGS[1];
    await a.evaluate((s) => window.library.set(s), c.state);
    const json = await a.evaluate(() => JSON.stringify(window.library.state(), null, 2));
    const before = await grabCanvas(a);
    await b.click('#import-json');
    await b.fill('#json-text', '{ not json');
    await b.click('#json-apply');
    assert.match(await b.textContent('#json-err'), /not valid JSON/);
    await b.fill('#json-text', json);
    await b.click('#json-apply');
    await settle(b);
    const after = await grabCanvas(b);
    assert.ok(stats(after).drawn > 3000, 'empty render after import');
    assert.equal(diff(before, after).length, 0, 'imported JSON renders differently');
    assert.deepEqual([...a.errors, ...b.errors].map(String), []);
  } finally {
    await browser.close();
  }
});

test('PNG snapshot: x1 is the stage, x4 is the stage in whole 4x4 pixels', { timeout: 300000 }, async () => {
  const browser = await launch();
  try {
    const page = await openLibrary(browser);
    await page.evaluate((s) => window.library.set(s), CONFIGS[2].state);
    const stage = await grabCanvas(page);
    const shots = await page.evaluate(async () => {
      const read = async (url) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        return { w: img.width, h: img.height, data: Array.from(x.getImageData(0, 0, img.width, img.height).data) };
      };
      return [await read(window.library.snapshot(1)), await read(window.library.snapshot(4))];
    });
    const [one, four] = shots;
    assert.ok(stats(one).drawn > 3000, 'empty snapshot');
    assert.equal(diff(stage, one).length, 0, 'the x1 PNG differs from the stage');
    assert.equal(four.w, stage.w * 4);
    assert.equal(four.h, stage.h * 4);
    let bad = 0;
    for (let y = 0; y < four.h; y++) for (let x = 0; x < four.w; x++) {
      const i = (y * four.w + x) * 4, j = (Math.floor(y / 4) * stage.w + Math.floor(x / 4)) * 4;
      if (four.data[i] !== stage.data[j] || four.data[i + 1] !== stage.data[j + 1] || four.data[i + 2] !== stage.data[j + 2]) bad++;
    }
    assert.equal(bad, 0, `${bad} px of the x4 PNG are not their stage pixel`);
  } finally {
    await browser.close();
  }
});
