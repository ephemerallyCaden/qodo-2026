// Drone view (#80 AC 4): home = the body holding most of a session's files, from the fog's file-to-planet map.
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/core/canonical-json.js';
import { droneView } from '../src/core/drones.js';
import type { DirId, FileId, Session, SessionKey, SnapshotV02 } from '../src/core/snapshot/types.js';

const A = 'd_00000000000a';
const B = 'd_00000000000b';
const HEAD = '1'.repeat(40);
const f = (n: number) => `f_${String(n).padStart(12, '0')}` as FileId;
const home = new Map<FileId, DirId | null>([[f(1), A], [f(2), A], [f(3), B], [f(4), B], [f(5), null], [f(6), null]]);

const session = (key: string, over: Partial<Session> = {}): Session => ({
  key: `s_${key}` as SessionKey, tool: 'claude-code', kind: 'main', startedAt: '2026-11-01T00:00:00Z', endedAt: '2026-11-01T01:00:00Z',
  filesTouched: 0, files: [], filesOutside: 0, linesAdded: 0, linesRemoved: 0, commits: [], inferred: false, seed: 7, ...over,
});
const snap = (sessions: Session[]) => ({ repo: { head: HEAD }, sessions }) as Pick<SnapshotV02, 'repo' | 'sessions'>;
const homesOf = (sessions: Session[], m = home) => Object.fromEntries(droneView(snap(sessions), m).sessions.map((s) => [s.key, s.home]));

describe('droneView', () => {
  const cases: [string, Session[], Record<string, string | null>][] = [
    ['one planet', [session('a', { files: [f(1), f(2), f(5)] })], { s_a: A }],
    ['a tie goes to the lower codepoint', [session('a', { files: [f(3), f(1)] })], { s_a: A }],
    ['a tie with the star: "d_" sorts before "star"', [session('a', { files: [f(5), f(3)] })], { s_a: B }],
    ['star-only files', [session('a', { files: [f(5), f(6)] })], { s_a: 'star' }],
    ['most files on the star', [session('a', { files: [f(5), f(6), f(1)] })], { s_a: 'star' }],
    ['no files', [session('a')], { s_a: null }],
    ['files the map does not know', [session('a', { files: [f(99)] })], { s_a: null }],
    ['a subagent with no files inherits its parent', [session('p', { files: [f(3)] }), session('c', { kind: 'subagent', parentKey: 's_p' as SessionKey })], { s_p: B, s_c: B }],
    ['a subagent with its own files keeps them', [session('p', { files: [f(3)] }), session('c', { kind: 'subagent', parentKey: 's_p' as SessionKey, files: [f(1)] })], { s_p: B, s_c: A }],
    ['inheritance walks up a chain and stops at a cycle', [
      session('p', { files: [f(1)] }), session('m', { kind: 'subagent', parentKey: 's_p' as SessionKey }), session('c', { kind: 'subagent', parentKey: 's_m' as SessionKey }),
      session('x', { kind: 'subagent', parentKey: 's_y' as SessionKey }), session('y', { kind: 'subagent', parentKey: 's_x' as SessionKey }),
    ], { s_p: A, s_m: A, s_c: A, s_x: null, s_y: null }],
    ['a main session with no files stays null', [session('p', { files: [f(1)] }), session('m', { parentKey: 's_p' as SessionKey })], { s_p: A, s_m: null }],
  ];
  for (const [name, sessions, want] of cases) {
    it(name, () => {
      expect(homesOf(sessions)).toEqual(want);
      expect(droneView(snap(sessions), home).needsRescan).toBe(false);
    });
  }

  it('an old snapshot (no files on any session) needsRescan and places nothing', () => {
    const old = [session('a'), session('b', { kind: 'subagent', parentKey: 's_a' as SessionKey })].map((s) => ({ ...s, files: undefined }) as unknown as Session);
    const v = droneView(snap(old), home);
    expect(v).toMatchObject({ needsRescan: true, total: 2, placed: 0 });
    expect(v.sessions.every((s) => s.home === null)).toBe(true);
  });

  it('counts, sorts by codepoint and is byte-identical for the same inputs', () => {
    const sessions = [session('b', { files: [f(1)] }), session('B'), session('a', { files: [f(5)] })];
    const v = droneView(snap(sessions), home);
    expect(v.sessions.map((s) => s.key)).toEqual(['s_B', 's_a', 's_b']);
    expect(v).toMatchObject({ schemaVersion: 'drones.1', head: HEAD, total: 3, placed: 2, needsRescan: false });
    expect(canonicalJson(droneView(snap([...sessions].reverse()), home))).toBe(canonicalJson(v));
  });

  it('carries no path, subject or count fields (Rules 2 and 6)', () => {
    const v = droneView(snap([session('a', { files: [f(1)], filesTouched: 9, linesAdded: 99, commits: [HEAD as never] })]), home);
    expect(Object.keys(v.sessions[0]!).sort()).toEqual(['agentType', 'branch', 'endedAt', 'home', 'inferred', 'key', 'kind', 'model', 'parentKey', 'seed', 'startedAt', 'tool']);
  });
});
