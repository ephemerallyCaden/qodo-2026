// Saves review screenshots with headless Chromium. The page is served through
// Playwright request interception, so no socket is opened and nothing touches the network.
// Usage: node shots.mjs [name ...]   (no names = all shots)
import { chromium } from 'playwright';
import { access, mkdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
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
  'crew-face-switch': { view: 'crew', time: 1.2, eyes: '1', mouth: '6' }, // UI override: ◉ ◉ / ◡ on everyone
  'depth-scene': { view: 'depth', time: 2 },
  'depth-scene-off': { view: 'depth', time: 2, depth: false },
  'pixel-120': { view: 'planet', time: 3, pixelH: 120 },
  'pixel-360': { view: 'planet', time: 3, pixelH: 360 },
  'palette-v1-depth': { view: 'depth', time: 2, palette: 'v1' }, // input for the before/after
};
const BASE = { seed: 7, ring: true, depth: true, pixelH: 180, color: 'coral', spin: true, ui: false, palette: 'v2' };

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

// Before/after palette strip (v1 left, v2 right), if ffmpeg is around.
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
const before = path.join(outDir, 'palette-v1-depth.png');
const after = path.join(outDir, 'depth-scene.png');
const ok = await Promise.all([FFMPEG, before, after].map((f) => access(f).then(() => true, () => false)));
if (ok.every(Boolean)) {
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', before, '-i', after, '-filter_complex',
    '[0]scale=640:360:flags=neighbor[a];[1]scale=640:360:flags=neighbor[b];[a][b]hstack', path.join(outDir, 'palette-before-after.png')]);
  console.log('screenshots/palette-before-after.png');
}
