// Pure-JS checks: palette, kits (legibility, size, class shapes), layout (determinism, stability,
// cap, loop lock, clearance), the sweep's timeline and the server allowlist. No browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapPalette } from '../../asset-viewer/palette-map.js';
import { LOSPEC } from '../../asset-viewer/palettes.js';
import { V2_PLANET_RAMPS } from '../../asset-viewer/planet-ramps.js';
import { HULLS, RUST, TAGS, DRONE_TELLS, restColours } from '../palette.js';
import { KITS, CLASSES, HERO_PX, MIN_FEATURE_PX, extent, thinnest, sizeNorm, blockCount } from '../kits.js';
import { plan, fragPoses, centreAt, sweepAt, ageStep, AGE_STEPS, SWEEP, ranked, repacks } from '../layout.js';
import { VARIANTS, sampleItems, variant } from '../variants.js';
import { resolveFile } from '../routes.mjs';
import { oklab, okDist } from '../colour.js';

const BLK = new Set(LOSPEC['blk-36'].colors.map((c) => `#${c}`));
const blk = mapPalette('blk-36');

test('every debris colour is BLK 36 (D8)', () => {
  for (const hex of [...Object.values(HULLS).flat(), ...RUST, ...Object.values(TAGS)]) assert.ok(BLK.has(hex), `${hex} is not in BLK 36`);
  // gear is the crew's gear ramp one step darker, starting from the visor's near-black
  assert.deepEqual(HULLS.gear, [blk.visor[0], ...blk.gear.slice(0, 3)]);
  assert.deepEqual(RUST, ['#66334b', '#872a38', '#8c4b63', '#cc5250']); // D8's warm reds and mauves
});

test('debris at rest shows no drone tell and no teal', () => {
  for (const hull of Object.keys(HULLS)) for (const tags of [false, true]) {
    const rest = restColours(hull, tags);
    for (const t of DRONE_TELLS) assert.ok(!rest.includes(t), `${hull}: ${t} is a drone colour`);
  }
});

test('rust sits at least 0.06 (OKLab) from every product-planet colour', () => {
  const planet = Object.entries(V2_PLANET_RAMPS).filter(([k]) => !['gasA', 'gasB', 'moon'].includes(k))
    .flatMap(([, v]) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v : Object.values(v)));
  for (const r of RUST) assert.ok(Math.min(...planet.map((p) => okDist(oklab(r), oklab(p)))) >= 0.06, r);
});

const DIFFS = [1, 10, 300, 10000];
test('every kept part is at least 2 px across at hero range (D7); details drop rather than thin out', () => {
  for (const [name, kit] of Object.entries(KITS)) for (const cls of CLASSES) for (const diff of DIFFS) {
    const { parts, scale } = kit.build(cls, diff);
    assert.ok(parts.length > 0);
    for (const p of parts) {
      const dims = p.shape === 'box' ? [...p.size] : [p.len, 2 * Math.max(p.r, p.r2 ?? p.r), 2 * Math.max(p.r, p.r2 ?? p.r)];
      dims.sort((a, b) => a - b);
      assert.ok((dims[1] * scale) / HERO_PX >= MIN_FEATURE_PX, `${name} ${cls} ${diff}: a part is ${((dims[1] * scale) / HERO_PX).toFixed(2)} px across`);
      if (p.detail) assert.ok((thinnest([p]) * scale) / HERO_PX >= MIN_FEATURE_PX, `${name} ${cls} ${diff}: a detail under 2 px`);
    }
  }
});

test('size follows diff size (D2): monotonic, and the range is real', () => {
  assert.equal(sizeNorm(1), 0);
  assert.equal(sizeNorm(10000), 1);
  for (const [name, kit] of Object.entries(KITS)) for (const cls of CLASSES) {
    const sizes = DIFFS.map((d) => { const b = kit.build(cls, d); return Math.max(...extent(b.parts).size) * b.scale; });
    for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i] >= sizes[i - 1], `${name} ${cls}: size drops with a bigger diff`);
    assert.ok(sizes.at(-1) / sizes[0] >= 1.5, `${name} ${cls}: the biggest diff is only ${(sizes.at(-1) / sizes[0]).toFixed(2)}x the smallest`);
  }
  assert.deepEqual([1, 10, 100, 1000, 10000].map(blockCount), [2, 4, 6, 8, 10]);
});

test('the four classes are four different shapes in the silhouette kits (D1)', () => {
  for (const name of ['hardware', 'blocks']) {
    const sig = CLASSES.map((cls) => JSON.stringify(KITS[name].build(cls, 2000).parts.map((p) => [p.shape, p.size, p.r, p.r2, p.len, p.pos])));
    assert.equal(new Set(sig).size, 4, name);
  }
  // canisters share one silhouette; the class is the band colour
  assert.equal(new Set(Object.values(TAGS)).size, 4);
  assert.ok(CLASSES.every((cls) => KITS.canister.build(cls, 2000).parts.some((p) => p.tag)));
  assert.ok(CLASSES.every((cls) => !KITS.hardware.build(cls, 2000).parts.some((p) => p.tag)));
});

test('age steps (D2): intact < 60 days <= rusted < 180 <= broken', () => {
  assert.deepEqual(AGE_STEPS, [60, 180]);
  assert.deepEqual([0, 59, 60, 179, 180, 900].map(ageStep), [0, 0, 1, 1, 2, 2]);
  const [intact, rusted, broken] = [10, 100, 400].map((age) => plan([{ id: 'x', cls: 'agent', diff: 500, age }], variant('A')).pieces[0]);
  assert.equal(intact.rust, 0);
  assert.ok(rusted.rust > 0.5 && broken.rust > rusted.rust);
  assert.ok(intact.frags.every((f) => f.spread === 0) && rusted.frags.every((f) => f.spread === 0));
  assert.ok(broken.frags.length >= 2 && broken.frags.every((f) => f.spread > 0));
});

test('plans are deterministic, capped and ranked biggest first (D5)', () => {
  for (const v of VARIANTS) {
    const items = sampleItems(30);
    assert.deepEqual(plan(items, v, { seed: 5 }), plan(items, v, { seed: 5 }));
    const p = plan(items, v, { seed: 5 });
    assert.equal(p.pieces.length, v.cap);
    assert.equal(p.overflow, 30 - v.cap);
    assert.equal(p.mass, items.reduce((s, it) => s + it.diff, 0));
    assert.equal(repacks(v.arrangement), ['heaps', 'wake'].includes(v.arrangement)); // the two that pack
    assert.deepEqual(p.pieces.map((x) => x.id), ranked(items).slice(0, v.cap).map((x) => x.id));
    assert.equal(plan([], v).pieces.length, 0);
  }
});

test('in the orbit arrangements, removing an item never moves the others', () => {
  for (const v of VARIANTS.filter((x) => !repacks(x.arrangement))) {
    const items = sampleItems(8);
    const all = plan(items, v, { seed: 3 });
    const fewer = plan(items.filter((it) => it.id !== 'item-2'), v, { seed: 3 });
    for (const p of fewer.pieces) assert.deepEqual(p.motion, all.pieces.find((q) => q.id === p.id).motion, `${v.id} ${p.id}`);
  }
});

test('motion is loop-locked: whole turns, and phase 1 is phase 0 (D7)', () => {
  for (const v of VARIANTS) for (const radius of [1, 0.55]) {
    const { pieces } = plan(sampleItems(12), v, { seed: 9, radius });
    for (const p of pieces) {
      assert.ok(Number.isInteger(p.tumble.turns) && p.tumble.turns !== 0);
      if (p.motion.turns !== undefined) assert.ok(Number.isInteger(p.motion.turns));
      for (const f of p.frags) assert.ok(Number.isInteger(f.spin.turns));
      const a = fragPoses(p, 0), b = fragPoses(p, 1);
      a.forEach((x, i) => {
        for (const k of ['centre', 'local', 'axis']) x[k].forEach((n, j) => assert.ok(Math.abs(n - b[i][k][j]) < 1e-9, `${v.id} ${p.id} ${k}`));
        const da = Math.abs(((x.angle - b[i].angle) / (2 * Math.PI)) % 1), de = Math.abs(((x.extra[1] - b[i].extra[1]) / (2 * Math.PI)) % 1);
        assert.ok(Math.min(da, 1 - da) < 1e-9 && Math.min(de, 1 - de) < 1e-9, `${v.id} ${p.id} angle`);
      });
    }
  }
});

test('orbiting pieces stay clear of the planet and its clouds', () => {
  for (const v of VARIANTS.filter((x) => !repacks(x.arrangement))) for (const radius of [1, 0.55, 2]) {
    for (const p of plan(sampleItems(12), v, { seed: 11, radius }).pieces) {
      for (let k = 0; k < 64; k++) assert.ok(Math.hypot(...centreAt(p, k / 64)) >= radius * 1.25 + p.size * 0.5 - 1e-9, `${v.id} ${p.id} dips into the clouds`);
    }
  }
  // heaps and the wake sit off the planet too
  for (const v of VARIANTS.filter((x) => repacks(x.arrangement))) {
    for (const p of plan(sampleItems(20), v, { seed: 11, radius: 1 }).pieces) for (let k = 0; k < 16; k++) assert.ok(Math.hypot(...centreAt(p, k / 16)) > 1.25, `${v.id} ${p.id}`);
  }
});

test('the sweep (D6): teal flash, burst, shrink, then gone; its own clock', () => {
  assert.equal(sweepAt(null), null);
  assert.equal(sweepAt(-0.1), null);
  assert.equal(sweepAt(0).flash, 1);
  assert.equal(sweepAt(SWEEP.fade).flash, 0);
  assert.deepEqual(sweepAt(SWEEP.end), { gone: true });
  let last = 1;
  for (let s = 0; s < SWEEP.end; s += 0.05) { const x = sweepAt(s); assert.ok(x.scale <= last + 1e-12); last = x.scale; }
  assert.ok(sweepAt(SWEEP.end - 0.01).scale < 0.05);
});

test('the dev server and harness serve only the allowlist', () => {
  for (const ok of ['/debris-lab/', '/debris-lab/index.html', '/debris-lab/lab.js', '/asset-viewer/viewer.js', '/debris-lab/node_modules/three/build/three.module.js', '/debris-lab/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js']) assert.ok(resolveFile(ok), ok);
  for (const no of ['/debris-lab/../asset-library/library.js', '/asset-viewer/test/rings.test.mjs', '/asset-viewer/serve.mjs', '/asset-library/engine.js', '/debris-lab/out/lineup-A.png', '/debris-lab/node_modules/playwright/index.js', '/debris-lab/lab.mjs', '/debris-lab/%2e%2e/x.js', '/etc/passwd']) assert.equal(resolveFile(no), null, no);
});
