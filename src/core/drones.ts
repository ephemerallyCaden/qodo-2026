// Drone view (#80): where each agent session's drone circles. Pure: droneView(snapshot, home) gives the
// contract's DroneView. `home` is the fog's file-to-planet map (FogBase.home), so drones and fog place a
// file on the same planet from the same snapshot/layout pair. Rule 1: a session with no files at HEAD is
// unplaced (null), never guessed. droneDetail(snapshot, key) (#148) gives one session's own detail.
import { byCodepoint } from './canonical-json.js';
import { DETAIL_BUCKETS, type DroneDetail, type DroneDetailFile, type DroneSession, type DroneView } from './contract/drones.js';
import type { DirId, FileId, Session, SessionKey, SnapshotV02 } from './snapshot/types.js';

type Home = DroneSession['home'];

/** The body holding most of the files, ties by codepoint; null when none of them is in the map. */
function homeOfFiles(files: readonly FileId[], home: ReadonlyMap<FileId, DirId | null>): Home {
  const counts = new Map<DirId | 'star', number>();
  for (const id of files) {
    const h = home.get(id);
    if (h === undefined) continue;
    const body = h ?? 'star';
    counts.set(body, (counts.get(body) ?? 0) + 1);
  }
  let best: DirId | 'star' | null = null;
  let max = 0;
  for (const [body, n] of counts) {
    if (n > max || (n === max && best !== null && byCodepoint(body, best) < 0)) {
      best = body;
      max = n;
    }
  }
  return best;
}

export function droneView(snapshot: Pick<SnapshotV02, 'repo' | 'sessions'>, home: ReadonlyMap<FileId, DirId | null>): DroneView {
  // A snapshot scanned before #80 has no `files` on any session (the type says it's there).
  const filesOf = (s: Session): readonly FileId[] | undefined => (Array.isArray(s.files) ? s.files : undefined);
  const needsRescan = snapshot.sessions.length > 0 && snapshot.sessions.every((s) => filesOf(s) === undefined);
  const byKey = new Map(snapshot.sessions.map((s) => [s.key, s]));
  const ownHome = (s: Session): Home => homeOfFiles(filesOf(s) ?? [], home);
  // A subagent with no files of its own takes its parent's home, up the chain (a cycle ends the walk).
  const homeOf = (s: Session): Home => {
    const seen = new Set<string>();
    for (let cur: Session | undefined = s; cur && !seen.has(cur.key); cur = cur.kind === 'subagent' && cur.parentKey !== undefined ? byKey.get(cur.parentKey) : undefined) {
      seen.add(cur.key);
      const h = ownHome(cur);
      if (h !== null) return h;
    }
    return null;
  };
  const sessions: DroneSession[] = [...snapshot.sessions]
    .sort((a, b) => byCodepoint(a.key, b.key))
    .map((s) => ({
      key: s.key,
      seed: s.seed,
      tool: s.tool,
      kind: s.kind,
      parentKey: s.parentKey ?? null,
      agentType: s.agentType ?? null,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      branch: s.branch ?? null,
      model: s.model ?? null,
      inferred: s.inferred,
      home: needsRescan ? null : homeOf(s),
    }));
  return {
    schemaVersion: 'drones.1',
    head: snapshot.repo.head,
    sessions,
    total: sessions.length,
    placed: sessions.filter((s) => s.home !== null).length,
    needsRescan,
  };
}

/** A repo-relative path as (folder, name): the folder is everything before the last `/`, '' for a root file. */
function splitPath(path: string): [string, string] {
  const i = path.lastIndexOf('/');
  return i < 0 ? ['', path] : [path.slice(0, i), path.slice(i + 1)];
}

/** By folder, then name, by codepoint: root files first, and a folder's files stay together (`src/a.ts` before `src/a/b.ts`). */
export function byFolderThenName(a: string, b: string): number {
  const [fa, na] = splitPath(a);
  const [fb, nb] = splitPath(b);
  return byCodepoint(fa, fb) || byCodepoint(na, nb);
}

const isCount = (n: unknown, min = 0): n is number => typeof n === 'number' && Number.isInteger(n) && n >= min;

/**
 * Whether a session's #148 fields can be read: `old` when none is there (scanned before #148), `damaged`
 * when any is there but malformed, or the counts don't add up.
 */
function detailFields(s: Session): 'ok' | 'old' | 'damaged' {
  const raw = s as Partial<Pick<Session, 'fileEdits' | 'editsOutside' | 'editBuckets'>> & Pick<Session, 'filesOutside'>;
  if (raw.fileEdits === undefined && raw.editsOutside === undefined && raw.editBuckets === undefined) return 'old';
  const edits = raw.fileEdits;
  if (!Array.isArray(edits) || !isCount(raw.editsOutside) || !isCount(raw.filesOutside) || !Array.isArray(raw.editBuckets)) return 'damaged';
  if (!edits.every((e: unknown) => typeof e === 'object' && e !== null && typeof (e as { id?: unknown }).id === 'string'
    && (e as { id: string }).id.startsWith('f_') && isCount((e as { n?: unknown }).n, 1))) return 'damaged';
  const buckets: unknown[] = raw.editBuckets;
  if (buckets.length !== DETAIL_BUCKETS || !buckets.every((b) => isCount(b))) return 'damaged';
  const sum = (buckets as number[]).reduce((a, b) => a + b, 0);
  return sum === edits.reduce((a, e) => a + e.n, 0) + raw.editsOutside ? 'ok' : 'damaged';
}

/**
 * One agent session's own detail (#148, AGENTS.md Rule 6's session-detail exception): its files at HEAD
 * with their edit counts, its other edited paths counted, and its timeline. It reads only that session,
 * so nothing in it compares, ranks or totals sessions. Null for a key the snapshot lacks, and for an
 * inferred pseudo-session, whose numbers would be a person's (Rule 6). `damaged` when the session's
 * counts can't be read, so the caller reports damaged state instead of serving a bad detail.
 */
export function droneDetail(snapshot: Pick<SnapshotV02, 'repo' | 'files' | 'sessions'>, key: SessionKey): DroneDetail | 'damaged' | null {
  const s = snapshot.sessions.find((x) => x.key === key);
  if (!s || (s.inferred as boolean)) return null;
  const base = { ok: true, schemaVersion: 'drone-detail.1', head: snapshot.repo.head, key: s.key, startedAt: s.startedAt, endedAt: s.endedAt } as const;
  const fields = detailFields(s);
  if (fields === 'damaged') return 'damaged';
  if (fields === 'old') return { ...base, files: [], otherFiles: 0, otherEdits: 0, buckets: [], needsRescan: true };
  const pathOf = new Map<FileId, string>(snapshot.files.map((f) => [f.id, f.path]));
  const files: DroneDetailFile[] = [];
  let otherFiles = s.filesOutside;
  let otherEdits = s.editsOutside;
  for (const { id, n } of s.fileEdits) {
    const path = pathOf.get(id);
    // An id with no file in this snapshot is counted with the other paths, never named (Rule 1).
    if (path === undefined) {
      otherFiles++;
      otherEdits += n;
    } else files.push({ fileId: id, path, edits: n });
  }
  files.sort((a, b) => byFolderThenName(a.path, b.path));
  return { ...base, files, otherFiles, otherEdits, buckets: [...s.editBuckets], needsRescan: false };
}
