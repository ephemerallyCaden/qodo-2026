// Browser checks (headless Chromium + SwiftShader, no socket, no network): the lines render, only for
// the focused item, palette-only and 2 px, clear of every body and label; deterministic; loop-locked;
// reduced motion respected. Every check fails on empty output (checks.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openLab, decode } from '../harness.mjs';
import { checkFrame, linePixels } from '../checks.mjs';
import { OPTIONS, UI, C } from '../variants.js';

let browser, page;
before(async () => { browser = await launch(); page = await openLab(browser); }, { timeout: 300000 });
after(async () => { await browser?.close(); });

const MODES = ['final', 'scene', 'ov', 'blocked'];
async function frames(cell, modes = MODES) {
  const r = await page.evaluate(([c, m]) => window.lab.frames(c, m), [cell, modes]);
  for (const m of modes) r[m] = decode(r[m]);
  return r;
}
const same = (a, b) => a.w === b.w && a.h === b.h && Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)) === 0;
const countOf = (ov, k) => { let n = 0; for (let i = 0; i < ov.w * ov.h; i++) if (ov.data[4 * i] === k) n++; return n; };
const PLANET = { planet: 'src' }, FILE = { planet: 'src', file: 'src/core/fog.ts' };

test('every option: a focused planet or file draws its lines, palette-only, 2 px, clear of bodies and labels; all three steps show', { timeout: 300000 }, async () => {
  for (const o of OPTIONS) for (const focus of [PLANET, FILE]) {
    const cell = { option: o.id, focus, t: 4, since: 3 };
    const r = await frames(cell);
    assert.deepEqual(checkFrame(r, cell), [], `${o.id} ${JSON.stringify(focus)}`);
    assert.ok(linePixels(r.ov).length > 80, `${o.id}: ${linePixels(r.ov).length} line px`);
    assert.ok(r.lines.length >= 3 && r.lines.every((l) => l.stamps > 0), `${o.id}: every line draws`);
    if (focus === PLANET) assert.deepEqual([...new Set(r.lines.map((l) => l.step))].sort(), [0, 1, 2], `${o.id}: weak, mid and strong`);
  }
});

test('nothing focused: no line at all (no hairball), but the missing-pair flag shows', { timeout: 120000 }, async () => {
  for (const o of OPTIONS) {
    const r = await frames({ option: o.id, focus: null, t: 4 });
    assert.deepEqual(checkFrame(r, { focus: null }), []);
    assert.equal(linePixels(r.ov).length, 0);
    assert.ok(countOf(r.ov, C.tealHi) > 10 && countOf(r.ov, C.teal) > 10, 'the flag is drawn');
    assert.ok(!r.labels.some((l) => l.text.startsWith('usually')), 'its text waits for a focus');
  }
  const f = await frames({ option: 'A', focus: PLANET, t: 4 }, []);
  assert.ok(f.labels.some((l) => l.text === 'usually changes with src/core/fog.ts'), 'focusing its pair\'s planet shows the text');
});

test('deterministic: the same cell twice gives the same pixels, labels included', { timeout: 120000 }, async () => {
  for (const o of OPTIONS) {
    const cell = { option: o.id, focus: PLANET, t: 4.3, since: 0.4 };
    const [a, b] = [await frames(cell, ['final', 'composed']), await frames(cell, ['final', 'composed'])];
    assert.ok(same(a.final, b.final) && same(a.composed, b.composed), o.id);
  }
});

test('motion: lines draw in after a focus, B\'s beads travel, and the overlay is loop-locked (24 s)', { timeout: 180000 }, async () => {
  for (const o of OPTIONS) {
    const early = await frames({ option: o.id, focus: PLANET, t: 4, since: 0.2 }, ['ov']);
    const late = await frames({ option: o.id, focus: PLANET, t: 4, since: 3 }, ['ov']);
    assert.ok(linePixels(early.ov).length < linePixels(late.ov).length, `${o.id}: drawing in`);
    const later = await frames({ option: o.id, focus: PLANET, t: 28, since: 3 }, ['ov']);
    assert.ok(same(late.ov, later.ov), `${o.id}: a loop later`);
  }
  const a = await frames({ option: 'B', focus: PLANET, t: 4, since: 3 }, ['ov']);
  const b = await frames({ option: 'B', focus: PLANET, t: 4.5, since: 3.5 }, ['ov']);
  assert.ok(!same(a.ov, b.ov), 'B\'s beads move');
});

test('reduced motion: lines appear at once and the overlay holds still on the frame it froze', { timeout: 180000 }, async () => {
  for (const o of OPTIONS) {
    const at = (t, since) => frames({ option: o.id, focus: PLANET, t, since, reduced: true, freeze: 4 }, ['final', 'ov']);
    const [a, b] = [await at(4, 0.01), await at(9.7, 2)];
    assert.ok(same(a.final, b.final), `${o.id}: frozen`);
    const full = await frames({ option: o.id, focus: PLANET, t: 4, since: 3 }, ['ov']);
    assert.ok(same(a.ov, full.ov), `${o.id}: fully drawn at once`);
  }
});

test('labels: drawn in the UI colours only, on a space backing, and no line under any', { timeout: 120000 }, async () => {
  const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
  const ok = new Set([UI.space, UI.ink, UI.dim, UI.accent].map((h) => hex(h).join()));
  for (const o of OPTIONS) {
    const r = await frames({ option: o.id, focus: FILE, t: 4, since: 3, scale: 4 }, ['composed', 'ov']);
    const { w, data } = r.composed;
    assert.ok(r.labels.length >= 6);
    for (const l of r.labels) {
      // the backing's inner part (whole device px inside the box)
      const x0 = Math.ceil(l.box.x * 4), y0 = Math.ceil(l.box.y * 4), x1 = Math.floor((l.box.x + l.box.w) * 4), y1 = Math.floor((l.box.y + l.box.h) * 4);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = 4 * (y * w + x);
        assert.ok(ok.has([data[i], data[i + 1], data[i + 2]].join()), `${o.id} "${l.text}" (${x}, ${y})`);
      }
      // no line pixel within the box's 1 px gap
      for (let y = Math.floor(l.box.y) - 1; y < Math.ceil(l.box.y + l.box.h) + 1; y++) for (let x = Math.floor(l.box.x) - 1; x < Math.ceil(l.box.x + l.box.w) + 1; x++) {
        if (x < 0 || y < 0 || x >= r.ov.w || y >= r.ov.h) continue;
        assert.ok(![C.dim, C.mid, C.bright].includes(r.ov.data[4 * (y * r.ov.w + x)]), `${o.id}: a line under "${l.text}"`);
      }
    }
  }
});

test('the live page binds and draws without errors', { timeout: 300000 }, async () => {
  const live = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const { load } = await import('../routes.mjs');
  await live.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://cochange.local') return route.abort();
    const { status, body, type } = await load(url.pathname);
    if (status === 403) return route.abort();
    await route.fulfill({ status, body, contentType: type });
  });
  const errors = [];
  live.on('pageerror', (e) => errors.push(e));
  await live.goto('http://cochange.local/cochange-lab/index.html');
  await live.waitForFunction(() => document.getElementById('status')?.textContent.includes('lines'), null, { timeout: 240000 });
  await live.selectOption('#focus', 'src');
  await live.waitForFunction(() => /[1-9]\d* lines/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
  assert.deepEqual(errors, []);
  const size = await live.evaluate(() => [document.getElementById('out').width, document.getElementById('out').height]);
  assert.ok(size[0] >= 320 && size[1] >= 180);
  await live.close();
});
