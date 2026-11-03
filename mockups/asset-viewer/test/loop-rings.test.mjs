// Loop-frame variant of the hollow-ring render test (debug/repro-loop-rings.mjs as a
// test): LOOP_FRAMES (default 12; LOOP_FRAMES=48 for the full sweep) frames across the 24 s hero loop that hero-loop.gif is rendered from
// (planet view, lush seed 7, thin ring, moons, 180p). Every frame must draw each puff's
// outer shell over its whole disc, so the GIF can't ship with the ring artefact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openViewer } from '../debug/repro-hollow-clouds.mjs';

const PERIOD = 24, N = Number(process.env.LOOP_FRAMES ?? 12); // the default loop: 24 s, surface 2 turns, clouds 3
const BASE = { view: 'planet', palette: 'final', biome: 'lush', seed: 7, size: 1, ringMode: 'thin', moons: true, period: PERIOD, surfaceTurns: 2, cloudTurns: 3, depth: true, pixelH: 180, color: 'coral', spin: true, ui: false, halo: false, eyes: 'auto' };

test(`hero loop: cloud puffs are solid in every sampled frame (${N} frames / ${PERIOD} s)`, async () => {
  const { browser, page } = await openViewer();
  try {
    const rows = [];
    for (let i = 0; i < N; i++) {
      const time = (i * PERIOD) / N;
      rows.push({ time: +time.toFixed(2), ...(await page.evaluate((o) => {
        const { planets, puffsOf, renderer, scene, camera, THREE } = window.__dbg;
        window.viewer.set(o);
        const mat = puffsOf(planets[0]).material;
        mat.userData.orig ??= mat.fragmentShader;
        // ID pass: green = outward normal faces the camera, magenta = the far inside shell
        mat.fragmentShader = mat.userData.orig.replace(/gl_FragColor = vec4\(uRamp\[band\(n\)\], 1\.0\);/,
          'gl_FragColor = dot(normalize(vNormalW), cameraPosition - vPosW) >= 0.0 ? vec4(0.0, 1.0, 0.0, 1.0) : vec4(1.0, 0.0, 1.0, 1.0);');
        mat.needsUpdate = true;
        const count = () => {
          const src = document.getElementById('view');
          const c = Object.assign(document.createElement('canvas'), { width: src.width, height: src.height });
          const x = c.getContext('2d');
          x.drawImage(src, 0, 0);
          const d = x.getImageData(0, 0, c.width, c.height).data;
          let f = 0, b = 0;
          for (let k = 0; k < d.length; k += 4) { if (d[k] === 0 && d[k + 1] === 255 && d[k + 2] === 0) f++; else if (d[k] === 255 && d[k + 1] === 0 && d[k + 2] === 255) b++; }
          return { f, b };
        };
        renderer.render(scene, camera);
        const s = count();
        mat.side = THREE.DoubleSide; mat.needsUpdate = true;
        renderer.render(scene, camera);
        const dbl = count();
        mat.side = THREE.FrontSide; mat.fragmentShader = mat.userData.orig; mat.needsUpdate = true;
        return { disc: dbl.f + dbl.b, coverage: +((s.f + s.b) / Math.max(1, dbl.f + dbl.b)).toFixed(3), backFacing: +(s.b / Math.max(1, s.f + s.b)).toFixed(3) };
      }, { ...BASE, time })) });
    }
    const bad = rows.filter((r) => r.disc > 50 && (r.coverage < 0.97 || r.backFacing > 0.02));
    const cov = rows.map((r) => r.coverage);
    console.log(JSON.stringify({ frames: N, coverageMin: Math.min(...cov), coverageMax: Math.max(...cov), backFacingMax: Math.max(...rows.map((r) => r.backFacing)), framesFailing: bad.length }));
    assert.equal(bad.length, 0, `ring artefact in ${bad.length}/${N} loop frames, e.g. ${bad.slice(0, 3).map((r) => `t=${r.time}s: ${(r.coverage * 100).toFixed(0)}% covered, ${(r.backFacing * 100).toFixed(0)}% inside shell`).join('; ')}`);
  } finally {
    await browser.close();
  }
});
