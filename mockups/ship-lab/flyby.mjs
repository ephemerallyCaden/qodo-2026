// Renders the fly-by (flyby.js, the Day 18 hype shot) with headless Chromium (SwiftShader), through the
// same request interception as lab.mjs: no socket, no network. Writes out/flyby/: frames/####.png at the
// internal 320x180, ship-flyby.gif (x3 nearest-neighbour, 960x540, no dither, the frames' exact
// colours, no caption), still.png (the still frame at x3) and report.json.
// Usage: node flyby.mjs [still=<k>] [whole=<k>] [only=<k>,<k>,...]   (only: render just those frames, x3, to out/flyby/preview/)
// Checks (exit 1 on any): every colour is BLK 36 or the viewer's world palette, and the only teal is
// the drones' eyes (their own look, checked against a render without them); every pass
// frame well inside the frame lights more than the empty sky; the still shows all six aboard (each at
// least the close-up minimum), the captain's cap (the close-up minimum), in one piece; a whole-ship
// frame shows the flame, unclipped; a re-render of the still is pixel-identical; no request off the allowlist.
import { mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openLab, pngFrom } from './harness.mjs';
import { tileProblems, decode, CREW_MIN, CAP_MIN } from './checks.mjs';
import { FLYBY, passAt, shipAt, beats } from './flyby.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out', 'flyby');
const arg = (name) => process.argv.slice(2).find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
const only = arg('only')?.split(',').map(Number);
const STILL = Number(arg('still') ?? 59); // the close pass, every eye open
const WHOLE = Number(arg('whole') ?? 91); // a whole-ship frame on the way out
const SCALE = 3;
const BATCH = 10;
const problems = [];

await mkdir(OUT, { recursive: true });
const browser = await launch();
let report;
try {
  const page = await openLab(browser);
  const { world, blk, teal, plan } = await page.evaluate(() => ({ world: window.lab.worldHexes, blk: window.lab.blk36, teal: window.lab.teal, plan: window.lab.flybyPlan }));
  if (JSON.stringify(plan) !== JSON.stringify(FLYBY)) problems.push('the page and the runner disagree on the plan');
  const allowed = new Set([...blk, ...world].filter((h) => !teal.includes(h)));
  const ks = only ?? Array.from({ length: FLYBY.frames }, (_, k) => k);
  const dir = path.join(OUT, only ? 'preview' : 'frames');
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const used = new Map();
  const frames = [];
  for (let i = 0; i < ks.length; i += BATCH) {
    const batch = ks.slice(i, i + BATCH);
    const res = [];
    for (const k of batch) res.push(...(await page.evaluate((kk) => window.lab.flyby({ from: kk, to: kk + 1 }), k)).frames);
    for (const f of res) {
      const file = path.join(dir, `${String(f.k).padStart(4, '0')}.png`);
      await writeFile(file, pngFrom(f.png));
      if (only) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-vf', `scale=iw*${SCALE}:ih*${SCALE}:flags=neighbor`, file.replace(/\.png$/, '-x3.png')]);
      for (const [h, n] of f.colours) used.set(h, (used.get(h) ?? 0) + n);
      const bad = f.colours.filter(([h]) => !allowed.has(h) && !teal.includes(h));
      if (bad.length) problems.push(`frame ${f.k}: colours outside BLK 36 + the world palette: ${JSON.stringify(bad)}`);
      if (f.tealStray) problems.push(`frame ${f.k}: ${f.tealStray} teal px that aren't the drones' eyes`);
      frames.push({ k: f.k, t: +f.t.toFixed(3), lit: f.lit, tealPx: f.tealPx, colours: f.colours.length });
    }
    console.log(`frames ${batch[0]}-${batch.at(-1)} done`);
  }
  // every pass frame with the ship well inside the frame lights more px than the empty sky (frame 0) does
  const empty = frames.find((f) => f.k === 0)?.lit;
  if (!only && empty !== undefined) for (const f of frames) {
    const s = passAt(f.k);
    if (s !== null && Math.abs(shipAt(f.k).p[0]) < 4 && f.lit < empty + 500) problems.push(`frame ${f.k}: the ship isn't on screen (${f.lit} px lit, the empty sky ${empty})`);
  }
  // the still: every astronaut and the cap gated at the close-up minimums (the close pass crops the
  // fins and the flame on purpose, as the crew close-up does); a whole-ship frame: not clipped, a flame
  let still = null, whole = null;
  if (!only) {
    const { stats: [s, w] } = await page.evaluate(([a, b]) => window.lab.flyby({ from: a, to: a + 1, stats: [a, b] }), [STILL, WHOLE]);
    const close = (x) => ({ ...x, cell: { ...x.cell, framing: 'close' } });
    const p = tileProblems(close(s), `flyby still (frame ${STILL})`, { crewGate: true }).filter((m) => !/touches the tile edge|no thruster flame/.test(m));
    const q = tileProblems(close(w), `flyby whole ship (frame ${WHOLE})`, { crewGate: false });
    problems.push(...p, ...q);
    whole = { k: WHOLE, ship: w.shipBox, drawn: w.drawn, crew: w.crew.map((c) => ({ px: c.px, block: c.block })), cap: { px: w.cap.px, block: w.cap.block }, flamePx: w.flamePx, pieces: w.pieces, clipped: w.clipped, problems: q };
    const a = await page.evaluate((k) => window.lab.flybyRaw(k), STILL), b = await page.evaluate((k) => window.lab.flybyRaw(k), STILL);
    const same = Buffer.compare(decode(a), decode(b)) === 0;
    if (!same) problems.push(`flyby still: a re-render of frame ${STILL} differs`);
    still = {
      k: STILL, t: +(FLYBY.t0 + STILL / FLYBY.fps).toFixed(3), deterministic: same, gate: { crew: CREW_MIN.close, cap: CAP_MIN.close },
      ship: s.shipBox, drawn: s.drawn, crew: s.crew.map((c) => ({ px: c.px, block: c.block })), cap: { px: s.cap.px, block: s.cap.block }, flamePx: s.flamePx, pieces: s.pieces, clipped: s.clipped, problems: p,
    };
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, `${String(STILL).padStart(4, '0')}.png`), '-vf', `scale=iw*${SCALE}:ih*${SCALE}:flags=neighbor`, path.join(OUT, 'still.png')]);
    // the GIF: x3 nearest-neighbour, no dither, only the changed rectangle per frame, on a palette of the
    // frames' exact colours (palettegen's median cut can nudge a colour a step: #14665b -> #15665b)
    const hexes = [...used.keys()];
    if (hexes.length > 256) problems.push(`${hexes.length} colours: more than a GIF palette holds`);
    const pal = await page.evaluate((hs) => {
      const c = Object.assign(document.createElement('canvas'), { width: 16, height: 16 });
      const g = c.getContext('2d');
      hs.forEach((h, i) => { g.fillStyle = h; g.fillRect(i % 16, Math.floor(i / 16), 1, 1); });
      for (let i = hs.length; i < 256; i++) { g.fillStyle = hs[0]; g.fillRect(i % 16, Math.floor(i / 16), 1, 1); }
      return c.toDataURL('image/png');
    }, hexes);
    await writeFile(path.join(OUT, 'palette.png'), pngFrom(pal));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FLYBY.fps), '-i', path.join(dir, '%04d.png'), '-i', path.join(OUT, 'palette.png'),
      '-filter_complex', `[0:v]scale=iw*${SCALE}:ih*${SCALE}:flags=neighbor[a];[a][1:v]paletteuse=dither=none:diff_mode=rectangle`, '-loop', '0', path.join(OUT, 'ship-flyby.gif')]);
  }
  if (page.blocked.length) problems.push(`requests off the allowlist: ${page.blocked.join(', ')}`);
  report = {
    plan: FLYBY, beats: beats(), still, whole, frames, allowed: { blk36: blk, world: world.filter((h) => !blk.includes(h) && !teal.includes(h)), droneTeal: teal },
    colours: [...used.entries()].sort((p, q) => q[1] - p[1]).map(([h, n]) => ({ hex: h, px: n, set: blk.includes(h) ? 'BLK 36' : teal.includes(h) ? 'teal (drone eyes)' : 'world' })),
    gif: only ? null : { file: 'ship-flyby.gif', w: 320 * SCALE, h: 180 * SCALE, frames: FLYBY.frames, fps: FLYBY.fps, kb: Math.round((await stat(path.join(OUT, 'ship-flyby.gif'))).size / 1024) },
    problems,
  };
} finally {
  await browser.close();
}
if (!only) await writeFile(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);
console.log(`${report.colours.length} colours (${['BLK 36', 'world', 'teal (drone eyes)'].map((k) => `${report.colours.filter((c) => c.set === k).length} ${k}`).join(', ')})`);
for (const [name, r] of [['still', report.still], ['whole', report.whole]]) if (r) console.log(`${name} ${r.k}: crew px/block ${r.crew.map((c) => `${c.px}/${c.block}`).join(' ')}, cap ${r.cap.px}/${r.cap.block}, flame ${r.flamePx} px, edge ${r.clipped} px, ship ${JSON.stringify(r.ship)}`);
if (report.gif) console.log(`ship-flyby.gif: ${report.gif.w}x${report.gif.h}, ${report.gif.frames} frames @ ${report.gif.fps} fps, ${report.gif.kb} KB`);
console.log(problems.length ? `${problems.length} problems:\n${problems.join('\n')}` : 'all checks passed');
process.exit(problems.length ? 1 : 0);
