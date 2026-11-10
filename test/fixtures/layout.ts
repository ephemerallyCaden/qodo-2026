// Pure worlds for layout() (#18): first-parent commits in, a snapshot and its structural history
// out, assembled the way the scan does it (lineage → dirs → tests → files) but with no git.
import { byCodepoint } from '../../src/core/canonical-json.js';
import type { LayoutV1, Planet } from '../../src/core/contract/layout.js';
import { fileId } from '../../src/core/hash.js';
import { pathHistory } from '../../src/core/renames.js';
import type { DebtCounts, FileEntry, SnapshotV02 } from '../../src/core/snapshot/types.js';
import {
  buildLineage, dirsAtHead, matchTests, structureHistory, topBirthInfo, zeroDebt, type Change, type LineageCommit, type MergeSides,
  type StructureHistory,
} from '../../src/core/structure.js';

export { fileId };
export const A = (path: string): Change => ({ status: 'A', path });
export const M = (path: string): Change => ({ status: 'M', path });
export const D = (path: string): Change => ({ status: 'D', path });
export const R = (from: string, path: string): Change => ({ status: 'R', from, path });
export const C = (from: string, path: string): Change => ({ status: 'C', from, path });

export interface WorldOptions {
  loc?: (path: string) => number;
  debt?: (path: string) => DebtCounts | null;
  /** Open Qodo findings per file; null (the default) is unknown. */
  qodo?: (path: string) => number | null;
  sides?: MergeSides;
}

export interface World { snapshot: SnapshotV02; history: StructureHistory; commits: LineageCommit[] }

const DAY = 86_400_000;

/** One first-parent commit per entry, with made-up SHAs and dates. */
export const lineageCommits = (commits: Change[][]): LineageCommit[] =>
  commits.map((changes, i) => ({ sha: String(i).padStart(40, '0'), dateMs: 1_767_225_600_000 + i * DAY, changes }));

export function world(changes: Change[][], o: WorldOptions = {}): World {
  const commits = lineageCommits(changes);
  const lineage = buildLineage(commits, () => false);
  const end = new Map<number, string>();
  for (const ev of lineage.events) {
    if (ev.to === null) end.delete(ev.key);
    else end.set(ev.key, ev.to);
  }
  const headPaths = [...end.values()].sort(byCodepoint);
  const info = topBirthInfo(lineage, o.sides ?? new Map());
  const { dirs } = dirsAtHead(lineage, headPaths, info);
  const dirIdOf = new Map(dirs.map((d) => [d.path, d.id]));
  const { targets } = matchTests(headPaths, lineage.paths);
  const files: FileEntry[] = headPaths.map((path) => {
    const t = targets.get(path);
    const open = o.qodo?.(path) ?? null;
    return { id: fileId(path), path, loc: o.loc?.(path) ?? 10, debt: o.debt ? o.debt(path) : zeroDebt(), isTest: t !== undefined,
      testOf: !t ? null : t.dir ? dirIdOf.get(t.path)! : fileId(t.path),
      qodo: open === null ? null : { open, byLevel: { actionRequired: open, remediationRecommended: 0, informational: 0, other: 0 } } };
  });
  const at = '2026-01-01T00:00:00Z';
  const snapshot: SnapshotV02 = {
    schemaVersion: '0.2',
    generator: { name: 'commet', version: '0.0.0' },
    repo: { repoId: 'r_000000000042', head: 'a'.repeat(40), headDate: at, branch: 'main', selfPersonIds: [] },
    window: { months: 24, since: at, until: at, firstParent: true },
    exclusions: { rulesetVersion: 'test', rules: [], counts: {} },
    coverage: [],
    dirs,
    files,
    branches: [],
    unreadable: { dirs: 0, files: 0, branches: 0, bulkCommits: 0 },
    qodo: { status: 'none' },
    people: [],
    commits: [],
    sessions: [],
  };
  return { snapshot, history: structureHistory(lineage, info, pathHistory(commits)), commits };
}

/** The planet at `path`, or a thrown error naming it. */
export function planetAt(l: LayoutV1, path: string): Planet {
  const p = l.planets.find((x) => x.path === path);
  if (!p) throw new Error(`no planet ${path}`);
  return p;
}
