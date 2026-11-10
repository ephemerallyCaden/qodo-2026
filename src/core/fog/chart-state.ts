// Chart state (#33, R5): what you've reviewed, as stored in `.git/commet/chart.json`. It holds file
// ids and commit SHAs only: no paths, code, prompt text or wall-clock time (Rules 2 and 3).
import { byCodepoint } from '../canonical-json.js';
import type { ChartAction } from '../contract/fog.js';
import type { FileId, Sha } from '../snapshot/types.js';

/** You reviewed the file that had id `fileId` (its path's id) in commit `at`, as of that commit. */
export interface ChartEntry { fileId: FileId; at: Sha }

export interface ChartState {
  schemaVersion: 'chart.1';
  /** Sorted by fileId, then at; no duplicates. */
  charts: ChartEntry[];
  /**
   * `commet chart baseline` heads, in the order they were set: each one charts every change up to
   * and including that commit. Undo removes the last, so baseline then undo restores the state exactly.
   */
  baselines: Sha[];
}

export const emptyChart = (): ChartState => ({ schemaVersion: 'chart.1', charts: [], baselines: [] });

const FILE_ID = /^f_[0-9a-f]{12}$/;
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const hasKeys = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
const isFileId = (v: unknown): v is FileId => typeof v === 'string' && FILE_ID.test(v);
const isSha = (v: unknown): v is Sha => typeof v === 'string' && SHA.test(v);

/** fileId, then at. */
export const byEntry = (a: ChartEntry, b: ChartEntry) => byCodepoint(a.fileId, b.fileId) || byCodepoint(a.at, b.at);

/**
 * Parses chart.json strictly: exactly these keys, ids and SHAs only, charts sorted and unique.
 * Throws with a reason that never quotes the file's content.
 */
export function parseChartState(json: string): ChartState {
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    throw new Error('not JSON');
  }
  if (!isObject(v) || !hasKeys(v, ['schemaVersion', 'charts', 'baselines'])) throw new Error('unexpected shape');
  if (v['schemaVersion'] !== 'chart.1') throw new Error('unknown schemaVersion');
  const { charts, baselines } = v;
  if (!Array.isArray(charts) || !Array.isArray(baselines)) throw new Error('unexpected shape');
  const entries: ChartEntry[] = [];
  for (const e of charts as unknown[]) {
    if (!isObject(e) || !hasKeys(e, ['fileId', 'at']) || !isFileId(e['fileId']) || !isSha(e['at'])) throw new Error('bad chart entry');
    entries.push({ fileId: e['fileId'], at: e['at'] });
  }
  for (let i = 1; i < entries.length; i++) if (byEntry(entries[i - 1]!, entries[i]!) >= 0) throw new Error('charts not sorted and unique');
  if (!(baselines as unknown[]).every(isSha)) throw new Error('bad baseline');
  return { schemaVersion: 'chart.1', charts: entries, baselines: [...(baselines as Sha[])] };
}

/** Validates an untrusted ChartAction (the server's POST body). Null when it isn't exactly one. */
export function parseChartAction(body: unknown): ChartAction | null {
  if (!isObject(body)) return null;
  if (body['kind'] === 'chart') return hasKeys(body, ['kind', 'fileId']) && isFileId(body['fileId']) ? { kind: 'chart', fileId: body['fileId'] } : null;
  if (body['kind'] === 'baseline' || body['kind'] === 'baseline-undo') return hasKeys(body, ['kind']) ? { kind: body['kind'] } : null;
  return null;
}
