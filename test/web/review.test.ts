// #75: the review panel's decisions (web/src/model/review.ts) and its data calls (web/src/data/client.ts).
// Fog clears only when you chart what you were shown, so a diff whose unseen range moved can't be charted.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API, TOKEN_HEADER, type DiffView } from '../../src/core/contract/api.js';
import type { FogView } from '../../src/core/contract/fog.js';
import { serverClient, ViewError } from '../../web/src/data/client.js';
import { checkDiff, checkUnseen } from '../../web/src/model/validate.js';
import { baselineState, diffFreshness, diffNotes, fogKey, gitDiffCommand, lineKind, shellWord } from '../../web/src/model/review.js';
import { miniFog } from '../fixtures/contract/mini.js';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);
const FILE = miniFog.files.find((f) => f.state === 'fogged')!;

const view = (over: Partial<DiffView> = {}): DiffView => ({
  ok: true, fileId: FILE.fileId, at: miniFog.head, since: FILE.since, base: C, truncated: false, shownLines: 2,
  sections: [{ status: 'modified', path: 'src/a.ts', oldPath: null, binary: false, hunks: [{ header: '@@ -1 +1 @@', lines: ['-a', '+b'] }] }],
  ...over,
});
const fogWith = (over: Partial<FogView>): FogView => ({ ...miniFog, ...over });

describe('#75 baseline offer', () => {
  it('is offered only with no chart state and something fogged, and not again once dismissed', () => {
    const fresh = fogWith({ baseline: null, files: miniFog.files.map((f) => (f.state === 'charted' ? { ...f, state: 'clear' as const } : f)) });
    expect(baselineState(fresh, false)).toBe('offer');
    expect(baselineState(fresh, true)).toBeNull();
    // A charted file is chart state: no offer.
    expect(baselineState(fogWith({ baseline: null }), false)).toBe(miniFog.files.some((f) => f.state === 'charted') ? null : 'offer');
    // Nothing fogged: nothing to offer.
    expect(baselineState(fogWith({ baseline: null, files: miniFog.files.map((f) => ({ ...f, state: 'clear' as const, reasons: [], since: null })) }), false)).toBeNull();
    // A baseline exists: show it with its undo, dismissed or not.
    expect(baselineState(fogWith({ baseline: A }), true)).toBe('set');
  });
});

describe('#75 fogKey', () => {
  it('changes when anything the panel shows changes, reasons included (PR #108 r1 #7)', () => {
    const key = fogKey(miniFog);
    expect(fogKey(fogWith({}))).toBe(key);
    const reasons = fogWith({ files: miniFog.files.map((f) => (f.fileId === FILE.fileId ? { ...f, reasons: ['teammate' as const] } : f)) });
    expect(fogKey(reasons)).not.toBe(key);
    expect(fogKey(fogWith({ head: B }))).not.toBe(key);
    expect(fogKey(fogWith({ baseline: A }))).not.toBe(key);
  });
});

describe('#75 diff freshness', () => {
  it('current at the same head and range; newer when only the head moved; stale when the range moved or the file is gone', () => {
    expect(diffFreshness(view(), miniFog)).toBe('current');
    expect(diffFreshness(view(), fogWith({ head: B }))).toBe('newer');
    const moved = fogWith({ files: miniFog.files.map((f) => (f.fileId === FILE.fileId ? { ...f, since: A } : f)) });
    expect(diffFreshness(view(), moved)).toBe('stale');
    const charted = fogWith({ files: miniFog.files.map((f) => (f.fileId === FILE.fileId ? { ...f, state: 'charted' as const, reasons: [], since: null } : f)) });
    expect(diffFreshness(view(), charted)).toBe('stale');
    expect(diffFreshness(view(), fogWith({ files: miniFog.files.filter((f) => f.fileId !== FILE.fileId) }))).toBe('stale');
  });
});

describe('#75 notes and the copyable command', () => {
  it('quotes every path as one shell word, so nothing in a name runs', () => {
    expect(shellWord("it's $(rm -rf ~) `x`")).toBe(`'it'\\''s $(rm -rf ~) \`x\`'`);
    const cut = view({ truncated: true, sections: [{ status: 'renamed', path: 'b c.ts', oldPath: "a'.ts", binary: false, hunks: [] }] });
    // Literal pathspecs, as the server diffs them: a quoted `*.ts` must not match other files (Qodo local r1 #6).
    expect(gitDiffCommand(cut)).toBe(`git --literal-pathspecs diff -M ${C} ${miniFog.head} -- 'b c.ts' 'a'\\''.ts'`);
    expect(gitDiffCommand(view({ base: null }))).toBeNull();
  });

  it('says when nothing shows, when a part is binary or mode-only, and how much a cut diff shows', () => {
    expect(diffNotes(view())).toEqual([]);
    expect(diffNotes(view({ sections: [] }))[0]).toMatch(/no text change/);
    expect(diffNotes(view({ sections: [{ status: 'modified', path: 'x.bin', oldPath: null, binary: true, hunks: [] }] }))[0]).toMatch(/x\.bin is binary/);
    expect(diffNotes(view({ sections: [{ status: 'mode', path: 'run.sh', oldPath: null, binary: false, hunks: [] }] }))[0]).toMatch(/only its mode/);
    expect(diffNotes(view({ truncated: true, shownLines: 20_000 })).at(-1)).toMatch(/first 20000 lines[\s\S]*Chart covers the whole change/);
    expect(['+x', '-x', ' x', '\\ No newline at end of file'].map(lineKind)).toEqual(['add', 'del', 'ctx', 'meta']);
  });
});

describe('#75 data client', () => {
  type Call = { url: string; init: RequestInit };
  const calls: Call[] = [];
  const answer = (status: number, body: unknown) => vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  });
  afterEach(() => { vi.unstubAllGlobals(); calls.length = 0; });
  const client = () => serverClient('aB3-_cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV3wX4yZ5a');

  it('asks with ids and the viewed head only, with the token, and passes refusals back as answers', async () => {
    answer(200, view());
    expect(await client().diff(FILE.fileId, A)).toEqual(view());
    expect(calls[0]!.url).toBe(`${API.diff}?fileId=${FILE.fileId}&at=${A}`);
    expect(calls[0]!.init).toMatchObject({ headers: { [TOKEN_HEADER]: expect.any(String) }, cache: 'no-store', redirect: 'error' });
    answer(409, { ok: false, error: 'unknown-head', head: B });
    expect(await client().diff(FILE.fileId, A)).toEqual({ ok: false, error: 'unknown-head', head: B });
    answer(200, { ok: true, at: A, home: null, files: [] });
    await client().unseen(null, A);
    expect(calls.at(-1)!.url).toBe(`${API.unseen}?home=star&at=${A}`);
    answer(200, { ok: true, fog: miniFog });
    await client().chart({ kind: 'baseline', at: A });
    expect(calls.at(-1)!.init).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'baseline', at: A }) });
  });

  it('turns a busy or slow server and a bad document into a readable ViewError', async () => {
    answer(503, { ok: false, error: 'the diff took too long' });
    await expect(client().diff(FILE.fileId, A)).rejects.toThrow(/answered 503[\s\S]*took too long/);
    answer(200, { ok: true, fileId: FILE.fileId, at: A, since: null, base: null, sections: [{ status: 'gone' }], truncated: false, shownLines: 0 });
    await expect(client().diff(FILE.fileId, A)).rejects.toBeInstanceOf(ViewError);
  });

  it('checks every line of a diff and every listed file', () => {
    expect(checkDiff(view()).ok).toBe(true);
    expect(checkDiff(view({ sections: [{ status: 'modified', path: 'x', oldPath: null, binary: false, hunks: [{ header: '@@ -1 +1 @@', lines: ['no mark'] }] }] })).ok).toBe(false);
    expect(checkUnseen({ ok: true, at: A, home: null, files: [{ fileId: FILE.fileId, path: 'x', since: A, reasons: ['agent'] }] }).ok).toBe(true);
    expect(checkUnseen({ ok: true, at: A, home: null, files: [{ fileId: FILE.fileId, path: '', since: A, reasons: ['bogus'] }] }).ok).toBe(false);
  });
});
