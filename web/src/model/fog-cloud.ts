// Fog of war as cloud (art-direction §9, "fog of war is cloud", human, 2026-11-16), in the planets'
// original weather (#228; the human, 2026-11-25: "keep the same cloud visual language as before just make
// its coverage proportional… the puffs were smaller and blended into each other"): the asset viewer's
// cream weather (feature/asset-library mockups/asset-viewer/viewer.js WEATHER.cloud and rebuild(), ported
// as render/planet.ts buildWeather) over every fogged file's territory, its thin weather (WEATHER.thin)
// over every misted one (stored `haze`: read, not yet tested), and nothing over a clear one. The
// placement, gaps and fronts are #224's (from the viewer's fog-cloud.js); only the puffs changed. Pure: no
// three.js, no DOM, no clock; every choice is a seeded hash or noise of the planet's seed, the file and
// the site (principle 3), so the same fog and frame give the same puffs.
//
// - Sites: a Fibonacci grid as dense as the weather's for the layer's puff size (SKY_SITES at size 1), so
//   neighbouring puffs always overlap and a mass is one body. Each site belongs to the file owning the
//   nearest cell of the planet's #18 grid (256 cells on a scanned planet; a test fixture's coarser grid
//   works the same).
// - The clumps sit in the ground's own frame, so the cloud stays over its file instead of drifting with
//   the weather (render/fog.ts puts it on the surface's spin).
// - Cover: a site carries its layer where its file has that level and the weather's noise (merged masses
//   and east–west streaks) is over the planet's cut at the layer's density, so a fully fogged planet wears
//   the weather's own pattern, and a partly fogged one the part of it over its fogged files. A site's
//   cover depends on its own file alone, so a planet's cover is the sum of its fogged files' and tracks
//   their share; a fully reviewed planet has no cloud. Every file also keeps a floor of its own highest
//   sites (FLOOR), so a fogged file never lies wholly in clear sky (Rule 1).
// - Puffs: the weather's clump, a lead puff and satellites. A site's core (0 at a mass's edge, 1 deep
//   inside) sizes and lifts its lead, so a mass domes; edge sites get 2–3 satellites for a lumpy edge.
//   Core is the noise's rise over the cut, capped by the distance to the cloud's edge (a territory's
//   border or a front cuts a mass where the noise doesn't).
// - Masses: connected covered sites shade as one dome (the weather's mass anchors), split among seeded
//   mass cells so a heavy cover still reads as separate masses.
// - Events (model/fog.ts FileFogAt): a front between the level a file came from and the one it rests at.
//   A clear runs out from the file's anchor; the cloud still ahead of it is drawn in [OIII] teal (an
//   event, F5) and shrinks as the front passes, leaving the mist (or nothing) behind. Mist clearing (a
//   quiz passed: haze → clear) fades instead, site by site. A refog rolls the new level in from the
//   territory's far edge, with no teal (F6).
import { makeFbm3 } from '../render/noise.js';
import { hash01, orphanLevel, type FileFogAt, type Level, type SurfacePlan } from './fog.js';
import { centresOf, neighbours } from './territory.js';
import type { Vec3 } from './vec.js';

/**
 * A cloud layer's look (viewer.js WEATHER): `density`, the share of a file's sites that carry it (the
 * rest is its gap); `size` and `lift`, the weather's scales on the clump's puff size and dome height;
 * `float`, `flat` and `stretch`, the puff's base gap, radial squash and east–west stretch, in planet radii.
 */
export interface CloudLayer {
  id: string;
  density: number;
  size: number;
  lift: number;
  float: number;
  flat: number;
  stretch: number;
}

/**
 * Fogged: the cream weather, exactly the viewer's WEATHER.cloud (lush's, before #224); `density` is the
 * share of the planet's sites it covers when every file is fogged. 0.35 is the human's pick at the #228
 * checkpoint (option C, 2026-11-25): the weather's own masses with clear sky between them, through which
 * health shows; 0.9 (#224's cover) drew an overcast ball.
 */
export const CLOUD: CloudLayer = { id: 'cloud', density: 0.35, size: 1, lift: 1, float: 0.055, flat: 0.6, stretch: 1 };
/**
 * Misted: "a little cloud" (#228, the human: "clearly lighter"): the viewer's thin weather (WEATHER.thin,
 * ocean's before #224), its puffs 0.7× the cloud's and lower, flatter (0.4 for its 0.6) and far sparser
 * (0.07 of the sites against the cloud's 0.35, the human's final pick, 2026-11-25),
 * so the ground shows between them. It casts no shadow and takes only the cloud ramp's light steps, white
 * wherever lit (palette.fog.mist), so it is never dark.
 */
export const MIST: CloudLayer = { id: 'thin', density: 0.07, size: 0.7, lift: 0.5, float: 0.05, flat: 0.4, stretch: 1 };

/** Where clumps can sit: the weather's site grid (viewer.js rebuild: 1500 sites at size 1, 1500 / size² for smaller puffs), on every planet. */
export const SKY_SITES = 1500;

/** The weather's noise (viewer.js rebuild): a mass field at this frequency, and a latitude-stretched streak field. */
const MASS_FREQ = 2.0;
/** A lead puff (viewer.js clump): size base + core × spread + a seeded share of jitter, lift base + core × spread; both × the layer's. */
const LEAD = { size: 0.058, sizeCore: 0.04, sizeJitter: 0.01, lift: 0.2, liftCore: 0.9 } as const;
/** Satellites: 2–3 round a lead below `edge` core (a lumpy edge), else 1; offset 0.9–1.4 × its size, 0.5–0.75 × its size, half its lift. */
const SAT = { edge: 0.35, off: 0.9, offJitter: 0.5, size: 0.5, sizeJitter: 0.25, lift: 0.5 } as const;
/** How fast core rises with the noise over the cut (viewer.js: min(1, density × 7)); and how many sites in from a mass's edge it reaches 1. */
const CORE_GAIN = 7;
const EDGE_SITES = 3;
/** How far a lead puff strays from its site, either way (viewer.js: ±0.025). */
const JITTER = 0.05;
/**
 * Masses: covered sites split among this many seeded centres (the nearest to each), so a heavy cover still
 * reads as separate domed masses, as the weather's do, not one dome round the planet; the centres jitter by
 * MASS_JITTER and each site's direction is warped by noise (amp at freq) so the masses' borders wander.
 */
const MASS_CELLS = 28;
const MASS_JITTER = 0.4;
const MASS_WARP = { amp: 0.6, freq: 2.5 } as const;

/**
 * The least of a file's own sites a layer covers, as a share of its density: the file's highest sites in
 * the noise, wherever the weather's cut falls, so a file never lies wholly in clear sky (Rule 1: a fogged
 * file never looks reviewed).
 */
const FLOOR = 0.5;

/** How softly a front thins the cloud, rad (fog-cloud.js FRONT_SOFT). */
export const FRONT_SOFT = 0.1;
/** How softly a site's mist goes while mist fades (a share of the fade's length). */
export const FADE_SOFT = 0.15;

/** One puff: a direction from the planet's centre (ground frame, not normalised), its shape, and its mass's dome anchor (null: none). */
export interface Puff { dir: Vec3; size: number; lift: number; flat: number; stretch: number; float: number; anchor: Vec3 | null }

type PuffShape = Pick<Puff, 'size' | 'lift' | 'flat' | 'stretch' | 'float'>;

/**
 * How far a puff's centre sits from the planet's centre, in planet radii (the weather's put(),
 * render/planet.ts). A puff is drawn as the unit sphere scaled by size × stretch east, size × flat up
 * and size north (render/fog.ts puffMatrix), centred here.
 */
export function puffRise(p: PuffShape): number {
  return 1 + p.float + p.size * p.flat * (0.75 + p.lift * 0.5);
}

/** The farthest point of a puff from the planet's centre, in planet radii: the top of its ellipsoid, or its flank when the puff is wide and flat. */
function puffTop(p: PuffShape): number {
  const r = puffRise(p), a = p.size * Math.max(p.stretch, 1), b = p.size * p.flat;
  // |centre + point|² over the ellipsoid, with s the sine of the point's elevation: a² + r² + 2rbs - (a² - b²)s²
  const s = a > b ? Math.min(1, (r * b) / (a * a - b * b)) : 1;
  return Math.sqrt(a * a * (1 - s * s) + (r + b * s) ** 2);
}

/** The farthest any of a layer's puffs reaches, in planet radii: a full core's biggest lead puff at full cover, or its biggest satellite. */
export function layerTop(layer: CloudLayer): number {
  const size = layer.size * (LEAD.size + LEAD.sizeCore + LEAD.sizeJitter), lift = layer.lift * (LEAD.lift + LEAD.liftCore);
  const shape = { flat: layer.flat, stretch: layer.stretch, float: layer.float };
  return Math.max(puffTop({ ...shape, size, lift }), puffTop({ ...shape, size: size * (SAT.size + SAT.sizeJitter), lift: lift * SAT.lift }));
}

/**
 * The fog sky's top: how far the cloud (its domes past the limb included) or the mist can reach from a
 * planet's centre, in planet radii. A drone circling a planet clears it (drones/place.ts homeBody),
 * whatever the planet's fog, since any file can be refogged.
 */
export const FOG_SKY_TOP = Math.max(layerTop(CLOUD), layerTop(MIST));

/** A planet's fog sky at a moment: the cloud, the part of it that is clearing (drawn teal), and the mist. */
export interface FogSky {
  cloud: Puff[];
  teal: Puff[];
  mist: Puff[];
  /** Sites carrying cloud (teal included), and mist, over all sites: the cover measures. */
  cloudCover: number;
  mistCover: number;
}

/** What each level puts over a site at rest: [cloud, mist]. */
const OVER: Readonly<Record<Level, readonly [number, number]>> = { 0: [0, 0], 1: [0, 1], 2: [1, 0] };
const soft = (x: number) => Math.min(1, Math.max(0, x));

/** A site's cover at a moment: how much cloud and mist are left over it (0..1), and whether the cloud is clearing. */
export interface CellCover { cloud: number; mist: number; teal: boolean }

/**
 * The cover over one site of a file at `f`: `d` the site's angle from the file's anchor, `reach` the
 * territory's (model/territory.ts), `fade` the site's own place in a mist fade (0..1).
 */
export function cellCover(f: FileFogAt, d: number, reach: number, fade: number): CellCover {
  const [tc, tm] = OVER[f.level];
  if (f.kind === 0) return { cloud: tc, mist: tm, teal: false };
  const [fc, fm] = OVER[f.from];
  // how much of the level it came from is left here: 1 ahead of the front, 0 once it has passed. Each
  // front's soft edge starts wholly before its first site and ends wholly past its last, so the first
  // frame is exactly the old level and the last the new one (Qodo 0d9f4eaa: no jump at either end).
  let left: number;
  if (f.kind === 1) {
    left = fc === 0 && tc === 0
      ? soft((FADE_SOFT / 2 + fade * (1 - FADE_SOFT) - f.progress) / FADE_SOFT + 0.5) // mist fading to clear, site by site
      : soft((d - (f.progress * (reach + FRONT_SOFT) - FRONT_SOFT / 2)) / FRONT_SOFT + 0.5); // a clear: out from the anchor
  } else {
    left = 1 - soft((d - ((1 - f.progress) * (reach + FRONT_SOFT) - FRONT_SOFT / 2)) / FRONT_SOFT + 0.5); // a refog: in from the far edge
  }
  return { cloud: fc * left + tc * (1 - left), mist: fm * left + tm * (1 - left), teal: f.kind === 1 && fc > 0 && left > 0 };
}

/** A site's clump: its lead's direction and tangent frame, and its seeded shares. */
interface Clump {
  dir: Vec3;
  east: Vec3;
  north: Vec3;
  /** The lead's size jitter (0..1) and its satellite count's share (0..1). */
  size: number;
  count: number;
  /** Up to three satellites: angle round the lead (rad), and offset and size shares (0..1). */
  sats: readonly { ang: number; off: number; size: number }[];
}

/**
 * One layer's sites, planned once: a Fibonacci grid as dense as the weather's for its puff size (viewer.js
 * rebuild: 1500 / size² sites), each site's file, clump and mass cell, and the layer's gaps and noise core.
 */
class SkyGrid {
  readonly n: number;
  readonly centres: Float64Array;
  /** Per site: the file owning the grid cell nearest it (-1: none), its angle from that file's anchor (rad), its place in a mist fade (0..1). */
  readonly owner: Int32Array;
  readonly fromAnchor: Float64Array;
  readonly fade: Float64Array;
  /** Per site: 1 where the layer leaves it open (its gap); its core from the noise alone; its mass cell. */
  readonly gap: Uint8Array;
  readonly noiseCore: Float64Array;
  readonly massCell: Int32Array;
  readonly clumps: Clump[];

  constructor(plan: SurfacePlan, seed: number, readonly layer: CloudLayer) {
    const t = plan.territory, cells = t.cells, n = (this.n = Math.max(cells, Math.round(SKY_SITES / layer.size ** 2)));
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
      this.fade[i] = hash01(`${layer.id}|fade|${k >= 0 ? plan.fileIds[k]! : ''}|${i}`);
    }
    // the weather's density (viewer.js rebuild): merged masses or east–west streaks, whichever is denser
    const mass = makeFbm3(seed * 31 + 5), streak = makeFbm3(seed * 17 + 9);
    const raw = Float64Array.from({ length: n }, (_, i) => {
      const [x, y, z] = [c[3 * i]!, c[3 * i + 1]!, c[3 * i + 2]!];
      return Math.max(mass(x * MASS_FREQ + 4, y * MASS_FREQ, z * MASS_FREQ), streak(x * 0.9, y * 6.0 + 2, z * 0.9));
    });
    // the weather's cut (viewer.js: a quantile of the field), here at the layer's density over the whole planet
    const byRaw = (a: number, b: number) => raw[a]! - raw[b]! || a - b;
    const all = Array.from({ length: n }, (_, i) => i).sort(byRaw);
    const cut = raw[all[Math.min(n - 1, Math.round(n * (1 - layer.density)))]!]!;
    // gaps: every site under the cut, except each file's floor, its highest sites, so every file's cloud shows (Rule 1)
    this.gap = Uint8Array.from(raw, (r) => (r < cut ? 1 : 0));
    const byFile = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const sites = byFile.get(this.owner[i]!);
      if (sites) sites.push(i); else byFile.set(this.owner[i]!, [i]);
    }
    for (const sites of byFile.values()) {
      const ranked = [...sites].sort(byRaw).reverse();
      const floor = Math.max(1, Math.round(sites.length * layer.density * FLOOR));
      for (let j = 0; j < Math.min(floor, ranked.length); j++) this.gap[ranked[j]!] = 0;
    }
    // core from the noise: its rise over the cut (viewer.js: min(1, density × 7))
    this.noiseCore = raw.map((r) => Math.min(1, Math.max(0, (r - cut + 0.012) * CORE_GAIN)));
    // mass cells: the nearest of MASS_CELLS seeded centres to each site, its direction warped by noise so the borders wander
    const centre = Array.from({ length: MASS_CELLS }, (_, k): Vec3 => {
      const h = (tag: string) => hash01(`sky|mass|${tag}|${seed}|${k}`) - 0.5;
      const y = 1 - (2 * (k + 0.5)) / MASS_CELLS, r = Math.sqrt(1 - y * y), th = k * Math.PI * (3 - Math.sqrt(5));
      return [Math.cos(th) * r + h('x') * MASS_JITTER, y + h('y') * MASS_JITTER, Math.sin(th) * r + h('z') * MASS_JITTER];
    });
    const wx = makeFbm3(seed * 13 + 1), wy = makeFbm3(seed * 19 + 2), wz = makeFbm3(seed * 23 + 3);
    this.massCell = Int32Array.from({ length: n }, (_, i) => {
      const [x, y, z] = [c[3 * i]!, c[3 * i + 1]!, c[3 * i + 2]!], f = MASS_WARP.freq;
      const d: Vec3 = [x + (wx(x * f, y * f, z * f) - 0.5) * MASS_WARP.amp, y + (wy(x * f, y * f, z * f) - 0.5) * MASS_WARP.amp, z + (wz(x * f, y * f, z * f) - 0.5) * MASS_WARP.amp];
      let best = 0, bestDot = -Infinity;
      centre.forEach((m, k) => { const v = (d[0] * m[0] + d[1] * m[1] + d[2] * m[2]) / Math.hypot(m[0], m[1], m[2]); if (v > bestDot) { bestDot = v; best = k; } });
      return best;
    });
    this.clumps = Array.from({ length: n }, (_, i) => {
      const h = (tag: string) => hash01(`${layer.id}|${tag}|${seed}|${i}`);
      const dir: Vec3 = [c[3 * i]! + (h('x') - 0.5) * JITTER, c[3 * i + 1]! + (h('y') - 0.5) * JITTER, c[3 * i + 2]! + (h('z') - 0.5) * JITTER];
      const l = Math.hypot(dir[0], dir[1], dir[2]);
      const [dx, dy, dz] = [dir[0] / l, dir[1] / l, dir[2] / l];
      // the lead's tangent frame: east = y × d (at a pole, x), north = d × east
      const el = Math.hypot(dz, dx);
      const east: Vec3 = el > 1e-9 ? [dz / el, 0, -dx / el] : [1, 0, 0];
      const north: Vec3 = [dy * east[2] - dz * east[1], dz * east[0] - dx * east[2], dx * east[1] - dy * east[0]];
      const sats = [0, 1, 2].map((q) => ({ ang: h(`a${q}`) * Math.PI * 2, off: h(`o${q}`), size: h(`z${q}`) }));
      return { dir, east, north, size: h('s'), count: h('n'), sats };
    });
  }

  /** The cover over every site for the files at a moment (in plan order); `orphan`, the level of sites no file owns. */
  covers(plan: SurfacePlan, at: readonly FileFogAt[], orphan: Level): CellCover[] {
    const t = plan.territory;
    return Array.from({ length: this.n }, (_, i) => {
      const k = this.owner[i]!;
      const f: FileFogAt = k >= 0 ? at[k]! : { level: orphan, from: orphan, kind: 0, progress: 0 };
      const cover = cellCover(f, this.fromAnchor[i]!, k >= 0 ? t.reach[k]! : 0, this.fade[i]!);
      if (this.gap[i]) { cover.cloud = 0; cover.mist = 0; }
      if (cover.cloud <= 0) cover.teal = false;
      return cover;
    });
  }

  /** The layer's puffs: the weather's clump per covered site, domed by its core, shrunk and lowered as its cover thins, each mass shaded as one dome. */
  puffs(w: readonly number[], into: (i: number) => Puff[]): void {
    const layer = this.layer, anchors = this.anchors(w), edge = this.edgeDistance(w);
    const shape = { flat: layer.flat, stretch: layer.stretch, float: layer.float };
    for (let i = 0; i < this.n; i++) {
      const k = w[i]!;
      if (k <= 0) continue;
      const cl = this.clumps[i]!, anchor = anchors[i]!;
      const core = Math.min(this.noiseCore[i]!, (edge[i]! - 1) / EDGE_SITES);
      // a thinning front shrinks and lowers the puffs before they go
      const size = layer.size * (LEAD.size + core * LEAD.sizeCore + cl.size * LEAD.sizeJitter) * (0.4 + 0.6 * k);
      const lift = layer.lift * (LEAD.lift + core * LEAD.liftCore) * (0.7 + 0.3 * k);
      const out = into(i);
      out.push({ dir: cl.dir, size, lift, ...shape, anchor });
      const count = core < SAT.edge ? 2 + Math.floor(cl.count * 2) : 1;
      for (const s of cl.sats.slice(0, count)) {
        const off = size * (SAT.off + s.off * SAT.offJitter);
        const e = Math.cos(s.ang) * off * 1.4 * layer.stretch, nn = Math.sin(s.ang) * off * 0.7;
        const dir: Vec3 = [cl.dir[0] + cl.east[0] * e + cl.north[0] * nn, cl.dir[1] + cl.east[1] * e + cl.north[1] * nn, cl.dir[2] + cl.east[2] * e + cl.north[2] * nn];
        out.push({ dir, size: size * (SAT.size + s.size * SAT.sizeJitter), lift: lift * SAT.lift, ...shape, anchor });
      }
    }
  }

  /**
   * Each site's distance in sites from the nearest one without this layer (1: on the cloud's edge), up to
   * EDGE_SITES + 1; 0 off the layer. Mass cells only shade (anchors): two masses meeting keep their puffs
   * full size, so the seam between them has no pinholes.
   */
  private edgeDistance(w: readonly number[]): Int32Array {
    const nb = neighbours(this.n), far = EDGE_SITES + 1;
    const dist = new Int32Array(this.n).fill(far);
    let front: number[] = [];
    for (let i = 0; i < this.n; i++) if (w[i]! <= 0) { dist[i] = 0; front.push(i); }
    for (let d = 1; d < far && front.length > 0; d++) {
      const next: number[] = [];
      for (const j of front) for (const q of nb[j]!) if (dist[q]! > d) { dist[q] = d; next.push(q); }
      front = next;
    }
    return dist;
  }

  /** Each covered site's mass anchor: connected covered sites of one mass cell form a mass, anchored below its centre by about its radius, so its dome normal tilts out to the edge. */
  private anchors(w: readonly number[]): (Vec3 | null)[] {
    const c = this.centres, nb = neighbours(this.n);
    const mass = new Int32Array(this.n).fill(-1);
    const out: (Vec3 | null)[] = new Array<Vec3 | null>(this.n).fill(null);
    for (let i = 0; i < this.n; i++) {
      if (w[i]! <= 0 || mass[i]! >= 0) continue;
      const sites: number[] = [], stack = [i];
      mass[i] = i;
      while (stack.length) {
        const j = stack.pop()!;
        sites.push(j);
        for (const q of nb[j]!) if (w[q]! > 0 && mass[q]! < 0 && this.massCell[q] === this.massCell[i]) { mass[q] = i; stack.push(q); }
      }
      const s: Vec3 = [0, 0, 0];
      for (const j of sites) { s[0] += c[3 * j]!; s[1] += c[3 * j + 1]!; s[2] += c[3 * j + 2]!; }
      const len = Math.hypot(s[0], s[1], s[2]) || 1;
      const cen: Vec3 = [s[0] / len, s[1] / len, s[2] / len];
      let minDot = 1;
      for (const j of sites) minDot = Math.min(minDot, cen[0] * c[3 * j]! + cen[1] * c[3 * j + 1]! + cen[2] * c[3 * j + 2]!);
      const depth = 1 + this.layer.float - Math.min(0.5, Math.max(0.06, Math.acos(Math.min(1, minDot)) * 1.1));
      const anchor: Vec3 = [cen[0] * depth, cen[1] * depth, cen[2] * depth];
      for (const j of sites) out[j] = anchor;
    }
    return out;
  }
}

/**
 * A planet's fog sky, planned once from its surface and seed: each layer's sites, gaps and clumps
 * (SkyGrid). `at(files)` turns the files' fog into puffs.
 */
export class CloudPlan {
  private readonly grids: { cloud: SkyGrid; mist: SkyGrid };

  constructor(readonly plan: SurfacePlan, readonly seed: number) {
    this.grids = { cloud: new SkyGrid(plan, seed, CLOUD), mist: new SkyGrid(plan, seed, MIST) };
  }

  /** Each layer's site count (its sites are centresOf(n)), and each site's file (-1: none). */
  sites(layer: 'cloud' | 'mist'): number { return this.grids[layer].n; }
  owners(layer: 'cloud' | 'mist'): Readonly<Int32Array> { return this.grids[layer].owner; }

  /** The cover over every site of a layer's grid for the files at a moment (in plan order). */
  covers(at: readonly FileFogAt[], layer: 'cloud' | 'mist'): CellCover[] {
    return this.grids[layer].covers(this.plan, at, orphanLevel(at));
  }

  /** The puffs over the planet for the files at a moment (in plan order). */
  at(at: readonly FileFogAt[]): FogSky {
    const cloudCover = this.covers(at, 'cloud'), mistW = this.covers(at, 'mist').map((x) => x.mist);
    const cloud: Puff[] = [], teal: Puff[] = [], mist: Puff[] = [];
    const cloudW = cloudCover.map((x) => x.cloud);
    this.grids.cloud.puffs(cloudW, (i) => (cloudCover[i]!.teal ? teal : cloud));
    this.grids.mist.puffs(mistW, () => mist);
    const share = (w: number[]) => w.filter((x) => x > 0).length / w.length;
    return { cloud, teal, mist, cloudCover: share(cloudW), mistCover: share(mistW) };
  }
}
