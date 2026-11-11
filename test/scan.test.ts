import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { sessionKey } from '../src/core/hash.js';
import { gitRunner } from '../src/scan/git.js';
import { scan, type ScanOptions } from '../src/scan/index.js';
import { addedLines, windowCommits, type NumstatRow } from '../src/scan/repo.js';
import { buildBasicRepo, CONTROL, SPACED, type FixtureRepo } from './fixtures/build/basic.js';
import { cli } from './fixtures/cli.js';
import { miniRepo } from './fixtures/mini.js';
import { MAIN_SESSION, SUBAGENT_ID, writeClaudeFixture, type ClaudeFixture } from './fixtures/claude/basic.js';
import { tempDir } from './fixtures/tmp.js';

const GOLDEN = join(import.meta.dirname, 'golden/basic.snapshot.json');
let repo: FixtureRepo;
let claude: ClaudeFixture;

beforeAll(async () => {
  repo = await buildBasicRepo();
  claude = writeClaudeFixture(repo);
});

const run = (o: Partial<ScanOptions> = {}) => scan({ repoDir: repo.dir, windowMonths: 24, ingest: true,
  claudeProjectsDir: join(claude.claudeDir, 'projects'), keyFor: () => new Uint8Array(32).fill(7), ...o });

describe('scan', () => {
  it('matches the golden snapshot (update deliberately with UPDATE_GOLDEN=1 and a Golden-Update: reason)', async () => {
    const { json } = await run();
    if (process.env['UPDATE_GOLDEN'] === '1') writeFileSync(GOLDEN, json);
    expect(json).toBe(readFileSync(GOLDEN, 'utf8'));
  });

  it('classes commits, including agent work committed under the human identity', async () => {
    const { snapshot } = await run();
    const bySha = new Map(snapshot.commits.map((c) => [c.sha, c.attribution]));
    const cls = (id: string) => bySha.get(repo.commits[id]!.sha)!;
    expect(['c0', 'c1', 'c2', 'c3', 'c4', 'c5'].map((id) => cls(id).class))
      .toEqual(['unknown', 'agent', 'mixed', 'human', 'unknown', 'agent']);
    // Qodo #1: an edit after the committer time doesn't count, even before a later author date.
    expect(cls('c6')).toMatchObject({ class: 'human', agentLineShareMilli: 0, sessions: [] });
    // Qodo #4: a U+0001 inside a line doesn't split the patch stream.
    expect(cls('c7')).toMatchObject({ class: 'agent', agentLineShareMilli: 1000 });
    // Qodo #5: decorated header paths match agent edits, and the spaced-dir lockfile is excluded.
    expect(cls('c8')).toMatchObject({ class: 'agent', agentLineShareMilli: 1000 });
    // Qodo #6: a commit in a gap between transcripts is unknown, never human.
    expect(cls('c9')).toMatchObject({ class: 'unknown', tier: 'none' });
    expect(cls('c1').selfCommittedAgentWritten).toBe(true);
    expect(cls('c1').evidence.map((e) => e.kind)).toEqual(['transcript_match', 'agent_ran_commit']);
    expect(cls('c2').agentLineShareMilli).toBe(500);
    expect(cls('c4').selfCommittedAgentWritten).toBe(false);
  });

  it('keys sessions by hash of tool + session ID and links subagents to their parent', async () => {
    const { snapshot } = await run();
    const mainKey = sessionKey('claude-code', MAIN_SESSION);
    const subKey = sessionKey('claude-code', MAIN_SESSION, SUBAGENT_ID);
    const byKey = new Map(snapshot.sessions.map((s) => [s.key, s]));
    const [mainS, subS] = [byKey.get(mainKey), byKey.get(subKey)];
    expect([mainS?.kind, mainS?.parentKey, subS?.kind, subS?.parentKey]).toEqual(['main', undefined, 'subagent', mainKey]);
    expect(mainS).toMatchObject({ linesAdded: 17, filesTouched: 6, model: 'claude-opus-4-1', commits: ['c1', 'c2', 'c7', 'c8'].map((id) => repo.commits[id]!.sha) });
    expect(subS).toMatchObject({ agentType: 'general-purpose', commits: [repo.commits['c5']!.sha] });
    const c5 = snapshot.commits.find((c) => c.sha === repo.commits['c5']!.sha)!;
    expect(c5.attribution.sessions).toEqual([{ sessionKey: subKey, lines: 2 }]);
    // Qodo #3: path-shaped model, branch, version and agentType are dropped, the session kept.
    const metaKey = sessionKey('claude-code', '66666666-6666-4666-8666-666666666666');
    for (const k of [metaKey, sessionKey('claude-code', '66666666-6666-4666-8666-666666666666', 'f00d')]) {
      const m = byKey.get(k)!;
      expect([m.model, m.branch, m.toolVersion, m.agentType]).toEqual([undefined, undefined, undefined, undefined]);
    }
  });

  it('is byte-identical across runs and independent of the HMAC key', async () => {
    const a = await run();
    const b = await run();
    const c = await run({ keyFor: () => new Uint8Array(32).fill(9) });
    expect(b.json).toBe(a.json);
    expect(c.json).toBe(a.json);
  });

  it('never classes a commit human during a transcript it could not read (Qodo #6)', async () => {
    const mainFile = claude.transcripts.find((f) => f.endsWith(`${MAIN_SESSION}.jsonl`))!;
    const { snapshot } = await run({ maxTranscriptBytes: statSync(mainFile).size - 1 });
    const cls = (id: string) => snapshot.commits.find((c) => c.sha === repo.commits[id]!.sha)!.attribution.class;
    expect(['c3', 'c6'].map(cls)).toEqual(['unknown', 'unknown']);
    expect(snapshot.coverage.length).toBeGreaterThan(0);
  });

  it('ignores the user\'s log.showRoot and diff.submodule config (bar raiser #8)', async () => {
    const set = (k: string, v: string) => execFileSync('git', ['config', k, v], { cwd: repo.dir });
    set('log.showRoot', 'false');
    set('diff.submodule', 'log');
    try {
      expect((await run()).json).toBe(readFileSync(GOLDEN, 'utf8'));
    } finally {
      for (const k of ['log.showRoot', 'diff.submodule']) execFileSync('git', ['config', '--unset', k], { cwd: repo.dir });
    }
  });

  it('classes everything unknown, never human, without log coverage', async () => {
    const { snapshot } = await run({ ingest: false });
    expect(new Set(snapshot.commits.map((c) => c.attribution.class))).toEqual(new Set(['unknown']));
    expect(snapshot.coverage).toEqual([]);
  });
});

describe('commet scan CLI', () => {
  it('writes .git/commet/snapshot.json (0600) and prints per-class counts', async () => {
    const r = await cli(['scan'], repo.dir, { CLAUDE_CONFIG_DIR: claude.claudeDir });
    expect(r).toMatchObject({ code: 0, err: '' });
    expect(r.out).toContain('10 commits: agent 4 · mixed 1 · human 2 · unknown 3');
    expect(r.out).toContain('committed by you, written by an agent: 5');
    expect(r.out).toContain('Claude Code logs cover 2 span(s) between 2026-10-02 and 2026-10-25; a commit outside them is never classed human.');
    const file = join(repo.dir, '.git/commet/snapshot.json');
    expect(readFileSync(file, 'utf8')).toBe(readFileSync(GOLDEN, 'utf8'));
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(join(repo.dir, '.git/commet')).mode & 0o777).toBe(0o700);
    expect(statSync(join(repo.dir, '.git/commet/key')).mode & 0o777).toBe(0o600);
  });

  it('refuses a shallow clone with exit 3 and an unshallow hint', async () => {
    const dir = join(tempDir('commet-shallow-'), 'clone');
    execFileSync('git', ['clone', '-q', '--depth', '1', `file://${repo.dir}`, dir]);
    const r = await cli(['scan'], dir, { CLAUDE_CONFIG_DIR: claude.claudeDir });
    expect(r.code).toBe(3);
    expect(r.err).toContain('git fetch --unshallow');
  });

  it('maps a failing git log to the normal internal-error exit, with no unhandled rejection (Qodo PR10 #8)', async () => {
    const broken = miniRepo([{ id: 'root', at: '2026-10-10T08:00:00Z', path: 'README.md', lines: ['# Broken fixture', 'git log fails here.'] }]);
    // A git shim on PATH fails only `git log`, so readRepo succeeds and windowCommits rejects.
    const shim = tempDir('commet-git-shim-');
    const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
    writeFileSync(join(shim, 'git'), `#!/bin/sh\nfor a in "$@"; do [ "$a" = log ] && { echo "fatal: synthetic log failure" >&2; exit 128; }; done\nexec '${realGit}' "$@"\n`, { mode: 0o755 });
    const path = process.env['PATH'];
    process.env['PATH'] = `${shim}:${path ?? ''}`;
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on('unhandledRejection', onUnhandled);
    try {
      const r = await cli(['scan'], broken.dir, { CLAUDE_CONFIG_DIR: tempDir('commet-broken-claude-') });
      await new Promise((done) => setTimeout(done, 50));
      expect(r).toMatchObject({ code: 1 });
      expect(r.err).toContain('commet: internal error');
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
      process.env['PATH'] = path;
    }
  });

  it('exits 4 outside a repo and 2 on usage errors', async () => {
    expect((await cli(['scan'], tempDir('commet-norepo-'), {})).code).toBe(4);
    expect((await cli(['scan', '--window', 'x'], repo.dir, {})).code).toBe(2);
    expect((await cli(['frobnicate'], repo.dir, {})).code).toBe(2);
  });
});

describe('git patch parsing', () => {
  it('keys patches by real commit SHAs even when content holds U+0001 (Qodo #4)', async () => {
    const patches = await addedLines(gitRunner(repo.dir), repo.commits['c7']!.sha, '2026-01-01T00:00:00Z');
    expect(new Set(patches.keys())).toEqual(new Set(['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'].map((id) => repo.commits[id]!.sha)));
    expect(patches.get(repo.commits['c7']!.sha)!.get('src/ctrl.ts')).toEqual(CONTROL);
  });

  it('reads paths with spaces (trailing tab) and C-quoted paths from patch headers (Qodo #5)', async () => {
    const patches = await addedLines(gitRunner(repo.dir), repo.commits['c8']!.sha, '2026-10-09T00:00:00Z');
    expect([...patches.get(repo.commits['c8']!.sha)!.keys()].sort()).toEqual([SPACED.quoted, SPACED.plain, SPACED.lock].sort());
    const { snapshot } = await run();
    const c8 = snapshot.commits.find((c) => c.sha === repo.commits['c8']!.sha)!;
    expect(c8.files.map((f) => f[0])).toEqual([SPACED.plain, SPACED.quoted]);
  });
});

describe('#24: window numstat is parsed by position on NUL (AGENTS.md Rule 7)', () => {
  const ODD = 'd/a\u0001b\nc\td.ts';
  const row = (added: number, removed = 0, binary = false): NumstatRow => ({ added, removed, binary });
  const since = '2000-01-01T00:00:00Z';
  /** windowCommits over canned output: `stat` is the numstat log, one meta record per SHA. */
  const canned = (stat: string, shas: string[]) => async (args: string[]) =>
    (args.includes('--numstat') ? stat : shas.map((s) => [s, '100', '100', 'N', 'n@example.com', '', 's'].join('\0')).join('\0'));

  it('a path holding U+0001, a newline and a tab neither splits its commit nor drops its rows (real git)', async () => {
    const dir = tempDir('commet-numstat-');
    let n = 0;
    const git = (...args: string[]) => {
      const at = `2026-07-${String(++n).padStart(2, '0')}T10:00:00Z`;
      return execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'Ada', GIT_AUTHOR_EMAIL: 'ada@example.com',
        GIT_COMMITTER_NAME: 'Ada', GIT_COMMITTER_EMAIL: 'ada@example.com', GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at } }).trim();
    };
    git('init', '-q', '-b', 'main');
    // An empty root is the log's last record: its header is all that is left at the end.
    git('commit', '-q', '--allow-empty', '-m', 'root');
    mkdirSync(join(dir, 'd'));
    writeFileSync(join(dir, ODD), 'odd\n');
    writeFileSync(join(dir, 'd/c.ts'), 'c\nc\nc\nc\n');
    writeFileSync(join(dir, 'd/z.ts'), 'z\nz\n');
    writeFileSync(join(dir, 'd/logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 1, 2]));
    git('add', '-A');
    git('commit', '-qm', 'odd');
    git('commit', '-q', '--allow-empty', '-m', 'empty');
    mkdirSync(join(dir, '\nnl'));
    git('mv', 'd/c.ts', '\nnl/c.ts');
    writeFileSync(join(dir, ODD), 'odd\nodd\n');
    git('commit', '-qam', 'move');
    const commits = await windowCommits(gitRunner(dir), git('rev-parse', 'HEAD'), since);
    expect(commits.map((c) => [c.subject, c.files])).toEqual([
      ['root', new Map()],
      ['odd', new Map([[ODD, row(1)], ['d/c.ts', row(4)], ['d/logo.png', row(0, 0, true)], ['d/z.ts', row(2)]])],
      ['empty', new Map()],
      ['move', new Map([[ODD, row(1)], ['\nnl/c.ts', row(0)]])],
    ]);
  });

  it('a repeated header keeps only the first (first-parent) diff, as lineageLog does', async () => {
    const [m, p] = ['e'.repeat(40), 'f'.repeat(40)];
    const stat = ['', m, '\n1\t0\tm.ts', '', m, '\n2\t0\ts.ts', '', p, '\n3\t1\ta.ts', ''].join('\0');
    const commits = await windowCommits(canned(stat, [m, p]), 'HEAD', since);
    expect(commits.map((c) => [c.sha, c.files])).toEqual([[p, new Map([['a.ts', row(3, 1)]])], [m, new Map([['m.ts', row(1)]])]]);
  });

  it('keeps a well-formed final header without its closing NUL; refuses any other cut-off record', async () => {
    const [a, b] = ['a'.repeat(40), 'b'.repeat(64)];
    const ok = await windowCommits(canned(['', a, '\n1\t0\td/a.ts', '', b].join('\0'), [a, b]), 'HEAD', since);
    expect(ok.map((c) => [c.sha, c.files])).toEqual([[b, new Map()], [a, new Map([['d/a.ts', row(1)]])]]);
    for (const stat of [
      ['', a, '\n1\t0\td/a.ts', '', 'b'.repeat(39)],
      ['', a, '\n1\t0\td/a.t'],
      ['', a, '\n0\t0\t', 'd/x.ts'],
      ['', a, '\n0\t0\t', 'd/x.ts', 'e/x.ts'],
    ]) await expect(windowCommits(canned(stat.join('\0'), [a]), 'HEAD', since)).rejects.toThrow(/incomplete/);
  });
});
