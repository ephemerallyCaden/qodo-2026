// Phase 2 contract (#29): the shape of `layout.json`. Types plus one pure geometry helper that both
// `layout()` (#18) and the renderer (#30) must agree on. Locked: change only through the team lead.
// Every number is an integer, because canonicalJson only takes integers (Rule 3, byte-stable output).
import type { DirId, FileId, IsoUtc, Sha } from '../snapshot/types.js';

/** Worst to best (art-direction §6, #19). */
export type HealthBand = 'lava' | 'toxic' | 'ash' | 'lush';

export interface Health {
  band: HealthBand;
  /** Debt markers per 1,000 LOC, ×1000 (so 2.5 markers/kLOC is 2500). Counts only files whose debt is known. */
  markersPerKlocMilli: number;
  /** Files whose debt markers couldn't be read (FileEntry.debt === null). They never count as 0. */
  debtUnknownFiles: number;
  /** Open Qodo findings (#17), or null when unknown. */
  qodoOpen: number | null;
  /** True when qodoOpen is null and the band comes from markers only. */
  qodoUnknown: boolean;
}

/** A place on the fixed lattice of orbits. Slot 0 is the innermost. */
export interface OrbitSlot {
  index: number;
  /** Orbit radius in world units ×1000. */
  radiusMilli: number;
  /** Starting angle in thousandths of a turn, 0..999. Orbital motion is the renderer's job (a function of frame number). */
  phaseMilliturn: number;
}

/**
 * Surface grid: `cells` points on a Fibonacci sphere, cell i at `fibonacciCell(i, cells)`. "Nearest
 * free cell" in #18 means nearest by angle between these centres.
 */
export interface SurfaceGrid { kind: 'fibonacci'; cells: number }

/** A folder's territory: its seed cell, fixed at the folder's birth. */
export interface Continent { dirId: DirId; parent: DirId | null; seedCell: number }

/** A file on the surface. */
export interface Settlement {
  fileId: FileId;
  /** The folder whose continent it grows from (its own folder, folded into the planet's second level). */
  dirId: DirId;
  cell: number;
  loc: number;
  /** Size class from LOC, 1..4. */
  size: number;
  health: Health;
}

/** A test file orbiting the planet that holds its `testOf` source. */
export interface Moon { fileId: FileId; testOf: FileId | DirId; slot: number }

/** Root files and unmatched tests, on the innermost orbit around the star. */
export interface Moonlet { fileId: FileId; kind: 'root-file' | 'unmatched-test'; slot: number }

/** An unmerged branch touching the planet (from snapshot.branches[]). */
export interface Ring { branch: string; slot: number; aheadCount: number; lastCommitDate: IsoUtc }

export interface Planet {
  dirId: DirId;
  path: string;
  bornSeq: number;
  partner: DirId | null;
  slot: OrbitSlot;
  /** Body radius in world units ×1000, from clamped log2(1 + LOC). */
  radiusMilli: number;
  loc: number;
  /** Decorative only (principle 4): seeds terrain noise and the biome where health doesn't apply. */
  biomeSeed: number;
  health: Health;
  surface: { grid: SurfaceGrid; continents: Continent[]; settlements: Settlement[]; overflow: number };
  /** Up to 24, oldest first. */
  moons: Moon[];
  moonOverflow: number;
  /** Up to 4, oldest first. */
  rings: Ring[];
  ringOverflow: number;
}

export interface LayoutV1 {
  schemaVersion: 'layout.1';
  /** The snapshot this layout was computed from. */
  source: { repoId: string; head: Sha };
  constants: {
    /** Distance between neighbouring orbit slots, world units ×1000. At least 2× maxPlanetRadiusMilli. */
    slotSpacingMilli: number;
    maxPlanetRadiusMilli: number;
    moonCap: number;
    ringCap: number;
  };
  star: {
    repoId: string;
    moonlets: Moonlet[];
    moonletOverflow: number;
    /** Non-test files under a test folder (fixtures, test data). They ride with the tests, are not drawn, and are counted (#23). */
    testData: number;
  };
  /** Sorted by slot index. */
  planets: Planet[];
}

/**
 * Unit-sphere centre of cell `i` of `n` on a Fibonacci sphere: y runs from +1 (cell 0) to -1, and the
 * angle advances by the golden angle each step. Floats are fine here: only render and distance
 * comparisons use it, never serialised output.
 */
export function fibonacciCell(i: number, n: number): [x: number, y: number, z: number] {
  const y = n === 1 ? 0 : 1 - (2 * i) / (n - 1);
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = i * Math.PI * (3 - Math.sqrt(5));
  return [Math.cos(theta) * r, y, Math.sin(theta) * r];
}
