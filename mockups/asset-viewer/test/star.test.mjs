// The star (star.js; docs/features/star-art.md S1-S7), the Day 1 GIF's sun:
//  S1 the banded disc: only its ramp's colours, the core at the centre and each band further out,
//     in the GIF sun's proportions at the GIF's scale
//  S2 the corona: flat bands that reach past the disc with a lumpy edge, no dithering; off, nothing past the disc
//  S3 colours from the v2 world family only, never teal; measurably not a lava planet at the same size and distance
//  S4 loop-locked: a loop later is the same frame, the seam is no bigger than a frame step, it churns with spin off
//  S5 emissive (the same from the far side), deterministic, and faded at STAR_FADE strength
//  S6 moonlets in the moon look, at one size whatever the star's size
//  and the star off leaves no trace in the system view. Every render check fails on empty output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openViewer } from '../debug/repro-hollow-clouds.mjs';
import { STAR_RAMPS, STAR_FADE, MOONLET } from '../star.js';
import { V2_PLANET_RAMPS, ACCENTS } from '../planet-ramps.js';

const BASE = { view: 'star', time: 3, depth: false, depthMode: 'pixel-smooth', depthBands: '3-band', pixelH: 180, palette: 'final', spin: true, ui: false, period: 24, surfaceTurns: 2, cloudTurns: 3,
  star: false, starSize: 1.6, starSpin: 1, starGranulation: 1, starCorona: true, starMoonlets: 0, camera: null };
const SPACE = '0d0b16';
const STARFIELD = ['3b3866', '9a90e0', 'fff8ff'];
const strip = (h) => h.slice(1);
const DISC = STAR_RAMPS.star.map(strip); // limb -> core
const CORONA = STAR_RAMPS.corona.map(strip); // crown, halo
// The camera on the star view's line at distance d (the star is at the origin).
const at = (d) => ({ pos: [3.29, 1.92, 11.47].map((x) => (x * d) / 12), target: [0, 0, 0] });
// The Day 1 GIF's sun (.archive/docs/hackathon/day1-images/art-1-system-loop.gif, frame 0, at its
// 320x180 internal resolution): pixels per band, white core -> dark-red halo (1782 in all). The
// GIF's scale is a 1.6 star at about 23 units (a disc ~40 px across).
const GIF = { counts: [283, 350, 371, 246, 204, 328], camera: at(22.8) };

/** Renders `o` (over BASE) and returns { w, h, px: hex per pixel }. */
const frame = (page, o) => page.evaluate((opts) => {
  window.viewer.set(opts);
  const { W, H, d } = window.__dbg.readView();
  const px = [];
  for (let i = 0; i < d.length; i += 4) px.push(((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]).toString(16).padStart(6, '0'));
  return { w: W, h: H, px };
}, { ...BASE, ...o });
const count = (f, set) => f.px.filter((h) => set.includes(h)).length;
const drawn = (f) => f.px.filter((h) => h !== SPACE && !STARFIELD.includes(h)).length;
const differ = (a, b) => a.px.filter((h, i) => h !== b.px[i]).length;
/** Mean distance from the frame centre (the star's) of each colour's pixels. */
function meanRadius(f, hex) {
  let s = 0, n = 0;
  f.px.forEach((h, i) => { if (h === hex) { s += Math.hypot((i % f.w) + 0.5 - f.w / 2, Math.floor(i / f.w) + 0.5 - f.h / 2); n++; } });
  return n ? s / n : NaN;
}
const toLin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** OKLab lightness of a hex. */
function okL(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => toLin(parseInt(hex.slice(i, i + 2), 16)));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}
const mix = (a, b, t) => [0, 2, 4].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t));
const near = (hex, rgb, tol = 2) => [0, 2, 4].every((i, k) => Math.abs(parseInt(hex.slice(i, i + 2), 16) - rgb[k]) <= tol);

test('star: colours from the v2 world family only, never teal', () => {
  const world = new Set(Object.values(V2_PLANET_RAMPS).flatMap((v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v : Object.values(v))));
  for (const hex of [...STAR_RAMPS.star, ...STAR_RAMPS.corona]) assert.ok(world.has(hex), `${hex} is not a v2 world colour`);
  for (const hex of ACCENTS.reveal) assert.ok(![...STAR_RAMPS.star, ...STAR_RAMPS.corona].includes(hex), `teal ${hex} on the star`);
  assert.deepEqual(STAR_RAMPS.star, [...V2_PLANET_RAMPS.glow, V2_PLANET_RAMPS.sand.at(-1), V2_PLANET_RAMPS.cloud.at(-1)], 'the disc is the lava glow, then the sand and cloud tops');
  assert.deepEqual(STAR_RAMPS.corona, [V2_PLANET_RAMPS.glow[0], V2_PLANET_RAMPS.gasB[0]], 'the corona is the glow rim and gas giant B\'s darkest');
});

test('star: the Day 1 disc and corona (S1, S2, S3), loop-locked (S4), emissive and faded at STAR_FADE (S5), moonlets (S6), off leaves no trace', { timeout: 900000 }, async () => {
  const { browser, page } = await openViewer();
  try {
    // off is off: the system view with the star turned on and off again is the never-on frame
    const never = await frame(page, { view: 'system', time: 2, depth: true });
    const withStar = await frame(page, { view: 'system', time: 2, depth: true, star: true });
    const again = await frame(page, { view: 'system', time: 2, depth: true });
    assert.equal(differ(again, never), 0, 'the star left a trace after it was turned off');
    assert.ok(differ(withStar, never) > 300, `the star drew only ${differ(withStar, never)} px in the system view`);

    // S1: the disc's bands, core at the centre, each band further out (depth off: exact ramp colours)
    const on = await frame(page, {});
    assert.ok(drawn(on) > 3000, `empty render (${drawn(on)} px)`);
    const stray = [...new Set(on.px.filter((h) => h !== SPACE && !STARFIELD.includes(h) && !DISC.includes(h) && !CORONA.includes(h)))];
    assert.deepEqual(stray, [], 'colours outside the star\'s ramps');
    assert.equal(on.px[(on.h / 2) * on.w + on.w / 2], DISC[4], 'the centre is not the cream-white core');
    const order = [...DISC].reverse().concat(CORONA[1]).map((h) => meanRadius(on, h)); // core, cream, yellow, orange, red-orange (limb + crown), dark red
    console.log(`band radii (px, core -> halo): ${order.map((r) => r.toFixed(1)).join(' ')}`);
    order.slice(1).forEach((r, i) => assert.ok(r > order[i], `band ${i + 1} (${r.toFixed(1)} px) is not outside band ${i} (${order[i].toFixed(1)} px)`));
    // ... in the GIF sun's proportions at the GIF's scale
    const gifScale = await frame(page, { camera: GIF.camera });
    const ours = [...DISC].reverse().concat(CORONA[1]).map((h) => count(gifScale, [h]));
    const sum = (a) => a.reduce((s, x) => s + x, 0);
    console.log(`at the GIF's scale: ${sum(ours)} px vs the GIF's ${sum(GIF.counts)}; shares (%) ours ${ours.map((n) => ((100 * n) / sum(ours)).toFixed(1)).join(' ')} | GIF ${GIF.counts.map((n) => ((100 * n) / sum(GIF.counts)).toFixed(1)).join(' ')}`);
    assert.ok(Math.abs(sum(ours) / sum(GIF.counts) - 1) < 0.1, `size: ${sum(ours)} px vs the GIF's ${sum(GIF.counts)}`);
    ours.forEach((n, i) => assert.ok(Math.abs((100 * n) / sum(ours) - (100 * GIF.counts[i]) / sum(GIF.counts)) < 6, `band ${i}: ${((100 * n) / sum(ours)).toFixed(1)}% vs the GIF's ${((100 * GIF.counts[i]) / sum(GIF.counts)).toFixed(1)}%`));

    // S2: the corona reaches past the disc with a lumpy edge, in flat bands; off, nothing past the disc
    const off = await frame(page, { starCorona: false });
    assert.ok(drawn(off) > 3000, 'empty render (corona off)');
    assert.equal(count(off, [CORONA[1]]), 0, 'dark red with the corona off');
    const edge = (f) => Array.from({ length: 72 }, (_, k) => { // outermost star pixel along each ray from the centre
      const a = (k / 72) * Math.PI * 2;
      let last = 0;
      for (let r = 0; r < 80; r += 0.5) {
        const x = Math.floor(f.w / 2 + Math.cos(a) * r), y = Math.floor(f.h / 2 + Math.sin(a) * r);
        if (DISC.includes(f.px[y * f.w + x]) || CORONA.includes(f.px[y * f.w + x])) last = r;
      }
      return last;
    });
    const eOn = edge(on), eOff = edge(off);
    const spread = (e) => Math.max(...e) - Math.min(...e);
    const reach = eOn.map((r, i) => r - eOff[i]);
    console.log(`corona reach past the disc: ${Math.min(...reach).toFixed(1)}-${Math.max(...reach).toFixed(1)} px (the disc's own edge spread: ${spread(eOff).toFixed(1)} px)`);
    assert.ok(Math.min(...reach) >= 2, 'the corona does not reach past the disc all round');
    assert.ok(spread(reach) >= 2.5, `the corona edge is not lumpy (its reach varies by ${spread(reach).toFixed(1)} px)`);
    const lone = on.px.filter((h, i) => CORONA.includes(h) && [-1, 1, -on.w, on.w].every((o) => on.px[i + o] !== h)).length; // dithering leaves lone pixels
    assert.ok(lone / count(on, CORONA) < 0.02, `${lone} lone corona pixels (dithering?)`);

    // S3: not a lava planet: the same size and distance, depth on (as on screen), hero and mid. The
    // star is lighter overall, much of it is lighter than lava's hottest pixel (its cream and white),
    // and its only dark is the corona's thin halo, where lava is mostly near-black crust.
    const rows = [];
    for (const [label, d] of [['hero', 12], ['mid', 26]]) {
      const star = await frame(page, { depth: true, camera: at(d) });
      const lava = await frame(page, { depth: true, camera: at(d), view: 'studio', biome: 'lava', seed: 11, size: 1.6, ringMode: 'off', moons: false });
      const lightness = (f) => f.px.filter((h) => h !== SPACE && !STARFIELD.includes(h)).map(okL);
      const sL = lightness(star), lL = lightness(lava);
      assert.ok(sL.length > 300 && lL.length > 300, `${label}: empty render`);
      const hottest = Math.max(...lL);
      const stats = (L) => ({ mean: L.reduce((s, x) => s + x, 0) / L.length, dark: L.filter((x) => x < 0.3).length / L.length, lighter: L.filter((x) => x > hottest + 0.02).length / L.length });
      const s = stats(sL), l = stats(lL);
      rows.push(`${label} (${d} units): mean L star ${s.mean.toFixed(2)} vs lava ${l.mean.toFixed(2)}; dark (L < 0.3) star ${(100 * s.dark).toFixed(0)}% vs lava ${(100 * l.dark).toFixed(0)}%; lighter than lava's hottest (L ${hottest.toFixed(2)}): star ${(100 * s.lighter).toFixed(0)}%`);
      assert.ok(s.mean > l.mean + 0.1, `${label}: the star (L ${s.mean.toFixed(2)}) is not clearly lighter than lava (${l.mean.toFixed(2)})`);
      assert.ok(l.dark > 0.3 && s.dark < l.dark * 0.6, `${label}: dark share star ${s.dark.toFixed(2)} vs lava ${l.dark.toFixed(2)}`);
      assert.ok(s.lighter > 0.2, `${label}: only ${(100 * s.lighter).toFixed(0)}% of the star is lighter than lava's hottest pixel`);
    }
    console.log(`star vs lava (seed 11), both size 1.6, OKLab lightness:\n  ${rows.join('\n  ')}`);

    // S4: loop-locked turn and churn
    const a = await frame(page, { time: 5.5 });
    assert.equal(differ(await frame(page, { time: 5.5 }), a), 0, 'the same state rendered different pixels'); // S5: deterministic
    assert.equal(differ(await frame(page, { time: 5.5 + 24 }), a), 0, 'a loop later is a different frame');
    const still = [await frame(page, { time: 0, starSpin: 0 }), await frame(page, { time: 6, starSpin: 0 })];
    assert.ok(differ(still[0], still[1]) > 100, 'the granulation does not churn with spin off');
    const steps = [];
    let prev = await frame(page, { time: 0 });
    const first = prev;
    for (let i = 1; i < 48; i++) {
      const f = await frame(page, { time: i * 0.5 });
      steps.push(differ(f, prev));
      prev = f;
    }
    const seam = differ(first, prev);
    const median = [...steps].sort((x, y) => x - y)[steps.length >> 1];
    console.log(`loop: last -> first ${seam} px vs median step ${median} px`);
    assert.ok(median > 0, 'nothing moves over the loop');
    assert.ok(seam <= median * 1.5, `seam ${seam} px vs median step ${median} px`);

    // S5: emissive: from the far side (the key light behind the camera's back) it looks the same
    const back = await frame(page, { camera: { pos: [-3.29, -1.92, -11.47], target: [0, 0, 0] } });
    for (const h of [...DISC, CORONA[1]]) {
      const [x, y] = [count(on, [h]) / drawn(on), count(back, [h]) / drawn(back)];
      assert.ok(Math.abs(x - y) < 0.05, `${h}: ${x.toFixed(3)} of the star from the front, ${y.toFixed(3)} from behind`);
    }
    // ... and faded per pixel at STAR_FADE strength: past the far threshold every colour is mix(c, #17172f, 0.88 * STAR_FADE)
    const far = await frame(page, { depth: true, camera: at(70) });
    const faded = [...DISC, ...CORONA].map((h) => mix(h, '17172f', 0.88 * STAR_FADE));
    const body = far.px.filter((h) => h !== SPACE && !STARFIELD.includes(h));
    assert.ok(body.length > 30, 'empty render (far)');
    const off3 = body.filter((h) => !faded.some((rgb) => near(h, rgb)));
    assert.deepEqual([...new Set(off3)], [], `colours that are not the ramps at ${0.88 * STAR_FADE} toward #17172f`);
    assert.ok(body.some((h) => near(h, faded[4])), 'the faded core is missing');
    // ... so the cream core stays the system's hottest point at any distance: fully faded, it's still lighter than lava's hottest glow up close
    const coreFar = faded[4].map((c) => c.toString(16).padStart(2, '0')).join('');
    console.log(`fully faded core #${coreFar}: OKLab L ${okL(coreFar).toFixed(2)} vs lava's hottest glow ${V2_PLANET_RAMPS.glow[2]} unfaded, L ${okL(strip(V2_PLANET_RAMPS.glow[2])).toFixed(2)}`);
    assert.ok(okL(coreFar) > okL(strip(V2_PLANET_RAMPS.glow[2])), `the far core #${coreFar} is darker than lava's hottest glow`);

    // S6: moonlets in the moon look, one size at any star size, and loop-locked
    const moon = V2_PLANET_RAMPS.moonBody.map(strip);
    const m = await frame(page, { starMoonlets: 5 });
    assert.ok(count(m, moon) > 20, `only ${count(m, moon)} moonlet px`);
    assert.equal(count(on, moon), 0, 'moon colours without moonlets');
    const scales = await page.evaluate((sizes) => sizes.map((s) => {
      window.viewer.set({ starMoonlets: 3, starSize: s });
      const v = new window.__dbg.THREE.Vector3();
      return window.viewer.internals.star.parts.moonlets.children.map((o) => +v.setFromMatrixScale(o.matrixWorld).x.toFixed(4));
    }), [1, 2.4]);
    assert.deepEqual(scales, [[MOONLET.radius, MOONLET.radius, MOONLET.radius], [MOONLET.radius, MOONLET.radius, MOONLET.radius]], 'moonlets change size with the star');
    const mLoop = await frame(page, { starMoonlets: 5, time: 3 + 24 });
    assert.equal(differ(mLoop, m), 0, 'the moonlets are not loop-locked');
  } finally {
    await browser.close();
  }
});
