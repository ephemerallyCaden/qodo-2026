// R13 space debris, the pure parts: which refs are debris (one row per input, AGENTS.md Rule 1), the cleanup
// commands' quoting, the view and panel, the stored-debris check, and the scan's git-output parsers (Rule 7).
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEBRIS, DEBRIS_WARNINGS, debrisAgeStep } from '../src/core/contract/debris.js';
import {
  buildDebris, debrisCommands, debrisDetail, debrisId, debrisProblem, debrisView, defaultBranches, planDebris, shellQuote, worktreeKey,
  worktreeReadKey, type DebrisGit, type DebrisRead, type RefRow, type WorktreeRow,
} from '../src/core/debris.js';
import { sha256Hex } from '../src/core/hash.js';
import type { Debris, DebrisItem, DirId, FileId, Session, SnapshotV02 } from '../src/core/snapshot/types.js';
import { numstatPaths, parseCommits, readDebris, readDebrisGit, remotesOf } from '../src/scan/debris.js';
import type { Git } from '../src/scan/git.js';
import { realTempDir } from './fixtures/tmp.js';
import { parseWorktrees } from '../src/scan/repo.js';

const DAY = 86_400;
const HEAD_CT = 1_800_000_000;
const HEAD = 'a'.repeat(40);
const sha = (s: string) => sha256Hex(s).slice(0, 40);

type RefOpts = Partial<Omit<RefRow, 'ct'>> & { age?: number };
const row = (ref: string, o: RefOpts = {}): RefRow => {
  const { age = 0, ...rest } = o;
  return { ref, symref: '', sha: sha(ref), ct: HEAD_CT - Math.round(age * DAY), upstream: '', upstreamRemote: '', upstreamRemoteRef: '', merged: false, ...rest };
};
const HUMAN = { name: 'Pip Okafor', email: 'pip@x.test' };
const AGENT = { name: 'Claude', email: 'noreply@anthropic.com' };
const BOT = { name: 'dependabot[bot]', email: '49699333+dependabot[bot]@users.noreply.github.com' };

interface Case {
  refs: RefRow[];
  headRef?: string;
  worktrees?: WorktreeRow[];
  initDefault?: string | null;
  remotes?: DebrisGit['remotes'];
  /** Author of each group's oldest commit, by key (default HUMAN). */
  authors?: Record<string, { name: string; email: string }>;
  cherry?: Record<string, boolean>;
  failed?: string[];
  sessions?: Pick<Session, 'key' | 'branch' | 'endedAt'>[];
  /** Commits ahead of HEAD per unmerged ref, as the branch reads give them. */
  ahead?: Record<string, number>;
}

function run(c: Case): Debris {
  const g: DebrisGit = { head: HEAD, headCt: HEAD_CT, headRef: c.headRef ?? 'refs/heads/session', refs: c.refs, remotes: c.remotes ?? [{ name: 'origin', standard: true }],
    initDefault: c.initDefault ?? null, worktrees: c.worktrees ?? [] };
  const plan = planDebris(g, DEBRIS, new Map(Object.entries(c.ahead ?? {})));
  const reads = new Map<string, DebrisRead | null>();
  const read = (key: string, tip: string, ct: number): DebrisRead | null => {
    if (c.failed?.includes(key)) return null;
    const who = c.authors?.[key] ?? HUMAN;
    return { commits: [{ sha: tip, ct, name: who.name, email: who.email, subject: `tip of ${key}` }], aheadCount: 1, lines: 5, paths: ['src/a.ts', 'gone.ts'],
      cherryMerged: c.cherry?.[key] ?? false };
  };
  for (const gr of plan.groups) reads.set(gr.key, read(gr.key, gr.best.sha, gr.best.ct));
  for (const w of plan.worktrees) if (w.prunable) reads.set(worktreeReadKey(w), read(worktreeKey(w), w.head, HEAD_CT - 20 * DAY));
  return buildDebris(plan, reads, { headCt: HEAD_CT, sessions: c.sessions ?? [], fileIds: new Map([['src/a.ts', 'f_00000000000a' as FileId]]),
    selfEmails: new Set(['me@x.test']) });
}
const classes = (c: Case) => Object.fromEntries(run(c).items.map((i) => [i.ref ?? `HEAD ${i.tip}`, i.cls]));

describe('which refs are debris (one row per input)', () => {
  const cases: [string, Case, Record<string, string>][] = [
    ["HEAD's own branch", { refs: [row('refs/heads/session', { age: 90 })] }, {}],
    ["HEAD's upstream, folded into HEAD's branch", {
      refs: [row('refs/heads/session', { upstream: 'refs/remotes/origin/session' }), row('refs/remotes/origin/session', { age: 40, merged: true })] }, {}],
    ["an old branch tracking HEAD's upstream too: still debris (Qodo PR248 89adcd24)", {
      refs: [row('refs/heads/session', { upstream: 'refs/remotes/origin/base' }), row('refs/heads/old', { age: 40, upstream: 'refs/remotes/origin/base' }),
        row('refs/remotes/origin/base', { age: 40, merged: true })] }, { 'refs/heads/old': 'branch' }],
    ["HEAD's upstream as a local branch (branch.<x>.remote = .)", {
      refs: [row('refs/heads/session', { upstream: 'refs/heads/base' }), row('refs/heads/base', { age: 40, merged: true })] }, {}],
    ['the default branch, local and remote, by the remote HEAD', {
      refs: [row('refs/heads/main', { age: 40, merged: true }), row('refs/remotes/origin/main', { age: 40, merged: true }),
        row('refs/remotes/origin/HEAD', { symref: 'refs/remotes/origin/main' })] }, {}],
    ['a symbolic ref', { refs: [row('refs/remotes/origin/HEAD', { symref: 'refs/remotes/origin/trunk', age: 90 })] }, {}],
    ["a tip at HEAD's commit (fresh from HEAD)", { refs: [row('refs/heads/fresh', { sha: HEAD, age: 30, merged: true })] }, {}],
    ['merged within the grace', { refs: [row('refs/heads/m', { age: 2.9, merged: true })] }, {}],
    ['merged past the grace', { refs: [row('refs/heads/m', { age: 3, merged: true })] }, { 'refs/heads/m': 'merged' }],
    ['unmerged, 29 days', { refs: [row('refs/heads/u', { age: 29.9 })] }, {}],
    ['unmerged, 30 days: abandoned', { refs: [row('refs/heads/u', { age: 30 })] }, { 'refs/heads/u': 'branch' }],
    ['a tip newer than HEAD (age 0)', { refs: [row('refs/heads/u', { age: -5 })] }, {}],
    ['upstream gone, every commit in HEAD by cherry: merged', {
      refs: [row('refs/heads/r', { age: 3, upstream: 'refs/remotes/origin/r' })], cherry: { 'refs/heads/r': true } }, { 'refs/heads/r': 'merged' }],
    ['upstream gone, some commits not in HEAD, 40 days: abandoned', {
      refs: [row('refs/heads/r', { age: 40, upstream: 'refs/remotes/origin/r' })], cherry: { 'refs/heads/r': false } }, { 'refs/heads/r': 'branch' }],
    ['upstream gone, not in HEAD, 5 days: nothing yet', {
      refs: [row('refs/heads/r', { age: 5, upstream: 'refs/remotes/origin/r' })], cherry: { 'refs/heads/r': false } }, {}],
    ['upstream present, cherry never read', { refs: [row('refs/heads/r', { age: 5, upstream: 'refs/remotes/origin/r' }), row('refs/remotes/origin/r', { age: 5 })],
      cherry: { 'refs/heads/r': true } }, {}],
    ['remote-only, unmerged, 40 days', { refs: [row('refs/remotes/origin/x', { age: 40 })] }, { 'refs/remotes/origin/x': 'branch' }],
    ['remote-only, merged, 10 days', { refs: [row('refs/remotes/origin/x', { age: 10, merged: true })] }, { 'refs/remotes/origin/x': 'merged' }],
    ['a local branch and its remote copy are one item', {
      refs: [row('refs/heads/x', { age: 40 }), row('refs/remotes/origin/x', { age: 41 })] }, { 'refs/heads/x': 'branch' }],
    ['merged local, unmerged remote copy: unmerged', {
      refs: [row('refs/heads/x', { age: 10, merged: true }), row('refs/remotes/origin/x', { age: 10 })] }, {}],
    ["an agent's branch idle 7 days", { refs: [row('refs/heads/a', { age: 7 })], authors: { 'refs/heads/a': AGENT } }, { 'refs/heads/a': 'agent' }],
    ["an agent's branch idle 6 days", { refs: [row('refs/heads/a', { age: 6.9 })], authors: { 'refs/heads/a': AGENT } }, {}],
    ["an agent's branch 40 days: still the agent's", { refs: [row('refs/heads/a', { age: 40 })], authors: { 'refs/heads/a': AGENT } }, { 'refs/heads/a': 'agent' }],
    ["a bot's branch 40 days: abandoned, not an agent's", { refs: [row('refs/heads/b', { age: 40 })], authors: { 'refs/heads/b': BOT } }, { 'refs/heads/b': 'branch' }],
    ["a bot's branch 10 days", { refs: [row('refs/heads/b', { age: 10 })], authors: { 'refs/heads/b': BOT } }, {}],
    ["a session's branch, its tip idle 8 days but the session ended hours before HEAD: active", { refs: [row('refs/heads/s', { age: 8 })],
      sessions: [{ key: 's_0000000000000a', branch: 's', endedAt: '2027-01-15T00:00:00Z' }] }, {}],
    ["a session's branch (a human's commits), the session ended 8 days before HEAD", { refs: [row('refs/heads/s', { age: 8 })],
      sessions: [{ key: 's_0000000000000a', branch: 's', endedAt: '2027-01-07T00:00:00Z' }] }, { 'refs/heads/s': 'agent' }],
    ['a session on another branch', { refs: [row('refs/heads/s', { age: 8 })],
      sessions: [{ key: 's_0000000000000a', branch: 'other', endedAt: '2027-01-07T00:00:00Z' }] }, {}],
    ['a remote HEAD naming another branch: it and main and master too', { refs: [row('refs/heads/trunk', { age: 40 }), row('refs/heads/main', { age: 40 }),
      row('refs/remotes/origin/main', { age: 40, merged: true }), row('refs/heads/other', { age: 40 }),
      row('refs/remotes/origin/HEAD', { symref: 'refs/remotes/origin/trunk' })] }, { 'refs/heads/other': 'branch' }],
    ['init.defaultBranch', { refs: [row('refs/heads/trunk', { age: 40 }), row('refs/heads/other', { age: 40 })], initDefault: 'trunk' },
      { 'refs/heads/other': 'branch' }],
    ['no remote HEAD, no init.defaultBranch: main and master', { refs: [row('refs/heads/main', { age: 40 }), row('refs/heads/master', { age: 40 }),
      row('refs/heads/other', { age: 40 })] }, { 'refs/heads/other': 'branch' }],
  ];
  // The session rows compare against HEAD's date: 1_800_000_000 s is 2027-01-15T08:00:00Z.
  it.each(cases)('%s', (_name, c, want) => expect(classes(c)).toEqual(want));

  it('a session on the branch within agentDays makes it active, never debris, whatever its age or class', () => {
    const recent = [{ key: 's_0000000000000a' as const, branch: 'a', endedAt: '2027-01-14T00:00:00Z' }];
    expect(classes({ refs: [row('refs/heads/a', { age: 40 })], sessions: recent })).toEqual({});
    expect(classes({ refs: [row('refs/heads/a', { age: 40, merged: true })], sessions: recent })).toEqual({});
    const old = [{ key: 's_0000000000000a' as const, branch: 'a', endedAt: '2027-01-01T00:00:00Z' }];
    const d = run({ refs: [row('refs/heads/a', { age: 8 })], sessions: old });
    expect(d.items).toMatchObject([{ cls: 'agent', sessions: ['s_0000000000000a'] }]);
  });

  it('counts a failed read as unreadable and draws nothing for it, nor for a worktree on it', () => {
    const d = run({ refs: [row('refs/heads/u', { age: 40 }), row('refs/heads/v', { age: 40 })], failed: ['refs/heads/u'],
      worktrees: [{ head: sha('refs/heads/u'), ref: 'refs/heads/u', locked: false, prunable: true, folder: 'u' }] });
    expect(d.unreadable).toBe(1);
    expect(d.items.map((i) => i.ref)).toEqual(['refs/heads/v']);
  });

  it('folds a worktree into its branch, and makes a prunable one on no debris branch (or detached) an agent item itself', () => {
    const live: WorktreeRow = { head: sha('refs/heads/a'), ref: 'refs/heads/a', locked: false, prunable: false, folder: 'a-dir' };
    const gone: WorktreeRow = { head: sha('refs/heads/young'), ref: 'refs/heads/young', locked: false, prunable: true, folder: null };
    const detached: WorktreeRow = { head: 'd'.repeat(40), ref: null, locked: true, prunable: true, folder: 'det' };
    const idle: WorktreeRow = { head: sha('refs/heads/y2'), ref: 'refs/heads/y2', locked: false, prunable: false, folder: 'y2' };
    const d = run({ refs: [row('refs/heads/a', { age: 40 }), row('refs/heads/young', { age: 1 }), row('refs/heads/y2', { age: 1 })],
      worktrees: [live, gone, detached, idle] });
    const by = Object.fromEntries(d.items.map((i) => [i.ref ?? 'detached', i]));
    expect(Object.keys(by).sort()).toEqual(['detached', 'refs/heads/a', 'refs/heads/young']);
    expect(by['refs/heads/a']).toMatchObject({ cls: 'branch', worktreeOnly: false, worktree: { prunable: false, locked: false, folder: 'a-dir' } });
    expect(by['refs/heads/young']).toMatchObject({ cls: 'agent', worktreeOnly: true, aheadCount: 0, lines: 0, id: debrisId('refs/heads/young') });
    expect(by['detached']).toMatchObject({ cls: 'agent', worktreeOnly: true, ref: null, tip: 'd'.repeat(40), id: debrisId(`HEAD ${'d'.repeat(40)}`),
      worktree: { prunable: true, locked: true, folder: 'det' } });
  });

  it('reads the group from its most advanced tip: most commits ahead first, then the newer (Qodo PR248 782839a3)', () => {
    const refs = [row('refs/heads/x', { age: 30 }), row('refs/remotes/origin/x', { age: 35 })];
    const d = run({ refs, ahead: { 'refs/heads/x': 1, 'refs/remotes/origin/x': 4 } });
    expect(d.items).toMatchObject([{ ref: 'refs/heads/x', tip: sha('refs/remotes/origin/x'), ageDays: 35 }]);
    expect(run({ refs, ahead: { 'refs/heads/x': 4, 'refs/remotes/origin/x': 4 } }).items).toMatchObject([{ tip: sha('refs/heads/x'), ageDays: 30 }]);
  });

  it('records sizes, files, creator and seed; merged items have no lines', () => {
    const d = run({ refs: [row('refs/heads/u', { age: 40 }), row('refs/heads/m', { age: 40, merged: true })], authors: { 'refs/heads/m': { name: 'Me', email: 'me@x.test' } } });
    const [m, u] = [d.items.find((i) => i.ref === 'refs/heads/m')!, d.items.find((i) => i.ref === 'refs/heads/u')!];
    expect(u).toMatchObject({ lines: 5, aheadCount: 1, files: ['f_00000000000a'], filesOutside: 1, ageDays: 40, creator: { name: 'Pip Okafor', self: false, agent: false },
      lastCommitDate: '2026-12-06T08:00:00Z', subject: 'tip of refs/heads/u' });
    expect(m).toMatchObject({ lines: 0, aheadCount: 0, creator: { name: 'Me', self: true } });
    expect(d.items.map((i) => i.id)).toEqual(d.items.map((i) => i.id).sort());
    expect(d.settings).toEqual(DEBRIS);
  });

  it("lists a remote copy where it lives: the upstream's own remote ref, a standard remote's mapping, the longest remote name; else nothing", () => {
    const d = run({ remotes: [{ name: 'a', standard: true }, { name: 'a/b', standard: true }, { name: 'odd', standard: false }],
      refs: [row('refs/heads/x', { age: 10, merged: true, upstream: 'refs/remotes/a/x', upstreamRemote: 'a', upstreamRemoteRef: 'refs/heads/renamed' }),
        row('refs/remotes/a/x', { age: 10, merged: true }), row('refs/remotes/a/b/y', { age: 10, merged: true }), row('refs/remotes/odd/z', { age: 10, merged: true })] });
    expect(Object.fromEntries(d.items.map((i) => [i.ref, i.remotes]))).toEqual({
      'refs/heads/x': [{ name: 'a', ref: 'refs/heads/renamed', sha: sha('refs/remotes/a/x') }],
      'refs/remotes/a/b/y': [{ name: 'a/b', ref: 'refs/heads/y', sha: sha('refs/remotes/a/b/y') }], 'refs/remotes/odd/z': [] });
  });

  it('takes the defaults from every remote HEAD, init.defaultBranch, and main and master always, sorted', () => {
    expect(defaultBranches({ initDefault: 'x', refs: [row('refs/remotes/up/HEAD', { symref: 'refs/remotes/up/trunk' }),
      row('refs/remotes/origin/HEAD', { symref: 'refs/remotes/origin/dev' })] })).toEqual(['dev', 'main', 'master', 'trunk', 'x']);
    expect(defaultBranches({ initDefault: null, refs: [] })).toEqual(['main', 'master']);
  });
});

const item = (o: Partial<DebrisItem> = {}): DebrisItem => ({
  id: debrisId('refs/heads/x'), cls: 'branch', ref: 'refs/heads/x', remotes: [], worktreeOnly: false, tip: 'b'.repeat(40), lastCommitDate: '2026-01-01T00:00:00Z',
  ageDays: 40, aheadCount: 2, lines: 9, files: [], filesOutside: 0, subject: 's', creator: { name: 'n', self: false, agent: false }, sessions: [], worktree: null,
  rebased: false, seed: 1, ...o,
});

describe('cleanup and inspect commands (shown, never run)', () => {
  // Every case from the scout's probes (`git check-ref-format --branch` accepts them all).
  const hostile = ['x;y', 'a$(b)', 'a`b`', "q'u", 'x|y', 'a#b', '-x', "''", 'a&&b', '$HOME', 'x>y', 'é/ü'];
  it.each(hostile)('quotes %j so a shell gets it back as one word', (name) => {
    const out = execFileSync('sh', ['-c', `printf '%s' ${shellQuote(name)}`], { encoding: 'utf8' });
    expect(out).toBe(name);
  });

  it('quotes a name with a quote in it as close-escape-reopen', () => {
    expect(shellQuote("q'u")).toBe("'q'\\''u'");
    expect(debrisCommands(item({ ref: "refs/heads/-q'u" })).cleanup).toBe("git branch -d -- '-q'\\''u'");
  });

  const W = DEBRIS_WARNINGS;
  const C = 'c'.repeat(40);
  const rows: [string, Partial<DebrisItem>, [string | null, string | null, string | null]][] = [
    ['unmerged local', {}, ["git branch -d -- 'x'", "git log --oneline HEAD..'refs/heads/x' --", W.unmerged]],
    ['agent local', { cls: 'agent' }, ["git branch -d -- 'x'", "git log --oneline HEAD..'refs/heads/x' --", W.unmerged]],
    // Each push delete leases the commit Commet saw merged, so newer work pushed since the last fetch is refused (Qodo PR248 81e79d3e).
    ['merged local with remote copies', { cls: 'merged', aheadCount: 0, remotes: [{ name: 'origin', ref: 'refs/heads/x', sha: C }, { name: '-up', ref: "refs/heads/y'z", sha: C }] },
      [`git branch -d -- 'x' && git push --delete '--force-with-lease=refs/heads/x:${C}' -- 'origin' 'refs/heads/x'`
        + ` && git push --delete '--force-with-lease=refs/heads/y'\\''z:${C}' -- '-up' 'refs/heads/y'\\''z'`, null, null]],
    ['rebased: no push, cherry to inspect', { cls: 'merged', rebased: true, remotes: [{ name: 'origin', ref: 'refs/heads/x', sha: C }] },
      ["git branch -d -- 'x'", "git cherry -v HEAD 'refs/heads/x'", W.rebased]],
    ['remote-only merged', { cls: 'merged', aheadCount: 0, ref: 'refs/remotes/origin/x', remotes: [{ name: 'origin', ref: 'refs/heads/x', sha: C }] },
      [`git push --delete '--force-with-lease=refs/heads/x:${C}' -- 'origin' 'refs/heads/x'`, null, null]],
    ['remote-only merged, remote unknown', { cls: 'merged', aheadCount: 0, ref: 'refs/remotes/gone/x' }, [null, null, null]],
    ['remote-only unmerged: no delete at all', { ref: 'refs/remotes/origin/x', remotes: [{ name: 'origin', ref: 'refs/heads/x', sha: C }] },
      [null, "git log --oneline HEAD..'refs/remotes/origin/x' --", W.remoteUnmerged]],
    ['live worktree, unique folder (leading dash)', { worktree: { prunable: false, locked: false, folder: '-dir' } },
      ["git worktree remove -- '-dir' && git branch -d -- 'x'", "git log --oneline HEAD..'refs/heads/x' --", W.unmerged]],
    ['live worktree, folder not unique', { worktree: { prunable: false, locked: false, folder: null } },
      [null, "git log --oneline HEAD..'refs/heads/x' --", W.worktreeAmbiguous]],
    ['locked worktree', { worktree: { prunable: true, locked: true, folder: 'x' } }, [null, "git log --oneline HEAD..'refs/heads/x' --", W.worktreeLocked]],
    // One worktree at a time, never the repository-wide `git worktree prune` (Qodo PR248 2d231f91).
    ['prunable worktree on the branch', { cls: 'merged', aheadCount: 0, worktree: { prunable: true, locked: false, folder: 'gone' } },
      ["git worktree remove -- 'gone' && git branch -d -- 'x'", null, null]],
    ['prunable worktree, folder not unique', { cls: 'merged', aheadCount: 0, worktree: { prunable: true, locked: false, folder: null } },
      [null, null, W.worktreeAmbiguous]],
    ['worktree-only on a branch', { cls: 'agent', worktreeOnly: true, aheadCount: 0, worktree: { prunable: true, locked: false, folder: 'gone' } },
      ["git worktree remove -- 'gone'", null, null]],
    ['worktree-only, folder not unique', { cls: 'agent', worktreeOnly: true, aheadCount: 0, worktree: { prunable: true, locked: false, folder: null } },
      [null, null, W.worktreeAmbiguous]],
    ['worktree-only, detached with its own commits: no prune', { cls: 'agent', worktreeOnly: true, ref: null, worktree: { prunable: true, locked: false, folder: null } },
      [null, `git log --oneline HEAD..${'b'.repeat(40)} --`, W.detached]],
    ['worktree-only, detached at a merged commit', { cls: 'agent', worktreeOnly: true, ref: null, aheadCount: 0,
      worktree: { prunable: true, locked: false, folder: 'det' } }, ["git worktree remove -- 'det'", null, null]],
    ['worktree-only, detached with its own commits, locked: the lost-work warning first', { cls: 'agent', worktreeOnly: true, ref: null,
      worktree: { prunable: true, locked: true, folder: 'det' } }, [null, `git log --oneline HEAD..${'b'.repeat(40)} --`, W.detached]],
    ['worktree-only, locked', { cls: 'agent', worktreeOnly: true, aheadCount: 0, worktree: { prunable: true, locked: true, folder: null } }, [null, null, W.worktreeLocked]],
  ];
  it.each(rows)('%s', (_n, o, [cleanup, inspect, warning]) => expect(debrisCommands(item(o))).toEqual({ cleanup, inspect, warning }));

  const hidden = ['rtl\u202Eevil', 'zero\u200Bwidth', 'line\u2028sep', 'bad\uFFFDbyte', 'bell\u0007', 'bom\uFEFF'];
  it.each(hidden)('builds no command at all for a hidden character in %j (branch, remote or folder)', (s) => {
    const none = { cleanup: null, inspect: null, warning: W.hiddenCharacters };
    expect(debrisCommands(item({ ref: `refs/heads/${s}` }))).toEqual(none);
    expect(debrisCommands(item({ cls: 'merged', remotes: [{ name: s, ref: 'refs/heads/x', sha: C }] }))).toEqual(none);
    expect(debrisCommands(item({ worktree: { prunable: false, locked: false, folder: s } }))).toEqual(none);
  });

  it("says what git branch -d really does: it deletes a branch its upstream holds, merged into HEAD or not (Qodo PR248 5195ff78)", () => {
    const root = realTempDir('commet-debris-d-');
    const git = (...args: string[]) => execFileSync('git', args, { cwd: join(root, 'r'), encoding: 'utf8', stdio: 'pipe' });
    execFileSync('git', ['init', '-q', '--bare', 'o.git'], { cwd: root });
    execFileSync('git', ['init', '-q', '-b', 'main', 'r'], { cwd: root });
    for (const [k, v] of [['user.name', 'P'], ['user.email', 'p@x.test'], ['commit.gpgsign', 'false']]) git('config', k!, v!);
    git('commit', '-q', '--allow-empty', '-m', 'one');
    git('remote', 'add', 'origin', join(root, 'o.git'));
    git('checkout', '-q', '-b', 'pushed');
    git('commit', '-q', '--allow-empty', '-m', 'work HEAD lacks');
    git('push', '-q', '-u', 'origin', 'pushed');
    git('checkout', '-q', 'main');
    git('branch', '-d', '--', 'pushed');
    expect(git('branch', '--list', 'pushed')).toBe('');
    expect(W.unmerged).toMatch(/unless HEAD or its upstream has every commit/);
  });

  it('never offers a forced delete', () => {
    for (const [, o] of rows) {
      const { cleanup, inspect } = debrisCommands(item(o));
      expect(`${cleanup} ${inspect}`).not.toMatch(/\s-D\b|--force(?!-with-lease=)|\s-f\b/);
    }
  });
});

describe('the view and the panel', () => {
  const p1 = 'd_000000000001' as DirId;
  const p2 = 'd_000000000002' as DirId;
  const home = new Map<FileId, DirId | null>([['f_000000000001', p1], ['f_000000000002', p2], ['f_000000000003', p2], ['f_000000000004', null]]);
  const debris: Debris = { settings: { ...DEBRIS }, defaults: ['main'], unreadable: 0, items: [
    item({ id: 'x_000000000001', files: ['f_000000000001', 'f_000000000002', 'f_000000000003'], ageDays: 200, lines: 7, seed: 5,
      sessions: ['s_0000000000000b', 's_0000000000000a'].sort() as Session['key'][] }),
    item({ id: 'x_000000000002', files: ['f_000000000001', 'f_000000000002'], cls: 'merged', lines: 0, ageDays: 59 }),
    item({ id: 'x_000000000003', files: ['f_000000000004'], ageDays: 60, lines: 3 }),
    item({ id: 'x_000000000004', files: [], ref: 'refs/remotes/origin/r', ageDays: 10, lines: 1 }),
  ] };
  const snap = { repo: { head: HEAD }, debris, sessions: [
    { key: 's_0000000000000b', model: 'opus', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-02T00:00:00Z' },
    { key: 's_0000000000000a', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-03T00:00:00Z' },
    { key: 's_0000000000000c', startedAt: '2025-01-01T00:00:00Z', endedAt: '2025-01-03T00:00:00Z' },
  ] } as unknown as SnapshotV02;

  it('lists every item as a piece: home by most files (ties by codepoint), star for root files, unplaced counted; mass a repo total', () => {
    expect(debrisView(snap, home)).toEqual({ schemaVersion: 'debris.1', head: HEAD, total: 4, placed: 3, mass: 11, unreadable: 0, prs: 'not-read', needsRescan: false, pieces: [
      { id: 'x_000000000001', cls: 'branch', home: p2, ageStep: 2, lines: 7, seed: 5 },
      { id: 'x_000000000002', cls: 'merged', home: p1, ageStep: 0, lines: 0, seed: 1 },
      { id: 'x_000000000003', cls: 'branch', home: 'star', ageStep: 1, lines: 3, seed: 1 },
      { id: 'x_000000000004', cls: 'branch', home: null, ageStep: 0, lines: 1, seed: 1 },
    ] });
  });

  it('answers needsRescan with no pieces for a snapshot from before R13', () => {
    const old = { repo: snap.repo, sessions: snap.sessions };
    expect(debrisView(old, home)).toMatchObject({ pieces: [], total: 0, placed: 0, mass: 0, needsRescan: true });
    expect(debrisDetail(old, home, 'x_000000000001')).toBeNull();
  });

  it("gives one item's panel: short name, every body it touches, its sessions by start, its commands", () => {
    expect(debrisDetail(snap, home, 'x_000000000001')).toMatchObject({ ok: true, schemaVersion: 'debris-detail.1', head: HEAD, name: 'x', remoteOnly: false,
      planets: [p1, p2], home: p2, lastCommit: { sha: 'b'.repeat(40), short: 'bbbbbbb', subject: 's', date: '2026-01-01T00:00:00Z' },
      sessions: [{ key: 's_0000000000000a', model: null, startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-03T00:00:00Z' },
        { key: 's_0000000000000b', model: 'opus', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-02T00:00:00Z' }],
      creator: { displayName: 'n', captain: false, agent: false }, cleanup: "git branch -d -- 'x'", warning: DEBRIS_WARNINGS.unmerged });
    expect(debrisDetail(snap, home, 'x_000000000004')).toMatchObject({ name: 'origin/r', remoteOnly: true, planets: [], home: null });
    expect(debrisDetail(snap, home, 'x_000000000009')).toBeNull();
  });

  it('decays in three steps at 60 and 180 days', () => {
    expect([0, 59, 60, 179, 180, 5000].map(debrisAgeStep)).toEqual([0, 0, 1, 1, 2, 2]);
  });
});

describe('the stored-debris check', () => {
  const ok: Debris = { settings: { ...DEBRIS }, defaults: ['main'], unreadable: 0, items: [item({ id: 'x_000000000001' }), item({ id: 'x_000000000002' })] };
  const bad: [string, unknown][] = [
    ['not an object', 'x'], ['no items', { ...ok, items: undefined }], ['a bad id', { ...ok, items: [item({ id: 'x_1' as never })] }],
    ['out of order', { ...ok, items: [ok.items[1], ok.items[0]] }], ['repeated', { ...ok, items: [ok.items[0], ok.items[0]] }],
    ['a pr item', { ...ok, items: [item({ cls: 'pr' as never })] }], ['a bad tip', { ...ok, items: [item({ tip: 'HEAD' })] }],
    ['a negative count', { ...ok, items: [item({ lines: -1 })] }], ['a float age', { ...ok, items: [item({ ageDays: 1.5 })] }],
    ['a seed past uint32', { ...ok, items: [item({ seed: 2 ** 32 })] }], ['a path for a file', { ...ok, items: [item({ files: ['src/a.ts' as FileId] })] }],
    ['unsorted files', { ...ok, items: [item({ files: ['f_000000000002', 'f_000000000001'] })] }],
    ['a detached ref outside a worktree item', { ...ok, items: [item({ ref: null })] }], ['a tag ref', { ...ok, items: [item({ ref: 'refs/tags/v1' })] }],
    ['a worktree-only item with no worktree', { ...ok, items: [item({ worktreeOnly: true })] }],
    ['a damaged worktree', { ...ok, items: [item({ worktree: { prunable: 'yes' } as never })] }],
    ['a damaged creator', { ...ok, items: [item({ creator: { name: 'n' } as never })] }], ['bad settings', { ...ok, settings: { abandonedDays: '30' } }],
    ['a remote copy without its sha', { ...ok, items: [item({ remotes: [{ name: 'origin', ref: 'refs/heads/x' }] as never })] }],
  ];
  const sessions = [{ key: 's_0000000000000a', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-02T00:00:00Z' }] as unknown as Session[];
  it.each(bad)('refuses %s', (_n, d) => expect(debrisProblem({ debris: d as Debris, sessions })).not.toBeNull());
  it('accepts well-formed debris, and none at all', () => {
    expect(debrisProblem({ debris: ok, sessions })).toBeNull();
    expect(debrisProblem({ sessions })).toBeNull();
  });
  it('refuses damaged sessions, which the panel reads (Qodo PR248 6fcfa051)', () => {
    for (const s of ['x', [null], [{ key: 1, startedAt: 'a', endedAt: 'b' }], [{ key: 's_0000000000000a', startedAt: 'a', endedAt: 'b', model: 3 }]]) {
      expect(debrisProblem({ debris: ok, sessions: s as never }), JSON.stringify(s)).not.toBeNull();
    }
  });
});

describe("the scan's parsers", () => {
  it('reads worktrees without their paths or reasons: main and bare left out, folders kept only when unique', () => {
    const z = (...records: string[][]) => records.map((r) => `${r.join('\0')}\0\0`).join('');
    const out = parseWorktrees(z(['worktree /r/main', 'HEAD 1111', 'branch refs/heads/main'],
      ['worktree /w/a', `HEAD ${'2'.repeat(40)}`, 'branch refs/heads/a', 'locked kept for /secret'],
      ['worktree /w/x/b', `HEAD ${'3'.repeat(40)}`, 'detached', 'prunable gitdir file points to non-existent location'],
      ['worktree /w/y/b', `HEAD ${'4'.repeat(40)}`, 'branch refs/heads/b'],
      ['worktree /w/main', `HEAD ${'5'.repeat(40)}`, 'branch refs/heads/m', 'locked'],
      ['worktree /w/odd\u0001na\nme\t', `HEAD ${'6'.repeat(40)}`, 'branch refs/heads/o'],
      ['worktree /w/bare.git', 'bare']));
    expect(out).toEqual([
      { head: '2'.repeat(40), ref: 'refs/heads/a', locked: true, prunable: false, folder: 'a' },
      { head: '3'.repeat(40), ref: null, locked: false, prunable: true, folder: null },
      { head: '4'.repeat(40), ref: 'refs/heads/b', locked: false, prunable: false, folder: null },
      { head: '5'.repeat(40), ref: 'refs/heads/m', locked: true, prunable: false, folder: null },
      { head: '6'.repeat(40), ref: 'refs/heads/o', locked: false, prunable: false, folder: 'odd\u0001na\nme\t' },
    ]);
    expect(JSON.stringify(out)).not.toMatch(/secret|non-existent|\/w\//);
  });

  it("lists a branch's worktree at the branch's own tip, even after a forced move: no other commits to lose (Qodo PR248 23119256)", () => {
    const root = realTempDir('commet-debris-wt-');
    const git = (...args: string[]) => execFileSync('git', args, { cwd: join(root, 'r'), encoding: 'utf8', stdio: 'pipe' });
    execFileSync('git', ['init', '-q', '-b', 'main', 'r'], { cwd: root });
    for (const [k, v] of [['user.name', 'P'], ['user.email', 'p@x.test'], ['commit.gpgsign', 'false']]) git('config', k!, v!);
    git('commit', '-q', '--allow-empty', '-m', 'one');
    git('worktree', 'add', '-q', join(root, 'live'), '-b', 'lv');
    execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'worktree work'], { cwd: join(root, 'live') });
    git('update-ref', 'refs/heads/lv', 'main');
    const [wt] = parseWorktrees(git('worktree', 'list', '--porcelain', '-z'));
    expect(wt).toMatchObject({ ref: 'refs/heads/lv', head: git('rev-parse', 'refs/heads/lv').trim() });
  });

  it('reads remotes and whether their fetch refspec is the standard one', () => {
    expect(remotesOf('remote.origin.fetch\n+refs/heads/*:refs/remotes/origin/*\0remote.a.b.fetch\n+refs/heads/*:refs/remotes/a.b/*\0'
      + 'remote.mirror.fetch\n+refs/heads/*:refs/remotes/mirror/x/*\0remote.two.fetch\n+refs/heads/*:refs/remotes/two/*\0remote.two.fetch\n+refs/tags/*:refs/tags/*\0'))
      .toEqual([{ name: 'a.b', standard: true }, { name: 'mirror', standard: false }, { name: 'origin', standard: true }, { name: 'two', standard: false }]);
    expect(remotesOf('')).toEqual([]);
  });

  it('tells an unset config value (git exit 1) from a failed read, which fails the scan (Qodo PR248 72be58ec)', async () => {
    const stub = (fail: number | null) => (async (args: string[]) => {
      if (args[0] === 'for-each-ref') return '';
      if (args[0] === 'config') {
        if (fail !== null) throw Object.assign(new Error(`git config exited with ${fail}`), { code: fail });
        return args.includes('--get-regexp') ? 'remote.origin.fetch\n+refs/heads/*:refs/remotes/origin/*\0' : 'trunk\n';
      }
      throw new Error(`unexpected git ${args.join(' ')}`);
    }) as Git;
    await expect(readDebrisGit(stub(null), HEAD, HEAD_CT, '', [])).resolves.toMatchObject({ remotes: [{ name: 'origin', standard: true }], initDefault: 'trunk' });
    await expect(readDebrisGit(stub(1), HEAD, HEAD_CT, '', [])).resolves.toMatchObject({ remotes: [], initDefault: null });
    await expect(readDebrisGit(stub(128), HEAD, HEAD_CT, '', [])).rejects.toThrow();
  });

  it('sorts remotes by codepoint, as every other order is (Qodo PR248 ec6f9b05)', () => {
    const [bmp, astral] = ['z\uFFFF', 'z\u{1F600}'];
    expect(remotesOf(`remote.${astral}.fetch\nx\0remote.${bmp}.fetch\ny\0`).map((r) => r.name)).toEqual([bmp, astral]);
  });

  it("keeps a branch's own read apart from its prunable worktree's (Qodo PR248 6a6df300)", async () => {
    const tip = sha('refs/heads/a');
    const rec = (s: string, subject: string, extra: string[] = []) => [s, String(HEAD_CT - 10 * DAY), 'Claude', 'noreply@anthropic.com', subject, ...extra].join('\0');
    const git = (async (args: string[]) => {
      if (args[0] === 'log' && args.includes('-1')) return `${rec(tip, 'tip', ['e'.repeat(40)])}\0`;
      if (args[0] === 'log') return `${rec(tip, 'tip')}\0${rec('e'.repeat(40), 'first')}\0`;
      if (args[0] === 'diff-tree') return '1\t0\tsrc/a.ts\0';
      if (args[0] === 'rev-list') return '0\n';
      if (args[0] === 'cherry') return '';
      throw new Error(`unexpected git ${args.join(' ')}`);
    }) as Git;
    const wt: WorktreeRow = { head: tip, ref: 'refs/heads/a', locked: false, prunable: true, folder: 'a-dir' };
    const plan = planDebris({ head: HEAD, headCt: HEAD_CT, headRef: 'refs/heads/session', refs: [row('refs/heads/a', { age: 10 })],
      remotes: [], initDefault: null, worktrees: [wt] });
    const work = new Map([['refs/heads/a', { aheadCount: 2, lines: 9, paths: new Set(['src/a.ts']) }]]);
    const reads = await readDebris(git, plan, work, HEAD, '4b825dc642cb6eb9a060e54bf8d69288fbee4904');
    const d = buildDebris(plan, reads, { headCt: HEAD_CT, sessions: [], fileIds: new Map(), selfEmails: new Set() });
    expect(d.items).toMatchObject([{ ref: 'refs/heads/a', cls: 'agent', aheadCount: 2, lines: 9, subject: 'tip', worktreeOnly: false,
      worktree: { prunable: true, folder: 'a-dir' } }]);
  });

  it('reads diff-tree numstat on NUL only (Rule 7: U+0001, newline and tab in a path), leaving out binaries and excluded paths', () => {
    const odd = 'ui/odd\u0001na\nme\t.ts';
    expect(numstatPaths(`1\t0\t${odd}\0-\t-\tlogo.png\0` + `3\t1\tsrc/a.ts\0` + `2\t0\tpackage-lock.json\0`)).toEqual([odd, 'src/a.ts']);
    expect(numstatPaths('')).toEqual([]);
    expect(numstatPaths('1\t0\tsrc/a.ts')).toBeNull();
    expect(numstatPaths('garbage\0')).toBeNull();
  });

  it('reads -z commit records whole, redacting paths in names and subjects, and refuses a misframed one', () => {
    const rec = (s: string, subject: string) => [s, '1700000000', 'Pip', 'Pip@X.test', subject].join('\0');
    expect(parseCommits(`${rec('c'.repeat(40), 'fix /Users/pip/secret/x.ts')}\0${rec('d'.repeat(40), 'two')}\0`)?.commits).toEqual([
      { sha: 'c'.repeat(40), ct: 1_700_000_000, name: 'Pip', email: 'pip@x.test', subject: 'fix <path>' },
      { sha: 'd'.repeat(40), ct: 1_700_000_000, name: 'Pip', email: 'pip@x.test', subject: 'two' }]);
    expect(parseCommits(`${rec('c'.repeat(40), 'a')}\0extra\0`)).toBeNull();
    expect(parseCommits(rec('HEAD', 'a'))).toBeNull();
    expect(parseCommits('')?.commits).toEqual([]);
  });
});
