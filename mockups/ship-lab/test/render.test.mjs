// Browser checks (headless Chromium + SwiftShader, no socket, no network): every direction at the
// close-up and near distance with 1, 3 and 8 aboard passes the tile checks (BLK 36 only, one connected
// ship with its crew aboard, every astronaut and the captain's cap visible, a flame, not empty, not clipped); the teal
// option shows teal; renders are deterministic and loop-locked (one cycle later is the same frame);
// the crew cycle is the viewer's; and the page asks for nothing off the allowlist. One browser for all.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openLab } from '../harness.mjs';
import { tileProblems } from '../checks.mjs';
import { CYCLE } from '../ship-spec.js';

const IDS = ['A', 'B', 'C', 'D'];
const R2 = ['R2-1', 'R2-2', 'R2-3', 'R2-4', 'R2-5', 'R2-4b', 'R2-4c', 'R2-4c-final']; // round 2 (A, shorter, fatter and rounder) and 2b (R2-4's windows alike, in lines)
let browser, page;
before(async () => {
  browser = await launch();
  page = await openLab(browser);
}, { timeout: 300000 });
after(async () => { await browser?.close(); });

const stats = (cell) => page.evaluate((c) => window.lab.tileStats(c), cell);
const pixels = (cell, t) => page.evaluate(({ c, t: tt }) => window.lab.tile(c, { stats: false, t: tt }).rgba, { c: cell, t });

test('the ship\'s idle cycle is the viewer\'s crew cycle', async () => {
  assert.equal(await page.evaluate(() => window.lab.viewerCycle), CYCLE);
});

test('every direction and round-2 variation, 1, 3 and 8 aboard, close-up and near: the tile checks pass', { timeout: 1200000 }, async () => {
  const problems = [];
  for (const v of [...IDS, ...R2]) for (const n of [1, 3, 8]) for (const framing of ['close', 'near']) {
    const s = await stats({ v, n, framing, view: 'front' });
    assert.ok(s.shipPx > 500, `${v} ${framing} n=${n}: empty or tiny (${s.shipPx} px)`);
    assert.equal(s.crew.length, n);
    problems.push(...tileProblems(s, `${v} ${framing} n=${n}`));
  }
  assert.deepEqual(problems, []);
});

test('the captain reads apart: the cap shows on seat 0 in each ship\'s captain close-up', { timeout: 600000 }, async () => {
  const problems = [];
  for (const v of [...IDS, ...R2]) {
    const s = await stats({ v, n: 3, framing: 'crew', view: 'front', focus: 'captain' });
    assert.ok(s.cap.px >= 40, `${v}: the cap shows only ${s.cap.px} px`);
    problems.push(...tileProblems(s, `${v} captain close-up`));
  }
  assert.deepEqual(problems, []);
});

test('two decks (12 aboard) and the +N overflow (20) pass at the near distance', { timeout: 1200000 }, async () => {
  const problems = [];
  for (const v of [...IDS, 'R2-1', 'R2-2', 'R2-4b', 'R2-4c', 'R2-4c-final']) for (const n of [12, 20]) {
    const s = await stats({ v, n, framing: 'near', view: 'front' });
    assert.equal(s.plan.decks, 2);
    assert.equal(s.plan.extra, Math.max(0, n - 16));
    problems.push(...tileProblems(s, `${v} near n=${n}`));
  }
  assert.deepEqual(problems, []);
});

test('beside the star (system) and turned (3/4): BLK 36 only, one connected ship, not clipped', { timeout: 600000 }, async () => {
  const problems = [];
  for (const v of [...IDS, ...R2]) for (const [framing, view] of [['system', '3/4'], ['close', '3/4']]) problems.push(...tileProblems(await stats({ v, n: 3, framing, view }), `${v} ${framing} ${view}`));
  assert.deepEqual(problems, []);
});

test('the teal thrust option shows teal; it is never the default', { timeout: 300000 }, async () => {
  for (const v of IDS) {
    const on = await stats({ v, n: 3, framing: 'close', view: '3/4', teal: true });
    assert.deepEqual(tileProblems(on, `${v} teal`, { teal: true, crewGate: false }), []);
    assert.ok(on.tealPx > 0, `${v}: no teal in the option`);
  }
});

test('deterministic and loop-locked: the same cell twice, and one cycle later, are the same pixels', { timeout: 600000 }, async () => {
  for (const v of [...IDS, ...R2]) for (const t of [0.7, 5.3]) {
    const cell = { v, n: 3, framing: 'close', view: 'hero' };
    const a = await pixels(cell, t);
    assert.equal(await pixels(cell, t), a, `${v} t=${t}: two renders differ`);
    assert.equal(await pixels(cell, t + CYCLE), a, `${v} t=${t}: one cycle later differs`);
    assert.notEqual(await pixels(cell, t + 0.5), a, `${v} t=${t}: frozen`);
  }
});

test('no request left the allowlist', () => {
  assert.deepEqual(page.blocked, []);
  assert.deepEqual(page.errors, []);
});
