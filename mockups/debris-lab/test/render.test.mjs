// Browser checks (headless Chromium + SwiftShader, no socket, no network): the per-tile checks on
// every direction, close-ups, loop lock, per-pixel depth fade, depth sorting, the sweep and
// determinism. Every check fails on empty output (the empty and planted controls come first).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openLab } from '../harness.mjs';
import { tileProblems, decode, diffCount, findSweepable } from '../checks.mjs';
import { VARIANTS, sampleItems } from '../variants.js';
import { CLASSES } from '../kits.js';
import { LOOP } from '../layout.js';

let browser, page;
const stats = (cell) => page.evaluate((c) => window.lab.renderCell(c), cell);
const frames = (cell, ts) => page.evaluate(([c, t]) => window.lab.frames(c, t), [cell, ts]).then((fs) => fs.map(decode));

before(async () => { browser = await launch(); page = await openLab(browser); }, { timeout: 300000 });
after(async () => { await browser?.close(); });

test('controls: an empty tile reads as empty, a planted one as not', { timeout: 300000 }, async () => {
  const empty = await stats({ biome: 'lush', seed: 7, v: 'A', n: 0, cam: 'lineup' });
  assert.equal(empty.debrisPx, 0);
  assert.equal(empty.seen.length, 0);
  assert.deepEqual(tileProblems(empty, 'empty', { pieces: 0 }), []);
  const planted = await stats({ biome: 'lush', seed: 7, v: 'A', n: 3, cam: 'lineup' });
  assert.ok(planted.debrisPx > 0 && planted.seen.length > 0);
  // and the checks catch a tile that should have debris and has none
  assert.ok(tileProblems({ ...empty, shown: 3 }, 'x', { pieces: 3 }).some((p) => p.includes('empty')));
});

test('every direction passes the tile checks on two bands and sizes', { timeout: 600000 }, async () => {
  for (const v of VARIANTS) {
    for (const cell of [{ biome: 'lush', seed: 7, size: 1 }, { biome: 'lava', seed: 11, size: 0.55 }, { biome: 'ice', seed: 21, size: 1, t: 15 }]) {
      const s = await stats({ ...cell, v: v.id, n: 8, cam: 'lineup', debrisSeed: 7 });
      assert.deepEqual(tileProblems(s, `${v.id} ${cell.biome}`, { pieces: 8 }), []);
      assert.ok(s.debrisPx > 40, `${v.id} ${cell.biome}: only ${s.debrisPx} debris px`);
    }
    const busy = await stats({ biome: 'lush', seed: 7, v: v.id, n: 24, cam: 'lineup', debrisSeed: 7 });
    assert.deepEqual(tileProblems(busy, `${v.id} 24`, { pieces: v.cap }), []);
    assert.equal(busy.overflow, 24 - v.cap);
  }
});

test('close-ups: one piece; intact and rusted in one piece, broken in fragments', { timeout: 300000 }, async () => {
  for (const v of ['A', 'C', 'D']) for (const cls of CLASSES) for (const age of [20, 400]) {
    const s = await stats({ planet: false, moons: false, v, arrangement: 'display', items: [{ id: `${cls}-${age}`, cls, diff: 600, age }], cam: 'piece' });
    assert.deepEqual(tileProblems(s, `${v} ${cls} ${age}`, { pieces: 1, single: true }), []);
  }
});

test('loops are locked to 24 s, and they move', { timeout: 600000 }, async () => {
  for (const v of VARIANTS) {
    const [a, mid, b] = await frames({ biome: 'ocean', seed: 42, v: v.id, n: 8, cam: 'lineup' }, [2, 2 + LOOP / 2, 2 + LOOP]);
    assert.equal(diffCount(a, b), 0, `${v.id}: a loop later differs`);
    assert.ok(diffCount(a, mid) > 0, `${v.id}: nothing moved`);
  }
});

test('depth: debris fades per pixel with distance, and hides behind the planet', { timeout: 300000 }, async () => {
  const piece = { planet: false, moons: false, v: 'A', arrangement: 'display', items: [{ id: 'g', cls: 'branch', diff: 3000, age: 20 }] };
  const lum = (img, bg) => { let s = 0, n = 0; for (let i = 0; i < img.length; i += 4) if (img[i] !== bg[i] || img[i + 1] !== bg[i + 1] || img[i + 2] !== bg[i + 2]) { s += img[i] + img[i + 1] + img[i + 2]; n++; } return { mean: s / Math.max(1, n), n }; };
  const at = async (d) => {
    const cam = { pos: [0, 0, d], target: [0, 0, 0] };
    const [faded] = await frames({ ...piece, cam }, [3]);
    const [flat] = await frames({ ...piece, cam, depth: false }, [3]);
    const [bg] = await frames({ planet: false, moons: false, cam }, [3]);
    return { faded: lum(faded, bg), flat: lum(flat, bg) };
  };
  const near = await at(7), far = await at(30);
  assert.ok(near.flat.n > 0 && far.flat.n > 0, 'the piece drew');
  assert.ok(far.faded.mean < far.flat.mean * 0.8, `far fade: ${far.faded.mean} vs ${far.flat.mean}`);
  assert.ok(far.faded.mean / far.flat.mean < near.faded.mean / near.flat.mean, 'farther fades more');
  // depth sorting: across a loop some pieces pass behind the planet, and none of them leaks
  let hidden = 0;
  for (const t of [1, 5, 9, 13, 17, 21]) {
    const s = await stats({ biome: 'lush', seed: 7, v: 'A', n: 12, cam: 'lineup', t });
    assert.equal(s.leakPx, 0, `t ${t}: ${s.leakPx} px drawn through the planet`);
    hidden += s.hidden.length;
  }
  assert.ok(hidden > 0, 'no piece passed behind the planet, so the depth check proved nothing');
});

test('the sweep flashes teal, then leaves no trace (D6)', { timeout: 300000 }, async () => {
  const items = sampleItems(5, { prefix: 'sw' });
  // sweep a piece that's in clear view when its sweep starts (the same pick as lab.mjs)
  const pick = await findSweepable(stats, { biome: 'lush', seed: 7, v: 'A', items, cam: 'lineup' });
  assert.ok(pick, 'no piece in clear view to sweep');
  const { id, start } = pick;
  const base = { biome: 'lush', seed: 7, v: 'A', items, cam: 'lineup', sweeps: { [id]: start } };
  const before = await stats({ ...base, t: start - 0.1 });
  assert.equal(before.tealPx, 0);
  const during = await stats({ ...base, t: start + 0.1 });
  assert.ok(during.tealPx > 0, 'no teal flash');
  const after = await stats({ ...base, t: start + 1.3 });
  assert.equal(after.tealPx, 0);
  const [gone] = await frames({ ...base, depth: false }, [start + 1.3]);
  const [next] = await frames({ ...base, depth: false, sweeps: {}, items: items.filter((x) => x.id !== id) }, [start + 1.3]);
  assert.equal(diffCount(gone, next), 0, 'the swept piece left a trace');
});

test('A3: a crisp 1 px red outline around the silhouette, and nav lights that blink', { timeout: 300000 }, async () => {
  const OUT = [0xd8, 0x38, 0x43], LIT = [0xff, 0x68, 0x66];
  const is = (img, i, c) => img[i * 4] === c[0] && img[i * 4 + 1] === c[1] && img[i * 4 + 2] === c[2];
  for (const cls of CLASSES) {
    const cell = { planet: false, moons: false, v: 'A3', arrangement: 'display', items: [{ id: `o-${cls}`, cls, diff: 3000, age: 20 }], cam: 'piece', depth: false };
    const [img] = await frames(cell, [3]);
    const [bg] = await frames({ planet: false, moons: false, cam: 'piece', depth: false }, [3]);
    const w = 320, h = 180, n = w * h;
    const changed = (i) => img[i * 4] !== bg[i * 4] || img[i * 4 + 1] !== bg[i * 4 + 1] || img[i * 4 + 2] !== bg[i * 4 + 2];
    const body = (i) => changed(i) && !is(img, i, OUT) && !is(img, i, LIT);
    const near = (i, f, d = 1) => { const x = i % w, y = Math.floor(i / w); for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { const xx = x + dx, yy = y + dy; if ((dx || dy) && xx >= 0 && yy >= 0 && xx < w && yy < h && f(yy * w + xx)) return true; } return false; };
    const near4 = (i, f) => { const x = i % w; return (x > 0 && f(i - 1)) || (x < w - 1 && f(i + 1)) || (i >= w && f(i - w)) || (i < n - w && f(i + w)); };
    let outline = 0, stray = 0, ring = 0, ringRed = 0;
    for (let i = 0; i < n; i++) {
      if (is(img, i, OUT)) { outline++; if (!near(i, body)) stray++; }
      if (!body(i) && near4(i, body)) { ring++; if (changed(i)) ringRed++; } // the 1 px ring just outside the body (edge neighbours)
    }
    console.log(`A3 outline ${cls}: ${outline} px, ${stray} not touching the body, edge cover ${((100 * ringRed) / ring).toFixed(1)}%`);
    assert.ok(outline > 20, `${cls}: only ${outline} outline px`);
    assert.ok(stray <= Math.max(1, outline * 0.02), `${cls}: ${stray} of ${outline} outline px don't touch the body (thicker than 1 px or floating)`);
    assert.ok(ringRed / ring > 0.8, `${cls}: the outline covers only ${((100 * ringRed) / ring).toFixed(0)}% of the silhouette's edge`);
  }
  // the lights: a lit and a dark moment within one loop, and a loop later the same
  const cell = { biome: 'lush', seed: 7, v: 'A3', items: [{ id: 'l0', cls: 'branch', diff: 3000, age: 20 }], cam: 'hero', depth: false };
  const ts = Array.from({ length: 48 }, (_, k) => k / 2);
  const fr = await frames(cell, ts);
  const lit = fr.map((img) => { let c = 0; for (let i = 0; i < img.length / 4; i++) if (is(img, i, LIT)) c++; return c; });
  assert.ok(Math.max(...lit) > 0 && Math.min(...lit) === 0, `lights never blink: ${lit.join(',')}`);
  const [again] = await frames(cell, [ts[5] + LOOP]);
  assert.equal(diffCount(fr[5], again), 0);
});

test('the same cell renders the same pixels', { timeout: 300000 }, async () => {
  const cell = { biome: 'toxic', seed: 13, v: 'E', n: 8, cam: 'lineup' };
  const [a] = await frames(cell, [7.25]);
  await stats({ biome: 'lava', seed: 11, v: 'C', n: 24, cam: 'lineup' }); // other work in between
  const [b] = await frames(cell, [7.25]);
  assert.equal(diffCount(a, b), 0);
});
