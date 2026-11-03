// Repro over the hero loop (shots.mjs --planets: planet view, lush seed 7, thin ring,
// moons, period 12 s, 180p). For 48 frames across the period measures, per frame:
//   coverage   - shipped cloud px / DoubleSide cloud px (1 - coverage = surface showing
//                through each puff's outline: the ring artefact)
//   backFacing - share of drawn cloud px that are the puff's far inside shell
// Variants (in-memory only): --fix=handed (right-handed put() basis), --ramp=old (cloud
// band 1 back to #8f74b0), --spin=off (loop-locked rotation frozen at t=0).
// Also saves the worst frame and its time for a visual.
import path from 'node:path';
import { openViewer } from './repro-hollow-clouds.mjs';
import { HANDED_FIX } from './repro-hollow-rings.mjs';
const OUT = path.dirname(new URL(import.meta.url).pathname);
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? '').split('=')[1];
const fix = arg('fix') === 'handed', oldRamp = arg('ramp') === 'old', spinOff = arg('spin') === 'off';
const tag = [fix ? 'fixed' : 'prod', oldRamp && 'oldramp', spinOff && 'nospin'].filter(Boolean).join('-');
const { browser, page } = await openViewer(fix ? { patch: HANDED_FIX } : {});
const PERIOD = 12, N = 48;
const BASE = { view: 'planet', palette: 'final', biome: 'lush', seed: 7, size: 1, ringMode: 'thin', moons: true, period: PERIOD, depth: true, pixelH: 180, color: 'coral', spin: true, ui: false, halo: false, eyes: 'auto' };
const rows = [];
for (let i = 0; i < N; i++) {
  const time = spinOff ? 0 : (i * PERIOD) / N;
  rows.push({ time: +time.toFixed(2), ...(await page.evaluate(({ o, oldRamp }) => {
    const { planets, puffsOf, renderer, scene, camera, THREE } = window.__dbg;
    window.viewer.set(o);
    const mat = puffsOf(planets[0]).material;
    if (oldRamp) { mat.uniforms.uRamp.value[1].set('#8f74b0'); renderer.render(scene, camera); }
    const shot = document.getElementById('view').toDataURL();
    mat.userData.orig ??= mat.fragmentShader;
    mat.fragmentShader = mat.userData.orig.replace(/gl_FragColor = vec4\(uRamp\[band\(n\)\], 1\.0\);/,
      'gl_FragColor = dot(normalize(vNormalW), cameraPosition - vPosW) >= 0.0 ? vec4(0.0, 1.0, 0.0, 1.0) : vec4(1.0, 0.0, 1.0, 1.0);');
    mat.needsUpdate = true;
    const count = () => {
      const src = document.getElementById('view');
      const c = Object.assign(document.createElement('canvas'), { width: src.width, height: src.height });
      const x = c.getContext('2d'); x.drawImage(src, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let f = 0, b = 0;
      for (let k = 0; k < d.length; k += 4) { if (d[k] === 0 && d[k + 1] === 255 && d[k + 2] === 0) f++; else if (d[k] === 255 && d[k + 1] === 0 && d[k + 2] === 255) b++; }
      return { f, b };
    };
    renderer.render(scene, camera); const s = count();
    mat.side = THREE.DoubleSide; mat.needsUpdate = true; renderer.render(scene, camera); const dbl = count();
    mat.side = THREE.FrontSide; mat.fragmentShader = mat.userData.orig; mat.needsUpdate = true;
    return { coverage: +((s.f + s.b) / Math.max(1, dbl.f + dbl.b)).toFixed(3), backFacing: +(s.b / Math.max(1, s.f + s.b)).toFixed(3), shot };
  }, { o: { ...BASE, time }, oldRamp })) });
}
const cov = rows.map((r) => r.coverage);
const worst = rows.reduce((a, r) => (r.coverage < a.coverage ? r : a));
console.log(JSON.stringify({ variant: tag, frames: N, coverageMin: Math.min(...cov), coverageMedian: [...cov].sort()[N >> 1], coverageMax: Math.max(...cov), backFacingMedian: [...rows.map((r) => r.backFacing)].sort()[N >> 1], worstTime: worst.time, framesBelow97: rows.filter((r) => r.coverage < 0.97).length }));
const { writeFile } = await import('node:fs/promises');
await writeFile(path.join(OUT, `loop-${tag}-worst-t${worst.time}.png`), Buffer.from(worst.shot.split(',')[1], 'base64'));
await browser.close();
