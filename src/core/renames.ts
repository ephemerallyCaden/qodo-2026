// File path history on HEAD's first-parent line (#33, shared with #18's layout). The snapshot keys
// commit files by path and file ids are path ids, so following a file across renames needs this.
// Pure: derived here from #16's lineage log. A later scan that records renames in the snapshot only
// has to produce the same PathHistory.
import type { LineageCommit } from './structure.js';

/** git's rename limit, pinned in src/scan/git.ts (`diff.renameLimit`); test/fog.test.ts keeps them equal. */
export const RENAME_LIMIT = 4000;

/** The file at `from` was renamed to `to` in first-parent commit `seq`. */
export interface Rename { seq: number; from: string; to: string }

/**
 * A file started at `path` in commit `seq`: added, or re-added after a delete. `unsure`: it may carry
 * older history that can't be followed. That covers a copy, a rename out of an excluded path, or a
 * birth in a commit where git skipped inexact rename detection (over RENAME_LIMIT² candidate pairs).
 */
export interface Birth { seq: number; path: string; unsure: boolean }

/**
 * A first-parent change to `path` in commit `seq` that the snapshot has no row for: binary at the
 * time (numstat `-`), or rows git listed for another parent of a merge. Fog counts it as a change.
 */
export interface Unrowed { seq: number; path: string }

export interface PathHistory {
  /** First and last first-parent seq covered, inclusive. */
  from: number;
  to: number;
  /** Ordered by seq, then as git lists them. */
  renames: Rename[];
  births: Birth[];
  /** Fog only (unrowedChanges in src/core/fog); absent means none were looked for. */
  unrowed?: Unrowed[];
}

/**
 * Renames and births in `commits`, a first-parent lineage log oldest first whose first entry is
 * commit `firstSeq`. Paths `excluded` by the scan's rules aren't history: nothing is born at one,
 * and a rename out of one is an unsure birth.
 */
export function pathHistory(commits: LineageCommit[], firstSeq = 0, excluded: (path: string) => boolean = () => false): PathHistory {
  const h: PathHistory = { from: firstSeq, to: firstSeq + commits.length - 1, renames: [], births: [] };
  commits.forEach((c, i) => {
    const seq = firstSeq + i;
    const adds = c.changes.filter((ch) => ch.status === 'A').length;
    const dels = c.changes.filter((ch) => ch.status === 'D').length;
    const blind = adds * dels > RENAME_LIMIT * RENAME_LIMIT;
    for (const ch of c.changes) {
      if (excluded(ch.path)) continue; // not a path any snapshot file has
      if (ch.status === 'R' && ch.from !== undefined && !excluded(ch.from)) h.renames.push({ seq, from: ch.from, to: ch.path });
      else if (ch.status === 'A') h.births.push({ seq, path: ch.path, unsure: blind });
      else if (ch.status === 'R' || ch.status === 'C') h.births.push({ seq, path: ch.path, unsure: true });
    }
  });
  return h;
}
