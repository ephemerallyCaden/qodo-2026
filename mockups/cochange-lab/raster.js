// The constellation lines' rasteriser: screen-space paths in internal pixels (320×180) drawn with a
// square w×w brush, so every line is whole pixels at least 2 px thick (art direction §1 pillar 3),
// in exact palette colours (no anti-aliasing, no blending, no depth fade). Pure: arrays in, arrays out,
// no DOM, no three.js, no clock; time comes in as an argument.
//
// The "don't fight" rule lives here: a stamp is drawn only where all its pixels are free, and the
// caller's mask blocks everything that isn't empty space (planets, clouds, rings, moons, debris,
// drones, the star and its corona), grown by a 1 px gap, plus the label and marker boxes. So a line
// never draws over a disc, a cloud or a label; it stops 1 px short and carries on past it.

/** Points of a polyline resampled every `step` px of arc length: [{ x, y, s }], s from 0 at pts[0]. */
export function resample(pts, step = 1) {
  const out = [];
  if (pts.length === 0) return out;
  out.push({ x: pts[0].x, y: pts[0].y, s: 0 });
  let s = 0, next = step;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    while (len > 0 && next <= s + len) {
      const u = (next - s) / len;
      out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, s: next });
      next += step;
    }
    s += len;
  }
  return out;
}

/** Top-left pixel of a w×w stamp centred on (x, y): whole pixels, the same for the same point. */
export const stampAt = (x, y, w) => [Math.round(x - w / 2), Math.round(y - w / 2)];

/** True when a w×w stamp at (x, y) lies inside the frame on free pixels only. */
export function stampFree(blocked, W, H, x, y, w) {
  const [tx, ty] = stampAt(x, y, w);
  if (tx < 0 || ty < 0 || tx + w > W || ty + w > H) return false;
  for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) if (blocked[(ty + j) * W + tx + i]) return false;
  return true;
}

/** Writes colour index c into a w×w stamp at (x, y) when it's free; true if drawn. */
export function stamp(ov, blocked, W, H, x, y, w, c) {
  if (!stampFree(blocked, W, H, x, y, w)) return false;
  const [tx, ty] = stampAt(x, y, w);
  for (let j = 0; j < w; j++) ov.fill(c, (ty + j) * W + tx, (ty + j) * W + tx + w);
  return true;
}

/**
 * The span of a path a line may use: from where it leaves its start disc to where it enters its end
 * disc ({ x, y, r } in px, or null), each grown by `gap`. It's geometric (the disc circles, not the
 * mask), so dots and beads stay put while clouds move at the limb. Returns [s0, s1] or null.
 */
export function span(samples, from, to, gap = 1.5) {
  const out = (p, d) => !d || Math.hypot(p.x - d.x, p.y - d.y) > d.r + gap;
  let s0 = null, s1 = null;
  for (const p of samples) if (out(p, from) && out(p, to)) { s0 ??= p.s; s1 = p.s; }
  return s0 === null || s1 - s0 < 2 ? null : [s0, s1];
}

/** Cubic ease-out. */
const easeOut = (x) => 1 - (1 - x) ** 3;
/**
 * How much of a line is drawn, 0..1, `since` seconds after its item was focused: lines draw in from
 * the focused end over `dur` s, strongest first, `stagger` s apart (rank 0 first). Reduced motion
 * draws them at once.
 */
export function revealAt(since, rank, { dur = 0.7, stagger = 0.1, reduced = false } = {}) {
  if (reduced) return since >= 0 ? 1 : 0;
  const x = (since - rank * stagger) / dur;
  return x <= 0 ? 0 : x >= 1 ? 1 : easeOut(x);
}

/**
 * Draws one line into ov (colour indices, W×H, 0 = nothing) where `blocked` allows.
 * samples: resample() output (1 px steps); sp: span(); style: the line's look for its step:
 *   { w, colour, period? (dots: one dot every `period` px), beads? ({ n, u0, head, tail, len }) }.
 * reveal: the drawn share of the span, from its start (the focused end).
 * Returns the stamps drawn.
 */
export function drawLine(ov, blocked, W, H, samples, sp, style, reveal = 1) {
  if (!sp || reveal <= 0) return 0;
  const [s0, s1] = sp;
  const end = s0 + reveal * (s1 - s0);
  let n = 0;
  for (const p of samples) {
    if (p.s < s0 || p.s > end) continue;
    if (style.period && Math.round(p.s - s0) % style.period !== 0) continue;
    if (stamp(ov, blocked, W, H, p.x, p.y, style.w, style.colour)) n++;
  }
  return n;
}

/**
 * The beads of a signal line (option B) on top of its rail: `n` beads evenly spaced, travelling from
 * the focused end, `u` their phase (0..1 along the span; the caller makes it loop-locked or frozen).
 * Each bead is `len` px: its leading `headLen` px in `head`, the rest in `tail`. Only on the drawn share.
 */
export function drawBeads(ov, blocked, W, H, samples, sp, { w, n, u, len, headLen, head, tail }, reveal = 1) {
  if (!sp || reveal <= 0) return 0;
  const [s0, s1] = sp;
  const L = s1 - s0, end = s0 + reveal * L;
  let drawn = 0;
  for (let k = 0; k < n; k++) {
    const at = s0 + (((u + k / n) % 1) + 1) % 1 * L;
    for (const p of samples) {
      if (p.s > at || p.s <= at - len || p.s < s0 || p.s > end) continue;
      if (stamp(ov, blocked, W, H, p.x, p.y, w, at - p.s < headLen ? head : tail)) drawn++;
    }
  }
  return drawn;
}

// ------------------------------------------------------------------ masks and markers
/** A W×H mask of the pixels a line may not use: 1 where the frame isn't one of the free colours. */
export function busyMask(rgba, W, H, free) {
  const ok = new Set(free.map(hexKey));
  const m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) m[i] = ok.has((rgba[4 * i] << 16) | (rgba[4 * i + 1] << 8) | rgba[4 * i + 2]) ? 0 : 1;
  return m;
}
export const hexKey = (hex) => parseInt(hex.slice(1), 16);

/** The mask grown by r px in every direction (a square neighbourhood). */
export function dilate(m, W, H, r = 1) {
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!m[y * W + x]) continue;
    for (let j = Math.max(0, y - r); j <= Math.min(H - 1, y + r); j++) out.fill(1, j * W + Math.max(0, x - r), j * W + Math.min(W - 1, x + r) + 1);
  }
  return out;
}

/** Blocks a box (px, any fractional edges rounded outward) grown by pad. */
export function blockBox(m, W, H, { x, y, w, h }, pad = 1) {
  const x0 = Math.max(0, Math.floor(x) - pad), y0 = Math.max(0, Math.floor(y) - pad);
  const x1 = Math.min(W, Math.ceil(x + w) + pad), y1 = Math.min(H, Math.ceil(y + h) + pad);
  for (let j = y0; j < y1; j++) if (x1 > x0) m.fill(1, j * W + x0, j * W + x1);
}

/**
 * Draws a marker shape (rows of characters, '.' clear) with its top-left at (x, y); colours maps each
 * character to a colour index. Clipped to the frame. Returns its box { x, y, w, h }.
 */
export function drawShape(ov, W, H, rows, x, y, colours) {
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    const px = x + i, py = y + j;
    if (ch !== '.' && px >= 0 && py >= 0 && px < W && py < H) ov[py * W + px] = colours[ch];
  }));
  return { x, y, w: rows[0].length, h: rows.length };
}
