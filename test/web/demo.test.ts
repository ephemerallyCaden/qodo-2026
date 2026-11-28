// The public demo's data client (live-demo L2, L8): every route answered from the dataset's manifest,
// writes kept in memory with the answers the real server would give after them, and nothing fetched for
// a write or from another origin. Plus the build's boundaries: the product never imports the demo, and
// the demo page carries every element the view needs.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API, type DiffView, type LiveEvent, type UnseenList } from '../../src/core/contract/api.js';
import type { CoChangeView } from '../../src/core/contract/cochange.js';
import { DETAIL_BUCKETS, type DroneDetail } from '../../src/core/contract/drones.js';
import type { FogView } from '../../src/core/contract/fog.js';
import { ViewError } from '../../web/src/data/client.js';
import { demoClient } from '../../web/src/demo/client.js';
import { checkManifest, MANIFEST_SCHEMA, memorySource, routeKey, staticSource, unseenKey, type DemoManifest } from '../../web/src/demo/source.js';
import { dataset as siteDataset, SHOWCASE_DIR, SHOWCASE_INDEX } from '../../web/demo/site.js';
import { miniCrew, miniDebris, miniDrones, miniFog, miniLayout } from '../fixtures/contract/mini.js';
import { DEBRIS_WARNINGS, type DebrisDetail } from '../../src/core/contract/debris.js';

const ROOT = join(import.meta.dirname, '../..');
const HEAD = miniLayout.source.head;
const OTHER = 'b'.repeat(40);
/** mini's two fogged files: a moonlet of the star, and the toxic `web` planet's one settlement. */
const STAR_FILE = 'f_000000000003', WEB_FILE = 'f_00000000000d', WEB = 'd_00000000000c', DOCS = 'd_00000000000d';

const unseenStar: UnseenList = { ok: true, at: HEAD, home: null, files: [{ fileId: STAR_FILE, path: 'test/odd.test.ts', since: '3'.repeat(40), reasons: ['unknown'] }] };
const unseenWeb: UnseenList = { ok: true, at: HEAD, home: WEB, files: [{ fileId: WEB_FILE, path: 'web/app.ts', since: '2'.repeat(40), reasons: ['agent', 'self-committed-agent-written'] }] };
const diffWeb: DiffView = { ok: true, fileId: WEB_FILE, at: HEAD, since: '2'.repeat(40), base: '1'.repeat(40), truncated: false, shownLines: 2,
  sections: [{ status: 'modified', path: 'web/app.ts', oldPath: null, binary: false, hunks: [{ header: '@@ -1 +1 @@', lines: ['-old', '+new'] }] }] };
const cochange: CoChangeView = { schemaVersion: 'cochange.1', head: HEAD, needsRescan: false, links: [{ a: 'f_00000000000a', b: WEB_FILE, strengthMilli: 600 }],
  flags: [{ fileId: WEB_FILE, with: 'f_00000000000a', strengthMilli: 600, at: HEAD }], dismissed: 0,
  files: [{ fileId: 'f_00000000000a', path: 'src/main.ts', home: 'd_00000000000a' }, { fileId: WEB_FILE, path: 'web/app.ts', home: WEB }] };
/** One piece of mini's debris, its panel as the server would build it. */
const DEBRIS_ID = miniDebris.pieces[0]!.id;
const debrisDetail: DebrisDetail = {
  ok: true, schemaVersion: 'debris-detail.1', head: HEAD, id: DEBRIS_ID, cls: 'branch', name: 'feature/old-idea', remoteOnly: false, ageDays: 40,
  lastCommit: { sha: 'abcdef1234567890abcdef1234567890abcdef12', short: 'abcdef1', subject: 'try a thing', date: '2026-09-14T10:00:00Z' },
  aheadCount: 3, lines: 2400, creator: { displayName: 'Ada Quill', captain: false, agent: false }, sessions: [], planets: ['d_00000000000a'], home: 'd_00000000000a',
  filesOutside: 0, worktree: null, rebased: false, cleanup: null, inspect: "git log --oneline HEAD..'refs/heads/feature/old-idea' --", warning: DEBRIS_WARNINGS.unmerged,
};
const droneDetail: DroneDetail = { ok: true, schemaVersion: 'drone-detail.1', head: HEAD, key: 's_aaaaaaaaaaaa', startedAt: '2026-11-10T09:00:00Z', endedAt: '2026-11-10T10:00:00Z',
  files: [], otherFiles: 0, otherEdits: 0, buckets: new Array<number>(DETAIL_BUCKETS).fill(0), spanMs: 3_600_000, needsRescan: false };

/** A dataset over mini: its four contract files, plus the review, co-change and detail routes the demo serves. */
function dataset(extra: Record<string, unknown> = {}): { manifest: DemoManifest; files: Record<string, string> } {
  const routes: Record<string, string> = {
    [API.layout]: 'layout.json', [API.fog]: 'fog.json', [API.drones]: 'drones.json', [API.crew]: 'crew.json', [API.cochange]: 'cochange.json',
    [unseenKey(null)]: 'unseen-star.json', [unseenKey(WEB)]: 'unseen-web.json', [routeKey(API.diff, WEB_FILE)]: 'diff-web.json',
  };
  const files: Record<string, string> = {
    'layout.json': JSON.stringify(miniLayout), 'fog.json': JSON.stringify(miniFog), 'drones.json': JSON.stringify(miniDrones), 'crew.json': JSON.stringify(miniCrew),
    'cochange.json': JSON.stringify(cochange), 'unseen-star.json': JSON.stringify(unseenStar), 'unseen-web.json': JSON.stringify(unseenWeb), 'diff-web.json': JSON.stringify(diffWeb),
  };
  for (const [route, body] of Object.entries(extra)) {
    const file = `extra-${Object.keys(files).length}.json`;
    routes[route] = file;
    files[file] = JSON.stringify(body);
  }
  return { manifest: checkManifest({ schemaVersion: MANIFEST_SCHEMA, routes }), files };
}
const client = (extra?: Record<string, unknown>) => { const d = dataset(extra); return demoClient(memorySource(d.manifest, d.files)); };
const fogOf = (f: FogView, id: string) => f.files.find((x) => x.fileId === id)!;
const countsOf = (f: FogView, dirId: string) => f.planets.find((p) => p.dirId === dirId)!;

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  fetchSpy = vi.fn(() => Promise.reject(new Error('the demo client must not fetch')));
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('demo manifest', () => {
  const routes = (r: Record<string, string>) => ({ schemaVersion: MANIFEST_SCHEMA, routes: { [API.layout]: 'l.json', [API.fog]: 'f.json', ...r } });

  it('takes every read route, by its path or its one item parameter', () => {
    expect(() => checkManifest(dataset({ [API.snapshot]: {}, [API.beacons]: {}, [routeKey(API.droneDetail, 's_x')]: {}, [routeKey(API.crewDetail, 'p_1')]: {} }).manifest)).not.toThrow();
    expect(routeKey(API.unseen, 'star')).toBe('/api/unseen?home=star');
    expect(unseenKey(null)).toBe('/api/unseen?home=star');
    expect(routeKey(API.diff, 'f_1')).toBe('/api/diff?fileId=f_1');
    expect(() => checkManifest(dataset({ [API.debris]: {}, [routeKey(API.debrisDetail, 'x_0123456789ab')]: {} }).manifest)).not.toThrow(); // R13
    expect(routeKey(API.debrisDetail, 'x_0123456789ab')).toBe('/api/debris-detail?id=x_0123456789ab');
  });

  it('refuses writes, the event stream, unknown routes, odd queries and files outside its folder', () => {
    for (const [key, file] of [[API.chart, 'c.json'], [API.beacon, 'b.json'], [API.events, 'e.json'], ['/api/nope', 'n.json'], ['/index.html', 'i.json'],
      [`${API.unseen}?home=star&at=${HEAD}`, 'u.json'], [`${API.unseen}?at=${HEAD}`, 'u.json'], [`${API.diff}?fileId=..%2Fx`, 'd.json'],
      [API.drones, '../secret.json'], [API.drones, '/abs.json'], [API.drones, 'manifest.json'], [API.drones, 'x.js'], [API.drones, 'sub/x.json']] as const) {
      expect(() => checkManifest(routes({ [key]: file })), `${key} → ${file}`).toThrow(/manifest is invalid/);
    }
    expect(() => checkManifest({ schemaVersion: MANIFEST_SCHEMA, routes: { [API.layout]: 'l.json' } })).toThrow(/must include \/api\/fog/);
    expect(() => checkManifest({ schemaVersion: 'x', routes: {} })).toThrow(/schemaVersion/);
  });
});

describe('static source', () => {
  const site = 'https://demo.example';
  const files: Record<string, string> = { '/qodo-2026/data/manifest.json': JSON.stringify({ schemaVersion: MANIFEST_SCHEMA, routes: { [API.layout]: 'l.json', [API.fog]: 'f.json' } }), '/qodo-2026/data/l.json': '{"layout":1}' };
  const fake = () => vi.fn(async (url: string, init: RequestInit) => {
    expect(init).toEqual({ credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
    const u = new URL(url);
    const body = u.origin === site ? files[u.pathname] : undefined;
    return { ok: body !== undefined, status: body === undefined ? 404 : 200, text: async () => body ?? '' };
  });

  it('reads the manifest, then each route\'s file once, from the site itself only', async () => {
    const f = fake();
    const s = await staticSource('/qodo-2026/data/', site, f);
    expect(s.routes).toEqual([API.layout, API.fog]);
    expect(await s.read(API.layout)).toBe('{"layout":1}');
    expect(await s.read(API.layout)).toBe('{"layout":1}');
    expect(f.mock.calls.map((c) => c[0])).toEqual([`${site}/qodo-2026/data/manifest.json`, `${site}/qodo-2026/data/l.json`]);
    await expect(s.read(API.fog)).rejects.toThrow(/answered 404/);
    await expect(s.read(API.drones)).rejects.toThrow(/no file/);
  });

  it('refuses data from another origin', async () => {
    await expect(staticSource('https://elsewhere.example/data/', site, fake())).rejects.toThrow(/from this site/);
    await expect(staticSource('//elsewhere.example/data/', site, fake())).rejects.toThrow(/from this site/);
  });
});

describe('demo client', () => {
  it('answers every read route from the dataset, checked like the server\'s answers', async () => {
    const c = client({ [routeKey(API.droneDetail, 's_aaaaaaaaaaaa')]: droneDetail, [API.debris]: miniDebris, [routeKey(API.debrisDetail, DEBRIS_ID)]: debrisDetail });
    expect(await c.layout()).toEqual(miniLayout);
    expect(await c.fog()).toEqual(miniFog);
    expect(await c.drones()).toEqual(miniDrones);
    expect(await c.crew()).toEqual(miniCrew);
    expect(await c.cochange()).toEqual(cochange);
    expect(await c.unseen(null, HEAD)).toEqual(unseenStar);
    expect(await c.unseen(WEB, HEAD)).toEqual(unseenWeb);
    expect(await c.diff(WEB_FILE, HEAD)).toEqual(diffWeb);
    expect(await c.droneDetail('s_aaaaaaaaaaaa', HEAD)).toEqual(droneDetail);
    expect(await c.debris()).toEqual(miniDebris); // R13
    expect(await c.debrisDetail(DEBRIS_ID, HEAD)).toEqual(debrisDetail);
    expect(await c.debrisDetail(DEBRIS_ID, OTHER)).toEqual({ ok: false, error: 'unknown-head', head: HEAD });
    expect(await c.debrisDetail(miniDebris.pieces[1]!.id, HEAD)).toEqual({ ok: false, error: 'no-such-item' });
    expect(await c.beacons()).toEqual({ schemaVersion: 'beacons.1', head: HEAD, beacons: [], unplaced: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('says what the dataset lacks, and never answers it as empty (Rule 1)', async () => {
    const c = demoClient(memorySource(checkManifest({ schemaVersion: MANIFEST_SCHEMA, routes: { [API.layout]: 'l.json', [API.fog]: 'f.json' } }),
      { 'l.json': JSON.stringify(miniLayout), 'f.json': JSON.stringify(miniFog) }));
    await expect(c.unseen(WEB, HEAD)).rejects.toThrow(ViewError); // web has a fogged file: no list is not "nothing unseen"
    expect(await c.unseen('d_00000000000a', HEAD)).toEqual({ ok: true, at: HEAD, home: 'd_00000000000a', files: [] }); // src has none fogged
    expect(await c.unseen('d_00000000ffff', HEAD)).toEqual({ ok: false, error: 'no-such-home' });
    await expect(c.diff(WEB_FILE, HEAD)).rejects.toThrow(/no diff/);
    expect(await c.diff('f_00000000ffff', HEAD)).toEqual({ ok: false, error: 'no-such-file' });
    await expect(c.drones()).rejects.toThrow(/no agent sessions/);
    await expect(c.files()).rejects.toThrow(/no file list/);
    expect(await c.droneDetail('s_x', HEAD)).toEqual({ ok: false, error: 'no-such-session' });
    expect(await c.crewDetail('p_x', HEAD)).toEqual({ ok: false, error: 'no-such-person' });
    await expect(c.debris()).rejects.toThrow(/no debris/); // R13: said, never an empty view
    expect(await c.debrisDetail('x_000000000000', HEAD)).toEqual({ ok: false, error: 'no-such-item' });
    // and a broken file is refused with what's wrong with it
    const bad = demoClient(memorySource(checkManifest({ schemaVersion: MANIFEST_SCHEMA, routes: { [API.layout]: 'l.json', [API.fog]: 'f.json' } }), { 'l.json': '{}', 'f.json': 'nope' }));
    await expect(bad.layout()).rejects.toThrow(/layout from the demo data is invalid/);
    await expect(bad.fog()).rejects.toThrow(/not JSON/);
  });

  it('charts a file in memory: the fog, the counts, the unseen list and the diff follow, as the server\'s would', async () => {
    const c = client();
    const events: LiveEvent[] = [];
    c.follow((e) => events.push(e), () => {});
    expect(c.wrote()).toBe(false);
    const r = await c.chart({ kind: 'chart', fileId: WEB_FILE, at: HEAD });
    expect(r.ok).toBe(true);
    const fog = (r as { fog: FogView }).fog;
    expect(fogOf(fog, WEB_FILE)).toEqual({ fileId: WEB_FILE, state: 'haze', reasons: [], since: null });
    expect(countsOf(fog, WEB)).toEqual({ ...countsOf(miniFog, WEB), fogged: 0, haze: 1 });
    expect(fog.star).toEqual(miniFog.star); // the other fogged file is untouched
    expect(fogOf(fog, STAR_FILE).state).toBe('fogged');
    expect(await c.fog()).toEqual(fog);
    expect((await c.unseen(WEB, HEAD) as UnseenList).files).toEqual([]);
    expect(await c.diff(WEB_FILE, HEAD)).toMatchObject({ ok: true, since: null, sections: [] });
    expect(c.wrote()).toBe(true);
    // the event the server's watcher would send, after the answer
    expect(events).toEqual([]);
    await vi.runAllTimersAsync();
    expect(events).toEqual([{ type: 'fog', head: HEAD }]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('counts a file charted from an unseen list on the planet that list belongs to, even when it has no cell', async () => {
    // docs' surface overflow: in the fog, not in the layout. Fogged here, so it's only in docs' unseen list.
    const overflow = 'f_000000000010';
    const fog: FogView = { ...miniFog, files: miniFog.files.map((f) => (f.fileId === overflow ? { fileId: overflow, state: 'fogged', reasons: ['agent'], since: HEAD } : f)),
      planets: miniFog.planets.map((p) => (p.dirId === DOCS ? { ...p, fogged: 1, haze: 0 } : p)) };
    const d = dataset({ [unseenKey(DOCS)]: { ok: true, at: HEAD, home: DOCS, files: [{ fileId: overflow, path: 'docs/more.md', since: HEAD, reasons: ['agent'] }] } });
    const c = demoClient(memorySource(d.manifest, { ...d.files, 'fog.json': JSON.stringify(fog) }));
    const r = await c.chart({ kind: 'chart', fileId: overflow, at: HEAD });
    expect(countsOf((r as { fog: FogView }).fog, DOCS)).toMatchObject({ fogged: 0, haze: 1 });
  });

  it('refuses a write at a head the dataset doesn\'t have, and a file it doesn\'t know', async () => {
    const c = client();
    expect(await c.chart({ kind: 'chart', fileId: WEB_FILE, at: OTHER })).toEqual({ ok: false, error: 'unknown-head', head: HEAD });
    expect(await c.unseen(WEB, OTHER)).toEqual({ ok: false, error: 'unknown-head', head: HEAD });
    expect(await c.diff(WEB_FILE, OTHER)).toEqual({ ok: false, error: 'unknown-head', head: HEAD });
    expect(await c.beacon({ fileId: WEB_FILE, at: OTHER, text: 'hi' })).toEqual({ ok: false, error: 'unknown-head', head: HEAD });
    expect(await c.droneDetail('s_aaaaaaaaaaaa', OTHER)).toEqual({ ok: false, error: 'unknown-head', head: HEAD });
    expect(await c.chart({ kind: 'chart', fileId: 'f_00000000ffff', at: HEAD })).toEqual({ ok: false, error: 'no such file at that head' });
    expect(await c.chart({ kind: 'baseline-undo', at: HEAD })).toEqual({ ok: false, error: 'no baseline to undo' });
    expect(await c.fog()).toEqual(miniFog);
    expect(c.wrote()).toBe(false);
  });

  it('sets and undoes a baseline: every fogged file is seen, then fogged again unless charted', async () => {
    const c = client();
    await c.chart({ kind: 'chart', fileId: STAR_FILE, at: HEAD });
    const set = (await c.chart({ kind: 'baseline', at: HEAD })) as { fog: FogView };
    expect(set.fog.baseline).toBe(HEAD);
    expect(set.fog.files.filter((f) => f.state === 'fogged')).toEqual([]);
    expect(countsOf(set.fog, WEB)).toMatchObject({ fogged: 0, haze: 1 });
    expect(set.fog.star).toMatchObject({ fogged: 0, haze: 2 });
    const undone = (await c.chart({ kind: 'baseline-undo', at: HEAD })) as { fog: FogView };
    expect(undone.fog.baseline).toBeNull();
    expect(fogOf(undone.fog, WEB_FILE).state).toBe('fogged');
    expect(fogOf(undone.fog, STAR_FILE).state).toBe('haze'); // charted on its own before the baseline
    expect(countsOf(undone.fog, WEB)).toEqual(countsOf(miniFog, WEB));
  });

  it('keeps the dataset\'s own baseline, and says it can\'t undo it (Qodo PR249 08ce85c8)', async () => {
    const BASELINE = '9'.repeat(40);
    const d = dataset();
    const c = demoClient(memorySource(d.manifest, { ...d.files, 'fog.json': JSON.stringify({ ...miniFog, baseline: BASELINE }) }));
    expect((await c.fog()).baseline).toBe(BASELINE);
    // the dataset's baseline is its chart state, which the demo can't replay without it: refused, nothing changes
    expect(await c.chart({ kind: 'baseline-undo', at: HEAD })).toEqual({ ok: false, error: 'the demo can\'t undo the baseline its invented data starts with' });
    expect((await c.fog()).baseline).toBe(BASELINE);
    // a baseline set this visit is undone back to the dataset's
    await c.chart({ kind: 'baseline', at: HEAD });
    expect((await c.fog()).baseline).toBe(HEAD);
    expect(await c.chart({ kind: 'baseline-undo', at: HEAD })).toMatchObject({ ok: true, fog: { baseline: BASELINE } });
    expect(fogOf(await c.fog(), WEB_FILE).state).toBe('fogged');
  });

  it('says the dataset has no co-change data, rather than answering an empty, complete view (Qodo PR249 34b5fb4a)', async () => {
    const d = dataset();
    const routes = Object.fromEntries(Object.entries(d.manifest.routes).filter(([k]) => k !== API.cochange));
    const c = demoClient(memorySource(checkManifest({ schemaVersion: MANIFEST_SCHEMA, routes }), d.files));
    await expect(c.cochange()).rejects.toThrow(/no co-change data/);
  });

  it('leaves a beacon in memory, one per file, with its path and body; refuses a bad note', async () => {
    const c = client();
    const events: LiveEvent[] = [];
    c.follow((e) => events.push(e), () => {});
    expect(await c.beacon({ fileId: WEB_FILE, at: HEAD, text: ' padded ' })).toMatchObject({ ok: false });
    const first = await c.beacon({ fileId: WEB_FILE, at: HEAD, text: 'the router lives here' });
    expect(first).toEqual({ ok: true, beacons: { schemaVersion: 'beacons.1', head: HEAD, unplaced: 0,
      beacons: [{ fileId: WEB_FILE, path: 'web/app.ts', home: WEB, at: HEAD, text: 'the router lives here' }] } });
    await c.beacon({ fileId: WEB_FILE, at: HEAD, text: 'second thoughts' });
    expect((await c.beacons()).beacons.map((b) => b.text)).toEqual(['second thoughts']);
    await vi.runAllTimersAsync();
    expect(events).toEqual([{ type: 'beacons', head: HEAD }, { type: 'beacons', head: HEAD }]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('takes a missing-pair flag down once its file is charted, and counts it', async () => {
    const c = client();
    await c.chart({ kind: 'chart', fileId: WEB_FILE, at: HEAD });
    expect(await c.cochange()).toMatchObject({ flags: [], dismissed: 1, links: cochange.links });
  });

  it('keeps nothing past the visit: a new client starts from the dataset again', async () => {
    const d = dataset();
    await demoClient(memorySource(d.manifest, d.files)).chart({ kind: 'chart', fileId: WEB_FILE, at: HEAD });
    expect(await demoClient(memorySource(d.manifest, d.files)).fog()).toEqual(miniFog);
  });

  it('fetches nothing for a write over the static source: only the data files, once each', async () => {
    const d = dataset();
    const site = 'https://demo.example';
    const calls: string[] = [];
    const fetchFn = async (url: string) => {
      calls.push(url);
      const u = new URL(url);
      const name = u.pathname.slice('/data/'.length);
      const text = name === 'manifest.json' ? JSON.stringify(d.manifest) : d.files[name];
      return { ok: text !== undefined, status: text === undefined ? 404 : 200, text: async () => text ?? '' };
    };
    const c = demoClient(await staticSource('/data/', site, fetchFn));
    await c.unseen(WEB, HEAD);
    const before = calls.length;
    await c.chart({ kind: 'chart', fileId: WEB_FILE, at: HEAD });
    await c.chart({ kind: 'baseline', at: HEAD });
    await c.beacon({ fileId: WEB_FILE, at: HEAD, text: 'noted' });
    await c.fog();
    // the writes read only what they had not read yet (the layout, the star's list), never a write route
    expect(calls.slice(before).every((u) => u.startsWith(`${site}/data/`) && u.endsWith('.json'))).toBe(true);
    expect(new Set(calls).size).toBe(calls.length);
    expect(calls.every((u) => new URL(u).origin === site)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('demo build boundaries', () => {
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
  const DEMO = join(ROOT, 'web/src/demo');

  it('keeps the demo out of the product: nothing outside web/src/demo imports it', () => {
    const product = files(join(ROOT, 'web/src')).filter((f) => f.endsWith('.ts') && !f.startsWith(DEMO));
    expect(product.length).toBeGreaterThan(20);
    const into = product.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/(?:from|import)\s*\(?\s*'(\.[^']+)'/g)]
      .filter((m) => resolve(dirname(f), m[1]!).startsWith(DEMO)).map((m) => `${relative(ROOT, f)}: ${m[1]}`));
    expect(into).toEqual([]);
    expect(readFileSync(join(ROOT, 'web/index.html'), 'utf8')).toMatch(/<script type="module" src="\.\/src\/main\.ts"><\/script>/);
  });

  it('gives the demo page every element the view looks up in web/index.html', () => {
    const ids = (html: string) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
    const product = ids(readFileSync(join(ROOT, 'web/index.html'), 'utf8'));
    const demo = new Set(ids(readFileSync(join(ROOT, 'web/demo/index.html'), 'utf8')));
    expect(product.length).toBeGreaterThan(10);
    expect(product.filter((id) => !demo.has(id))).toEqual([]);
  });
});

// The dataset the site bakes by default (DEMO_DATA, as the build takes it, points it elsewhere): every route
// its manifest names answers through the client, and every fogged file can be reviewed and charted.
const SHOWCASE = process.env['DEMO_DATA'] ?? (existsSync(join(ROOT, SHOWCASE_DIR, SHOWCASE_INDEX)) ? SHOWCASE_DIR : undefined);
describe.skipIf(SHOWCASE === undefined)('the showcase dataset, through the demo client', () => {
  it('answers every route it names, and can chart every fogged file', async () => {
    const d = siteDataset(SHOWCASE);
    const files = Object.fromEntries([...new Set(Object.values(d.manifest.routes))].map((f) => [f, readFileSync(join(d.dir, f), 'utf8')]));
    const c = demoClient(memorySource(d.manifest, files));
    const [layout, fog] = await Promise.all([c.layout(), c.fog()]);
    expect(fog.head).toBe(layout.source.head);
    for (const v of await Promise.all([c.drones(), c.crew(), c.beacons(), c.cochange(), c.files(), c.debris()])) expect(v.head).toBe(fog.head);
    const item = (path: string) => Object.keys(d.manifest.routes).filter((k) => k.startsWith(`${path}?`)).map((k) => [...new URLSearchParams(k.slice(path.length + 1)).values()][0]!);
    for (const key of item(API.droneDetail)) expect(await c.droneDetail(key as `s_${string}`, fog.head), key).toMatchObject({ ok: true });
    for (const person of item(API.crewDetail)) expect(await c.crewDetail(person as `p_${string}`, fog.head), person).toMatchObject({ ok: true });
    // R13: every piece of the showcase's debris has its panel
    const pieces = (await c.debris()).pieces.map((p) => p.id);
    expect(item(API.debrisDetail).sort()).toEqual([...pieces].sort());
    for (const id of pieces) expect(await c.debrisDetail(id, fog.head), id).toMatchObject({ ok: true, id });
    for (const fileId of item(API.diff)) expect(await c.diff(fileId as `f_${string}`, fog.head), fileId).toMatchObject({ ok: true });
    const unseen = new Set<string>();
    for (const home of [null, ...fog.planets.map((p) => p.dirId)]) {
      const r = await c.unseen(home, fog.head);
      expect(r.ok, String(home)).toBe(true);
      for (const f of (r as UnseenList).files) unseen.add(f.fileId);
    }
    expect([...unseen].sort()).toEqual(fog.files.filter((f) => f.state === 'fogged').map((f) => f.fileId).sort());
    // charting every fogged file leaves nothing fogged, and every count where the server would put it
    for (const fileId of unseen) expect(await c.chart({ kind: 'chart', fileId: fileId as `f_${string}`, at: fog.head }), fileId).toMatchObject({ ok: true });
    const after = await c.fog();
    expect(after.files.filter((f) => f.state === 'fogged')).toEqual([]);
    expect([...after.planets.map((p) => p.fogged), after.star.fogged]).toEqual([...fog.planets.map(() => 0), 0]);
    expect(after.planets.map((p) => p.haze + p.clear)).toEqual(fog.planets.map((p) => p.total));
    // a flag stands until its own file is charted (one of them is on a misted file, never fogged)
    for (const f of (await c.cochange()).flags) expect(await c.chart({ kind: 'chart', fileId: f.fileId, at: fog.head })).toMatchObject({ ok: true });
    expect((await c.cochange()).flags).toEqual([]);
  });
});

