// Regenerates every lab output in out/ with headless Chromium (SwiftShader). The page is served
// through Playwright request interception, so no socket is opened and nothing touches the network.
// Usage: node lab.mjs [lineup] [poses] [turntable] [closeups] [final] [params]   (no names = all)
// Every rendered tile is checked: only BLK 36 crew colours + space (no AA, no dithering), one
// connected silhouette (no floating parts or gaps), and nothing clipped by the tile edge.
import { chromium } from 'playwright';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveFile } from './serve.mjs';
import { mapPalette } from '../../asset-viewer/palette-map.js';
import { CREW, SPACE } from './crew.js';
import { PARAMS, DEFAULTS, showValue } from './params.js';
import { VARIANTS } from './variants.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');
const ORIGIN = 'http://lab.local';
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const VIEWS = [['front', 0], ['3/4', -0.75], ['side', -Math.PI / 2]];
const LOOP_S = 6, FPS = 15;
const wanted = process.argv.slice(2);
const want = (n) => !wanted.length || wanted.includes(n);

// BLK 36 exactly: the lab's crew colours must be what the asset viewer resolves.
const blk = mapPalette('blk-36');
for (const k of ['suit', 'gear', 'visor', 'glint', 'contributors']) {
  if (JSON.stringify(blk[k]) !== JSON.stringify(CREW[k])) throw new Error(`crew.${k} drifted from BLK 36: ${JSON.stringify(blk[k])}`);
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
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

const problems = [];
async function render(name, spec, file) {
  const { png, stats } = await page.evaluate((s) => window.lab.sheet(s), spec);
  for (const s of stats) {
    const where = `${name} row ${s.row} col ${s.col}`;
    if (s.stray) problems.push(`${where}: ${s.stray} pixels outside BLK 36 + space`);
    if (s.pieces !== 1) problems.push(`${where}: silhouette in ${s.pieces} pieces`);
    if (s.clipped) problems.push(`${where}: figure touches the tile edge`);
  }
  if (file) {
    await writeFile(file, Buffer.from(png.split(',')[1], 'base64'));
    console.log(path.relative(ROOT, file));
  }
  return { stats, png };
}
const heads = VARIANTS.map((v) => [`${v.id} · ${v.name}`, v.leaning]);

if (want('lineup')) {
  // Front, 3/4 and side at the standard close-up pixel density (crops of 320x180), x3.
  const { stats } = await render('lineup', {
    title: 'astronaut lab · lineup · 180p crops at x3 · mint, dots eyes · t = 0',
    w: 100, h: 128, scale: 3, rowLabelW: 56, headH: 84, heads,
    rows: VIEWS.map(([label, yaw]) => ({ label, cells: VARIANTS.map((v) => ({ variant: v.id, yaw })) })),
  }, path.join(OUT, 'lineup.png'));
  const hs = stats.filter((s) => s.row === 0).map((s, i) => `${VARIANTS[i].id} ${s.heightPx}px`);
  console.log(`  figure heights at 180p: ${hs.join(', ')}`);
}

if (want('poses')) {
  // Idle float (t = 0) and the bob's peak (t = CYCLE/8 = 1.5 s), 3/4 and side.
  await render('poses', {
    title: 'astronaut lab · poses · idle float (t = 0) vs mid-bob (t = 1.5 s), with sway · x3',
    w: 100, h: 128, scale: 3, rowLabelW: 76, headH: 84, heads,
    rows: [['3/4 idle', -0.75, 0], ['3/4 mid-bob', -0.75, 1.5], ['side idle', -Math.PI / 2, 0], ['side mid-bob', -Math.PI / 2, 1.5]]
      .map(([label, yaw, t]) => ({ label, cells: VARIANTS.map((v) => ({ variant: v.id, yaw, t, sway: 1 })) })),
  }, path.join(OUT, 'lineup-poses.png'));
}

if (want('closeups')) {
  // The camera twice as close: the figure is ~2x the pixels, so joints can be judged. x4 like the viewer.
  for (const v of VARIANTS) {
    await render(`closeup ${v.id}`, {
      title: `${v.id} · ${v.name} · 2x close-up (camera at half distance), x4 · ${v.leaning}`,
      w: 190, h: 236, scale: 4,
      rows: [{ cells: [[-0.75, '3/4'], [-Math.PI / 2, 'side'], [Math.PI * 0.8, 'back 3/4']].map(([yaw, caption]) => ({ variant: v.id, yaw, zoom: 2, caption })) }],
    }, path.join(OUT, `${v.id}-closeup.png`));
  }
}

// One turn and one bob per 6 s loop, 15 fps, sway off; each figure blinks once, staggered.
// Starts at 3/4 so frame 0 matches the lineup's middle row. rows: arrays of variants.
async function turntable(name, rows, { scale = 2, zoom = 1, w = 100, h = 128 } = {}) {
  const tmp = path.join(OUT, `.frames-${name}`);
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const N = LOOP_S * FPS;
  const blink = (t, i) => { const k = t - (1 + i * 0.4); return k > 0 && k < 0.18 ? 1 - Math.sin((k / 0.18) * Math.PI) * 0.88 : 1; };
  const per = Math.max(...rows.map((r) => r.length));
  const frame = (f) => {
    const t = f / FPS;
    return {
      w, h, scale, crispLabels: true,
      rows: rows.map((vs, r) => ({
        cells: vs.map((v, j) => ({ variant: v.id, yaw: -0.75 - (Math.PI * 2 * f) / N, t, zoom, blink: blink(t, r * per + j), caption: `${v.id} · ${v.name}` })),
      })),
    };
  };
  let first;
  for (let f = 0; f < N; f++) {
    const { png } = await render(`${name} frame ${f}`, frame(f), path.join(tmp, `f${String(f).padStart(3, '0')}.png`));
    first ??= png;
  }
  // Seamless: the frame one loop later must be pixel-identical to the first.
  if ((await render(`${name} seam`, frame(N))).png !== first) problems.push(`${name}: frame N differs from frame 0 (loop seam)`);
  else console.log(`  ${name} seam: frame ${N} == frame 0`);
  const gif = path.join(OUT, `${name}.gif`);
  // A fixed palette of exactly the colours in the frames (palettegen nudged #14665b to #15665b).
  const hexes = [...CREW.suit, ...CREW.gear, ...CREW.visor, CREW.glint, ...CREW.contributors.mint, SPACE, '#111111', '#fff6e4'];
  const pal = Buffer.alloc(16 * 16 * 3);
  for (let i = 0; i < 256; i++) Buffer.from(hexes[Math.min(i, hexes.length - 1)].slice(1), 'hex').copy(pal, i * 3);
  await writeFile(path.join(tmp, 'palette.rgb'), pal);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(tmp, 'f%03d.png'),
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '16x16', '-i', path.join(tmp, 'palette.rgb'),
    '-filter_complex', '[0][1]paletteuse=dither=none', '-loop', '0', gif]);
  await rm(tmp, { recursive: true, force: true });
  console.log(path.relative(ROOT, gif));
}
const byId = (id) => VARIANTS.find((v) => v.id === id);

if (want('turntable')) await turntable('lineup-turntable', [VARIANTS.slice(0, 6), VARIANTS.slice(6)]);

if (want('final')) {
  // The pick: K against the two it came from, every view, idle and mid-bob, x3.
  const cols = [['front', 0], ['3/4', -0.75], ['side', -Math.PI / 2]].flatMap(([v, yaw]) => [[`${v} idle`, yaw, 0], [`${v} mid-bob`, yaw, 1.5]]);
  await render('final-compare', {
    title: 'final: K (C + A pack, smooth white) vs A and C · 180p crops at x3 · idle (t = 0) and mid-bob (t = 1.5 s), with sway',
    w: 100, h: 128, scale: 3, rowLabelW: 150, headH: 26, heads: cols.map(([label]) => [label]),
    rows: ['A', 'C', 'K'].map((id) => ({ label: `${id} · ${byId(id).name}`, cells: cols.map(([, yaw, t]) => ({ variant: id, yaw, t, sway: 1 })) })),
  }, path.join(OUT, 'final-compare.png'));
  // K alone, at the 2x close-up scale, turning.
  await turntable('K-turntable', [[byId('K')]], { scale: 3, zoom: 2, w: 240, h: 260 });
}

if (want('params')) {
  const lines = [
    '# Astronaut lab: variant parameters',
    '',
    'Generated by `npm run lab` from `variants.js` and `params.js`. Each variant is a parameter set for the one astronaut in `astronaut.js`; mixing variants is mixing rows of this table. Lengths are in figure heights (the figure is always exactly 1 tall before the scene scale, 0.95), angles in radians. **Bold** marks a value that differs from A (the current spec).',
    '',
    '## Leanings',
    '',
    ...VARIANTS.map((v) => `- **${v.id} · ${v.name}:** ${v.leaning}`),
    '',
    '## Parameters',
    '',
    `| Parameter | Meaning | ${VARIANTS.map((v) => v.id).join(' | ')} |`,
    `|---|---|${VARIANTS.map(() => '---').join('|')}|`,
  ];
  let group = '';
  for (const p of PARAMS) {
    if (p.group !== group) { group = p.group; lines.push(`| *${group}* | | ${VARIANTS.map(() => '').join(' | ')} |`); }
    const cells = VARIANTS.map((v) => {
      const val = v.params[p.key] ?? DEFAULTS[p.key];
      const s = showValue(p.key, val);
      return val !== DEFAULTS[p.key] ? `**${s}**` : s;
    });
    lines.push(`| \`${p.key}\` | ${p.words} | ${cells.join(' | ')} |`);
  }
  await writeFile(path.join(OUT, 'params.md'), lines.join('\n') + '\n');
  console.log('out/params.md');
}

await browser.close();
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.slice(0, 40).join('\n')}`);
  process.exit(1);
}
console.log('checks: every tile is BLK 36 + space only, one connected silhouette, unclipped');
