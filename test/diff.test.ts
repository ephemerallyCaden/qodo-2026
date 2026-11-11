// #75: one file's diff between two commits (src/scan/diff.ts). The parsers on crafted output, then
// fileDiff on a real repo: hostile file names, a literal pathspec, a followed rename, binary, cut-off.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DIFF_LIMITS } from '../src/core/contract/api.js';
import { cutAt, fileDiff, firstParent, parsePatch, parseRaw } from '../src/scan/diff.js';
import { gitRunner } from '../src/scan/git.js';
import { EMPTY_TREE } from '../src/scan/repo.js';

/** U+0001, a newline and a tab: the bytes that broke git-output framing before (AGENTS.md Rule 7). */
const HOSTILE = `odd${String.fromCharCode(1)}name\nwith\ttab.ts`;
const Z = '0'.repeat(40);
const ONE = '1'.repeat(40);

describe('parseRaw (NUL-framed, by position)', () => {
  it('reads statuses and paths, a rename\'s two paths, and a hostile name whole', () => {
    const out = [
      `:100644 100644 ${ONE} ${Z} M`, HOSTILE,
      `:000000 100644 ${Z} ${ONE} A`, 'b.ts',
      `:100644 100644 ${ONE} ${ONE} R100`, `from ${HOSTILE}`, 'to.ts',
      `:100644 100755 ${ONE} ${ONE} M`, 'mode.sh',
      `:100644 000000 ${ONE} ${Z} D`, 'gone.ts', '',
    ].join('\0');
    expect(parseRaw(out)).toEqual([
      { status: 'modified', path: HOSTILE, oldPath: null },
      { status: 'added', path: 'b.ts', oldPath: null },
      { status: 'renamed', path: 'to.ts', oldPath: `from ${HOSTILE}` },
      { status: 'mode', path: 'mode.sh', oldPath: null },
      { status: 'deleted', path: 'gone.ts', oldPath: null },
    ]);
    expect(parseRaw('')).toEqual([]);
  });

  it('refuses a cut-off record, a missing path and an unknown status, never half-reads', () => {
    expect(() => parseRaw(`:100644 100644 ${ONE} ${Z} M\0a.ts`)).toThrow(/cut off/);
    expect(() => parseRaw(`:100644 100644 ${ONE} ${Z} R100\0a.ts\0`)).toThrow(/without its path/);
    expect(() => parseRaw(`:100644 100644 ${ONE} ${Z} X\0a.ts\0`)).toThrow(/unexpected/);
    expect(() => parseRaw(`a.ts\0`)).toThrow(/unexpected/);
  });
});

describe('parsePatch (by hunk counts)', () => {
  it('tells content from headers by the counts alone, and keeps "\\ No newline" with its hunk', () => {
    const text = [
      'diff --git a/x b/x', 'index 1..2 100644', '--- a/x', '+++ b/x',
      '@@ -1,2 +1,3 @@ fn()', ' kept', '-diff --git a/fake b/fake', '+@@ -9 +9 @@', '+diff --git a/y b/y', '\\ No newline at end of file',
      'diff --git a/bin b/bin', 'Binary files a/bin and b/bin differ',
      'diff --git a/m b/m', 'old mode 100644', 'new mode 100755', '',
    ].join('\n');
    expect(parsePatch(text)).toEqual([
      { binary: false, hunks: [{ header: '@@ -1,2 +1,3 @@ fn()', lines: [' kept', '-diff --git a/fake b/fake', '+@@ -9 +9 @@', '+diff --git a/y b/y', '\\ No newline at end of file'] }] },
      { binary: true, hunks: [] },
      { binary: false, hunks: [] },
    ]);
  });

  it('a count without a comma is one line; text cut mid-hunk ends that hunk', () => {
    expect(parsePatch('diff --git a/x b/x\n@@ -1 +1 @@\n-a\n+b\n')[0]!.hunks[0]!.lines).toEqual(['-a', '+b']);
    expect(parsePatch('diff --git a/x b/x\n@@ -1,5 +1,5 @@\n a\n')[0]!.hunks[0]!.lines).toEqual([' a']);
    expect(() => parsePatch('@@ -1 +1 @@\n')).toThrow(/before its first header/);
    expect(() => parsePatch('diff --git a/x b/x\n@@ -1,2 +1,2 @@\nbad\n')).toThrow(/inside a hunk/);
  });

  it('cutAt keeps whole lines within both limits', () => {
    expect(cutAt('a\nb\n')).toBeNull();
    const many = 'x\n'.repeat(DIFF_LIMITS.lines + 5);
    expect(cutAt(many)).toBe(DIFF_LIMITS.lines * 2);
    const wide = `${'y'.repeat(DIFF_LIMITS.chars - 10)}\n${'z'.repeat(20)}\n`;
    expect(cutAt(wide)).toBe(DIFF_LIMITS.chars - 9);
    expect(cutAt('w'.repeat(DIFF_LIMITS.chars + 1))).toBe(0);
  });
});

describe('fileDiff on a real repo', () => {
  let dir = '';
  const sha: string[] = [];
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  const write = (path: string, text: string | Buffer) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  const commit = () => {
    git('add', '-A');
    git('commit', '-q', '-m', `c${sha.length}`);
    sha.push(git('rev-parse', 'HEAD'));
  };
  const runner = () => gitRunner(dir);

  beforeAll(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'commet-diff-')));
    git('init', '-q', '-b', 'main');
    for (const [k, v] of [['user.name', 'T'], ['user.email', 't@example.com'], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) git('config', k!, v!);
    write('src/a.ts', 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n');
    write('*.ts', 'star\n');
    write('src/other.ts', 'other\n');
    write(HOSTILE, 'hostile\n');
    write('img.bin', Buffer.from([0, 1, 2, 3, 0, 255]));
    write('big.txt', 'line\n'.repeat(10));
    commit(); // 0
    write('src/a.ts', 'one\ntwo\nthree\nFOUR\nfive\nsix\nseven\neight\n');
    write('src/other.ts', 'other changed\n');
    write('*.ts', 'star changed\n');
    write(HOSTILE, 'hostile changed\n');
    write('img.bin', Buffer.from([0, 9, 9, 9, 0, 255]));
    write('big.txt', 'line\n'.repeat(DIFF_LIMITS.lines + 100));
    commit(); // 1
    mkdirSync(join(dir, 'lib'));
    git('mv', 'src/a.ts', 'lib/a.ts');
    write('lib/a.ts', 'one\ntwo\nthree\nFOUR\nfive\nsix\nseven\nEIGHT');
    commit(); // 2
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('a file named like a glob means only itself (--literal-pathspecs)', async () => {
    const d = await fileDiff(runner(), sha[0]!, sha[1]!, ['*.ts']);
    expect(d.sections.map((s) => s.path)).toEqual(['*.ts']);
    expect(d.sections[0]!.hunks[0]!.lines).toEqual(['-star', '+star changed']);
    // Pathspec magic is a literal name too: nothing is named this, so nothing matches.
    expect((await fileDiff(runner(), sha[0]!, sha[1]!, [':(glob)**'])).sections).toEqual([]);
  });

  it('reads a hostile name whole', async () => {
    const d = await fileDiff(runner(), sha[0]!, sha[1]!, [HOSTILE]);
    expect(d.sections).toEqual([{ status: 'modified', path: HOSTILE, oldPath: null, binary: false,
      hunks: [{ header: '@@ -1 +1 @@', lines: ['-hostile', '+hostile changed'] }] }]);
  });

  it('follows a rename with its old path, and marks the missing final newline', async () => {
    const d = await fileDiff(runner(), sha[1]!, sha[2]!, ['lib/a.ts', 'src/a.ts']);
    expect(d.sections).toHaveLength(1);
    expect(d.sections[0]).toMatchObject({ status: 'renamed', path: 'lib/a.ts', oldPath: 'src/a.ts', binary: false });
    expect(d.sections[0]!.hunks[0]!.lines.slice(-3)).toEqual(['-eight', '+EIGHT', '\\ No newline at end of file']);
    // Without the old path git sees an added file: the whole file, never less.
    const whole = await fileDiff(runner(), sha[1]!, sha[2]!, ['lib/a.ts']);
    expect(whole.sections[0]).toMatchObject({ status: 'added', path: 'lib/a.ts' });
    expect(whole.shownLines).toBe(9);
  });

  it('shows a binary change as binary, without content', async () => {
    const d = await fileDiff(runner(), sha[0]!, sha[1]!, ['img.bin']);
    expect(d.sections).toEqual([{ status: 'modified', path: 'img.bin', oldPath: null, binary: true, hunks: [] }]);
  });

  it('diffs from the empty tree below a root commit', async () => {
    expect(await firstParent(runner(), sha[0]!)).toBeNull();
    expect(await firstParent(runner(), sha[1]!)).toBe(sha[0]);
    const d = await fileDiff(runner(), EMPTY_TREE['sha1']!, sha[0]!, ['src/a.ts']);
    expect(d.sections[0]).toMatchObject({ status: 'added', path: 'src/a.ts' });
    expect(d.shownLines).toBe(8);
  });

  it('cuts a diff past the limits at a whole line, and says so', async () => {
    const d = await fileDiff(runner(), sha[0]!, sha[1]!, ['big.txt']);
    expect(d.truncated).toBe(true);
    expect(d.shownLines).toBeLessThanOrEqual(DIFF_LIMITS.lines);
    expect(d.shownLines).toBeGreaterThan(DIFF_LIMITS.lines - 10);
    expect(d.sections[0]!.hunks[0]!.lines.every((l) => l === '+line' || l === ' line')).toBe(true);
    expect((await fileDiff(runner(), sha[0]!, sha[1]!, ['src/other.ts'])).truncated).toBe(false);
  });

  it('refuses anything but full hex revisions and real paths, and stops on abort', async () => {
    for (const rev of ['--output=/tmp/x', 'HEAD', '-p', `${sha[0]!}^`]) {
      await expect(fileDiff(runner(), rev, sha[1]!, ['src/other.ts'])).rejects.toThrow(/full object id/);
      await expect(fileDiff(runner(), sha[0]!, rev, ['src/other.ts'])).rejects.toThrow(/full object id/);
    }
    await expect(fileDiff(runner(), sha[0]!, sha[1]!, [])).rejects.toThrow(/no path/);
    // A path that looks like an option is still a path: it comes after `--`.
    expect((await fileDiff(runner(), sha[0]!, sha[1]!, ['--output=/tmp/commet-pwned'])).sections).toEqual([]);
    const abort = new AbortController();
    abort.abort(new Error('stop'));
    await expect(fileDiff(runner(), sha[0]!, sha[1]!, ['big.txt'], abort.signal)).rejects.toThrow('stop');
  });

  it('a failing git says so without its arguments', async () => {
    const e = await fileDiff(runner(), 'f'.repeat(40), sha[1]!, ['src/other.ts']).then(() => new Error('resolved'), (x: unknown) => x as Error);
    expect(e.message).toMatch(/^git couldn't produce the diff/);
    expect(e.message).not.toContain('src/other.ts');
    expect(JSON.stringify(e)).not.toContain('src/other.ts');
  });
});
