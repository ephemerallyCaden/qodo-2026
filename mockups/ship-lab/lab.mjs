// Regenerates every lab output in out/ with headless Chromium (SwiftShader). The page is served
// through Playwright request interception, so no socket is opened and nothing touches the network.
// Usage: node lab.mjs [round=2] [contact] [crew] [captain] [teal] [gifs] [distinct] [evidence]
//   (no names = all, then a copy to the evidence folder when it exists; round=2: the R2 variations into out/round2/)
// Every tile is checked (checks.mjs tileProblems): BLK 36 only (plus the crew's own BLK 36 roles),
// no teal at rest, one connected ship with its crew aboard, a flame, not empty, not clipped, and every
// astronaut and the captain's cap visible where they're gated. Each GIF's frame one cycle later must be pixel-identical to
// frame 0. Every pair of directions must stay apart in silhouette or colour at every distance. Any
// failure exits non-zero.
import { mkdir, readFile, writeFile, rm, cp, mkdtemp, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openLab, pngFrom } from './harness.mjs';
import { tileProblems, seamProblems, decode, CREW_MIN, CAP_MIN } from './checks.mjs';
import { VARIANTS, R2_VARIANTS, R2B_VARIANTS, FINAL_VARIANTS } from './variants.js';
import { paletteHexes, BLK36, CAP_PALETTE } from './palette.js';
import { SHIP_SCALE, CYCLE, CYCLES, SEATS_PER_DECK, MAX_DECKS } from './ship-spec.js';
import { partBounds } from './ship-glsl.js';
import { specOf } from './variants.js';
import { rgbOklab, dist } from '../drone-lab/oklab.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const FINAL = args.includes('round=final'); // the pick: R2-4c with R2-4's red belly band (human, 2026-11-25)
const R2B = args.includes('round=2b') || FINAL; // round 2b: the pick R2-4, its windows alike and in a line (human, 2026-11-25)
const R2 = args.includes('round=2') || R2B; // round 2: A made shorter, fatter and rounder (human, 2026-11-25)
const names = args.filter((a) => !a.startsWith('round='));
const want = (n) => !names.length || names.includes(n);
const SET = FINAL ? FINAL_VARIANTS : R2B ? R2B_VARIANTS : R2 ? R2_VARIANTS : VARIANTS;
const ROUND_DIR = FINAL ? 'final' : R2B ? 'round2b' : R2 ? 'round2' : null;
const OUT = ROUND_DIR ? path.join(ROOT, 'out', ROUND_DIR) : path.join(ROOT, 'out');
const IDS = SET.map((v) => v.id);
const COUNTS = FINAL ? [1, 3, 8, 12, 16, 20] : R2 ? [1, 3, 8, 12] : [1, 3, 8, 12, 20];
const COUNT_SET = R2B ? SET.filter((v) => v.id !== 'R2-4') : R2 ? SET.filter((v) => v.id === 'R2-1' || v.id === 'R2-2') : SET; // round 2: the overflow on the two the human named; 2b: on the new ones
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
    title: FINAL ? 'Final: R2-4c with R2-4\'s red belly band (the human\'s pick), a crew of 3, 320x180 (x2), BLK 36 only' : R2B ? 'Round 2b: R2-4 (the pick) beside R2-4b (one column of identical portholes) and R2-4c (straight columns, an alternative), a crew of 3, 320x180 (x2), BLK 36 only' : R2 ? 'Round 2: the finned classic, shorter, fatter and rounder, with chunky window rims (R2-1..R2-5), a crew of 3, 320x180 (x2), BLK 36 only' : 'Crew spaceship (#207): directions A-D, a crew of 3, at 320x180 (x2), BLK 36 only',
    cols: cols.map(([f, v]) => `${f} · ${v}`), padL: 260, scale: 2,
    rows: SET.map((v) => ({ label: v.id, sub: sub(v), cells: cols.map(([framing, view]) => ({ v: v.id, n: 3, framing, view })) })),
    note: `close-up 72% of frame · crew close-up 2.7 from the crew · near 5.98 (drone lab system distance) · system 18.8 beside the star, 28° down · ship scale ${SHIP_SCALE} (crew at 0.6 of the viewer's figure)`,
  });
  report.contact = stats.map((s) => check(s));
}

async function crew(page) {
  const stats = await sheet(page, 'ship-lab-crew.png', {
    title: FINAL ? 'Final crew counts: 1, 3 and 8 on one deck; 9-16 on two (12, 16: three more rows of three); past 16, "+N" (20), close-up · front' : R2B ? 'Round 2b crew counts: 1, 3 and 8 on one deck; 12 on two (R2-4b: a second column beside the first; R2-4c: three more rows), close-up · front' : R2 ? 'Round 2 crew counts: 1, 3 and 8 on one deck; 12 on two (the approved overflow rule), close-up · front' : `Crew counts: 1, 3 and 8 on one deck; 9-16 on a second deck (12); past 16, "+N" (20), close-up · front`,
    cols: COUNTS.map((n) => (n <= SEATS_PER_DECK ? `${n} aboard` : n <= SEATS_PER_DECK * MAX_DECKS ? `${n}: two decks` : `${n}: two decks + "+${n - SEATS_PER_DECK * MAX_DECKS}"`)), padL: 260, scale: 2,
    rows: COUNT_SET.map((v) => ({ label: v.id, sub: sub(v), cells: COUNTS.map((n) => ({ v: v.id, n, framing: 'close', view: 'front' })) })),
    statsFor: [{ framing: 'near' }],
    note: 'Overflow rule: 8 seats per deck, at most 2 decks: the captain and the first 15 teammates by person id ride (never by activity); the rest is a "+N" label outside the pixel pass. The +N badge stands in for it.',
  });
  report.crew = stats.map((s) => ({ ...check(s), near: check(s.more[0]) }));
}

async function captain(page) {
  const cols = [['crew', 'front', 3, 'captain'], ['close', 'front', 8], ['near', 'front', 8], ['system', '3/4', 8]];
  const stats = await sheet(page, 'ship-lab-captain.png', {
    title: 'The captain (the repo owner, seat 0): the gold captain\'s cap in every ship, plus a seat of their own',
    cols: ['captain close-up · front', 'close-up · 8 aboard', 'near · 8 aboard', 'system · 8 aboard · 3/4'], padL: 260, scale: 2,
    rows: SET.map((v) => ({ label: v.id, sub: [v.name, ...wrapText(`Captain: ${v.captain}.`, 30)], cells: cols.map(([framing, view, n, focus]) => ({ v: v.id, n, framing, view, focus })) })),
    note: 'Crew order is by person id, never by activity: the owner is seat 0, the teammates fill the seats after in person-id order.',
  });
  report.captain = stats.map((s) => ({ ...check(s), cap: { px: s.cap.px, block: s.cap.block } }));
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
    for (const v of SET) {
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
      if (!R2 && worst.score < 1) problems.push(`distinct ${framing}: ${IDS[i]}-${IDS[j]} score ${worst.score.toFixed(2)} < 1`); // round 2's are variations of one brief: reported, not gated
    }
    pairs.sort((p, q) => p.score - q.score);
    report.distinct.scales.push({ framing, pairs: pairs.map((p) => ({ ...p, iou: +p.iou.toFixed(3), dE: +p.dE.toFixed(3), score: +p.score.toFixed(2) })) });
    console.log(`distinct ${framing}: closest ${pairs[0].a}-${pairs[0].b} ${pairs[0].score.toFixed(2)} (IoU ${pairs[0].iou.toFixed(2)}, ΔE ${pairs[0].dE.toFixed(3)})`);
  }
}

/** A ship's hull height (parts and domes, no flame) in world units, for a crew of n. */
const hullHeight = (id, n) => {
  const sp = specOf(id, n);
  const ys = [...sp.parts.map(partBounds).flatMap((b) => [b[0][1], b[1][1]]), ...sp.glass.flatMap((g) => [g.c[1] - g.r, g.c[1] + g.r])];
  return (Math.max(...ys) - Math.min(...ys)) * SHIP_SCALE;
};
const v2gold = () => CAP_PALETTE.gold.join('` `');
const md = (r) => {
  const t = (rows) => rows.map((x) => `| ${x.join(' | ')} |`).join('\n');
  const tile = (list, v, framing, view) => list?.find((s) => s.cell.v === v && s.cell.framing === framing && s.cell.view === view);
  const lines = [
    FINAL ? '# Ship lab report: final (R2-4c with the red band)' : R2B ? '# Ship lab report: round 2b' : R2 ? '# Ship lab report: round 2' : '# Ship lab report',
    '',
    FINAL ? 'The final pick for #207 (C2), human 2026-11-25: R2-4c (three straight columns of identical grey-rimmed portholes, the captain on top in the middle in the cap) with R2-4\'s red belly band restored exactly (red paint on the body from cy - 0.3 to top + 0.12). Generated by `node lab.mjs round=final`. All sizes are internal pixels at 320x180; tiles are shown at x2.' : R2B ? 'Round 2b for #207 (C2), on the pick R2-4. The human (2026-11-25): "I just don\'t like R2-4 the fact the windows are different colours, they should all be the same colour and also stack them vertically in a line instead of being stacked randomly." R2-4b does exactly that (one column, every porthole alike, the captain at the top, no belly band). One column of eight makes the round lander a tall capsule, so R2-4c is an alternative reading (three straight columns) that keeps R2-4\'s proportions. Generated by `node lab.mjs round=2b`. All sizes are internal pixels at 320x180; tiles are shown at x2.' : R2 ? 'Round 2 for #207 (C2), the human\'s brief (2026-11-25): "like the finned classic but shorter, fatter and rounder, and the window has a chunkier rim and is a bit chunkier in general", with one porthole each (R2-1), one big window (R2-2) and more variations (R2-3..R2-5). Generated by `node lab.mjs round=2`. All sizes are internal pixels at 320x180; tiles are shown at x2.' : 'Crew spaceship directions A-D for #207 (C2). Generated by `node lab.mjs`. All sizes are internal pixels at 320x180; tiles are shown at x2.',
    '',
    `Ship scale ${SHIP_SCALE}: the ship and its crew are drawn at ${SHIP_SCALE} of the viewer's crew figure (an astronaut aboard is ${(0.95 * SHIP_SCALE).toFixed(2)} units tall, still bigger than a drone, which is about half the viewer's astronaut). Hull heights for 8 aboard: ${IDS.map((id) => `${id} ${hullHeight(id, 8).toFixed(2)}`).join(', ')} units; with two decks: ${IDS.map((id) => `${id} ${hullHeight(id, 16).toFixed(2)}`).join(', ')}. The star's default radius is ${r.meta.starSize}. The product can scale ship and crew as one unit (C4).`,
    '',
    '## Directions',
    '',
    t([['', 'Direction', 'Crew seen as', 'Captain', 'Pitch'], ['---', '---', '---', '---', '---'], ...SET.map((v) => [v.id, v.name, v.crewSeen, v.captain, v.pitch])]),
    '',
    '## The captain',
    '',
    'The repo owner rides as the captain, in seat 0 of every ship. They wear a gold captain\'s cap (a flared gold crown over a navy hat band, a navy peak over the visor; BLK 36 ' + [...CAP_PALETTE.gold, ...CAP_PALETTE.shell].map((h) => `\`${h}\``).join(' ') + '), the same in every ship, and sit in a seat of their own. Crew order is by person id, never by activity.',
    '',
    'What the cap adds, in px (and its largest solid block), with 8 aboard (3 in the captain close-up):',
    '',
    t([['', 'captain close-up', 'close-up front', 'near front', 'system 3/4'], ['---', '---', '---', '---', '---'],
      ...IDS.map((id) => [id, ...['crew', 'close', 'near', 'system'].map((f) => { const s = r.captain?.find((x) => x.cell.v === id && x.cell.framing === f); return s ? `${s.cap.px} px (${s.cap.block}x${s.cap.block})` : '-'; })])]),
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
    t([['', 'shell', 'trim', 'ring', 'metal (the crew\'s gear; rims)', 'glass (the crew\'s visor)', 'window inside', 'glint', 'flame', 'nav lights'], ['---', '---', '---', '---', '---', '---', '---', '---', '---', '---'],
      ...SET.map((v) => [v.id, ...['shell', 'trim', 'ring', 'metal', 'glass', 'interior', 'glint', 'flame', 'lights'].map((k) => (v.palette[k] ? v.palette[k].map((h) => `\`${h}\``).join(' ') : k === 'interior' ? `\`${v.palette.glass[0]}\`` : '(trim)'))])]),
    ...(FINAL ? ['', 'Every porthole alike: radius 0.24, one grey rim (the crew\'s gear greys), the captain\'s too; R2-4\'s red belly band (trim red) under the captain\'s porthole; windows open onto `#36277f`.'] : []),
...(R2B && !FINAL ? ['', 'R2-4 (for comparison): grey rims, the captain\'s gold, a red belly band. R2-4b and R2-4c: every porthole alike, one size and one grey rim (the crew\'s gear greys), the captain\'s too, and no belly band; the captain reads by the cap and by the top porthole. All windows open onto `#36277f`.'] : R2 ? ['', 'Rims are the crew\'s gear greys, the captain\'s gold (`' + v2gold() + '`). Round 2\'s windows open onto `#36277f` (a lighter BLK 36 indigo) instead of the visor near-black, so the crew\'s dark visors read inside them.'] : []),
    '',
    '## Crew counts (close-up front; near front in brackets)',
    '',
    'Each cell: decks, astronauts drawn, "+N" not drawn, and the least-visible astronaut\'s px.',
    '',
    t([['', ...COUNTS.map(String)], ['---', ...COUNTS.map(() => '---')],
      ...COUNT_SET.map((v) => v.id).map((id) => [id, ...COUNTS.map((n) => { const s = r.crew?.find((x) => x.cell.v === id && x.cell.n === n); return s ? `${s.decks} deck${s.decks > 1 ? 's' : ''}, ${s.drawn} drawn${s.extra ? `, +${s.extra}` : ''}; min ${s.crewMin} px (${s.near.crewMin} px)` : '-'; })])]),
    '',
    FINAL ? 'Overflow rule (approved): 8 seats per deck, the captain\'s included. 1-8: the captain plus up to 7 teammates in rows of three below (one deck, three rows). 9-16: the capsule stretches by two more rows (1.32 units) and the teammates fill five rows of three. Past 16: the captain and the first 15 teammates by person id ride, and a "+N" label outside the pixel pass counts the rest (shown here as a badge).' : R2B ? 'Overflow rule (approved): 8 seats per deck, the captain\'s included; 9-16 on two decks, "+N" past 16. R2-4b keeps one column per deck: the second deck is a second column beside the first, on the same rows, so the ship gets no taller (both columns then sit 14° either side of the front). A single column of 16 would stretch the hull from 4.85 to about 7.7 units tall, so it is not proposed. R2-4c adds three more rows of three.' : R2 ? 'Overflow rule (approved): 8 seats per deck, the captain\'s included; 9-16 on two decks, "+N" past 16. In round 2 a second deck stretches the round body: R2-1, R2-4 and R2-5 grow three more honeycomb rows of portholes (3, 2, 3), R2-2 becomes a double bubble with a second big window below, R2-3 grows two rows of portholes under its glass nose.' : `Overflow rule (proposed): 8 seats per deck, the captain's included. 1-8 ride on one deck; 9-16 on two (the ship grows a second deck: A stretches with 8 more portholes, B a second window band, C a second dome, D a second, smaller ring); past 16, the captain and the first 15 teammates by person id ride (never by activity) and a "+N" label (bitmap font, outside the pixel pass) counts the rest. That keeps the draw cost at 1 hull + 16 astronauts + the cap.`,
    '',
    '## Motion (art direction §7)',
    '',
    `Every idle layer is locked to the crew's ${CYCLE} s cycle (the viewer's cycle(): 24 s loop / 2 surface turns), so it also loops on the viewer's 24 s and the product's 48 s: ship bob ${CYCLES.bob} per cycle, sway ${CYCLES.sway}, flame breath ${CYCLES.flame}, flame flicker ${CYCLES.flicker} hashed steps, ring-light chase ${CYCLES.chase} steps, beacon blink ${CYCLES.blink}; the crew's bob, sway and blink are the viewer's own. No Math.random, no clock: flicker and blinks are integer hashes of the step within the cycle.`,
    '',
    t([['GIF', 'frames', 'one cycle later', 'wrap (last -> first) vs largest step inside', 'size'], ['---', '---', '---', '---', '---'], ...(r.gifs ?? []).map((g) => [`\`${g.file}\``, `${g.frames} @ ${g.fps} fps`, `${g.same} px differ`, `${g.wrap} vs ${g.maxStep}`, `${g.kb} KB`])]),
    '',
    R2 ? '## How far apart the variations are' : '## Telling the directions apart',
    '',
    'As the drone lab\'s A4: per pair, the worst of the front and 3/4 views of max((1 - IoU) / 0.25, ΔE / 0.06), where IoU is the bare ships\' silhouette overlap at the best alignment and ΔE the OKLab distance of their mean colours. ' + (R2 ? 'Reported, not gated: round 2\'s are variations of one brief and share a silhouette on purpose.' : 'Gated at >= 1.'),
    '',
    t([['distance', 'closest pair', 'score', 'IoU', 'ΔE'], ['---', '---', '---', '---', '---'], ...(r.distinct?.scales ?? []).map((s) => [s.framing, `${s.pairs[0].a}-${s.pairs[0].b}`, s.pairs[0].score, s.pairs[0].iou, s.pairs[0].dE])]),
    '',
    '## Checks',
    '',
    'Every tile: only the ship\'s BLK 36 palette, the crew\'s BLK 36 roles and the captain\'s cap on screen; no teal outside the option tiles; the hull is one connected piece and the crew is attached to it (aboard); a flame; not empty; not clipped (except the crew close-up, which crops to the crew); the right number drawn. Crew visibility per astronaut (each one\'s own pixels, from a render without it) is gated in the front view: ' + Object.entries(CREW_MIN).map(([k, m]) => `${k} ${m ? `>= ${m.px} px with a ${m.block}x${m.block} block` : 'reported only'}`).join(', ') + '. The captain\'s cap (what it adds, from a render without it) is gated the same way: ' + Object.entries(CAP_MIN).map(([k, m]) => `${k} ${m ? `>= ${m.px} px with a ${m.block}x${m.block} block` : 'reported only'}`).join(', ') + '. Two-deck ships are gated at the near distance (they are taller, so the whole-ship close-up shrinks their crew). Turned (3/4) views are reported, not gated: a window side turned away hides its crew, as it should.',
    '',
    r.problems?.length ? `**${r.problems.length} problems:**\n\n${r.problems.map((p) => `- ${p}`).join('\n')}` : `All checks passed: ${(r.contact?.length ?? 0) + (r.crew?.length ?? 0) * 2 + (r.captain?.length ?? 0) + (r.teal?.length ?? 0)} tile checks, ${(r.gifs ?? []).length} loop seams${R2 ? '' : `, ${(r.distinct?.scales ?? []).length * 6} distinctness pairs`}.`,
    '',
  ];
  return lines.join('\n');
};

await mkdir(OUT, { recursive: true });
const browser = await launch();
try {
  const page = await openLab(browser);
  const viewerCycle = await page.evaluate(() => window.lab.viewerCycle);
  report.meta = { starSize: await page.evaluate(() => window.lab.starSize) };
  if (viewerCycle !== CYCLE) problems.push(`the viewer's crew cycle is ${viewerCycle} s, the ship's ${CYCLE} s`);
  if (want('contact')) await contact(page);
  if (want('crew')) await crew(page);
  if (want('captain')) await captain(page);
  if (want('teal') && !R2) await teal(page);
  if (want('gifs')) await gifs(page);
  if (want('distinct') && IDS.length > 1) await distinct(page);
  if (page.blocked.length) problems.push(`requests off the allowlist: ${page.blocked.join(', ')}`);
} finally {
  await browser.close();
}
// The palettes themselves: BLK 36 only (the teal option aside).
for (const v of SET) for (const h of paletteHexes(v.palette)) if (!BLK36.includes(h)) problems.push(`${v.id}: palette colour ${h} is not BLK 36`);
for (const h of paletteHexes(CAP_PALETTE)) if (!BLK36.includes(h)) problems.push(`the captain's cap: ${h} is not BLK 36`);
report.problems = problems;
report.meta = { ...report.meta, shipScale: SHIP_SCALE, cycle: CYCLE, cycles: CYCLES, labels: LABEL };
await writeFile(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);
await writeFile(path.join(OUT, 'report.md'), md(report));
console.log(problems.length ? `${problems.length} problems:\n${problems.join('\n')}` : 'all checks passed');

// The evidence folder (gitignored .archive in the main checkout), when it exists.
if (want('evidence')) {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const evidence = path.join(path.dirname(common), '.archive', 'docs', 'hackathon', 'evidence');
  const ok = await stat(evidence).then((s) => s.isDirectory()).catch(() => false);
  if (ok) {
    const dest = path.join(evidence, 'ship-lab', ...(ROUND_DIR ? [ROUND_DIR] : []));
    await mkdir(dest, { recursive: true });
    for (const f of await readdir(OUT, { withFileTypes: true })) if (f.isFile()) await cp(path.join(OUT, f.name), path.join(dest, f.name));
    console.log(`copied out/${ROUND_DIR ? `${ROUND_DIR}/` : ''} to the evidence folder (.archive/docs/hackathon/evidence/ship-lab/${ROUND_DIR ? `${ROUND_DIR}/` : ''})`);
  }
}
process.exit(problems.length ? 1 : 0);
