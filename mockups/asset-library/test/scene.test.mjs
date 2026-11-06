// R3 scenes: a composed scene (1 planet + 3 astronauts at chosen positions and depths) renders
// deterministically: the same frame again after other work in the page, and in a fresh page
// from its URL. Every item reaches the frame (each one's own colours appear). On the stage, a
// click selects the item under it and shift-drag moves only that item. Fails on empty output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openLibrary, grabCanvas, diff, stats, hexInt } from './harness.mjs';
import { crewScene } from '../catalogue.js';

const SCENE = { mode: 'scene', scene: crewScene(), render: { t: 2, play: false } };
// Colours only one item draws: lava glow, the free gold contributor, coral, lilac.
const OWN = { 'lava planet': ['#ff761a', '#c9361a'], 'gold astronaut': ['#e0a020'], 'coral astronaut': ['#cc5250', '#ff6866'], 'lilac astronaut': ['#b991f2', '#8c51cc'] };

test('a composed scene (1 planet + 3 astronauts) renders deterministically', { timeout: 600000 }, async () => {
  const browser = await launch();
  try {
    const a = await openLibrary(browser);
    const hash = await a.evaluate((s) => window.library.set(s), SCENE);
    const first = await grabCanvas(a);
    const st = stats(first);
    assert.ok(st.drawn > 3000, `empty scene render (${st.drawn} px)`);
    // every item reaches the frame: its own palette colours, checked with the depth fade off
    await a.evaluate((s) => window.library.set({ ...s, render: { ...s.render, depth: false } }), SCENE);
    const flat = stats(await grabCanvas(a));
    for (const [who, hexes] of Object.entries(OWN)) assert.ok(hexes.some((h) => (flat.colours.get(hexInt(h)) ?? 0) >= 5), `${who} is missing from the frame`);
    // other work in between: a different asset, palette edits, another scene, playing
    await a.evaluate(() => window.library.open('planets-2', { palette: { 'ice.2': '#ffccd0' } }));
    await a.evaluate(() => window.library.set({ mode: 'scene', scene: { items: [{ kind: 'planet', biome: 'gas', seed: 5 }] }, render: { play: true } }));
    await a.evaluate(() => new Promise((r) => setTimeout(r, 500)));
    await a.evaluate((s) => window.library.set(s), SCENE);
    const again = await grabCanvas(a);
    assert.equal(diff(first, again).length, 0, 'the same scene renders differently the second time');
    const b = await openLibrary(browser, { hash });
    await b.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const fresh = await grabCanvas(b);
    assert.equal(diff(first, fresh).length, 0, 'the scene renders differently in a fresh page');
    console.log(`scene: ${first.w}x${first.h}, ${st.drawn} px drawn, ${st.colours.size} colours; same after other work and in a fresh page`);
    assert.deepEqual([...a.errors, ...b.errors].map(String), []);
  } finally {
    await browser.close();
  }
});

test('stage: click selects an item, shift-drag moves only it, the list adds and removes', { timeout: 300000 }, async () => {
  const browser = await launch();
  try {
    const page = await openLibrary(browser);
    await page.evaluate((s) => window.library.set(s), SCENE);
    const b = await page.evaluate(() => window.library.bounds(2));
    await page.mouse.click(b.x, b.y);
    assert.equal(await page.evaluate(() => window.library.state().scene.selected), 2, 'clicking the gold astronaut did not select it');
    assert.ok(await page.isVisible('#sel'), 'no selection box');
    const before = await page.evaluate(() => window.library.state().scene.items);
    await page.keyboard.down('Shift');
    await page.mouse.move(b.x, b.y);
    await page.mouse.down();
    await page.mouse.move(b.x + 60, b.y - 30, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const after = await page.evaluate(() => window.library.state().scene.items);
    assert.notDeepEqual(after[2].pos, before[2].pos, 'shift-drag did not move the selected item');
    assert.ok(after[2].pos[0] > before[2].pos[0], 'dragging right did not move it right');
    assert.ok(after[2].pos[1] > before[2].pos[1], 'dragging up did not move it up');
    after.forEach((it, i) => { if (i !== 2) assert.deepEqual(it, before[i], `item ${i} moved too`); });
    // clicking empty space (the canvas's top-left corner) clears the selection
    const corner = await page.evaluate(() => { const r = document.getElementById('view').getBoundingClientRect(); return { x: r.left + 4, y: r.top + 4 }; });
    await page.mouse.click(corner.x, corner.y);
    assert.equal(await page.evaluate(() => window.library.state().scene.selected), -1);
    // the list: add an astronaut, then remove it
    await page.click('text=+ astronaut');
    assert.equal(await page.evaluate(() => window.library.state().scene.items.length), 5);
    await page.click('.items .it.sel button[title="remove"]');
    assert.equal(await page.evaluate(() => window.library.state().scene.items.length), 4);
    assert.deepEqual(page.errors.map(String), []);
  } finally {
    await browser.close();
  }
});
