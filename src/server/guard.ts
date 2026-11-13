// Request gates for `commet open` (R14, docs/contracts/phase2.md "Local HTTP surface"). Pure checks,
// so each one has a direct unit test as well as the real-socket round trips in test/server.test.ts.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { STAR_HOME, type DiffQuery, type UnseenQuery } from '../core/contract/api.js';
import type { ChartAction } from '../core/contract/fog.js';
import type { DirId, FileId } from '../core/snapshot/types.js';

/** The only address the server binds. Deliberately not configurable (CONSTITUTION, "Requires human approval"). */
export const BIND_HOST = '127.0.0.1';

/** A fresh 256-bit secret per launch, URL-safe so it can sit in the `#t=` fragment. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The view's own origins: the opened URL, and its `localhost` spelling. */
function ownOrigins(port: number): string[] {
  return [`http://${BIND_HOST}:${port}`, `http://localhost:${port}`];
}

/**
 * DNS-rebinding defence: a page on `evil.example` that re-resolves to 127.0.0.1 still sends
 * `Host: evil.example:<port>`, so only the two loopback spellings with our exact port pass.
 */
export function hostAllowed(host: string | undefined, port: number): boolean {
  if (host === undefined) return false;
  const h = host.toLowerCase();
  return h === `${BIND_HOST}:${port}` || h === `localhost:${port}`;
}

/**
 * Cross-origin refusal for every data route. No `Origin` means a non-browser client, which still
 * needs the token. A browser page elsewhere (another site, another local port, a file:// page sending
 * `Origin: null`) is refused even before the token is checked. `Sec-Fetch-Site`, when the browser
 * sends it, must agree.
 */
export function sameOrigin(origin: string | undefined, fetchSite: string | undefined, port: number): boolean {
  if (fetchSite !== undefined && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;
  return origin === undefined || ownOrigins(port).includes(origin.toLowerCase());
}

/** Constant-time compare. Repeated headers arrive comma-joined or as an array, and never match. */
export function tokenMatches(given: string | string[] | undefined, token: string): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

const FILE_ID = /^f_[0-9a-f]{12,64}$/;
const DIR_ID = /^d_[0-9a-f]{12,64}$/;
/** A full commit SHA: 40 hex, or 64 in a SHA-256 repo. */
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
/** Longest query string the read routes take; theirs are two ids. */
const MAX_QUERY = 256;

/**
 * The query parameters of a request target (`/api/diff?fileId=…&at=…`) as exactly the keys `keys`,
 * each once, or null: no other key, no repeat, no fragment, nothing past MAX_QUERY.
 */
function exactQuery<K extends string>(target: string, keys: readonly K[]): Record<K, string> | null {
  const q = target.indexOf('?');
  const search = q < 0 ? '' : target.slice(q + 1);
  if (search.length > MAX_QUERY || search.includes('#')) return null;
  const params = new URLSearchParams(search);
  const seen = [...params.keys()];
  if (seen.length !== keys.length || keys.some((k) => params.getAll(k).length !== 1)) return null;
  return Object.fromEntries(keys.map((k) => [k, params.get(k)!])) as Record<K, string>;
}

/** `GET /api/diff` parameters (#75): a file id and the head the view shows. Null for anything else. */
export function parseDiffQuery(target: string): DiffQuery | null {
  const q = exactQuery(target, ['fileId', 'at']);
  return q && FILE_ID.test(q.fileId) && SHA.test(q.at) ? { fileId: q.fileId as FileId, at: q.at } : null;
}

/** `GET /api/unseen` parameters (#75): a planet's DirId or `star`, and the head the view shows. */
export function parseUnseenQuery(target: string): UnseenQuery | null {
  const q = exactQuery(target, ['home', 'at']);
  if (!q || !SHA.test(q.at)) return null;
  if (q.home === STAR_HOME) return { home: null, at: q.at };
  return DIR_ID.test(q.home) ? { home: q.home as DirId, at: q.at } : null;
}

/**
 * A `ChartAction` with exactly the contract's keys, or null. Anything else is refused, not coerced.
 * Every kind carries `at`, the head the view was showing (#58).
 */
export function parseChartAction(value: unknown): ChartAction | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).sort().join(',');
  const at = o['at'];
  if (typeof at !== 'string' || !SHA.test(at)) return null;
  if (o['kind'] === 'chart') {
    const fileId = o['fileId'];
    return keys === 'at,fileId,kind' && typeof fileId === 'string' && FILE_ID.test(fileId)
      ? { kind: 'chart', fileId: fileId as FileId, at } : null;
  }
  if (o['kind'] === 'baseline' || o['kind'] === 'baseline-undo') return keys === 'at,kind' ? { kind: o['kind'], at } : null;
  return null;
}
