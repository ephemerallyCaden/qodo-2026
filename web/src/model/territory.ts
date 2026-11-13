// Fog of war's footprint (#74; human, 2026-11-11): a territory per file, computed in the renderer.
// #18 gives each file one cell of its planet's Fibonacci grid, which leaves a planet with 48 files
// mostly nobody's; so every cell is shared out among the planet's files, each territory grown from
// its file's own cell. A fully fogged planet is then fogged all over, and the fogged share of the
// surface follows the fogged share of the files (F2). #18 is unchanged: territories are derived each
// time from the layout's settlements, so they reshape a little as files come and go, while the
// settlements never move. Ported from the fog lab (feature/fog-lab 69be694,
// mockups/asset-viewer/fog-layout.js footprint('territory')), same tie-breaks. Pure: no three.js,
// no DOM, no clock; ties go by cell number, never by locale (principle 3).
import { fibonacciCell } from '../../../src/core/contract/layout.js';

/** Unit-sphere centres of an n-cell grid, x, y, z per cell. */
const centreCache = new Map<number, Float64Array>();
export function centresOf(n: number): Float64Array {
  let c = centreCache.get(n);
  if (!c) {
    c = new Float64Array(3 * n);
    for (let i = 0; i < n; i++) c.set(fibonacciCell(i, n), 3 * i);
    centreCache.set(n, c);
  }
  return c;
}

const dotOf = (c: Float64Array, a: number, b: number) => c[3 * a]! * c[3 * b]! + c[3 * a + 1]! * c[3 * b + 1]! + c[3 * a + 2]! * c[3 * b + 2]!;

/** Each cell's neighbours: its 6 nearest cells (fewer on a tiny grid), made symmetric, sorted. */
const neighbourCache = new Map<number, number[][]>();
export function neighbours(n: number): number[][] {
  let out = neighbourCache.get(n);
  if (out) return out;
  const c = centresOf(n);
  const sets = Array.from({ length: n }, () => new Set<number>());
  for (let i = 0; i < n; i++) {
    const near = Array.from({ length: n }, (_, j) => j).filter((j) => j !== i)
      .sort((a, b) => dotOf(c, i, b) - dotOf(c, i, a) || a - b).slice(0, 6);
    for (const j of near) { sets[i]!.add(j); sets[j]!.add(i); }
  }
  out = sets.map((s) => [...s].sort((a, b) => a - b));
  neighbourCache.set(n, out);
  return out;
}

/**
 * The grid's covering radius (rad): the farthest any point of the sphere is from its nearest cell
 * centre, sampled on a 20,000-point Fibonacci lattice. 256 cells: 0.168.
 */
const coverCache = new Map<number, number>();
export function coverRadius(n: number): number {
  let worst = coverCache.get(n);
  if (worst !== undefined) return worst;
  const c = centresOf(n);
  const M = 20_000;
  worst = 0;
  for (let k = 0; k < M; k++) {
    const y = 1 - (2 * (k + 0.5)) / M, r = Math.sqrt(1 - y * y), t = k * 2.399963229728653;
    const px = Math.cos(t) * r, pz = Math.sin(t) * r;
    let best = -2;
    for (let i = 0; i < n; i++) best = Math.max(best, px * c[3 * i]! + y * c[3 * i + 1]! + pz * c[3 * i + 2]!);
    worst = Math.max(worst, Math.acos(Math.min(1, best)));
  }
  coverCache.set(n, worst);
  return worst;
}

/** How far the fog shader searches either side of a point's latitude: 1.7 covering radii, enough for the two nearest cells. */
export const SEARCH_COVERS = 1.7;
/**
 * The shader's search window in cell indices. Cell i sits at y = 1 − 2i/(n−1), and a cell within
 * angle a of a point is within a of it in y, so cells within 1.7 covering radii are within this many
 * indices of the point's own latitude index.
 */
export const searchWindow = (n: number): number => (n <= 1 ? 0 : Math.ceil((SEARCH_COVERS * coverRadius(n) * (n - 1)) / 2) + 1);

export interface Territory {
  /** Grid cells. */
  cells: number;
  /** Per cell, the index (into the settlements given) of the file that owns it; -1 only on a planet with no settlement. */
  owner: Int32Array;
  /** Per file: the footprint's cell nearest its centroid, where its parcel is drawn from and its fronts start. */
  anchor: Int32Array;
  /** Per file: the angle (rad) from the anchor that covers the whole footprint (a front that has travelled it has crossed it all). */
  reach: Float64Array;
  /** Per file: cells owned. */
  size: Int32Array;
}

/**
 * Shares every cell of an n-cell grid among `cells` (each file's own #18 cell, in settlement order).
 * Equal quotas (floor(n/N), the first n mod N files by cell one more), grown round-robin: each file in
 * turn claims the unclaimed neighbour of its territory nearest its own cell (ties: the lower cell).
 * Cells left over, where a file was boxed in early, go to the smallest neighbouring territory.
 * A file whose cell is off the grid or already taken gets no cells: it can't be drawn, and is still
 * counted in the fog view's per-planet counts (Rule 1).
 */
export function territories(cells: readonly number[], n: number): Territory {
  const c = centresOf(n);
  const N = cells.length;
  const owner = new Int32Array(n).fill(-1);
  const placed: number[] = [];
  cells.forEach((cell, k) => {
    if (Number.isInteger(cell) && cell >= 0 && cell < n && owner[cell] === -1) { owner[cell] = k; placed.push(k); }
  });
  const size = new Int32Array(N);
  const cellsOf: number[][] = Array.from({ length: N }, () => []);
  for (const k of placed) { size[k] = 1; cellsOf[k]!.push(cells[k]!); }
  if (placed.length > 0) {
    const nb = neighbours(n);
    const byCell = [...placed].sort((a, b) => cells[a]! - cells[b]!);
    const quota = new Int32Array(N);
    byCell.forEach((k, j) => { quota[k] = Math.floor(n / placed.length) + (j < n % placed.length ? 1 : 0); });
    for (let grew = true; grew;) {
      grew = false;
      for (const k of byCell) {
        if (size[k]! >= quota[k]!) continue;
        let best = -1, bestDot = -Infinity;
        for (const m of cellsOf[k]!) {
          for (const j of nb[m]!) {
            if (owner[j] !== -1) continue;
            const d = dotOf(c, j, cells[k]!);
            if (d > bestDot || (d === bestDot && j < best)) { best = j; bestDot = d; }
          }
        }
        if (best < 0) continue;
        owner[best] = k; size[k]!++; cellsOf[k]!.push(best); grew = true;
      }
    }
    for (let left = true, moved = true; left && moved;) {
      left = false; moved = false;
      for (let i = 0; i < n; i++) {
        if (owner[i] !== -1) continue;
        let best = -1;
        for (const j of nb[i]!) {
          const o = owner[j]!;
          if (o !== -1 && (best < 0 || size[o]! < size[best]! || (size[o] === size[best] && o < best))) best = o;
        }
        if (best < 0) { left = true; continue; }
        owner[i] = best; size[best]!++; cellsOf[best]!.push(i); moved = true;
      }
    }
    // A cell no territory could reach through neighbours (never on #18's grids, but no cell may stay
    // nobody's): the file whose own cell is nearest.
    for (let i = 0; i < n; i++) {
      if (owner[i] !== -1) continue;
      let best = placed[0]!;
      for (const k of placed) if (dotOf(c, i, cells[k]!) > dotOf(c, i, cells[best]!)) best = k;
      owner[i] = best; size[best]!++; cellsOf[best]!.push(i);
    }
  }
  // Anchor: the cell nearest the footprint's centroid (ties: the lower cell). A footprint that is
  // the whole grid has no centroid to speak of, so it keeps its file's own cell.
  const anchor = new Int32Array(N).fill(-1);
  for (const k of placed) {
    if (size[k] === n) { anchor[k] = cells[k]!; continue; }
    let sx = 0, sy = 0, sz = 0;
    for (const i of cellsOf[k]!) { sx += c[3 * i]!; sy += c[3 * i + 1]!; sz += c[3 * i + 2]!; }
    let best = -Infinity;
    for (const i of [...cellsOf[k]!].sort((a, b) => a - b)) {
      const d = c[3 * i]! * sx + c[3 * i + 1]! * sy + c[3 * i + 2]! * sz;
      if (d > best) { best = d; anchor[k] = i; }
    }
  }
  const cover = coverRadius(n);
  const reach = new Float64Array(N);
  for (const k of placed) for (const i of cellsOf[k]!) reach[k] = Math.max(reach[k]!, Math.acos(Math.min(1, Math.max(-1, dotOf(c, i, anchor[k]!)))) + cover);
  return { cells: n, owner, anchor, reach, size };
}
