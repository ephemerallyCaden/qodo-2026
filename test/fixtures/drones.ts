// Drone view fixtures (#80): typed builders for the contract's DroneView (src/core/contract/drones.ts).
// `miniDrones` is the source of test/fixtures/contract/mini.drones.json (the dev server's `?fixture=`
// view); test/drones-view.test.ts keeps the two equal. `repoDrones` is the size of this repo: 11 planets, 90 sessions.
import type { DroneSession, DroneView } from '../../src/core/contract/drones.js';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import type { DirId, SessionKey } from '../../src/core/snapshot/types.js';

const pad = (n: number, w: number) => String(n).padStart(w, '0');

/** A session ending `i` minutes after 2026-11-10 09:00 UTC, one hour long; every field the view reads is set. */
export function session(i: number, home: DroneSession['home'], over: Partial<DroneSession> = {}): DroneSession {
  const end = (m: number) => `2026-11-10T${pad(9 + Math.floor(m / 60), 2)}:${pad(m % 60, 2)}:00.000Z`;
  return {
    key: `s_${pad(i, 12)}` as SessionKey,
    seed: (Math.imul(i + 1, 2654435761) >>> 0),
    tool: 'claude-code', kind: 'main', parentKey: null, agentType: null,
    startedAt: end(i), endedAt: end(i + 60), branch: 'main', model: 'claude-opus-4', inferred: false, home,
    ...over,
  };
}

/** Finishes a view from its sessions (sorted by key, counts derived), as the server's builder does. */
export function droneView(head: string, sessions: DroneSession[], needsRescan = false): DroneView {
  const sorted = [...sessions].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { schemaVersion: 'drones.1', head, sessions: sorted, total: sorted.length, placed: sorted.filter((s) => s.home !== null).length, needsRescan };
}

const homes = (l: LayoutV1): DirId[] => l.planets.map((p) => p.dirId);

/** The mini layout's drones: Claude on two planets and the star, a named tool, a subagent, an inferred session and one unplaced. */
export function miniDrones(l: LayoutV1): DroneView {
  const [a, b, c] = homes(l);
  return droneView(l.source.head, [
    session(1, a!),
    session(2, 'star'),
    session(3, b!, { tool: 'codex', model: 'gpt-5' }),
    session(4, a!, { kind: 'subagent', parentKey: session(1, a!).key, agentType: 'Explore' }),
    session(5, c!, { inferred: true, branch: null, model: null }),
    session(6, null),
  ]);
}

/** This repo's size: every planet of `l` (11 in selfLikeRoots) and the star get drones, 90 sessions, 6 of them unplaced; some other tools. */
export function repoDrones(l: LayoutV1, total = 90): DroneView {
  const h = [...homes(l), 'star' as const];
  const out: DroneSession[] = [];
  for (let i = 0; i < total; i++) {
    const tool = i % 7 === 3 ? 'codex' : i % 11 === 5 ? 'cursor' : 'claude-code';
    out.push(session(i, i % 15 === 14 ? null : h[(i * 5) % h.length]!, { tool, kind: i % 9 === 4 ? 'subagent' : 'main', agentType: i % 9 === 4 ? 'Explore' : null }));
  }
  return droneView(l.source.head, out);
}
