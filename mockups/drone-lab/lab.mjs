// Regenerates every lab output in out/ with headless Chromium (SwiftShader). The page is served
// through Playwright request interception, so no socket is opened and nothing touches the network.
// Usage: node lab.mjs [lineup] [crew] [closeups] [turntable] [motion] [final] [working] [params]   (no names = all)
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
import { VARIANTS, PICKED, FINAL, FINAL_PARAMS } from './variants.js';
import { LOOP, MOTION_LOOP, CYCLES } from './drone.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');
const ORIGIN = 'http://lab.local';
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const VIEWS = [['front', 0], ['3/4', -0.75], ['side', -Math.PI / 2]];
const FPS = 15;
const wanted = process.argv.slice(2);
const tag = (v) => `${v.id} · ${v.name}${v.id === PICKED ? ' (picked: see D-final)' : ''}`;
const want = (n) => !wanted.length || wanted.includes(n);

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
// Loop lock: every motion completes whole cycles per 12 s, and both loops divide the scene's 24 s.
for (const [k, n] of Object.entries(CYCLES)) if (!Number.isInteger(n) || n < 1) throw new Error(`CYCLES.${k} must be a whole number per ${MOTION_LOOP} s`);
if (24 % LOOP || 24 % MOTION_LOOP) throw new Error('loops must divide 24 s');

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
  const heads = VARIANTS.map((v) => [tag(v), v.leaning, v.id === PICKED]);
  const STILL_T = 0.9; // idle loop time for stills: mid-sputter, eyes open

  if (want('lineup')) {
    // Front, 3/4 and side at the standard close-up pixel density (crops of 320x180), x3.
    const { stats } = await render('lineup', {
      title: `drone lab · base variants A–E · 180p crops at x3 · base palette · idle t = ${STILL_T} s · the human's pick: ${PICKED} (teal frame)`,
      w: 100, h: 100, scale: 3, rowLabelW: 56, headH: 96, heads,
      rows: VIEWS.map(([label, yaw]) => ({ label, cells: VARIANTS.map((v) => ({ variant: v.id, yaw, t: STILL_T, mark: v.id === PICKED })) })),
    }, path.join(OUT, 'base-lineup.png'));
    const hs = stats.filter((s) => s.row === 0).map((s, i) => `${VARIANTS[i].id} ${s.heightPx}px`);
    console.log(`  drone heights at 180p (front, smoke off): ${hs.join(', ')}  (a K astronaut is ~100px)`);
  }

  if (want('crew')) {
    // The viewer's crew close-up, full 320x180 frames, x2: K astronaut, drone, K astronaut.
    const cells = VARIANTS.map((v) => ({ variant: v.id, crew: true, t: STILL_T, caption: tag(v) }));
    await render('crew', {
      title: "each variant hovering between two K astronauts · the viewer's crew close-up, 320x180 at x3 · idle",
      w: 320, h: 180, scale: 3,
      rows: [cells.slice(0, 2), cells.slice(2, 4), cells.slice(4)].map((c) => ({ cells: c })),
    }, path.join(OUT, 'base-with-crew.png'));
  }

  if (want('closeups')) {
    // The camera twice as close: the drone is ~2x the pixels, so parts can be judged. x4 like the viewer.
    for (const v of VARIANTS) {
      await render(`closeup ${v.id}`, {
        title: `${v.id} · ${v.name} · 2x close-up (camera at half distance), x3 · ${v.leaning}`,
        w: 220, h: 220, scale: 3,
        rows: [{ cells: [[0, 'front'], [-0.75, '3/4'], [-Math.PI / 2, 'side'], [Math.PI * 0.8, 'back 3/4']].map(([yaw, caption]) => ({ variant: v.id, yaw, t: STILL_T, zoom: 2, caption })) }],
      }, path.join(OUT, `${v.id}-closeup.png`));
    }
  }

  // An animated loop of one variant: frames f / FPS over `loop` seconds, encoded with a fixed
  // palette of exactly the frames' colours. Frame N (one loop later) must equal frame 0.
  async function loopGif(name, loop, frame) {
    const tmp = path.join(OUT, `.frames-${name}`);
    await rm(tmp, { recursive: true, force: true });
    await mkdir(tmp, { recursive: true });
    const N = loop * FPS;
    let first, smoky = 0, checked = 0;
    for (let f = 0; f < N; f++) {
      // Every third frame gets the full checks (a second, smoke-off render); all are palette-checked.
      const check = f % 3 === 0;
      const { png, stats } = await render(`${name} frame ${f}`, { ...frame(f), check, paletteCheck: true }, path.join(tmp, `f${String(f).padStart(3, '0')}.png`));
      first ??= png;
      if (check) { checked++; if (stats.some((s) => s.smokePx > 0)) smoky++; }
    }
    if (smoky < checked / 2) problems.push(`${name}: smoke in only ${smoky} of ${checked} checked frames`);
    if ((await render(`${name} seam`, frame(N))).png !== first) problems.push(`${name}: frame ${N} differs from frame 0 (loop seam)`);
    else console.log(`  ${name} seam: frame ${N} == frame 0 · smoke in ${smoky}/${checked} checked frames`);
    const gif = path.join(OUT, `${name}.gif`);
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
    // One turn per 6 s idle loop at the 2x close-up: bob, sway, puffs and a blink.
    for (const v of VARIANTS) {
      await loopGif(`${v.id}-turntable`, LOOP, (f) => ({
        w: 220, h: 220, scale: 3, crispLabels: true,
        rows: [{ cells: [{ variant: v.id, yaw: -0.75 - (Math.PI * 2 * f) / (LOOP * FPS), t: f / FPS, zoom: 2, caption: `${v.id} · ${v.name} · turntable, 6 s` }] }],
      }));
    }
  }

  if (want('motion')) {
    // The full 12 s behaviour loop with the camera fixed at 3/4 (more side-on for rear jets): drift and banking, puffs that
    // burst with effort, looking around, blinking, and the working face (code streaming).
    for (const v of VARIANTS) {
      await loopGif(`${v.id}-motion`, MOTION_LOOP, (f) => ({
        w: 280, h: 220, scale: 2, crispLabels: true,
        rows: [{ cells: [{ variant: v.id, yaw: v.params.thrusters >= 3 ? -1.05 : -0.5, t: f / FPS, zoom: 2, motion: true, caption: `${v.id} · ${v.name} · motion loop, 12 s` }] }],
      }));
    }
  }

  // ---------------------------------------------------------------- D-final, the human's pick
  const F = FINAL.id;
  if (want('final')) {
    await render('final closeup', {
      title: `${F} · ${FINAL.name} · 2.5x close-up, x4 · idle t = ${STILL_T} s`,
      w: 170, h: 180, scale: 4,
      rows: [{ cells: [[-0.75, '3/4'], [0, 'front'], [-Math.PI / 2, 'side']].map(([yaw, caption]) => ({ variant: F, yaw, t: STILL_T, zoom: 2.5, caption })) }],
    }, path.join(OUT, 'final-closeup.png'));
    await render('final crew', {
      title: `${F} hovering between two K astronauts · the viewer's crew close-up, 320x180 at x4 · idle`,
      w: 320, h: 180, scale: 4,
      rows: [{ cells: [{ variant: F, crew: true, t: STILL_T }] }],
    }, path.join(OUT, 'final-with-crew.png'));
    await loopGif('final-turntable', LOOP, (f) => ({
      w: 220, h: 220, scale: 3, crispLabels: true,
      rows: [{ cells: [{ variant: F, yaw: -0.75 - (Math.PI * 2 * f) / (LOOP * FPS), t: f / FPS, zoom: 2, caption: `${F} · turntable, 6 s` }] }],
    }));
    await loopGif('final-motion', MOTION_LOOP, (f) => ({
      w: 280, h: 220, scale: 2, crispLabels: true,
      rows: [{ cells: [{ variant: F, yaw: -0.5, t: f / FPS, zoom: 2, motion: true, caption: `${F} · motion loop, 12 s` }] }],
    }));
  }

  if (want('working')) {
    // The working face, frame by frame: the eyes blink shut, glyphs fill the screen and flash as
    // it types, then clear in a scramble and the eyes blink open. Drift and banking are held
    // still here so the face stays put; everything else is the motion loop.
    const ts = [5.5, 5.7, 5.85, 6.0, 6.5, 6.75, 7.0, 7.25, 9.9, 10.25, 10.4, 10.5, 10.6, 10.9];
    await render('working face', {
      title: `${F} · the working face, front, 2.2x close-up, x3 · motion-loop time under each frame (drift held still)`,
      w: 120, h: 104, scale: 3,
      rows: [ts.slice(0, 7), ts.slice(7)].map((row) => ({ cells: row.map((t) => ({ variant: F, params: { drift: 0, bank: 0, lookYaw: 0, bobAmp: 0 }, frameLow: -0.07, yaw: 0, t, zoom: 2.2, motion: true, smoke: false, caption: `t = ${t} s` })) })),
    }, path.join(OUT, 'working-face.png'));
  }

  if (want('working') || want('final')) {
    // Face probe: eyes painted red, glyphs green. While working there must be glyphs and no
    // eye pixels; at rest, eyes and no glyphs. Every variant, front view, 2x.
    for (const v of [...VARIANTS, FINAL]) {
      for (const [t, working] of [[0.5, false], [3.2, false], [7.0, true], [8.6, true]]) {
        const p = await page.evaluate(([id, tt]) => window.lab.faceProbe({ variant: id, t: tt, yaw: 0, zoom: 2, motion: true, smoke: false }, 160, 160), [v.id, t]);
        const ok = working ? p.eyes === 0 && p.glyphs > 20 : p.eyes > 10 && p.glyphs === 0;
        if (!ok) problems.push(`face probe ${v.id} t = ${t}: ${p.eyes} eye px, ${p.glyphs} glyph px (${working ? 'working: want 0 eyes, glyphs' : 'idle: want eyes, 0 glyphs'})`);
      }
    }
    console.log('  face probe: working = glyphs and no eyes, idle = eyes and no glyphs (A–E and D-final)');
  }

  if (want('params')) await writeFile(path.join(OUT, 'params.md'), await paramsDoc());
} finally {
  await browser.close();
}

async function paramsDoc() {
  const COLS = [...VARIANTS, FINAL];
  const fromD = Object.keys(VARIANTS.find((v) => v.id === PICKED).params).filter((k) => !(k in FINAL_PARAMS));
  const fromDefault = PARAMS.map((p) => p.key).filter((k) => !(k in FINAL.params));
  const notes = await readFile(path.join(ROOT, 'params-notes.md'), 'utf8');
  const lines = [
    '# Drone lab: parameters',
    '',
    'Generated by `npm run lab` from `params.js`, `variants.js`, `palette.js` and `params-notes.md`. Each variant is a parameter set for the one drone in `drone.js`; mixing variants is mixing columns of this table. Lengths are world units (a K astronaut is 0.95 tall), angles radians, "share" values are fractions of the named part. **Bold** marks a value that differs from the default.',
    '',
    '## Variants',
    '',
    ...VARIANTS.map((v) => `- **${tag(v)}:** ${v.leaning}`),
    `- **${FINAL.id} · ${FINAL.name}:** ${FINAL.leaning}`,
    '',
    `D-final is D with the human's exact set laid over it. Not named in that set, so kept from D: ${fromD.map((k) => `\`${k}\` = ${showValue(k, FINAL.params[k])}`).join(', ')}. Not set by either, so at the default: ${fromDefault.map((k) => `\`${k}\``).join(', ')}.`,
    '',
    '## Parameters',
    '',
    `| Parameter | Meaning | Default | ${COLS.map((v) => v.id).join(' | ')} |`,
    `|---|---|---|${COLS.map(() => '---').join('|')}|`,
  ];
  let group = '';
  for (const p of PARAMS) {
    if (p.group !== group) { group = p.group; lines.push(`| *${group}* | | | ${COLS.map(() => '').join(' | ')} |`); }
    const cells = COLS.map((v) => {
      const val = v.params[p.key] ?? DEFAULTS[p.key];
      const s = showValue(p.key, val);
      return val !== DEFAULTS[p.key] ? `**${s}**` : s;
    });
    const range = p.type === 'select' ? p.options.join(' / ') : `${p.min}–${p.max}`;
    lines.push(`| \`${p.key}\` | ${p.words} (${range}) | ${showValue(p.key, DEFAULTS[p.key])} | ${cells.join(' | ')} |`);
  }
  lines.push('', '## Palette slots', '', '| Slot | Tones | Used for | base | ember (slot test) |', '|---|---|---|---|---|');
  const used = { shell: 'the head, lit in four bands', trim: 'bezel, nozzles, rim, ears, goggle frames, antenna stalks', screen: 'screen and goggle lenses (two near-blacks), then the glint', glow: 'emissive and unlit: eyes and antenna tips [3], code lines and nozzle mouths [2]; [0] and [1] are spare', accent: 'band / panel / stripe / crest', smoke: 'puffs, lit in three bands and a band darker as they fade; sparkles [2]' };
  for (const [slot, n] of Object.entries(SLOTS)) lines.push(`| \`${slot}\` | ${n} | ${used[slot]} | ${PALETTES.base[slot].map((h) => `\`${h}\``).join(' ')} | ${PALETTES.ember[slot].map((h) => `\`${h}\``).join(' ')} |`);
  lines.push('', `Motion, in whole cycles per ${MOTION_LOOP} s motion loop (which divides the 24 s scene loop): ${Object.entries(CYCLES).map(([k, n]) => `${k} ${n}`).join(', ')}. The turntable and stills use the ${LOOP} s idle loop (no drift, looking or working).`, '', notes.trim(), '');
  return lines.join('\n');
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.slice(0, 40).join('\n')}`);
  process.exit(1);
}
console.log('checks: every tile is palette + space only, has its intended pieces, is not empty and is unclipped; loops are seamless');
