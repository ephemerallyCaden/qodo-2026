// Saves review screenshots with headless Chromium. The page is served through
// Playwright request interception, so no socket is opened and nothing touches the network.
// Usage: node shots.mjs [name ...]   (no names = all shots)
//        node shots.mjs --palettes   (25 Lospec palettes + labelled contact sheet)
//        node shots.mjs --planets    (biome variety sheet, system shot, hero loop GIF, colour counts)
//        node shots.mjs --planets lava-layered   (the sheets plus only the named loop GIFs)
import { chromium } from 'playwright';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
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
  'planet-no-ring': { view: 'planet', time: 3, ringMode: 'off' },
  'planet-seed-311': { view: 'planet', time: 3, seed: 311 },
  'crew-closeup': { view: 'crew', time: 1.2 },
  'crew-face-switch': { view: 'crew', time: 1.2, eyes: '3' }, // UI override: Binocular on everyone
  'depth-scene': { view: 'depth', time: 2 },
  'depth-scene-off': { view: 'depth', time: 2, depth: false },
  'planet-halo': { view: 'planet', time: 3, halo: true }, // optional teal-GIF dark halo toggle
  'clouds-topdown': { view: 'planet', time: 3, camera: { pos: [0.1, 3.4, 0.4], target: [0, 0, 0] } }, // hollow-cloud regression framings
  'clouds-zoom': { view: 'planet', time: 3, camera: { pos: [0.95, 0.55, 3.3], target: [0, -0.1, 0] } }, // the user's report framing
  'pixel-120': { view: 'planet', time: 3, pixelH: 120 },
  'pixel-360': { view: 'planet', time: 3, pixelH: 360 },
};
const BASE = { seed: 7, biome: 'lush', size: 1, ringMode: 'thin', depth: true, pixelH: 180, color: 'coral', spin: true, ui: false, palette: 'final', moons: true, halo: false, period: 24, surfaceTurns: 2, cloudTurns: 3, cloudShadow: true, eyes: 'auto', depthMode: 'pixel-smooth', depthBands: '3-band', artefacts: false, artAuto: true, artCount: 3, artTeal: false, cover: null, lavaMode: 'layered', lavaTime: null };

const PALETTE_MODE = process.argv.includes('--palettes');
const PLANET_MODE = process.argv.includes('--planets');
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const names = PALETTE_MODE || PLANET_MODE ? [] : wanted.length ? wanted.filter((n) => SHOTS[n]) : Object.keys(SHOTS);
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
// Startup compiles every shader in SwiftShader (slower on a busy machine): allow 60 s, and close the browser on failure.
await page.waitForFunction(() => window.viewer?.ready, null, { timeout: 60000 }).catch(async (e) => { await browser.close(); throw errors[0] ?? e; });
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
// The canvas at its internal resolution (no upscale), as a PNG buffer.
const grabNative = async () => Buffer.from((await page.evaluate(() => document.getElementById('view').toDataURL('image/png'))).split(',')[1], 'base64');
// Unique colours and a pixel diff, measured in the page from PNG buffers.
const imageStats = (pngs) => page.evaluate(async (urls) => {
  const datas = [];
  for (const u of urls) {
    const img = new Image();
    img.src = u;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    datas.push(x.getImageData(0, 0, c.width, c.height).data);
  }
  const uniq = datas.map((d) => { const set = new Set(); for (let i = 0; i < d.length; i += 4) set.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); return set.size; });
  const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++; return n; };
  const diffs = datas.slice(1).map((d, i) => diff(datas[i], d));
  return { uniq, diffs, seam: datas.length > 1 ? diff(datas[datas.length - 1], datas[0]) : 0 };
}, pngs.map((p) => `data:image/png;base64,${p.toString('base64')}`));
const sizeTag = (z) => (z < 0.8 ? 'S' : z < 1.2 ? 'M' : z < 1.6 ? 'L' : 'XL');
const asUrl = (png) => `data:image/png;base64,${png.toString('base64')}`;
const capture = async (opts) => {
  await page.evaluate((o) => window.viewer.set(o), { ...BASE, ...opts });
  return page.locator('#view').screenshot();
};

if (!PALETTE_MODE && !PLANET_MODE && (!wanted.length || wanted.includes('faces-sheet'))) {
  // All 10 Avatar V2 eye designs on the same head close-up.
  const items = [];
  for (const [i, d] of EYE_DESIGNS.entries()) {
    const png = await capture({ view: 'face', time: 1.2, eyes: String(i) });
    items.push({ label: `${i + 1} ${d.name}`, url: `data:image/png;base64,${png.toString('base64')}` });
  }
  await contactSheet(items, 5, path.join(outDir, 'faces-sheet.png'));
  console.log('screenshots/faces-sheet.png');
}

// Ring width x distance on the lush hero (rows: thread, default, wide belt; columns: hugging,
// default, far out). The middle tile is the default thin ring. Moons on: they move out with a far ring.
if (!PALETTE_MODE && !PLANET_MODE && (!wanted.length || wanted.includes('rings-sheet'))) {
  const items = [];
  for (const [wl, ringWidth] of [['thread', 0.04], ['default', 0.22], ['wide belt', 0.72]]) {
    for (const [dl, ringInner] of [['hugging', 1.25], ['default', 1.69], ['far', 2.6]]) {
      const png = await capture({ view: 'planet', time: 3, ringMode: 'thin', ringWidth, ringInner, moons: true });
      items.push({ label: `width ${ringWidth} ${wl} · dist ${ringInner} ${dl}`, url: `data:image/png;base64,${png.toString('base64')}` });
    }
  }
  await contactSheet(items, 3, path.join(outDir, 'rings-sheet.png'));
  console.log('screenshots/rings-sheet.png');
}

// Lava modes side by side on the lava hero: layered (default), static-painted, full-warp, at two loop times.
if (!PALETTE_MODE && !PLANET_MODE && (!wanted.length || wanted.includes('lava-modes'))) {
  const items = [];
  for (const time of [3, 9]) {
    for (const lavaMode of ['layered', 'static-painted', 'full-warp']) {
      const png = await capture({ view: 'planet', time, biome: 'lava', seed: 11, ringMode: 'off', moons: true, lavaMode });
      items.push({ label: `lava ${lavaMode} · t ${time} s`, url: asUrl(png) });
    }
  }
  await contactSheet(items, 3, path.join(outDir, 'lava-modes.png'));
  console.log('screenshots/lava-modes.png');
}

// Lava before / after at S/M/L (the variety-sheet tiles): 3b6a482 'flow', i.e. static-painted (top),
// vs layered crust plates over the molten layer (bottom).
if (!PALETTE_MODE && !PLANET_MODE && (!wanted.length || wanted.includes('lava-layers-before-after'))) {
  const items = [];
  for (const [label, lavaMode] of [['before (3b6a482 flow)', 'static-painted'], ['after: layered', 'layered']]) {
    for (const [seed, size] of [[12, 0.7], [11, 1.0], [58, 1.3]]) {
      const png = await capture({ view: 'studio', time: 3, biome: 'lava', seed, size, ringMode: 'off', moons: false, lavaMode });
      items.push({ label: `${label} · seed ${seed} · ${sizeTag(size)}`, url: asUrl(png) });
    }
  }
  await contactSheet(items, 3, path.join(outDir, 'lava-layers-before-after.png'));
  console.log('screenshots/lava-layers-before-after.png');
}

// Biome variety: each row entry is [label, base biome, [[seed, size, ring], ...]].
// Rings are a modifier: the 'ringed' row puts a wide ring on three bases, and a few
// other biomes carry a thin one. Sizes stand in for LOC: S < 0.8 <= M < 1.2 <= L.
const PLANET_SET = [
  ['lush', 'lush', [[7, 1.0, 'off', true], [42, 0.7, 'off'], [311, 1.3, 'thin']]],
  ['ocean', 'ocean', [[5, 1.0, 'off'], [23, 1.3, 'off'], [64, 0.7, 'off']]],
  ['ice', 'ice', [[8, 0.7, 'off'], [19, 1.0, 'thin'], [77, 1.3, 'off']]],
  ['desert', 'desert', [[3, 1.0, 'off'], [31, 0.7, 'off'], [90, 1.3, 'off']]],
  ['lava', 'lava', [[11, 1.0, 'off'], [12, 0.7, 'off'], [58, 1.3, 'off']]],
  ['ringed: desert', 'desert', [[3, 1.0, 'wide']]],
  ['ringed: ice', 'ice', [[21, 1.15, 'wide']]],
  ['ringed: lush', 'lush', [[7, 0.8, 'wide']]],
  ['gas giant (extra)', 'gas', [[5, 1.6, 'off', true], [14, 1.8, 'thin'], [33, 1.45, 'off']]],
  ['moon (extra)', 'moon', [[9, 0.35, 'off'], [2, 0.5, 'off'], [66, 0.42, 'off']]],
  ['toxic (extra)', 'toxic', [[13, 1.0, 'off'], [37, 0.7, 'off'], [81, 1.3, 'off']]],
];

// Planet artefacts on every biome (plus the teal accent on lush). Each tile uses the
// loop time (every 2 s) where the artefacts change the most pixels, i.e. a sector faces the camera.
// Sector count is automatic by size (artefactCount): lush at S/M/L/XL shows 1..5 sectors.
const ART_SET = [['lush', 7, false, 0.4], ['lush', 7, false, 1.0], ['lush', 7, false, 1.5], ['lush', 7, false, 2.2],
  ['ocean', 5], ['ice', 19], ['desert', 3], ['lava', 11], ['gas', 5], ['moon', 2], ['toxic', 13], ['lush', 7, true]];
const setNative = async (opts) => { await page.evaluate((o) => window.viewer.set(o), { ...BASE, ...opts }); return grabNative(); };
if (!PALETTE_MODE && !PLANET_MODE && (!wanted.length || wanted.includes('artefacts'))) {
  const items = [];
  for (const [biome, seed, teal = false, size = 1] of ART_SET) {
    const base = { view: 'planet', biome, seed, size, ringMode: 'off', moons: false, artAuto: true, artTeal: teal };
    let best = { n: -1 };
    for (let time = 0; time < 12; time += 2) {
      const on = await setNative({ ...base, time, artefacts: true });
      const n = (await imageStats([await setNative({ ...base, time, artefacts: false }), on])).diffs[0];
      if (n > best.n) best = { n, time, on };
    }
    items.push({ label: `${biome} · ${size < 0.8 ? 'S' : size < 1.2 ? 'M' : size < 1.6 ? 'L' : 'XL'} · t ${best.time} s${teal ? ' · teal' : ''}`, url: asUrl(best.on) });
  }
  await contactSheet(items, 4, path.join(outDir, 'artefacts.png'));
  console.log('screenshots/artefacts.png');
}

// Depth modes side by side: the depth scene, and a big planet straddling the first
// threshold (radius 2.2 at distance 13.2), per object vs per pixel (stepped).
if (!PALETTE_MODE && !PLANET_MODE && (!wanted.length || wanted.includes('depth-mode-compare'))) {
  const STRADDLE = { view: 'studio', biome: 'lush', seed: 7, size: 2.2, ringMode: 'thin', moons: false, time: 3, camera: { pos: [0, 0, 13.2], target: [0, 0, 0] } };
  const items = [];
  for (const [label, opts] of [['depth scene', { view: 'depth', time: 2 }], ['planet straddling 12', STRADDLE]]) {
    for (const depthMode of ['object', 'pixel-stepped']) items.push({ label: `${label} · ${depthMode}`, url: asUrl(await capture({ ...opts, depthMode })) });
  }
  await contactSheet(items, 2, path.join(outDir, 'depth-mode-compare.png'));
  console.log('screenshots/depth-mode-compare.png');
}

// Depth options for the human to compare: columns = options, rows = scenes. Prints the
// system shot's unique-colour count per option.
const DEPTH_OPTIONS = [
  ['object', { depthMode: 'object' }], ['3-band stepped', { depthMode: 'pixel-stepped', depthBands: '3-band' }],
  ['6-band stepped', { depthMode: 'pixel-stepped', depthBands: '6-band' }], ['8-band stepped', { depthMode: 'pixel-stepped', depthBands: '8-band' }],
  ['pixel-smooth', { depthMode: 'pixel-smooth', depthBands: '3-band' }],
];
if (!PALETTE_MODE && !PLANET_MODE && (!wanted.length || wanted.includes('depth-options-sheet'))) {
  const items = [];
  const counts = [];
  for (const [scene, opts] of [['depth scene', { view: 'depth', time: 2 }], ['system', { view: 'system', time: 2 }], ['hero planet', { view: 'planet', time: 3 }]]) {
    for (const [label, o] of DEPTH_OPTIONS) {
      items.push({ label: `${scene} · ${label}`, url: asUrl(await capture({ ...opts, ...o })) });
      if (scene === 'system') counts.push(`${label} ${(await imageStats([await grabNative()])).uniq[0]}`);
    }
  }
  await contactSheet(items, DEPTH_OPTIONS.length, path.join(outDir, 'depth-options-sheet.png'));
  console.log(`screenshots/depth-options-sheet.png (system-shot unique colours: ${counts.join(', ')})`);
}

if (PLANET_MODE) {
  const dir = path.join(outDir, 'planets');
  // `--planets name ...` renders only the named outputs (e.g. system-shot hero-loop) and keeps the rest.
  const wantP = (n) => !wanted.length || wanted.includes(n);
  if (!wanted.length) await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const STUDIO = { view: 'studio', time: 3, palette: 'final' };
  const tiles = [];
  for (const [label, biome, variants] of wantP('variety-sheet') ? PLANET_SET : []) {
    for (const [seed, size, ringMode, moons = false] of variants) {
      const png = await capture({ ...STUDIO, biome, seed, size, ringMode, moons });
      const name = `${label.replace(/ \(extra\)/, '').replace(/[: ]+/g, '-')}-${seed}`;
      await writeFile(path.join(dir, `${name}.png`), png);
      tiles.push({ label: `${label} · seed ${seed} · ${sizeTag(size)}${ringMode !== 'off' ? ` · ${ringMode} ring` : ''}`, url: asUrl(png) });
    }
  }
  if (wantP('variety-sheet')) {
    await contactSheet(tiles, 6, path.join(dir, 'variety-sheet.png'));
    console.log(`screenshots/planets/variety-sheet.png (${tiles.length} tiles)`);
  }

  if (wantP('system-shot')) {
    await writeFile(path.join(dir, 'system-shot.png'), await capture({ view: 'system', time: 2, palette: 'final' }));
    console.log('screenshots/planets/system-shot.png');
  }

  // Unique-colour counts at the internal resolution (no upscale, no AA anywhere).
  await capture({ view: 'planet', time: 2, palette: 'final', biome: 'lush', seed: 7, ringMode: 'thin', moons: true });
  const heroPng = await grabNative();
  await capture({ view: 'system', time: 2, palette: 'final' });
  const systemPng = await grabNative();
  const counts = await imageStats([heroPng, systemPng]);
  console.log(`unique colours: hero planet frame ${counts.uniq[0]}, system shot ${counts.uniq[1]}`);

  // Seamless loops: one full period, rendered at internal resolution, upscaled 2x, with a seam test
  // (the last -> first diff must be no bigger than a typical frame-to-frame diff).
  const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg';
  const loopDir = path.join(ROOT, 'frames-loop');
  const renderLoop = async (name, opts, fps) => { // fps: an ffmpeg rate, e.g. '15' or '100/3'
    if (!wantP(name)) return;
    const period = opts.period ?? BASE.period;
    const [num, den = 1] = fps.split('/').map(Number);
    const frames = Math.round((period * num) / den);
    await rm(loopDir, { recursive: true, force: true });
    await mkdir(loopDir, { recursive: true });
    const pngs = [];
    for (let i = 0; i < frames; i++) {
      const png = await setNative({ view: 'planet', palette: 'final', biome: 'lush', seed: 7, ringMode: 'thin', moons: true, ...opts, time: (i * period) / frames });
      pngs.push(png);
      await writeFile(path.join(loopDir, `${String(i).padStart(4, '0')}.png`), png);
    }
    const st = await imageStats(pngs); // diffs include last -> first as `seam`
    const typical = [...st.diffs].sort((a, b) => a - b)[Math.floor(st.diffs.length / 2)];
    console.log(`${name} loop test: last->first diff ${st.seam} px vs median frame diff ${typical} px (${st.seam <= typical * 1.5 ? 'seamless' : 'SEAM'})`);
    const out = path.join(dir, `${name}.gif`);
    execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', fps, '-i', path.join(loopDir, '%04d.png'),
      '-vf', 'scale=iw*2:ih*2:flags=neighbor,split[a][b];[a]palettegen=max_colors=64:stats_mode=full:reserve_transparent=0[p];[b][p]paletteuse=dither=none:diff_mode=rectangle',
      '-loop', '0', out]);
    await rm(loopDir, { recursive: true, force: true });
    console.log(`screenshots/planets/${name}.gif (${frames} frames, ${((await stat(out)).size / 1e6).toFixed(2)} MB)`);
  };
  // Hero loop: the lush planet with moons, the default 24 s loop (surface 2 turns, clouds 3) at 100/3 fps.
  await renderLoop('hero-loop', {}, '100/3');
  // Animated lava (LAVA_MODES): layered (default), static-painted (the 3b6a482 flow) and full-warp on the
  // lava hero, one 24 s loop at 15 fps.
  for (const [name, lavaMode] of [['lava-layered', 'layered'], ['lava-flow', 'static-painted'], ['lava-fullwarp', 'full-warp']]) await renderLoop(name, { biome: 'lava', seed: 11, ringMode: 'off', lavaMode }, '15');
  // Artefacts loop: the same hero with artefacts on, at 15 fps (one frame per glitch tick, ART_TICKS per surface turn).
  await renderLoop('artefacts-loop', { artefacts: true }, '15');
  // Cloud drift options at 15 fps: the default (24 s, 2:3, clouds 1.5x) and the alternative (36 s, 3:4, 1.33x).
  await renderLoop('cloud-drift-24s', { period: 24, surfaceTurns: 2, cloudTurns: 3 }, '15');
  await renderLoop('cloud-drift-36s', { period: 36, surfaceTurns: 3, cloudTurns: 4 }, '15');
  // Depth option loops of the system view: 6 s, seamless (one surface and cloud turn per loop), 15 fps.
  for (const [name, o] of [['depth-6band', { depthMode: 'pixel-stepped', depthBands: '6-band' }], ['depth-8band', { depthMode: 'pixel-stepped', depthBands: '8-band' }], ['depth-smooth', { depthMode: 'pixel-smooth' }]]) {
    await renderLoop(name, { view: 'system', period: 6, surfaceTurns: 1, cloudTurns: 1, ...o }, '15');
  }

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
