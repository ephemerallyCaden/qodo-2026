// Probe: renders the lush planet's clouds from several orbit angles so the "hollow
// cloud" glitch can be inspected. Serves the viewer via Playwright interception
// (no socket) and appends a debug hook to viewer.js IN MEMORY ONLY (app file untouched).
// Usage: node debug/repro-hollow-clouds.mjs
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'debug');
const ORIGIN = 'http://viewer.local';
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const HOOK = `
window.__dbg = { THREE, scene, camera, renderer, planets, controls, DEPTH_U, CRACKS, VIEWS,
  // the camera on a view's direction at this distance from its target
  cameraAt: (view, dist) => { const { pos, target } = VIEWS[view], k = dist / Math.hypot(...pos.map((x, i) => x - target[i])); return { pos: pos.map((x, i) => target[i] + (x - target[i]) * k), target }; },
  // a sphere's radius in px of the view canvas (the shader's gRadiusPx); obj: a mesh of unit radius
  radiusPx: (obj) => { const c = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld).applyMatrix4(camera.matrixWorldInverse); const R = new THREE.Vector3().setFromMatrixScale(obj.matrixWorld).x; return +((R * camera.projectionMatrix.elements[5]) / -c.z * document.getElementById('view').height * 0.5).toFixed(1); },
  // cloud InstancedMesh of a planet, wherever it sits in the group tree
  puffsOf: (p) => { let m = null; p.group.traverse((o) => { if (!m && o.isInstancedMesh) m = o; }); return m; },
  // the view canvas's pixels at its internal resolution
  readView: () => { const s = document.getElementById('view'); const c = Object.assign(document.createElement('canvas'), { width: s.width, height: s.height }); const x = c.getContext('2d'); x.drawImage(s, 0, 0); return { W: s.width, H: s.height, d: x.getImageData(0, 0, s.width, s.height).data }; } };
`;

// patch(src) may rewrite viewer.js text in memory (controls / candidate fixes only).
export async function openViewer({ patch } = {}) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (url.origin !== ORIGIN || !file.startsWith(ROOT + path.sep)) return route.abort();
    try {
      let body = await readFile(file);
      if (url.pathname === '/viewer.js') body = (patch ? patch(body.toString()) : body.toString()) + HOOK;
      await route.fulfill({ body, contentType: MIME[path.extname(file)] ?? 'application/octet-stream' });
    } catch { await route.fulfill({ status: 404, body: 'not found' }); }
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));
  await page.goto(`${ORIGIN}/index.html`).catch(async (e) => { await browser.close(); throw e; });
  // Startup compiles every shader in SwiftShader (~12-15 s for one viewer on an idle machine, more
  // when the suite's browsers start together or the machine is busy), so allow 60 s; on failure,
  // close the browser so a test process never hangs on it.
  await page.waitForFunction(() => window.viewer?.ready && window.__dbg, null, { timeout: 60000 }).catch(async (e) => { await browser.close(); throw errors[0] ?? e; });
  return { browser, page };
}

// Camera positions around the hero planet (radius 1 at origin).
export const ANGLES = {
  default: { pos: [1.3, 0.75, 3.9], target: [0, 0, 0] },
  topdown: { pos: [0.05, 3.2, 0.05], target: [0, 0, 0] },
  grazing: { pos: [3.6, 1.15, 0.4], target: [0, 1.0, 0] },
  closeTop: { pos: [0.2, 1.9, 0.6], target: [0, 1, 0] },
  closeSide: { pos: [1.6, 0.5, 1.2], target: [0.7, 0.3, 0.5] },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await mkdir(OUT, { recursive: true });
  const { browser, page } = await openViewer();
  for (const [name, camera] of Object.entries(ANGLES)) {
    await page.evaluate((o) => window.viewer.set(o), { view: 'studio', seed: 7, biome: 'lush', ringMode: 'off', pixelH: 360, depth: false, spin: true, time: 3, ui: false, palette: 'final', camera });
    await page.locator('#view').screenshot({ path: path.join(OUT, `angle-${name}.png`) });
    console.log(`debug/angle-${name}.png`);
  }
  await browser.close();
}
