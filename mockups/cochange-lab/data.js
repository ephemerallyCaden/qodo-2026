// The co-change lab's data (#211, R9): a mock repo of six top-level folders (the planets), the files
// on them, a commit history, and what #211's scan would compute from it: co-change pairs (Jaccard over
// the commits each file was in, above a threshold, capped per file), their three strength steps, a
// focused planet's or file's strongest partners, and the missing-pair flags of the latest change.
// Pure: no DOM, no three.js, no clock. The history comes from a seeded PRNG, so every run is the same.
import { Surface, SURFACE_CELLS, mulberry32 } from '../asset-viewer/fog-layout.js';

/**
 * The planets: a top-level folder each, one per health band (and all three healthy looks), at a size
 * (lines of code) and a place around the star. ring / fog / debris / beacon / drone put the other map
 * signals in the scene, so the lines and the flag are judged beside them.
 */
export const PLANETS = [
  { id: 'src', biome: 'lush', seed: 7, size: 1.0, pos: [0.2, 0.1, 0], drone: true },
  { id: 'web', biome: 'ocean', seed: 42, size: 0.78, pos: [4.6, 1.7, -4.2], fog: 0.5 },
  { id: 'test', biome: 'ice', seed: 21, size: 0.66, pos: [4.1, -1.25, 0.6] },
  { id: 'docs', biome: 'desert', seed: 3, size: 0.6, pos: [-4.6, 1.5, -3.6], ring: 'thin', beacon: true },
  { id: 'scripts', biome: 'toxic', seed: 13, size: 0.55, pos: [-3.3, -1.55, 1.0], debris: 3 },
  { id: 'bench', biome: 'lava', seed: 11, size: 0.5, pos: [0.9, 3.4, -9.5] },
];
/** The star (the repo), up and back, upper left, as in the viewer's system view. */
export const STAR = { pos: [-7.2, 5.6, -18], size: 1.6 };

/** The files, by planet. Each file's second-level folder is its continent (#18). */
export const FILES = [
  'src/core/fog.ts', 'src/core/territory.ts', 'src/scan/window.ts', 'src/scan/numstat.ts', 'src/cli/main.ts', 'src/cli/open.ts', 'src/attrib/claude.ts',
  'web/src/model/fog.ts', 'web/src/render/fog.ts', 'web/src/view.ts', 'web/src/labels/place.ts',
  'test/fog.test.ts', 'test/scan.test.ts', 'test/cli.test.ts', 'test/golden/snapshot.json',
  'docs/fog-of-war.md', 'docs/cli.md',
  'scripts/release.sh', 'scripts/golden.mjs',
  'bench/scan.bench.ts',
];
export const planetOf = (file) => file.slice(0, file.indexOf('/'));

/**
 * The kinds of change the history is made of: how often each happens (weight) and the chance each
 * file is in one. A commit is one of these, so files in the same kind co-change.
 */
const KINDS = [
  { weight: 10, files: { 'src/core/fog.ts': 0.95, 'web/src/model/fog.ts': 0.85, 'web/src/render/fog.ts': 0.4, 'src/core/territory.ts': 0.3, 'test/fog.test.ts': 0.6, 'docs/fog-of-war.md': 0.22 } },
  { weight: 9, files: { 'src/scan/window.ts': 0.9, 'src/scan/numstat.ts': 0.55, 'test/scan.test.ts': 0.85, 'test/golden/snapshot.json': 0.5, 'bench/scan.bench.ts': 0.3, 'scripts/golden.mjs': 0.2 } },
  { weight: 6, files: { 'src/cli/main.ts': 0.9, 'src/cli/open.ts': 0.6, 'test/cli.test.ts': 0.6, 'docs/cli.md': 0.35, 'scripts/release.sh': 0.25 } },
  { weight: 6, files: { 'web/src/view.ts': 0.9, 'web/src/labels/place.ts': 0.7, 'web/src/render/fog.ts': 0.3 } },
  { weight: 3, files: { 'src/attrib/claude.ts': 0.9, 'test/golden/snapshot.json': 0.5 } },
  { weight: 2, files: { 'scripts/release.sh': 0.9, 'docs/cli.md': 0.3 } },
];
export const COMMITS = 160;
export const HISTORY_SEED = 211;

/** The mock history: COMMITS commits, each a sorted list of the files it touched (never empty). */
export function history(n = COMMITS, seed = HISTORY_SEED) {
  const rnd = mulberry32(seed);
  const total = KINDS.reduce((s, k) => s + k.weight, 0);
  const out = [];
  while (out.length < n) {
    let r = rnd() * total;
    const kind = KINDS.find((k) => (r -= k.weight) < 0) ?? KINDS.at(-1);
    const files = Object.entries(kind.files).filter(([, p]) => rnd() < p).map(([f]) => f).sort();
    if (files.length) out.push(files);
  }
  return out;
}

/** #211's scan settings: a pair is kept above THRESHOLD, and only in its files' top CAP. */
export const THRESHOLD = 0.15;
export const CAP = 5;
/** The three strength steps (weak, mid, strong): each step's lowest Jaccard. */
export const STEPS = [0.15, 0.3, 0.5];
export const step = (strength) => (strength >= STEPS[2] ? 2 : strength >= STEPS[1] ? 1 : 0);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Co-change pairs from a history: for each pair of files, the commits with both over the commits with
 * either (Jaccard). Kept when at least THRESHOLD and in either file's top CAP (by strength, then name).
 * Returns [{ a, b, both, strength }] with a < b, strongest first.
 */
export function pairs(commits, { threshold = THRESHOLD, cap = CAP } = {}) {
  const seen = new Map(); // file -> commits it's in
  const both = new Map(); // 'a\u0000b' -> commits with both
  for (const files of commits) {
    for (const f of files) seen.set(f, (seen.get(f) ?? 0) + 1);
    for (let i = 0; i < files.length; i++) for (let j = i + 1; j < files.length; j++) {
      const [a, b] = files[i] < files[j] ? [files[i], files[j]] : [files[j], files[i]];
      const k = `${a}\u0000${b}`;
      both.set(k, (both.get(k) ?? 0) + 1);
    }
  }
  const all = [...both].map(([k, n]) => {
    const [a, b] = k.split('\u0000');
    return { a, b, both: n, strength: n / (seen.get(a) + seen.get(b) - n) };
  }).filter((p) => p.strength >= threshold);
  const order = (x, y) => y.strength - x.strength || cmp(x.a, y.a) || cmp(x.b, y.b);
  all.sort(order);
  const top = new Map(); // file -> its kept pairs so far
  const keep = new Set();
  for (const p of all) for (const f of [p.a, p.b]) {
    const n = top.get(f) ?? 0;
    if (n < cap) { top.set(f, n + 1); keep.add(p); }
  }
  return all.filter((p) => keep.has(p));
}

/** A file's partners: [{ file, strength, step }], strongest first (then by name), at most `max`. */
export function filePartners(ps, file, max = CAP) {
  return ps.filter((p) => p.a === file || p.b === file)
    .map((p) => ({ file: p.a === file ? p.b : p.a, strength: p.strength, step: step(p.strength) }))
    .sort((x, y) => y.strength - x.strength || cmp(x.file, y.file)).slice(0, max);
}

/**
 * A file's partners grouped by planet, for drawing: one line per partner planet, at its strongest
 * partner file's step. Returns [{ planet, strength, step, files: filePartners entries }], strongest
 * first; the file's own planet is one of them when a partner lives beside it.
 */
export function filePartnerPlanets(ps, file, max = CAP) {
  const by = new Map();
  for (const p of filePartners(ps, file, max)) {
    const k = planetOf(p.file);
    if (!by.has(k)) by.set(k, { planet: k, strength: p.strength, step: p.step, files: [] });
    by.get(k).files.push(p);
  }
  return [...by.values()];
}

/**
 * A planet's partner planets: for each other planet, its strongest file pair with this one (so a
 * line's step is the strongest coupling it stands for), strongest first, at most `max`.
 * Returns [{ planet, strength, step, a, b }] (a on the focused planet, b on the partner).
 */
export function planetPartners(ps, planet, max = 4) {
  const best = new Map();
  for (const p of ps) {
    const [pa, pb] = [planetOf(p.a), planetOf(p.b)];
    if (pa === pb || (pa !== planet && pb !== planet)) continue;
    const [a, b] = pa === planet ? [p.a, p.b] : [p.b, p.a];
    const other = planetOf(b);
    if (!best.has(other) || best.get(other).strength < p.strength) best.set(other, { planet: other, strength: p.strength, step: step(p.strength), a, b });
  }
  return [...best.values()].sort((x, y) => y.strength - x.strength || cmp(x.planet, y.planet)).slice(0, max);
}

/** The latest change in the demo: the fog core and its test, but not the view's fog model. */
export const LATEST_CHANGE = ['src/core/fog.ts', 'test/fog.test.ts'];
/** A partner left out of a change is flagged when it's at least this strong (the strong step). */
export const FLAG_MIN = STEPS[2];

/**
 * The missing-pair flags of a change (#211 AC4): every file not in the change whose partner in it is
 * at least FLAG_MIN, "usually changes with X". One flag per left-out file, for its strongest such
 * partner. Returns [{ file, with, strength }] by file name.
 */
export function missingPairs(ps, change, min = FLAG_MIN) {
  const touched = new Set(change);
  const flags = new Map();
  for (const p of ps) {
    if (p.strength < min || touched.has(p.a) === touched.has(p.b)) continue;
    const [left, x] = touched.has(p.a) ? [p.b, p.a] : [p.a, p.b];
    const cur = flags.get(left);
    if (!cur || cur.strength < p.strength || (cur.strength === p.strength && x < cur.with)) flags.set(left, { file: left, with: x, strength: p.strength });
  }
  return [...flags.values()].sort((x, y) => cmp(x.file, y.file));
}

/**
 * Each file's settlement on its planet's #18 grid: the files settle in FILES order, each continent
 * (second-level folder, or the planet's own root) seeded once, as layout() does. Returns Map file -> cell.
 */
export function settlements() {
  const out = new Map();
  for (const p of PLANETS) {
    const surface = new Surface(SURFACE_CELLS, p.id);
    for (const f of FILES.filter((x) => planetOf(x) === p.id)) {
      const parts = f.split('/');
      const continent = parts.length > 2 ? parts.slice(0, 2).join('/') : p.id;
      out.set(f, surface.claim(surface.seed(continent)));
    }
  }
  return out;
}

/** Everything the lab draws from, computed once. */
export function system() {
  const commits = history();
  const ps = pairs(commits);
  return { commits, pairs: ps, flags: missingPairs(ps, LATEST_CHANGE), cells: settlements() };
}
