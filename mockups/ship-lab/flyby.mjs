// Renders the fly-by (flyby.js, the Day 18 hype shot, v2: nose first, the crew upright, the lively
// flame) with headless Chromium (SwiftShader), through the same request interception as lab.mjs: no
// socket, no network. Writes out/flyby/: frames/####.png at the internal 320x180, ship-flyby.gif (x3
// nearest-neighbour, 960x540, no dither, the frames' exact colours, no caption), still.png (the still
// frame at x3) and report.json.
// Usage: node flyby.mjs [still=<k>] [whole=<k>] [only=<k>,<k>,...]   (only: render just those frames, x3, to out/flyby/preview/)
// Checks (exit 1 on any):
// - colours: every colour is BLK 36 or the viewer's world palette, and the only teal is the drones'
//   eyes (their own look, checked against a render without them);
// - on screen: every pass frame with the ship's middle well inside the frame shows the ship; it enters
//   from off screen (nothing on the first pass frame) and anything left on the last is leaving by the edge;
// - nose first: in every frame it shows, the hull's axis on screen (tail to nose) is within NOSE_TOL of
//   its travel, nose leading;
// - upright: every rider's up on screen is within TILT_TOL of the screen's up, and the cap sits above
//   the captain's helmet (within CAP_TOL);
// - the still: all six aboard (each at least the close-up minimum) and the cap (the close-up minimum),
//   the ship and crew one piece with the flame and its puffs left out;
// - in their windows: no rider's or the cap's px outside the window openings (nobody pokes through the
//   hull), at the still, the whole-ship frame and an entry frame, each from the shot's camera and four
//   others round the ship, at x2;
// - a whole-ship frame shows the flame, unclipped;
// - the flame (the ship held still, so only the flame moves): every frame's flame differs from the one
//   before by at least FLAME_MIN of its px, and by at least FLAME_X times v1's idle flame (median);
// - a re-render of the still is pixel-identical; no request off the allowlist.
import { mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openLab, pngFrom } from './harness.mjs';
import { tileProblems, decode, CREW_MIN, CAP_MIN } from './checks.mjs';
import { FLYBY, passAt, middleAt, beats } from './flyby.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out', 'flyby');
const arg = (name) => process.argv.slice(2).find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
const only = arg('only')?.split(',').map(Number);
const STILL = Number(arg('still') ?? 59); // the close pass, every eye open
const WHOLE = Number(arg('whole') ?? 85); // a whole-ship frame on the way out, between the captain's blink and seat 5's
const ENTRY = 34; // an entry frame, for the containment views
const NOSE_TOL = 6, TILT_TOL = 6, CAP_TOL = 25; // deg
const FLAME_MIN = 0.25, FLAME_X = 5; // the flame's frame-to-frame change: at least a quarter of its px, and 5x v1's (median)
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
      frames.push({ k: f.k, t: +f.t.toFixed(3), lit: f.lit, shipPx: f.shipPx, tealPx: f.tealPx, colours: f.colours.length });
    }
    console.log(`frames ${batch[0]}-${batch.at(-1)} done`);
  }
  // every pass frame with the ship's middle well inside the frame shows the ship; it enters from off
  // screen and leaves by the edge (the hold frames are empty stars either side, so nothing pops)
  const first = FLYBY.hold[0], last = FLYBY.frames - FLYBY.hold[1] - 1;
  let edges = null;
  if (!only) {
    for (const f of frames) {
      const s = passAt(f.k);
      if (s !== null && Math.abs(middleAt(s).screen[0] - FLYBY.w / 2) < FLYBY.w / 2 - 30 && f.shipPx < 2000) problems.push(`frame ${f.k}: the ship isn't on screen (${f.shipPx} px)`);
    }
    const { stats: [a, b] } = await page.evaluate(([x, y]) => window.lab.flyby({ from: x, to: x + 1, stats: [x, y] }), [first, last]);
    edges = { first: { k: first, px: a.px }, last: { k: last, px: b.px, box: b.box } };
    if (a.px) problems.push(`frame ${first}: the ship is already on screen as the pass starts (${a.px} px)`);
    if (b.px && b.box.x + b.box.w < FLYBY.w) problems.push(`frame ${last}: ${b.px} px left on screen that aren't leaving by the right edge (${JSON.stringify(b.box)})`);
  }
  // nose first and upright, in every frame the ship shows (as drawn, the idle motion included)
  const geom = [];
  if (!only) for (const f of frames) {
    if (passAt(f.k) === null || !f.shipPx) continue;
    const g = await page.evaluate((k) => window.lab.flyGeom(k), f.k);
    geom.push(g);
    const onScreen = g.tip[0] > 0 && g.tail[0] < FLYBY.w; // the axis is checked while some of the hull is in view
    if (onScreen && Math.abs(g.noseOff) > NOSE_TOL) problems.push(`frame ${f.k}: the nose points ${g.nose} deg, ${g.noseOff} deg off its travel (${g.travel} deg)`);
    if (onScreen && Math.cos(((g.nose - g.travel) * Math.PI) / 180) < 0) problems.push(`frame ${f.k}: the tail leads`);
    g.riders.forEach((r, i) => { if (Math.abs(r.tilt) > TILT_TOL) problems.push(`frame ${f.k}: rider ${i} tilts ${r.tilt} deg from upright`); });
    if (Math.abs(g.cap) > CAP_TOL) problems.push(`frame ${f.k}: the cap sits ${g.cap} deg off the top of the captain's helmet`);
  }
  // the still: every astronaut and the cap gated at the close-up minimums (the close pass crops the
  // fins and the flame on purpose, as the crew close-up does); a whole-ship frame: not clipped, a flame
  let still = null, whole = null;
  const contained = [], flame = {};
  if (!only) {
    const { stats: [s, w] } = await page.evaluate(([a, b]) => window.lab.flyby({ from: a, to: a + 1, stats: [a, b] }), [STILL, WHOLE]);
    const close = (x) => ({ ...x, cell: { ...x.cell, framing: 'close' } });
    // the puffs drift free of the ship on purpose: 'one piece' is checked with the flame and its puffs left out (aboard)
    const pieces = (x, where) => (x.aboard === 1 ? [] : [`${where}: ship and crew are ${x.aboard} pieces with the flame left out, wanted one (the crew rides aboard)`]);
    const p = [...tileProblems(close(s), `flyby still (frame ${STILL})`, { crewGate: true }).filter((m) => !/touches the tile edge|no thruster flame|pieces, wanted one/.test(m)), ...pieces(s, `flyby still (frame ${STILL})`)];
    const q = [...tileProblems(close(w), `flyby whole ship (frame ${WHOLE})`, { crewGate: false }).filter((m) => !/pieces, wanted one/.test(m)), ...pieces(w, `flyby whole ship (frame ${WHOLE})`)];
    problems.push(...p, ...q);
    whole = { k: WHOLE, ship: w.shipBox, drawn: w.drawn, crew: w.crew.map((c) => ({ px: c.px, block: c.block, outside: c.outside })), cap: { px: w.cap.px, block: w.cap.block, outside: w.cap.outside }, flamePx: w.flamePx, pieces: w.pieces, aboard: w.aboard, clipped: w.clipped, problems: q };
    const a = await page.evaluate((k) => window.lab.flybyRaw(k), STILL), b = await page.evaluate((k) => window.lab.flybyRaw(k), STILL);
    const same = Buffer.compare(decode(a), decode(b)) === 0;
    if (!same) problems.push(`flyby still: a re-render of frame ${STILL} differs`);
    still = {
      k: STILL, t: +(FLYBY.t0 + STILL / FLYBY.fps).toFixed(3), deterministic: same, gate: { crew: CREW_MIN.close, cap: CAP_MIN.close },
      ship: s.shipBox, drawn: s.drawn, crew: s.crew.map((c) => ({ px: c.px, block: c.block, outside: c.outside })), cap: { px: s.cap.px, block: s.cap.block, outside: s.cap.outside }, flamePx: s.flamePx, pieces: s.pieces, aboard: s.aboard, clipped: s.clipped, problems: p,
    };
    // in their windows, from around: no rider's or the cap's px outside the window openings
    for (const k of [ENTRY, STILL, WHOLE]) {
      const views = await page.evaluate((kk) => window.lab.flybyOrbit(kk), k);
      contained.push({ k, views });
      for (const v of views) {
        v.crew.forEach((r, i) => { if (r.outside) problems.push(`frame ${k} view [${v.yaw}, ${v.pitch}]: rider ${i} shows ${r.outside} px outside the windows (through the hull)`); });
        if (v.cap.outside) problems.push(`frame ${k} view [${v.yaw}, ${v.pitch}]: the cap shows ${v.cap.outside} px outside the windows`);
      }
    }
    // the flame, the ship held still as at the still: the lively one against v1's idle one
    for (const idle of [false, true]) {
      const strip = await page.evaluate((o) => window.lab.flameStrip(o), { pose: STILL, from: first, to: last + 1, idle });
      const ch = strip.slice(1).map((x) => x.changed), share = strip.slice(1).map((x, i) => x.changed / Math.max(1, strip[i].px));
      const med = (x) => [...x].sort((u, v) => u - v)[Math.floor(x.length / 2)];
      flame[idle ? 'idle' : 'live'] = { frames: strip.length, px: [Math.min(...strip.map((x) => x.px)), med(strip.map((x) => x.px)), Math.max(...strip.map((x) => x.px))], changed: [Math.min(...ch), med(ch), Math.max(...ch)], minShare: +Math.min(...share).toFixed(3), still: ch.filter((x) => x === 0).length, colours: strip.find((x) => x.k === STILL).colours };
    }
    if (flame.live.minShare < FLAME_MIN) problems.push(`the flame changes only ${flame.live.minShare} of its px in its stillest step, wanted at least ${FLAME_MIN}`);
    if (flame.live.changed[1] < FLAME_X * flame.idle.changed[1]) problems.push(`the flame's median change per frame ${flame.live.changed[1]} px isn't ${FLAME_X}x v1's ${flame.idle.changed[1]} px`);
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
    plan: FLYBY, beats: beats(), still, whole, edges, contained, flame,
    nose: geom.length ? { maxOff: Math.max(...geom.filter((g) => g.tip[0] > 0 && g.tail[0] < FLYBY.w).map((g) => Math.abs(g.noseOff))), range: [Math.min(...geom.map((g) => g.nose)), Math.max(...geom.map((g) => g.nose))] } : null,
    upright: geom.length ? { maxTilt: Math.max(...geom.flatMap((g) => g.riders.map((r) => Math.abs(r.tilt)))), maxCap: Math.max(...geom.map((g) => Math.abs(g.cap))), psi: [Math.min(...geom.map((g) => g.psi)), Math.max(...geom.map((g) => g.psi))] } : null,
    geom, frames, allowed: { blk36: blk, world: world.filter((h) => !blk.includes(h) && !teal.includes(h)), droneTeal: teal },
    colours: [...used.entries()].sort((p, q) => q[1] - p[1]).map(([h, n]) => ({ hex: h, px: n, set: blk.includes(h) ? 'BLK 36' : teal.includes(h) ? 'teal (drone eyes)' : 'world' })),
    gif: only ? null : { file: 'ship-flyby.gif', w: 320 * SCALE, h: 180 * SCALE, frames: FLYBY.frames, fps: FLYBY.fps, kb: Math.round((await stat(path.join(OUT, 'ship-flyby.gif'))).size / 1024) },
    problems,
  };
} finally {
  await browser.close();
}
if (!only) await writeFile(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);
console.log(`${report.colours.length} colours (${['BLK 36', 'world', 'teal (drone eyes)'].map((k) => `${report.colours.filter((c) => c.set === k).length} ${k}`).join(', ')})`);
for (const [name, r] of [['still', report.still], ['whole', report.whole]]) if (r) console.log(`${name} ${r.k}: crew px/block/outside ${r.crew.map((c) => `${c.px}/${c.block}/${c.outside}`).join(' ')}, cap ${r.cap.px}/${r.cap.block}/${r.cap.outside}, flame ${r.flamePx} px, edge ${r.clipped} px, aboard ${r.aboard} piece, ship ${JSON.stringify(r.ship)}`);
if (report.nose) console.log(`nose: within ${report.nose.maxOff} deg of its travel, pointing ${report.nose.range.map((x) => x.toFixed(1)).join('..')} deg; riders within ${report.upright.maxTilt} deg of upright (turned ${report.upright.psi.map((x) => x.toFixed(1)).join('..')} deg), the cap within ${report.upright.maxCap} deg`);
for (const c of report.contained ?? []) console.log(`frame ${c.k}: px outside the windows, per view (riders 0-5, cap): ${c.views.map((v) => `[${v.yaw},${v.pitch}] ${[...v.crew.map((r) => r.outside), v.cap.outside].join('/')}`).join('  ')}`);
for (const [k, f] of Object.entries(report.flame ?? {})) console.log(`flame (${k === 'live' ? 'v2, lively' : 'v1, idle'}): ${f.px.join('/')} px (min/median/max), changed per frame ${f.changed.join('/')} px, least share ${f.minShare}, unchanged frames ${f.still}`);
if (report.edges) console.log(`edges: frame ${report.edges.first.k} ${report.edges.first.px} px, frame ${report.edges.last.k} ${report.edges.last.px} px ${JSON.stringify(report.edges.last.box)}`);
if (report.gif) console.log(`ship-flyby.gif: ${report.gif.w}x${report.gif.h}, ${report.gif.frames} frames @ ${report.gif.fps} fps, ${report.gif.kb} KB`);
console.log(problems.length ? `${problems.length} problems:\n${problems.join('\n')}` : 'all checks passed');
process.exit(problems.length ? 1 : 0);
