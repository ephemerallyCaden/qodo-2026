// Beacons on disk (#79, R10): `.git/commet/beacons.json` (canonical JSON, 0600, atomic writes,
// symlinks refused), changed only under `beacons.lock`. `commet beacon`, `commet chart --note` and the
// local server (GET /api/beacons, POST /api/beacon) all read and write through here. Never git notes:
// they attach to commits and can be pushed.
import { join } from 'node:path';
import { applyBeaconAction, beaconViewFrom, emptyBeacons, parseBeaconState, removeBeacons, removeUnplaced, type BeaconState } from '../core/beacons.js';
import { canonicalJson } from '../core/canonical-json.js';
import type { BeaconAction, BeaconResult, BeaconView } from '../core/contract/beacons.js';
import { CommetError, EXIT } from '../core/errors.js';
import { chartedFileId, type FogBase } from '../core/fog/index.js';
import type { FileId, Sha } from '../core/snapshot/types.js';
import { openFogSource, sourceIsCurrent, type FogSource } from './chart.js';
import { readStateBytes, writeAtomic } from './io.js';
import { withLock } from './lock.js';

/** Beacon state in the state dir. */
export const BEACONS_FILE = 'beacons.json';
const LOCK_FILE = 'beacons.lock';
/** About 2 s of waiting for another commet (the CLI and the server) to finish its write. */
const LOCK_TRIES = 100;
const LOCK_WAIT_MS = 20;
/** Reloads of the fog source before a write gives up, when scans keep landing in between (as writeChart). */
const WRITE_TRIES = 3;

/** Beacon state, or the empty state when there is none yet. A damaged file is refused, never reset. */
export async function readBeaconState(dir: string): Promise<BeaconState> {
  const text = (await readStateBytes(dir, BEACONS_FILE))?.toString('utf8') ?? null;
  if (text === null) return emptyBeacons();
  try {
    return parseBeaconState(text);
  } catch (e) {
    throw new CommetError(`state error: .git/commet/${BEACONS_FILE} is unreadable (${(e as Error).message}); move it aside to start over`, EXIT.state);
  }
}

/**
 * Reads, changes and writes beacons.json under its lock, which serialises writers in this process
 * and across processes. `change` gives the new state with its result, or only a result (a refusal),
 * which writes nothing. It always sees the fog base of the snapshot and layout on disk: if a scan
 * published a new pair since `src` was opened, the source is reloaded first, as writeChart does, so a
 * write never follows old lineage or answers with an old head (Qodo 306e57b3).
 */
async function changeBeacons<R>(src: FogSource, change: (base: FogBase, state: BeaconState) => { state?: BeaconState; result: R }): Promise<R> {
  for (let tries = 1; ; tries++) {
    const cur = src;
    const done = await withLock(join(cur.dir, LOCK_FILE), async () => {
      if (!sourceIsCurrent(cur)) return null;
      const next = change(cur.base, await readBeaconState(cur.dir));
      if (next.state) writeAtomic(join(cur.dir, BEACONS_FILE), canonicalJson(next.state));
      return { result: next.result };
    }, LOCK_TRIES, LOCK_WAIT_MS);
    if (!done) throw new CommetError('state error: another commet kept writing beacons for 2 s; nothing was written, try again', EXIT.state);
    if (done.value !== null) return done.value.result;
    if (tries >= WRITE_TRIES) throw new CommetError('state error: the snapshot kept changing during the write; nothing was written, try again', EXIT.state);
    src = await openFogSource(cur.repoDir);
  }
}

/**
 * Leaves one note, recorded at its own `at` like a chart (#58): a scan landing around the write can't
 * move it to another file, only leave it unplaced if its file is gone. The answer carries the new view.
 */
export function writeBeacon(src: FogSource, action: BeaconAction): Promise<BeaconResult> {
  return changeBeacons<BeaconResult>(src, (base, state) => {
    const r = applyBeaconAction(base, state, action);
    return r.ok ? { state: r.state, result: { ok: true, beacons: beaconViewFrom(base, r.state) } } : { result: r };
  });
}

/**
 * Removes the notes on the file that had id `fileId` at `at` (the head the caller resolved it at),
 * followed to the current head; resolves to how many went.
 */
export function clearBeacons(src: FogSource, file: { fileId: FileId; at: Sha }): Promise<number> {
  return changeBeacons(src, (base, state) => {
    const id = chartedFileId(base, file);
    const r = id === null ? { state, removed: 0 } : removeBeacons(base, state, id);
    return r.removed > 0 ? { state: r.state, result: r.removed } : { result: 0 };
  });
}

/** Removes the notes that can't be placed at the current head (BeaconView.unplaced); resolves to how many went, and that head. */
export function clearUnplacedBeacons(src: FogSource): Promise<{ removed: number; head: Sha }> {
  return changeBeacons(src, (base, state) => {
    const r = removeUnplaced(base, state);
    const result = { removed: r.removed, head: base.snapshot.repo.head };
    return r.removed > 0 ? { state: r.state, result } : { result };
  });
}

export const currentBeacons = async (src: FogSource): Promise<BeaconView> => beaconViewFrom(src.base, await readBeaconState(src.dir));

/** GET /api/beacons: the beacon view for the latest snapshot. State errors throw CommetError. */
export async function readBeacons(repoDir: string): Promise<BeaconView> {
  return currentBeacons(await openFogSource(repoDir));
}

/** POST /api/beacon. `action` is an exact BeaconAction (the server's guard checked its shape); the text is checked again here. */
export async function applyBeacon(repoDir: string, action: BeaconAction): Promise<BeaconResult> {
  return writeBeacon(await openFogSource(repoDir), action);
}
