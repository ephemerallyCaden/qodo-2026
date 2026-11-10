// The H1, H2 and H5 checks on synthetic records (Node, no browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkH1, checkH2, checkH5, GLANCE } from '../analyse.mjs';
import { BANDS, LOOK_NAMES, bandOf } from '../lab.mjs';

// 5 seeds per look, jittered by +-j around a base vector; exact: fields set without jitter
const rec = (look, base, exact = {}, j = 0.005) => [0, 1, 2, 3, 4].map((s) => ({ look, band: bandOf(look), seed: s + 1, ...Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v + (s - 2) * j])), ...exact }));
const zero = { a: 0, b: 0, C: 0, Lsd: 0.1, edge: 0.05 };
const ordered = () => [
  ...rec('lava', { ...zero, L: 0.2, warm: 0.15, glow: 0.3 }),
  ...rec('toxic', { ...zero, L: 0.35, warm: 0.1, glow: 0.05, a: 0.05 }),
  ...rec('desert', { ...zero, L: 0.55, warm: 0.05, b: 0.08 }, { glow: 0 }),
  ...rec('lush', { ...zero, L: 0.7, warm: -0.05, b: -0.05 }, { glow: 0 }),
  ...rec('ocean', { ...zero, L: 0.68, warm: -0.06, b: -0.07 }, { glow: 0 }),
  ...rec('ice', { ...zero, L: 0.75, warm: -0.06, b: -0.06 }, { glow: 0 }),
];

test('H1: an ordered scale passes both readings except where neither band glows', () => {
  const h = checkH1(ordered(), BANDS);
  assert.equal(h.pass, true);
  assert.equal(h.ordered, true);
  assert.equal(h.strict, false, 'ash and healthy have no glow, so glow cannot separate them');
  const ashHealthy = h.pairs[2].per.find((p) => p.key === 'glow');
  assert.equal(ashHealthy.none, true);
  assert.equal(ashHealthy.reversed, false);
});

test('H1: a reversed statistic fails, naming the pair', () => {
  const rs = ordered().map((r) => (r.look === 'desert' ? { ...r, warm: 0.2 } : r)); // ash warmer than toxic and lava
  const h = checkH1(rs, BANDS);
  assert.equal(h.pass, false);
  assert.deepEqual(h.pairs[1].reversed, ['warm']);
  assert.ok(h.pairs[1].per.find((p) => p.key === 'warm').step < 0);
});

test('H1: overlapping or sub-glance steps do not separate a pair', () => {
  // toxic's lightness and warmth match lava's, and its glow is almost lava's: nothing separates the step
  const rs = ordered().map((r) => (r.look === 'toxic' ? { ...r, L: 0.2 + (r.seed - 3) * 0.005, warm: 0.15, glow: 0.28 } : r));
  const h = checkH1(rs, BANDS);
  assert.equal(h.pairs[0].separated, false);
  assert.equal(h.pass, false);
  const glow = h.pairs[0].per.find((p) => p.key === 'glow');
  assert.ok(glow.gap > 0 && glow.step < GLANCE && !glow.separates, 'a non-overlapping step under the glance floor');
});

test('H2: healthy looks group; a stray sibling is flagged nearer ash', () => {
  const ok = checkH2(ordered(), { healthy: ['lush', 'ocean', 'ice'], ash: 'desert' });
  assert.equal(ok.pass, true);
  assert.ok(ok.margin > 0);
  assert.equal(ok.looks.some((l) => l.nearerAsh), false);
  // move ice onto the desert's colour: it sits nearer ash than any sibling
  const rs = ordered().map((r) => (r.look === 'ice' ? { ...r, L: 0.56, b: 0.07 } : r));
  const bad = checkH2(rs, { healthy: ['lush', 'ocean', 'ice'], ash: 'desert' });
  assert.equal(bad.pass, false);
  assert.equal(bad.looks.find((l) => l.look === 'ice').nearerAsh, true);
});

test('H2: a grouping below the glance floor fails', () => {
  // everything within 0.02 of everything else: grouped, but invisible
  const tiny = ordered().map((r) => ({ ...r, L: 0.3 + (r.L - 0.3) * 0.05, b: r.b * 0.05, a: r.a * 0.05 }));
  const h = checkH2(tiny, { healthy: ['lush', 'ocean', 'ice'], ash: 'desert' });
  assert.ok(h.minAsh < GLANCE);
  assert.equal(h.pass, false);
});

test('H5: leave-one-out nearest look; misreads and near misses are reported', () => {
  const good = checkH5(ordered(), LOOK_NAMES, bandOf);
  assert.equal(good.pass, true);
  assert.equal(good.seeds.length, 30);
  // one desert seed measured on lush's colours reads as healthy
  const rs = ordered().map((r) => (r.look === 'desert' && r.seed === 4 ? { ...r, L: 0.7, b: -0.05, warm: -0.05 } : r));
  const bad = checkH5(rs, LOOK_NAMES, bandOf);
  assert.equal(bad.pass, false);
  assert.deepEqual(bad.misread.map((m) => [m.look, m.seed, m.read]), [['desert', 4, 'healthy']]);
  // two looks a hair apart (under the glance floor) are confusable even when read right
  const close = ordered().map((r) => (r.look === 'toxic' ? { ...r, L: r.L - 0.15 + 0.03, warm: 0.15, glow: 0.3, a: 0 } : r));
  const c = checkH5(close, LOOK_NAMES, bandOf);
  assert.ok(c.confusable.length + c.misread.length > 0);
  assert.equal(c.pass, false);
});
