// Regenerates every lab output in out/ with headless Chromium (SwiftShader). The page is served
// through Playwright request interception (harness.mjs), so no socket is opened and nothing
// touches the network. Usage:
//   node lab.mjs [lineup] [clutter] [closeups] [loops] [sweep] [hulls] [crew] [compare] [measures]   (no names = all)
//   node lab.mjs report   rewrites measures.md from measures.json without rendering
// Every rendered tile is checked (checks.mjs); any failure exits non-zero. measures.md holds the
// numbers the README quotes (colour separation, ring and moon separation, band reading, violet).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openLab, pngFrom } from './harness.mjs';
import { tileProblems, seamProblems, decode, diffCount, findSweepable } from './checks.mjs';
import { VARIANTS, BANDS, SIZES, CLUTTER, AGES, PICK, sampleItems, variant as variantOf } from './variants.js';
import { CLASSES, CLASS_LABEL, KITS } from './kits.js';
import { AGE_LABEL, PAINT_AGE_LABEL, LOOP, plan, orbitNormal, repacks } from './layout.js';
import { HULLS, HULL_KEYS, RUST, PAINT, DULL, NAVY, GREY_DARK, OUTLINE, LIGHT, DRONE_TELLS } from './palette.js';
import { V2_PLANET_RAMPS } from '../asset-viewer/planet-ramps.js';
import { oklabInt, okDist, hexToInt, hkLightness, okChroma, nearest } from './colour.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');
const wanted = process.argv.slice(2);
const want = (n) => !wanted.length || wanted.includes(n);
const FPS = 15;
const problems = [];
const M = {}; // measures -> measures.json / measures.md
const log = (...a) => console.log(...a);
const pct = (x) => `${(100 * x).toFixed(1)}%`;

await mkdir(OUT, { recursive: true });
const lab = (fn, arg) => page.evaluate(fn, arg).then((r) => { if (page.errors.length) throw page.errors[0]; return r; });
const cellStats = (cell) => lab((c) => window.lab.renderCell(c), cell);
const framesOf = (cell, ts) => lab(([c, t]) => window.lab.frames(c, t), [cell, ts]);
const areasOf = (cell, ts) => lab(([c, t]) => window.lab.areas(c, t), [cell, ts]);
const compareOf = (cell) => lab((c) => window.lab.compare(c), cell);
// The close-up sheets: one per kit, rendered through the first direction that uses it.
const KIT_SHEETS = ['hardware', 'satellite', 'outlined', 'blocks', 'canister'].map((kit) => {
  const users = VARIANTS.filter((v) => v.kit === kit).map((v) => v.id);
  const age = KITS[kit].build('pr', 600).age;
  const ages = age ? PAINT_AGE_LABEL : AGE_LABEL;
  return { kit, v: users[0], used: users.join(', '), ages, age, file: kit === 'outlined' ? 'closeups-satellite-A3.png' : `closeups-${kit}.png` };
});

if (wanted.length === 1 && wanted[0] === 'report') { // rewrite measures.md from measures.json, no renders
  await writeFile(path.join(OUT, 'measures.md'), report(JSON.parse(await readFile(path.join(OUT, 'measures.json'), 'utf8'))));
  process.exit(0);
}
const browser = await launch();
const page = await openLab(browser);

try {
  // Controls: the checks must see an empty tile as empty and a planted one as not, or a blank render could pass.
  const empty = await cellStats({ biome: 'lush', seed: 7, v: 'A', n: 0, cam: 'lineup' });
  if (empty.debrisPx || empty.seen.length) throw new Error(`empty-output control saw ${empty.debrisPx} debris px`);
  const planted = await cellStats({ biome: 'lush', seed: 7, v: 'A', n: 3, cam: 'lineup' });
  if (!planted.debrisPx || !planted.seen.length) throw new Error('planted control saw no debris');

  /** Renders a sheet, writes it, and checks every tile against its cell's `expect`. */
  async function sheet(name, spec) {
    const t0 = Date.now();
    const { png, stats } = await lab((s) => window.lab.sheet(s), spec);
    await writeFile(path.join(OUT, name), pngFrom(png));
    for (const s of stats) problems.push(...tileProblems(s, `${name} row ${s.row} col ${s.col}`, spec.rows[s.row].cells[s.col].expect ?? {}));
    log(`${name}: ${stats.length} tiles, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    return stats;
  }

  // ------------------------------------------------------------ lineups (D3, D4)
  const lineupStats = {};
  if (want('lineup') || want('measures')) {
    for (const v of VARIANTS) {
      const rows = SIZES.map((size) => ({
        label: `planet size ${size}`,
        cells: BANDS.map((b) => ({ biome: b.biome, seed: b.seed, debrisSeed: 7, size, v: v.id, n: 8, cam: 'lineup', t: 3, expect: { pieces: 8 } })),
      }));
      lineupStats[v.id] = await sheet(`lineup-${v.id}.png`, {
        title: `${v.id} · ${v.name}: 8 stale items on every health band (worst to best), at two planet sizes`,
        note: v.blurb, colLabels: BANDS.map((b) => b.label), rows, scale: 2, labelW: 120,
      });
    }
  }

  // ------------------------------------------------------------ clutter strips (D5)
  if (want('clutter')) {
    for (const v of VARIANTS) {
      const rows = [['lush', 7], ['lava', 11]].map(([biome, seed]) => ({
        label: biome,
        cells: CLUTTER.map((n) => ({ biome, seed, debrisSeed: 7, v: v.id, n, cam: 'lineup', t: 3, caption: `${n} stale${n > v.cap ? ` (cap ${v.cap})` : ''}`, expect: { pieces: Math.min(n, v.cap) } })),
      }));
      await sheet(`clutter-${v.id}.png`, {
        title: `${v.id} · ${v.name}: 0, 1, 3, 8 and 24 stale items`, note: `Beyond the cap of ${v.cap} the rest is counted (+N, drawn outside the pixel pass). Biggest diffs are drawn first.`,
        colLabels: CLUTTER.map((n) => `${n}`), rows, scale: 2, labelW: 60,
      });
    }
  }

  // ------------------------------------------------------------ close-ups (D1, D2)
  const closeStats = {};
  if (want('closeups') || want('measures')) {
    for (const { kit, v, used, ages, file } of KIT_SHEETS) {
      const one = (cls, diff, age, k, zoom) => ({
        planet: false, moons: false, v, arrangement: 'display', items: [{ id: `${cls}-${k}`, cls, diff, age }],
        cam: zoom ? 'piece-zoom' : 'piece', crop: zoom ? [112, 42, 96, 96] : [136, 66, 48, 48], scale: zoom ? 3 : 5,
        expect: { pieces: 1, single: true },
      });
      const rows = CLASSES.map((cls) => ({
        label: CLASS_LABEL[cls].replace(', ', ',\n').replace('orphaned agent', 'orphaned agent\n'),
        cells: [
          ...AGES.map((age, k) => ({ ...one(cls, 600, age, k), caption: ages[k] })),
          ...[10, 300, 10000].map((diff, k) => ({ ...one(cls, diff, AGES[0], `s${k}`), caption: `${diff} lines` })),
          ...AGES.map((age, k) => ({ ...one(cls, 600, age, k, true), caption: `${ages[k]}, 3x closer` })),
        ],
      }));
      closeStats[kit] = await sheet(file, {
        title: `${kit} kit (directions ${used}): four classes x three ages at hero range (x5), sizes by diff, and 3x closer`,
        note: `Ages: ${ages[0]} < 60 days, ${ages[1]} < 180, ${ages[2]} after. 600 changed lines unless marked.`,
        colLabels: [...ages, 'small diff', 'mid', 'big diff', ...ages], rows, scale: 5, labelW: 130,
      });
    }
  }

  // ------------------------------------------------------------ loops (D7)
  const N = LOOP * FPS;
  const times = Array.from({ length: N }, (_, i) => i / FPS);
  async function grab(cell, ts) {
    const out = [];
    for (let i = 0; i < ts.length; i += 30) out.push(...(await framesOf(cell, ts.slice(i, i + 30))));
    return out;
  }
  async function gif(name, frames, scale, fps = FPS) {
    const { w, h } = frames[0];
    await new Promise((resolve, reject) => {
      const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-r', String(fps), '-i', '-',
        '-vf', `scale=iw*${scale}:ih*${scale}:flags=neighbor,split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=none`, '-loop', '0', path.join(OUT, name)]);
      ff.on('error', reject);
      ff.on('close', (code) => (code ? reject(new Error(`ffmpeg exited ${code} for ${name}`)) : resolve()));
      for (const f of frames) ff.stdin.write(Buffer.from(f.b64, 'base64'));
      ff.stdin.end();
    });
  }
  if (want('loops')) {
    M.loops = {};
    for (const v of VARIANTS) {
      const t0 = Date.now();
      const cell = { biome: 'lush', seed: 7, v: v.id, n: 8, cam: 'lineup' };
      const frames = await grab(cell, times);
      const [again] = await grab(cell, [LOOP]);
      const seam = seamProblems(frames.map(decode), decode(again), `loop-${v.id}.gif`);
      problems.push(...seam.problems);
      M.loops[v.id] = { wrap: seam.wrap, maxStep: seam.maxStep, oneLoopLater: seam.same };
      await gif(`loop-${v.id}.gif`, frames, 2);
      log(`loop-${v.id}.gif: ${N} frames, wrap ${seam.wrap} px vs max step ${seam.maxStep} px, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
  }

  // ------------------------------------------------------------ the sweep (D6)
  if (want('sweep')) {
    M.sweep = {};
    const items = sampleItems(5, { prefix: 'sw' });
    const strips = [];
    for (const v of VARIANTS) {
      // a piece that's in clear view (drawn over the scene, at least 24 px) at the start of its sweep
      const pick = await findSweepable(cellStats, { biome: 'lush', seed: 7, v: v.id, items, cam: 'lineup' });
      if (!pick) { problems.push(`sweep ${v.id}: no piece in clear view to sweep`); continue; }
      const base = { biome: 'lush', seed: 7, v: v.id, items, cam: 'lineup', sweeps: { [pick.id]: pick.start } };
      // teal during the flash, none after; after the end: no trace of the piece
      const during = await cellStats({ ...base, t: pick.start + 0.1 });
      if (!during.tealPx) problems.push(`sweep ${v.id}: no teal flash at +0.1 s`);
      const after = await cellStats({ ...base, t: pick.start + 1.3 });
      if (after.tealPx) problems.push(`sweep ${v.id}: ${after.tealPx} teal px after the sweep`);
      if (after.seen.includes(pick.index)) problems.push(`sweep ${v.id}: the swept piece still draws after the end`);
      // the next scan drops the item: the frame must match a plan without it (orbit arrangements keep the others still)
      const [fa] = await framesOf({ ...base, depth: false }, [pick.start + 1.3]);
      const [fb] = await framesOf({ ...base, depth: false, sweeps: {}, items: items.filter((x) => x.id !== pick.id) }, [pick.start + 1.3]);
      const moved = diffCount(decode(fa), decode(fb));
      const keeps = !repacks(v.arrangement);
      if (keeps && moved) problems.push(`sweep ${v.id}: ${moved} px differ from the scene without the item (a trace)`);
      M.sweep[v.id] = { piece: pick.id, start: pick.start, tealDuring: during.tealPx, tealAfter: after.tealPx, diffVsNextScan: moved, othersStay: keeps };
      const rel = [-0.2, 0.05, 0.15, 0.3, 0.5, 0.75, 1.0, 1.3];
      strips.push({ label: `${v.id} · ${v.name}`, cells: rel.map((r) => ({ ...base, t: pick.start + r, focus: { id: pick.id, size: [64, 64], t: pick.start }, caption: `${r >= 0 ? '+' : ''}${r.toFixed(2)} s`, check: false })) });
      if (v.id === PICK) {
        const st = Array.from({ length: Math.round(3.5 * FPS) }, (_, i) => pick.start - 1 + i / FPS);
        await gif('sweep.gif', await grab({ ...base }, st), 2);
        log(`sweep.gif: ${v.id}, piece ${pick.id} at ${pick.start} s`);
      }
    }
    await sheet('sweep-strip.png', { title: 'The sweep (D6): a one-shot on its own clock, outside the loop lock', note: 'Teal flash, crack, burst and shrink in 1.2 s, then nothing. Crops follow the piece from where its sweep starts.', colLabels: ['before', '+0.05', '+0.15', '+0.3', '+0.5', '+0.75', '+1.0', '+1.3 (gone)'], rows: strips, scale: 3, labelW: 130 });
  }

  // ------------------------------------------------------------ hull options and the violet check (D8)
  const hullStats = {};
  if (want('hulls') || want('measures')) {
    const rows = HULL_KEYS.map((hull) => ({ label: `hull: ${hull}`, cells: BANDS.map((b) => ({ biome: b.biome, seed: b.seed, debrisSeed: 7, v: 'A', n: 8, hull, cam: 'lineup', t: 3, expect: { pieces: 8 } })) }));
    const stats = await sheet('hulls.png', { title: 'Hull colour options on direction A: gear (D8 as written), violet (furthest from the planet ramps), violet-dark (violets on the dark steps only)', colLabels: BANDS.map((b) => b.label), rows, scale: 2, labelW: 120 });
    HULL_KEYS.forEach((hull, i) => { hullStats[hull] = stats.filter((s) => s.row === i); });
  }

  // ------------------------------------------------------------ crew for scale
  if (want('crew')) {
    const rows = [{ label: 'with the K crew', cells: VARIANTS.map((v) => ({ biome: 'lush', seed: 7, v: v.id, n: 8, crew: true, cam: 'depth', t: 3, caption: `${v.id} · ${v.name}`, expect: {} })) }];
    await sheet('crew-scale.png', { title: "Scale: each direction behind the viewer's crew close-up (the depth view)", colLabels: [], rows, scale: 2, labelW: 110 });
  }

  // ------------------------------------------------------------ before and after (the human's pick, refined twice)
  if (want('compare')) {
    const cols = [['lush', 7, 8], ['ocean', 42, 8], ['ice', 21, 8], ['toxic', 13, 8], ['lava', 11, 8], ['lush', 7, 24]];
    for (const [a, b, title] of [['A', 'A2', 'A (derelicts) and A2 (grey and red satellites)'], ['A2', 'A3', 'A2 (red paint) and A3 (grey, red outline and nav lights)']]) {
      const rows = [a, b].map((id) => ({
        label: `${id} · ${variantOf(id).name}`,
        cells: cols.map(([biome, seed, n]) => ({ biome, seed, debrisSeed: 7, v: id, n, cam: 'lineup', t: 3, expect: { pieces: Math.min(n, variantOf(id).cap) } })),
      }));
      await sheet(`${a.toLowerCase()}-vs-${b.toLowerCase()}.png`, { title: `Before and after: ${title}`, note: 'Same items, seed and time in both rows.', colLabels: cols.map(([bi, , n]) => `${bi}, ${n} items`), rows, scale: 2, labelW: 170 });
    }
  }

  // ------------------------------------------------------------ measures
  if (want('measures')) await measures({ lineupStats, closeStats, hullStats });
} finally {
  await browser.close();
}

async function measures({ lineupStats, closeStats, hullStats }) {
  const labsOf = (hexes) => hexes.map((h) => oklabInt(hexToInt(h)));
  const R = V2_PLANET_RAMPS;
  const DRONE = new Set(DRONE_TELLS.map(hexToInt));
  const VIOLET_BRIGHT = new Set(HULLS.violet.slice(2).map(hexToInt));
  const RED = new Set([...Object.values(OUTLINE), LIGHT].map(hexToInt));
  const cv = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) / m; };
  const RING = labsOf(R.ring), MOON = labsOf(R.moonBody);
  const WORSE = labsOf([...R.crust, ...R.glow, ...R.ash, ...R.sludge, ...R.toxic, ...R.fungus, ...R.spore, R.haze.toxic]);
  // every planet ramp family, for the per-family distances (A vs A2)
  const FAMILY = Object.fromEntries(Object.entries({
    ring: R.ring, moons: R.moonBody, cap: R.cap, ocean: [...R.ocean, ...R.water], land: R.land, ice: [...R.ice, ...R.crevasse], cloud: R.cloud,
    sand: [...R.sand, ...R.rock], lava: [...R.crust, ...R.glow, ...R.ash], toxic: [...R.sludge, ...R.toxic, ...R.fungus, ...R.spore, R.haze.toxic], drone: DRONE_TELLS,
  }).map(([k, v]) => [k, labsOf(v)]));
  const share = (hist, pred) => { let a = 0, t = 0; for (const [c, n] of hist) { t += n; if (pred(c)) a += n; } return t ? a / t : 0; };
  const near = (labs, d) => (c) => nearest(c, labs) < d;
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

  // M1: colour separation, per direction x band (lineups, size 1, gear hull) and per hull option.
  const colourRow = (s) => {
    const own = s.hist.planet.map(([c]) => oklabInt(c)); // the planet's own on-screen colours (the page drops space and stars)
    return {
      debrisPx: s.debrisPx,
      nearOwn03: share(s.hist.debris, near(own, 0.03)), nearOwn05: share(s.hist.debris, near(own, 0.05)),
      nearRing05: share(s.hist.debris, near(RING, 0.05)), nearMoon05: share(s.hist.debris, near(MOON, 0.05)),
      nearWorse05: share(s.hist.debris, near(WORSE, 0.05)), droneTells: share(s.hist.debris, (c) => DRONE.has(c)),
      family05: Object.fromEntries(Object.entries(FAMILY).map(([k, labs]) => [k, share(s.hist.debris, near(labs, 0.05))])),
      redShare: share(s.hist.debris, (c) => RED.has(c)), // A3: the outline and lights' share of debris pixels
      cap03: share(s.hist.debris, near(FAMILY.cap, 0.03)),
    };
  };
  M.colour = {};
  for (const [v, stats] of Object.entries(lineupStats)) M.colour[v] = Object.fromEntries(stats.filter((s) => s.row === 0).map((s) => [BANDS[s.col].biome, colourRow(s)]));
  M.hulls = {};
  for (const [hull, stats] of Object.entries(hullStats)) M.hulls[hull] = Object.fromEntries(stats.map((s) => [BANDS[s.col].biome, colourRow(s)]));

  // M2: does the health band still read? A nearest-colour band classifier over the disc, with
  // reference colours from each band's debris-free disc, at the busiest clutter (24 items).
  const refs = Object.fromEntries((lineupStats.A ?? []).filter((s) => s.row === 0).map((s) => [BANDS[s.col].biome, s.hist.discOff.map(([c]) => oklabInt(c))]));
  const bandOf = new Map();
  const classify = (hist) => {
    const votes = {};
    for (const [c, n] of hist) {
      if (!bandOf.has(c)) {
        const A = oklabInt(c);
        let best = null, bd = Infinity;
        for (const [b, labs] of Object.entries(refs)) for (const B of labs) { const d = okDist(A, B); if (d < bd) { bd = d; best = b; } }
        bandOf.set(c, best);
      }
      votes[bandOf.get(c)] = (votes[bandOf.get(c)] ?? 0) + n;
    }
    const total = Object.values(votes).reduce((s, x) => s + x, 0);
    const [win] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
    return { win, votes, total };
  };
  M.bands = {};
  M.cover = {};
  for (const v of VARIANTS) {
    M.bands[v.id] = {};
    for (const b of BANDS) {
      const s = await cellStats({ biome: b.biome, seed: b.seed, debrisSeed: 7, v: v.id, n: 24, cam: 'lineup', t: 3 });
      problems.push(...tileProblems(s, `measure ${v.id} ${b.biome} 24`, { pieces: v.cap }));
      const off = classify(s.hist.discOff), on = classify(s.hist.discWith);
      M.bands[v.id][b.biome] = { winOff: off.win, winOn: on.win, trueShareOff: (off.votes[b.biome] ?? 0) / off.total, trueShareOn: (on.votes[b.biome] ?? 0) / on.total, cover: s.disc.covered / s.disc.px };
      if (on.win !== b.biome) problems.push(`band reading: ${v.id} on ${b.biome} with 24 items reads as ${on.win}`);
    }
    // disc cover over the loop: lush, 24 items, 8 phases
    const covers = [];
    for (let k = 0; k < 8; k++) { const s = await cellStats({ biome: 'lush', seed: 7, v: v.id, n: 24, cam: 'lineup', t: k * 3 }); covers.push(s.disc.covered / s.disc.px); }
    M.cover[v.id] = { mean: covers.reduce((a, b) => a + b, 0) / covers.length, max: Math.max(...covers) };
    log(`measures: bands + cover ${v.id}`);
  }

  // M3: ring vs debris (silhouette, tones, plane, motion) and M4: moons vs debris (shape, tumble).
  M.ring = {};
  M.moon = {};
  const T12 = Array.from({ length: 12 }, (_, i) => i * 2);
  for (const v of VARIANTS) {
    const cmp = await compareOf({ biome: 'lush', seed: 7, v: v.id, n: 8, ring: 'thin', cam: 'lineup', t: 3 });
    const ringNormal = cmp.ringNormal; // the viewer's ring plane, read from its own tilt group
    const lay8 = plan(sampleItems(8), variantOf(v.id), { seed: 7, radius: 1 }); // the pieces in the renders below
    const lay = plan(sampleItems(24), variantOf(v.id), { seed: 7, radius: 1 }); // more orbits for the plane and direction stats
    const orbiting = lay.pieces.filter((p) => p.motion.kind === 'orbit');
    const angles = orbiting.map((p) => { const nrm = orbitNormal(p.motion); const d = Math.abs(nrm[0] * ringNormal[0] + nrm[1] * ringNormal[1] + nrm[2] * ringNormal[2]); return (Math.acos(Math.min(1, d)) * 180) / Math.PI; });
    const ar = await areasOf({ biome: 'lush', seed: 7, v: v.id, n: 8, cam: 'lineup' }, T12);
    const pieceCV = lay8.pieces.map((_, i) => ar.map((f) => f[i]?.area ?? 0)).filter((xs) => xs.every((x) => x > 0)).map(cv);
    M.ring[v.id] = {
      ringComps: cmp.ring.length, ringMedianArea: med(cmp.ring.map((c) => c.area)), ringMultiTone: cmp.ring.filter((c) => c.tones >= 2).length / Math.max(1, cmp.ring.length),
      debrisComps: cmp.debris.length, debrisMedianArea: med(cmp.debris.map((c) => c.area)), debrisMultiTone: cmp.debris.filter((c) => c.tones >= 2).length / Math.max(1, cmp.debris.length),
      planeAngleMedian: orbiting.length ? med(angles) : null, planeAngleMin: orbiting.length ? Math.min(...angles) : null,
      retrograde: orbiting.filter((p) => p.motion.dir < 0).length / Math.max(1, orbiting.length), arrangement: v.arrangement,
      tumbleAreaCV: med(pieceCV),
    };
    M.moon[v.id] = { moonRound: med(cmp.moons.map((c) => c.round)), moonTones: med(cmp.moons.map((c) => c.tones)), debrisRound: med(cmp.debris.map((c) => c.round)) };
  }
  // moons' own area over the loop (they don't tumble): the big moon at 24 times, in the frames where
  // it's clear of the planet (at least 80% of its largest area), so only perspective changes it
  const moonAreas = [];
  for (let t = 0; t < LOOP; t += 1) moonAreas.push((await compareOf({ biome: 'lush', seed: 7, cam: 'lineup', t })).moons.map((c) => c.area).sort((a, b) => b - a)[0] ?? 0);
  const clear = moonAreas.filter((a) => a >= 0.8 * Math.max(...moonAreas));
  M.moonAreaCV = cv(clear);
  M.moonClearFrames = clear.length;

  // M5: class from the silhouette alone (D1): each class tumbling at hero range, 12 orientations x 3 sizes;
  // leave-one-out nearest centroid on (log aspect, fill). Canisters share one silhouette by design.
  M.classes = {};
  // leave-one-out nearest centroid on z-scored features; features with no spread are dropped
  const loo = (samples, key) => {
    const dims = samples[0][key].length;
    const mean = Array.from({ length: dims }, (_, d) => samples.reduce((a, s) => a + s[key][d], 0) / samples.length);
    const sd = mean.map((m, d) => Math.sqrt(samples.reduce((a, s) => a + (s[key][d] - m) ** 2, 0) / samples.length));
    const z = (x) => x.map((v, d) => (sd[d] > 1e-9 ? (v - mean[d]) / sd[d] : 0));
    let right = 0;
    for (const s of samples) {
      const cents = CLASSES.map((c) => { const xs = samples.filter((o) => o !== s && o.cls === c).map((o) => z(o[key])); return [c, xs[0].map((_, d) => xs.reduce((a, x) => a + x[d], 0) / xs.length)]; });
      const zs = z(s[key]);
      const [best] = cents.sort((a, b) => Math.hypot(...a[1].map((v, d) => v - zs[d])) - Math.hypot(...b[1].map((v, d) => v - zs[d])))[0];
      if (best === s.cls) right++;
    }
    return right / samples.length;
  };
  for (const { kit, v } of KIT_SHEETS) {
    const samples = [];
    for (const cls of CLASSES) for (const diff of [30, 600, 8000]) {
      const fr = await areasOf({ planet: false, moons: false, v, arrangement: 'turntable', items: [{ id: `${cls}-${diff}`, cls, diff, age: AGES[0] }], cam: 'piece' }, T12);
      for (const f of fr) if (f[0]) samples.push({ cls, shape: [Math.log(f[0].aspect), f[0].fill], look: [Math.log(f[0].aspect), f[0].fill, ...Object.values(f[0].shares)] });
    }
    M.classes[kit] = {
      samples: samples.length, silhouetteAccuracy: loo(samples, 'shape'), withColourAccuracy: loo(samples, 'look'),
      aspect: Object.fromEntries(CLASSES.map((c) => [c, med(samples.filter((s) => s.cls === c).map((s) => Math.exp(s.shape[0])))])),
    };
  }

  // M6: age steps (D2) from the close-ups: rust share of debris px and fragment count per step.
  M.ages = {};
  const rustSet = new Set(RUST.map(hexToInt));
  const paintSet = new Set(PAINT.map(hexToInt)), dullSet = new Set(DULL.map(hexToInt)), navySet = new Set(NAVY.map(hexToInt));
  const brightSet = new Set([hexToInt(OUTLINE.bright)]), dimSet = new Set([hexToInt(OUTLINE.dim)]), lightSet = new Set([hexToInt(LIGHT)]), greySet = new Set(GREY_DARK.map(hexToInt));
  for (const [kit, stats] of Object.entries(closeStats)) {
    M.ages[kit] = [0, 1, 2].map((k) => {
      const tiles = stats.filter((s) => s.col === k);
      const mean = (set) => tiles.reduce((a, s) => a + share(s.hist.debris, (c) => set.has(c)), 0) / tiles.length;
      return {
        step: KIT_SHEETS.find((x) => x.kit === kit).ages[k], rust: mean(rustSet), paint: mean(paintSet), dull: mean(dullSet), navy: mean(navySet),
        outlineBright: mean(brightSet), outlineDim: mean(dimSet), light: mean(lightSet), dark: mean(greySet), components: med(tiles.map((s) => s.pieces[0]?.components ?? 0)),
      };
    });
  }

  // M7: the violet check: at 24 items on lush and ocean, the share of debris px at violet's two
  // bright steps, and Helmholtz-Kohlrausch lightness against the planet disc.
  M.violet = {};
  for (const hull of HULL_KEYS) {
    M.violet[hull] = {};
    for (const [biome, seed] of [['lush', 7], ['ocean', 42]]) {
      const s = await cellStats({ biome, seed, v: 'A', n: 24, hull, cam: 'lineup', t: 3 });
      const bright = share(s.hist.debris, (c) => VIOLET_BRIGHT.has(c));
      const discHK = s.hist.discOff.flatMap(([c, n]) => Array(Math.min(n, 400)).fill(hkLightness(c)));
      const p75 = [...discHK].sort((a, b) => a - b)[Math.floor(discHK.length * 0.75)];
      M.violet[hull][biome] = {
        brightShare: bright, debrisHKMedian: med(s.hist.debris.flatMap(([c, n]) => Array(n).fill(hkLightness(c)))), discHKMedian: med(discHK),
        aboveDiscP75: share(s.hist.debris, (c) => hkLightness(c) > p75), debrisChroma: s.hist.debris.reduce((a, [c, n]) => a + okChroma(c) * n, 0) / Math.max(1, s.debrisPx),
        discChroma: s.hist.discOff.reduce((a, [c, n]) => a + okChroma(c) * n, 0) / Math.max(1, s.disc.px),
      };
    }
  }

  await writeFile(path.join(OUT, 'measures.json'), JSON.stringify(M, null, 1));
  await writeFile(path.join(OUT, 'measures.md'), report(M));
  log('measures.json, measures.md');
}

function report(M) {
  const L = [];
  const bands = BANDS;
  const f2 = (x) => (x == null || Number.isNaN(x) ? '—' : x.toFixed(2));
  L.push('# Debris lab measures', '', 'Generated by `node lab.mjs measures` (depth fade off, so every pixel is an exact palette colour). Distances are OKLab; 0.02 is about one just-noticeable difference.', '');
  L.push('## Colour separation (lineups: 8 items, planet size 1, each direction\'s own hull)', '', 'Share of debris pixels within the distance of: the planet\'s own on-screen colours (0.03 / 0.05), the ring ramp, the warm moons, the worse bands (lava and toxic), and the drone tells (white trim, lit shell, teal).', '');
  L.push(`| direction | band | debris px | own < .03 | own < .05 | ring < .05 | moon < .05 | lava/toxic < .05 | drone tells |`, '|---|---|---|---|---|---|---|---|---|');
  for (const [v, rows] of Object.entries(M.colour ?? {})) for (const [b, r] of Object.entries(rows)) L.push(`| ${v} | ${b} | ${r.debrisPx} | ${pct(r.nearOwn03)} | ${pct(r.nearOwn05)} | ${pct(r.nearRing05)} | ${pct(r.nearMoon05)} | ${pct(r.nearWorse05)} | ${pct(r.droneTells)} |`);
  L.push('', '## Every planet ramp (8 items, the worst band per family)', '', 'Share of debris pixels within 0.05 of each planet ramp family (and the drone tells), taking the band where it is highest; the polar cap also at 0.03.', '');
  const fams = Object.keys(Object.values(Object.values(M.colour ?? {})[0] ?? {})[0]?.family05 ?? {});
  L.push(`| direction | ${fams.join(' | ')} | cap < .03 | red outline + lights |`, `|---|${fams.map(() => '---').join('|')}|---|---|`);
  for (const [v, rows] of Object.entries(M.colour ?? {})) {
    const worst = (f) => Math.max(...Object.values(rows).map((r) => f(r) ?? 0));
    L.push(`| ${v} | ${fams.map((k) => pct(worst((r) => r.family05[k]))).join(' | ')} | ${pct(worst((r) => r.cap03))} | ${pct(worst((r) => r.redShare))} |`);
  }
  L.push('', '## Hull options (direction A, 8 items)', '', `| hull | band | own < .03 | own < .05 | ring < .05 | lava/toxic < .05 |`, '|---|---|---|---|---|---|');
  for (const [h, rows] of Object.entries(M.hulls ?? {})) for (const [b, r] of Object.entries(rows)) L.push(`| ${h} | ${b} | ${pct(r.nearOwn03)} | ${pct(r.nearOwn05)} | ${pct(r.nearRing05)} | ${pct(r.nearWorse05)} |`);
  L.push('', '## Violet check (direction A, 24 items)', '', 'Bright-step share: debris pixels at #643499 or #8c51cc. L** is Helmholtz-Kohlrausch lightness (Fairchild and Pirrotta 1991): saturated colours look brighter than their L*. "Above disc p75": debris pixels that look brighter than three quarters of the planet\'s disc.', '');
  L.push('| hull | planet | bright-step share | debris L** median | disc L** median | above disc p75 | debris chroma | disc chroma |', '|---|---|---|---|---|---|---|---|');
  for (const [h, rows] of Object.entries(M.violet ?? {})) for (const [b, r] of Object.entries(rows)) L.push(`| ${h} | ${b} | ${pct(r.brightShare)} | ${r.debrisHKMedian.toFixed(1)} | ${r.discHKMedian.toFixed(1)} | ${pct(r.aboveDiscP75)} | ${r.debrisChroma.toFixed(3)} | ${r.discChroma.toFixed(3)} |`);
  L.push('', '## Health band at 24 items', '', 'A nearest-colour classifier votes every disc pixel to the band whose debris-free disc has the nearest colour. "Reads as" is the winning band with debris on; "true share" is the vote share of the planet\'s real band without and with debris; "cover" is the share of disc pixels debris covers.', '');
  L.push(`| direction | ${bands.map((b) => b.biome).join(' | ')} |`, `|---|${bands.map(() => '---').join('|')}|`);
  for (const [v, rows] of Object.entries(M.bands ?? {})) L.push(`| ${v} | ${bands.map((b) => { const r = rows[b.biome]; return `${r.winOn === b.biome ? 'ok' : `reads ${r.winOn}`}, ${pct(r.trueShareOff)} → ${pct(r.trueShareOn)}, cover ${pct(r.cover)}`; }).join(' | ')} |`);
  L.push('', 'Disc cover over the loop (lush, 24 items, 8 phases):', '', '| direction | mean | max |', '|---|---|---|');
  for (const [v, r] of Object.entries(M.cover ?? {})) L.push(`| ${v} | ${pct(r.mean)} | ${pct(r.max)} |`);
  L.push('', '## Not a ring', '', 'Lush with the thin ring and 8 items. Components are 8-connected pixel groups. Plane angle and retrograde share: over the 12 orbits of a 24-item plan, against the ring plane. Tumble: the median per-piece coefficient of variation of screen area over 12 frames, drawn alone (moons, which don\'t tumble, are given below).', '');
  L.push('| direction | ring groups | ring median px | ring multi-tone | debris groups | debris median px | debris multi-tone | plane angle median (min) | retrograde | tumble area CV |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const [v, r] of Object.entries(M.ring ?? {})) L.push(`| ${v} | ${r.ringComps} | ${r.ringMedianArea} | ${pct(r.ringMultiTone)} | ${r.debrisComps} | ${r.debrisMedianArea} | ${pct(r.debrisMultiTone)} | ${r.planeAngleMedian == null ? `— (${r.arrangement})` : `${r.planeAngleMedian.toFixed(0)}° (${r.planeAngleMin.toFixed(0)}°)`} | ${pct(r.retrograde)} | ${f2(r.tumbleAreaCV)} |`);
  L.push('', `The big moon's area CV, over the ${M.moonClearFrames} of 24 frames where it's clear of the planet: ${f2(M.moonAreaCV)}.`, '', '## Not a moon', '', 'Roundness: pixel area over the area of the circle through the farthest pixel (1 = a disc).', '', '| direction | moon roundness | moon tones | debris roundness |', '|---|---|---|---|');
  for (const [v, r] of Object.entries(M.moon ?? {})) L.push(`| ${v} | ${f2(r.moonRound)} | ${r.moonTones} | ${f2(r.debrisRound)} |`);
  L.push('', '## Class from the silhouette alone (D1)', '', 'Each class tumbling alone at hero range, 12 orientations x 3 diff sizes, leave-one-out nearest centroid on principal-axis aspect and fill. Chance is 25%. Canisters (D) share one silhouette by design; their class is the paint colour.', '');
  L.push('"With colour" adds each piece\'s share of red paint, of the darkest navy (solar cells) and of each class paint (D) to the same classifier.', '');
  L.push('| kit | samples | silhouette alone | with colour | median aspect: PR / branch / merged / agent |', '|---|---|---|---|---|');
  for (const [k, r] of Object.entries(M.classes ?? {})) L.push(`| ${k} (${KIT_SHEETS.find((x) => x.kit === k).used}) | ${r.samples} | ${pct(r.silhouetteAccuracy)} | ${pct(r.withColourAccuracy)} | ${CLASSES.map((c) => f2(r.aspect[c])).join(' / ')} |`);
  L.push('', '## Age steps (D2, close-ups)', '', 'Per step (columns): for the rust kits the share of debris pixels in rust; for A2 the shares in bright paint, dull paint and navy (scorch plus solar cells); for A3 the shares in bright outline, dim outline, lit nav lights (close-ups hold the lights steady) and dark grey (scorch plus cells). Then the median number of separate pieces. (Some ramps share colours, so each kit shows only its own cue.)', '');
  L.push('| kit | step 1 | step 2 | step 3 |', '|---|---|---|---|');
  for (const [k, rows] of Object.entries(M.ages ?? {})) {
    const age = KITS[k].build('pr', 600).age;
    const cue = (r) => (age === 'paint' ? `bright paint ${pct(r.paint)}, dull ${pct(r.dull)}, navy ${pct(r.navy)}`
      : age === 'outline' ? `bright outline ${pct(r.outlineBright)}, dim outline ${pct(r.outlineDim)}, lights ${pct(r.light)}, dark grey ${pct(r.dark)}` : `rust ${pct(r.rust)}`);
    L.push(`| ${k} | ${rows.map((r) => `${r.step}: ${cue(r)}; ${r.components} piece${r.components > 1 ? 's' : ''}`).join(' | ')} |`);
  }
  if (M.loops) {
    L.push('', '## Loops (24 s, 15 fps)', '', '| direction | one loop later vs frame 0 | wrap diff | largest step |', '|---|---|---|---|');
    for (const [v, r] of Object.entries(M.loops)) L.push(`| ${v} | ${r.oneLoopLater} px | ${r.wrap} px | ${r.maxStep} px |`);
  }
  if (M.sweep) {
    L.push('', '## Sweep', '', '| direction | piece | teal px during | teal px after | px vs the next scan |', '|---|---|---|---|---|');
    for (const [v, r] of Object.entries(M.sweep)) L.push(`| ${v} | ${r.piece} | ${r.tealDuring} | ${r.tealAfter} | ${r.diffVsNextScan}${r.othersStay ? '' : ' (heaps and the wake re-pack)'} |`);
  }
  return `${L.join('\n')}\n`;
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
log('all checks passed');
