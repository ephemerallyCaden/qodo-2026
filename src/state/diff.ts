// Reviewing from the view (#75, R5): GET /api/unseen and GET /api/diff. Both answer from the
// server's own fog for the latest snapshot and chart state, never from what the request claims: the
// client names a file id and the head it shows, nothing else. Diffs are read from local git on
// demand and returned, never stored, cached or logged (Rule 2).
import type { DiffQuery, DiffResult, UnseenQuery, UnseenResult } from '../core/contract/api.js';
import { unseenFiles, unseenRange, type RangeStart } from '../core/fog/index.js';
import type { Sha } from '../core/snapshot/types.js';
import { fileDiff, firstParent } from '../scan/diff.js';
import { gitRunner, type Git } from '../scan/git.js';
import { emptyTreeFor } from '../scan/repo.js';
import { openFogSource, readChart } from './chart.js';

/** GET /api/unseen: the fogged files of a planet or the star, at the current head. */
export async function readUnseen(repoDir: string, q: UnseenQuery): Promise<UnseenResult> {
  const src = await openFogSource(repoDir);
  const head = src.base.snapshot.repo.head;
  if (q.at !== head) return { ok: false, error: 'unknown-head', head };
  const files = unseenFiles(src.base, await readChart(src.dir), q.home);
  return files ? { ok: true, at: head, home: q.home, files } : { ok: false, error: 'no-such-home' };
}

/** The commit (or the empty tree, below a root commit) a range starts after. */
async function startId(git: Git, start: RangeStart, head: Sha, signal?: AbortSignal): Promise<Sha> {
  if ('sha' in start) return start.sha;
  return (await firstParent(git, start.parentOf, signal)) ?? emptyTreeFor(head);
}

/**
 * GET /api/diff: the file's unseen diff, `base..head`, where `base` is the first-parent parent of its
 * oldest unseen change (src/core/fog unseenRange). Aborting `signal` stops git.
 */
export async function readDiff(repoDir: string, q: DiffQuery, signal?: AbortSignal): Promise<DiffResult> {
  const src = await openFogSource(repoDir);
  const head = src.base.snapshot.repo.head;
  if (q.at !== head) return { ok: false, error: 'unknown-head', head };
  const range = unseenRange(src.base, await readChart(src.dir), q.fileId);
  if (!range) return { ok: false, error: 'no-such-file' };
  const view = { ok: true, fileId: q.fileId, at: head } as const;
  if (!range.start) return { ...view, since: null, base: null, sections: [], truncated: false, shownLines: 0 };
  const git = gitRunner(repoDir);
  const base = await startId(git, range.start, head, signal);
  const diff = await fileDiff(git, base, head, range.oldPath ? [range.path, range.oldPath] : [range.path], signal);
  return { ...view, since: range.since, base, ...diff };
}
