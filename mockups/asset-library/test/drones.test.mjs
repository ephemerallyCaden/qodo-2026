// Drones (R7 for drones): a drone in the library is pixel-identical to the drone lab's own render
// (its capture page and renderTile, read-only) at the same provider, session, time and view, with
// smoke on; plus the library's drone constants against the lab's source and the catalogue's
// drones. Every comparison fails on empty output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launch, openLibrary, openDroneLab, grabCanvas, pageErrors, diff, stats } from './harness.mjs';
import { MOCKUPS } from '../routes.mjs';
import { droneCell, LAB, ZOOM, DRONE_PROVIDERS, DRONE_VARIANTS, DRONE_VIEWS } from '../drones.js';
import { BRANDS, DISTINCT } from '../../drone-lab/brands.js';
import { GROUPS } from '../catalogue.js';
import * as S from '../state.js';
import path from 'node:path';

const T = 2.5;
const [FRONT, THREE_Q] = [DRONE_VIEWS[0][1], DRONE_VIEWS[1][1]];
// Copilot, Codex and Qodo at two views each, then a working face close up, a session of the unknown
// agent (generic's twin), an exploration from the side, and the motion loop with edited parameters.
const CASES = [
  ...['copilot', 'codex', 'qodo'].flatMap((provider) => [FRONT, THREE_Q].map((yaw) => ({ provider, session: 7, yaw }))),
  { provider: 'claude', session: 3, yaw: -0.5, face: 'working', framing: 'drone-close' },
  { provider: 'unknown', session: 11, yaw: THREE_Q, framing: 'drone-close' },
  { variant: 'B', yaw: DRONE_VIEWS[2][1] },
  { provider: 'kiro', yaw: DRONE_VIEWS[3][1], face: 'motion', blink: false, params: { puffSize: 1.4, antL: 0.07 } },
];
const label = (c) => `${c.variant ? `variant ${c.variant}` : `${c.provider}${c.session != null ? ` #${c.session}` : ''}`} yaw ${c.yaw.toFixed(2)} ${c.face ?? 'idle'} ${c.framing ?? 'drone'}`;

/** The lab's own tile for a cell: its sheet at scale 1, one cell, no labels; the tile is at (gap, gap). */
const labTile = (page, cell, w, h) => page.evaluate(async ({ cell, w, h }) => {
  const gap = 6;
  const { png } = window.lab.sheet({ rows: [{ cells: [cell] }], w, h, scale: 1, gap, check: false });
  const img = new Image();
  img.src = png;
  await img.decode();
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const x = c.getContext('2d');
  x.drawImage(img, -gap, -gap);
  return { w, h, data: Array.from(x.getImageData(0, 0, w, h).data) };
}, { cell, w, h });

test('a drone in the library is the drone lab\'s own render, pixel for pixel', { timeout: 900000 }, async () => {
  const browser = await launch();
  try {
    const lib = await openLibrary(browser);
    const lab = await openDroneLab(browser);
    for (const c of CASES) {
      const st = S.normalise({ mode: 'asset', focus: 'drone', framing: c.framing ?? 'drone', asset: { kind: 'drone', ...c }, render: { t: T, play: false } });
      await lib.evaluate((s) => window.library.set(s), st);
      const mine = await grabCanvas(lib);
      const theirs = await labTile(lab, { ...droneCell(st.asset, T), zoom: ZOOM[st.framing] }, mine.w, mine.h);
      const drawn = stats(mine).drawn, d = diff(mine, theirs).length;
      console.log(`${label(c)}: ${mine.w}x${mine.h}, ${drawn} px drawn, ${d} px differ`);
      assert.ok(drawn > 400, `${label(c)}: empty render (${drawn} px)`);
      assert.equal(d, 0, `${label(c)}: ${d} px differ from the drone lab`);
    }
    assert.deepEqual([...lib.errors, ...lab.errors].map(String), []);
  } finally {
    await browser.close();
  }
});

test('drones in a scene beside the crew and a planet: deterministic, clickable, shift-drag moves only them', { timeout: 600000 }, async () => {
  const browser = await launch();
  try {
    const a = await openLibrary(browser);
    const scene = { mode: 'scene', scene: { items: [
      { kind: 'planet', biome: 'lush', seed: 7, pos: [0.4, 0.6, -4] },
      { kind: 'astronaut', color: 'coral', handle: '@caden', pos: [-1.2, -0.4, 3.6], yaw: 0.45 },
      { kind: 'drone', provider: 'codex', session: 2, pos: [0.3, 0.1, 3.4], yaw: 0.2, phase: 1.5 },
      { kind: 'drone', provider: 'qodo', pos: [1.2, 0.3, 2.6], yaw: -0.4 },
    ], selected: -1, camera: { pos: [0.1, 0.7, 8.6], target: [0, 0, 0] } }, render: { t: 4, play: false } };
    const hash = await a.evaluate((s) => window.library.set(s), scene);
    const first = await grabCanvas(a);
    assert.ok(stats(first).drawn > 3000, 'empty scene');
    // each drone reaches the frame: removing it changes pixels
    for (const i of [2, 3]) {
      const without = { ...scene, scene: { ...scene.scene, items: scene.scene.items.filter((_, j) => j !== i) } };
      await a.evaluate((s) => window.library.set(s), without);
      assert.ok(diff(first, await grabCanvas(a)).length > 100, `drone ${i} isn't in the frame`);
    }
    await a.evaluate((s) => window.library.set(s), scene);
    const b = await openLibrary(browser, { hash });
    assert.equal(diff(first, await grabCanvas(b)).length, 0, 'the scene differs in a fresh page');
    // click the Qodo drone to select it, then shift-drag it: only its position changes
    const at = await a.evaluate(() => window.library.bounds(3));
    await a.mouse.click(at.x, at.y);
    assert.equal(await a.evaluate(() => window.library.state().scene.selected), 3);
    const before = await a.evaluate(() => window.library.state().scene.items);
    await a.keyboard.down('Shift');
    await a.mouse.move(at.x, at.y);
    await a.mouse.down();
    await a.mouse.move(at.x - 60, at.y + 30, { steps: 4 });
    await a.mouse.up();
    await a.keyboard.up('Shift');
    const after = await a.evaluate(() => window.library.state().scene.items);
    assert.notDeepEqual(after[3].pos, before[3].pos, 'the drone moved');
    assert.deepEqual(after.filter((_, i) => i !== 3), before.filter((_, i) => i !== 3), 'nothing else moved');
    assert.deepEqual([...a.errors, ...b.errors].map(String), []);
  } finally {
    await browser.close();
  }
});

test('the history\'s drones end on the live drones: the inspector\'s render, per provider', { timeout: 600000 }, async () => {
  const browser = await launch();
  try {
    const a = await openLibrary(browser);
    const H = await import('../history.js');
    const fam = H.family('drones'), step = fam.steps.length - 1;
    for (const provider of ['copilot', 'qodo']) {
      const option = fam.steps[step].live.options.list.findIndex((o) => o.id === provider);
      await a.evaluate((s) => window.library.set(s), { mode: 'history', history: { family: 'drones', step, option }, render: { t: T, play: false } });
      const hist = await grabCanvas(a);
      await a.evaluate((s) => window.library.set(s), { mode: 'asset', focus: 'drone', framing: 'drone', asset: { kind: 'drone', provider, yaw: -0.5 }, render: { t: T, play: false } });
      const insp = await grabCanvas(a);
      assert.ok(stats(hist).drawn > 400, `${provider}: empty history render`);
      assert.equal(diff(hist, insp).length, 0, `${provider}: the history step differs from the inspector`);
    }
    assert.deepEqual(pageErrors(a), []); // (no archive here: the timeline's archived thumbnails are 404s)
  } finally {
    await browser.close();
  }
});

test('the library\'s copy of the lab\'s framing matches lab.js', async () => {
  const src = await readFile(path.join(MOCKUPS, 'drone-lab', 'lab.js'), 'utf8');
  assert.match(src, new RegExp(`const FRAME_H = ${LAB.frameH};`));
  assert.match(src, new RegExp(`const FOV = ${LAB.fov};`));
  assert.match(src, new RegExp(`const CAM = new THREE\\.Vector3\\(${LAB.cam.join(', ')}\\);`));
  assert.match(src, new RegExp(`const cy = \\(top \\+ bottom\\) / 2 - ${LAB.low} - \\(cell\\.frameLow \\?\\? 0\\);`));
  assert.match(src, new RegExp(`export const DRONE_HOVER = ${LAB.hover};`));
  assert.match(src, /const pixK = PIXK \/ zoom;/);
});

test('the catalogue holds every provider drone (final) and the lab\'s explorations', () => {
  assert.equal(DISTINCT.length, 10);
  assert.deepEqual(DRONE_PROVIDERS, BRANDS.map((b) => b.id));
  assert.equal(DRONE_PROVIDERS.length, 11, 'the 10 distinct drones and the unknown agent');
  const items = GROUPS.find((g) => g.id === 'drones').items;
  assert.deepEqual(items.filter((it) => it.final).map((it) => it.state.asset.provider), DRONE_PROVIDERS);
  assert.deepEqual(items.filter((it) => !it.final).map((it) => it.state.asset.variant), DRONE_VARIANTS);
  assert.deepEqual(DRONE_VARIANTS, ['A', 'B', 'C', 'D', 'E']);
  const astronauts = GROUPS.findIndex((g) => g.id === 'astronauts');
  assert.equal(GROUPS[astronauts + 1].id, 'drones', 'with the astronauts');
  // drone state: clamped, and a drone round-trips through the URL
  const d = S.normaliseDrone({ provider: 'nope', variant: 'Z', session: 5000, face: 'dance', yaw: 9, params: { antL: 99, eyes: 1.6, nope: 1, thrusters: 99 } });
  assert.deepEqual([d.provider, d.variant, d.session, d.face, d.yaw], ['generic', null, 999, 'idle', 3.2]);
  assert.deepEqual(Object.keys(d.params).sort(), ['antL', 'eyes', 'thrusters']);
  const st = S.normalise({ mode: 'asset', framing: 'drone-close', asset: { kind: 'drone', provider: 'qodo', session: 4, face: 'working', params: { puffSize: 1.2 } } });
  assert.deepEqual(S.decodeHash(S.encodeHash(st)), st);
  assert.equal(st.focus, 'drone');
});
