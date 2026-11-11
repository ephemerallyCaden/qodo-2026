// Fog of war's data (R5; the fog lab's pick, D2d, is drawn by fog.js): #18's surface grid, the
// territory rule that shares a planet's surface among its files, the fog state over time (charting a
// file, a refog, the planet-clear pulse) and the cell texture the fog shader reads. Pure: no DOM, no
// three.js, no clock; everything is a function of its inputs. The product can reuse it as it is: feed
// it layout.json's settlements and the fog view instead of the demo planets.
//
// - The grid is #18's (PR #51): fibonacciCell(i, n) is src/core/contract/layout.ts's helper verbatim,
//   and Surface is src/core/layout/surface.ts's class (same tie-breaks, same order of operations).
//   Demo planets settle on it the way layout() places files: each folder's continent grows from its
//   seed cell and each file claims the free cell nearest it, once, at birth.
// - The territory rule (footprint(), 'territory'; the human's pick, computed in the renderer with
//   #18 unchanged): every grid cell is shared out among the planet's files in equal shares (±1 cell),
//   each grown round-robin from the file's own cell over neighbouring cells. A fully fogged planet is
//   then completely fogged, and the fogged share of the surface is the fogged share of the files.
//   It's derived each time from the settlements, so territories shift when files come and go; the
//   settlements never move. Each footprint has an anchor (its cell nearest its centroid): the fog
//   draws a parcel's middle from it and starts its event fronts there.

/** Cells on every planet's surface grid (#18 SURFACE_CELLS). */
export const SURFACE_CELLS = 256;

/**
 * Unit-sphere centre of cell `i` of `n` on a Fibonacci sphere: y runs from +1 (cell 0) to -1, and the
 * angle advances by the golden angle each step.
 */
export function fibonacciCell(i, n) {
  const y = n === 1 ? 0 : 1 - (2 * i) / (n - 1);
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = i * Math.PI * (3 - Math.sqrt(5));
  return [Math.cos(theta) * r, y, Math.sin(theta) * r];
}

const centres = new Map();
/** Unit-sphere centres of an n-cell grid, cached: x, y, z per cell. */
export function centresOf(n) {
  let c = centres.get(n);
  if (!c) {
    c = new Float64Array(3 * n);
    for (let i = 0; i < n; i++) c.set(fibonacciCell(i, n), 3 * i);
    centres.set(n, c);
  }
  return c;
}

export class Surface {
  constructor(cells, top) {
    this.cells = cells;
    this.taken = new Uint8Array(cells);
    this.free = cells;
    this.at = centresOf(cells);
    // per cell, the dot product with its nearest seed by angle (the largest), kept as seeds are added
    this.nearestSeed = new Float64Array(cells).fill(-Infinity);
    this.seeds = new Map(); // seed cell of every continent ever grown here
    this.addSeed(top, 0); // a top-level folder's own continent starts at the north pole
  }

  dot(a, b) {
    const c = this.at;
    return c[3 * a] * c[3 * b] + c[3 * a + 1] * c[3 * b + 1] + c[3 * a + 2] * c[3 * b + 2];
  }

  addSeed(dirId, cell) {
    this.seeds.set(dirId, cell);
    for (let i = 0; i < this.cells; i++) this.nearestSeed[i] = Math.max(this.nearestSeed[i], this.dot(i, cell));
  }

  /** A continent's seed, once: the free cell farthest by angle from every earlier seed (ties: the lower cell). */
  seed(dirId) {
    const known = this.seeds.get(dirId);
    if (known !== undefined) return known;
    let best = 0;
    for (let i = 0, bestNear = Infinity; i < this.cells; i++) {
      if (this.free > 0 && this.taken[i]) continue;
      if (this.nearestSeed[i] < bestNear) [best, bestNear] = [i, this.nearestSeed[i]];
    }
    this.addSeed(dirId, best);
    return best;
  }

  /** Claims the free cell nearest `from` by angle (ties: the lower cell), or null when the grid is full. */
  claim(from) {
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

  release(cell) {
    this.taken[cell] = 0;
    this.free++;
  }
}

// ---------------------------------------------------------------- demo planets, coverage, footprints, state
export const FOOTPRINTS = ['territory', 'cell'];
/** #33's FogReason values, in the order the shader's reason ids use. */
export const REASONS = ['agent', 'mixed', 'self-committed-agent-written', 'teammate', 'unknown', 'lineage-unknown'];
export const COVERAGES = [0, 0.25, 0.5, 0.75, 1];

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** FNV-1a over a string, then a finaliser: a stable 0..1 value per key. */
export function hash01(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * Demo planets: a folder mix and a file count. `src` is the default (the viewer's hero and the fog
 * lab's lineups); `docs` is a small planet with few files; `big` fills a quarter of the grid. Folder
 * weights set how often a new file lands in each folder; `reason` is the folder's usual reason.
 */
export const DEMO_PLANETS = {
  src: {
    files: 48,
    folders: [
      { id: 'src', weight: 4, reason: 'agent' },
      { id: 'src/core', weight: 6, reason: 'agent' },
      { id: 'src/cli', weight: 4, reason: 'self-committed-agent-written' },
      { id: 'src/state', weight: 3, reason: 'mixed' },
      { id: 'src/web', weight: 2, reason: 'unknown' },
    ],
  },
  docs: {
    files: 12,
    folders: [{ id: 'docs', weight: 3, reason: 'teammate' }, { id: 'docs/design', weight: 2, reason: 'agent' }],
  },
  big: {
    files: 64,
    folders: [
      { id: 'lib', weight: 3, reason: 'agent' }, { id: 'lib/a', weight: 3, reason: 'agent' }, { id: 'lib/b', weight: 3, reason: 'mixed' },
      { id: 'lib/c', weight: 2, reason: 'unknown' }, { id: 'lib/d', weight: 2, reason: 'lineage-unknown' }, { id: 'lib/e', weight: 1, reason: 'teammate' },
    ],
  },
};

/**
 * Settles a demo planet's files on the grid as #18 does: one birth per commit, the folder's
 * continent seeded at its first file, each file claiming the free cell nearest its continent's seed.
 * seed: the layout's seed (which folder each new file lands in, and the reasons). Returns
 * { kind, files: [{ id, folder, cell, rank, reason }], seeds: Map folder -> cell, overflow }.
 */
export function demoPlanet(kind = 'src', seed = 1, cells = SURFACE_CELLS) {
  const spec = DEMO_PLANETS[kind];
  const rnd = mulberry32(seed * 7919 + kind.length * 104729 + 3);
  const top = spec.folders[0].id;
  const surface = new Surface(cells, top);
  const total = spec.folders.reduce((s, f) => s + f.weight, 0);
  const files = [];
  const counts = new Map();
  // every folder gets its first file early (folders are born early), then births follow the weights
  const order = spec.folders.map((f) => f.id);
  while (order.length < spec.files) {
    let r = rnd() * total;
    const f = spec.folders.find((x) => (r -= x.weight) < 0) ?? spec.folders.at(-1);
    order.push(f.id);
  }
  for (const folder of order) {
    const k = counts.get(folder) ?? 0;
    counts.set(folder, k + 1);
    const id = `${folder}/f${k}`;
    const cell = surface.claim(surface.seed(folder));
    files.push({ id, folder, cell, rank: 0, reason: 'agent' });
  }
  // charting order: clustered by folder (a review covers a folder's agent work), mixed a little
  const folderRank = new Map(spec.folders.map((f) => [f.id, hash01(`${seed}:${f.id}`)]));
  for (const f of files) f.rank = folderRank.get(f.folder) + 0.9 * hash01(`${seed}:${f.id}`);
  // reasons: the folder's usual reason, with one in five files something else
  for (const f of files) {
    const usual = spec.folders.find((x) => x.id === f.folder).reason;
    const h = hash01(`${seed}:reason:${f.id}`);
    f.reason = h < 0.8 ? usual : REASONS[Math.floor(((h - 0.8) / 0.2) * REASONS.length)];
  }
  return { kind, seed, cells, files: files.filter((f) => f.cell !== null), seeds: surface.seeds, overflow: files.filter((f) => f.cell === null).length };
}

/** The files charted at a coverage level: the round(coverage x N) earliest in charting order. */
export function chartedAt(planet, coverage) {
  const n = Math.round(coverage * planet.files.length);
  const order = [...planet.files].sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : 1));
  return new Set(order.slice(0, n).map((f) => f.id));
}

// ---------------------------------------------------------------- footprints
const neighbourCache = new Map();
/** Each cell's neighbours on the grid: its 6 nearest cells, made symmetric. */
export function neighbours(n = SURFACE_CELLS) {
  if (neighbourCache.has(n)) return neighbourCache.get(n);
  const c = centresOf(n);
  const dot = (a, b) => c[3 * a] * c[3 * b] + c[3 * a + 1] * c[3 * b + 1] + c[3 * a + 2] * c[3 * b + 2];
  const sets = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < n; i++) {
    const near = Array.from({ length: n }, (_, j) => j).filter((j) => j !== i).sort((a, b) => dot(i, b) - dot(i, a) || a - b).slice(0, 6);
    for (const j of near) { sets[i].add(j); sets[j].add(i); }
  }
  const out = sets.map((s) => [...s].sort((a, b) => a - b));
  neighbourCache.set(n, out);
  return out;
}

/** The angle (rad) of the farthest point of the grid from its nearest cell centre (the covering radius). */
export function coverRadius(n = SURFACE_CELLS) {
  const c = centresOf(n);
  let worst = 0;
  const M = 20000;
  for (let k = 0; k < M; k++) {
    const y = 1 - (2 * (k + 0.5)) / M, r = Math.sqrt(1 - y * y), t = k * 2.399963229728653;
    const p = [Math.cos(t) * r, y, Math.sin(t) * r];
    let best = -2;
    for (let i = 0; i < n; i++) best = Math.max(best, p[0] * c[3 * i] + p[1] * c[3 * i + 1] + p[2] * c[3 * i + 2]);
    worst = Math.max(worst, Math.acos(Math.min(1, best)));
  }
  return worst;
}
export const COVER_256 = 0.169; // coverRadius(256), pinned by test/pure.test.mjs

/**
 * Which file owns each grid cell. cell: a file owns its own cell only (-1 elsewhere). territory:
 * equal shares (floor(n/N), the first n mod N files by cell one more), grown round-robin: each file
 * in turn claims the unclaimed cell next to its territory nearest its own cell (ties: the lower
 * cell); cells left over (a file boxed in early) go to the neighbouring territory that is smallest.
 * Returns { owner: Int16Array(n) of file indices, anchor: Int16Array(files), reach: Float64Array(files)
 * in rad }. anchor: the footprint's cell nearest its centroid (a file's own cell, for 'cell'); reach:
 * the angle from the anchor to the farthest point of the footprint (a front from the anchor that has
 * travelled reach has crossed all of it).
 */
export function footprint(planet, mode = 'territory') {
  const n = planet.cells;
  const c = centresOf(n);
  const dot = (a, b) => c[3 * a] * c[3 * b] + c[3 * a + 1] * c[3 * b + 1] + c[3 * a + 2] * c[3 * b + 2];
  const files = planet.files;
  const owner = new Int16Array(n).fill(-1);
  files.forEach((f, k) => (owner[f.cell] = k));
  if (mode === 'territory' && files.length) {
    const nb = neighbours(n);
    const byCell = files.map((f, k) => k).sort((a, b) => files[a].cell - files[b].cell);
    const quota = new Int32Array(files.length);
    byCell.forEach((k, j) => (quota[k] = Math.floor(n / files.length) + (j < n % files.length ? 1 : 0)));
    const size = new Int32Array(files.length).fill(1);
    const cellsOf = files.map((f) => [f.cell]);
    for (let grew = true; grew;) {
      grew = false;
      for (const k of byCell) {
        if (size[k] >= quota[k]) continue;
        let best = -1, bestDot = -Infinity;
        for (const m of cellsOf[k]) for (const j of nb[m]) {
          if (owner[j] !== -1) continue;
          const d = dot(j, files[k].cell);
          if (d > bestDot || (d === bestDot && j < best)) [best, bestDot] = [j, d];
        }
        if (best < 0) continue;
        owner[best] = k; size[k]++; cellsOf[k].push(best); grew = true;
      }
    }
    // leftovers: to the smallest neighbouring territory, repeated until every cell is owned
    for (let left = true; left;) {
      left = false;
      for (let i = 0; i < n; i++) {
        if (owner[i] !== -1) continue;
        let best = -1;
        for (const j of nb[i]) if (owner[j] !== -1 && (best < 0 || size[owner[j]] < size[best] || (size[owner[j]] === size[best] && owner[j] < best))) best = owner[j];
        if (best < 0) { left = true; continue; }
        owner[i] = best; size[best]++; cellsOf[best].push(i);
      }
    }
  }
  // anchor: the footprint's cell nearest its centroid (ties: the lower cell), where the parcel's
  // middle is drawn from (D2's tone and hatching, its "?") and where its event fronts start
  const sum = files.map(() => [0, 0, 0]);
  for (let i = 0; i < n; i++) if (owner[i] >= 0) for (let a = 0; a < 3; a++) sum[owner[i]][a] += c[3 * i + a];
  const anchor = new Int16Array(files.length).fill(-1), best = new Float64Array(files.length).fill(-Infinity);
  for (let i = 0; i < n; i++) {
    const k = owner[i];
    if (k < 0) continue;
    const d = c[3 * i] * sum[k][0] + c[3 * i + 1] * sum[k][1] + c[3 * i + 2] * sum[k][2];
    if (d > best[k]) [best[k], anchor[k]] = [d, i];
  }
  const reach = new Float64Array(files.length);
  for (let i = 0; i < n; i++) {
    const k = owner[i];
    if (k >= 0) reach[k] = Math.max(reach[k], Math.acos(Math.min(1, dot(i, anchor[k]))) + COVER_256);
  }
  return { mode, owner, reach, anchor };
}

// ---------------------------------------------------------------- state over time
/** Event durations (s), on their own clock (outside the loop lock, like the debris sweep). */
export const EVENT = { clear: 1.0, refog: 2.4, pulse: 0.9 };

/**
 * The fog state of a planet at time t. coverage: the charted share before any event (or `fogged`,
 * the ids fogged at rest); events:
 * [{ file (id), kind: 'clear' | 'refog', at (s) }]. A clear runs EVENT.clear seconds from `at`, then
 * the file is charted; a refog runs EVENT.refog seconds, then it's fogged. When a clear leaves the
 * planet with no fogged file, the pulse (the landing moment) runs from that file's footprint.
 * Returns { fogged: Set of ids at rest, active: Map id -> { kind: 1 clear | 2 refog, progress }, pulse: null | { file, progress } }.
 */
export function stateAt(planet, { coverage = 0.5, fogged: only = null, events = [], t = 0 } = {}) {
  const charted = chartedAt(planet, coverage);
  // `only`: the files fogged at rest, instead of the coverage's (the event scenes pick theirs)
  const fogged = new Set(only ?? planet.files.filter((f) => !charted.has(f.id)).map((f) => f.id));
  const active = new Map();
  let pulse = null;
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    const dur = EVENT[e.kind];
    const s = (t - e.at) / dur;
    if (s < 0) continue;
    if (s < 1) {
      active.set(e.file, { kind: e.kind === 'clear' ? 1 : 2, progress: s });
      if (e.kind === 'clear') fogged.add(e.file); // still fog ahead of the front
      continue;
    }
    if (e.kind === 'clear') fogged.delete(e.file);
    else fogged.add(e.file);
    if (e.kind === 'clear' && fogged.size === 0 && ![...active.values()].length) {
      const p = (t - e.at - dur) / EVENT.pulse;
      if (p < 1) pulse = { file: e.file, progress: p };
    }
  }
  for (const id of active.keys()) fogged.delete(id); // an active file is drawn by its event
  return { fogged, active, pulse };
}

/** Rows of the shader's cell texture (fog-glsl.js): 0 rest state, 1 event, 2 cell centre. */
export const TEX_ROWS = 3;
/**
 * The per-cell data the fog shader reads, as a Float32Array (cells x TEX_ROWS RGBA texels):
 * row 0 (fogged 0/1, reason id, owner's anchor cell, owner's reach), row 1 (event kind, progress,
 * owner's footprint size in cells, 0),
 * row 2 (cell centre x, y, z, 1 if a file owns the cell).
 */
export function cellData(planet, foot, state) {
  const n = planet.cells;
  const out = new Float32Array(n * TEX_ROWS * 4);
  const c = centresOf(n);
  const size = new Int32Array(planet.files.length);
  for (const k of foot.owner) if (k >= 0) size[k]++;
  for (let i = 0; i < n; i++) {
    const k = foot.owner[i];
    const f = k >= 0 ? planet.files[k] : null;
    const ev = f ? state.active.get(f.id) : null;
    out.set([f && state.fogged.has(f.id) ? 1 : 0, f ? REASONS.indexOf(f.reason) : 0, f ? foot.anchor[k] : i, f ? foot.reach[k] : COVER_256], i * 4);
    out.set([ev ? ev.kind : 0, ev ? ev.progress : 0, f ? size[k] : 0, 0], (n + i) * 4);
    out.set([c[3 * i], c[3 * i + 1], c[3 * i + 2], f ? 1 : 0], (2 * n + i) * 4);
  }
  return out;
}

/** The fogged share of the files and of the grid's cells (by footprint), at rest. */
export function shares(planet, foot, fogged) {
  const filesFogged = planet.files.filter((f) => fogged.has(f.id)).length / Math.max(1, planet.files.length);
  let cells = 0;
  for (let i = 0; i < planet.cells; i++) if (foot.owner[i] >= 0 && fogged.has(planet.files[foot.owner[i]].id)) cells++;
  return { files: filesFogged, cells: cells / planet.cells };
}

/** The two test-file moons of a demo planet: each is charted from this coverage on. */
export const MOON_CHARTED_FROM = [0.5, 0.75];

/**
 * The viewer's chart buttons, deterministic: the next fogged file in charting order (`chart one`),
 * the last charted one (`refog one`), and every fogged file (`chart all`). Files already in an event
 * are skipped.
 */
export function chartOrder(planet) {
  return [...planet.files].sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : 1));
}
export function nextToChart(planet, state) {
  return chartOrder(planet).find((f) => state.fogged.has(f.id) && !state.active.has(f.id)) ?? null;
}
export function lastCharted(planet, state) {
  return [...chartOrder(planet)].reverse().find((f) => !state.fogged.has(f.id) && !state.active.has(f.id)) ?? null;
}
export function allFogged(planet, state) {
  return chartOrder(planet).filter((f) => state.fogged.has(f.id) && !state.active.has(f.id));
}

const layouts = new Map();
/** A demo planet and its footprint, cached: { planet, foot }, what driveFog() (fog.js) takes as layout. */
export function demoLayout(kind = 'src', seed = 1, mode = 'territory') {
  const key = `${kind}|${seed}|${mode}`;
  if (!layouts.has(key)) {
    const planet = demoPlanet(kind, seed);
    layouts.set(key, { planet, foot: footprint(planet, mode) });
  }
  return layouts.get(key);
}
