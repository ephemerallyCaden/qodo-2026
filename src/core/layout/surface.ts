// A planet's surface (#18): a fixed Fibonacci-sphere grid where each folder's continent grows from a
// seed cell and each file claims the free cell nearest its continent's seed, once, at birth.
import type { DirId } from '../snapshot/types.js';
import { fibonacciCell } from '../contract/layout.js';

const centres = new Map<number, Float64Array>();

/** Unit-sphere centres of an n-cell grid, cached: x, y, z per cell. */
function centresOf(n: number): Float64Array {
  let c = centres.get(n);
  if (!c) {
    c = new Float64Array(3 * n);
    for (let i = 0; i < n; i++) c.set(fibonacciCell(i, n), 3 * i);
    centres.set(n, c);
  }
  return c;
}

export class Surface {
  private readonly taken: Uint8Array;
  private free: number;
  private readonly at: Float64Array;
  /** Per cell, the dot product with its nearest seed by angle (the largest), kept as seeds are added. */
  private readonly nearestSeed: Float64Array;
  /** Seed cell of every continent ever grown here. */
  readonly seeds = new Map<DirId, number>();

  constructor(readonly cells: number, top: DirId) {
    this.taken = new Uint8Array(cells);
    this.free = cells;
    this.at = centresOf(cells);
    this.nearestSeed = new Float64Array(cells).fill(-Infinity);
    // A top-level folder's own continent starts at the north pole.
    this.addSeed(top, 0);
  }

  private dot(a: number, b: number): number {
    const c = this.at;
    return c[3 * a]! * c[3 * b]! + c[3 * a + 1]! * c[3 * b + 1]! + c[3 * a + 2]! * c[3 * b + 2]!;
  }

  private addSeed(dirId: DirId, cell: number): void {
    this.seeds.set(dirId, cell);
    for (let i = 0; i < this.cells; i++) this.nearestSeed[i] = Math.max(this.nearestSeed[i]!, this.dot(i, cell));
  }

  /**
   * A continent's seed, chosen once when its folder first reaches this planet. The top-level folder
   * owns the whole planet, so a subfolder (folded to the second level, as in the contract) seeds
   * anywhere on it: at the free cell farthest by angle from every earlier seed, so continents
   * start apart. On a full grid any cell will do. Ties go to the lower cell.
   */
  seed(dirId: DirId): number {
    const known = this.seeds.get(dirId);
    if (known !== undefined) return known;
    let best = 0;
    for (let i = 0, bestNear = Infinity; i < this.cells; i++) {
      if (this.free > 0 && this.taken[i]) continue;
      if (this.nearestSeed[i]! < bestNear) [best, bestNear] = [i, this.nearestSeed[i]!];
    }
    this.addSeed(dirId, best);
    return best;
  }

  /** Claims the free cell nearest `from` by angle (ties: the lower cell), or null when the grid is full. */
  claim(from: number): number | null {
    if (this.free === 0) return null;
    let best = -1;
    for (let i = 0, bestDot = -Infinity; i < this.cells; i++) {
      if (this.taken[i]) continue;
      const d = this.dot(i, from);
      if (d > bestDot) [best, bestDot] = [i, d];
    }
    this.taken[best] = 1;
    this.free--;
    return best;
  }

  release(cell: number): void {
    this.taken[cell] = 0;
    this.free++;
  }
}
