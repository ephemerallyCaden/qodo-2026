// Renders viewer states to PNGs at internal resolution (no upscale), for quick looks while tuning the
// star. Usage: node debug/star-probe.mjs <out dir> '<json array of [name, viewer.set options, js?]>'
// Each shot starts from BASE (so options don't leak between shots). js (optional): a function body
// run after the set with v = window.viewer.internals, followed by one more frame (tuning only).
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'http://viewer.local';
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const [outDir, spec] = process.argv.slice(2);
const shots = JSON.parse(spec);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (url.origin !== ORIGIN || !file.startsWith(ROOT + path.sep)) return route.abort();
    try {
      await route.fulfill({ body: await readFile(file), contentType: MIME[path.extname(file)] ?? 'application/octet-stream' });
    } catch {
      await route.fulfill({ status: 404, body: 'not found' });
    }
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('GPU stall')) console.log(`[page] ${m.text()}`); });
  await page.goto(`${ORIGIN}/index.html`);
  await page.waitForFunction(() => window.viewer?.ready, null, { timeout: 120000 });
  const BASE = { seed: 7, biome: 'lush', size: 1, ringMode: 'thin', depth: true, pixelH: 180, spin: true, ui: false, palette: 'final', moons: true, depthMode: 'pixel-smooth', depthBands: '3-band', debris: false,
    star: false, starSize: 1.6, starSpin: 1, starGranulation: 1, starCorona: true, starMoonlets: 0, camera: null };
  for (const [name, opts, js] of shots) {
    await page.evaluate((o) => window.viewer.set(o), { ...BASE, ...opts });
    if (js) await page.evaluate((js) => { new Function('v', js)(window.viewer.internals); window.viewer.internals.frame(); }, js);
    const png = Buffer.from((await page.evaluate(() => document.getElementById('view').toDataURL('image/png'))).split(',')[1], 'base64');
    await writeFile(path.join(outDir, `${name}.png`), png);
    console.log(path.join(outDir, `${name}.png`));
  }
  if (errors.length) throw errors[0];
} finally {
  await browser.close();
}
