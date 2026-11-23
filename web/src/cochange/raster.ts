// The constellation lines' rasteriser (#211), ported from the co-change lab (mockups/cochange-lab/raster.js
// on feature/asset-library, option B "signal"): screen-space paths in internal pixels drawn with a square
// w×w brush, so every line is whole pixels at least 2 px thick (Rule 4), in exact palette colours (no
// anti-aliasing, no blending, no depth fade). Pure: arrays in, arrays out, no DOM, no three.js, no clock;
// time comes in as an argument.
//
// The "don't fight" rule lives here: a stamp is drawn only where all its pixels are free, and the
// caller's mask blocks everything that isn't empty space (planets, clouds, moons, drones, beacons, the
// star and its corona), grown by a 1 px gap, plus the label and marker boxes. So a line never draws over
// a body, a cloud or a label; it stops 1 px short and carries on past it.

export interface Pt { x: number; y: number }
export interface Sample extends Pt { s: number }
/** A disc on screen in internal px. */
export interface Disc extends Pt { r: number }
export interface Box { x: number; y: number; w: number; h: number }

/** Points of a polyline resampled every `step` px of arc length, `s` from 0 at the first point. */
export function resample(pts: readonly Pt[], step = 1): Sample[] {
  const out: Sample[] = [];
  if (pts.length === 0) return out;
  out.push({ x: pts[0]!.x, y: pts[0]!.y, s: 0 });
  let s = 0, next = step;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!;
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
export const stampAt = (x: number, y: number, w: number): [number, number] => [Math.round(x - w / 2), Math.round(y - w / 2)];

/** True when a w×w stamp at (x, y) lies inside the frame on free pixels only. */
export function stampFree(blocked: Uint8Array, W: number, H: number, x: number, y: number, w: number): boolean {
  const [tx, ty] = stampAt(x, y, w);
  if (tx < 0 || ty < 0 || tx + w > W || ty + w > H) return false;
  for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) if (blocked[(ty + j) * W + tx + i]) return false;
  return true;
}

/** Writes colour index c into a w×w stamp at (x, y) when it's free; true if drawn. */
export function stamp(ov: Uint8Array, blocked: Uint8Array, W: number, H: number, x: number, y: number, w: number, c: number): boolean {
  if (!stampFree(blocked, W, H, x, y, w)) return false;
  const [tx, ty] = stampAt(x, y, w);
  for (let j = 0; j < w; j++) ov.fill(c, (ty + j) * W + tx, (ty + j) * W + tx + w);
  return true;
}

/**
 * The span of a path a line may use: from where it leaves its start disc to where it enters its end
 * disc (either null: none), each grown by `gap`. It's geometric (the disc circles, not the mask), so
 * beads stay put while clouds move at the limb. Returns [s0, s1] or null.
 */
export function span(samples: readonly Sample[], from: Disc | null, to: Disc | null, gap = 1.5): [number, number] | null {
  const out = (p: Pt, d: Disc | null) => !d || Math.hypot(p.x - d.x, p.y - d.y) > d.r + gap;
  let s0: number | null = null, s1 = 0;
  for (const p of samples) if (out(p, from) && out(p, to)) { s0 ??= p.s; s1 = p.s; }
  return s0 === null || s1 - s0 < 2 ? null : [s0, s1];
}

/** Cubic ease-out (the draw-in is a HUD layer, not planetary motion: Rule 4's constant rates don't cover it). */
const easeOut = (x: number) => 1 - (1 - x) ** 3;

/** The draw-in (art direction §10): over `dur` s from the focused end, strongest first, `stagger` s apart. */
export const DRAW_IN = { dur: 0.7, stagger: 0.1 } as const;

/**
 * How much of a line is drawn, 0..1, `since` seconds after its item was focused, for its rank (0 the
 * strongest). Reduced motion draws every line at once.
 */
export function revealAt(since: number, rank: number, reduced = false): number {
  if (reduced) return since >= 0 ? 1 : 0;
  const x = (since - rank * DRAW_IN.stagger) / DRAW_IN.dur;
  return x <= 0 ? 0 : x >= 1 ? 1 : easeOut(x);
}

/** The rail: `w` px wide, in colour index `colour`, on the drawn share of the span. Returns the stamps drawn. */
export function drawRail(ov: Uint8Array, blocked: Uint8Array, W: number, H: number, samples: readonly Sample[], sp: [number, number] | null,
  w: number, colour: number, reveal = 1): number {
  if (!sp || reveal <= 0) return 0;
  const [s0, s1] = sp;
  const end = s0 + reveal * (s1 - s0);
  let n = 0;
  for (const p of samples) {
    if (p.s < s0 || p.s > end) continue;
    if (stamp(ov, blocked, W, H, p.x, p.y, w, colour)) n++;
  }
  return n;
}

export interface Beads { w: number; n: number; u: number; len: number; headLen: number; head: number; tail: number }

/**
 * The beads of a signal line on top of its rail: `n` beads evenly spaced, travelling from the focused
 * end, `u` their phase (0..1 along the span; the caller makes it loop-locked, or frozen). Each bead is
 * `len` px: its leading `headLen` px in `head`, the rest in `tail`. Only on the drawn share.
 */
export function drawBeads(ov: Uint8Array, blocked: Uint8Array, W: number, H: number, samples: readonly Sample[], sp: [number, number] | null,
  b: Beads, reveal = 1): number {
  if (!sp || reveal <= 0) return 0;
  const [s0, s1] = sp;
  const L = s1 - s0, end = s0 + reveal * L;
  let drawn = 0;
  for (let k = 0; k < b.n; k++) {
    const at = s0 + ((((b.u + k / b.n) % 1) + 1) % 1) * L;
    for (const p of samples) {
      if (p.s > at || p.s <= at - b.len || p.s < s0 || p.s > end) continue;
      if (stamp(ov, blocked, W, H, p.x, p.y, b.w, at - p.s < b.headLen ? b.head : b.tail)) drawn++;
    }
  }
  return drawn;
}

/** A W×H mask of the pixels a line may not use: 1 where the RGBA frame (rows top-down) isn't one of the free colours. */
export function busyMask(rgba: ArrayLike<number>, W: number, H: number, free: readonly number[]): Uint8Array {
  const ok = new Set(free);
  const m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) m[i] = ok.has((rgba[4 * i]! << 16) | (rgba[4 * i + 1]! << 8) | rgba[4 * i + 2]!) ? 0 : 1;
  return m;
}

/** A palette hex as a 0xRRGGBB number. */
export const hexKey = (hex: string): number => parseInt(hex.slice(1), 16);

/** The mask grown by r px in every direction (a square neighbourhood). */
export function dilate(m: Uint8Array, W: number, H: number, r = 1): Uint8Array {
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!m[y * W + x]) continue;
    for (let j = Math.max(0, y - r); j <= Math.min(H - 1, y + r); j++) out.fill(1, j * W + Math.max(0, x - r), j * W + Math.min(W - 1, x + r) + 1);
  }
  return out;
}

/** Blocks a box (px, fractional edges rounded outward) grown by pad. */
export function blockBox(m: Uint8Array, W: number, H: number, b: Box, pad = 1): void {
  const x0 = Math.max(0, Math.floor(b.x) - pad), y0 = Math.max(0, Math.floor(b.y) - pad);
  const x1 = Math.min(W, Math.ceil(b.x + b.w) + pad), y1 = Math.min(H, Math.ceil(b.y + b.h) + pad);
  for (let j = y0; j < y1; j++) if (x1 > x0) m.fill(1, j * W + x0, j * W + x1);
}

/**
 * Draws a marker shape (rows of characters, '.' clear) with its top-left at (x, y); `colours` maps each
 * character to a colour index. Clipped to the frame.
 */
export function drawShape(ov: Uint8Array, W: number, H: number, rows: readonly string[], x: number, y: number, colours: Readonly<Record<string, number>>): void {
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    const px = x + i, py = y + j;
    if (ch !== '.' && px >= 0 && py >= 0 && px < W && py < H) ov[py * W + px] = colours[ch]!;
  }));
}

/**
 * The part of segment a→b inside the box `[x0, x1] × [y0, y1]` (Liang–Barsky), or null when it misses:
 * a far partner's path is cut to the frame before it's resampled.
 */
export function clipSegment(a: Pt, b: Pt, x0: number, y0: number, x1: number, y1: number): [Pt, Pt] | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  let t0 = 0, t1 = 1;
  const edges: [number, number][] = [[-dx, a.x - x0], [dx, x1 - a.x], [-dy, a.y - y0], [dy, y1 - a.y]];
  for (const [p, q] of edges) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return [{ x: a.x + t0 * dx, y: a.y + t0 * dy }, { x: a.x + t1 * dx, y: a.y + t1 * dy }];
}
