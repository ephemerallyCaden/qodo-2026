// Debris kits (R13, space-debris.md D1, A3): what one piece of stale work is made of, per class. Pure data and
// arithmetic, no three.js, so the shapes are testable in Node; render/debris.ts turns parts into geometry.
// Ported from the asset viewer's A3 `outlined` kit (feature/asset-library, mockups/asset-viewer/debris-kits.js),
// the human's pick (2026-11-10), with the lab's exploration kits left out.
//
// A part is a box (size [x, y, z]), a cylinder (r at -x, r2 at +x, len; along x, or y with axis 'y'; a cone when
// r2 differs) or a light (a blinking nav light, a point). Parts are in kit units at the focus framing of a
// radius-1 body; a piece's world size is kit units × its kit scale × its home body's radius (debris/place.ts), so
// a piece looks the same size against any planet in focus and every 2 px rule below holds on every planet.
// `frag` groups parts into the fragments a broken (D2) or swept (D6) piece falls apart into. A `panel` box
// (thin in z) draws a solar-cell grid on its big faces, laid out by `panelGrid` for its scale.
import type { DebrisClass } from '../../../src/core/contract/debris.js';
import { FOCUS_FILL } from '../camera/pose.js';
import { PIXEL_HEIGHT } from '../model/pixels.js';
import type { Vec3 } from '../model/vec.js';

/** The four kinds of stale work (R13). A stale PR needs a GitHub opt-in no scan has yet; its kit is ready for one. */
export const CLASSES: readonly DebrisClass[] = ['pr', 'branch', 'merged', 'agent'];
/** What each class is called in words (the panel, the summary). */
export const CLASS_LABEL: Readonly<Record<DebrisClass, string>> = {
  pr: 'stale PR', branch: 'abandoned branch', merged: 'merged, not deleted', agent: 'orphaned agent branch',
};

/** The thinnest a designed feature may be at the focus framing (AGENTS.md Rule 4: drawn lines at least 2 internal px). */
export const MIN_FEATURE_PX = 2;
/**
 * World units per internal pixel at a focused body of radius 1 (camera/pose.ts: the body fills FOCUS_FILL of half
 * the default frame height). Equal to the asset viewer's hero framing (HERO_PX, 0.0247) to three figures.
 */
export const FOCUS_PX = 1 / (FOCUS_FILL * (PIXEL_HEIGHT.default / 2));

export interface BoxPart { shape: 'box'; size: Vec3; pos: Vec3; frag: number; panel?: boolean; grid?: PanelGrid }
export interface CylPart { shape: 'cyl'; r: number; r2?: number; len: number; axis?: 'y'; pos: Vec3; frag: number }
export interface LightPart { shape: 'light'; pos: Vec3; frag: number }
export type SolidPart = BoxPart | CylPart;
export type Part = SolidPart | LightPart;
/** A panel's cells along x and y, and its grid-line widths along x and y as shares of the face (0 cells: a plain plate). */
export type PanelGrid = readonly [number, number, number, number];

export const isSolid = (p: Part): p is SolidPart => p.shape !== 'light';
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 0..1 from a size in changed lines: a log scale, 1 line → 0, 10k+ lines → 1. */
export const sizeNorm = (lines: number): number => Math.min(1, Math.max(0, Math.log10(Math.max(1, lines)) / 4));

/** A part's half extents per axis, kit units. */
function halves(p: SolidPart): Vec3 {
  if (p.shape === 'box') return [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2];
  const rr = Math.max(p.r, p.r2 ?? p.r);
  return p.axis === 'y' ? [rr, p.len / 2, rr] : [p.len / 2, rr, rr];
}

/** The box round a part list's solid parts, kit units. */
export function extent(parts: readonly Part[]): { lo: Vec3; hi: Vec3; size: Vec3 } {
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of parts.filter(isSolid)) {
    const h = halves(p);
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i]!, p.pos[i]! - h[i]!);
      hi[i] = Math.max(hi[i]!, p.pos[i]! + h[i]!);
    }
  }
  return { lo, hi, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] };
}

/** A solid part's three dimensions, smallest first (a cylinder's are its length and its widest diameter twice). */
export function dims(p: SolidPart): [number, number, number] {
  const d = p.shape === 'box' ? [...p.size] : [p.len, 2 * Math.max(p.r, p.r2 ?? p.r), 2 * Math.max(p.r, p.r2 ?? p.r)];
  return d.sort((a, b) => a - b) as [number, number, number];
}

/** A part list moved so its solid parts' box is centred on the origin. */
function centred(parts: readonly Part[]): Part[] {
  const { lo, hi } = extent(parts);
  const c = [0, 1, 2].map((i) => (lo[i]! + hi[i]!) / 2);
  return parts.map((p) => ({ ...p, pos: [p.pos[0] - c[0]!, p.pos[1] - c[1]!, p.pos[2] - c[2]!] }));
}

/** Grid lines and the smallest cell, in internal px at the focus framing. */
const GRID = { line: 2, cell: 2 } as const;

/** A panel's cell grid at this kit scale: as many ≥ 2 px cells as fit between ≥ 2 px lines (none: a plain metal plate). */
export function panelGrid(p: BoxPart, scale: number): PanelGrid {
  const along = (len: number): [number, number] => {
    const px = (len * scale) / FOCUS_PX;
    return [Math.max(0, Math.floor((px - GRID.line) / (GRID.cell + GRID.line))), GRID.line / px];
  };
  const [nx, lx] = along(p.size[0]), [ny, ly] = along(p.size[1]);
  return [nx, ny, lx, ly];
}

/** Kit scale over the size range: 11.5–19 px across at the focus framing. */
export const SATELLITE_SCALE = [0.22, 0.36] as const;

// A3 `outlined`: grey satellite parts, red only as a 1 px outline and two blinking nav lights per piece:
//   stale PR             a comms satellite: a bus and dish between two solar wings (a request sent, no reply)
//   abandoned branch     a snapped radio-mast boom (a limb that never connected)
//   merged, not deleted  a spent stage with a nose and a nozzle bell (the job was done; never jettisoned)
//   orphaned agent       a detached 2x2 solar array on a boom with a torn mount (power for work that went nowhere)
// Joined so the outline hull shows no seams: same-section parts overlap or meet inside a collar, a cone's wide end
// stays narrower than the body it sits on, the satellite's bus is taller than its wings and the array's gap stays
// open around the outline. Exactly the viewer's tables.
const OUTLINED: Readonly<Record<DebrisClass, readonly Part[]>> = {
  pr: [
    { shape: 'box', size: [0.36, 0.44, 0.34], pos: [0, 0, 0], frag: 0 },
    { shape: 'box', size: [0.6, 0.3, 0.05], pos: [-0.46, 0, 0], frag: 1, panel: true },
    { shape: 'box', size: [0.6, 0.3, 0.05], pos: [0.46, 0, 0], frag: 2, panel: true },
    { shape: 'cyl', axis: 'y', r: 0.07, r2: 0.26, len: 0.12, pos: [0, 0.26, 0], frag: 0 },
    { shape: 'light', pos: [-0.77, 0.13, 0.03], frag: 1 },
    { shape: 'light', pos: [0.77, 0.13, 0.03], frag: 2 },
  ],
  branch: [
    { shape: 'box', size: [0.14, 0.3, 0.3], pos: [-0.74, 0, 0], frag: 0 },
    { shape: 'box', size: [0.84, 0.23, 0.23], pos: [-0.27, 0, 0], frag: 0 },
    { shape: 'box', size: [0.1, 0.31, 0.31], pos: [0.15, 0, 0], frag: 0 },
    { shape: 'box', size: [0.56, 0.23, 0.23], pos: [0.45, 0, 0], frag: 1 },
    { shape: 'light', pos: [-0.83, 0, 0], frag: 0 },
    { shape: 'light', pos: [0.75, 0.05, 0], frag: 1 },
  ],
  merged: [
    { shape: 'cyl', r: 0.21, len: 0.46, pos: [-0.04, 0, 0], frag: 0 },
    { shape: 'cyl', r: 0.11, r2: 0.25, len: 0.2, pos: [0.29, 0, 0], frag: 1 },
    { shape: 'cyl', r: 0.08, r2: 0.18, len: 0.12, pos: [-0.33, 0, 0], frag: 2 },
    { shape: 'light', pos: [-0.41, 0, 0], frag: 2 },
    { shape: 'light', pos: [0.4, 0.22, 0], frag: 1 },
  ],
  agent: [
    { shape: 'box', size: [1.36, 0.24, 0.12], pos: [-0.02, 0, 0], frag: 0 },
    { shape: 'box', size: [0.18, 0.34, 0.26], pos: [-0.75, 0, 0], frag: 0 },
    { shape: 'box', size: [0.4, 0.42, 0.06], pos: [-0.44, 0.33, 0], frag: 0, panel: true },
    { shape: 'box', size: [0.4, 0.42, 0.06], pos: [0.44, 0.33, 0], frag: 1, panel: true },
    { shape: 'box', size: [0.4, 0.42, 0.06], pos: [-0.44, -0.33, 0], frag: 2, panel: true },
    { shape: 'box', size: [0.4, 0.42, 0.06], pos: [0.44, -0.33, 0], frag: 3, panel: true },
    { shape: 'light', pos: [-0.86, 0.12, 0], frag: 0 },
    { shape: 'light', pos: [0.66, -0.56, 0.03], frag: 3 },
  ],
};

/** A built piece's shape: its parts (centred, panels gridded), kit scale, scorch-cell size and how far a broken one's fragments part. */
export interface Built { parts: Part[]; scale: number; cell: number; spread: number }

/**
 * The piece for a class and a size in changed lines (D1, D2): bigger work, a bigger piece, on a log scale. `cell`
 * is the scorch patch size in kit units, decided per cell of a grid in the piece's own frame so patches stick to
 * it as it tumbles, never under 2 px at the focus framing.
 */
export function buildKit(cls: DebrisClass, lines: number): Built {
  const scale = lerp(SATELLITE_SCALE[0], SATELLITE_SCALE[1], sizeNorm(lines));
  const parts = centred(OUTLINED[cls]).map((p) => (p.shape === 'box' && p.panel ? { ...p, grid: panelGrid(p, scale) } : p));
  return { parts, scale, cell: Math.max(0.34, (MIN_FEATURE_PX * 1.1 * FOCUS_PX) / scale), spread: 1 };
}

/** Fragment ids of a part list, in order. */
export const fragIds = (parts: readonly Part[]): number[] => [...new Set(parts.map((p) => p.frag))].sort((a, b) => a - b);

/**
 * The middle of one fragment's solid parts (the centre of the box round them), kit units: where it sits in the
 * piece, and what it spins about when the piece is broken or swept. (The viewer pivots on the parts' centroid;
 * the box's centre makes the sphere it spins in, and so the debris shell, as tight as it can be.)
 */
export function fragCentre(parts: readonly Part[], frag: number): Vec3 {
  const { lo, hi } = extent(parts.filter((p) => p.frag === frag && isSolid(p)));
  return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
}

/** How far a fragment's solid parts reach from its middle, kit units: the sphere it fills however it spins. */
export function fragBound(parts: readonly Part[], frag: number): number {
  return Math.hypot(...extent(parts.filter((p) => p.frag === frag && isSolid(p))).size) / 2;
}

/** The furthest point of a solid part from the origin, kit units. */
const corner = (p: SolidPart) => { const h = halves(p); return Math.hypot(Math.abs(p.pos[0]) + h[0], Math.abs(p.pos[1]) + h[1], Math.abs(p.pos[2]) + h[2]); };

/**
 * The radius of a sphere round a built piece's middle that holds it however it tumbles, kit units. Whole, it is
 * rigid: its furthest corner. Broken, each fragment drifts `spread` kit units out from where it sits and spins
 * about its own middle (debris/place.ts).
 */
export function pieceBound(parts: readonly Part[], spread = 0): number {
  const solid = parts.filter(isSolid);
  if (spread <= 0) return Math.max(...solid.map(corner));
  return Math.max(...fragIds(solid).map((f) => Math.hypot(...fragCentre(solid, f)) + spread + fragBound(solid, f)));
}

/** The furthest a broken piece's fragments drift apart, kit units (debris/place.ts draws each one's own up to this). */
export const MAX_SPREAD = 0.54;
/** The biggest bound any piece can have, in its home body's radii: the debris shell is sized for it (debris/shell.ts). */
export const MAX_BOUND = Math.max(...CLASSES.map((c) => pieceBound(buildKit(c, 1).parts, MAX_SPREAD))) * SATELLITE_SCALE[1];

const volume = (p: SolidPart) => (p.shape === 'box' ? p.size[0] * p.size[1] * p.size[2] : Math.PI * Math.max(p.r, p.r2 ?? p.r) ** 2 * p.len);
/** The fragment with the most volume: the one that keeps its outline when a piece breaks (ties to the lower id). */
export function biggestFrag(parts: readonly Part[]): number {
  const v = new Map<number, number>();
  for (const p of parts.filter(isSolid)) v.set(p.frag, (v.get(p.frag) ?? 0) + volume(p));
  return [...v.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
}
