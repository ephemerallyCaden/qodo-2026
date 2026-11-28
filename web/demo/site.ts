// Node side of the demo build (live-demo L2, L5): which dataset the site bakes, and the privacy scan of the
// built site. Used by web/vite.demo.config.ts (the build refuses to finish on a hit) and by the tests.
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleHits, tokenRuns, type Hit } from '../../.claude/skills/visual-proof/scripts/privacy.js';
import { API } from '../../src/core/contract/api.js';
import { checkManifest, MANIFEST_SCHEMA, type DemoManifest } from '../src/demo/source.js';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');
/** Where `npm run build:demo` writes the site: the folder the lead publishes to the gh-pages branch. */
export const DEMO_DIST = 'dist/demo';
/** GitHub Pages serves a project site at /<repo>/. */
export const DEFAULT_BASE = '/qodo-2026/';

/** A dataset: a folder of JSON files and the manifest naming which route each one answers. */
export interface Dataset { name: string; dir: string; manifest: DemoManifest }

/** The contract's `mini` fixture, until the showcase fixture lands: what every view route it has answers. */
export const MINI: Dataset = {
  name: 'mini',
  dir: join(ROOT, 'test/fixtures/contract'),
  manifest: { schemaVersion: MANIFEST_SCHEMA, routes: {
    [API.layout]: 'mini.layout.json', [API.fog]: 'mini.fog.json', [API.drones]: 'mini.drones.json', [API.crew]: 'mini.crew.json',
  } },
};

/** The dataset in `dir` (its `manifest.json`), or `mini` when none is given. Throws on a bad manifest or file. */
export function dataset(dir?: string): Dataset {
  const d = dir ? { name: relative(ROOT, resolve(ROOT, dir)), dir: resolve(ROOT, dir), manifest: checkManifest(JSON.parse(readFileSync(join(resolve(ROOT, dir), 'manifest.json'), 'utf8'))) } : MINI;
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
