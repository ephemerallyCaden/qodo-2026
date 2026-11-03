// Probe: aims the camera at one cloud clump and captures it from top-down, 45° and
// grazing angles, with normal / front-facing debug overlays. Uses the in-memory hook.
import path from 'node:path';
import { openViewer } from './repro-hollow-clouds.mjs';
const OUT = path.dirname(new URL(import.meta.url).pathname);
const { browser, page } = await openViewer();
const base = { view: 'studio', seed: 7, biome: 'lush', ringMode: 'off', pixelH: 360, depth: false, spin: false, time: 0, ui: false, palette: 'final' };
await page.evaluate((o) => window.viewer.set(o), base);
// pick the biggest puff on the camera-facing hemisphere
const info = await page.evaluate(() => {
  const { THREE, planets } = window.__dbg;
  const puffs = window.__dbg.puffsOf(window.__dbg.planets[0]);
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  let best = null;
  for (let i = 0; i < puffs.count; i++) {
    puffs.getMatrixAt(i, m); m.decompose(p, q, s);
    if (p.z > 0.5 && (!best || s.x > best.s)) best = { i, p: p.toArray(), s: s.x, sy: s.y, det: m.determinant() };
  }
  return { count: puffs.count, best };
});
console.log(JSON.stringify(info));
const c = info.best.p, len = Math.hypot(...c), u = c.map((v) => v / len);
const tangent = [1, 0, 0]; // roughly east at z-facing site
const at = (dist, tilt) => ({ pos: c.map((v, k) => v + u[k] * dist * Math.cos(tilt) + tangent[k] * dist * Math.sin(tilt)), target: c });
const views = { top: at(0.5, 0.0), deg45: at(0.5, Math.PI / 4), grazing: at(0.5, 1.4) };
const modes = ['shaded', 'puffNormal', 'frontFacing'];
for (const mode of modes) {
  await page.evaluate((mode) => {
    const { planets } = window.__dbg;
    const puffs = window.__dbg.puffsOf(window.__dbg.planets[0]);
    const mat = puffs.material;
    mat.userData.orig ??= mat.fragmentShader;
    const body = {
      shaded: null,
      puffNormal: 'gl_FragColor = vec4(normalize(vNormalW) * 0.5 + 0.5, 1.0);',
      frontFacing: 'gl_FragColor = gl_FrontFacing ? vec4(0.0, 1.0, 0.0, 1.0) : vec4(1.0, 0.0, 1.0, 1.0);',
    }[mode];
    mat.fragmentShader = body ? mat.userData.orig.replace(/gl_FragColor = vec4\(uRamp\[band\(n\)\], 1\.0\);/, body) : mat.userData.orig;
    mat.needsUpdate = true;
  }, mode);
  for (const [name, camera] of Object.entries(views)) {
    await page.evaluate(({ o, camera }) => window.viewer.set({ ...o, camera }), { o: base, camera });
    await page.locator('#view').screenshot({ path: path.join(OUT, `puff-${mode}-${name}.png`) });
  }
}
await browser.close();
