// Saves review screenshots with headless Chromium. The page is served through
// Playwright request interception, so no socket is opened and nothing touches the network.
// Usage: node shots.mjs [name ...]   (no names = all shots)
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'http://viewer.local';
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };

const SHOTS = {
  'planet-closeup': { view: 'planet', time: 3 },
  'planet-no-ring': { view: 'planet', time: 3, ring: false },
  'planet-seed-311': { view: 'planet', time: 3, seed: 311 },
  'crew-closeup': { view: 'crew', time: 1.2 },
  'depth-scene': { view: 'depth', time: 2 },
  'depth-scene-off': { view: 'depth', time: 2, depth: false },
  'pixel-120': { view: 'planet', time: 3, pixelH: 120 },
  'pixel-360': { view: 'planet', time: 3, pixelH: 360 },
};
const BASE = { seed: 7, ring: true, depth: true, pixelH: 180, color: 'coral', spin: true, ui: false };

const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(SHOTS);
const outDir = path.join(ROOT, 'screenshots');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
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
await page.waitForFunction(() => window.viewer?.ready, null, { timeout: 15000 }).catch((e) => { throw errors[0] ?? e; });
for (const name of names) {
  await page.evaluate((opts) => window.viewer.set(opts), { ...BASE, ...SHOTS[name] });
  await page.locator('#view').screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log(`screenshots/${name}.png`);
}
await browser.close();
if (errors.length) throw errors[0];
