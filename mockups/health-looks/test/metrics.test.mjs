// Colour maths and render statistics on synthetic frames (Node, no browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oklab, toLinear, hexToOklab, hexToRgb, CVD, simulate, simulateImage, discGeometry, measure, lookVector, LOOK_KEYS } from '../metrics.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

test('OKLab matches published values (Ottosson 2020)', () => {
  const [L, a, b] = oklab(1, 1, 1);
  near(L, 1, 1e-4, 'white L'); near(a, 0, 1e-4, 'white a'); near(b, 0, 1e-4, 'white b');
  const red = hexToOklab('#ff0000');
  near(red[0], 0.62796, 1e-4, 'red L'); near(red[1], 0.22486, 1e-4, 'red a'); near(red[2], 0.12585, 1e-4, 'red b');
  near(toLinear(255), 1, 0); near(toLinear(0), 0, 0); near(toLinear(128), 0.21586, 1e-4, 'sRGB 128');
});

test('the Machado 2009 matrices keep greys and match the paper', () => {
  for (const [name, M] of Object.entries(CVD)) {
    for (const row of M) near(row.reduce((s, x) => s + x, 0), 1, 2e-6, `${name} row sum`);
    const g = simulate(name, 0.3, 0.3, 0.3);
    g.forEach((x) => near(x, 0.3, 1e-5, `${name} grey`));
  }
  // pure linear red under protanopia: the first column, the negative entry clamped
  assert.deepEqual(simulate('protanopia', 1, 0, 0).map((x) => +x.toFixed(6)), [0.152286, 0.114503, 0]);
  assert.deepEqual(simulate('normal', 0.1, 0.2, 0.3), [0.1, 0.2, 0.3]);
  // protanopia and deuteranopia collapse red-green: lime and orange move closer in hue
  const hue = (vision, hex) => {
    const [, a, b] = oklab(...simulate(vision, ...hexToRgb(hex).map(toLinear)));
    return Math.atan2(b, a);
  };
  assert.ok(Math.abs(hue('deuteranopia', '#7cd65a') - hue('deuteranopia', '#ff761a')) < Math.abs(hue('normal', '#7cd65a') - hue('normal', '#ff761a')));
});

test('simulateImage keeps alpha and greys', () => {
  const img = Uint8ClampedArray.from([128, 128, 128, 255, 255, 0, 0, 7]);
  const out = simulateImage('deuteranopia', img);
  assert.deepEqual([...out.slice(0, 4)], [128, 128, 128, 255]);
  assert.equal(out[7], 7);
  assert.notDeepEqual([...out.slice(4, 7)], [255, 0, 0]);
  assert.deepEqual([...simulateImage('normal', img)], [...img]);
});

test('disc geometry: a size-1 planet at the hero distance is about 82 px across at 180 px', () => {
  const g = discGeometry({ camPos: [1.92, 1.12, 6.69], radius: 1, w: 320, h: 180, fov: 35 });
  assert.deepEqual([g.cx, g.cy], [160, 90]);
  near(g.r, 40.89, 0.02, 'r');
  // 42-50% of frame height (art direction §6)
  assert.ok(2 * g.r / 180 > 0.42 && 2 * g.r / 180 < 0.5);
});

// A synthetic frame: space everywhere, a filled disc of `rgb` (and `emissiveRgb` on its left half).
const W = 64, H = 48, SPACE = [13, 11, 22];
function frame(fill) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set([...(fill(x, y) ?? SPACE), 255], (y * W + x) * 4);
  return { w: W, h: H, data };
}
const geom = { cx: W / 2, cy: H / 2, r: 10 };
const inDisc = (x, y) => (x + 0.5 - W / 2) ** 2 + (y + 0.5 - H / 2) ** 2 <= 100;
const discPx = (() => { let n = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) n += inDisc(x, y); return n; })();

test('measure: an empty frame has no planet; a flat disc measures its colour exactly', () => {
  const empty = frame(() => null);
  assert.deepEqual(measure(empty, empty, geom, { warmHue: 47 }), { n: 0 });
  const disc = frame((x, y) => (inDisc(x, y) ? [216, 148, 74] : null)); // sand #d8944a
  const m = measure(disc, empty, geom, { warmHue: 47 });
  assert.equal(m.n, discPx);
  const [L, a, b] = hexToOklab('#d8944a');
  near(m.L, L, 1e-9); near(m.a, a, 1e-9); near(m.b, b, 1e-9);
  near(m.Lsd, 0, 1e-6); assert.equal(m.edge, 0); assert.equal(m.glow, 0);
  assert.ok(m.warm > 0.1, 'sand is warm');
  assert.equal(lookVector(m).length, LOOK_KEYS.length);
  // stars outside the disc never count; a star inside it is the planet's pixel (it differs from empty)
  const starry = frame((x, y) => (x === 2 && y === 2 ? [255, 248, 255] : null));
  assert.equal(measure(starry, starry, geom, { warmHue: 47 }).n, 0);
});

test('measure: glow is the emissive share clearly lighter than the ground', () => {
  const empty = frame(() => null);
  // the left half emissive: rgb there, the crust #17151d elsewhere; the sentinel repaints the left half
  const halves = (left) => frame((x, y) => (!inDisc(x, y) ? null : x < W / 2 ? left : [23, 21, 29]));
  const lava = halves([255, 118, 26]), sentinel = halves([0, 255, 128]); // glow #ff761a
  const m = measure(lava, empty, geom, { warmHue: 47, emissive: sentinel });
  near(m.glow, m.emissive, 1e-12);
  near(m.glow, 0.5, 0.06, 'half the disc');
  assert.ok(m.edge > 0, 'the boundary is texture');
  // an emissive pixel no lighter than its ground is not glow
  assert.equal(measure(halves([23, 21, 29]), empty, geom, { warmHue: 47, emissive: sentinel }).glow, 0);
  // no emissive render: no glow
  assert.equal(measure(lava, empty, geom, { warmHue: 47 }).glow, 0);
});

test('measure under a deficiency: the same pixels, the simulated colours', () => {
  const empty = frame(() => null);
  const green = frame((x, y) => (inDisc(x, y) ? [56, 168, 90] : null)); // land #38a85a
  const n = measure(green, empty, geom, { warmHue: 47 });
  const d = measure(green, empty, geom, { warmHue: 47, vision: 'deuteranopia' });
  assert.equal(d.n, n.n);
  assert.ok(Math.abs(d.a) < Math.abs(n.a), 'deuteranopia flattens the green-red axis');
});
