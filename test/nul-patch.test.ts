// #38: a NUL inside patch text must never make an agent-written commit human (AGENTS.md Rule 1),
// and no added line is lost without a count. Patch text is read line by line, and the `@@` hunk
// counts tell content from headers (Rule 7).
//
// The "repro Bug B" blocks and their helpers are ported from debug/false-human
// (test/repro-false-human.test.ts, 96125f1), where they ran as `it.fails`: each failed on its
// assertion (class human, lines lost), not on a broken fixture. They now run as plain `it`. The
// preconditions pass before and after the fix, so a broken fixture can never make a repro pass
// vacuously. The Bug A and "same class" blocks stay on that branch, for #39 and #42.
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchCommits } from '../src/attrib/match.js';
import type { CommitAttribution } from '../src/core/snapshot/types.js';
import { formatSummary, type LogCounts } from '../src/core/summary.js';
import { gitRunner, type Git } from '../src/scan/git.js';
import { scan } from '../src/scan/index.js';
import { addedLines } from '../src/scan/repo.js';
import { SELF } from './fixtures/build/basic.js';
import { createResult, miniClaude, miniRepo, scanMini, session, type MiniRepo, type Row } from './fixtures/mini.js';

const AGENT = '78787878-7878-4787-8787-787878787878';
const IDLE = '34343434-3434-4343-8343-343434343434';
const at = (hhmmss: string) => `2026-10-10T${hhmmss}.000Z`;
const SINCE = '2026-01-01T00:00:00Z';
const KEY = () => new Uint8Array(32).fill(7);

type Files = Record<string, string[]>;
/** One commit: its id, its date, and the files it writes (a function may read earlier SHAs, or change the tree itself). */
type Step = [id: string, when: string, files: Files | ((dir: string, sha: Record<string, string>) => Files)];

/** Self-authored commits, in order, at fixed dates; `attrs` seeds .gitattributes. */
function gitRepo(steps: Step[], attrs?: string): MiniRepo {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'commet-nul-')));
  const git = (args: string[], env: Record<string, string> = {}) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } }).trim();
  git(['init', '-q', '-b', 'main']);
  for (const [k, v] of [['user.name', SELF.name], ['user.email', SELF.email], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) git(['config', k!, v!]);
  if (attrs !== undefined) writeFileSync(join(dir, '.gitattributes'), attrs);
  const sha: Record<string, string> = {};
  for (const [id, when, files] of steps) {
    for (const [p, lines] of Object.entries(typeof files === 'function' ? files(dir, sha) : files)) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), lines.join('\n') + '\n');
    }
    git(['add', '-A']);
    git(['commit', '-q', '--allow-empty', '-m', `test: ${id}`], { GIT_AUTHOR_NAME: SELF.name, GIT_AUTHOR_EMAIL: SELF.email, GIT_AUTHOR_DATE: when,
      GIT_COMMITTER_NAME: SELF.name, GIT_COMMITTER_EMAIL: SELF.email, GIT_COMMITTER_DATE: when });
    sha[id] = git(['rev-parse', 'HEAD']);
  }
  return { dir, sha };
}

const ROOT: Files = { 'README.md': ['# NUL fixture', 'A root commit before the logs.'] };
/** A root commit, then one self-authored commit of `files` at 10:00; `attrs` seeds .gitattributes. */
const nulRepo = (files: Files | ((sha: Record<string, string>) => Files), attrs?: string): MiniRepo =>
  gitRepo([['root', '2026-10-10T08:00:00Z', ROOT], ['target', '2026-10-10T10:00:00Z', typeof files === 'function' ? (_, sha) => files(sha) : files]], attrs);

/** 30 agent-written code lines, in a file that sorts after the data file. */
const CODE = Array.from({ length: 30 }, (_, i) => `export const agentWrittenValue${i} = ${i} * 4101;`);
/** One text line whose NUL sits past byte 8000, beyond git's binary sniff (8000 bytes). */
const LATE_NUL = `${'x'.repeat(8100)}\0tail of the generated record`;

/** Transcripts in which the agent Writes every listed file of the target commit before 10:00; the human commits. */
function agentLog(repo: MiniRepo, files: Files, written: string[]): string {
  const s = session(AGENT, repo.dir);
  const rows: Row[] = [s.user('u1', at('09:00:00'))];
  written.forEach((p, i) => rows.push(s.call(`a${i}`, at(`09:3${i}:00`), 'Write', { file_path: join(repo.dir, p) }),
    s.result(`r${i}`, `a${i}`, at(`09:3${i}:01`), createResult(join(repo.dir, p), files[p]!))));
  rows.push(s.user('u9', at('10:30:00')));
  return miniClaude({ [AGENT]: rows });
}

/** The target's attribution when the agent wrote `written` (see agentLog). */
async function agentWrote(repo: MiniRepo, files: Files, written: string[]): Promise<CommitAttribution> {
  return (await scanMini(repo, agentLog(repo, files, written))).attr('target');
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
  it('addedLines keys only real commits, and the target keeps every added line', async () => {
    const repo = nulRepo({ 'data/records.txt': [LATE_NUL], 'src/z.ts': CODE });
    const patches = await addedLines(gitRunner(repo.dir), repo.sha['target']!, SINCE);
    expect([...patches.keys()].sort()).toEqual([repo.sha['root'], repo.sha['target']].sort());
    expect(patches.get(repo.sha['target']!)?.get('src/z.ts')).toHaveLength(30);
  });

  it('a late NUL (past byte 8000) in an all-agent commit: agent, never human', async () => {
    const files = { 'data/records.txt': [LATE_NUL], 'src/z.ts': CODE };
    // Observed before the fix: human at 0‰. Only the truncated NUL line was counted; src/z.ts landed under a bogus key.
    expect(await agentWrote(nulRepo(files), files, ['data/records.txt', 'src/z.ts'])).toMatchObject({ class: 'agent', agentLineShareMilli: 1000 });
  });

  it('a late NUL right before a newline (empty bogus record, silently skipped): agent, never human', async () => {
    const files = { 'data/records.txt': [`${'x'.repeat(8100)}\0`, 'second line of the generated record'], 'src/z.ts': CODE };
    expect(await agentWrote(nulRepo(files), files, ['data/records.txt', 'src/z.ts'])).toMatchObject({ class: 'agent', agentLineShareMilli: 1000 });
  });

  it('a file forced to text by a .gitattributes `diff` attribute, NUL early: agent, never human', async () => {
    const files = { 'data/a.dat': ['record header text\0tail of the record'], 'src/z.ts': CODE };
    expect(await agentWrote(nulRepo(files, '*.dat diff\n'), files, ['data/a.dat', 'src/z.ts'])).toMatchObject({ class: 'agent', agentLineShareMilli: 1000 });
  });

  it('97% agent-written plus one human changelog line: agent, never human', async () => {
    const files = { 'CHANGELOG.md': ['- Human wrote this changelog entry.'], 'data/records.txt': [LATE_NUL, 'second line of the generated record'], 'src/z.ts': CODE };
    // 32 of 33 lines are agent-written (969‰). Observed before the fix: human at 0‰ (2 counted lines, none matched).
    expect((await agentWrote(nulRepo(files), files, ['data/records.txt', 'src/z.ts'])).class).toBe('agent');
  });
});

describe('#38: addedLines keys only real commits and keeps each path\'s exact added lines (real git)', () => {
  /** A path holding U+0001, a newline and a tab (Rule 7's filename test). */
  const ODD = 'src/a\u0001b\nc\td.ts';
  const cases: [string, (sha: Record<string, string>) => Files, string?][] = [
    ['a NUL-bearing file first in its commit', () => ({ 'a/first.txt': [LATE_NUL, 'after the NUL'], 'src/z.ts': CODE })],
    ['a NUL-bearing file last in its commit', () => ({ 'src/a.ts': CODE, 'zz/last.txt': ['before the NUL', LATE_NUL] })],
    ['several NUL lines across two files of one commit, one under a `diff` attribute, beside U+0001', () => ({
      'data/one.txt': ['x'.repeat(8100), 'mid\0line', '\0leading', 'trailing\0', 'two\0\0nuls', 'ctl\u0001\0mix'],
      'data/two.dat': ['early\0nul', 'again\0', '\0'],
      'src/z.ts': CODE,
    }), '*.dat diff\n'],
    ['a NUL followed by an older commit\'s SHA, then `+++ b/…`, `@@` and `diff --git` look-alikes', (sha) => ({
      'data/fake.txt': [`${'x'.repeat(8100)}\0${sha['root']!}`, '++ b/fake.ts', '@@ -0,0 +1,2 @@', 'diff --git a/fake.ts b/fake.ts',
        `\0${sha['root']!}`, '-- a/fake.ts', '+ b/fake.ts'],
      'src/z.ts': CODE,
    })],
    ['a path holding U+0001, a newline and a tab, after a NUL-bearing file in the same commit', () => ({ 'data/records.txt': [LATE_NUL], [ODD]: CODE })],
  ];
  for (const [name, files, attrs] of cases) {
    it(name, async () => {
      const repo = nulRepo(files, attrs);
      const patches = await addedLines(gitRunner(repo.dir), repo.sha['target']!, SINCE);
      expect([...patches.keys()].sort()).toEqual([repo.sha['root'], repo.sha['target']].sort());
      expect(Object.fromEntries(patches.get(repo.sha['target']!)!)).toEqual(files(repo.sha));
      expect(Object.fromEntries(patches.get(repo.sha['root']!)!)).toEqual(attrs === undefined ? ROOT : { '.gitattributes': [attrs.trimEnd()], ...ROOT });
      expect(patches.incomplete).toEqual(new Set());
    });
  }

  it('a NUL in a removed (-) line', async () => {
    const repo = gitRepo([['root', '2026-10-10T08:00:00Z', { ...ROOT, 'data/records.txt': [LATE_NUL, 'kept line'] }],
      ['target', '2026-10-10T10:00:00Z', { 'data/records.txt': ['replacement line', 'kept line'], 'src/z.ts': CODE }]]);
    // From 09:00 the log holds only the target, so its NUL is in a removed line alone.
    const patches = await addedLines(gitRunner(repo.dir), repo.sha['target']!, '2026-10-10T09:00:00Z');
    expect([...patches.keys()]).toEqual([repo.sha['target']]);
    expect(Object.fromEntries(patches.get(repo.sha['target']!)!)).toEqual({ 'data/records.txt': ['replacement line'], 'src/z.ts': CODE });
    expect(patches.incomplete).toEqual(new Set());
  });

  it('reads real git output completely: no-newline markers, deletions, renames, binaries, mode changes, empty commits', async () => {
    const tenLines = Array.from({ length: 10 }, (_, i) => `export const renamedValue${i} = ${i};`);
    const repo = gitRepo([
      ['one', '2026-10-10T08:00:00Z', (dir) => {
        writeFileSync(join(dir, 'keep.txt'), 'a\nb');
        writeFileSync(join(dir, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 1, 2]));
        return { 'gone.txt': ['bye'], 'old.ts': tenLines, 'run.sh': ['echo hi'] };
      }],
      ['two', '2026-10-10T09:00:00Z', (dir) => {
        writeFileSync(join(dir, 'keep.txt'), 'a\nc');
        writeFileSync(join(dir, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 3, 4]));
        rmSync(join(dir, 'gone.txt'));
        renameSync(join(dir, 'old.ts'), join(dir, 'new.ts'));
        chmodSync(join(dir, 'run.sh'), 0o755);
        return { 'new.ts': tenLines.map((l, i) => (i === 4 ? 'export const changedValue = 4;' : l)) };
      }],
      ['empty', '2026-10-10T10:00:00Z', {}],
    ]);
    const patches = await addedLines(gitRunner(repo.dir), repo.sha['empty']!, SINCE);
    expect([...patches.keys()]).toEqual([repo.sha['empty'], repo.sha['two'], repo.sha['one']]);
    expect(patches.get(repo.sha['empty']!)).toEqual(new Map());
    expect(Object.fromEntries(patches.get(repo.sha['two']!)!)).toEqual({ 'keep.txt': ['c'], 'new.ts': ['export const changedValue = 4;'] });
    expect(Object.fromEntries(patches.get(repo.sha['one']!)!)).toEqual({ 'gone.txt': ['bye'], 'keep.txt': ['a', 'b'], 'old.ts': tenLines, 'run.sh': ['echo hi'] });
    expect(patches.incomplete).toEqual(new Set());
  });
});

// Canned `git log -p -U0 --format=%x00%H` output, newest record first.
const [A, B] = ['a'.repeat(40), 'b'.repeat(40)];
const WINDOW = new Set([A, B]);
const stub = (out: string): Git => async () => out;
/** A record: its header line, the blank line git writes after it, then its lines. */
const record = (sha: string, ...lines: string[]) => `\0${sha}\n\n${lines.map((l) => `${l}\n`).join('')}`;
/** A new file's patch header, then `hunk`. */
const added = (path: string, hunk: string[]) =>
  [`diff --git a/${path} b/${path}`, 'new file mode 100644', 'index 0000000..1111111', '--- /dev/null', `+++ b/${path}`, ...hunk];
const read = (out: string, window: ReadonlySet<string> = WINDOW) => addedLines(stub(out), 'HEAD', SINCE, window);
const OK_B = record(B, ...added('ok.ts', ['@@ -0,0 +1 @@', '+fine']));

describe('#38: a commit whose record can\'t be read completely is never human (stub git)', () => {
  // Each shape is A's record, read after a well-formed B. A keeps the lines that could be read.
  const shapes: [string, string, Files][] = [
    ['a hunk whose counts are not used up when its record ends', record(A, ...added('x.ts', ['@@ -0,0 +1,3 @@', '+a', '+b'])), { 'x.ts': ['a', 'b'] }],
    ['an `@@` line that does not parse', record(A, ...added('x.ts', ['@@ -0,0 +1,two @@', '+a']), ...added('y.ts', ['@@ -0,0 +1 @@', '+y'])),
      { 'x.ts': [], 'y.ts': ['y'] }],
    ['a line inside a hunk that is not +, - or \\', record(A, ...added('x.ts', ['@@ -0,0 +1,2 @@', '+a', ' context', '+b'])), { 'x.ts': ['a'] }],
    ['an empty line inside a hunk', record(A, ...added('x.ts', ['@@ -1 +1,2 @@', '+a', '', '-b', '+c'])), { 'x.ts': ['a'] }],
    ['a + line outside any hunk', record(A, ...added('x.ts', ['@@ -0,0 +1 @@', '+a', '+stray'])), { 'x.ts': ['a'] }],
    ['a - line outside any hunk', record(A, ...added('x.ts', ['@@ -0,0 +1 @@', '+a', '-stray'])), { 'x.ts': ['a'] }],
    ['an added line with no `+++` path', record(A, 'diff --git a/x.ts b/x.ts', '@@ -0,0 +1 @@', '+a'), {}],
    ['a last line cut off before its newline', record(A, ...added('x.ts', ['@@ -0,0 +1 @@', '+a'])).slice(0, -1), { 'x.ts': ['a'] }],
  ];
  /** The class of a self-authored, covered commit with one countable, unmatched line, given the patch log. */
  const cls = (sha: string, incomplete: ReadonlySet<string>) => matchCommits([{ sha, dateMs: 0, isSelf: true, isMerge: false, covered: true,
    partial: false, added: new Map([['x.ts', ['h']]]), ranBy: new Set(), ranByCommand: new Set(), patchIncomplete: incomplete.has(sha) }], [])
    .get(sha)!.attribution.class;
  for (const [name, a, want] of shapes) {
    it(`${name}: incomplete, its readable lines kept, never human`, async () => {
      const patches = await read(OK_B + a);
      expect([...patches.keys()]).toEqual([B, A]);
      expect(Object.fromEntries(patches.get(A)!)).toEqual(want);
      expect(patches.get(B)).toEqual(new Map([['ok.ts', ['fine']]]));
      expect(patches.incomplete).toEqual(new Set([A]));
      expect([cls(B, patches.incomplete), cls(A, patches.incomplete)]).toEqual(['human', 'unknown']);
    });
  }

  it('a NUL-led line while a hunk is open never starts a record: the commit is incomplete, and what follows stays in it', async () => {
    const patches = await read(record(A, ...added('x.ts', ['@@ -0,0 +1,2 @@', '+a']), `\0${B}`, '', ...added('y.ts', ['@@ -0,0 +1 @@', '+y'])));
    expect([...patches.keys()]).toEqual([A]);
    expect(Object.fromEntries(patches.get(A)!)).toEqual({ 'x.ts': ['a'], 'y.ts': ['y'] });
    expect(patches.incomplete).toEqual(new Set([A]));
  });

  it('a `\\ No newline at end of file` marker, inside a hunk or right after it, is read completely', async () => {
    const patches = await read(record(A, 'diff --git a/x.ts b/x.ts', 'index 1111111..2222222 100644', '--- a/x.ts', '+++ b/x.ts', '@@ -1 +1,2 @@',
      '-old', '\\ No newline at end of file', '+new', '+last', '\\ No newline at end of file'));
    expect(Object.fromEntries(patches.get(A)!)).toEqual({ 'x.ts': ['new', 'last'] });
    expect(patches.incomplete).toEqual(new Set());
  });
});

describe('#38: patch log output that can\'t be split into records is refused (stub git)', () => {
  it('refuses a non-empty line before the first header, or a header that is not the full SHA of a window commit', async () => {
    for (const out of [
      `diff --git a/x.ts b/x.ts\n${record(A)}`,
      record('a'.repeat(39)),
      record(A.toUpperCase()),
      record(`${A} `),
      record('c'.repeat(40)),
      OK_B + `\0${'a'.repeat(39)}`,
    ]) await expect(read(out), JSON.stringify(out)).rejects.toThrow(/misframed/);
  });

  it('keeps a complete final header without its newline and the first of a repeated header; skips blank lines before the first', async () => {
    const C = 'c'.repeat(64);
    const patches = await read(`\n${OK_B}${record(B, ...added('again.ts', ['@@ -0,0 +1 @@', '+second']))}\0${C}`, new Set([B, C]));
    expect([...patches.keys()]).toEqual([B, C]);
    expect(patches.get(B)).toEqual(new Map([['ok.ts', ['fine']]]));
    expect(patches.get(C)).toEqual(new Map());
    expect(patches.incomplete).toEqual(new Set());
    // Without a window, any full SHA is a header.
    expect([...(await addedLines(stub(record('d'.repeat(40))), 'HEAD', SINCE)).keys()]).toEqual(['d'.repeat(40)]);
  });
});

describe('#38: the same class with and without the NUL', () => {
  const cases: [string, string, string, string?][] = [
    ['a NUL past byte 8000', 'data/records.txt', LATE_NUL],
    ['a file under a .gitattributes `diff` attribute', 'data/a.dat', 'record header text\0tail of the record', '*.dat diff\n'],
  ];
  for (const [name, path, line, attrs] of cases) {
    it(`${name}: the same class and agentLineShareMilli`, async () => {
      const files = (l: string): Files => ({ 'CHANGELOG.md': ['- Human wrote this changelog entry.'], [path]: [l, 'second line of the generated record'], 'src/z.ts': CODE });
      const of = async (l: string) => {
        const a = await agentWrote(nulRepo(files(l), attrs), files(l), [path, 'src/z.ts']);
        return { class: a.class, agentLineShareMilli: a.agentLineShareMilli };
      };
      const without = await of(line.replace('\0', ' '));
      // A share under 1000‰, so a lost or extra line would move it.
      expect(without.class).toBe('agent');
      expect(without.agentLineShareMilli).toBeLessThan(1000);
      expect(await of(line)).toEqual(without);
    });
  }

  it('two scans of a NUL fixture repo give byte-identical snapshots', async () => {
    const files = { 'data/records.txt': [LATE_NUL, `${'x'.repeat(8100)}\0`], 'data/a.dat': ['early\0nul'], 'src/z.ts': CODE };
    const repo = nulRepo(files, '*.dat diff\n');
    const projects = agentLog(repo, files, ['data/records.txt', 'src/z.ts']);
    const once = () => scan({ repoDir: repo.dir, windowMonths: 24, ingest: true, claudeProjectsDir: projects, keyFor: KEY });
    const [first, second] = [await once(), await once()];
    expect(first.snapshot.commits.find((c) => c.sha === repo.sha['target'])!.attribution.class).toBe('agent');
    expect(second.json).toBe(first.json);
    expect(second.layoutJson).toBe(first.layoutJson);
    expect(first.logs?.incompletePatches).toBe(0);
  });
});

/** Runs `fn` with a git shim first on PATH that replaces `from` with `to` in the `-U0` patch log only. */
async function withPatchShim<T>(from: string, to: string, fn: () => Promise<T>): Promise<T> {
  const shim = mkdtempSync(join(tmpdir(), 'commet-patch-shim-'));
  const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  writeFileSync(join(shim, 'shim.mjs'), [
    "import { spawnSync } from 'node:child_process';",
    'const args = process.argv.slice(2);',
    `const r = spawnSync(${JSON.stringify(realGit)}, args, { stdio: ['inherit', 'pipe', 'inherit'], maxBuffer: 1 << 30 });`,
    `const out = args.includes('-U0') ? Buffer.from(r.stdout.toString('latin1').replace(${JSON.stringify(from)}, ${JSON.stringify(to)}), 'latin1') : r.stdout;`,
    'process.stdout.write(out);',
    'process.exitCode = r.status ?? 1;',
  ].join('\n'));
  writeFileSync(join(shim, 'git'), `#!/bin/sh\nexec '${process.execPath}' '${join(shim, 'shim.mjs')}' "$@"\n`, { mode: 0o755 });
  const path = process.env['PATH'];
  process.env['PATH'] = `${shim}:${path ?? ''}`;
  try {
    return await fn();
  } finally {
    process.env['PATH'] = path;
  }
}

describe('#38: a patch Commet couldn\'t fully read, through scan()', () => {
  it('keeps a self-authored, covered commit out of human, and the log stats and the summary count it', async () => {
    const repo = miniRepo([{ id: 'root', at: '2026-10-10T08:00:00Z', path: 'README.md', lines: ROOT['README.md']! },
      { id: 'target', at: '2026-10-10T10:00:00Z', path: 'src/reviewed.ts', lines: ['export const one = 4101;', 'export const two = 4102;', 'export const three = 4103;'] }]);
    // A session that logs no edit covers the target, so with its patch read completely it is human.
    const s = session(IDLE, repo.dir);
    const projects = miniClaude({ [IDLE]: [s.user('i1', at('09:00:00')), s.user('i2', at('10:30:00'))] });
    const plain = await scanMini(repo, projects);
    expect(plain.attr('target')).toMatchObject({ class: 'human', agentLineShareMilli: 0 });
    expect(plain.logs.incompletePatches).toBe(0);
    expect(formatSummary(plain.snapshot, plain.logs)).not.toContain('couldn\'t fully read');
    // The shim shrinks the target's hunk by one line: two lines are still counted, the third sits outside any hunk.
    const shimmed = await withPatchShim('@@ -0,0 +1,3 @@', '@@ -0,0 +1,2 @@', () => scanMini(repo, projects));
    expect(shimmed.attr('target')).toMatchObject({ class: 'unknown', tier: 'none' });
    expect(shimmed.logs.incompletePatches).toBe(1);
    expect(formatSummary(shimmed.snapshot, shimmed.logs))
      .toContain('1 commit(s) had a patch Commet couldn\'t fully read; they are never classed human\n');
  });

  it('the summary prints the count only when it is above 0', async () => {
    const logs = (incompletePatches: number): LogCounts => ({ tooLarge: 0, unavailable: 0, dropped: 0, unattributed: 0, incompletePatches });
    const { snapshot } = await scanMini(nulRepo({ 'src/z.ts': CODE }), miniClaude({}));
    expect(formatSummary(snapshot, logs(0))).not.toContain('couldn\'t fully read');
    expect(formatSummary(snapshot, logs(3))).toContain('3 commit(s) had a patch Commet couldn\'t fully read; they are never classed human');
  });
});
