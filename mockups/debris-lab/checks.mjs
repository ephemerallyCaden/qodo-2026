// The per-tile checks, shared by lab.mjs and the tests. A tile's stats come from lab.js tileStats():
// four extra renders with the depth fade off (debris on, debris off, ids in the scene, ids alone).
// Every check fails on empty output: a tile that should hold debris and shows none is a problem.
import { intToHex } from './colour.js';

/**
 * Problems with one tile. opts:
 *   pieces  expected count of planned pieces (null: don't check)
 *   event   teal is allowed (a sweep or a selection)
 *   single  a close-up of one piece: exactly one piece seen; intact/rusted one connected piece,
 *           broken at least two
 */
export function tileProblems(s, where, { pieces = null, event = false, single = false } = {}) {
  const out = [];
  const want = pieces ?? s.shown;
  if (want > 0 && s.debrisPx === 0 && s.seen.length === 0) out.push(`${where}: empty: no debris drawn`);
  if (want === 0 && (s.debrisPx > 0 || s.seen.length > 0)) out.push(`${where}: ${s.debrisPx} debris px with no pieces planned`);
  if (pieces != null && s.shown !== pieces) out.push(`${where}: ${s.shown} pieces planned, wanted ${pieces}`);
  if (s.stray) out.push(`${where}: ${s.stray} debris px outside the debris palette ${JSON.stringify(s.strays.map(([c, n]) => [intToHex(c), n]))}`);
  if (!event && s.tealPx) out.push(`${where}: ${s.tealPx} teal px with no event`);
  if (s.clipped) out.push(`${where}: debris touches the tile edge (${s.clipped} px)`);
  if (s.missing.length) out.push(`${where}: pieces ${s.missing.join(', ')} should be visible but drew nothing`);
  if (s.extra.length) out.push(`${where}: unplanned piece ids ${s.extra.join(', ')}`);
  if (s.leakPx) out.push(`${where}: ${s.leakPx} px of pieces that should be hidden behind the planet`);
  if (single) {
    if (s.seen.length !== 1) out.push(`${where}: close-up shows ${s.seen.length} pieces, wanted 1`);
    for (const p of s.pieces) {
      if (p.step < 2 && p.components !== 1) out.push(`${where}: ${p.cls} (age step ${p.step}) in ${p.components} pieces, wanted one connected piece`);
      if (p.step === 2 && p.components < 2) out.push(`${where}: broken ${p.cls} in ${p.components} piece, wanted at least 2 fragments`);
    }
  }
  return out;
}

/** Pixel diff count between two RGBA buffers. */
export function diffCount(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++;
  return n;
}

/**
 * Loop-seam check over frames [0 .. N-1] of one loop plus the frame one loop later (`again`):
 * `again` must be pixel-identical to frame 0, and the wrap diff (last -> first) no more than the
 * largest frame-to-frame diff inside the loop.
 */
export function seamProblems(frames, again, where) {
  const out = [];
  const same = diffCount(frames[0], again);
  if (same) out.push(`${where}: the frame one loop later differs from frame 0 by ${same} px`);
  let maxStep = 0;
  for (let i = 1; i < frames.length; i++) maxStep = Math.max(maxStep, diffCount(frames[i - 1], frames[i]));
  const wrap = diffCount(frames[frames.length - 1], frames[0]);
  if (wrap > maxStep) out.push(`${where}: wrap diff ${wrap} px > largest step ${maxStep} px (a visible seam)`);
  if (!maxStep) out.push(`${where}: nothing moves (empty or frozen loop)`);
  return { problems: out, wrap, maxStep, same };
}

export const decode = (f) => new Uint8Array(Buffer.from(f.b64, 'base64'));

/** The biggest piece drawn over the scene (in clear view) in a tile's stats, if it covers at least minArea px. */
export function clearPiece(s, minArea = 24) {
  return s.pieces.filter((p) => s.seenOver.includes(p.index) && p.area >= minArea).sort((a, b) => b.area - a.area)[0] ?? null;
}

/**
 * A piece to sweep: the first start time (s) at which some piece is in clear view.
 * statsOf: async cell -> tile stats. Returns { id, index, start } or null.
 */
export async function findSweepable(statsOf, base, starts = [1, 4, 7, 10, 13, 16]) {
  for (const start of starts) {
    const p = clearPiece(await statsOf({ ...base, t: start }));
    if (p) return { id: p.id, index: p.index, start };
  }
  return null;
}
