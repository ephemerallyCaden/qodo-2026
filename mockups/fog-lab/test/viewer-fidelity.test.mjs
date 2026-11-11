// One shader path: the lab's D2d tile and the asset viewer's fogged hero planet are the same pixels
// (the same planet, camera, time, layout, coverage and events), at rest, half charted and mid-clear.
// The lab's shader holds every registered look and the viewer's only D2d; the pixels still match.
// Browsers run one after the other (one per agent); every comparison fails on empty output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openLab, decode } from '../harness.mjs';
import { openViewer } from '../../asset-viewer/debug/repro-hollow-clouds.mjs';
import { demoLayout, stateAt, allFogged } from '../../asset-viewer/fog-layout.js';

const planet = demoLayout('src', 7).planet;
const all = allFogged(planet, stateAt(planet, { coverage: 0 })).map((f, k) => ({ file: f.id, kind: 'clear', at: 3 + k * 0.12 }));
const CASES = [
  { name: 'lush, fully fogged', biome: 'lush', coverage: 0, t: 3 },
  { name: 'desert, half charted', biome: 'desert', coverage: 0.5, t: 5 },
  { name: 'lush, mid "chart all"', biome: 'lush', coverage: 0, t: 3.5, events: all, moonEvents: [{ moon: 0, kind: 'clear', at: 3 }, { moon: 1, kind: 'clear', at: 3 }] },
];

test('the lab\'s D2d is pixel-identical to the viewer\'s fogged hero', { timeout: 900000 }, async () => {
  const lab = [];
  const browser = await launch();
  try {
    const page = await openLab(browser);
    for (const c of CASES) {
      const cell = { dir: 'D2d', biome: c.biome, seed: 7, layoutSeed: 7, coverage: c.coverage, events: c.events ?? [], moonEvents: c.moonEvents ?? [], moons: true };
      const [f] = await page.evaluate(([cl, t]) => window.lab.frames(cl, [t], ['final', 'nofog']), [cell, c.t]);
      lab.push({ final: decode(f.final), nofog: decode(f.nofog) });
    }
  } finally {
    await browser.close();
  }
  const { browser: vb, page: vp } = await openViewer();
  try {
    for (const [k, c] of CASES.entries()) {
      const v = await vp.evaluate((o) => { window.viewer.set(o); return Array.from(window.__dbg.readView().d); }, {
        view: 'planet', biome: c.biome, seed: 7, size: 1, ringMode: 'off', moons: true, cover: null, depth: true, depthMode: 'pixel-smooth', depthBands: '3-band',
        pixelH: 180, palette: 'final', spin: true, ui: false, halo: false, artefacts: false, period: 24, surfaceTurns: 2, cloudTurns: 3, cloudShadow: true,
        lavaMode: 'layered', lavaTime: null, debris: false, time: c.t, fog: true, fogCharted: c.coverage, fogEvents: c.events ?? [], fogMoonEvents: c.moonEvents ?? [],
      });
      const L = lab[k].final.data;
      assert.equal(v.length, L.length, `${c.name}: frame sizes`);
      let diff = 0, fog = 0;
      for (let i = 0; i < L.length; i += 4) {
        if (L[i] !== v[i] || L[i + 1] !== v[i + 1] || L[i + 2] !== v[i + 2]) diff++;
        if (L[i] !== lab[k].nofog.data[i] || L[i + 1] !== lab[k].nofog.data[i + 1] || L[i + 2] !== lab[k].nofog.data[i + 2]) fog++;
      }
      assert.ok(fog > 300, `${c.name}: the fog changed only ${fog} px (empty output)`);
      assert.equal(diff, 0, `${c.name}: ${diff} px differ between the lab and the viewer`);
    }
  } finally {
    await vb.close();
  }
});
