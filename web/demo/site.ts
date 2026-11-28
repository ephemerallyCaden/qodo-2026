// Node side of the demo build (live-demo L2, L5): which dataset the site bakes, and the privacy scan of the
// built site. Used by web/vite.demo.config.ts (the build refuses to finish on a hit) and by the tests.
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleHits, tokenRuns, type Hit } from '../../.claude/skills/visual-proof/scripts/privacy.js';
import { API } from '../../src/core/contract/api.js';
import { palette } from '../../src/core/palette.js';
import { checkManifest, MANIFEST_SCHEMA, routeKey, type DemoManifest } from '../src/demo/source.js';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');
/** Where `npm run build:demo` writes the site: the folder the lead publishes to the gh-pages branch. */
export const DEMO_DIST = 'dist/demo';
/** GitHub Pages serves a project site at /<repo>/. */
export const DEFAULT_BASE = '/qodo-2026/';

/** A dataset: a folder of JSON files and the manifest naming which route each one answers. */
export interface Dataset { name: string; dir: string; manifest: DemoManifest }

/** The contract's `mini` fixture: the dataset when the showcase fixture isn't in the tree. */
export const MINI: Dataset = {
  name: 'mini',
  dir: join(ROOT, 'test/fixtures/contract'),
  manifest: { schemaVersion: MANIFEST_SCHEMA, routes: {
    [API.layout]: 'mini.layout.json', [API.fog]: 'mini.fog.json', [API.drones]: 'mini.drones.json', [API.crew]: 'mini.crew.json',
  } },
};

/** The showcase fixture's data (live-demo L1, test/fixtures/showcase): the demo's dataset whenever it's in the tree. */
export const SHOWCASE_DIR = 'test/fixtures/showcase/data';
/** Its index (`ShowcaseManifest`, test/fixtures/showcase/manifest.ts). */
export const SHOWCASE_INDEX = 'showcase.manifest.json';

/**
 * A showcase index (`showcase.1`: the plain routes, then one map per item route, id → file) as the demo's
 * manifest, each item keyed as the client asks for it. Throws on anything else.
 */
export function fromShowcase(v: unknown): { head: string; manifest: DemoManifest } {
  const o = v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  if (o['schemaVersion'] !== 'showcase.1') throw new Error('demo data: the showcase index must be "showcase.1"');
  if (typeof o['head'] !== 'string') throw new Error('demo data: the showcase index has no head');
  const map = (key: string): Record<string, unknown> => {
    const m = o[key];
    if (m === null || typeof m !== 'object' || Array.isArray(m)) throw new Error(`demo data: the showcase index's ${key} must be an object`);
    return m as Record<string, unknown>;
  };
  const routes: Record<string, unknown> = { ...map('routes') };
  for (const [key, path] of [['droneDetail', API.droneDetail], ['crewDetail', API.crewDetail], ['unseen', API.unseen], ['diff', API.diff]] as const) {
    for (const [id, file] of Object.entries(map(key))) routes[routeKey(path, id)] = file;
  }
  return { head: o['head'], manifest: checkManifest({ schemaVersion: MANIFEST_SCHEMA, routes }) };
}

/**
 * The dataset in `dir`: a demo manifest (`manifest.json`) or a showcase index (`showcase.manifest.json`, in
 * it or in its `data/`). With none given, the showcase fixture when it's in the tree, else `mini`. Every
 * file it names is read and checked here, so a bad dataset stops the build. A showcase's files must all be
 * of its head.
 */
export function dataset(dir?: string): Dataset {
  const showcase = (at: string): Dataset => {
    const { head, manifest } = fromShowcase(JSON.parse(readFileSync(join(at, SHOWCASE_INDEX), 'utf8')));
    const d = { name: relative(ROOT, at) || at, dir: at, manifest };
    const fogHead = (JSON.parse(dataFile(d, manifest.routes[API.fog]!)) as { head?: unknown }).head;
    if (fogHead !== head) throw new Error(`demo data: the showcase's fog is of ${String(fogHead)}, but its index says ${head}`);
    return d;
  };
  let d: Dataset;
  if (dir === undefined || dir === '') {
    const at = join(ROOT, SHOWCASE_DIR);
    d = existsSync(join(at, SHOWCASE_INDEX)) ? showcase(at) : MINI;
  } else {
    const at = resolve(ROOT, dir);
    if (existsSync(join(at, 'manifest.json'))) d = { name: relative(ROOT, at) || at, dir: at, manifest: checkManifest(JSON.parse(readFileSync(join(at, 'manifest.json'), 'utf8'))) };
    else if (existsSync(join(at, SHOWCASE_INDEX))) d = showcase(at);
    else if (existsSync(join(at, 'data', SHOWCASE_INDEX))) d = showcase(join(at, 'data'));
    else throw new Error(`demo data: ${dir} has no manifest.json or ${SHOWCASE_INDEX}`);
  }
  for (const file of new Set(Object.values(d.manifest.routes))) dataFile(d, file);
  return d;
}

/** One file of a dataset, read only when it's a plain file in the dataset's own folder (no symlink) and JSON. */
export function dataFile(d: Dataset, file: string): string {
  const path = resolve(d.dir, file);
  if (!path.startsWith(d.dir + sep)) throw new Error(`demo data: ${file} is outside the dataset`);
  const st = lstatSync(path, { throwIfNoEntry: false });
  if (!st) throw new Error(`demo data: ${file} is missing from ${d.name}`);
  if (!st.isFile()) throw new Error(`demo data: ${file} in ${d.name} is not a plain file`);
  const text = readFileSync(path, 'utf8');
  try { JSON.parse(text); } catch { throw new Error(`demo data: ${file} in ${d.name} is not JSON`); }
  return text;
}

/** The site base: an absolute path with a slash at each end and only plain characters. */
export function siteBase(raw: string | undefined): string {
  const base = raw ?? DEFAULT_BASE;
  if (!/^\/(?:[A-Za-z0-9._-]+\/)*$/.test(base)) throw new Error(`DEMO_BASE must look like /name/ (got ${JSON.stringify(base)})`);
  return base;
}

/** Every file of a built site, as text. Only plain files and folders: a symlink or anything else is refused. */
export function siteFiles(dir: string): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) out.push({ path: relative(dir, p).split(sep).join('/'), text: readFileSync(p, 'utf8') });
      else throw new Error(`the demo site holds ${e.isSymbolicLink() ? 'a symlink' : 'a special file'} (${relative(dir, p)}); it may hold plain files only`);
    }
  };
  walk(dir);
  return out;
}

/** The token-shaped runs that are three.js's own text, which the token rule skips (as visual-proof does). */
export function libraryRuns(): Set<string> {
  const dir = join(ROOT, 'node_modules', 'three', 'build');
  const out = new Set<string>();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) for (const r of tokenRuns(readFileSync(join(dir, f), 'utf8'))) out.add(r);
  return out;
}

/**
 * The visual-proof bundle scan (AGENTS.md Rule 2) over a built site: absolute paths, this machine's home
 * and checkout, tokens and secrets, agent-log fields. A public site must have none.
 */
export function siteHits(dir: string): Hit[] {
  const literals = [{ name: 'home folder', value: homedir() }, { name: 'checkout path', value: ROOT }].filter((l) => l.value.length > 1);
  // bundleHits names the product's folder in each hit's place; this scan is of the demo's
  return bundleHits('demo', siteFiles(dir), { literals, library: libraryRuns() }).map((h) => ({ ...h, where: h.where.replace("build's dist/web", `build's ${DEMO_DIST}`) }));
}

/**
 * The site's icon (favicon.svg): a small lit ocean planet with a green continent, whole pixels in the
 * world palette's own colours (art-direction §4), so the tab doesn't ask Pages for a favicon.ico it lacks.
 */
export function faviconSvg(): string {
  const { ocean, land, space } = palette.world;
  const n = 16, r = 6.6, light = [-0.55, 0.6, 0.58].map((v, _, a) => v / Math.hypot(...a));
  const rects: string[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5 - n / 2) / r, dy = (n / 2 - y - 0.5) / r, d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const lit = dx * light[0]! + dy * light[1]! + Math.sqrt(1 - d2) * light[2]!;
      const band = lit > 0.62 ? 2 : lit > 0.12 ? 1 : 0;
      const isLand = (x - 6) ** 2 / 9 + (y - 6) ** 2 / 5 <= 1 || (x - 10) ** 2 / 4 + (y - 11) ** 2 / 2 <= 1;
      const colour = isLand ? [land[1], land[2], land[3]][band]! : [ocean[0], ocean[2], ocean[3]][band]!;
      rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${colour}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" rx="3" fill="${space}"/>${rects.join('')}</svg>\n`;
}

