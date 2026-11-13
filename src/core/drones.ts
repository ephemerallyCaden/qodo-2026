// Drone view (#80): where each agent session's drone circles. Pure: droneView(snapshot, home) gives the
// contract's DroneView. `home` is the fog's file-to-planet map (FogBase.home), so drones and fog place a
// file on the same planet from the same snapshot/layout pair. Rule 1: a session with no files at HEAD is
// unplaced (null), never guessed.
import { byCodepoint } from './canonical-json.js';
import type { DroneSession, DroneView } from './contract/drones.js';
import type { DirId, FileId, Session, SnapshotV02 } from './snapshot/types.js';

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
