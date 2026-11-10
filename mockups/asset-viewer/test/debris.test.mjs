// Space debris on the hero planet (debris.js, A3: grey satellite parts, a red outline, red nav lights):
//  1. off is off: enabling and disabling debris leaves no trace (the frame is the never-enabled frame)
//  2. on any biome it draws (fails on empty output), only in its own colours (depth off), the same
//     pixels twice, and the loop is seamless
//  3. the human's two debris-only exceptions stay debris-only: the outline material exists only under
//     debris groups, outline-red pixels appear only where debris draws, and the off-palette greys sit
//     in no other material
//  4. the sweep flashes teal on its own clock and then shows none
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openViewer } from '../debug/repro-hollow-clouds.mjs';

const BASE = { view: 'planet', biome: 'lush', seed: 7, size: 1, ringMode: 'off', moons: true, cover: null, depth: false, pixelH: 180, palette: 'final', spin: true, ui: false, halo: false, artefacts: false, period: 24, surfaceTurns: 2, cloudTurns: 3, time: 3, debris: false, debrisCount: 8, debrisAge: 'mixed', debrisSwept: [] };
const A3 = ['#3d3d3d', '#616161', '#8e8c8a', '#b4b2b0', '#d83843', '#872a38', '#ff6866']; // grey, outline bright/dim, light
const OUTLINE = ['#d83843', '#872a38'];
const TEAL = ['#004538', '#007c66', '#00bc9c', '#00ffd5'];
const GREY = ['#3d3d3d', '#616161', '#8e8c8a', '#b4b2b0'];

/** Renders `o` and returns the frame as hex-per-pixel (internal resolution). */
const frame = (page, o) => page.evaluate((opts) => {
  window.viewer.set(opts);
  const { d } = window.__dbg.readView();
  const out = [];
  for (let i = 0; i < d.length; i += 4) out.push(((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]).toString(16).padStart(6, '0'));
  return out;
}, o);
const hexes = (list) => new Set(list.map((h) => h.slice(1)));

test('debris: off leaves no trace; on draws A3 only, deterministic and loop-locked, on every biome; the exceptions stay debris-only', async () => {
  const { browser, page } = await openViewer();
  try {
    const never = await frame(page, BASE);
    await frame(page, { ...BASE, debris: true });
    const again = await frame(page, BASE);
    assert.equal(again.filter((h, i) => h !== never[i]).length, 0, 'debris left a trace after it was turned off');
    for (const h of OUTLINE) assert.ok(!never.includes(h.slice(1)), `${h} on screen with no debris`);

    const allowed = hexes(A3);
    for (const biome of ['lush', 'ocean', 'ice', 'desert', 'toxic', 'lava']) {
      for (const debrisCount of [1, 8, 24]) {
        const off = await frame(page, { ...BASE, biome });
        const on = await frame(page, { ...BASE, biome, debris: true, debrisCount });
        const changed = on.map((h, i) => (h !== off[i] ? h : null)).filter(Boolean);
        assert.ok(changed.length > 20, `${biome} ${debrisCount}: only ${changed.length} debris px`);
        const stray = changed.filter((h) => !allowed.has(h));
        assert.equal(stray.length, 0, `${biome} ${debrisCount}: ${stray.length} debris px outside A3's colours, e.g. ${[...new Set(stray)].slice(0, 4)}`);
        // outline red only where debris drew
        assert.ok(on.every((h, i) => !hexes(OUTLINE).has(h) || h !== off[i]), `${biome}: outline red where no debris drew`);
      }
    }
    const a = await frame(page, { ...BASE, debris: true, time: 5.5 });
    const b = await frame(page, { ...BASE, debris: true, time: 5.5 });
    assert.deepEqual(a, b, 'the same state rendered different pixels');
    const loop = await frame(page, { ...BASE, debris: true, time: 5.5 + 24 });
    assert.equal(loop.filter((h, i) => h !== a[i]).length, 0, 'a loop later is a different frame');
    const mid = await frame(page, { ...BASE, debris: true, time: 5.5 + 12 });
    assert.ok(mid.filter((h, i) => h !== a[i]).length > 0, 'nothing moved');

    // structure: the outline material only under debris groups; the greys in no other material
    const s = await page.evaluate((grey) => {
      window.viewer.set({ view: 'system', debris: true, time: 3 });
      const { scene } = window.__dbg;
      let outlines = 0, stray = 0, greyElsewhere = 0;
      const underDebris = (o) => { for (let p = o; p; p = p.parent) if (p.userData.debris) return true; return false; };
      const hex = (c) => `#${c.getHexString()}`;
      scene.traverse((o) => {
        for (const m of [o.material].flat().filter(Boolean)) {
          if (m.vertexShader?.includes('aOutline')) { outlines++; if (!underDebris(o)) stray++; }
          if (underDebris(o)) continue;
          for (const u of Object.values(m.uniforms ?? {})) for (const v of [u.value].flat()) if (v?.isColor && grey.includes(hex(v))) greyElsewhere++;
        }
      });
      return { outlines, stray, greyElsewhere };
    }, GREY);
    assert.ok(s.outlines > 0, 'no outline meshes found (debris drew nothing?)');
    assert.equal(s.stray, 0, `${s.stray} outline meshes outside debris`);
    assert.equal(s.greyElsewhere, 0, `the debris greys appear in ${s.greyElsewhere} non-debris uniforms`);
  } finally {
    await browser.close();
  }
});

test('debris: the sweep flashes teal on its own clock, then shows none', async () => {
  const { browser, page } = await openViewer();
  try {
    const teal = hexes(TEAL);
    const tealPx = (f) => f.filter((h) => teal.has(h)).length;
    // every piece swept at t = 3 (so some flash is in view whatever the orbits do)
    const swept = Array.from({ length: 8 }, (_, i) => ({ id: `item-${i}`, at: 3 }));
    const before = await frame(page, { ...BASE, debris: true, debrisSwept: swept, time: 2.9 });
    const during = await frame(page, { ...BASE, debris: true, debrisSwept: swept, time: 3.1 });
    const after = await frame(page, { ...BASE, debris: true, debrisSwept: swept, time: 4.4 });
    assert.equal(tealPx(before), 0);
    assert.ok(tealPx(during) > 0, 'no teal flash');
    assert.equal(tealPx(after), 0);
    const gone = await frame(page, { ...BASE, debris: false, time: 4.4 });
    assert.equal(after.filter((h, i) => h !== gone[i]).length, 0, 'swept pieces left a trace');
  } finally {
    await browser.close();
  }
});
