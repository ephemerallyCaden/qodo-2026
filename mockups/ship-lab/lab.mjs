// Regenerates every lab output in out/ with headless Chromium (SwiftShader). The page is served
// through Playwright request interception, so no socket is opened and nothing touches the network.
// Usage: node lab.mjs [contact] [crew] [teal] [gifs] [distinct] [report] [evidence]
//   (no names = all, then a copy to the evidence folder when it exists)
// Every tile is checked (checks.mjs tileProblems): BLK 36 only (plus the crew's own BLK 36 roles),
// no teal at rest, one connected ship with its crew aboard, a flame, not empty, not clipped, and every
// astronaut visible where it's gated. Each GIF's frame one cycle later must be pixel-identical to
// frame 0. Every pair of directions must stay apart in silhouette or colour at every distance. Any
// failure exits non-zero.
import { mkdir, readFile, writeFile, rm, cp, mkdtemp, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openLab, pngFrom } from './harness.mjs';
import { tileProblems, seamProblems, decode, CREW_MIN } from './checks.mjs';
import { VARIANTS } from './variants.js';
import { paletteHexes, tealThrust, BLK36 } from './palette.js';
import { SHIP_SCALE, CYCLE, CYCLES, SEATS_PER_DECK, MAX_DECKS } from './ship-spec.js';
import { rgbOklab, dist } from '../drone-lab/oklab.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');
const args = process.argv.slice(2);
const want = (n) => !args.length || args.includes(n);
const IDS = VARIANTS.map((v) => v.id);
const COUNTS = [1, 3, 8, 12, 20];
const GIF = { fps: 15, scale: 2, n: 3, view: 'hero' };
// Distinctness (as the drone lab's A4): a pair is apart when, in every view, its silhouettes overlap
// little enough OR its mean colours differ enough: max((1 - IoU) / 0.25, ΔE / 0.06) >= 1.
const SHAPE = 0.25, COLOUR = 0.06;
const SCALES = ['close', 'near', 'system'];
const VIEWS = ['front', '3/4'];
const LABEL = {
  close: 'close-up: the whole ship at 72% of the frame height',
  crew: 'crew close-up: the viewer\'s crew close-up density (2.7 units from the crew)',
  near: 'near: the drone lab\'s system distance, 5.98 (drones 19 px); farther if the ship would leave the frame',
  system: 'system: beside the star with three drones, 18.8 away, looking down 28° (drones 6 px)',
};
const problems = [];
const report = await readFile(path.join(OUT, 'report.json'), 'utf8').then(JSON.parse).catch(() => ({}));

const wrapText = (s, n) => s.split(' ').reduce((lines, w) => { const l = lines.at(-1); if (l && (l + ' ' + w).length <= n) lines[lines.length - 1] = `${l} ${w}`; else lines.push(w); return lines; }, []);
const sub = (v) => [v.name, ...wrapText(v.pitch, 30)];
const where = (c) => `${c.v} ${c.framing} n=${c.n} ${c.view}${c.teal ? ' teal' : ''}`;
const summary = (s) => ({
  cell: { v: s.cell.v, n: s.cell.n, framing: s.cell.framing, view: s.cell.view, teal: s.cell.teal },
  ship: s.shipBox && { w: s.shipBox.w, h: s.shipBox.h }, shipPx: s.shipPx, crewPx: s.crewPx, flamePx: s.flamePx, tealPx: s.tealPx,
  drawn: s.drawn, decks: s.plan.decks, extra: s.plan.extra, pieces: s.pieces, clipped: s.clipped,
  crew: s.crew.map((k) => ({ px: k.px, block: k.block })), crewMin: s.crew.length ? Math.min(...s.crew.map((k) => k.px)) : null,
  colours: s.colours.length,
});
function check(s, opts) {
  const p = tileProblems(s, where(s.cell), opts);
  problems.push(...p);
  return { ...summary(s), problems: p, gated: opts?.crewGate ?? (s.cell.view === 'front' && (s.cell.n <= 8 || s.cell.framing === 'near')) };
}

async function sheet(page, file, spec) {
  const res = await page.evaluate((sp) => window.lab.sheet(sp), spec);
  await writeFile(path.join(OUT, file), pngFrom(res.png));
  console.log(`${file}: ${res.stats.length} tiles`);
  return res.stats;
}

async function contact(page) {
  const cols = [['close', 'front'], ['close', '3/4'], ['crew', 'front'], ['near', 'front'], ['system', '3/4']];
  const stats = await sheet(page, 'ship-lab-contact.png', {
    title: 'Crew spaceship (#207): directions A-D, a crew of 3, at 320x180 (x2), BLK 36 only',
    cols: cols.map(([f, v]) => `${f} · ${v}`), padL: 260, scale: 2,
    rows: VARIANTS.map((v) => ({ label: v.id, sub: sub(v), cells: cols.map(([framing, view]) => ({ v: v.id, n: 3, framing, view })) })),
    note: `close-up 72% of frame · crew close-up 2.7 from the crew · near 5.98 (drone lab system distance) · system 18.8 beside the star, 28° down · ship scale ${SHIP_SCALE} (crew at 0.6 of the viewer's figure)`,
  });
  report.contact = stats.map((s) => check(s));
}

async function crew(page) {
  const stats = await sheet(page, 'ship-lab-crew.png', {
    title: `Crew counts: 1, 3 and 8 on one deck; 9-16 on a second deck (12); past 16, "+N" (20), close-up · front`,
    cols: COUNTS.map((n) => (n <= SEATS_PER_DECK ? `${n} aboard` : n <= SEATS_PER_DECK * MAX_DECKS ? `${n}: two decks` : `${n}: two decks + "+${n - SEATS_PER_DECK * MAX_DECKS}"`)), padL: 260, scale: 2,
    rows: VARIANTS.map((v) => ({ label: v.id, sub: sub(v), cells: COUNTS.map((n) => ({ v: v.id, n, framing: 'close', view: 'front' })) })),
    statsFor: [{ framing: 'near' }],
    note: 'Overflow rule: 8 seats per deck, at most 2 decks (16 drawn, the most recently active); the rest is a "+N" label outside the pixel pass. The +N badge here stands in for it.',
  });
  report.crew = stats.map((s) => ({ ...check(s), near: check(s.more[0]) }));
}

async function teal(page) {
  const stats = await sheet(page, 'ship-lab-teal.png', {
    title: 'Option, not a default: thrust in [OIII] teal, only if the ship\'s burn ever marks an event (close-up · 3/4)',
    cols: IDS.map((id) => `${id} · teal thrust`), padL: 170, scale: 2,
    rows: [{ label: 'teal', sub: ['not default', 'events only', '(art direction §4)'], cells: IDS.map((v) => ({ v, n: 3, framing: 'close', view: '3/4', teal: true })) }],
  });
  report.teal = stats.map((s) => check(s, { teal: true, crewGate: false }));
}

async function gifs(page) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'ship-lab-'));
  report.gifs = [];
  try {
    for (const v of VARIANTS) {
      const cell = { v: v.id, n: GIF.n, framing: 'close', view: GIF.view };
      const l = await page.evaluate(({ c, o }) => window.lab.loop(c, o), { c: cell, o: { fps: GIF.fps, scale: GIF.scale } });
      const dir = path.join(tmp, v.id);
      await mkdir(dir, { recursive: true });
      await Promise.all(l.pngs.map((u, k) => writeFile(path.join(dir, `${String(k).padStart(4, '0')}.png`), pngFrom(u))));
      const file = `ship-${v.id}-loop.gif`;
      // no dither: the GIF keeps the frames' own palette colours
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(GIF.fps), '-i', path.join(dir, '%04d.png'),
        '-vf', 'split[a][b];[a]palettegen=max_colors=256:reserve_transparent=0:stats_mode=full[p];[b][p]paletteuse=dither=none', '-loop', '0', path.join(OUT, file)]);
      const p = seamProblems(l, `${v.id} gif`);
      problems.push(...p);
      const size = (await stat(path.join(OUT, file))).size;
      report.gifs.push({ v: v.id, file, frames: l.frames, fps: GIF.fps, seconds: CYCLE, same: l.same, wrap: l.wrap, maxStep: l.maxStep, kb: Math.round(size / 1024), problems: p });
      console.log(`${file}: ${l.frames} frames, one cycle later ${l.same} px off, wrap ${l.wrap} vs largest step ${l.maxStep}, ${Math.round(size / 1024)} KB`);
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function distinct(page) {
  const space = 0x0d0b16;
  const lookOf = async (cell) => {
    const t = await page.evaluate((c) => window.lab.tile(c, { stats: false, mode: 'bare' }), cell);
    const rgba = decode(t.rgba);
    const mask = new Uint8Array(t.w * t.h);
    let n = 0, cx = 0, cy = 0, L = 0, A = 0, B = 0;
    for (let i = 0; i < t.w * t.h; i++) {
      const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
      if (((r << 16) | (g << 8) | b) === space) continue;
      mask[i] = 1;
      const x = i % t.w, y = (i - x) / t.w;
      const [l, a, bb] = rgbOklab(r, g, b);
      n++; cx += x; cy += y; L += l; A += a; B += bb;
    }
    if (!n) throw new Error(`distinct: ${where(cell)} rendered empty`);
    return { mask, n, w: t.w, h: t.h, cx: cx / n, cy: cy / n, mean: [L / n, A / n, B / n] };
  };
  const iouOf = (p, q) => {
    let best = 0;
    const dx0 = Math.round(p.cx - q.cx), dy0 = Math.round(p.cy - q.cy);
    for (let dy = dy0 - 2; dy <= dy0 + 2; dy++) for (let dx = dx0 - 2; dx <= dx0 + 2; dx++) {
      let inter = 0;
      for (let y = 0; y < q.h; y++) for (let x = 0; x < q.w; x++) {
        if (!q.mask[y * q.w + x]) continue;
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < p.w && Y < p.h && p.mask[Y * p.w + X]) inter++;
      }
      best = Math.max(best, inter / (p.n + q.n - inter));
    }
    return best;
  };
  report.distinct = { thresholds: { shape: SHAPE, colour: COLOUR }, scales: [] };
  for (const framing of SCALES) {
    const looks = {};
    for (const id of IDS) looks[id] = await Promise.all(VIEWS.map((view) => lookOf({ v: id, n: 3, framing, view })));
    const pairs = [];
    for (let i = 0; i < IDS.length; i++) for (let j = i + 1; j < IDS.length; j++) {
      const views = VIEWS.map((_, k) => { const iou = iouOf(looks[IDS[i]][k], looks[IDS[j]][k]), dE = dist(looks[IDS[i]][k].mean, looks[IDS[j]][k].mean); return { iou, dE, score: Math.max((1 - iou) / SHAPE, dE / COLOUR) }; });
      const worst = views.reduce((m, v) => (v.score < m.score ? v : m));
      pairs.push({ a: IDS[i], b: IDS[j], ...worst });
      if (worst.score < 1) problems.push(`distinct ${framing}: ${IDS[i]}-${IDS[j]} score ${worst.score.toFixed(2)} < 1`);
    }
    pairs.sort((p, q) => p.score - q.score);
    report.distinct.scales.push({ framing, pairs: pairs.map((p) => ({ ...p, iou: +p.iou.toFixed(3), dE: +p.dE.toFixed(3), score: +p.score.toFixed(2) })) });
    console.log(`distinct ${framing}: closest ${pairs[0].a}-${pairs[0].b} ${pairs[0].score.toFixed(2)} (IoU ${pairs[0].iou.toFixed(2)}, ΔE ${pairs[0].dE.toFixed(3)})`);
  }
}

const md = (r) => {
  const t = (rows) => rows.map((x) => `| ${x.join(' | ')} |`).join('\n');
  const tile = (list, v, framing, view) => list?.find((s) => s.cell.v === v && s.cell.framing === framing && s.cell.view === view);
  const lines = [
    '# Ship lab report',
    '',
    'Crew spaceship directions A-D for #207 (C2). Generated by `node lab.mjs`. All sizes are internal pixels at 320x180; tiles are shown at x2.',
    '',
    `Ship scale ${SHIP_SCALE}: the ship and its crew are drawn at ${SHIP_SCALE} of the viewer's crew figure, so an 8-seat ship is 1.4-3.5 units tall (the star's default radius is 1.6, a drone about 0.45). The product can scale ship and crew as one unit (C4).`,
    '',
    '## Directions',
    '',
    t([['', 'Direction', 'Crew seen as', 'Pitch'], ['---', '---', '---', '---'], ...VARIANTS.map((v) => [v.id, v.name, v.crewSeen, v.pitch])]),
    '',
    '## Sizes (a crew of 3)',
    '',
    'Ship width x height in px (hull and flame), and the least-visible astronaut\'s px.',
    '',
    t([['', ...['close front', 'close 3/4', 'crew close-up', 'near front', 'system 3/4']], ['---', '---', '---', '---', '---', '---'],
      ...IDS.map((id) => [id, ...[['close', 'front'], ['close', '3/4'], ['crew', 'front'], ['near', 'front'], ['system', '3/4']].map(([f, v]) => { const s = tile(r.contact, id, f, v); return s ? `${s.ship.w}x${s.ship.h}, crew min ${s.crewMin} px` : '-'; })])]),
    '',
    '## Colours',
    '',
    'Every ship colour is BLK 36 (the crew palette, art direction §4), used exactly; the crew is the asset viewer\'s astronaut, unchanged. No teal at rest.',
    '',
    t([['', 'shell', 'trim', 'ring', 'metal (the crew\'s gear)', 'glass (the crew\'s visor)', 'glint', 'flame', 'nav lights'], ['---', '---', '---', '---', '---', '---', '---', '---', '---'],
      ...VARIANTS.map((v) => [v.id, ...['shell', 'trim', 'ring', 'metal', 'glass', 'glint', 'flame', 'lights'].map((k) => (v.palette[k] ? v.palette[k].map((h) => `\`${h}\``).join(' ') : '(trim)'))])]),
    '',
    '## Crew counts (close-up front; near front in brackets)',
    '',
    'Each cell: decks, astronauts drawn, "+N" not drawn, and the least-visible astronaut\'s px.',
    '',
    t([['', ...COUNTS.map(String)], ['---', ...COUNTS.map(() => '---')],
      ...IDS.map((id) => [id, ...COUNTS.map((n) => { const s = r.crew?.find((x) => x.cell.v === id && x.cell.n === n); return s ? `${s.decks} deck${s.decks > 1 ? 's' : ''}, ${s.drawn} drawn${s.extra ? `, +${s.extra}` : ''}; min ${s.crewMin} px (${s.near.crewMin} px)` : '-'; })])]),
    '',
    `Overflow rule (proposed): 8 seats per deck. 1-8 ride on one deck; 9-16 on two (the ship grows a second deck: A stretches with 8 more portholes, B a second window band, C a second dome, D a second, smaller ring); past 16, the 16 most recently active ride and a "+N" label (bitmap font, outside the pixel pass) counts the rest. The cap keeps the draw cost at 1 hull + 16 astronauts.`,
    '',
    '## Motion (art direction §7)',
    '',
    `Every idle layer is locked to the crew's ${CYCLE} s cycle (the viewer's cycle(): 24 s loop / 2 surface turns), so it also loops on the viewer's 24 s and the product's 48 s: ship bob ${CYCLES.bob} per cycle, sway ${CYCLES.sway}, flame breath ${CYCLES.flame}, flame flicker ${CYCLES.flicker} hashed steps, ring-light chase ${CYCLES.chase} steps, beacon blink ${CYCLES.blink}; the crew's bob, sway and blink are the viewer's own. No Math.random, no clock: flicker and blinks are integer hashes of the step within the cycle.`,
    '',
    t([['GIF', 'frames', 'one cycle later', 'wrap (last -> first) vs largest step inside', 'size'], ['---', '---', '---', '---', '---'], ...(r.gifs ?? []).map((g) => [`\`${g.file}\``, `${g.frames} @ ${g.fps} fps`, `${g.same} px differ`, `${g.wrap} vs ${g.maxStep}`, `${g.kb} KB`])]),
    '',
    '## Telling the directions apart',
    '',
    'As the drone lab\'s A4: per pair, the worst of the front and 3/4 views of max((1 - IoU) / 0.25, ΔE / 0.06), where IoU is the bare ships\' silhouette overlap at the best alignment and ΔE the OKLab distance of their mean colours. Gated at >= 1.',
    '',
    t([['distance', 'closest pair', 'score', 'IoU', 'ΔE'], ['---', '---', '---', '---', '---'], ...(r.distinct?.scales ?? []).map((s) => [s.framing, `${s.pairs[0].a}-${s.pairs[0].b}`, s.pairs[0].score, s.pairs[0].iou, s.pairs[0].dE])]),
    '',
    '## Checks',
    '',
    'Every tile: only the ship\'s BLK 36 palette and the crew\'s BLK 36 roles on screen; no teal outside the option tiles; the hull is one connected piece and the crew is attached to it (aboard); a flame; not empty; not clipped (except the crew close-up, which crops to the crew); the right number drawn. Crew visibility per astronaut (each one\'s own pixels, from a render without it) is gated in the front view: ' + Object.entries(CREW_MIN).map(([k, m]) => `${k} ${m ? `>= ${m.px} px with a ${m.block}x${m.block} block` : 'reported only'}`).join(', ') + '. Two-deck ships are gated at the near distance (they are taller, so the whole-ship close-up shrinks their crew). Turned (3/4) views are reported, not gated: a window side turned away hides its crew, as it should.',
    '',
    r.problems?.length ? `**${r.problems.length} problems:**\n\n${r.problems.map((p) => `- ${p}`).join('\n')}` : `All checks passed: ${(r.contact?.length ?? 0) + (r.crew?.length ?? 0) * 2 + (r.teal?.length ?? 0)} tile checks, ${(r.gifs ?? []).length} loop seams, ${(r.distinct?.scales ?? []).length * 6} distinctness pairs.`,
    '',
  ];
  return lines.join('\n');
};

await mkdir(OUT, { recursive: true });
const browser = await launch();
try {
  const page = await openLab(browser);
  const viewerCycle = await page.evaluate(() => window.lab.viewerCycle);
  if (viewerCycle !== CYCLE) problems.push(`the viewer's crew cycle is ${viewerCycle} s, the ship's ${CYCLE} s`);
  if (want('contact')) await contact(page);
  if (want('crew')) await crew(page);
  if (want('teal')) await teal(page);
  if (want('gifs')) await gifs(page);
  if (want('distinct')) await distinct(page);
  if (page.blocked.length) problems.push(`requests off the allowlist: ${page.blocked.join(', ')}`);
} finally {
  await browser.close();
}
// The palettes themselves: BLK 36 only (the teal option aside).
for (const v of VARIANTS) for (const h of paletteHexes(v.palette)) if (!BLK36.includes(h)) problems.push(`${v.id}: palette colour ${h} is not BLK 36`);
void tealThrust;
report.problems = problems;
report.meta = { shipScale: SHIP_SCALE, cycle: CYCLE, cycles: CYCLES, labels: LABEL };
await writeFile(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);
await writeFile(path.join(OUT, 'report.md'), md(report));
console.log(problems.length ? `${problems.length} problems:\n${problems.join('\n')}` : 'all checks passed');

// The evidence folder (gitignored .archive in the main checkout), when it exists.
if (want('evidence')) {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const evidence = path.join(path.dirname(common), '.archive', 'docs', 'hackathon', 'evidence');
  const ok = await stat(evidence).then((s) => s.isDirectory()).catch(() => false);
  if (ok) {
    const dest = path.join(evidence, 'ship-lab');
    await mkdir(dest, { recursive: true });
    for (const f of await readdir(OUT)) await cp(path.join(OUT, f), path.join(dest, f));
    console.log('copied out/ to the evidence folder (.archive/docs/hackathon/evidence/ship-lab/)');
  }
}
process.exit(problems.length ? 1 : 0);
