// Reproductions for two false-human paths (debug/false-human, JOURNAL 2026-11-09 KNOWN ISSUEs).
// Rule 1: a commit an agent wrote or ran must never come out `human`.
//
// Every `it.fails` below FAILS ON CURRENT CODE (so the suite stays green) and is the regression
// test for the fix: once a case is fixed, vitest reports it as an unexpected pass, and the fix
// turns that `it.fails` into `it`. The plain `it` cases are controls and preconditions; they pass
// before and after the fix, so a broken fixture can never make a repro pass vacuously.
// `REPRO_SHOW=1 npx vitest run test/repro-false-human.test.ts` runs the repros as plain tests, to
// show each one fails on its assertion (class human, lines lost), not on a broken fixture.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gitRunner } from '../src/scan/git.js';
import { addedLines } from '../src/scan/repo.js';
import { SELF } from './fixtures/build/basic.js';
import { createResult, miniClaude, miniRepo, scanMini, session, type MiniRepo, type Row } from './fixtures/mini.js';

const repro = process.env['REPRO_SHOW'] === '1' ? it : it.fails;
const SCOUT = '56565656-5656-4565-8565-565656565656';
const IDLE = '34343434-3434-4343-8343-343434343434';
const AGENT = '78787878-7878-4787-8787-787878787878';
const at = (hhmmss: string) => `2026-10-10T${hhmmss}.000Z`;
const LINES = ['export const reviewedLineOne = 4101;', 'export const reviewedLineTwo = reviewedLineOne + 1;'];

// ---------------------------------------------------------------------------------------------
// Bug A: a Claude Code session whose cwd is outside the repo runs `git commit` in it.
// ---------------------------------------------------------------------------------------------

/** A root commit, then the self-authored target commit at 10:00 (the commit the scout ran). */
const targetRepo = () => miniRepo([
  { id: 'root', at: '2026-10-10T08:00:00Z', path: 'README.md', lines: ['# Mini fixture', 'A root commit before the logs.'] },
  { id: 'target', at: '2026-10-10T10:00:00Z', path: 'src/reviewed.ts', lines: LINES },
]);
/** Another repo: the scout's own worktree, where its session started. */
const otherWorktree = () => miniRepo([{ id: 'w', at: '2026-10-09T08:00:00Z', path: 'notes.md', lines: ['The scout works here.'] }]).dir;
/** A session inside the target repo that logs no edit: stands in for the probe's headless `claude -p` runs, so the commit is covered. */
const idle = (cwd: string): Row[] => { const s = session(IDLE, cwd); return [s.user('i1', at('09:00:00')), s.user('i2', at('10:30:00'))]; };

/** One Bash call. `cwdInRepo`: Claude Code's shell kept an earlier `cd`, so this and later records log the repo as their cwd (probed). */
interface Call { command: (repo: string) => string; cwdInRepo?: boolean; stdoutSha?: boolean }

/**
 * Scans the target repo with the idle session plus a scout session started in another worktree.
 * The last call runs across the commit (09:59:50 → 10:00:02); earlier calls run at 09:5<i>.
 * `writes`: the scout also Writes a file in the repo, which makes it a "foreign" session.
 */
async function scoutScan(calls: Call[], writes = false) {
  const repo = targetRepo();
  const home = otherWorktree();
  const s = session(SCOUT, home);
  const inRepo = session(SCOUT, repo.dir);
  const rows: Row[] = [s.user('u1', at('09:00:00'))];
  if (writes) {
    const f = join(repo.dir, 'docs/foreign.md');
    rows.push(s.call('w1', at('09:20:00'), 'Write', { file_path: f }), s.result('w2', 'w1', at('09:20:01'), createResult(f, ['Foreign session notes.'])));
  }
  let moved = false;
  calls.forEach((c, i) => {
    const last = i === calls.length - 1;
    moved ||= c.cwdInRepo === true;
    const rec = moved ? inRepo : s;
    const stdout = last && c.stdoutSha ? `[main ${repo.sha['target']!.slice(0, 7)}] test: target\n 1 file changed, 2 insertions(+)\n` : '';
    rows.push(rec.call(`c${i}`, last ? at('09:59:50') : at(`09:5${i}:00`), 'Bash', { command: c.command(repo.dir) }),
      rec.result(`r${i}`, `c${i}`, last ? at('10:00:02') : at(`09:5${i}:01`), { stdout, stderr: '', interrupted: false, isImage: false }));
  });
  rows.push((moved ? inRepo : s).user('u9', at('10:30:00')));
  const { attr, logs } = await scanMini(repo, miniClaude({ [IDLE]: idle(repo.dir), [SCOUT]: rows }));
  return { target: attr('target'), logs, repo };
}

describe('repro Bug A preconditions (pass before and after the fix)', () => {
  it('control: without the scout session the target commit is human, so the setup can produce human', async () => {
    const repo: MiniRepo = targetRepo();
    const { attr } = await scanMini(repo, miniClaude({ [IDLE]: idle(repo.dir) }));
    expect(attr('target')).toMatchObject({ class: 'human', agentLineShareMilli: 0 });
  });

  it('control: once the scout also Writes into the repo (foreign), `cd "$R" && git commit` is already unknown', async () => {
    // So `$R` itself is handled (resolveDir → null → conservative); the bug is upstream of it.
    const { target } = await scoutScan([{ command: (d) => `R=${d}; cd "$R" && git commit -q -m x` }], true);
    expect(target).toMatchObject({ class: 'unknown', evidence: [{ kind: 'agent_ran_commit', detail: 'git_command' }] });
  });
});

describe('repro Bug A1: an outside session that commits here without an Edit/Write here is ignored', () => {
  // discoverClaude places the scout's transcript 'other' (cwd in another repo); searchOutside()
  // adopts it only when editsRepo() finds an allowlisted edit path under a root, so its git
  // calls are never parsed and the commit's window never marks the target.
  const variants: [string, Call[]][] = [
    ['cd "$R" && git commit', [{ command: (d) => `R=${d}; cd "$R" && git commit -q -m x` }]],
    ['cd $R && git commit', [{ command: (d) => `R=${d}; cd $R && git commit -q -m x` }]],
    ['cd "${R}" && git commit', [{ command: (d) => `R=${d}; cd "\${R}" && git commit -q -m x` }]],
    ['git -C "$R" commit', [{ command: (d) => `R=${d}; git -C "$R" commit -q -m x` }]],
    ['newline separators', [{ command: (d) => `R=${d}\ncd "$R"\ngit commit -q -m x` }]],
    ['; separators', [{ command: (d) => `R=${d}; cd "$R"; git commit -q -m x` }]],
    ['R exported in an earlier Bash call', [{ command: (d) => `export R=${d}` }, { command: () => 'cd "$R" && git commit -q -m x' }]],
    ['cd in an earlier Bash call (the shell keeps it)', [{ command: (d) => `cd ${d}`, cwdInRepo: true }, { command: () => 'git commit -q -m x' }]],
    ['a literal path, no variable at all', [{ command: (d) => `cd ${d} && git commit -q -m x` }]],
    ['stdout names the commit SHA', [{ command: (d) => `R=${d}; cd "$R" && git commit -m x`, stdoutSha: true }]],
  ];
  for (const [name, calls] of variants) {
    repro(`${name}: the commit the scout ran is never human`, async () => {
      expect((await scoutScan(calls)).target.class).not.toBe('human');
    });
  }
});

describe('repro Bug A2: a foreign session\'s cd persists across Bash calls', () => {
  repro('`cd <repo>` in one call, `git commit` in the next: never human', async () => {
    // gitTargetsRepo() resolves against the transcript's first cwd (t.cwd), not the call record's cwd.
    const { target } = await scoutScan([{ command: (d) => `cd ${d}`, cwdInRepo: true }, { command: () => 'git commit -q -m x' }], true);
    expect(target.class).not.toBe('human');
  });
});

describe('repro Bug A3: cd forms the segment walk misreads (foreign session)', () => {
  // CD_AT_START takes the first word after `cd` as the directory and needs `cd` at a segment's start.
  const forms: [string, (d: string) => string][] = [
    ['cd -P <repo>', (d) => `cd -P ${d} && git commit -q -m x`],
    ['cd -- <repo>', (d) => `cd -- ${d} && git commit -q -m x`],
    ['if …; then cd <repo>; git commit; fi', (d) => `if true; then cd ${d}; git commit -q -m x; fi`],
    ['command cd <repo>', (d) => `command cd ${d} && git commit -q -m x`],
  ];
  for (const [name, command] of forms) {
    repro(`${name}: never human`, async () => {
      expect((await scoutScan([{ command }], true)).target.class).not.toBe('human');
    });
  }
});

describe('repro same class: commits an in-repo session makes without a recognisable `git commit`', () => {
  // GIT_COMMIT_CMD only knows literal git subcommands; with -q (or no SHA in stdout) nothing marks the commit.
  for (const command of ['git ci -q -m x', 'git -c alias.save=commit save -q -m x', './scripts/commit.sh', 'npm version patch']) {
    repro(`\`${command}\` run by an agent across the commit: never human`, async () => {
      const repo = targetRepo();
      const s = session(AGENT, repo.dir);
      const { attr } = await scanMini(repo, miniClaude({ [AGENT]: [s.user('u1', at('09:00:00')), s.call('c1', at('09:59:50'), 'Bash', { command }),
        s.result('r1', 'c1', at('10:00:02'), { stdout: '', stderr: '', interrupted: false, isImage: false }), s.user('u9', at('10:30:00'))] }));
      expect(attr('target').class).not.toBe('human');
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Bug B: a NUL inside patch text splits addedLines' NUL-framed records.
// ---------------------------------------------------------------------------------------------

type Files = Record<string, string[]>;
/** A root commit, then one self-authored commit of `files` at 10:00; `attrs` seeds .gitattributes. */
function nulRepo(files: Files, attrs?: string): MiniRepo {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'commet-nul-')));
  const git = (args: string[], env: Record<string, string> = {}) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } }).trim();
  git(['init', '-q', '-b', 'main']);
  for (const [k, v] of [['user.name', SELF.name], ['user.email', SELF.email], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) git(['config', k!, v!]);
  if (attrs !== undefined) writeFileSync(join(dir, '.gitattributes'), attrs);
  const sha: Record<string, string> = {};
  const commits: [string, string, Files][] = [['root', '2026-10-10T08:00:00Z', { 'README.md': ['# NUL fixture', 'A root commit before the logs.'] }],
    ['target', '2026-10-10T10:00:00Z', files]];
  for (const [id, when, fs] of commits) {
    for (const [p, lines] of Object.entries(fs)) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), lines.join('\n') + '\n');
    }
    git(['add', '-A']);
    git(['commit', '-q', '-m', `test: ${id}`], { GIT_AUTHOR_NAME: SELF.name, GIT_AUTHOR_EMAIL: SELF.email, GIT_AUTHOR_DATE: when,
      GIT_COMMITTER_NAME: SELF.name, GIT_COMMITTER_EMAIL: SELF.email, GIT_COMMITTER_DATE: when });
    sha[id] = git(['rev-parse', 'HEAD']);
  }
  return { dir, sha };
}

/** 30 agent-written code lines, in a file that sorts after the data file. */
const CODE = Array.from({ length: 30 }, (_, i) => `export const agentWrittenValue${i} = ${i} * 4101;`);
/** One text line whose NUL sits past byte 8000, beyond git's binary sniff (8000 bytes). */
const LATE_NUL = `${'x'.repeat(8100)}\0tail of the generated record`;

/** The agent Writes every listed file of the target commit before 10:00; the human commits. Returns the target's attribution. */
async function agentWrote(repo: MiniRepo, files: Files, written: string[]) {
  const s = session(AGENT, repo.dir);
  const rows: Row[] = [s.user('u1', at('09:00:00'))];
  written.forEach((p, i) => rows.push(s.call(`a${i}`, at(`09:3${i}:00`), 'Write', { file_path: join(repo.dir, p) }),
    s.result(`r${i}`, `a${i}`, at(`09:3${i}:01`), createResult(join(repo.dir, p), files[p]!))));
  rows.push(s.user('u9', at('10:30:00')));
  return (await scanMini(repo, miniClaude({ [AGENT]: rows }))).attr('target');
}

/** NULs in `git log -p -U0 --format=%x00%H` for one commit: 1 is the record frame. */
const nulsInPatch = (repo: MiniRepo, id: string) =>
  execFileSync('git', ['log', '-p', '-U0', '--no-ext-diff', '--no-textconv', '--format=%x00%H', '-1', repo.sha[id]!], { cwd: repo.dir })
    .filter((b) => b === 0).length;

describe('repro Bug B preconditions (pass before and after the fix)', () => {
  it('git prints a NUL inside the patch text for a late NUL and for a .gitattributes `diff` file', () => {
    expect(nulsInPatch(nulRepo({ 'data/records.txt': [LATE_NUL] }), 'target')).toBe(2);
    expect(nulsInPatch(nulRepo({ 'data/a.dat': ['record header text\0tail'] }, '*.dat diff\n'), 'target')).toBe(2);
    // Without the attribute the same early NUL makes git print "Binary files differ": no NUL in the patch.
    expect(nulsInPatch(nulRepo({ 'data/a.dat': ['record header text\0tail'] }), 'target')).toBe(1);
  });

  it('control: the same commit without the NUL is agent at 1000‰', async () => {
    const files = { 'data/records.txt': [LATE_NUL.replace('\0', ' ')], 'src/z.ts': CODE };
    expect(await agentWrote(nulRepo(files), files, ['data/records.txt', 'src/z.ts'])).toMatchObject({ class: 'agent', agentLineShareMilli: 1000 });
  });
});

describe('repro Bug B: a NUL inside patch text', () => {
  repro('addedLines keys only real commits, and the target keeps every added line', async () => {
    const repo = nulRepo({ 'data/records.txt': [LATE_NUL], 'src/z.ts': CODE });
    const patches = await addedLines(gitRunner(repo.dir), repo.sha['target']!, '2026-01-01T00:00:00Z');
    expect([...patches.keys()].sort()).toEqual([repo.sha['root'], repo.sha['target']].sort());
    expect(patches.get(repo.sha['target']!)?.get('src/z.ts')).toHaveLength(30);
  });

  repro('a late NUL (past byte 8000) in an all-agent commit: agent, never human', async () => {
    const files = { 'data/records.txt': [LATE_NUL], 'src/z.ts': CODE };
    // Observed: human at 0‰. Only the truncated NUL line is counted; src/z.ts lands under a bogus key.
    expect(await agentWrote(nulRepo(files), files, ['data/records.txt', 'src/z.ts'])).toMatchObject({ class: 'agent', agentLineShareMilli: 1000 });
  });

  repro('a late NUL right before a newline (empty bogus record, silently skipped): agent, never human', async () => {
    const files = { 'data/records.txt': [`${'x'.repeat(8100)}\0`, 'second line of the generated record'], 'src/z.ts': CODE };
    expect(await agentWrote(nulRepo(files), files, ['data/records.txt', 'src/z.ts'])).toMatchObject({ class: 'agent', agentLineShareMilli: 1000 });
  });

  repro('a file forced to text by a .gitattributes `diff` attribute, NUL early: agent, never human', async () => {
    const files = { 'data/a.dat': ['record header text\0tail of the record'], 'src/z.ts': CODE };
    expect(await agentWrote(nulRepo(files, '*.dat diff\n'), files, ['data/a.dat', 'src/z.ts'])).toMatchObject({ class: 'agent', agentLineShareMilli: 1000 });
  });

  repro('97% agent-written plus one human changelog line: agent, never human', async () => {
    const files = { 'CHANGELOG.md': ['- Human wrote this changelog entry.'], 'data/records.txt': [LATE_NUL, 'second line of the generated record'], 'src/z.ts': CODE };
    // 32 of 33 lines are agent-written (969‰). Observed: human at 0‰ (2 counted lines, none matched).
    expect((await agentWrote(nulRepo(files), files, ['data/records.txt', 'src/z.ts'])).class).toBe('agent');
  });
});
