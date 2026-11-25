// The directory view's model (#209, understanding mode U10): the snapshot's files as a folder tree,
// where each file and folder sits on the map, and its fog. Pure: no DOM, no three.js, no clock.
// A file's fog level (#201: fogged, haze = seen, clear = understood) comes from levelBy, the source the
// map's fog shader reads, so the tree and the map never disagree about a file. A folder counts its
// files by level and shows their mastery (masteryPercent, clear ÷ files); a planet's own folder shows
// the planet's count from the fog view, the one its info panel shows (test moons in, test data out).
// Without a usable fog view every file is fogged (AGENTS.md Rule 1).
import type { FogLevel, FogView } from '../../../src/core/contract/fog.js';
import type { LayoutV1 } from '../../../src/core/contract/layout.js';
import { masteryPercent } from '../../../src/core/mastery.js';
import type { DirId, FileId, Sha } from '../../../src/core/snapshot/types.js';
import { levelBy, planetTally, type FogTally, type Level } from '../model/fog.js';

/** What the directory view reads of the snapshot (GET /api/snapshot): its head and its folders' and files' paths, nothing else. */
export interface TreeSource { head: Sha; dirs: { id: DirId; path: string }[]; files: { id: FileId; path: string }[] }

/** Where a file or folder is on the map: the body the directory view focuses for it. */
export type Place =
  /** A file drawn on its planet's surface, at its cell. */
  | { kind: 'settlement'; planet: DirId; cell: number }
  /** A test file orbiting the planet that holds what it tests. */
  | { kind: 'moon'; planet: DirId }
  /** A file in a planet's folder that the map doesn't draw (a full surface, an overflowing moon, test data). */
  | { kind: 'unplaced'; planet: DirId }
  /** A folder that is a planet. */
  | { kind: 'planet'; planet: DirId }
  /** A folder that is a continent of a planet, or lies inside one, from the continent's seed cell. */
  | { kind: 'continent'; planet: DirId; cell: number }
  /** A root file or unmatched test, round the star. */
  | { kind: 'moonlet' }
  /** No body of its own (a folder above or outside every planet, a file in one): the map shows the star. */
  | { kind: 'star' };

export interface TreeFile { kind: 'file'; id: FileId; path: string; name: string; place: Place }
/**
 * A folder; `planet` is the planet it is drawn as (its own folder, not one inside it), with the number of
 * files the layout puts on it (surface, overflow and test moons, wherever they live), else null.
 */
export interface TreeDir { kind: 'dir'; path: string; name: string; place: Place; planet: { id: DirId; files: number } | null; children: TreeNode[] }
export type TreeNode = TreeFile | TreeDir;

/** Codepoint order (Rule 3: never localeCompare). */
const byCodepoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
/** A path's folder: '' at the top level. */
export const parentPath = (path: string): string => { const cut = path.lastIndexOf('/'); return cut < 0 ? '' : path.slice(0, cut); };

/** Each file's and folder's place, from the layout of the same scan. */
function placesOf(src: TreeSource, layout: LayoutV1): { file(id: FileId, path: string): Place; dir(path: string): Place; planet(path: string): TreeDir['planet'] } {
  const onSurface = new Map<string, { planet: DirId; cell: number }>();
  const moonOf = new Map<string, DirId>();
  const moonlets = new Set<string>(layout.star.moonlets.map((m) => m.fileId));
  const planetAt = new Map<string, DirId>();
  const continentOf = new Map<string, { planet: DirId; cell: number }>();
  const filesOn = new Map<DirId, number>();
  for (const p of layout.planets) {
    planetAt.set(p.path, p.dirId);
    filesOn.set(p.dirId, p.surface.settlements.length + p.surface.overflow + p.moons.length + p.moonOverflow);
    for (const s of p.surface.settlements) onSurface.set(s.fileId, { planet: p.dirId, cell: s.cell });
    for (const m of p.moons) moonOf.set(m.fileId, p.dirId);
    for (const c of p.surface.continents) if (c.dirId !== p.dirId) continentOf.set(c.dirId, { planet: p.dirId, cell: c.seedCell });
  }
  const dirIdAt = new Map<string, DirId>(src.dirs.map((d) => [d.path, d.id]));
  /** The planet a folder lies on: itself, or its nearest ancestor that is one. */
  const planetOf = (path: string): DirId | null => {
    for (let p = path; p !== ''; p = parentPath(p)) { const id = planetAt.get(p); if (id) return id; }
    return null;
  };
  return {
    file(id, path) {
      const s = onSurface.get(id);
      if (s) return { kind: 'settlement', planet: s.planet, cell: s.cell };
      const moon = moonOf.get(id);
      if (moon) return { kind: 'moon', planet: moon };
      if (moonlets.has(id)) return { kind: 'moonlet' };
      const planet = planetOf(parentPath(path));
      return planet ? { kind: 'unplaced', planet } : { kind: 'star' };
    },
    dir(path) {
      const planet = planetOf(path);
      if (!planet) return { kind: 'star' };
      // a folder below the planet's own is its continent, or inside one (#18: deeper folders fold into the second level)
      for (let p = path; planetAt.get(p) !== planet; p = parentPath(p)) {
        const c = continentOf.get(dirIdAt.get(p) ?? '');
        if (c?.planet === planet) return { kind: 'continent', planet, cell: c.cell };
      }
      return { kind: 'planet', planet };
    },
    planet: (path) => { const id = planetAt.get(path); return id ? { id, files: filesOn.get(id)! } : null; },
  };
}

function sortTree(d: TreeDir): void {
  d.children.sort((a, b) => (a.kind === b.kind ? byCodepoint(a.name, b.name) : a.kind === 'dir' ? -1 : 1));
  for (const c of d.children) if (c.kind === 'dir') sortTree(c);
}

/**
 * The folder tree of every file in the snapshot (Rule 1: none left out), folders before files, each in
 * codepoint order. The root (path '') is the repository itself and isn't a row.
 */
export function buildTree(src: TreeSource, layout: LayoutV1): TreeDir {
  const places = placesOf(src, layout);
  const root: TreeDir = { kind: 'dir', path: '', name: '', place: { kind: 'star' }, planet: null, children: [] };
  const dirs = new Map<string, TreeDir>([['', root]]);
  const dirAt = (path: string): TreeDir => {
    let d = dirs.get(path);
    if (d) return d;
    const parent = dirAt(parentPath(path));
    d = { kind: 'dir', path, name: path.slice(path.lastIndexOf('/') + 1), place: places.dir(path), planet: places.planet(path), children: [] };
    parent.children.push(d);
    dirs.set(path, d);
    return d;
  };
  for (const f of src.files) {
    dirAt(parentPath(f.path)).children.push({ kind: 'file', id: f.id, path: f.path, name: f.path.slice(f.path.lastIndexOf('/') + 1), place: places.file(f.id, f.path) });
  }
  sortTree(root);
  return root;
}

/** The level names by the shader's Level (0 clear, 1 haze, 2 fogged). */
const LEVEL_NAME: readonly FogLevel[] = ['clear', 'haze', 'fogged'];
const nameOf = (l: Level): FogLevel => LEVEL_NAME[l]!;

/**
 * The tree's fog: each file's level, each folder's counts by level and the whole repo's. A folder counts
 * its files at any depth, except a planet's own folder, which counts as its planet does in the fog view.
 */
export interface TreeFog { level(f: TreeFile): FogLevel; dir(d: TreeDir): FogTally; all: FogTally }

/** The fog of every row under a fog view (null: none usable, so every file is fogged, Rule 1). */
export function treeFog(root: TreeDir, fog: FogView | null): TreeFog {
  const levelOf = levelBy(fog);
  const own = new Map<TreeDir, FogTally>();
  const tally = (d: TreeDir): FogTally => {
    const t: FogTally = { fogged: 0, haze: 0, clear: 0, total: 0 };
    for (const c of d.children) {
      if (c.kind === 'file') {
        t[nameOf(levelOf(c.id))]++;
        t.total++;
        continue;
      }
      const s = tally(c);
      t.fogged += s.fogged;
      t.haze += s.haze;
      t.clear += s.clear;
      t.total += s.total;
    }
    own.set(d, t);
    return t;
  };
  const all = tally(root);
  const dir = (d: TreeDir): FogTally => {
    if (d.planet === null) return own.get(d) ?? { fogged: 0, haze: 0, clear: 0, total: 0 };
    // The planet's count, the info panel's (#201 U3). With none, nothing on it is known, so every file the layout
    // puts on it is fogged, its test moons from other folders too (Rule 1, Qodo e6973183)
    return planetTally(fog, d.planet.id) ?? { fogged: d.planet.files, haze: 0, clear: 0, total: d.planet.files };
  };
  return { level: (f) => nameOf(levelOf(f.id)), dir, all };
}

/**
 * How many of a folder's children show at first, and how many more each of its "more" rows adds: a big
 * folder (a flat repo's root of 100,000 files) never builds a row for every file at once (Qodo fb9c0d80).
 */
export const TREE_PAGE = 200;

/** The row after a folder's shown children that stands for the rest: `hidden` of them, `next` shown when it opens. Its path, the folder's with a slash, is never a file's. */
export interface TreeMore { kind: 'more'; path: string; name: string; dir: TreeDir; hidden: number; next: number }

/** One visible row: its node, its depth (1 at the top), its place among its siblings, and its parent's row (-1 at the top). */
export interface Row { node: TreeNode | TreeMore; level: number; setsize: number; posinset: number; parent: number }

/**
 * The rows shown: the top level, and the children of each expanded folder (by path) whose parents are all
 * expanded, each folder's first `shown` (by path, else TREE_PAGE) and then a row for the rest (Rule 1:
 * nothing left out unsaid).
 */
export function visibleRows(root: TreeDir, expanded: ReadonlySet<string>, shown: ReadonlyMap<string, number> = new Map()): Row[] {
  const rows: Row[] = [];
  const walk = (d: TreeDir, level: number, parent: number) => {
    const setsize = d.children.length, upTo = Math.min(setsize, shown.get(d.path) ?? TREE_PAGE);
    for (let k = 0; k < upTo; k++) {
      const node = d.children[k]!;
      rows.push({ node, level, setsize, posinset: k + 1, parent });
      if (node.kind === 'dir' && expanded.has(node.path)) walk(node, level + 1, rows.length - 1);
    }
    const hidden = setsize - upTo;
    if (hidden > 0) rows.push({ node: { kind: 'more', path: `${d.path}/`, name: `${hidden} more`, dir: d, hidden, next: Math.min(hidden, TREE_PAGE) }, level, setsize, posinset: upTo + 1, parent });
  };
  walk(root, 1, -1);
  return rows;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** A file's level in words, as the info panel says them. */
const LEVEL_WORDS: Readonly<Record<FogLevel, string>> = { fogged: 'fogged', haze: 'haze (seen)', clear: 'clear (understood)' };

/** A folder's tag: its mastery, then how many of its files are haze and fogged (none: not said), e.g. "66% · 1 haze". */
function dirTag(t: FogTally): string {
  const rest = [t.haze > 0 ? `${t.haze} haze` : '', t.fogged > 0 ? `${t.fogged} fogged` : ''].filter(Boolean);
  return [`${masteryPercent(t.clear, t.total)}%`, ...rest].join(' · ');
}

/** What a row shows after its name: a file's fog level, a folder's mastery and the rest of its counts, or how many more a "more" row shows. */
export function rowTag(n: TreeNode | TreeMore, fog: TreeFog): string {
  if (n.kind === 'more') return `show ${n.next}`;
  return n.kind === 'file' ? fog.level(n) : dirTag(fog.dir(n));
}

/** A row's fog in words, e.g. "haze (seen)", or "mastery 66%, 2 of 3 files clear (understood), 1 haze (seen), 0 fogged". */
export function fogWords(n: TreeNode, fog: TreeFog): string {
  if (n.kind === 'file') return LEVEL_WORDS[fog.level(n)];
  const t = fog.dir(n);
  return `mastery ${masteryPercent(t.clear, t.total)}%, ${t.clear} of ${plural(t.total, 'file')} clear (understood), ${t.haze} haze (seen), ${t.fogged} fogged${n.planet === null ? '' : ', counted as its planet'}`;
}

/** A row's accessible name: its name, whether it's a file or folder, and its fog; or what a "more" row holds back and shows. */
export function rowLabel(n: TreeNode | TreeMore, fog: TreeFog): string {
  if (n.kind === 'more') return `${n.hidden} more not shown, open to show ${n.next}`;
  return `${n.name}, ${n.kind === 'dir' ? 'folder' : 'file'}, ${fogWords(n, fog)}`;
}

/** Where a place is, in words, naming its planet by its path in the layout. */
export function placeText(place: Place, layout: LayoutV1): string {
  const name = (id: DirId) => layout.planets.find((p) => p.dirId === id)?.path ?? 'a planet';
  switch (place.kind) {
    case 'settlement': return `a settlement on the planet ${name(place.planet)}`;
    case 'moon': return `a test moon of the planet ${name(place.planet)}`;
    case 'unplaced': return `not drawn on the map, so showing its folder's planet, ${name(place.planet)}`;
    case 'planet': return `the planet ${name(place.planet)}`;
    case 'continent': return `a continent of the planet ${name(place.planet)}`;
    case 'moonlet': return 'a moonlet of the star';
    case 'star': return 'no planet of its own, so showing the star';
  }
}

/** What opening a row announces, e.g. "focused src/core/c.ts: a settlement on the planet src; fogged". */
export const openText = (n: TreeNode, fog: TreeFog, layout: LayoutV1): string =>
  `focused ${n.path}${n.kind === 'dir' ? '/' : ''}: ${placeText(n.place, layout)}; ${fogWords(n, fog)}`;
