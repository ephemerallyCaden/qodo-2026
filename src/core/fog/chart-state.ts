// Chart state (#33, R5; #201): what you've seen and understood, as stored in `.git/commet/chart.json`.
// It holds file ids and commit SHAs only: no paths, code, prompt text or wall-clock time (Rules 2
// and 3). `chart.2` (#201) adds `clears`, the quizzes passed; a `chart.1` file reads as `chart.2`
// with none, so every chart it holds is haze (seen), never clear, and the next write saves it as
// `chart.2`.
import { byCodepoint } from '../canonical-json.js';
import type { ChartAction } from '../contract/fog.js';
import type { FileId, Sha } from '../snapshot/types.js';

/** You reviewed (charts) or understood (clears) the file that had id `fileId` (its path's id) in commit `at`, as of that commit. */
export interface ChartEntry { fileId: FileId; at: Sha }

export interface ChartState {
  schemaVersion: 'chart.2';
  /** Charts: haze (seen). Sorted by fileId, then at; no duplicates. */
  charts: ChartEntry[];
  /** Quizzes passed (#201): clear (understood) while the file's content is unchanged. Sorted and unique like charts. */
  clears: ChartEntry[];
  /**
   * `commet chart baseline` heads, in the order they were set: each one charts every change up to
   * and including that commit. Undo removes the last, so baseline then undo restores the state exactly.
   */
  baselines: Sha[];
}

export const emptyChart = (): ChartState => ({ schemaVersion: 'chart.2', charts: [], clears: [], baselines: [] });

const FILE_ID = /^f_[0-9a-f]{12}$/;
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const hasKeys = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
const isFileId = (v: unknown): v is FileId => typeof v === 'string' && FILE_ID.test(v);
const isSha = (v: unknown): v is Sha => typeof v === 'string' && SHA.test(v);

/** fileId, then at. */
export const byEntry = (a: ChartEntry, b: ChartEntry) => byCodepoint(a.fileId, b.fileId) || byCodepoint(a.at, b.at);

/** A sorted, unique list of entries, or a throw naming which list is bad. */
function entries(list: unknown, name: string): ChartEntry[] {
  if (!Array.isArray(list)) throw new Error('unexpected shape');
  const out: ChartEntry[] = [];
  for (const e of list as unknown[]) {
    if (!isObject(e) || !hasKeys(e, ['fileId', 'at']) || !isFileId(e['fileId']) || !isSha(e['at'])) throw new Error(`bad ${name} entry`);
    out.push({ fileId: e['fileId'], at: e['at'] });
  }
  for (let i = 1; i < out.length; i++) if (byEntry(out[i - 1]!, out[i]!) >= 0) throw new Error(`${name}s not sorted and unique`);
  return out;
}

/**
 * Parses chart.json strictly: exactly these keys, ids and SHAs only, entries sorted and unique.
 * `chart.1` (before #201) migrates: its charts stay charts (haze) and it has no clears. Throws with
 * a reason that never quotes the file's content.
 */
export function parseChartState(json: string): ChartState {
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    throw new Error('not JSON');
  }
  if (!isObject(v)) throw new Error('unexpected shape');
  const version = v['schemaVersion'];
  if (version !== 'chart.1' && version !== 'chart.2') throw new Error('unknown schemaVersion');
  if (!hasKeys(v, version === 'chart.1' ? ['schemaVersion', 'charts', 'baselines'] : ['schemaVersion', 'charts', 'clears', 'baselines'])) throw new Error('unexpected shape');
  const charts = entries(v['charts'], 'chart');
  const clears = version === 'chart.1' ? [] : entries(v['clears'], 'clear');
  const baselines = v['baselines'];
  if (!Array.isArray(baselines)) throw new Error('unexpected shape');
  if (!(baselines as unknown[]).every(isSha)) throw new Error('bad baseline');
  return { schemaVersion: 'chart.2', charts, clears, baselines: [...(baselines as Sha[])] };
}

/** Validates an untrusted ChartAction (the server's POST body). Null when it isn't exactly one. */
export function parseChartAction(body: unknown): ChartAction | null {
  if (!isObject(body) || !isSha(body['at'])) return null;
  const at = body['at'];
  if (body['kind'] === 'chart') {
    return hasKeys(body, ['kind', 'fileId', 'at']) && isFileId(body['fileId']) ? { kind: 'chart', fileId: body['fileId'], at } : null;
  }
  if (body['kind'] === 'baseline' || body['kind'] === 'baseline-undo') return hasKeys(body, ['kind', 'at']) ? { kind: body['kind'], at } : null;
  return null;
}
