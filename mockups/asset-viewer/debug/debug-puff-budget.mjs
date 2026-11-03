// Probe: is the cloud layer truncated by MAX_PUFFS? Serves viewer.js with the cap raised
// IN MEMORY, counts how many puffs each seed/biome actually wants, and reports the
// latitude at which the shipped 1200 cap stops placement (sites run north -> south).
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (url.origin !== 'http://viewer.local' || !file.startsWith(ROOT + path.sep)) return route.abort();
  let body = await readFile(file).catch(() => null);
  if (!body) return route.fulfill({ status: 404, body: '' });
  if (url.pathname === '/viewer.js') body = body.toString().replace('const MAX_PUFFS = 1200;', 'const MAX_PUFFS = 20000;') + '\nwindow.__dbg = { THREE, planets };\n';
  await route.fulfill({ body, contentType: url.pathname.endsWith('.html') ? 'text/html' : 'text/javascript' });
});
await page.goto('http://viewer.local/index.html');
await page.waitForFunction(() => window.__dbg);
for (const [biome, seed] of [['lush', 7], ['lush', 311], ['lush', 42], ['ocean', 7], ['lava', 7], ['toxic', 7]]) {
  const r = await page.evaluate(({ biome, seed }) => {
    window.viewer.set({ view: 'studio', seed, biome, ui: false });
    const { THREE, planets } = window.__dbg;
    const puffs = window.__dbg.puffsOf(window.__dbg.planets[0]);
    const m = new THREE.Matrix4(), p = new THREE.Vector3();
    let y1200 = null, below = 0;
    if (puffs.count > 1200) { puffs.getMatrixAt(1199, m); p.setFromMatrixPosition(m); y1200 = p.y / p.length(); }
    for (let i = 1200; i < puffs.count; i++) { puffs.getMatrixAt(i, m); p.setFromMatrixPosition(m); if (p.y < 0) below++; }
    return { wanted: puffs.count, dropped: Math.max(0, puffs.count - 1200), cutoffLatDeg: y1200 === null ? null : +(Math.asin(y1200) * 180 / Math.PI).toFixed(1) };
  }, { biome, seed });
  console.log(biome, seed, JSON.stringify(r));
}
await browser.close();
