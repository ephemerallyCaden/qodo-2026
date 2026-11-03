// Every cloud puff instance must be right-handed (det > 0); a mirrored instance is
// back-face culled into a hollow ring (see debug/USER-REPORT-hollow-rings.png).
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { tangentFrame } from '../cloud-frame.js';
import { openViewer } from '../debug/repro-hollow-clouds.mjs';

test('tangentFrame is right-handed and finite everywhere, poles included', () => {
  const dirs = [[0, 1, 0], [0, -1, 0], [1e-9, 1, 0], [0, -1, 1e-9], [1, 0, 0], [0, 0, 1], [-0.3, 0.9, 0.2]];
  for (let i = 0; i < 2000; i++) { // golden-spiral sweep, as the cloud placement uses
    const y = 1 - ((i + 0.5) / 2000) * 2, r = Math.sqrt(1 - y * y), lon = i * 2.39996;
    dirs.push([Math.cos(lon) * r, y, Math.sin(lon) * r]);
  }
  for (const v of dirs) {
    const d = new THREE.Vector3(...v).normalize();
    const { east, north } = tangentFrame(THREE, d);
    const det = new THREE.Matrix4().makeBasis(east, d, north).determinant();
    assert.ok(Number.isFinite(det) && det > 0.99, `det ${det} at ${v}`);
  }
});

test('every cloud instance matrix has determinant > 0 (seeds x weather biomes)', async () => {
  const { browser, page } = await openViewer();
  try {
    const res = await page.evaluate(() => {
      const { planets, puffsOf, THREE } = window.__dbg;
      const m = new THREE.Matrix4();
      const out = [];
      for (const biome of ['lush', 'ocean', 'lava', 'toxic']) for (const seed of [1, 7, 42, 311, 999]) {
        planets[0].rebuild(seed, biome, 'off');
        const puffs = puffsOf(planets[0]);
        let bad = 0;
        for (let i = 0; i < puffs.count; i++) { puffs.getMatrixAt(i, m); if (!(m.determinant() > 0)) bad++; }
        out.push({ biome, seed, count: puffs.count, bad });
      }
      return out;
    });
    console.table(res);
    assert.ok(res.every((r) => r.count > 0), 'every weather biome should place puffs');
    assert.deepEqual(res.filter((r) => r.bad > 0), []);
  } finally {
    await browser.close();
  }
});
