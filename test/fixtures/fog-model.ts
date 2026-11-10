// A tiny model repo for the fog tests (#33). It records history as file operations and gives back
// what `commet scan` and #16's lineage log would: a snapshot and the name-status lineage at any head.
// It also keeps each file's true identity (uid) across renames, so tests can check the fog against
// an oracle that never looks at paths.
import { byCodepoint } from '../../src/core/canonical-json.js';
import { sha256Hex } from '../../src/core/hash.js';
import { fileIdOf } from '../../src/core/fog/index.js';
import { pathHistory, type PathHistory } from '../../src/core/renames.js';
import type { FogReason } from '../../src/core/contract/fog.js';
import type { Commit, CommitClass, CommitFile, PersonId, Sha, SnapshotV02 } from '../../src/core/snapshot/types.js';
import type { Change, LineageCommit } from '../../src/core/structure.js';

export const SELF: PersonId = 'p_5e1f5e1f5e1f';
export const MATE: PersonId = 'p_3a7e3a7e3a7e';

export interface Author { who: PersonId; cls: CommitClass; flag?: boolean }
export const YOURS: Author = { who: SELF, cls: 'human' };
export const AGENT: Author = { who: SELF, cls: 'agent', flag: true };
export const NOT_YOURS: Author[] = [
  AGENT,
  { who: SELF, cls: 'mixed', flag: true },
  { who: SELF, cls: 'unknown' },
  { who: MATE, cls: 'unknown' },
  { who: MATE, cls: 'agent' },
  { who: MATE, cls: 'human' },
];

/** The reasons fogView should give for a change by `a` (the contract's rules, restated). */
export function expectedReasons(a: Author): FogReason[] {
  const out: FogReason[] = [];
  if (a.cls !== 'human') out.push(a.cls);
  else if (a.who !== SELF) out.push('teammate');
  if (a.flag) out.push('self-committed-agent-written');
  return out.sort();
}

export type Op =
  | { op: 'add'; path: string; lines?: number }
  | { op: 'edit'; path: string }
  | { op: 'rename'; from: string; to: string; edit?: boolean }
  | { op: 'delete'; path: string }
  /** A mode change: status M, numstat 0/0. */
  | { op: 'chmod'; path: string };

interface ModelCommit { sha: Sha; author: Author; ops: Op[]; changes: Change[]; rows: CommitFile[] }
/** A touch on a file's identity. `content` is false for a pure rename or a mode change. */
export interface UidTouch { seq: number; author: Author; content: boolean }

export class Model {
  readonly commits: ModelCommit[] = [];
  /** Live path → uid after each commit. */
  readonly liveAfter: Map<string, number>[] = [];
  readonly touches = new Map<number, UidTouch[]>();
  private nextUid = 0;

  get head(): number {
    return this.commits.length - 1;
  }

  live(at = this.head): Map<string, number> {
    return this.liveAfter[at] ?? new Map();
  }

  commit(author: Author, ops: Op[]): Sha {
    const seq = this.commits.length;
    const live = new Map(this.live());
    const sha = sha256Hex(`model commit ${seq}`).slice(0, 40);
    const changes: Change[] = [];
    const rows: CommitFile[] = [];
    const touch = (uid: number, content: boolean) => {
      const list = this.touches.get(uid) ?? [];
      list.push({ seq, author, content });
      this.touches.set(uid, list);
    };
    for (const o of ops) {
      if (o.op === 'add') {
        if (live.has(o.path)) throw new Error(`model: ${o.path} exists`);
        const uid = this.nextUid++;
        live.set(o.path, uid);
        const lines = o.lines ?? 3;
        changes.push({ status: 'A', path: o.path });
        rows.push([o.path, lines, 0, 0]);
        touch(uid, lines > 0);
      } else if (o.op === 'rename') {
        const uid = live.get(o.from);
        if (uid === undefined || live.has(o.to)) throw new Error(`model: bad rename ${o.from} → ${o.to}`);
        live.delete(o.from);
        live.set(o.to, uid);
        changes.push({ status: 'R', from: o.from, path: o.to });
        rows.push([o.to, o.edit ? 1 : 0, o.edit ? 1 : 0, 0]);
        touch(uid, !!o.edit);
      } else {
        const uid = live.get(o.path);
        if (uid === undefined) throw new Error(`model: ${o.path} missing`);
        if (o.op === 'delete') {
          live.delete(o.path);
          changes.push({ status: 'D', path: o.path });
          rows.push([o.path, 0, 3, 0]);
        } else {
          changes.push({ status: 'M', path: o.path });
          rows.push([o.path, o.op === 'edit' ? 1 : 0, o.op === 'edit' ? 1 : 0, 0]);
          touch(uid, o.op === 'edit');
        }
      }
    }
    rows.sort((a, b) => byCodepoint(a[0], b[0]));
    this.commits.push({ sha, author, ops, changes, rows });
    this.liveAfter.push(live);
    return sha;
  }

  sha(seq: number): Sha {
    return this.commits[seq]!.sha;
  }

  lineage(at = this.head): LineageCommit[] {
    return this.commits.slice(0, at + 1).map((c, seq) => ({ sha: c.sha, dateMs: seq * 1000, changes: c.changes }));
  }

  history(at = this.head): PathHistory {
    return pathHistory(this.lineage(at));
  }

  /** The snapshot at head `at`: window commits from `from` on, minus `holes` (the date filter's gaps). */
  snapshot(opts: { at?: number; from?: number; holes?: ReadonlySet<number> } = {}): SnapshotV02 {
    const at = opts.at ?? this.head;
    const from = Math.min(opts.from ?? 0, at);
    const paths = [...this.live(at).keys()].sort(byCodepoint);
    const tops = [...new Set(paths.filter((p) => p.includes('/')).map((p) => p.slice(0, p.indexOf('/'))))].sort();
    const iso = '2026-10-10T10:00:00Z';
    const commits: Commit[] = [];
    for (let seq = from; seq <= at; seq++) {
      // The head and the window's first commit are never holes (they bound the window).
      if (opts.holes?.has(seq) && seq !== at && seq !== from) continue;
      const c = this.commits[seq]!;
      commits.push({ seq, sha: c.sha, date: iso, authorDate: iso, author: c.author.who, subject: `model ${seq}`, files: c.rows,
        attribution: { class: c.author.cls, agentLineShareMilli: 0, sessions: [], evidence: [], tier: c.author.cls === 'unknown' ? 'none' : 'high',
          selfCommittedAgentWritten: !!c.author.flag } });
    }
    return {
      schemaVersion: '0.2',
      generator: { name: 'commet', version: '0.0.0' },
      repo: { repoId: 'r_model', head: this.sha(at), headDate: iso, branch: 'main', selfPersonIds: [SELF] },
      window: { months: 24, since: iso, until: iso, firstParent: true },
      exclusions: { rulesetVersion: 'model', rules: [], counts: {} },
      coverage: [],
      dirs: tops.map((path) => ({ id: `d_${sha256Hex(path).slice(0, 12)}` as const, path, parent: null, depth: 1, bornSeq: 0, bornDate: iso, partner: null })),
      files: paths.map((path) => ({ id: fileIdOf(path), path, loc: 3, debt: { todo: 0, fixme: 0, hack: 0, xxx: 0 },
        isTest: path.startsWith('test/') || path.includes('.test.'), testOf: null, qodo: null })),
      branches: [],
      unreadable: { dirs: 0, files: 0, branches: 0, bulkCommits: 0 },
      qodo: { status: 'none' },
      people: [],
      commits,
      sessions: [],
    };
  }
}

/** mulberry32: a seeded PRNG keeps property runs reproducible (Rule 3). */
export function prng(seed: number) {
  let s = seed;
  const next = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)]!;
  return { next, int, pick };
}
export type Rand = ReturnType<typeof prng>;

const NAMES = ['src/a.ts', 'src/b.ts', 'src/x/c.ts', 'src/x/d.ts', 'lib/e.ts', 'lib/f.ts', 'test/a.test.ts', 'README.md', 'g.ts'];

/** 1–3 random operations on distinct paths of the model's current tree. */
export function randomOps(m: Model, r: Rand, kinds: readonly Op['op'][] = ['add', 'edit', 'rename', 'delete', 'chmod']): Op[] {
  const live = new Set(m.live().keys());
  const used = new Set<string>();
  const ops: Op[] = [];
  for (let k = 1 + r.int(3); k > 0; k--) {
    const free = NAMES.filter((p) => !live.has(p) && !used.has(p));
    const mine = [...live].filter((p) => !used.has(p));
    const kind = r.pick(kinds);
    if (kind === 'add' && free.length) {
      const path = r.pick(free);
      ops.push({ op: 'add', path, lines: r.int(4) === 0 ? 0 : 3 });
      used.add(path);
      live.add(path);
    } else if (kind === 'rename' && free.length && mine.length) {
      const [from, to] = [r.pick(mine), r.pick(free)];
      ops.push({ op: 'rename', from, to, edit: r.next() < 0.5 });
      used.add(from).add(to);
      live.delete(from);
      live.add(to);
    } else if ((kind === 'edit' || kind === 'delete' || kind === 'chmod') && mine.length) {
      const path = r.pick(mine);
      ops.push({ op: kind, path });
      used.add(path);
      if (kind === 'delete') live.delete(path);
    }
  }
  return ops;
}
