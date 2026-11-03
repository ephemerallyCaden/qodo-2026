// Planet artefacts (artefacts.js) invariants:
//  1. off is pixel-identical to the surface shader without the artefact pass, for every
//     biome (control: viewer.js served in memory with the artefacts() call removed)
//  2. on changes the planet, and the same time renders byte-identical frames (deterministic)
//  3. loop-locked: t = 0 and t = one period (24 s, with drifting clouds) render the same frame
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openViewer } from '../debug/repro-hollow-clouds.mjs';

const CALL = 'gl_FragColor = vec4(artefacts(p, b, surface(p, b)), 1.0);';
const NO_ART = (src) => {
  assert.ok(src.includes(CALL), 'PLANET_FRAG main() changed; update the control patch');
  return src.replace(CALL, 'gl_FragColor = vec4(surface(p, b), 1.0);');
};
const BIOMES = { lush: 7, ocean: 5, ice: 19, desert: 3, lava: 11, gas: 5, moon: 2, toxic: 13 };
const BASE = { view: 'planet', size: 1, ringMode: 'thin', moons: true, depth: true, pixelH: 180, palette: 'final', spin: true, ui: false, period: 24, surfaceTurns: 2, cloudTurns: 3, halo: false, artCount: 5, artTeal: true };
const grab = (page, o) => page.evaluate((o) => { window.viewer.set(o); return document.getElementById('view').toDataURL('image/png'); }, o);
const FRAMES = [...Object.entries(BIOMES).map(([biome, seed]) => ({ ...BASE, biome, seed, time: 3 })), { ...BASE, view: 'system', time: 2 }];

test('artefacts off = pixel-identical to the shader without artefacts (8 biomes + system)', async () => {
  const runs = [];
  for (const patch of [undefined, NO_ART]) {
    const { browser, page } = await openViewer(patch ? { patch } : {});
    try {
      const out = [];
      for (const f of FRAMES) out.push(await grab(page, { ...f, artefacts: false }));
      runs.push(out);
    } finally {
      await browser.close();
    }
  }
  const diff = FRAMES.filter((_, i) => runs[0][i] !== runs[1][i]).map((f) => `${f.view}/${f.biome ?? ''}@${f.time}`);
  assert.deepEqual(diff, []);
});

test('artefacts on: visible, deterministic and loop-locked', async () => {
  const { browser, page } = await openViewer();
  try {
    const rows = [];
    for (const [biome, seed] of Object.entries(BIOMES)) {
      const f = { ...BASE, biome, seed, ringMode: 'off', artefacts: true }; // ring off: its 1/5-turn flow is checked by npm run planets
      let changed = 0;
      for (const time of [1, 5, 9]) { // sectors are a golden angle apart, so one of these faces the camera
        const n = await page.evaluate(async ([a, b]) => {
          const px = async (u) => { const img = new Image(); img.src = u; await img.decode(); const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height }); const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
          const [da, db] = [await px(a), await px(b)];
          let n = 0;
          for (let i = 0; i < da.length; i += 4) if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) n++;
          return n;
        }, [await grab(page, { ...f, time, artefacts: false }), await grab(page, { ...f, time })]);
        changed = Math.max(changed, n);
      }
      // the glitch tick is biome-independent, so determinism and the loop lock are checked on lush only
      const row = { biome, changed };
      if (biome === 'lush') {
        row.deterministic = (await grab(page, { ...f, time: 4.25 })) === (await grab(page, { ...f, time: 4.25 }));
        row.loopLocked = (await grab(page, { ...f, time: 0 })) === (await grab(page, { ...f, time: 24 }));
      }
      rows.push(row);
    }
    console.table(rows);
    assert.deepEqual(rows.filter((r) => r.changed < 40 || r.deterministic === false || r.loopLocked === false), []);
  } finally {
    await browser.close();
  }
});
