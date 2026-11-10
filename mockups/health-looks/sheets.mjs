// H6: the lineup sheets a person can check, laid out as { w, h, bg, blits, texts } for
// harness.sheetPng. Tiles are internal-resolution crops upscaled by a whole factor (nearest
// neighbour, as the stage does), so every pixel is a rendered pixel. Pure.
import { LOOKS, BANDS, BASE, FULL, fadeAt, geometryFor } from './lab.mjs';
import { VISIONS, simulateImage, lookVector, dist, centroid } from './metrics.mjs';
import { GLANCE, seedFlag } from './analyse.mjs';

const TILE = 288; // every tile's on-sheet size
const CROPS = [24, 32, 36, 48, 72, 96, 144]; // each divides TILE
const INK = '#fff8ff', DIM = '#9a90e0', BAD = '#ff761a', SPACE = '#0d0b16'; // star white, star mid, lava glow, space
const LABEL_W = 300, HEAD = 76, LINE = 20, PAD = 12;
const ROW_H = TILE + 2 * LINE + 2 * PAD;

/** The crop (internal px) that holds a condition's disc (and moon orbits with overlays). */
export const cropSize = (cond, geom = geometryFor(cond)) => CROPS.find((c) => c >= 2 * (cond.overlays ? 1.9 : 1.15) * geom.r) ?? CROPS[CROPS.length - 1];
/** The baseline and the full-fade conditions (the CVD and seed sheets), in run order. */
const picked = (conds) => conds.filter((c) => c.key === BASE || c.key === FULL);

/** Each look's typical seed: the one nearest its look's centroid at the baseline, normal vision. */
export function typicalSeeds(records) {
  return Object.fromEntries(LOOKS.map(({ look }) => {
    const rs = records.filter((r) => r.cond === BASE && r.vision === 'normal' && r.look === look);
    const c = centroid(rs.map(lookVector));
    return [look, [...rs].sort((p, q) => dist(lookVector(p), c) - dist(lookVector(q), c))[0].seed];
  }));
}

/**
 * A grid of the looks (columns, bands in order, the healthy looks together) by rows of
 * { cond, vision, title, lines }: each tile the look's typical seed, seen with that vision, its
 * statistics and the band it measures as underneath. trial (optional, a look being judged; not
 * measured here): { title, band, after, cropKey(condKey), lines(condKey) }, a column right after
 * look `after`, its crop from `crops` and its two text lines given (the trial's measured numbers).
 */
function lookGrid(results, crops, rows, footer, trial = null) {
  const seeds = typicalSeeds(results.records);
  const cols = LOOKS.flatMap((l) => [l, ...(trial?.after === l.look ? [{ look: trial.title, band: trial.band, trial }] : [])]);
  const w = LABEL_W + cols.length * (TILE + PAD), h = HEAD + rows.length * ROW_H + 40;
  const blits = [], texts = [];
  // band names over their looks (healthy spans three), then the look names
  let bx = LABEL_W;
  for (const band of BANDS) {
    const n = cols.filter((l) => l.band === band).length;
    const k = cols.filter((l) => l.band === band && !l.trial).length;
    texts.push({ text: k > 1 ? `${band} (${k} looks, one band)` : n > k ? `${band} (shipped, trial)` : band, x: bx + PAD, y: PAD, size: 22, color: INK });
    bx += n * (TILE + PAD);
  }
  cols.forEach((l, i) => texts.push({ text: l.look, x: LABEL_W + i * (TILE + PAD) + PAD, y: PAD + 30, size: 18, color: l.trial ? INK : DIM }));
  rows.forEach(({ cond, vision, title, lines }, ri) => {
    const y = HEAD + ri * ROW_H, c = cropSize(cond);
    texts.push({ text: title, x: PAD, y: y + PAD, size: 22, color: INK });
    [...lines, `crop ${c} px ×${TILE / c}`].forEach((t, i) => texts.push({ text: t, x: PAD, y: y + PAD + 34 + i * LINE, size: 15, color: DIM }));
    cols.forEach(({ look, trial: tr }, ci) => {
      const x = LABEL_W + ci * (TILE + PAD);
      if (tr) {
        const crop = crops.get(tr.cropKey(cond.key));
        blits.push({ ...crop, data: simulateImage(vision, crop.data), x, y, scale: TILE / c });
        tr.lines(cond.key).forEach((text, i) => texts.push({ text, x: x + 4, y: y + TILE + 6 + i * LINE, size: 15, color: i ? INK : DIM }));
        return;
      }
      const seed = seeds[look], crop = crops.get(`${cond.key}|${look}|${seed}`);
      blits.push({ ...crop, data: simulateImage(vision, crop.data), x, y, scale: TILE / c });
      const r = results.records.find((q) => q.cond === cond.key && q.vision === vision && q.look === look && q.seed === seed);
      const s = results.cell(cond.key, vision).h5.seeds.find((q) => q.look === look && q.seed === seed);
      const flag = seedFlag(s);
      // kept under ~30 characters, the width of a tile
      const verdict = !flag ? `seed ${seed}: reads ${s.read}` : flag.kind === 'misread' ? `seed ${seed} ✗ reads ${flag.look}` : `seed ${seed} ✗ ${flag.d.toFixed(3)} from ${flag.look}`;
      texts.push({ text: `L ${r.L.toFixed(2)} warm ${r.warm >= 0 ? '+' : ''}${r.warm.toFixed(3)} glow ${r.glow.toFixed(2)}`, x: x + 4, y: y + TILE + 6, size: 15, color: DIM });
      texts.push({ text: verdict, x: x + 4, y: y + TILE + 6 + LINE, size: 15, color: flag ? BAD : INK });
    });
  });
  texts.push({ text: footer, x: PAD, y: h - 30, size: 15, color: DIM });
  return { w, h, bg: SPACE, blits, texts };
}

/** Bands in order, the healthy looks together, one row per condition (hero, mid, far, full, ...); trial: see lookGrid. */
export function lineupSheet(results, crops, conds, trial = null) {
  const rows = conds.map((cond) => ({ cond, vision: 'normal', title: cond.key, lines: [cond.note, `disc ${(2 * geometryFor(cond).r).toFixed(0)} px · fade ${fadeAt(cond.d).toFixed(2)}`, `size ${cond.size} · d ${cond.d.toFixed(1)}`] }));
  const footer = `typical seed per look (nearest its centroid at ${BASE}); text: mean L, warmth, glow share, and the band its measurements read as (leave-one-out nearest look; ✗ = another band, or within ${GLANCE} of one). Every number: REPORT.md`;
  return lookGrid(results, crops, rows, trial ? `${footer}. ${trial.footer}` : footer, trial);
}

/** The lineup under each vision (Machado 2009 simulations) at the baseline and full fade. */
export function cvdSheet(results, crops, conds) {
  const rows = picked(conds).flatMap((cond) => VISIONS.map((vision) => ({ cond, vision, title: vision, lines: [cond.key] })));
  return lookGrid(results, crops, rows, 'simulated with Machado, Oliveira & Fernandes (2009), severity 1.0, in linear RGB');
}

/** Every seed of every look (H5), at the baseline and at full fade, misreads marked. */
export function seedsSheet(results, crops, seeds, conds) {
  const picks = picked(conds);
  const S = 96, LW = 140, rowH = S + LINE + 8, blockH = 40 + LOOKS.length * rowH;
  const w = LW + seeds.length * (S + 4), h = picks.length * blockH + 40;
  const blits = [], texts = [];
  picks.forEach((cond, bi) => {
    const y0 = bi * blockH, c = cropSize(cond), h5 = results.cell(cond.key, 'normal').h5;
    texts.push({ text: `${cond.key}: crop ${c} px ×${S / c}`, x: PAD, y: y0 + PAD, size: 18, color: INK });
    LOOKS.forEach(({ look }, ri) => {
      const y = y0 + 40 + ri * rowH;
      texts.push({ text: look, x: PAD, y: y + S / 2 - 8, size: 16, color: INK });
      seeds.forEach((seed, si) => {
        const x = LW + si * (S + 4), flag = seedFlag(h5.seeds.find((q) => q.look === look && q.seed === seed));
        blits.push({ ...crops.get(`${cond.key}|${look}|${seed}`), x, y, scale: S / c });
        texts.push({ text: !flag ? `${seed}` : `${seed}✗${flag.kind === 'near' ? '≈' : ''}${flag.look}`, x: x + 2, y: y + S + 2, size: 13, color: flag ? BAD : DIM });
      });
    });
  });
  texts.push({ text: `✗look: the seed measures nearest that look, of another band; ✗≈look: within a glance (${GLANCE}) of it (H5)`, x: PAD, y: h - 28, size: 15, color: DIM });
  return { w, h, bg: SPACE, blits, texts };
}
