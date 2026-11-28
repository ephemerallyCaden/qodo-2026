// Live demo L1: the showcase fixture. A fresh build (the real scan over the invented repo and its own
// invented agent logs) must equal the committed data/ byte for byte; update deliberately with
// UPDATE_GOLDEN=1 (or `npm run fixture:showcase`) and a `Golden-Update: <reason>` line. Then the
// committed files: private by construction (visual-proof's privacy scan), every route the view reads
// passes the view's own checks, and the variety the demo promises is really in them.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { privacyHits, servedTexts } from '../.claude/skills/visual-proof/scripts/privacy.js';
import type { CoChangeView } from '../src/core/contract/cochange.js';
import type { CrewDetail, CrewView } from '../src/core/contract/crew.js';
import type { DroneDetail, DroneView } from '../src/core/contract/drones.js';
import type { BeaconView } from '../src/core/contract/beacons.js';
import type { DebrisDetail, DebrisView } from '../src/core/contract/debris.js';
import type { FogView } from '../src/core/contract/fog.js';
import type { LayoutV1 } from '../src/core/contract/layout.js';
import type { DiffView, UnseenList } from '../src/core/contract/api.js';
import type { DirId, FileId, PersonId, SessionKey, SnapshotV02 } from '../src/core/snapshot/types.js';
import { debrisDetail, debrisProblem, debrisView } from '../src/core/debris.js';
import { homes } from '../src/core/fog/index.js';
import { serverClient } from '../web/src/data/client.js';
import { HEALTHY_LOOKS, lookOf, type Look } from '../web/src/model/system.js';
import { BEACONS, buildShowcase, CHARTED, CLEARED } from './fixtures/showcase/build.js';
import { SHOWCASE_DATA_DIR, SHOWCASE_MANIFEST, type ShowcaseManifest } from './fixtures/showcase/manifest.js';
import { BOT, CREW_NAMES, IDENTITIES, MARA, THEO, THEO_ALIAS } from './fixtures/showcase/repo.js';
import { realTempDir } from './fixtures/tmp.js';

const DATA = join(import.meta.dirname, 'fixtures/showcase', SHOWCASE_DATA_DIR);
const committed = (): Map<string, string> =>
  new Map(readdirSync(DATA).filter((n) => n.endsWith('.json')).sort().map((n) => [n, readFileSync(join(DATA, n), 'utf8')]));
const read = <T>(name: string): T => JSON.parse(readFileSync(join(DATA, name), 'utf8')) as T;

const REAL_HOME = homedir();
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).split('\n').filter(Boolean);
/** What a build could change in a repo: its refs, its local config and its index. */
const repoState = (dir: string) => [git(dir, 'for-each-ref'), git(dir, 'config', '--local', '--list'), git(dir, 'ls-files', '--stage')];

/**
 * A hostile environment (Qodo PR #247 c45b5bc3, ea0b7d05): GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE point at a
 * decoy repo, and HOME at a git config (the real ones included, so their hooks still run) whose new repos default
 * to SHA-256. The build must leave the decoy alone and still produce the committed bytes.
 */
function hostileEnv(decoy: string, home: string): Record<string, string> {
  const xdg = process.env['XDG_CONFIG_HOME'] || join(REAL_HOME, '.config');
  writeFileSync(join(home, '.gitconfig'),
    `[include]\n\tpath = ${join(REAL_HOME, '.gitconfig')}\n\tpath = ${join(xdg, 'git', 'config')}\n[init]\n\tdefaultObjectFormat = sha256\n`);
  return { GIT_DIR: join(decoy, '.git'), GIT_WORK_TREE: decoy, GIT_INDEX_FILE: join(decoy, '.git', 'index'), HOME: home };
}

describe('showcase fixture build', () => {
  let fresh: Map<string, string>;
  let work: string;
  let home: string;
  let repoDir: string;
  let decoy: string;
  let decoyBefore: string[][];
  beforeAll(async () => {
    decoy = realTempDir('commet-showcase-decoy-');
    git(decoy, 'init', '-q', '-b', 'main');
    writeFileSync(join(decoy, 'keep.txt'), 'the decoy repo\n');
    git(decoy, 'add', 'keep.txt');
    git(decoy, '-c', 'user.name=Decoy', '-c', 'user.email=decoy@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'decoy');
    decoyBefore = repoState(decoy);
    home = realTempDir('commet-showcase-home-');
    work = realTempDir('commet-showcase-');
    const env = hostileEnv(decoy, home);
    const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    Object.assign(process.env, env);
    try {
      ({ files: fresh, repoDir } = await buildShowcase(work));
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
    if (process.env['UPDATE_GOLDEN']) {
      mkdirSync(DATA, { recursive: true });
      for (const name of committed().keys()) rmSync(join(DATA, name));
      for (const [name, text] of fresh) writeFileSync(join(DATA, name), text);
    }
  });

  it('a fresh build equals the committed data byte for byte (update deliberately with UPDATE_GOLDEN=1 and a Golden-Update: reason)', () => {
    const want = committed();
    expect([...fresh.keys()].sort()).toEqual([...want.keys()]);
    for (const [name, text] of fresh) expect(text, name).toBe(want.get(name));
  });

  it('leaves the repo that GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE point at untouched', () => {
    expect(repoState(decoy)).toEqual(decoyBefore);
  });

  it('makes SHA-1 commits whatever init.defaultObjectFormat says', () => {
    expect(git(repoDir, 'rev-parse', '--show-object-format')).toEqual(['sha1']);
  });

  it('never names the temp dir it was built in, nor HOME', () => {
    const literals = [{ name: 'build dir', value: work }, { name: 'HOME', value: REAL_HOME }, { name: 'build HOME', value: home }];
    expect(privacyHits([...fresh].map(([where, text]) => ({ where, text })), { literals })).toEqual([]);
  });

  it('has the stale branches debris draws: abandoned (one in a prunable worktree), merged but not deleted, an orphaned agent branch', () => {
    expect(git(repoDir, 'for-each-ref', '--format=%(refname:short)', '--no-merged=main', 'refs/heads'))
      .toEqual(['claude/legacy-cleanup', 'feature/csv-export', 'spike/remote-config']);
    expect(git(repoDir, 'for-each-ref', '--format=%(refname:short)', '--merged=main', 'refs/heads')).toEqual(['fix/tax-rounding', 'main']);
    expect(git(repoDir, 'worktree', 'list', '--porcelain').filter((l) => l.startsWith('branch ') || l.startsWith('prunable')))
      .toEqual(['branch refs/heads/main', 'branch refs/heads/spike/remote-config', expect.stringMatching(/^prunable/)]);
  });
});

describe('showcase fixture data', () => {
  const manifest = read<ShowcaseManifest>(SHOWCASE_MANIFEST);
  const layout = read<LayoutV1>(manifest.routes['/api/layout']);
  const fog = read<FogView>(manifest.routes['/api/fog']);
  const snapshot = read<SnapshotV02>(manifest.routes['/api/snapshot']);

  it('passes the privacy scan: no absolute paths, tokens, emails or agent-log fields in any route', () => {
    const literals = IDENTITIES.map((w) => ({ name: 'an author email', value: w.email }));
    const items = [...committed()].flatMap(([name, body]) => servedTexts({ path: `/api/showcase/${name.replace(/\.json$/, '').replace(/[^a-z0-9-]+/g, '-')}`, body }));
    expect(items.length).toBeGreaterThan(committed().size);
    expect(privacyHits(items, { literals })).toEqual([]);
  });

  it('the manifest names every file once, and every file answers at its head', () => {
    const named = [...Object.values(manifest.routes), ...Object.values(manifest.droneDetail), ...Object.values(manifest.crewDetail),
      ...Object.values(manifest.unseen), ...Object.values(manifest.diff), ...Object.values(manifest.debrisDetail), SHOWCASE_MANIFEST].sort();
    expect(named).toEqual([...committed().keys()]);
    expect(layout.source.head).toBe(manifest.head);
    for (const name of named.filter((n) => n !== SHOWCASE_MANIFEST && n !== manifest.routes['/api/layout'] && n !== manifest.routes['/api/snapshot'])) {
      const v = read<{ head?: string; at?: string }>(name);
      expect(v.head ?? v.at, name).toBe(manifest.head);
    }
    const drones = read<DroneView>(manifest.routes['/api/drones']);
    expect(Object.keys(manifest.droneDetail).sort()).toEqual(drones.sessions.filter((s) => !s.inferred).map((s) => s.key).sort());
    expect(Object.keys(manifest.crewDetail).sort()).toEqual(read<CrewView>(manifest.routes['/api/crew']).members.map((m) => m.person).sort());
    expect(Object.keys(manifest.unseen).sort()).toEqual([...layout.planets.map((p) => p.dirId), 'star'].sort());
    const listed = Object.values(manifest.unseen).flatMap((n) => read<UnseenList>(n).files.map((f) => f.fileId));
    expect(Object.keys(manifest.diff).sort()).toEqual([...listed].sort());
    expect(listed.sort()).toEqual(fog.files.filter((f) => f.state === 'fogged').map((f) => f.fileId).sort());
  });

  describe('through the view\'s own client and checks', () => {
    afterEach(() => vi.unstubAllGlobals());
    /** A stand-in server: answers each read route from the manifest, as the demo's client will. */
    const serve = () => vi.stubGlobal('fetch', async (path: string) => {
      const url = new URL(path, 'http://127.0.0.1');
      const q = (k: string) => url.searchParams.get(k) ?? '';
      const byKey: Record<string, Record<string, string>> = {
        '/api/drone-detail': manifest.droneDetail, '/api/crew-detail': manifest.crewDetail, '/api/unseen': manifest.unseen, '/api/diff': manifest.diff,
        '/api/debris-detail': manifest.debrisDetail,
      };
      const key = { '/api/drone-detail': q('key'), '/api/crew-detail': q('person'), '/api/unseen': q('home'), '/api/diff': q('fileId'),
        '/api/debris-detail': q('id') }[url.pathname];
      const file = (manifest.routes as Record<string, string>)[url.pathname] ?? (key !== undefined && q('at') === manifest.head ? byKey[url.pathname]?.[key] : undefined);
      return file ? new Response(readFileSync(join(DATA, file), 'utf8'), { status: 200 }) : new Response('{}', { status: 404 });
    });

    it('every read route loads', async () => {
      serve();
      const c = serverClient('demo');
      expect((await c.layout()).planets).toHaveLength(layout.planets.length);
      expect((await c.fog()).files).toHaveLength(fog.files.length);
      expect((await c.drones()).total).toBeGreaterThan(0);
      expect((await c.crew()).total).toBeGreaterThan(0);
      expect((await c.beacons()).beacons.length).toBeGreaterThan(0);
      expect((await c.cochange()).links.length).toBeGreaterThan(0);
      expect((await c.files()).files.length).toBe(snapshot.files.length);
      // The view has no debris client yet (debris-render adds it): the routes answer through the same stand-in.
      const debris = await (await fetch('/api/debris')).json() as DebrisView;
      expect(debris.total).toBeGreaterThan(0);
      for (const p of debris.pieces) {
        const res = await fetch(`/api/debris-detail?${new URLSearchParams({ id: p.id, at: manifest.head })}`);
        expect(res.status, p.id).toBe(200);
        expect((await res.json() as DebrisDetail).id).toBe(p.id);
      }
      for (const key of Object.keys(manifest.droneDetail)) expect((await c.droneDetail(key as SessionKey, manifest.head)).ok, key).toBe(true);
      for (const person of Object.keys(manifest.crewDetail)) expect((await c.crewDetail(person as PersonId, manifest.head)).ok, person).toBe(true);
      for (const home of Object.keys(manifest.unseen)) expect((await c.unseen(home === 'star' ? null : home as DirId, manifest.head)).ok, home).toBe(true);
      for (const fileId of Object.keys(manifest.diff)) {
        const d = await c.diff(fileId as FileId, manifest.head);
        expect(d.ok && d.sections.length > 0 && d.sections[0]!.hunks.length > 0, fileId).toBe(true);
      }
    });
  });

  it('shows every planet look the view draws: lava, toxic, desert (ash) and each healthy look', () => {
    const looks = new Set(layout.planets.map((p) => lookOf(p.health.band, p.biomeSeed)));
    const all: Look[] = ['lava', 'toxic', 'desert', ...HEALTHY_LOOKS];
    expect([...looks].sort()).toEqual([...all].sort());
    expect(new Set(layout.planets.map((p) => p.health.band))).toEqual(new Set(['lava', 'toxic', 'ash', 'healthy']));
  });

  it('has 6–8 content planets, outer planets, continents, settlements, moons, both kinds of moonlet and test data', () => {
    const content = layout.planets.filter((p) => p.zone === 'content');
    expect(content.length).toBeGreaterThanOrEqual(6);
    expect(content.length).toBeLessThanOrEqual(8);
    expect(layout.planets.filter((p) => p.zone === 'outer').length).toBeGreaterThanOrEqual(1);
    expect(layout.planets.some((p) => p.surface.continents.length >= 3)).toBe(true);
    expect(layout.planets.every((p) => p.surface.settlements.length > 0)).toBe(true);
    expect(Math.max(...layout.planets.map((p) => p.moons.length))).toBeGreaterThanOrEqual(4);
    expect(new Set(layout.star.moonlets.map((m) => m.kind))).toEqual(new Set(['root-file', 'unmatched-test']));
    expect(layout.star.testData).toBeGreaterThan(0);
    // Sizes differ (planet size = LOC).
    expect(new Set(layout.planets.map((p) => p.radiusMilli)).size).toBe(layout.planets.length);
  });

  it('has all three fog levels, a planet at 0% and one at 100% mastery, and others between', () => {
    expect(new Set(fog.files.map((f) => f.state))).toEqual(new Set(['fogged', 'haze', 'clear']));
    const mastery = fog.planets.map((p) => p.clear / p.total);
    expect(mastery).toContain(0);
    expect(mastery).toContain(1);
    expect(mastery.filter((m) => m > 0 && m < 1).length).toBeGreaterThanOrEqual(4);
    expect(fog.baseline).not.toBeNull();
    const state = new Map(fog.files.map((f) => [snapshot.files.find((s) => s.id === f.fileId)!.path, f.state]));
    for (const p of CHARTED) expect(state.get(p), p).toBe('haze');
    for (const p of CLEARED) expect(state.get(p), p).toBe('clear');
    // The reasons the review panel names: an agent's lines, your commit of them, and a teammate's change (unknown: never human, Rule 1).
    const reasons = new Set(fog.files.flatMap((f) => f.reasons));
    for (const r of ['agent', 'self-committed-agent-written', 'unknown'] as const) expect(reasons, r).toContain(r);
  });

  it('has the captain and five teammates, an alias merged by .mailmap, and the bot left out', () => {
    const crew = read<CrewView>(manifest.routes['/api/crew']);
    expect(crew.members.map((m) => m.displayName).sort()).toEqual([...CREW_NAMES].sort());
    expect(crew.members.filter((m) => m.captain).map((m) => m.displayName)).toEqual([MARA.name]);
    expect(crew.bots).toBe(1);
    expect(crew.members.map((m) => m.displayName)).not.toContain(BOT.name);
    expect(crew.members.map((m) => m.displayName)).not.toContain(THEO_ALIAS.name);
    const theo = crew.members.find((m) => m.displayName === THEO.name)!;
    expect(read<CrewDetail>(manifest.crewDetail[theo.person]!).files.length).toBeGreaterThan(0);
  });

  it('has 4–8 agent sessions on different bodies, a subagent among them, each with files and a timeline', () => {
    const drones = read<DroneView>(manifest.routes['/api/drones']);
    expect(drones.total).toBeGreaterThanOrEqual(4);
    expect(drones.total).toBeLessThanOrEqual(8);
    expect(new Set(drones.sessions.map((s) => s.home)).size).toBeGreaterThanOrEqual(5);
    expect(drones.sessions.map((s) => s.home)).toContain('star');
    expect(drones.sessions.some((s) => s.kind === 'subagent')).toBe(true);
    for (const s of drones.sessions) {
      const d = read<DroneDetail>(manifest.droneDetail[s.key]!);
      expect(d.files.length, s.key).toBeGreaterThan(0);
      expect(d.buckets.reduce((a, b) => a + b, 0), s.key).toBe(d.files.reduce((a, f) => a + f.edits, 0) + d.otherEdits);
    }
  });

  it('has co-change lines, within and across planets, and at least one missing-pair flag', () => {
    const cc = read<CoChangeView>(manifest.routes['/api/cochange']);
    const home = new Map(cc.files.map((f) => [f.fileId, f.home]));
    expect(cc.links.some((l) => home.get(l.a) === home.get(l.b))).toBe(true);
    expect(cc.links.some((l) => home.get(l.a) !== home.get(l.b))).toBe(true);
    expect(cc.flags.length).toBeGreaterThanOrEqual(1);
  });

  it('has the captain\'s log beacons', () => {
    const b = read<BeaconView>(manifest.routes['/api/beacons']);
    expect(b.beacons.map((x) => [x.path, x.text])).toEqual(BEACONS.map((x) => [x.path, x.text]));
    expect(b.unplaced).toBe(0);
  });

  it('has the unmerged stale branches in the snapshot, with old dates', () => {
    expect(snapshot.branches.map((b) => [b.name, b.lastCommitDate])).toEqual([
      ['claude/legacy-cleanup', '2026-09-20T11:00:00Z'], ['feature/csv-export', '2026-07-28T14:00:00Z'], ['spike/remote-config', '2026-05-12T10:00:00Z']]);
  });

  it('debris: the view and every panel are what the snapshot they ship with says', () => {
    expect(debrisProblem(snapshot)).toBeNull();
    const home = homes(snapshot, layout.source.roots);
    expect(read<DebrisView>(manifest.routes['/api/debris'])).toEqual(debrisView(snapshot, home));
    const ids = read<DebrisView>(manifest.routes['/api/debris']).pieces.map((p) => p.id);
    expect(Object.keys(manifest.debrisDetail).sort()).toEqual([...ids].sort());
    for (const id of ids) expect(read<DebrisDetail>(manifest.debrisDetail[id]!), id).toEqual(debrisDetail(snapshot, home, id));
  });

  it('has debris on three planets, in three classes and all three decay steps, with a prunable worktree and an agent session', () => {
    const v = read<DebrisView>(manifest.routes['/api/debris']);
    expect(v.placed).toBe(v.total);
    expect(new Set(v.pieces.map((p) => p.cls))).toEqual(new Set(['branch', 'merged', 'agent']));
    expect(new Set(v.pieces.map((p) => p.home)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(v.pieces.map((p) => p.ageStep))).toEqual(new Set([0, 1, 2]));
    const details = v.pieces.map((p) => read<DebrisDetail>(manifest.debrisDetail[p.id]!));
    expect(details.map((d) => d.name).sort()).toEqual(['claude/legacy-cleanup', 'feature/csv-export', 'fix/tax-rounding', 'spike/remote-config']);
    expect(details.filter((d) => d.worktree?.prunable).map((d) => d.name)).toEqual(['spike/remote-config']);
    expect(details.find((d) => d.cls === 'agent')!.sessions.length).toBeGreaterThan(0);
    expect(details.every((d) => d.cleanup !== null)).toBe(true);
  });

  it('diffs are short (the folder stays small)', () => {
    for (const name of Object.values(manifest.diff)) {
      const d = read<DiffView>(name);
      expect(d.truncated, name).toBe(false);
      expect(d.shownLines, name).toBeLessThan(60);
    }
  });
});
