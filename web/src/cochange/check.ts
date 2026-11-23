// The co-change view (#211) arrives as untrusted JSON, so every field the view reads is checked here.
// Paths only ever reach the page as bitmap-font labels or DOM textContent, never as HTML. Pure.
import type { CoChangeView } from '../../../src/core/contract/cochange.js';
import type { Checked } from '../model/validate.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const FILE_ID = /^f_[0-9a-f]{12,64}$/;
const DIR_ID = /^d_[0-9a-f]{12,64}$/;
const MAX_ERRORS = 8;
/** A repo path: shown only as bitmap glyphs or DOM text, so any characters, but bounded. */
const MAX_PATH = 4096;
/** At most 5 kept pairs per file and files at HEAD are capped by the scan: this only bounds a damaged answer. */
const MAX_ITEMS = 200_000;
const isMilli = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1000;
const isId = (v: unknown): v is string => typeof v === 'string' && FILE_ID.test(v);

export function checkCoChange(v: unknown): Checked<CoChangeView> {
  const errors: string[] = [];
  const bad = (e: string) => { if (errors.length <= MAX_ERRORS) errors.push(e); };
  if (!isObj(v)) return { ok: false, errors: ['the co-change view must be an object'] };
  if (v['schemaVersion'] !== 'cochange.1') bad('schemaVersion must be "cochange.1"');
  if (typeof v['head'] !== 'string' || !SHA.test(v['head'])) bad('head must be a full commit SHA');
  if (typeof v['needsRescan'] !== 'boolean') bad('needsRescan must be true or false');
  const d = v['dismissed'];
  if (typeof d !== 'number' || !Number.isInteger(d) || d < 0) bad('dismissed must be a whole number');
  const list = (key: string): unknown[] => {
    const x = v[key];
    if (Array.isArray(x) && x.length <= MAX_ITEMS) return x;
    bad(`${key} must be an array of at most ${MAX_ITEMS}`);
    return [];
  };
  const files = new Set<string>();
  list('files').forEach((f, i) => {
    const at = `files[${i}]`;
    if (!isObj(f) || !isId(f['fileId'])) { bad(`${at}.fileId must be a file id`); return; }
    if (files.has(f['fileId'])) bad(`${at}.fileId is listed twice`);
    files.add(f['fileId']);
    const path = f['path'];
    if (typeof path !== 'string' || path.length === 0 || path.length > MAX_PATH) bad(`${at}.path must be a repo path`);
    if (f['home'] !== 'star' && (typeof f['home'] !== 'string' || !DIR_ID.test(f['home']))) bad(`${at}.home must be a planet id or "star"`);
  });
  const named = (id: unknown, at: string) => { if (!isId(id) || !files.has(id)) bad(`${at} must name a file in files`); };
  list('links').forEach((l, i) => {
    const at = `links[${i}]`;
    if (!isObj(l)) { bad(`${at} must be an object`); return; }
    named(l['a'], `${at}.a`);
    named(l['b'], `${at}.b`);
    if (l['a'] === l['b']) bad(`${at} must link two files`);
    if (!isMilli(l['strengthMilli'])) bad(`${at}.strengthMilli must be 0..1000`);
  });
  list('flags').forEach((f, i) => {
    const at = `flags[${i}]`;
    if (!isObj(f)) { bad(`${at} must be an object`); return; }
    named(f['fileId'], `${at}.fileId`);
    named(f['with'], `${at}.with`);
    if (!isMilli(f['strengthMilli'])) bad(`${at}.strengthMilli must be 0..1000`);
    if (typeof f['at'] !== 'string' || !SHA.test(f['at'])) bad(`${at}.at must be a full commit SHA`);
  });
  if (errors.length === 0) return { ok: true, value: v as unknown as CoChangeView };
  if (errors.length > MAX_ERRORS) errors.splice(MAX_ERRORS, Infinity, '…and more');
  return { ok: false, errors };
}
