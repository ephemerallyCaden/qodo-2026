// Chart state on disk and the fog entry points (#33, R5). `commet chart` and the local server (#32)
// both read and write through here: readFog for GET /api/fog, applyChart for POST /api/chart.
// State lives in `.git/commet/chart.json` (canonical JSON, 0600, atomic writes, symlinks refused).
import { lstatSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson } from '../core/canonical-json.js';
import type { ChartResult } from '../core/contract/api.js';
import type { DroneView } from '../core/contract/drones.js';
import type { ChartAction, ChartUnknownHead, FogView } from '../core/contract/fog.js';
import { droneView } from '../core/drones.js';
import { CommetError, EXIT } from '../core/errors.js';
import {
  applyChartAction, emptyChart, fogBase, fogFrom, parseChartAction, parseChartState, unrowedChanges, type ChartState, type FogBase,
} from '../core/fog/index.js';
import { pathHistory, type PathHistory } from '../core/renames.js';
import { isCanonicalRoot, parseRoots } from '../core/roots.js';
import type { SnapshotV02 } from '../core/snapshot/types.js';
import { exclusionOf } from '../scan/exclusions.js';
import { gitRunner, tryGit } from '../scan/git.js';
import { lineageLog } from '../scan/structure.js';
import { readStateBytes, stateDir, writeAtomic } from './io.js';

/** Chart state in the state dir. */
export const CHART_FILE = 'chart.json';
const SNAPSHOT_FILE = 'snapshot.json';
const LAYOUT_FILE = 'layout.json';
const LOCK_FILE = 'chart.lock';
/** About 2 s of waiting for another commet (the CLI and the server) to finish its write. */
const LOCK_TRIES = 100;
const LOCK_WAIT_MS = 20;

/** What fog needs, read once: the state dir and the chart-independent fog for the latest snapshot. */
export interface FogSource {
  /** The working directory it was opened from, so writeChart can reopen it. */
  repoDir: string;
  dir: string;
  base: FogBase;
  /** Identity of the snapshot.json and layout.json `base` was built from (null if the snapshot couldn't be stat'ed). */
  key: string | null;
}

/**
 * Identity of the snapshot file and the layout beside it, whose roots fog uses (#71) and whose
 * source pairs with it (#64): an atomic write gives a file a new inode. Null when the snapshot is absent.
 */
function snapshotKey(dir: string): string | null {
  const id = (name: string) => {
    const st = lstatSync(join(dir, name), { bigint: true });
    return `${st.dev}\0${st.ino}\0${st.size}\0${st.mtimeNs}`;
  };
  let snapshot: string;
  try {
    snapshot = id(SNAPSHOT_FILE);
  } catch {
    return null; // readSnapshot reports why
  }
  let layout = 'none';
  try {
    layout = id(LAYOUT_FILE);
  } catch {
    // No layout yet: readScanPair gives no roots.
  }
  return `${dir}\0${snapshot}\0${layout}`;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const all = (v: unknown, ok: (x: Record<string, unknown>) => boolean) => Array.isArray(v) && v.every((x) => isObject(x) && ok(x));
const str = (v: unknown): v is string => typeof v === 'string';
/** A full commit SHA. Anything else (an option such as `--output=…`, a rev like `HEAD~1`) never reaches git. */
const sha = (v: unknown): v is string => typeof v === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(v);

/** The fields fog reads, checked so a damaged snapshot is a state error, never an internal one. */
function isSnapshot(v: unknown): v is SnapshotV02 {
  if (!isObject(v) || v['schemaVersion'] !== '0.2' || !isObject(v['repo'])) return false;
  const repo = v['repo'];
  return sha(repo['head']) && str(repo['repoId']) && Array.isArray(repo['selfPersonIds']) && repo['selfPersonIds'].every(str)
    && all(v['files'], (f) => str(f['id']) && str(f['path']) && typeof f['isTest'] === 'boolean' && (f['testOf'] === null || str(f['testOf'])))
    && all(v['dirs'], (d) => str(d['id']) && str(d['path']) && Number.isInteger(d['depth']))
    && all(v['commits'], (c) => Number.isInteger(c['seq']) && sha(c['sha']) && str(c['author']) && isObject(c['attribution'])
      && str(c['attribution']['class']) && typeof c['attribution']['selfCommittedAgentWritten'] === 'boolean'
      && Array.isArray(c['files']) && c['files'].every((r) => Array.isArray(r) && str(r[0]) && Number.isInteger(r[1]) && Number.isInteger(r[2])));
}

/** The snapshot `commet scan` last wrote. */
export async function readSnapshot(dir: string): Promise<SnapshotV02> {
  const text = (await readStateBytes(dir, SNAPSHOT_FILE))?.toString('utf8') ?? null;
  if (text === null) throw new CommetError('no snapshot yet: run `commet scan` first', EXIT.state);
  let v: unknown = null;
  try {
    v = JSON.parse(text);
  } catch {
    // Falls through to the refusal below.
  }
  if (!isSnapshot(v)) throw new CommetError('state error: .git/commet/snapshot.json is damaged or from another commet version; run `commet scan`', EXIT.state);
  return v;
}

/** What fog reads from layout.json: the scan it came from and its content roots (#71). */
interface LayoutSource { head: string; repoId: string; roots: string[] }

/** The layout's `source`, or null when there is no layout yet. A layout from before roots has none. */
async function readLayoutSource(dir: string): Promise<LayoutSource | null> {
  const text = (await readStateBytes(dir, LAYOUT_FILE))?.toString('utf8') ?? null;
  if (text === null) return null;
  let v: unknown = null;
  try {
    v = JSON.parse(text);
  } catch {
    // Falls through to the refusal below.
  }
  const source = isObject(v) && v['schemaVersion'] === 'layout.1' && isObject(v['source']) ? v['source'] : {};
  const { head, repoId, roots = [] } = source;
  // As the contract records them: sorted, no repeats, none inside another (as config.json, Qodo local r1 #2).
  const canonical = (rs: unknown[]): rs is string[] => {
    if (!rs.every(isCanonicalRoot)) return false;
    const set = parseRoots(rs, new Set(rs));
    return 'roots' in set && set.roots.join('\0') === rs.join('\0');
  };
  if (!sha(head) || !str(repoId) || !Array.isArray(roots) || !canonical(roots)) {
    throw new CommetError(`state error: .git/commet/${LAYOUT_FILE} is damaged or from another commet version; run \`commet scan\``, EXIT.state);
  }
  return { head, repoId, roots };
}

/** A snapshot and the content roots of the layout from the same scan. */
export interface ScanPair { snapshot: SnapshotV02; roots: string[] }

/** Reads of the pair before a mismatch is believed, while scans keep replacing the files mid-read. */
const PAIR_TRIES = 3;

const short = (head: string) => head.slice(0, 7);

/**
 * snapshot.json and layout.json as one scan's pair (#64): the one reader of both, so fog counts
 * the planets the view draws (#71 C8). `commet scan` publishes them as two renames, so an
 * interrupted or overlapping scan can leave one scan's layout beside another's snapshot. They pair
 * only when the layout's source.head and source.repoId are the snapshot's; anything else is a state
 * error, so no fog, count or chart write comes from a mix, and nothing is reset. No layout yet is
 * #18's mapping (no roots). A scan that replaced a file while it was read gets a fresh read.
 */
export async function readScanPair(dir: string): Promise<ScanPair> {
  for (let tries = 1; ; tries++) {
    const key = snapshotKey(dir);
    const snapshot = await readSnapshot(dir);
    const layout = await readLayoutSource(dir);
    if (layout === null) return { snapshot, roots: [] };
    const { head, repoId } = snapshot.repo;
    if (layout.head === head && layout.repoId === repoId) return { snapshot, roots: layout.roots };
    if (tries < PAIR_TRIES && snapshotKey(dir) !== key) continue;
    const other = layout.head === head ? ", another repository's" : '';
    throw new CommetError(`state error: the snapshot (of ${short(head)}) and the layout (of ${short(layout.head)}${other}) come from different `
      + 'scans (an interrupted or overlapping `commet scan`); run `commet scan` to write a matching pair', EXIT.state);
  }
}

/** Chart state, or the empty state when there is none yet. A damaged file is refused, never reset. */
export async function readChart(dir: string): Promise<ChartState> {
  const text = (await readStateBytes(dir, CHART_FILE))?.toString('utf8') ?? null;
  if (text === null) return emptyChart();
  try {
    return parseChartState(text);
  } catch (e) {
    throw new CommetError(`state error: .git/commet/${CHART_FILE} is unreadable (${(e as Error).message}); move it aside to start over`, EXIT.state);
  }
}

/**
 * Path history for the snapshot's window, from #16's lineage log of just that range (the window's
 * first commit's parent, exclusive, up to the head). Null when git can't read it or it doesn't match
 * the snapshot's commits; fog then errs to lineage-unknown for every changed file.
 */
async function readHistory(repoDir: string, s: SnapshotV02): Promise<PathHistory | null> {
  if (s.commits.length === 0) return null;
  const first = s.commits.reduce((a, c) => (c.seq < a.seq ? c : a));
  try {
    const log = await lineageLog(gitRunner(repoDir), first.seq > 0 ? `${first.sha}^..${s.repo.head}` : s.repo.head);
    if (log.at(-1)?.sha !== s.repo.head || !s.commits.every((c) => log[c.seq - first.seq]?.sha === c.sha)) return null;
    const excluded = (p: string) => exclusionOf(p) !== null;
    return { ...pathHistory(log, first.seq, excluded), unrowed: unrowedChanges(s, log, first.seq, excluded) };
  } catch {
    // Not dropped: null makes every changed file lineage-unknown, and the CLI says so.
    return null;
  }
}

// A server calls in on every request. History for a (head, window) never changes, so it's kept by
// those; a failure isn't kept, so it's retried. The fog base is kept until snapshot.json changes
// (an atomic write gives it a new inode).
const commonDirs = new Map<string, string>();
let history: { key: string; value: Promise<PathHistory | null> } | null = null;
let loaded: { key: string; base: Promise<FogBase> } | null = null;

function historyFor(repoDir: string, dir: string, s: SnapshotV02): Promise<PathHistory | null> {
  const key = `${dir}\0${s.repo.head}\0${s.commits.reduce((m, c) => Math.min(m, c.seq), Infinity)}`;
  if (history?.key === key) return history.value;
  const value = readHistory(repoDir, s);
  const entry = { key, value };
  history = entry;
  void value.then((h) => {
    if (h === null && history === entry) history = null;
  });
  return value;
}

export async function openFogSource(repoDir: string): Promise<FogSource> {
  let common = commonDirs.get(repoDir);
  if (common === undefined) {
    const out = await tryGit(gitRunner(repoDir), ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    if (out === null) throw new CommetError('not inside a git repository', EXIT.noRepo);
    // Only git's own trailing newline is dropped: a path is never trimmed (AGENTS.md Rule 7).
    common = realpathSync.native(out.replace(/\n$/, ''));
    commonDirs.set(repoDir, common);
  }
  // A read never creates .git/commet: no state dir means no snapshot yet.
  try {
    lstatSync(join(common, 'commet'));
  } catch {
    throw new CommetError('no snapshot yet: run `commet scan` first', EXIT.state);
  }
  const dir = stateDir(common);
  const key = snapshotKey(dir);
  if (key !== null && loaded?.key === key) return { repoDir, dir, base: await loaded.base, key };
  const { snapshot, roots } = await readScanPair(dir);
  const base = historyFor(repoDir, dir, snapshot).then((h) => fogBase(snapshot, h, roots));
  // Stat before read: the cached content is never older than its key.
  const entry = key === null ? null : { key, base };
  loaded = entry;
  // Not kept when it fails or was built without history, so the next request tries again.
  const ready = await base.catch((e: unknown) => {
    if (loaded === entry) loaded = null;
    throw e;
  });
  if (loaded === entry && ready.degraded && snapshot.commits.length > 0) loaded = null;
  return { repoDir, dir, base: ready, key };
}

export const currentFog = async (src: FogSource): Promise<FogView> => fogFrom(src.base, await readChart(src.dir));

/**
 * Serialises chart writes with an exclusive lock file. That holds within this process too (a second
 * write waits on the file like any other), so `fn` may await. Scans don't take it (a write
 * is recorded at its own `at`, so a scan can't make it unsafe), so a lock a killed writer left can
 * only block chart writes, which say how to clear it.
 */
async function withChartLock<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const lock = join(dir, LOCK_FILE);
  for (let tries = 1; ; tries++) {
    try {
      writeFileSync(lock, '', { flag: 'wx', mode: 0o600 });
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      if (tries >= LOCK_TRIES) {
        throw new CommetError('state error: another commet is writing chart state (if none is running, delete .git/commet/chart.lock)', EXIT.state);
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_MS));
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(lock, { force: true });
  }
}

export type ChartWrite =
  | { ok: true; prev: ChartState; chart: ChartState; base: FogBase }
  | ChartUnknownHead
  | { ok: false; error: string; head?: undefined };

/** Reloads of the fog source before a write gives up, when scans keep landing in between. */
const WRITE_TRIES = 3;

/**
 * Applies one action to the stored chart state, under the chart lock. The action is recorded at its
 * own `at`, so a scan landing at any point around the write can't make it cover a change the user
 * didn't see (#58). The one thing a scan can do is publish a head that `src` doesn't know yet, so if
 * snapshot.json changed since `src` was read, the source is reloaded first. The ok result carries the
 * base it was applied on.
 */
export async function writeChart(src: FogSource, action: ChartAction): Promise<ChartWrite> {
  for (let tries = 1; ; tries++) {
    const cur = src;
    const r = await withChartLock(cur.dir, async (): Promise<ChartWrite | null> => {
      if (snapshotKey(cur.dir) !== cur.key) return null;
      const prev = await readChart(cur.dir);
      const applied = applyChartAction(cur.base, prev, action);
      if (!applied.ok) return applied;
      writeAtomic(join(cur.dir, CHART_FILE), canonicalJson(applied.chart));
      return { ok: true, prev, chart: applied.chart, base: cur.base };
    });
    if (r !== null) return r;
    if (tries >= WRITE_TRIES) throw new CommetError('state error: the snapshot kept changing during the write; try again', EXIT.state);
    src = await openFogSource(cur.repoDir);
  }
}

/** GET /api/fog (#32): the fog view for the latest snapshot. State errors throw CommetError. */
export async function readFog(repoDir: string): Promise<FogView> {
  return await currentFog(await openFogSource(repoDir));
}

/**
 * POST /api/chart (#32). `body` is the untrusted JSON body; only an exact ChartAction is applied. A
 * bad action, a file not in the snapshot or nothing to undo gives `{ ok: false, error }`. State
 * errors (damaged or symlinked state, no snapshot, lock held) throw CommetError.
 */
export async function applyChart(repoDir: string, body: unknown): Promise<ChartResult> {
  const action = parseChartAction(body);
  if (!action) return { ok: false, error: 'not a chart action' };
  const r = await writeChart(await openFogSource(repoDir), action);
  return r.ok ? { ok: true, fog: fogFrom(r.base, r.chart) } : r;
}

/** GET /api/drones (#80): the drone view, placed with the same file-to-planet map as the fog. State errors throw CommetError. */
export async function readDrones(repoDir: string): Promise<DroneView> {
  const { base } = await openFogSource(repoDir);
  return droneView(base.snapshot, base.home);
}
