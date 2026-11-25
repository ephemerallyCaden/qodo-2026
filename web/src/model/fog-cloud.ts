// Fog of war as cloud (#224; art-direction §9, "fog of war is cloud", human, 2026-11-16): C6 · the white
// storm front over every fogged file's territory, thin mist over every misted one (stored `haze`: read,
// not yet tested; the human, 2026-11-25: "clouds for completely unknown, and misted for read but
// untested"), and nothing over a clear one. Ported from the asset viewer's fog-cloud.js
// (feature/asset-library 13ebffb, mockups/asset-viewer: CLOUD_FOGS.C6 and fogClouds()), which the fog
// doc says the product should reuse. Pure: no three.js, no DOM, no clock; every choice is a seeded hash
// of the planet's seed, the file and the cell (principle 3), so the same fog and frame give the same puffs.
//
// - One clump (a lead puff and satellites) per covered site: each cell of #18's 256-cell grid, the grid
//   every scanned planet has (a coarser test grid's cells get several sites each). The clumps sit in the
//   ground's own frame, so the cloud stays over its file instead of drifting with the weather
//   (render/fog.ts puts it on the surface's spin). Every file's territory keeps the same share of its
//   sites open (1 - density, by a seeded rank): the storm front's gap, through which the ground and its
//   health show (§9).
// - Cover is therefore 0.9 of the fogged share of the surface cells, which follows the fogged share of
//   the files within the territory rule's rounding, and a planet with nothing fogged has no storm cloud.
// - Masses: neighbouring covered sites shade as one dome (the weather's mass anchors).
// - Events (model/fog.ts FileFogAt): a front between the level a file came from and the one it rests at.
//   A clear runs out from the file's anchor; the storm cloud still ahead of it is drawn in [OIII] teal
//   (an event, F5) and shrinks as the front passes, leaving the mist (or nothing) behind. Mist clearing
//   (a quiz passed: haze → clear) fades instead, cell by cell. A refog rolls the new level in from the
//   territory's far edge, with no teal (F6).
import { hash01, orphanLevel, type FileFogAt, type Level, type SurfacePlan } from './fog.js';
import { centresOf, neighbours } from './territory.js';
import type { Vec3 } from './vec.js';

/**
 * A cloud layer's look, in planet radii (fog-cloud.js CLOUD_FOGS): `density`, the share of a file's
 * cells that carry it (the rest is its gap); `size`, `lift`, `float`, `flat` and `stretch`, the puff's
 * shape (as the weather's, render/planet.ts put()); `sats`, the satellites per clump, from..to.
 */
export interface CloudLayer {
  id: string;
  density: number;
  size: number;
  lift: number;
  float: number;
  flat: number;
  stretch: number;
  sats: readonly [number, number];
}

/** C6 · white storm front, exactly the asset viewer's (C4's domed storm shape, white). */
export const STORM: CloudLayer = { id: 'C6', density: 0.9, size: 0.15, lift: 1.3, float: 0.07, flat: 0.6, stretch: 1, sats: [2, 3] };
/**
 * Mist: the same placement, thinner. Half the cells, puffs about half the size, low and flat, so the
 * ground shows between them and the mist never domes like the storm (the lead's brief for #224: lower
 * density, smaller and lower puffs, no shadow, the lightest cloud steps; palette.fog.mist).
 */
export const MIST: CloudLayer = { id: 'mist', density: 0.55, size: 0.055, lift: 0.2, float: 0.025, flat: 0.25, stretch: 3, sats: [1, 2] };

/**
 * Where clumps can sit: the cells of a Fibonacci grid of at least #18's SURFACE_CELLS, the grid every
 * scanned planet has and the layers' sizes are set for. On it each site is a cell. A coarser grid (a test
 * fixture's 2, 16 or 64 cells) keeps the same sites, each one standing for the cell nearest it, so a cell
 * is covered whatever its size.
 */
export const SKY_SITES = 256;

/** How softly a front thins the cloud, rad (fog-cloud.js FRONT_SOFT). */
export const FRONT_SOFT = 0.1;
/** How softly a cell's mist goes while mist fades (a share of the fade's length). */
export const FADE_SOFT = 0.15;

/** One puff: a direction from the planet's centre (ground frame, not normalised), its shape, and its mass's dome anchor (null: none). */
export interface Puff { dir: Vec3; size: number; lift: number; flat: number; stretch: number; float: number; anchor: Vec3 | null }

/** A planet's fog sky at a moment: the storm cloud, the part of it that is clearing (drawn teal), and the mist. */
export interface FogSky {
  storm: Puff[];
  teal: Puff[];
  mist: Puff[];
  /** Sites carrying storm cloud (teal included), and mist, over all sites (on a 256-cell grid, cells): the cover measures. */
  stormCover: number;
  mistCover: number;
}

/** What each level puts over a cell at rest: [storm, mist]. */
const OVER: Readonly<Record<Level, readonly [number, number]>> = { 0: [0, 0], 1: [0, 1], 2: [1, 0] };
const soft = (x: number) => Math.min(1, Math.max(0, x));

/** A cell's cover at a moment: how much storm and mist are left over it (0..1), and whether the storm is clearing. */
export interface CellCover { storm: number; mist: number; teal: boolean }

/**
 * The cover over one cell of a file at `f`: `d` the cell's angle from the file's anchor, `reach` the
 * territory's (model/territory.ts), `fade` the cell's own place in a mist fade (0..1).
 */
export function cellCover(f: FileFogAt, d: number, reach: number, fade: number): CellCover {
  const [ts, tm] = OVER[f.level];
  if (f.kind === 0) return { storm: ts, mist: tm, teal: false };
  const [fs, fm] = OVER[f.from];
  // how much of the level it came from is left here: 1 ahead of the front, 0 once it has passed. Each
  // front's soft edge starts wholly before its first cell and ends wholly past its last, so the first
  // frame is exactly the old level and the last the new one (Qodo 0d9f4eaa: no jump at either end).
  let left: number;
  if (f.kind === 1) {
    left = fs === 0 && ts === 0
      ? soft((FADE_SOFT / 2 + fade * (1 - FADE_SOFT) - f.progress) / FADE_SOFT + 0.5) // mist fading to clear, cell by cell
      : soft((d - (f.progress * (reach + FRONT_SOFT) - FRONT_SOFT / 2)) / FRONT_SOFT + 0.5); // a clear: out from the anchor
  } else {
    left = 1 - soft((d - ((1 - f.progress) * (reach + FRONT_SOFT) - FRONT_SOFT / 2)) / FRONT_SOFT + 0.5); // a refog: in from the far edge
  }
  return { storm: fs * left + ts * (1 - left), mist: fm * left + tm * (1 - left), teal: f.kind === 1 && fs > 0 && left > 0 };
}

interface Clump { dir: Vec3; size: number; sats: { dir: Vec3; size: number }[] }

/**
 * A planet's fog sky, planned once from its surface and seed: its sites (SKY_SITES), each layer's gaps,
 * and each site's clump (where its puffs sit, and their sizes at full cover). `at(files)` turns the files'
 * fog into puffs.
 */
export class CloudPlan {
  /** Sites, and per site the file that owns the grid cell nearest it (-1: none). */
  private readonly n: number;
  private readonly owner: Int32Array;
  private readonly centres: Float64Array;
  /** Per layer, per site: 1 where that layer leaves the site open (its gap). */
  private readonly gap: { storm: Uint8Array; mist: Uint8Array };
  private readonly clumps: { storm: Clump[]; mist: Clump[] };
  /** Per site: its angle from its file's anchor (rad), and its place in a mist fade (0..1). */
  private readonly fromAnchor: Float64Array;
  private readonly fade: Float64Array;

  constructor(readonly plan: SurfacePlan, readonly seed: number) {
    const t = plan.territory, cells = t.cells, n = (this.n = Math.max(cells, SKY_SITES));
    const cc = centresOf(cells), c = (this.centres = centresOf(n));
    const dotCell = (i: number, j: number) => c[3 * i]! * cc[3 * j]! + c[3 * i + 1]! * cc[3 * j + 1]! + c[3 * i + 2]! * cc[3 * j + 2]!;
    // each site's cell: itself on a grid as fine as the sites, else the nearest (ties: the lower cell)
    const cellOf = (i: number) => {
      if (n === cells) return i;
      let best = 0;
      for (let j = 1; j < cells; j++) if (dotCell(i, j) > dotCell(i, best)) best = j;
      return best;
    };
    this.owner = new Int32Array(n);
    this.fromAnchor = new Float64Array(n);
    this.fade = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const k = (this.owner[i] = cells > 0 ? t.owner[cellOf(i)]! : -1);
      this.fromAnchor[i] = k >= 0 ? Math.acos(Math.min(1, Math.max(-1, dotCell(i, t.anchor[k]!)))) : 0;
    }
    const idOf = (i: number) => (this.owner[i]! >= 0 ? plan.fileIds[this.owner[i]!]! : '');
    for (let i = 0; i < n; i++) this.fade[i] = hash01(`${MIST.id}|fade|${idOf(i)}|${i}`);
    this.gap = { storm: this.gaps(STORM, idOf), mist: this.gaps(MIST, idOf) };
    this.clumps = { storm: this.clumpsOf(STORM), mist: this.clumpsOf(MIST) };
  }

  /**
   * The sites each territory leaves open: the same share (1 - density, rounded) of every file's sites,
   * those with the lowest seeded rank (fog-cloud.js), so cover is density × the covered sites exactly.
   * Sites no file owns are one territory of their own.
   */
  private gaps(layer: CloudLayer, idOf: (i: number) => string): Uint8Array {
    const gap = new Uint8Array(this.n);
    const byFile = new Map<number, number[]>();
    for (let i = 0; i < this.n; i++) {
      const k = this.owner[i]!;
      const cells = byFile.get(k);
      if (cells) cells.push(i); else byFile.set(k, [i]);
    }
    for (const cells of byFile.values()) {
      const ranked = cells.map((i): [number, number] => [hash01(`${layer.id}|gap|${idOf(i)}|${i}`), i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const open = Math.round(cells.length * (1 - layer.density));
      for (let j = 0; j < open; j++) gap[ranked[j]![1]] = 1;
    }
    return gap;
  }

  /** Each site's clump at full cover (fog-cloud.js fogClouds' items, before the cover scales them). */
  private clumpsOf(layer: CloudLayer): Clump[] {
    const c = this.centres;
    return Array.from({ length: this.n }, (_, i) => {
      const h = (tag: string) => hash01(`${layer.id}|${tag}|${this.seed}|${i}`);
      const jit = (tag: string) => (h(tag) - 0.5) * 0.09;
      const [dx, dy, dz] = [c[3 * i]!, c[3 * i + 1]!, c[3 * i + 2]!];
      const size = layer.size * (0.85 + h('s') * 0.3);
      // satellites: lumpy edges and fill between neighbouring cells, round the cell in its tangent plane
      const el = Math.hypot(dz, dx) || 1;
      const [ex, ez] = [dz / el, -dx / el];
      const north: Vec3 = [dy * ez, dz * ex - dx * ez, -dy * ex];
      const [lo, hi] = layer.sats;
      const count = lo + Math.floor(h('n') * (hi - lo + 1));
      const sats = Array.from({ length: count }, (_, q) => {
        const ang = h(`a${q}`) * Math.PI * 2, off = 0.11 + h(`o${q}`) * 0.06;
        const e = Math.cos(ang) * 1.4 * layer.stretch * off, nn = Math.sin(ang) * 0.7 * off;
        return { dir: [dx + ex * e + north[0] * nn, dy + north[1] * nn, dz + ez * e + north[2] * nn] as Vec3, size: 0.5 + h(`z${q}`) * 0.25 };
      });
      return { dir: [dx + jit('x'), dy + jit('y'), dz + jit('z')], size, sats };
    });
  }

  /** The cover over every site for the files at a moment (in plan order). */
  covers(at: readonly FileFogAt[]): CellCover[] {
    const t = this.plan.territory, orphan = orphanLevel(at);
    return Array.from({ length: this.n }, (_, i) => {
      const k = this.owner[i]!;
      const f: FileFogAt = k >= 0 ? at[k]! : { level: orphan, from: orphan, kind: 0, progress: 0 };
      const cover = cellCover(f, this.fromAnchor[i]!, k >= 0 ? t.reach[k]! : 0, this.fade[i]!);
      if (this.gap.storm[i]) cover.storm = 0;
      if (this.gap.mist[i]) cover.mist = 0;
      if (cover.storm <= 0) cover.teal = false;
      return cover;
    });
  }

  /** The puffs over the planet for the files at a moment (in plan order). */
  at(at: readonly FileFogAt[]): FogSky {
    const cover = this.covers(at);
    const storm: Puff[] = [], teal: Puff[] = [], mist: Puff[] = [];
    const stormW = cover.map((x) => x.storm), mistW = cover.map((x) => x.mist);
    this.puffs(STORM, this.clumps.storm, stormW, (i) => (cover[i]!.teal ? teal : storm));
    this.puffs(MIST, this.clumps.mist, mistW, () => mist);
    const share = (w: number[]) => w.filter((x) => x > 0).length / this.n;
    return { storm, teal, mist, stormCover: share(stormW), mistCover: share(mistW) };
  }

  /** One layer's puffs: a clump per covered site, shrunk and lowered as its cover thins, each mass shaded as one dome. */
  private puffs(layer: CloudLayer, clumps: readonly Clump[], w: readonly number[], into: (i: number) => Puff[]): void {
    const anchors = this.anchors(layer, w);
    for (let i = 0; i < this.n; i++) {
      const k = w[i]!;
      if (k <= 0) continue;
      const cl = clumps[i]!, anchor = anchors[i]!;
      const size = cl.size * (0.4 + 0.6 * k); // a thinning front shrinks the puffs before they go
      const out = into(i);
      out.push({ dir: cl.dir, size, lift: layer.lift * (0.7 + 0.3 * k), flat: layer.flat, stretch: layer.stretch, float: layer.float, anchor });
      for (const s of cl.sats) out.push({ dir: s.dir, size: size * s.size, lift: layer.lift * 0.5, flat: layer.flat, stretch: layer.stretch, float: layer.float, anchor });
    }
  }

  /** Each covered site's mass anchor: connected covered sites form a mass, anchored below its centre by about its radius, so its dome normal tilts out to the edge. */
  private anchors(layer: CloudLayer, w: readonly number[]): (Vec3 | null)[] {
    const c = this.centres, nb = neighbours(this.n);
    const mass = new Int32Array(this.n).fill(-1);
    const out: (Vec3 | null)[] = new Array<Vec3 | null>(this.n).fill(null);
    for (let i = 0; i < this.n; i++) {
      if (w[i]! <= 0 || mass[i]! >= 0) continue;
      const cells: number[] = [], stack = [i];
      mass[i] = i;
      while (stack.length) {
        const j = stack.pop()!;
        cells.push(j);
        for (const q of nb[j]!) if (w[q]! > 0 && mass[q]! < 0) { mass[q] = i; stack.push(q); }
      }
      const s: Vec3 = [0, 0, 0];
      for (const j of cells) { s[0] += c[3 * j]!; s[1] += c[3 * j + 1]!; s[2] += c[3 * j + 2]!; }
      const len = Math.hypot(s[0], s[1], s[2]) || 1;
      const cen: Vec3 = [s[0] / len, s[1] / len, s[2] / len];
      let minDot = 1;
      for (const j of cells) minDot = Math.min(minDot, cen[0] * c[3 * j]! + cen[1] * c[3 * j + 1]! + cen[2] * c[3 * j + 2]!);
      const depth = 1 + layer.float - Math.min(0.5, Math.max(0.06, Math.acos(Math.min(1, minDot)) * 1.1));
      const anchor: Vec3 = [cen[0] * depth, cen[1] * depth, cen[2] * depth];
      for (const j of cells) out[j] = anchor;
    }
    return out;
  }
}
