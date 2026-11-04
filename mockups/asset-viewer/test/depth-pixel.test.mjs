// Per-pixel depth fade (DEPTH_MODES / DEPTH_GLSL in viewer.js):
//  (a) object mode never enters the per-pixel path: pixel-identical to a control build
//      whose depthFade() is a no-op (depth, system, planet views; lush, lava; a Lospec palette)
//  (b) pixel-stepped: a big planet placed across the 12-unit threshold shows >= 2 depth
//      levels across its disc, and the fade strength recovered per pixel is never larger
//      on the nearer level than on the farther one (the near side is never darker)
// Both fail on empty output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openViewer } from '../debug/repro-hollow-clouds.mjs';

const GUARD = 'if (uDepthMode == 0) return c;';
const NO_FADE = (src) => { assert.ok(src.includes(GUARD), 'DEPTH_GLSL changed; update the control patch'); return src.replace(GUARD, 'return c;'); };
const B = { depthBands: '3-band', size: 1, ringMode: 'thin', moons: true, depth: true, pixelH: 180, palette: 'final', spin: true, ui: false, halo: false, biome: 'lush', seed: 7, time: 2 };
const FRAMES = [{ view: 'depth' }, { view: 'system' }, { view: 'planet', time: 3 }, { view: 'depth', biome: 'lava', seed: 11 }, { view: 'depth', palette: 'lospec:pico-8' }].map((f) => ({ ...B, ...f, depthMode: 'object' }));
const grab = (page, o) => page.evaluate((o) => { window.viewer.set(o); return document.getElementById('view').toDataURL('image/png'); }, o);

test('depth mode "object" is pixel-identical to the per-object fade (per-pixel path off)', async () => {
  const runs = [];
  for (const patch of [undefined, NO_FADE]) {
    const { browser, page } = await openViewer(patch ? { patch } : {});
    try {
      const out = [];
      for (const f of FRAMES) out.push(await grab(page, f));
      runs.push(out);
    } finally {
      await browser.close();
    }
  }
  assert.ok(runs[0].every((u) => u.length > 2000), 'empty render');
  assert.deepEqual(FRAMES.filter((_, i) => runs[0][i] !== runs[1][i]).map((f) => `${f.view}/${f.biome}/${f.palette}`), []);
});

test('pixel-stepped: a planet straddling a threshold shows >= 2 levels, near side never darker', async () => {
  const { browser, page } = await openViewer();
  try {
    const r = await page.evaluate((o) => {
      const { DEPTH_U } = window.__dbg;
      const px = () => {
        const src = document.getElementById('view');
        const c = Object.assign(document.createElement('canvas'), { width: src.width, height: src.height });
        const x = c.getContext('2d');
        x.drawImage(src, 0, 0);
        return x.getImageData(0, 0, c.width, c.height).data;
      };
      // radius 2.2 at distance 13.2: the front of the disc is ~11 away, the limb ~13 (threshold 12)
      const base = { ...o, view: 'studio', biome: 'desert', seed: 3, size: 2.2, ringMode: 'off', moons: false, camera: { pos: [0, 0, 13.2], target: [0, 0, 0] } };
      window.viewer.set({ ...base, depthMode: 'levels' });
      const lv = px();
      window.viewer.set({ ...base, depth: false });
      const off = px();
      window.viewer.set({ ...base, depthMode: 'pixel-stepped' });
      const on = px();
      const tints = DEPTH_U.uDepthTint.value.slice(0, 4).map((v) => [v.x * 255, v.y * 255, v.z * 255]);
      const ID = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]];
      const count = [0, 0, 0, 0], tMin = [9, 9, 9, 9], tMax = [-9, -9, -9, -9];
      for (let i = 0; i < lv.length; i += 4) {
        const l = ID.findIndex(([r, g, b]) => lv[i] === r && lv[i + 1] === g && lv[i + 2] === b);
        if (l < 0) continue;
        count[l]++;
        // fade strength t from on = off + t * (tint - off), projected onto (tint - off)
        const dv = [0, 1, 2].map((k) => tints[l][k] - off[i + k]);
        const len2 = dv.reduce((a, v) => a + v * v, 0);
        if (len2 < 40 * 40) continue; // too close to the tint to measure
        const t = [0, 1, 2].reduce((a, k) => a + (on[i + k] - off[i + k]) * dv[k], 0) / len2;
        tMin[l] = Math.min(tMin[l], t); tMax[l] = Math.max(tMax[l], t);
      }
      return { count, tMin, tMax };
    }, { ...B, time: 3 });
    console.log(JSON.stringify(r));
    const levels = r.count.filter((n) => n >= 50).length;
    assert.ok(r.count.reduce((a, b) => a + b, 0) > 500, `planet disc is empty (${r.count})`);
    assert.ok(levels >= 2, `only ${levels} depth level(s) across a straddling planet: ${r.count}`);
    for (let l = 1; l < 4; l++) if (r.count[l] >= 50 && r.count[l - 1] >= 50) {
      assert.ok(r.tMax[l - 1] <= r.tMin[l] + 0.03, `level ${l - 1} pixels fade up to ${r.tMax[l - 1].toFixed(2)}, more than level ${l} pixels (from ${r.tMin[l].toFixed(2)})`);
    }
  } finally {
    await browser.close();
  }
});
