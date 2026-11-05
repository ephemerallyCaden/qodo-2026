// Renders the Day 2 comparison into out/:
//   defaults.png       the scene built with three.js defaults (defaults/main.js), 1280x720
//   house.png          the asset viewer's house-rules render, 320x180 upscaled x4 nearest to 1280x720
//   house-320x180.png  the same, at its internal resolution
//   compare.png        both side by side at the same display size, captions outside the images
//   checker.txt        check.mjs's line for each render, plus the motion speed ranges
//   motion.gif         (--gif) eased vs constant-rate motion, one 24 s loop, side by side
// and refreshes scene-palette.json (v2 space, stars and depth tints, read from the live viewer).
// Usage: node render.mjs [--gif]
import { execFileSync } from 'node:child_process';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataUrlBytes, openBrowser } from './harness.mjs';
import { checkFiles, loadPalette } from './check.mjs';
import { HOUSE_STATE, LOOP, STILL_TIME, constantMotion, easedMotion, speedRange } from './scene.js';
import { V2_PLANET_RAMPS } from '../asset-viewer/planet-ramps.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
const GIF = process.argv.includes('--gif');
const CAPTIONS = { defaults: 'three.js defaults', house: 'Commet house rules' };

await mkdir(OUT, { recursive: true });
const { browser, errors, open } = await openBrowser();
const save = (url, name) => writeFile(path.join(OUT, name), dataUrlBytes(url));

// ---------------------------------------------------------------- house rules
const house = await open('/asset-viewer/index.html', 'viewer');
// The asset viewer's own shipped state, with only the hero planet and the crew showing.
const houseFrame = (time) => house.evaluate((opts) => {
  window.viewer.set(opts);
  const { planets, solos, frame, renderer } = window.viewer.internals;
  planets.slice(1).forEach((p) => (p.group.visible = false)); // the depth copies
  solos.forEach((a) => (a.group.visible = false));
  frame(); // set() already drew twice (depth tints); one more pass without the hidden objects
  return renderer.domElement.toDataURL('image/png');
}, { ...HOUSE_STATE, time });
const scenePalette = await house.evaluate(async () => {
  const { PALETTES } = await import('/asset-viewer/viewer.js'); // the already-loaded module instance
  const { space, stars, depth } = PALETTES.final;
  return { space, stars, depth };
});
// Sheet chrome (outside the renders): v2 space behind, v2 cloud cream for the captions.
const SHEET = { bg: scenePalette.space, text: V2_PLANET_RAMPS.cloud[3] };
await writeFile(path.join(HERE, 'scene-palette.json'), `${JSON.stringify({ source: 'asset-viewer viewer.js PALETTES.final (v2 space, stars, depth); written by render.mjs', ...scenePalette }, null, 2)}\n`);

// ---------------------------------------------------------------- defaults
const defaults = await open('/day2-compare/defaults/index.html', 'defaults');
const defaultsFrame = (time, eased = true) => defaults.evaluate(([t, e]) => window.defaults.render(t, e), [time, eased]);

// ---------------------------------------------------------------- stills + sheet
// Nearest-neighbour scaling and labelled side-by-side sheets, drawn in the page's 2D canvas.
const sheet = (tiles, w, h) => house.evaluate(async ({ tiles, w, h, SHEET }) => {
  const load = (url) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
  const CAP = tiles.some((t) => t.caption) ? 40 : 0, GAP = 16;
  const c = document.createElement('canvas');
  c.width = GAP + tiles.length * (w + GAP);
  c.height = GAP + CAP + h + GAP;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.fillStyle = SHEET.bg;
  x.fillRect(0, 0, c.width, c.height);
  x.font = '600 22px ui-monospace, Menlo, monospace';
  x.textBaseline = 'middle';
  for (const [i, t] of tiles.entries()) {
    const X = GAP + i * (w + GAP);
    x.drawImage(await load(t.url), X, GAP + CAP, w, h);
    if (t.caption) { x.fillStyle = SHEET.text; x.fillText(t.caption, X, GAP + CAP / 2 - 4); }
  }
  return c.toDataURL('image/png');
}, { tiles, w, h, SHEET });

const houseNative = await houseFrame(STILL_TIME);
await save(houseNative, 'house-320x180.png');
const houseUp = await house.evaluate(async (url) => { // x4 nearest, no padding
  const i = new Image();
  i.src = url;
  await i.decode();
  const c = document.createElement('canvas');
  c.width = i.width * 4;
  c.height = i.height * 4;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(i, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}, houseNative);
await save(houseUp, 'house.png');
const defaultsStill = await defaultsFrame(STILL_TIME);
await save(defaultsStill, 'defaults.png');
await save(await sheet([{ url: defaultsStill, caption: CAPTIONS.defaults }, { url: houseUp, caption: CAPTIONS.house }], 1280, 720), 'compare.png');
console.log('out/defaults.png, out/house.png, out/house-320x180.png, out/compare.png');

// ---------------------------------------------------------------- checker
const fmt = ([lo, hi]) => `${lo.toFixed(2)}..${hi.toFixed(2)} rad/s`;
const motionLine = (label, m) => `${label} motion: surface spin ${fmt(speedRange(m, 'spin'))}, clouds ${fmt(speedRange(m, 'clouds'))}, moons ${fmt(speedRange(m, 'moon'))}`;
const lines = [
  ...(await checkFiles([path.join(OUT, 'defaults.png'), path.join(OUT, 'house.png')], await loadPalette())),
  motionLine('defaults.png (eased tweens, scene.js model)', easedMotion),
  motionLine('house.png (viewer LOOP, constant rates, scene.js model)', constantMotion),
];
await writeFile(path.join(OUT, 'checker.txt'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));

// ---------------------------------------------------------------- motion GIF
if (GIF) {
  const FPS = 6, frames = LOOP.period * FPS, W = 640, H = 360; // house x2 (a whole number); 6 fps keeps it under 10 MB for a Discussion post
  const tmp = path.join(HERE, 'frames-tmp');
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  for (let i = 0; i < frames; i++) {
    const t = i / FPS;
    // Both at WxH: the defaults frame scaled by the browser's default (smooth) filter, the house frame x2 nearest.
    const both = await house.evaluate(async ({ d, h, W, H, SHEET, CAPTIONS }) => {
      const load = (url) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = url; });
      const GAP = 8, CAP = 26;
      const c = document.createElement('canvas');
      c.width = GAP + 2 * (W + GAP);
      c.height = GAP + CAP + H + GAP;
      const x = c.getContext('2d');
      x.fillStyle = SHEET.bg;
      x.fillRect(0, 0, c.width, c.height);
      x.font = '600 15px ui-monospace, Menlo, monospace';
      x.textBaseline = 'middle';
      x.fillStyle = SHEET.text;
      x.fillText(`${CAPTIONS.defaults} · eased tweens`, GAP, GAP + CAP / 2 - 2);
      x.fillText(`${CAPTIONS.house} · constant rates`, 2 * GAP + W, GAP + CAP / 2 - 2);
      x.imageSmoothingEnabled = true;
      x.drawImage(await load(d), GAP, GAP + CAP, W, H);
      x.imageSmoothingEnabled = false;
      x.drawImage(await load(h), 2 * GAP + W, GAP + CAP, W, H);
      return c.toDataURL('image/png');
    }, { d: await defaultsFrame(t), h: await houseFrame(t), W, H, SHEET, CAPTIONS });
    await writeFile(path.join(tmp, `${String(i).padStart(4, '0')}.png`), dataUrlBytes(both));
  }
  const out = path.join(OUT, 'motion.gif');
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(tmp, '%04d.png'),
    '-vf', 'split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=none', '-loop', '0', out]);
  await rm(tmp, { recursive: true, force: true });
  console.log(`out/motion.gif (${frames} frames, ${((await stat(out)).size / 1e6).toFixed(2)} MB)`);
}

await browser.close();
if (errors.length) throw errors[0];
