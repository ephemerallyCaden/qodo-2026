// R4 palette editor: editing one palette colour changes exactly the pixels of that role, on every
// asset type, and reset-to-base restores the base frame. Renders use depth fade off, so every
// pixel is an exact palette colour (the per-pixel fade is the one blend). Each case checks:
//  - something changed (fails on empty output and on an edit that never reaches the shader)
//  - every changed pixel was the role's old colour and is now the new colour
//  - every pixel of the role's old colour changed (the role is that colour's only user here)
//  - removing the edit renders the base frame again, pixel for pixel
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openLibrary, grabCanvas, diff, stats, rgbAt, hexInt } from './harness.mjs';
import { crewScene } from '../catalogue.js';

const still = { t: 3, play: false, depth: false };
const CASES = [
  { name: 'lush land step 2 (surface + cloud shadow)', path: 'land.2', to: '#c16a7d', state: { mode: 'asset', focus: 'planet', framing: 'planet', asset: { kind: 'planet', biome: 'lush', seed: 7 }, render: still } },
  { name: 'ring debris cream', path: 'ring.1', to: '#8c51cc', state: { mode: 'asset', focus: 'ring', framing: 'planet', asset: { kind: 'planet', biome: 'lush', seed: 7, ring: 'wide', ringWidth: 0.72, ringInner: 1.54, layers: { surface: false, haze: false, clouds: false, ring: true }, moons: false }, render: still } },
  { name: 'lava molten body (glow 1)', path: 'glow.1', to: '#42bc7f', state: { mode: 'asset', focus: 'planet', framing: 'planet', asset: { kind: 'planet', biome: 'lava', seed: 11 }, render: still } },
  { name: 'crew suit step 2 (scene of 3 astronauts + a planet)', path: 'suit.2', to: '#ffe091', state: { mode: 'scene', scene: crewScene(), render: still } },
  { name: 'coral contributor step 2 (shoulder rings, stripe, eye glow)', path: 'contributors.coral.2', to: '#00ffd5', state: { mode: 'asset', focus: 'astronaut', framing: 'body', asset: { kind: 'astronaut', color: 'coral', eyes: 0 }, render: { ...still, t: 1.2 } } },
];

test('a palette edit changes only the pixels of that role; reset restores the base', { timeout: 600000 }, async () => {
  const browser = await launch();
  try {
    const page = await openLibrary(browser);
    for (const c of CASES) {
      await page.evaluate((s) => window.library.set(s), { ...c.state, palette: {} });
      const base = await grabCanvas(page);
      const from = await page.evaluate((p) => p.split('.').reduce((o, k) => o[k], window.library.basePalette()), c.path);
      await page.evaluate((s) => window.library.set(s), { ...c.state, palette: { [c.path]: c.to } });
      const edited = await grabCanvas(page);
      const changed = diff(base, edited);
      const oldPx = [...Array(base.w * base.h).keys()].filter((i) => rgbAt(base, i) === hexInt(from));
      const stray = changed.filter((i) => rgbAt(base, i) !== hexInt(from) || rgbAt(edited, i) !== hexInt(c.to));
      console.log(`${c.name}: ${from} -> ${c.to}, ${changed.length} px changed of ${oldPx.length} in that colour, ${stray.length} stray, ${stats(base).drawn} px drawn`);
      assert.ok(stats(base).drawn > 2000, `${c.name}: empty base render`);
      assert.ok(changed.length >= 30, `${c.name}: the edit changed only ${changed.length} px`);
      assert.equal(stray.length, 0, `${c.name}: ${stray.length} changed pixels were not ${from} -> ${c.to}`);
      assert.equal(changed.length, oldPx.length, `${c.name}: ${oldPx.length - changed.length} px of ${from} did not change`);
      await page.evaluate((s) => window.library.set(s), { ...c.state, palette: {} });
      assert.equal(diff(base, await grabCanvas(page)).length, 0, `${c.name}: reset does not restore the base frame`);
    }
    assert.deepEqual(page.errors.map(String), []);
  } finally {
    await browser.close();
  }
});

test('the editor UI: pick a swatch, set a hex, reset to base', { timeout: 300000 }, async () => {
  const browser = await launch();
  try {
    const page = await openLibrary(browser);
    await page.evaluate((s) => window.library.set(s), CASES[0].state);
    const base = await grabCanvas(page);
    await page.click('[data-tab="palette"]');
    await page.click('[aria-label="land.2 #38a85a"]');
    await page.fill('[aria-label="hex land.2"]', '#c16a7d');
    await page.press('[aria-label="hex land.2"]', 'Enter');
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    assert.deepEqual(await page.evaluate(() => window.library.state().palette), { 'land.2': '#c16a7d' });
    assert.ok(diff(base, await grabCanvas(page)).length > 100, 'the hex edit did not reach the stage');
    assert.ok(await page.isVisible('.sw button.edited'), 'the edited swatch is not marked');
    await page.click('text=reset to base');
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    assert.deepEqual(await page.evaluate(() => window.library.state().palette), {});
    assert.equal(diff(base, await grabCanvas(page)).length, 0, 'reset to base did not restore the frame');
    assert.deepEqual(page.errors.map(String), []);
  } finally {
    await browser.close();
  }
});
