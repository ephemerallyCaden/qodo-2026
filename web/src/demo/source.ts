// The demo's data (live-demo L2): every read route the view asks for, answered from a JSON file baked
// into the site, through a manifest of route → file. Writes and the event stream are never baked: the
// demo client keeps writes in memory (client.ts). Nothing here reaches any origin but the page's own.
import { API, STAR_HOME } from '../../../src/core/contract/api.js';

export const MANIFEST_SCHEMA = 'commet-demo.1';
/** The manifest's own file, beside the data files under the site's `data/`. */
export const MANIFEST_FILE = 'manifest.json';

/**
 * `routes` maps a route key (routeKey) to a file name in the same folder. A route a dataset doesn't have
 * is simply absent; the client says so, never answers it as empty (Rule 1).
 */
export interface DemoManifest { schemaVersion: typeof MANIFEST_SCHEMA; routes: Readonly<Record<string, string>> }

/** What a demo client reads: the route keys a dataset has, and one route's baked answer. */
export interface DemoSource {
  readonly routes: readonly string[];
  /** The baked answer of a key in `routes`. */
  read(route: string): Promise<string>;
}

/** The GET routes a dataset may bake: everything but the writes (chart, beacon) and the event stream. */
const BAKED: readonly string[] = [API.snapshot, API.layout, API.fog, API.drones, API.crew, API.beacons, API.cochange, API.debris];
/** The per-item routes, by the one query parameter that names the item (`at` is checked by the client, never baked). */
const ITEMS: Readonly<Record<string, string>> = { [API.unseen]: 'home', [API.diff]: 'fileId', [API.droneDetail]: 'key', [API.crewDetail]: 'person', [API.debrisDetail]: 'id' };
/** A data file: a plain name in the data folder, so a manifest can't point outside it. */
const FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/;
/** An item id as the contract writes them (f_…, d_…, s_…, p_…, x_…), or the star's home. */
const ITEM = /^(?:[a-z]_[A-Za-z0-9_-]{1,128}|star)$/;

/** The key of a route: its path, plus `?<param>=<id>` for a per-item route. */
export function routeKey(path: string, item?: string): string {
  const param = ITEMS[path];
  if (param === undefined) return path;
  return `${path}?${new URLSearchParams({ [param]: item ?? '' })}`;
}
export const unseenKey = (home: string | null) => routeKey(API.unseen, home ?? STAR_HOME);

/** Why `key` can't be a route key, or null. */
function keyProblem(key: string): string | null {
  const q = key.indexOf('?');
  const path = q < 0 ? key : key.slice(0, q);
  if (q < 0) return BAKED.includes(path) ? null : 'is not a read route a demo can bake';
  const param = ITEMS[path];
  if (param === undefined) return 'is not a per-item route';
  const query = [...new URLSearchParams(key.slice(q + 1))];
  if (query.length !== 1 || query[0]![0] !== param) return `must name exactly one ${param}`;
  if (!ITEM.test(query[0]![1])) return `has a ${param} that is not an id`;
  return routeKey(path, query[0]![1]) === key ? null : 'is not in its canonical form';
}

/** Checks a parsed manifest: every key a bakeable route, every file a plain JSON name. Throws with every problem. */
export function checkManifest(v: unknown): DemoManifest {
  const errors: string[] = [];
  const o = v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  if (!o) throw new Error('the demo manifest is not an object');
  if (o['schemaVersion'] !== MANIFEST_SCHEMA) errors.push(`schemaVersion must be "${MANIFEST_SCHEMA}"`);
  const routes = o['routes'];
  if (routes === null || typeof routes !== 'object' || Array.isArray(routes)) errors.push('routes must be an object');
  else {
    for (const [key, file] of Object.entries(routes)) {
      const problem = keyProblem(key);
      if (problem) errors.push(`route ${JSON.stringify(key)} ${problem}`);
      if (typeof file !== 'string' || !FILE.test(file) || file === MANIFEST_FILE) errors.push(`route ${JSON.stringify(key)}: its file must be a plain .json name`);
    }
    if (!(API.layout in routes)) errors.push(`routes must include ${API.layout}`);
    if (!(API.fog in routes)) errors.push(`routes must include ${API.fog}`);
  }
  if (errors.length) throw new Error(`the demo manifest is invalid: ${errors.join('; ')}`);
  return { schemaVersion: MANIFEST_SCHEMA, routes: routes as Record<string, string> };
}

/** A source over files already in memory (the tests, and a dataset built in the page). */
export function memorySource(manifest: DemoManifest, files: Readonly<Record<string, string>>): DemoSource {
  return {
    routes: Object.keys(manifest.routes),
    read: async (route) => {
      const file = manifest.routes[route];
      const text = file === undefined ? undefined : files[file];
      if (text === undefined) throw new Error(`the demo data has no file for ${route}`);
      return text;
    },
  };
}

type Fetch = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'text'>>;

/**
 * The site's baked data: `<dataUrl>manifest.json`, then each route's file beside it, fetched only from
 * `origin` (the page's own), with no credentials, referrer or redirects. Each file is fetched once.
 */
export async function staticSource(dataUrl: string, origin: string, fetchFn: Fetch = (u, i) => fetch(u, i)): Promise<DemoSource> {
  const base = new URL(dataUrl, origin);
  if (base.origin !== origin) throw new Error('the demo data must come from this site');
  const init: RequestInit = { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' };
  const get = async (file: string): Promise<string> => {
    const url = new URL(file, base);
    if (url.origin !== origin || !url.pathname.startsWith(base.pathname)) throw new Error('the demo data must come from this site');
    const res = await fetchFn(url.href, init);
    if (!res.ok) throw new Error(`the demo data file ${file} answered ${res.status}`);
    return res.text();
  };
  let parsed: unknown;
  try { parsed = JSON.parse(await get(MANIFEST_FILE)); } catch (e) { throw e instanceof SyntaxError ? new Error('the demo manifest is not JSON') : e; }
  const manifest = checkManifest(parsed);
  const cache = new Map<string, Promise<string>>();
  return {
    routes: Object.keys(manifest.routes),
    read: (route) => {
      const file = manifest.routes[route];
      if (file === undefined) return Promise.reject(new Error(`the demo data has no file for ${route}`));
      let p = cache.get(file);
      if (!p) {
        p = get(file);
        p.catch(() => cache.delete(file)); // a failed fetch is tried again next time
        cache.set(file, p);
      }
      return p;
    },
  };
}
