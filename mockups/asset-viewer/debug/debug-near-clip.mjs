// Probe: dollies the camera toward the planet along one ray (what scroll-zoom does with
// OrbitControls' default minDistance = 0) and captures each step, to check whether the
// near plane (0.05) or the camera itself ends up inside the cloud layer (r ~ 1.0-1.13).
import path from 'node:path';
import { openViewer } from './repro-hollow-clouds.mjs';
const OUT = path.dirname(new URL(import.meta.url).pathname);
const { browser, page } = await openViewer();
const base = { view: 'studio', seed: 7, biome: 'lush', ringMode: 'off', pixelH: 180, depth: false, spin: false, time: 0, ui: false, palette: 'final' };
const info = await page.evaluate(() => {
  const { camera, controls } = window.__dbg;
  return { near: camera.near, far: camera.far, minDistance: controls.minDistance, maxDistance: controls.maxDistance, zoomSpeed: controls.zoomSpeed };
});
console.log('camera/controls', JSON.stringify(info));
const dir = [0.25, 0.75, 0.62]; const L = Math.hypot(...dir); const u = dir.map((v) => v / L);
for (const r of [1.6, 1.3, 1.2, 1.15, 1.12, 1.09]) {
  await page.evaluate(({ o, camera }) => window.viewer.set({ ...o, camera }), { o: base, camera: { pos: u.map((v) => v * r), target: [0, 0, 0] } });
  const f = `near-r${r.toFixed(2)}.png`;
  await page.locator('#view').screenshot({ path: path.join(OUT, f) });
  console.log('debug/' + f);
}
await browser.close();
