// Pure checks (Node, no browser): the co-change data (#211's pairs, threshold, cap, partners and
// missing-pair flags), the rasteriser's 2 px and mask rules, the options' strength steps, the palette,
// the frame checks themselves and the route allowlist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pairs, filePartners, filePartnerPlanets, planetPartners, missingPairs, history, system, step, STEPS, THRESHOLD, CAP, FLAG_MIN, PLANETS, FILES, planetOf,
} from '../data.js';
import { resample, stampFree, stamp, span, revealAt, drawLine, drawBeads, busyMask, dilate, blockBox } from '../raster.js';
import { OPTIONS, COLOURS, LINE_COLOURS, STARS, TEAL, BEACON_COLOURS, FLAG_SHAPE, BEACON_SHAPE, TIMELINE, GIF, focusAt, SPACE } from '../variants.js';
import { checkFrame, slivers } from '../checks.mjs';
import { resolveFile } from '../routes.mjs';
import { ACCENTS } from '../../asset-viewer/planet-ramps.js';
import { mapPalette } from '../../asset-viewer/palette-map.js';

const near = (a, b) => Math.abs(a - b) < 1e-12;

test('pairs: Jaccard over the commits each file is in, above the threshold, capped per file, strongest first', () => {
  const commits = [['a', 'b'], ['a', 'b'], ['a', 'c'], ['a'], ['b', 'c'], ['d', 'e']];
  const ps = pairs(commits, { threshold: 0.3, cap: 5 });
  // a: 4 commits, b: 3, c: 2; a&b 2 -> 2/5; a&c 1 -> 1/5 (dropped); b&c 1 -> 1/4 (dropped); d&e 1/1
  assert.deepEqual(ps.map((p) => [p.a, p.b, p.both]), [['d', 'e', 1], ['a', 'b', 2]]);
  assert.ok(near(ps[0].strength, 1) && near(ps[1].strength, 0.4));
  const all = pairs(commits, { threshold: 0, cap: 1 });
  // cap 1: every file keeps only its strongest pair; a pair stays if it's in either file's top 1
  assert.deepEqual(all.map((p) => `${p.a}${p.b}`), ['de', 'ab', 'bc']);
  assert.ok(all.every((p) => p.a < p.b));
});

test('the demo history is deterministic, and its pairs respect THRESHOLD and CAP', () => {
  assert.deepEqual(history(), history());
  const { pairs: ps } = system();
  assert.ok(ps.length > 20);
  assert.ok(ps.every((p) => p.strength >= THRESHOLD));
  for (const f of FILES) {
    const mine = ps.filter((p) => p.a === f || p.b === f);
    // every kept pair is in the top CAP of at least one of its two files
    for (const p of mine) {
      const other = p.a === f ? p.b : p.a;
      const rank = (x) => ps.filter((q) => (q.a === x || q.b === x) && q.strength > p.strength).length;
      assert.ok(rank(f) < CAP || rank(other) < CAP, `${p.a} ${p.b}`);
    }
  }
  assert.deepEqual(pairs(history()), ps);
});

test('steps: three, by strength', () => {
  assert.deepEqual(STEPS.map(step), [0, 1, 2]);
  assert.equal(step(0.29), 0);
  assert.equal(step(0.49), 1);
  assert.equal(step(0.95), 2);
});

test('partners: a planet\'s strongest file pair per partner planet; a file\'s partners grouped by planet', () => {
  const { pairs: ps } = system();
  const src = planetPartners(ps, 'src');
  assert.deepEqual(src.map((q) => [q.planet, q.step]), [['web', 2], ['test', 2], ['docs', 1], ['bench', 0]]);
  assert.ok(src.every((q) => planetOf(q.a) === 'src' && planetOf(q.b) === q.planet));
  for (const P of PLANETS) assert.ok(planetPartners(ps, P.id).every((q) => q.planet !== P.id), 'no line to itself');
  const groups = filePartnerPlanets(ps, 'src/core/fog.ts');
  assert.deepEqual(groups.map((g) => [g.planet, g.step, g.files.length]), [['web', 2, 2], ['test', 2, 1], ['src', 1, 1], ['docs', 0, 1]]);
  assert.deepEqual(filePartners(ps, 'src/core/fog.ts').map((p) => p.file).slice(0, 2), ['web/src/model/fog.ts', 'test/fog.test.ts']);
});

test('missing pairs: a strong partner left out of a change is flagged, once, for its strongest partner in it', () => {
  const ps = [
    { a: 'x', b: 'y', strength: 0.9 }, { a: 'w', b: 'y', strength: 0.7 }, { a: 'x', b: 'z', strength: 0.4 }, { a: 'w', b: 'x', strength: 0.8 },
  ];
  assert.deepEqual(missingPairs(ps, ['x'], 0.5), [{ file: 'w', with: 'x', strength: 0.8 }, { file: 'y', with: 'x', strength: 0.9 }]);
  assert.deepEqual(missingPairs(ps, ['x', 'w'], 0.5), [{ file: 'y', with: 'x', strength: 0.9 }]);
  assert.deepEqual(missingPairs(ps, ['x', 'y', 'w'], 0.5), [], 'every partner changed: no flag');
  assert.equal(FLAG_MIN, STEPS[2]);
  const { flags } = system();
  assert.deepEqual(flags.map((f) => [f.file, f.with]), [['web/src/model/fog.ts', 'src/core/fog.ts']]);
});

test('settlements: one #18 cell per file, distinct on each planet', () => {
  const { cells } = system();
  assert.equal(cells.size, FILES.length);
  for (const P of PLANETS) {
    const mine = FILES.filter((f) => planetOf(f) === P.id).map((f) => cells.get(f));
    assert.equal(new Set(mine).size, mine.length);
    assert.ok(mine.every((c) => Number.isInteger(c) && c >= 0 && c < 256));
  }
});

// ------------------------------------------------------------------ the rasteriser
const W = 40, H = 20;
const none = () => new Uint8Array(W * H);
const asOv = (ov) => ({ w: W, h: H, data: Uint8Array.from({ length: W * H * 4 }, (_, i) => (i % 4 === 0 ? ov[i / 4] : 0)) });

test('resample: a point every px of arc length', () => {
  const s = resample([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 9 }], 1);
  assert.equal(s.length, 11);
  s.forEach((p, i) => assert.equal(p.s, i));
  assert.deepEqual([s[5].x, s[5].y], [3, 4]);
});

test('lines are whole 2 px stamps, only where the mask is free, and dots fall every `period` px', () => {
  const samples = resample([{ x: 2, y: 10 }, { x: 37, y: 4 }], 1);
  const sp = [0, samples.at(-1).s];
  const ov = none();
  assert.ok(drawLine(ov, none(), W, H, samples, sp, { w: 2, colour: 1 }) > 20);
  assert.equal(slivers(asOv(ov)), 0, 'no 1 px slivers on a diagonal');
  // a blocked column: no stamp touches it, and the line carries on past it
  const blocked = none();
  for (let y = 0; y < H; y++) blocked[y * W + 20] = 1;
  const cut = none();
  drawLine(cut, blocked, W, H, samples, sp, { w: 2, colour: 1 });
  for (let y = 0; y < H; y++) assert.equal(cut[y * W + 20], 0);
  assert.ok([...Array(H).keys()].some((y) => cut[y * W + 30]), 'drawn past the block');
  assert.equal(slivers(asOv(cut)), 0, 'a stamp is skipped whole, never cut to a sliver');
  // dots: one 2×2 stamp every 5 px
  const dots = none();
  const flat = resample([{ x: 2, y: 10 }, { x: 37, y: 10 }], 1);
  assert.equal(drawLine(dots, none(), W, H, flat, [0, 35], { w: 2, colour: 2, period: 5 }), 8);
  assert.equal(slivers(asOv(dots)), 0);
  assert.equal(stampFree(none(), W, H, 0.4, 0.4, 2), false, 'off the frame edge');
  assert.equal(stamp(none(), none(), W, H, 39.6, 5, 2, 1), false);
});

test('span: from where a line leaves its start disc to where it meets its end disc', () => {
  const samples = resample([{ x: 0, y: 10 }, { x: 40, y: 10 }], 1);
  assert.deepEqual(span(samples, { x: 0, y: 10, r: 5 }, { x: 40, y: 10, r: 8 }, 1.5), [7, 30]);
  assert.equal(span(samples, { x: 20, y: 10, r: 30 }, null), null, 'nothing outside the disc');
});

test('draw-in: from the focused end, strongest first; reduced motion draws at once', () => {
  assert.equal(revealAt(0, 0), 0);
  assert.equal(revealAt(5, 3), 1);
  assert.ok(revealAt(0.3, 0) > revealAt(0.3, 1));
  let last = 0;
  for (let t = 0; t <= 1.2; t += 0.05) { const r = revealAt(t, 1); assert.ok(r >= last); last = r; }
  assert.equal(revealAt(0.01, 3, { reduced: true }), 1);
  const samples = resample([{ x: 2, y: 10 }, { x: 37, y: 10 }], 1);
  const half = none();
  drawLine(half, none(), W, H, samples, [0, 35], { w: 2, colour: 1 }, 0.5);
  assert.ok(half[10 * W + 8] && !half[10 * W + 32], 'half drawn, from the start');
});

test('beads: n beads, head and tail, loop-locked by phase', () => {
  const samples = resample([{ x: 2, y: 10 }, { x: 37, y: 10 }], 1);
  const draw = (n, u) => { const ov = none(); drawBeads(ov, none(), W, H, samples, [0, 35], { w: 2, n, u, len: 6, headLen: 2, head: 3, tail: 2 }); return ov; };
  const runs = (ov) => { let k = 0; for (let x = 1; x < W; x++) if (ov[10 * W + x] === 3 && ov[10 * W + x - 1] !== 3) k++; return k; };
  assert.equal(runs(draw(1, 0.5)), 1);
  assert.equal(runs(draw(3, 0.5)), 3);
  assert.deepEqual(draw(2, 0.3), draw(2, 1.3), 'phase wraps');
  assert.notDeepEqual(draw(2, 0.3), draw(2, 0.4), 'beads move');
});

test('masks: anything but the free colours is busy, grown by the gap; boxes block with padding', () => {
  const img = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) img.set([13, 11, 22, 255], 4 * i); // space
  img.set([255, 0, 0, 255], 4 * (10 * W + 10));
  img.set([0x9a, 0x90, 0xe0, 255], 4 * (5 * W + 5)); // a star: free
  const m = dilate(busyMask(img, W, H, [SPACE, ...STARS]), W, H, 1);
  assert.equal(m.reduce((s, v) => s + v, 0), 9);
  assert.equal(m[5 * W + 5], 0);
  const b = none();
  blockBox(b, W, H, { x: 3.5, y: 3.5, w: 2, h: 1 }, 1);
  assert.equal(b.reduce((s, v) => s + v, 0), 5 * 4);
});

// ------------------------------------------------------------------ options, colours, markers
test('three options, each with three readable strength steps, every brush at least 2 px', () => {
  assert.deepEqual(OPTIONS.map((o) => o.id), ['A', 'B', 'C']);
  for (const o of OPTIONS) {
    assert.equal(o.steps.length, 3);
    assert.ok(o.steps.every((s) => s.w >= 2 && LINE_COLOURS.includes(s.colour)), o.id);
    const keys = o.steps.map((s) => JSON.stringify([s.w, s.colour, s.period, s.beads?.n]));
    assert.equal(new Set(keys).size, 3, `${o.id}: steps differ`);
  }
  const [A, B, Cc] = OPTIONS;
  assert.deepEqual(A.steps.map((s) => s.colour), [1, 2, 3], 'A: brighter');
  assert.ok(A.steps[0].period > A.steps[2].period, 'A: denser');
  assert.deepEqual(B.steps.map((s) => s.beads.n), [1, 2, 3], 'B: more beads');
  assert.ok(Number.isInteger(24 / B.beadPeriod), 'B: whole trips per loop');
  assert.deepEqual(Cc.steps.map((s) => s.w), [2, 3, 4], 'C: thicker');
});

test('palette only: the lines are the v2 stars, the flag is [OIII] teal, the beacon is BLK 36', () => {
  assert.deepEqual(STARS, ['#3b3866', '#9a90e0', '#fff8ff']);
  assert.deepEqual(TEAL, ACCENTS.reveal);
  const blk = mapPalette('blk-36');
  const crew = new Set([...blk.suit, ...blk.gear, blk.glint].map((c) => c.toLowerCase()));
  assert.ok(Object.values(BEACON_COLOURS).every((c) => crew.has(c)));
  const allowed = new Set([...STARS, ...TEAL, ...Object.values(BEACON_COLOURS)]);
  assert.ok(COLOURS.slice(1).every((c) => allowed.has(c)));
});

test('the flag is a whole shape with strokes at least 2 px (the beacon is the product\'s stub, copied as is)', () => {
  assert.equal(BEACON_SHAPE.length, 8);
  for (const rows of [FLAG_SHAPE]) {
    assert.ok(rows.every((r) => r.length === rows[0].length));
    const on = (x, y) => rows[y]?.[x] !== undefined && rows[y][x] !== '.';
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[0].length; x++) {
      if (!on(x, y)) continue;
      const inBlock = [[0, 0], [-1, 0], [0, -1], [-1, -1]].some(([dx, dy]) => on(x + dx, y + dy) && on(x + dx + 1, y + dy) && on(x + dx, y + dy + 1) && on(x + dx + 1, y + dy + 1));
      assert.ok(inBlock, `flag (${x}, ${y})`);
    }
  }
  assert.ok(FLAG_SHAPE.join('').includes('R') && FLAG_SHAPE.join('').includes('#'), 'a dot and a ring, in two teals');
});

test('the GIF: at most 6 s, nothing focused first, then a planet, then one of its files', () => {
  assert.ok(GIF.seconds <= 6);
  assert.equal(focusAt(0).focus, null);
  assert.deepEqual(focusAt(1).focus, { planet: 'src' });
  assert.equal(focusAt(5).focus.file, 'src/core/fog.ts');
  assert.ok(TIMELINE.every((k, i) => i === 0 || k.at > TIMELINE[i - 1].at));
});

test('checkFrame fails on empty output, on a sliver and on a line over a body', () => {
  const w = 60, h = 40, n = w * h;
  const blank = () => ({ w, h, data: new Uint8Array(n * 4) });
  const space = blank();
  for (let i = 0; i < n; i++) space.data.set([13, 11, 22, 255], 4 * i);
  const r = { final: space, scene: space, ov: blank(), blocked: blank() };
  assert.ok(checkFrame(r, { focus: { planet: 'src' } }).some((p) => p.startsWith('empty scene')));
  assert.ok(checkFrame(r, { focus: { planet: 'src' } }).some((p) => p.includes('no line drawn')));
  const ov = blank();
  ov.data[4 * 50] = 1;
  const fin = { w, h, data: Uint8Array.from(space.data) };
  fin.data.set([0x3b, 0x38, 0x66, 255], 4 * 50);
  const blocked = blank();
  blocked.data[4 * 50] = 255;
  const p = checkFrame({ final: fin, scene: space, ov, blocked }, { focus: null });
  assert.ok(p.some((x) => x.includes('nothing focused')));
  assert.ok(p.some((x) => x.includes('thinner than 2 px')));
  assert.ok(p.some((x) => x.includes('on blocked')));
});

test('routes: the lab, three and the read-only modules it imports; nothing else', () => {
  for (const ok of ['/cochange-lab/', '/cochange-lab/lab.js', '/asset-viewer/viewer.js', '/day1-hype/font.js', '/cochange-lab/node_modules/three/build/three.module.js']) assert.ok(resolveFile(ok), ok);
  for (const no of ['/cochange-lab/lab.mjs', '/cochange-lab/out/option-A.png', '/cochange-lab/test/pure.test.mjs', '/cochange-lab/../fog-lab/lab.js', '/day1-hype/render.mjs', '/%2e%2e/secret']) assert.equal(resolveFile(no), null, no);
});
