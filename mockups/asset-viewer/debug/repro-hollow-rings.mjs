// Repro for the "hollow ring" clouds (USER-REPORT-hollow-rings.png) on 351c05a.
// 1. dumps the sign of every cloud instance matrix determinant
// 2. captures the user's framing (planet view, 180p, ring + moons) for several biomes,
//    plus a back-shell overlay (green = puff's outward normal faces the camera, magenta =
//    it faces away, i.e. the far inside of the puff is what's drawn). Note gl_FrontFacing
//    can't show this: the mirror flips screen winding too, so it reads 'front' either way.
// 3. --fix=handed  re-serves viewer.js with the put() basis made right-handed (in memory)
// Usage: node debug/repro-hollow-rings.mjs [--fix=handed]
import path from 'node:path';
import { openViewer } from './repro-hollow-clouds.mjs';
const OUT = path.dirname(new URL(import.meta.url).pathname);
const fix = process.argv.includes('--fix=handed');
// candidate fix used as a CONTROL only: north = east x d (right-handed east, up, north basis)
export const HANDED_FIX = (src) => {
  const a = 'const north = new THREE.Vector3().crossVectors(d, east);';
  if (!src.includes(a)) throw new Error('put() basis line not found');
  return src.replace(a, 'const north = new THREE.Vector3().crossVectors(east, d);');
};
if (process.argv[1] === new URL(import.meta.url).pathname) {
const tag = fix ? 'fixed' : 'prod';
const { browser, page } = await openViewer(fix ? { patch: HANDED_FIX } : {});
const BASE = { view: 'planet', seed: 7, biome: 'lush', size: 1, ringMode: 'thin', depth: true, pixelH: 180, color: 'coral', spin: true, ui: false, palette: 'final', moons: true, halo: false, period: 6, time: 3 };
const dets = await page.evaluate((o) => {
  window.viewer.set(o);
  const { THREE, planets, puffsOf } = window.__dbg;
  const puffs = puffsOf(planets[0]), m = new THREE.Matrix4();
  let neg = 0, pos = 0, zero = 0;
  for (let i = 0; i < puffs.count; i++) { puffs.getMatrixAt(i, m); const d = m.determinant(); d < -1e-12 ? neg++ : d > 1e-12 ? pos++ : zero++; }
  return { count: puffs.count, negative: neg, positive: pos, degenerate: zero, materialSide: puffs.material.side, meshWorldDet: +puffs.matrixWorld.determinant().toFixed(4) };
}, BASE);
console.log('instance determinants', JSON.stringify(dets));
const zoom = { pos: [0.95, 0.55, 3.3], target: [0, -0.1, 0] }; // closer framing like the user's screenshot
const shots = [
  ['lush-planet', {}], ['lush-zoom', { camera: zoom }], ['lush-zoom-360', { camera: zoom, pixelH: 360 }],
  ['ocean-zoom', { biome: 'ocean', camera: zoom }], ['lava-zoom', { biome: 'lava', camera: zoom }], ['toxic-zoom', { biome: 'toxic', camera: zoom }],
  ['lush-topdown', { camera: { pos: [0.1, 3.4, 0.4], target: [0, 0, 0] } }],
];
for (const [name, o] of shots) {
  await page.evaluate((o) => window.viewer.set(o), { ...BASE, ...o });
  await page.locator('#view').screenshot({ path: path.join(OUT, `rings-${tag}-${name}.png`) });
  console.log(`debug/rings-${tag}-${name}.png`);
}
// front-facing overlay on the zoomed lush frame
await page.evaluate(() => {
  const { planets, puffsOf } = window.__dbg;
  const mat = puffsOf(planets[0]).material;
  mat.fragmentShader = mat.fragmentShader.replace(/gl_FragColor = vec4\(uRamp\[[^;]*\], 1\.0\);\s*}\s*$/, 'gl_FragColor = dot(normalize(vNormalW), cameraPosition - vPosW) >= 0.0 ? vec4(0.0, 1.0, 0.0, 1.0) : vec4(1.0, 0.0, 1.0, 1.0); }');
  mat.needsUpdate = true;
});
await page.evaluate((o) => window.viewer.set(o), { ...BASE, camera: zoom, depth: false });
await page.locator('#view').screenshot({ path: path.join(OUT, `rings-${tag}-backshell.png`) });
console.log(`debug/rings-${tag}-backshell.png`);
await browser.close();
}
