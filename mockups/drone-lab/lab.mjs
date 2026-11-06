// Regenerates every lab output in out/ with headless Chromium (SwiftShader). The page is served
// through Playwright request interception, so no socket is opened and nothing touches the network.
// Usage: node lab.mjs [lineup] [crew] [closeups] [turntable] [params]   (no names = all)
// Every rendered tile is checked: only the drone's palette + space (+ BLK 36 crew in the crew
// shot), so no antialiasing or dithering; the intended number of silhouette pieces (1, plus any
// free-floating halos); not empty; not clipped by the tile edge. Each turntable's frame one loop
// later must be pixel-identical to frame 0. Any failure exits non-zero.
import { chromium } from 'playwright';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveFile } from './serve.mjs';
import { mapPalette } from '../asset-viewer/palette-map.js';
import { CREW, SPACE } from '../explorations/astronaut-lab/crew.js';
import { PALETTES, SLOTS, paletteHexes } from './palette.js';
import { PARAMS, DEFAULTS, showValue } from './params.js';
import { VARIANTS, RECOMMENDED } from './variants.js';
import { LOOP, MOTION } from './drone.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');
const ORIGIN = 'http://lab.local';
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const VIEWS = [['front', 0], ['3/4', -0.75], ['side', -Math.PI / 2]];
const FPS = 15;
const wanted = process.argv.slice(2);
const want = (n) => !wanted.length || wanted.includes(n);
const rec = VARIANTS.find((v) => v.id === RECOMMENDED);

// The crew colours must be what the asset viewer resolves for BLK 36; palettes must fill every slot.
const blk = mapPalette('blk-36');
for (const k of ['suit', 'gear', 'visor', 'glint']) {
  if (JSON.stringify(blk[k]) !== JSON.stringify(CREW[k])) throw new Error(`crew.${k} drifted from BLK 36: ${JSON.stringify(blk[k])}`);
}
for (const [key, pal] of Object.entries(PALETTES)) {
  for (const [slot, n] of Object.entries(SLOTS)) {
    if (pal[slot]?.length !== n || !pal[slot].every((h) => /^#[0-9a-f]{6}$/.test(h))) throw new Error(`palette ${key}.${slot} needs ${n} hex colours`);
  }
}
// Loop lock: every motion completes whole cycles per loop.
for (const [k, n] of Object.entries(MOTION)) if (!Number.isInteger(n) || n < 1) throw new Error(`MOTION.${k} must be a whole number of cycles per ${LOOP} s`);

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const file = url.origin === ORIGIN ? resolveFile(url.pathname) : null;
    if (!file) return route.abort();
    try {
      await route.fulfill({ body: await readFile(file), contentType: MIME[path.extname(file)] ?? 'application/octet-stream' });
    } catch {
      await route.fulfill({ status: 404, body: 'not found' });
    }
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('GPU stall')) console.log(`[page] ${m.text()}`); });
  await page.goto(`${ORIGIN}/capture.html`);
  await page.waitForFunction(() => window.lab?.ready, null, { timeout: 20000 }).catch((e) => { throw errors[0] ?? e; });
  if (errors.length) throw errors[0];

  // Control: the checks must see an empty tile as empty, or a blank render could pass.
  const control = await page.evaluate(() => window.lab.sheet({ w: 40, h: 40, scale: 1, rows: [{ cells: [{ variant: 'A', empty: true }] }] }).stats[0]);
  if (control.figure !== 0 || control.pieces !== 0) throw new Error(`empty-output control saw ${control.figure} figure px`);

  async function render(name, spec, file) {
    const { png, stats } = await page.evaluate((s) => window.lab.sheet(s), spec);
    if (errors.length) throw errors[0];
    for (const s of stats) {
      const where = `${name} row ${s.row} col ${s.col}`;
      if (!s.figure) problems.push(`${where}: empty tile (nothing rendered)`);
      if (s.stray) problems.push(`${where}: ${s.stray} pixels outside the palette + space`);
      if (s.pieces !== s.want) problems.push(`${where}: silhouette in ${s.pieces} pieces (intended ${s.want})`);
      if (s.clipped) problems.push(`${where}: figure touches the tile edge`);
    }
    if (file) {
      await writeFile(file, Buffer.from(png.split(',')[1], 'base64'));
      if (!file.includes(`${path.sep}.frames-`)) console.log(path.relative(ROOT, file));
    }
    return { stats, png };
  }
  const heads = VARIANTS.map((v) => [`${v.id} · ${v.name}${v.id === RECOMMENDED ? ' (recommended)' : ''}`, v.leaning, v.id === RECOMMENDED]);

  if (want('lineup')) {
    // Front, 3/4 and side at the standard close-up pixel density (crops of 320x180), x3.
    const { stats } = await render('lineup', {
      title: `drone lab · base-model directions A–F · 180p crops at x3 · base palette · t = 0 · recommended: ${rec.id} (teal frame)`,
      w: 100, h: 100, scale: 3, rowLabelW: 56, headH: 96, heads,
      rows: VIEWS.map(([label, yaw]) => ({ label, cells: VARIANTS.map((v) => ({ variant: v.id, yaw, mark: v.id === RECOMMENDED })) })),
    }, path.join(OUT, 'base-lineup.png'));
    const hs = stats.filter((s) => s.row === 0).map((s, i) => `${VARIANTS[i].id} ${s.heightPx}px`);
    console.log(`  drone heights at 180p (front): ${hs.join(', ')}  (a K astronaut is ~100px)`);
  }

  if (want('crew')) {
    // The viewer's crew close-up, full 320x180 frame, x4: K astronaut, drone, K astronaut.
    const { stats } = await render('crew', {
      title: `${rec.id} · ${rec.name} hovering with two K astronauts · the viewer's crew close-up, 320x180 at x4 · t = 0`,
      w: 320, h: 180, scale: 4,
      rows: [{ cells: [{ variant: rec.id, crew: true }] }],
    }, path.join(OUT, 'base-with-crew.png'));
    console.log(`  crew frame: ${stats[0].pieces} pieces, ${stats[0].figure} figure px`);
  }

  if (want('closeups')) {
    // The camera twice as close: the drone is ~2x the pixels, so parts can be judged. x4 like the viewer.
    for (const v of VARIANTS) {
      await render(`closeup ${v.id}`, {
        title: `${v.id} · ${v.name} · 2x close-up (camera at half distance), x4 · ${v.leaning}`,
        w: 180, h: 180, scale: 4,
        rows: [{ cells: [[0, 'front'], [-0.75, '3/4'], [-Math.PI / 2, 'side'], [Math.PI * 0.8, 'back 3/4']].map(([yaw, caption]) => ({ variant: v.id, yaw, zoom: 2, caption })) }],
      }, path.join(OUT, `${v.id}-closeup.png`));
    }
  }

  // One turn per loop, 15 fps, sway off; each drone blinks once, staggered. Starts at 3/4.
  async function turntable(name, rows, { scale = 2, zoom = 1, w = 100, h = 100 } = {}) {
    const tmp = path.join(OUT, `.frames-${name}`);
    await rm(tmp, { recursive: true, force: true });
    await mkdir(tmp, { recursive: true });
    const N = LOOP * FPS;
    const blink = (t, i) => { const k = t - (1 + i * 0.4); return k > 0 && k < 0.18 ? 1 - Math.sin((k / 0.18) * Math.PI) * 0.88 : 1; };
    const per = Math.max(...rows.map((r) => r.length));
    const frame = (f) => {
      const t = f / FPS;
      return {
        w, h, scale, crispLabels: true,
        rows: rows.map((vs, r) => ({
          cells: vs.map((v, j) => ({ variant: v.id, yaw: -0.75 - (Math.PI * 2 * f) / N, t, zoom, blink: blink(t % LOOP, r * per + j), caption: `${v.id} · ${v.name}` })),
        })),
      };
    };
    let first;
    for (let f = 0; f < N; f++) {
      const { png } = await render(`${name} frame ${f}`, frame(f), path.join(tmp, `f${String(f).padStart(3, '0')}.png`));
      first ??= png;
    }
    // Seamless: the frame one loop later must be pixel-identical to the first.
    if ((await render(`${name} seam`, frame(N))).png !== first) problems.push(`${name}: frame ${N} differs from frame 0 (loop seam)`);
    else console.log(`  ${name} seam: frame ${N} == frame 0`);
    const gif = path.join(OUT, `${name}.gif`);
    // A fixed palette of exactly the colours in the frames, so ffmpeg can't nudge any.
    const hexes = [...new Set([...paletteHexes(PALETTES.base), SPACE, '#111111', '#fff6e4'])];
    const pal = Buffer.alloc(16 * 16 * 3);
    for (let i = 0; i < 256; i++) Buffer.from(hexes[Math.min(i, hexes.length - 1)].slice(1), 'hex').copy(pal, i * 3);
    await writeFile(path.join(tmp, 'palette.rgb'), pal);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(tmp, 'f%03d.png'),
      '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '16x16', '-i', path.join(tmp, 'palette.rgb'),
      '-filter_complex', '[0][1]paletteuse=dither=none', '-loop', '0', gif]);
    await rm(tmp, { recursive: true, force: true });
    console.log(path.relative(ROOT, gif));
  }

  if (want('turntable')) {
    await turntable('base-turntable', [[rec]], { scale: 3, zoom: 2, w: 180, h: 180 });
    await turntable('base-lineup-turntable', [VARIANTS.slice(0, 3), VARIANTS.slice(3)]);
  }

  if (want('params')) await writeFile(path.join(OUT, 'params.md'), await paramsDoc());
} finally {
  await browser.close();
}

async function paramsDoc() {
  const notes = await readFile(path.join(ROOT, 'params-notes.md'), 'utf8');
  const lines = [
    '# Drone lab: parameters',
    '',
    'Generated by `npm run lab` from `params.js`, `variants.js`, `palette.js` and `params-notes.md`. Each direction is a parameter set for the one drone in `drone.js`; mixing directions is mixing columns of this table. Lengths are world units (a K astronaut is 0.95 tall), angles radians, "share" values are fractions of the named part. **Bold** marks a value that differs from the default.',
    '',
    '## Directions',
    '',
    ...VARIANTS.map((v) => `- **${v.id} · ${v.name}${v.id === RECOMMENDED ? ' (recommended)' : ''}:** ${v.leaning}`),
    '',
    '## Parameters',
    '',
    `| Parameter | Meaning | Default | ${VARIANTS.map((v) => v.id).join(' | ')} |`,
    `|---|---|---|${VARIANTS.map(() => '---').join('|')}|`,
  ];
  let group = '';
  for (const p of PARAMS) {
    if (p.group !== group) { group = p.group; lines.push(`| *${group}* | | | ${VARIANTS.map(() => '').join(' | ')} |`); }
    const cells = VARIANTS.map((v) => {
      const val = v.params[p.key] ?? DEFAULTS[p.key];
      const s = showValue(p.key, val);
      return val !== DEFAULTS[p.key] ? `**${s}**` : s;
    });
    const range = p.type === 'select' ? p.options.join(' / ') : `${p.min}–${p.max}`;
    lines.push(`| \`${p.key}\` | ${p.words} (${range}) | ${showValue(p.key, DEFAULTS[p.key])} | ${cells.join(' | ')} |`);
  }
  lines.push('', '## Palette slots', '', '| Slot | Tones | Used for | base | frost (slot test) |', '|---|---|---|---|---|');
  const used = { shell: 'the shell, lit in four bands', trim: 'bezel, ears, goggle frames, arms, antenna stalk, rotor arms and hubs, ring, nozzle', screen: 'screen and goggle lenses (two near-blacks), then the glint', glow: 'emissive and unlit: eyes, antenna tip, lens, halos, ring core, plume (the two brightest tones; the two darker ones are spare, e.g. for a dimmed idle state later)', accent: 'band / panel / stripe / crest' };
  for (const [slot, n] of Object.entries(SLOTS)) lines.push(`| \`${slot}\` | ${n} | ${used[slot]} | ${PALETTES.base[slot].map((h) => `\`${h}\``).join(' ')} | ${PALETTES.frost[slot].map((h) => `\`${h}\``).join(' ')} |`);
  lines.push('', `Motion, in whole cycles per ${LOOP} s loop (so also per 24 s scene loop): ${Object.entries(MOTION).map(([k, n]) => `${k} ${n}`).join(', ')}.`, '', notes.trim(), '');
  return lines.join('\n');
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.slice(0, 40).join('\n')}`);
  process.exit(1);
}
console.log('checks: every tile is palette + space only, has its intended pieces, is not empty and is unclipped; loops are seamless');
