// Saves review screenshots with headless Chromium. The page is served through
// Playwright request interception, so no socket is opened and nothing touches the network.
// Usage: node shots.mjs [name ...]   (no names = all shots)
//        node shots.mjs --palettes   (25 Lospec palettes + labelled contact sheet)
import { chromium } from 'playwright';
import { access, mkdir, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { LOSPEC, LOSPEC_ORDER } from './palettes.js';
import { EYE_DESIGNS } from './faces.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'http://viewer.local';
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };

const SHOTS = {
  'planet-closeup': { view: 'planet', time: 3 },
  'planet-no-ring': { view: 'planet', time: 3, ring: false },
  'planet-seed-311': { view: 'planet', time: 3, seed: 311 },
  'crew-closeup': { view: 'crew', time: 1.2 },
  'crew-face-switch': { view: 'crew', time: 1.2, eyes: '3' }, // UI override: Binocular on everyone
  'depth-scene': { view: 'depth', time: 2 },
  'depth-scene-off': { view: 'depth', time: 2, depth: false },
  'pixel-120': { view: 'planet', time: 3, pixelH: 120 },
  'pixel-360': { view: 'planet', time: 3, pixelH: 360 },
  'palette-v1-depth': { view: 'depth', time: 2, palette: 'v1' }, // input for the before/after
};
const BASE = { seed: 7, ring: true, depth: true, pixelH: 180, color: 'coral', spin: true, ui: false, palette: 'v2' };

const PALETTE_MODE = process.argv.includes('--palettes');
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const names = PALETTE_MODE ? [] : wanted.length ? wanted.filter((n) => SHOTS[n]) : Object.keys(SHOTS);
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

// Labelled grid of captured frames, each scaled to its internal 320x180 (exact 1/4 nearest).
async function contactSheet(items, cols, file) {
  const url = await page.evaluate(async ({ items, cols }) => {
    const TW = 320, TH = 180, LAB = 18, GAP = 8, rows = Math.ceil(items.length / cols);
    const c = document.createElement('canvas');
    c.width = GAP + cols * (TW + GAP);
    c.height = GAP + rows * (TH + LAB + GAP);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.font = '12px ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'top';
    for (const [i, it] of items.entries()) {
      const img = new Image();
      img.src = it.url;
      await img.decode();
      const x = GAP + (i % cols) * (TW + GAP), y = GAP + Math.floor(i / cols) * (TH + LAB + GAP);
      ctx.drawImage(img, x, y, TW, TH);
      ctx.fillStyle = '#e6e0ee';
      ctx.fillText(it.label, x + 2, y + TH + 3);
    }
    return c.toDataURL('image/png');
  }, { items, cols });
  await writeFile(file, Buffer.from(url.split(',')[1], 'base64'));
}
const capture = async (opts) => {
  await page.evaluate((o) => window.viewer.set(o), { ...BASE, ...opts });
  return page.locator('#view').screenshot();
};

if (!PALETTE_MODE && (!wanted.length || wanted.includes('faces-sheet'))) {
  // All 10 Avatar V2 eye designs on the same head close-up.
  const items = [];
  for (const [i, d] of EYE_DESIGNS.entries()) {
    const png = await capture({ view: 'face', time: 1.2, eyes: String(i) });
    items.push({ label: `${i + 1} ${d.name}`, url: `data:image/png;base64,${png.toString('base64')}` });
  }
  await contactSheet(items, 5, path.join(outDir, 'faces-sheet.png'));
  console.log('screenshots/faces-sheet.png');
}

if (PALETTE_MODE) {
  // Same seed, camera and time for every palette: the depth scene with the crew in front.
  const palDir = path.join(outDir, 'palettes');
  await rm(palDir, { recursive: true, force: true }); // drop frames of swapped-out palettes
  await mkdir(palDir, { recursive: true });
  const tiles = [];
  for (const [i, slug] of LOSPEC_ORDER.entries()) {
    const label = `${String(i + 1).padStart(2, '0')} ${LOSPEC[slug].name}`;
    await page.evaluate((opts) => window.viewer.set(opts), { ...BASE, view: 'depth', time: 2, palette: `lospec:${slug}` });
    const png = await page.locator('#view').screenshot({ path: path.join(palDir, `${String(i + 1).padStart(2, '0')}-${slug}.png`) });
    tiles.push({ label, url: `data:image/png;base64,${png.toString('base64')}` });
    console.log(`screenshots/palettes/${String(i + 1).padStart(2, '0')}-${slug}.png`);
  }
  await contactSheet(tiles, 5, path.join(palDir, 'contact-sheet.png'));
  console.log('screenshots/palettes/contact-sheet.png');
}
await browser.close();
if (errors.length) throw errors[0];

// Before/after palette strip (v1 left, v2 right), if ffmpeg is around.
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
const before = path.join(outDir, 'palette-v1-depth.png');
const after = path.join(outDir, 'depth-scene.png');
const ok = await Promise.all([FFMPEG, before, after].map((f) => access(f).then(() => true, () => false)));
if (!PALETTE_MODE && ok.every(Boolean)) {
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', before, '-i', after, '-filter_complex',
    '[0]scale=640:360:flags=neighbor[a];[1]scale=640:360:flags=neighbor[b];[a][b]hstack', path.join(outDir, 'palette-before-after.png')]);
  console.log('screenshots/palette-before-after.png');
}
