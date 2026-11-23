// visual-proof (R5): every frame's page text and every served response, layout and beacon is scanned
// for what AGENTS.md Rule 2 keeps out of any output. A hit names its rule and where it was, never the
// text it matched in full.
import { describe, expect, it } from 'vitest';
import { privacyHits, runTexts, screen, servedTexts, takeTexts, type Scanned } from '../../.claude/skills/visual-proof/scripts/privacy.js';

const TOKEN = 'Qx3vL0t9-mN_2bYk7RfA1sWc8dHe5jUp4gZiTo6aVyE';
const ctx = { literals: [{ name: 'the launch token', value: TOKEN }, { name: 'HOME', value: '/Users/somebody' }] };
const scan = (...texts: string[]) => privacyHits(texts.map((text, i): Scanned => ({ where: `item ${i}`, text })), ctx);
const rules = (...texts: string[]) => scan(...texts).map((h) => h.rule);

describe('privacyHits', () => {
  it("passes a real scene's text: planet paths, file ids, SHAs, session keys, counts", () => {
    expect(scan(
      'web/src/view.ts, 3 unseen. src/core/tmp/x.ts and test/var/y.ts are relative.',
      '{"fileId":"f_3a9c0d1e2b4f","head":"4f3fe571e9a72d0f47c75045e690d1576b6d948a","key":"s_000000000001"}',
      'claude-code · main · 1 hour · 2026-11-10 09:01 to 10:01 UTC',
      'repo 9b2c4e1f0a3d5b6c7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d', // a 64-hex id: no capitals
    )).toEqual([]);
  });

  it('stops on an absolute path in any form', () => {
    for (const t of ['note: /Users/alice/notes.txt', 'at /home/bob/x', '"/private/var/folders/x"', 'in /tmp/visual-proof-x/repo',
      'C:\\Users\\carol\\x', 'see file:///etc/hosts', 'cfg in ~/.claude/settings.json', '(/var/log/x)', '\\\\server\\share\\x']) {
      expect(rules(t), t).toContain('absolute path');
    }
  });

  it('stops on an absolute path under any system root, not only home and temp ones (PR #199 e0914aea)', () => {
    for (const t of ['at /usr/local/secret', '(/opt/x)', '"/Library/Keychains/x"', 'in /nix/store/abc', 'cwd /workspace/app', 'see /srv/data', '/bin/sh -c', 'at /run/user/501']) {
      expect(rules(t), t).toContain('absolute path');
    }
    // route paths and relative paths stay clear
    expect(rules('GET /api/drones', 'src/usr/x.ts', 'web/src/lib/a.ts', 'the /help line')).toEqual([]);
  });

  it('stops on token-like strings and known secret shapes', () => {
    expect(rules(`k=${'aB3'.repeat(11)}`)).toContain('token-like string');
    // Fake shapes, built at run time so no secret scanner mistakes this file for a leak
    const fake = (prefix: string, body: string) => `${prefix}${body}`;
    expect(rules(fake('sk-an', `t-api03-${'x'.repeat(22)}`))).toContain('secret prefix');
    expect(rules(fake('gh', `p_${'a1'.repeat(18)}`))).toContain('secret prefix');
    expect(rules(fake('AK', `IA${'Q'.repeat(16)}`))).toContain('secret prefix');
    expect(rules('http://127.0.0.1:4100/#t=abcdefgh123')).toContain('launch URL');
  });

  it("stops on this run's own literals (the launch token, HOME) and never repeats them", () => {
    const hits = scan(`x ${TOKEN} y`, 'path /Users/somebody/z');
    expect(hits.map((h) => h.rule)).toEqual(expect.arrayContaining(['the launch token', 'HOME']));
    for (const h of hits) {
      expect(h.excerpt).not.toContain(TOKEN);
      expect(h.excerpt).not.toContain('somebody');
    }
    expect(hits[0]!.where).toBe('item 0');
  });

  it('masks what a pattern matched: its first characters and its length', () => {
    const [h] = scan('a note /Users/alice/secret-plan.txt here');
    expect(h!.excerpt).toMatch(/^\/Users… \(\d+ chars\)$/);
  });
});

describe('servedTexts', () => {
  it("scans a JSON body's decoded strings and its keys: a log field name as a key stops, the same word in a string doesn't", () => {
    const body = JSON.stringify({ files: [{ path: 'src/attrib/originalFile-guard.ts', note: 'C:\\Users\\dave\\x' }], originalFile: 'x' });
    const hits = privacyHits(servedTexts({ path: '/api/diff?fileId=f_1', body }), ctx);
    expect(hits.map((h) => `${h.rule} @ ${h.where}`).sort()).toEqual([
      'absolute path @ GET /api/diff',
      'agent-log field @ GET /api/diff',
    ]);
  });

  it("names a response by its path, never its query, and scans the query itself (PR #199 r2: a hit's place is printed unmasked)", () => {
    const hits = privacyHits(servedTexts({ path: `/api/diff?fileId=f_1&k=${TOKEN}`, body: '{"note":"/home/eve/x"}' }), ctx);
    expect(hits.map((h) => `${h.rule} @ ${h.where}`).sort()).toEqual(['absolute path @ GET /api/diff', 'the launch token @ GET /api/diff (query)', 'token-like string @ GET /api/diff (query)']);
    for (const h of hits) expect(`${h.where} ${h.excerpt}`).not.toContain(TOKEN);
  });

  it('scans a body that is not JSON as it is', () => {
    expect(privacyHits(servedTexts({ path: '/api/events', body: 'data: {"type":"state"}\n\n' }), ctx)).toEqual([]);
    expect(privacyHits(servedTexts({ path: '/api/events', body: 'data: /home/eve\n' }), ctx).map((h) => h.rule)).toEqual(['absolute path']);
  });
});

describe('takeTexts and runTexts', () => {
  const log = { texts: [] as [string, number][], served: [], events: '', notes: [], errors: [] as string[] };
  it("scans a take's page and console errors too, which go into the record (PR #199 10bde0e3)", () => {
    const hits = privacyHits(takeTexts('before-1', { ...log, errors: ['pageerror: cannot read /Users/somebody/secret.txt'] }), ctx);
    expect(hits.map((h) => `${h.rule} @ ${h.where}`)).toContain('absolute path @ take before-1 page errors');
  });
  it('scans the commit subjects and scene text that go into captions, the record and the summary (PR #199 5b136d3c)', () => {
    const texts = runTexts({ base: { subject: 'fix: read /home/eve/keys first' }, head: { subject: `wip ${'aB3'.repeat(11)}` }, scene: { name: 's', summary: 'ok' } });
    expect(privacyHits(texts, ctx).map((h) => `${h.rule} @ ${h.where}`).sort()).toEqual(['absolute path @ the base commit subject', 'token-like string @ the head commit subject']);
    expect(privacyHits(runTexts({ base: { subject: 'fix(view): labels' }, head: { subject: 'test: x' }, scene: { name: 's', summary: 'ok' } }), ctx)).toEqual([]);
  });
  it('scans the refs as given and the branch name too, which the record writes (PR #199 r2)', () => {
    const texts = runTexts({ base: { subject: 'a' }, head: { subject: 'b' }, scene: { name: 's', summary: 'ok' }, refs: ['8cf028c', `wip/${'aB3'.repeat(11)}`], branch: 'feature/~/home/x' });
    expect(privacyHits(texts, ctx).map((h) => `${h.rule} @ ${h.where}`).sort()).toEqual(['token-like string @ the refs as given']);
    expect(privacyHits(runTexts({ base: { subject: 'a' }, head: { subject: 'b' }, scene: { name: 's', summary: 'ok' }, branch: 'x /Users/eve/y' }), ctx).map((h) => h.where)).toEqual(['the branch']);
  });
});

describe('screen', () => {
  it("passes a command's output into the record only when the scan finds nothing in it (PR #199 r2: build, scan and setup output)", () => {
    expect(screen(['vite v7 building', 'dist/web/index.html 1.2 kB'], 'the base build', ctx)).toEqual(['vite v7 building', 'dist/web/index.html 1.2 kB']);
    const got = screen(['error TS2304 in /Users/somebody/repo/x.ts', `token ${TOKEN}`], 'the base build', ctx);
    expect(got).toEqual(['(the base build output withheld: HOME, absolute path, the launch token, token-like string in it)']);
    expect(got.join('')).not.toContain('somebody');
  });
});
