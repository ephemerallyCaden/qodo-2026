// Renders the loop frame by frame in headless Chromium, then encodes the GIF.
// Usage: node render.mjs            -> frames/, hype.gif, poster.png
//        node render.mjs --only 0,30 -> just those frames (for quick looks)
import { chromium } from 'playwright';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'http://hype.local';
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
const SCALE = 2; // 320x180 -> 640x360
const POSTER_FRAME = 54;
const POSTER_SCALE = 4;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };

const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? process.argv[onlyArg + 1].split(',').map(Number) : null;
const framesDir = path.join(ROOT, 'frames');

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
// Serve the page from disk through request interception: no socket, no network.
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
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[page ${m.type()}] ${m.text()}`); });

await page.goto(`${ORIGIN}/index.html?render`);
await page.waitForFunction(() => window.hype?.ready || false, null, { timeout: 15000 }).catch(() => {});
if (errors.length) throw errors[0];
const info = await page.evaluate(() => window.hype.info);

if (!only) await rm(framesDir, { recursive: true, force: true });
await mkdir(framesDir, { recursive: true });
const list = only ?? [...Array(info.frames).keys()];
for (const i of list) {
  const url = await page.evaluate((n) => window.hype.renderFrame(n), i);
  await writeFile(path.join(framesDir, `${String(i).padStart(4, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
}
await browser.close();
if (errors.length) throw errors[0];
console.log(`rendered ${list.length} frame(s) at ${info.width}x${info.height}`);
if (only) console.log(JSON.stringify(info.layout));

const ff = (args) => execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const up = (s) => `scale=iw*${s}:ih*${s}:flags=neighbor`;

if (only) {
  for (const i of list) {
    const n = String(i).padStart(4, '0');
    ff(['-i', path.join(framesDir, `${n}.png`), '-vf', up(4), path.join(framesDir, `preview-${n}.png`)]);
  }
  process.exit(0);
}

ff([
  '-framerate', String(info.fps), '-i', path.join(framesDir, '%04d.png'),
  '-vf', `${up(SCALE)},split[a][b];[a]palettegen=max_colors=64:stats_mode=full:reserve_transparent=0[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`,
  '-loop', '0', path.join(ROOT, 'hype.gif'),
]);
ff(['-i', path.join(framesDir, `${String(POSTER_FRAME).padStart(4, '0')}.png`), '-vf', up(POSTER_SCALE), path.join(ROOT, 'poster.png')]);
console.log('wrote hype.gif and poster.png');
