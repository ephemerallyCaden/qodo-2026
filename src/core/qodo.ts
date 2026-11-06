// Pure logic for #17: which Qodo findings count, and the counts-only cache. The reads are in
// src/scan/qodo.ts. Only a finding's id, status, level and file path are ever looked at; titles,
// descriptions, snippets and URLs are never read out of the parsed response.
import { canonicalJson } from './canonical-json.js';
import type { FileQodo, QodoByLevel, QodoSource } from './snapshot/types.js';

/** Each level's name in Qodo's responses (and the summary); `other` holds levels Commet doesn't know. */
export const QODO_LEVEL_NAMES = { actionRequired: 'action_required', remediationRecommended: 'remediation_recommended',
  informational: 'informational', other: 'other' } as const satisfies Record<keyof QodoByLevel, string>;
export const QODO_LEVELS = Object.keys(QODO_LEVEL_NAMES) as (keyof QodoByLevel)[];
const LEVEL_OF = new Map<unknown, keyof QodoByLevel>(QODO_LEVELS.filter((k) => k !== 'other').map((k) => [QODO_LEVEL_NAMES[k], k]));
// Qodo's closed statuses. Anything else, including a status Commet doesn't know yet, counts as
// open: a finding is never assumed fixed without evidence (Rule 1).
const CLOSED = new Set<unknown>(['implemented', 'full_implementation', 'dismissed', 'detected_after_merge', 'outdated']);

export const zeroLevels = (): QodoByLevel => ({ actionRequired: 0, remediationRecommended: 0, informational: 0, other: 0 });
export const qodoTotal = (l: QodoByLevel) => QODO_LEVELS.reduce((n, k) => n + l[k], 0);
/** At least one fetched PR has a Qodo review; without one, no file's count is evidence. */
export const hasReview = (c: { prs: number; unreviewed: number }) => c.prs - c.unreviewed > 0;

/** One PR's open findings: `path` is Qodo's file path, untrusted until matched against HEAD. */
export interface PrFindings { reviewed: boolean; open: { id: string | null; level: keyof QodoByLevel; path: string | null }[] }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Parses one `pr-review-session findings` response. */
export function parsePrFindings(v: unknown): PrFindings | 'malformed response' | 'truncated result' {
  if (!isObj(v) || !Array.isArray(v['findings'])) return 'malformed response';
  const findings = v['findings'] as unknown[];
  if (v['qar_operation_result_truncated'] === true || (typeof v['finding_count'] === 'number' && v['finding_count'] !== findings.length)) {
    return 'truncated result';
  }
  const open: PrFindings['open'] = [];
  for (const f of findings) {
    if (!isObj(f)) return 'malformed response';
    if (CLOSED.has(f['attribution_status'])) continue;
    const loc = f['location'];
    const path = isObj(loc) && typeof loc['file_path'] === 'string' ? loc['file_path'] : null;
    open.push({ id: typeof f['id'] === 'string' ? f['id'] : null, level: LEVEL_OF.get(f['action_level']) ?? 'other', path });
  }
  return { reviewed: v['review_session'] !== null && v['review_session'] !== undefined, open };
}

/** What the cache holds: counts per HEAD file per level (files with open findings only). */
export interface QodoCache { head: string; prs: number; unreviewed: number; offHead: number; files: Map<string, QodoByLevel> }

/** Counts open findings per file at `head`, once per finding id; the rest is `offHead`. */
export function tallyFindings(prs: PrFindings[], headPaths: ReadonlySet<string>, head: string): QodoCache {
  const files = new Map<string, QodoByLevel>();
  const seen = new Set<string>();
  let offHead = 0;
  for (const f of prs.flatMap((p) => p.open)) {
    if (f.id !== null) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
    }
    if (f.path === null || !headPaths.has(f.path)) {
      offHead++;
      continue;
    }
    const l = files.get(f.path) ?? zeroLevels();
    l[f.level]++;
    files.set(f.path, l);
  }
  return { head, prs: prs.length, unreviewed: prs.filter((p) => !p.reviewed).length, offHead, files };
}

const CACHE_SCHEMA = 'commet.qodo-findings.v1';

export function serializeCache(c: QodoCache): string {
  // fromEntries defines own properties, so a file named `__proto__` stays an ordinary key.
  return canonicalJson({ schema: CACHE_SCHEMA, head: c.head, prs: c.prs, unreviewed: c.unreviewed, offHead: c.offHead,
    files: Object.fromEntries(c.files) });
}

const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const exactKeys = (o: Record<string, unknown>, keys: readonly string[]) => {
  const have = Object.keys(o);
  return have.length === keys.length && keys.every((k) => Object.hasOwn(o, k));
};

/** Parses the cache strictly; anything unexpected is null (unknown), never a guess. */
export function parseCache(text: string): QodoCache | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(v) || !exactKeys(v, ['schema', 'head', 'prs', 'unreviewed', 'offHead', 'files']) || v['schema'] !== CACHE_SCHEMA) return null;
  const { head, prs, unreviewed, offHead, files } = v;
  if (typeof head !== 'string' || !/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(head)) return null;
  if (!count(prs) || !count(unreviewed) || !count(offHead) || unreviewed > prs || !isObj(files)) return null;
  const out = new Map<string, QodoByLevel>();
  for (const [path, l] of Object.entries(files)) {
    if (!isObj(l) || !exactKeys(l, QODO_LEVELS) || !QODO_LEVELS.every((k) => count(l[k]))) return null;
    const levels = l as unknown as QodoByLevel;
    if (qodoTotal(levels) === 0) return null;
    out.set(path, levels);
  }
  return { head, prs, unreviewed, offHead, files: out };
}

/**
 * files[].qodo for each HEAD path, and the snapshot's source. A cached file missing from this HEAD
 * adds its findings to `offHead` rather than vanishing. With no reviewed PR there is no evidence,
 * so every file is unknown (null), not 0.
 */
export function applyCache(c: QodoCache, headPaths: readonly string[]): { perFile: Map<string, FileQodo | null>; source: QodoSource } {
  const at = new Set(headPaths);
  let offHead = c.offHead;
  for (const [path, l] of c.files) if (!at.has(path)) offHead += qodoTotal(l);
  const reviewed = hasReview(c);
  const perFile = new Map(headPaths.map((p): [string, FileQodo | null] => {
    if (!reviewed) return [p, null];
    const byLevel = c.files.get(p) ?? zeroLevels();
    return [p, { open: qodoTotal(byLevel), byLevel: { ...byLevel } }];
  }));
  return { perFile, source: { status: 'read', head: c.head, prs: c.prs, unreviewed: c.unreviewed, offHead } };
}
