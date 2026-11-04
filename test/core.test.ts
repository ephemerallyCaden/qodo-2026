import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { matchCommits, type MatchCommit } from '../src/attrib/match.js';
import type { EditEvent } from '../src/attrib/parsers/claude.js';
import { byCodepoint, canonicalJson } from '../src/core/canonical-json.js';
import { sessionKey } from '../src/core/hash.js';
import { normaliseLine } from '../src/core/lines.js';
import { isoUtc, minusMonths } from '../src/core/time.js';

describe('core', () => {
  it('canonicalJson sorts keys, drops undefined and rejects floats', () => {
    expect(canonicalJson({ b: 1, a: [true, null], c: undefined })).toBe('{\n  "a": [\n    true,\n    null\n  ],\n  "b": 1\n}\n');
    expect(() => canonicalJson({ x: 0.5 })).toThrow(/non-integer/);
  });

  it('byCodepoint orders astral characters after the BMP', () => {
    expect(['\u{1F600}', '～', 'a'].sort(byCodepoint)).toEqual(['a', '～', '\u{1F600}']);
  });

  it('normaliseLine collapses whitespace and skips trivial lines', () => {
    expect(normaliseLine('   const  x =\t 42;  ')).toBe('const x = 42;');
    expect(normaliseLine('  });  ')).toBeNull();
    expect(normaliseLine('a = 1')).toBeNull();
    expect(normaliseLine('/* ---------- */')).toBeNull();
  });

  it('minusMonths uses calendar months and clamps the day', () => {
    expect(isoUtc(minusMonths(Date.parse('2026-03-31T12:00:00Z'), 1))).toBe('2026-02-28T12:00:00Z');
    expect(isoUtc(minusMonths(Date.parse('2026-11-04T10:00:00Z'), 24))).toBe('2024-11-04T10:00:00Z');
  });

  it('sessionKey is git-ai compatible', () => {
    const want = 's_' + createHash('sha256').update('claude-code:abc').digest('hex').slice(0, 14);
    expect(sessionKey('claude-code', 'abc')).toBe(want);
    expect(sessionKey('claude-code', 'abc', 'x')).not.toBe(want);
  });
});

describe('matchCommits', () => {
  const ev = (eventId: string, sessionKey: `s_${string}`, ts: number, hashes: string[]): EditEvent =>
    ({ eventId, sessionKey, ts, path: 'f.ts', hashes });
  const commit = (over: Partial<MatchCommit>): MatchCommit => ({ sha: 'c', dateMs: 10_000, authorMs: 10_000, isSelf: true,
    covered: true, added: new Map([['f.ts', ['h1', 'h2', 'h3', 'h4']]]), ranBy: new Set(), ...over });

  it('last writer before the commit owns the line; later edits do not count', () => {
    const events = [ev('e1', 's_a', 1_000, ['h1', 'h2', 'h3', 'h4']), ev('e2', 's_b', 5_000, ['h1']), ev('e3', 's_c', 20_000, ['h2'])];
    const r = matchCommits([commit({})], events).get('c')!.attribution;
    expect(r).toMatchObject({ class: 'agent', agentLineShareMilli: 1000, tier: 'high', selfCommittedAgentWritten: true });
    expect(r.sessions).toEqual([{ sessionKey: 's_a', lines: 3 }, { sessionKey: 's_b', lines: 1 }]);
  });

  it('applies the 900/300 thresholds and never calls uncovered or teammate work human', () => {
    const events = [ev('e1', 's_a', 1_000, ['h1'])];
    const cls = (c: Partial<MatchCommit>) => matchCommits([commit(c)], events).get('c')!.attribution.class;
    expect(cls({})).toBe('human');
    expect(cls({ added: new Map([['f.ts', ['h1', 'h2', 'h3']]]) })).toBe('mixed');
    expect(cls({ isSelf: false })).toBe('unknown');
    expect(cls({ covered: false })).toBe('unknown');
  });
});
