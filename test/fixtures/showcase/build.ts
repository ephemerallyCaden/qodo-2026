// Builds the showcase fixture's data (live demo L1): the invented repo (repo.ts), the real `commet scan`
// over it with only its own invented agent logs, chart state through the real writers (a baseline,
// charts, quiz passes, beacons), then every read route of `commet open` answered by the server's own
// readers. The result is the committed data/ folder: file name → exact text.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from '../../../src/cli/main.js';
import { API, STAR_HOME } from '../../../src/core/contract/api.js';
import type { LayoutV1 } from '../../../src/core/contract/layout.js';
import type { FileId, SnapshotV02 } from '../../../src/core/snapshot/types.js';
import { applyBeacon, readBeacons } from '../../../src/state/beacons.js';
import { applyChart, openFogSource, readDroneDetail, readDrones, readFog, writeQuizPass } from '../../../src/state/chart.js';
import { readCoChange } from '../../../src/state/cochange.js';
import { readCrew, readCrewDetail } from '../../../src/state/crew.js';
import { readDiff, readUnseen } from '../../../src/state/diff.js';
import { readStateBytes, stateDir } from '../../../src/state/io.js';
import { SHOWCASE_MANIFEST, showcaseFile, type ShowcaseManifest } from './manifest.js';
import { buildShowcaseRepo, ROOT } from './repo.js';

/** Files you charted (read their whole diff): misted. */
export const CHARTED = ['src/auth/session.ts', 'src/ui/pages/settings.ts', 'docs/changelog.md'] as const;

/** Files whose quiz you passed: clear. */
export const CLEARED = [
  'src/auth/password.ts', 'src/auth/password.test.ts', 'src/auth/roles.ts', 'src/auth/roles.test.ts', 'src/auth/session.test.ts',
  'src/api/server.ts', 'src/core/config.ts', 'src/core/errors.ts', 'src/core/events.test.ts', 'src/ui/components/modal.ts',
  'src/billing/invoice.test.ts', 'docs/architecture.md', 'scripts/release.ts', 'scripts/seed.ts', 'tsconfig.json',
] as const;

/** Captain's log beacons, left on these files. */
export const BEACONS = [
  { path: 'src/auth/session.ts', text: 'Token refresh lives here, not in the client.' },
  { path: 'src/billing/tax.ts', text: 'Ask Juno before changing the rounding rules.' },
  { path: 'src/legacy/importer.ts', text: 'Frozen: the sync planet replaces this next quarter.' },
] as const;

/** A fixed state key, so nothing could differ between builds even if it were used (snapshots never depend on it). */
const KEY = new Uint8Array(32).fill(0x5c);

const text = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const okOrThrow = <T extends { ok: boolean }>(what: string, r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(`showcase: ${what} was refused: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
};

/**
 * Builds everything in `work` (empty or absent; a temp dir, removed by the caller) and returns the data folder's
 * files, name → text, and the scanned repo's folder. Never reads this machine's agent logs: the scan's
 * `CLAUDE_CONFIG_DIR` is the fixture's own.
 */
export function buildShowcase(work: string): Promise<{ files: Map<string, string>; repoDir: string }> {
  return withoutGitEnv(() => build(work));
}

/**
 * Runs `fn` with every GIT_* variable out of process.env, then puts them back. The scan and the state readers
 * run in this process and hand process.env to git, so GIT_DIR, GIT_WORK_TREE or GIT_INDEX_FILE would point
 * them at another repo (Qodo PR #247 c45b5bc3).
 */
async function withoutGitEnv<T>(fn: () => Promise<T>): Promise<T> {
  const saved = Object.entries(process.env).filter(([k]) => k.startsWith('GIT_'));
  for (const [k] of saved) delete process.env[k];
  try {
    return await fn();
  } finally {
    for (const [k, v] of saved) process.env[k] = v;
  }
}

async function build(work: string): Promise<{ files: Map<string, string>; repoDir: string }> {
  const repo = await buildShowcaseRepo(work);
  writeFileSync(join(stateDir(join(repo.dir, '.git')), 'key'), KEY, { mode: 0o600, flag: 'wx' });
  let err = '';
  const code = await main(['scan', '--root', ROOT], { stdout: () => {}, stderr: (t) => (err += t), cwd: repo.dir, env: { CLAUDE_CONFIG_DIR: repo.claudeDir } });
  if (code !== 0) throw new Error(`showcase: commet scan exited ${code}: ${err}`);

  const state = stateDir(join(repo.dir, '.git'));
  const raw = async (name: string) => (await readStateBytes(state, name))!.toString('utf8');
  const snapshot = JSON.parse(await raw('snapshot.json')) as SnapshotV02;
  const layout = JSON.parse(await raw('layout.json')) as LayoutV1;
  const head = snapshot.repo.head;
  const idOf = (path: string): FileId => {
    const f = snapshot.files.find((x) => x.path === path);
    if (!f) throw new Error(`showcase: ${path} is not in the snapshot`);
    return f.id;
  };

  okOrThrow('the baseline', await applyChart(repo.dir, { kind: 'baseline', at: repo.baseline }));
  for (const p of CHARTED) okOrThrow(`charting ${p}`, await applyChart(repo.dir, { kind: 'chart', fileId: idOf(p), at: head }));
  for (const p of CLEARED) okOrThrow(`the quiz on ${p}`, await writeQuizPass(await openFogSource(repo.dir), { fileId: idOf(p), at: head }));
  for (const b of BEACONS) okOrThrow(`the beacon on ${b.path}`, await applyBeacon(repo.dir, { fileId: idOf(b.path), at: head, text: b.text }));

  const out = new Map<string, string>();
  const put = (name: string, value: unknown) => {
    if (out.has(name)) throw new Error(`showcase: ${name} twice`);
    out.set(name, text(value));
    return name;
  };
  const drones = await readDrones(repo.dir);
  const crew = await readCrew(repo.dir);
  const manifest: ShowcaseManifest = {
    schemaVersion: 'showcase.1',
    head,
    routes: {
      [API.snapshot]: put(showcaseFile('snapshot'), snapshot),
      [API.layout]: put(showcaseFile('layout'), layout),
      [API.fog]: put(showcaseFile('fog'), await readFog(repo.dir)),
      [API.drones]: put(showcaseFile('drones'), drones),
      [API.crew]: put(showcaseFile('crew'), crew),
      [API.cochange]: put(showcaseFile('cochange'), await readCoChange(repo.dir)),
      [API.beacons]: put(showcaseFile('beacons'), await readBeacons(repo.dir)),
    },
    droneDetail: {},
    crewDetail: {},
    unseen: {} as ShowcaseManifest['unseen'],
    diff: {},
  };
  for (const s of drones.sessions) {
    if (s.inferred) continue;
    manifest.droneDetail[s.key] = put(showcaseFile('drone-detail', s.key), okOrThrow(`drone ${s.key}`, await readDroneDetail(repo.dir, { key: s.key, at: head })));
  }
  for (const m of crew.members) {
    manifest.crewDetail[m.person] = put(showcaseFile('crew-detail', m.person), okOrThrow(`crew ${m.person}`, await readCrewDetail(repo.dir, { person: m.person, at: head })));
  }
  for (const home of [...layout.planets.map((p) => p.dirId), null]) {
    const list = okOrThrow(`unseen ${home ?? STAR_HOME}`, await readUnseen(repo.dir, { home, at: head }));
    manifest.unseen[home ?? STAR_HOME] = put(showcaseFile('unseen', home ?? STAR_HOME), list);
    for (const f of list.files) manifest.diff[f.fileId] = put(showcaseFile('diff', f.fileId), okOrThrow(`diff ${f.path}`, await readDiff(repo.dir, { fileId: f.fileId, at: head })));
  }
  out.set(SHOWCASE_MANIFEST, text(manifest));
  return { files: out, repoDir: repo.dir };
}
