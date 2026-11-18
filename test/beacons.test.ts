// Captain's log beacons (#79, R10): the note's text rule, beacons.json's strict shape, and `commet
// beacon` / `commet chart --note` end to end on a real repo: placement on the fog's planet, renames
// followed, deleted files counted as unplaced, replacement, removal, the cap, the lock, and state I/O
// that refuses a symlink or a damaged file and never resets it.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyBeaconAction, beaconTextProblem, beaconViewFrom, cleanBeaconText, emptyBeacons, parseBeaconState, type BeaconState } from '../src/core/beacons.js';
import { BEACON_TEXT_MAX, MAX_BEACONS } from '../src/core/contract/beacons.js';
import { EXIT } from '../src/core/errors.js';
import { fileIdOf } from '../src/core/fog/index.js';
import type { FileId } from '../src/core/snapshot/types.js';
import { BEACONS_FILE, readBeacons, writeBeacon } from '../src/state/beacons.js';
import { openFogSource, readFog } from '../src/state/chart.js';
import { cli } from './fixtures/cli.js';
import { realTempDir } from './fixtures/tmp.js';

const CONTROL = 'the note must be one line of plain text, without control characters';

describe('beaconTextProblem: one plain line of 1 to 120 characters, refused rather than rewritten', () => {
  const rows: [string, unknown, string | null][] = [
    ['plain ASCII', 'parser keeps NUL framing', null],
    ['HTML is just text', '<img src=x onerror=alert(1)>', null],
    ['non-ASCII letters', 'naïve café', null],
    ['an emoji (one code point, two UTF-16 units)', '\u{1F6F0} satellite', null],
    ['an emoji ZWJ sequence', '\u{1F469}\u200d\u{1F680} crew', null],
    ['exactly the limit in code points', '\u{1F6F0}'.repeat(BEACON_TEXT_MAX), null],
    ['one past the limit', 'x'.repeat(BEACON_TEXT_MAX + 1), `the note is longer than ${BEACON_TEXT_MAX} characters`],
    ['empty', '', 'the note is empty'],
    ['only spaces', '   ', 'the note is empty'],
    ['a leading space', ' x', 'the note must not start or end with spaces'],
    ['a trailing no-break space', 'x\u00a0', 'the note must not start or end with spaces'],
    ['a newline', 'a\nb', CONTROL],
    ['a carriage return', 'a\rb', CONTROL],
    ['a tab', 'a\tb', CONTROL],
    ['NUL', 'a\u0000b', CONTROL],
    ['an ANSI escape', '\u001b[2Jcleared', CONTROL],
    ['DEL', 'a\u007fb', CONTROL],
    ['a C1 control (NEL)', 'a\u0085b', CONTROL],
    ['a line separator', 'a\u2028b', CONTROL],
    ['a paragraph separator', 'a\u2029b', CONTROL],
    ['a right-to-left override', 'a\u202eb', CONTROL],
    ['a right-to-left isolate', 'a\u2067b', CONTROL],
    ['a right-to-left mark', 'a\u200fb', CONTROL],
    ['an Arabic letter mark', 'a\u061cb', CONTROL],
    ['a lone surrogate', 'a\ud800b', CONTROL],
    ['not a string', 42, 'the note must be text'],
    ['null', null, 'the note must be text'],
  ];
  for (const [name, text, problem] of rows) it(name, () => expect(beaconTextProblem(text)).toBe(problem));

  it('cleanBeaconText only trims, so a cleaned note either passes or is refused for what it holds', () => {
    expect(cleanBeaconText('  a note \n')).toBe('a note');
    expect(beaconTextProblem(cleanBeaconText(' a\nb '))).toBe(CONTROL);
  });
});

describe('parseBeaconState: strict, and never quotes the file', () => {
  const ok = { schemaVersion: 'beacons.1', beacons: [{ fileId: 'f_0123456789ab', at: 'a'.repeat(40), text: 'x' }] };
  it('reads a valid file', () => {
    expect(parseBeaconState(JSON.stringify(ok))).toEqual(ok);
    expect(parseBeaconState(JSON.stringify(emptyBeacons()))).toEqual(emptyBeacons());
  });
  const bad: [string, unknown][] = [
    ['not JSON', '{'],
    ['an extra top-level key', { ...ok, extra: 1 }],
    ['another schema', { ...ok, schemaVersion: 'beacons.2' }],
    ['an extra beacon key (a path)', { ...ok, beacons: [{ ...ok.beacons[0], path: '/home/me/repo/a.ts' }] }],
    ['a bad file id', { ...ok, beacons: [{ ...ok.beacons[0], fileId: '../a' }] }],
    ['a short SHA', { ...ok, beacons: [{ ...ok.beacons[0], at: 'abc1234' }] }],
    ['a note with a newline', { ...ok, beacons: [{ ...ok.beacons[0], text: 'a\nb' }] }],
    ['too many beacons', { ...ok, beacons: Array.from({ length: MAX_BEACONS + 1 }, () => ok.beacons[0]) }],
  ];
  for (const [name, v] of bad) {
    it(`refuses ${name}`, () => {
      const text = typeof v === 'string' ? v : JSON.stringify(v);
      expect(() => parseBeaconState(text)).toThrow();
      try { parseBeaconState(text); } catch (e) { expect((e as Error).message).not.toContain('/home/me'); }
    });
  }
});

/** A repo with planets aa (two files) and bb (one) and a README on the star, scanned without agent logs. */
async function repo() {
  const dir = realTempDir('commet-beacons-');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  for (const [k, v] of [['user.name', 'Mate'], ['user.email', 'mate@example.com'], ['commit.gpgsign', 'false']]) git('config', k!, v!);
  let n = 0;
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  const commit = (change: () => void) => {
    change();
    git('add', '-A');
    const at = `2026-10-10T${String(9 + n++).padStart(2, '0')}:00:00Z`;
    execFileSync('git', ['commit', '-q', '-m', `c${n}`], { cwd: dir, env: { ...process.env, GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at } });
  };
  const run = (...args: string[]) => cli(args, dir, { ...process.env, CLAUDE_CONFIG_DIR: join(dir, 'no-claude') });
  const scan = async () => expect((await run('scan', '--no-ingest', '--no-root')).code).toBe(0);
  commit(() => {
    for (const [p, t] of [['aa/one.ts', 'one\n'], ['aa/two.ts', 'two\n'], ['bb/three.ts', 'three\n'], ['README.md', '# r\n']]) write(p!, t!);
  });
  await scan();
  const file = join(dir, '.git', 'commet', BEACONS_FILE);
  const stored = () => JSON.parse(readFileSync(file, 'utf8')) as BeaconState;
  return { dir, git, write, commit, run, scan, file, stored };
}

const homeOf = async (dir: string, path: string) => (await openFogSource(dir)).base.home.get(fileIdOf(path)) ?? 'star';

describe('commet beacon on a real repo', () => {
  it('leaves a note on a file\'s planet, lists it, and stores ids, a SHA and the text only, mode 0600', async () => {
    const r = await repo();
    expect(existsSync(r.file)).toBe(false);
    const set = await r.run('beacon', 'aa/one.ts', '  reads NUL-framed git output  ');
    expect(set.code).toBe(0);
    const head = (await readFog(r.dir)).head;
    expect(set.out).toBe(`Beacon left on aa/one.ts (aa) at ${head.slice(0, 7)}: reads NUL-framed git output\n`);
    expect(r.stored()).toEqual({ schemaVersion: 'beacons.1', beacons: [{ fileId: fileIdOf('aa/one.ts'), at: head, text: 'reads NUL-framed git output' }] });
    expect(statSync(r.file).mode & 0o777).toBe(0o600);
    expect(readFileSync(r.file, 'utf8')).not.toContain(r.dir);
    const v = await readBeacons(r.dir);
    expect(v).toEqual({ schemaVersion: 'beacons.1', head, unplaced: 0,
      beacons: [{ fileId: fileIdOf('aa/one.ts'), path: 'aa/one.ts', home: await homeOf(r.dir, 'aa/one.ts'), at: head, text: 'reads NUL-framed git output' }] });
    // A root file's beacon sits on the star.
    expect((await r.run('beacon', 'README.md', 'the readme')).code).toBe(0);
    expect((await readBeacons(r.dir)).beacons.map((b) => b.home)).toEqual([await homeOf(r.dir, 'aa/one.ts'), 'star']);
    const list = await r.run('beacon', 'list');
    expect(list.code).toBe(0);
    expect(list.out).toBe(`2 beacons at ${head.slice(0, 7)}, oldest first:\naa  aa/one.ts  reads NUL-framed git output\nstar  README.md  the readme\n`);
    expect((await r.run('beacon')).out).toBe(list.out);
  });

  it('a second note on the same file replaces the first and moves it to the end', async () => {
    const r = await repo();
    await r.run('beacon', 'aa/one.ts', 'first');
    await r.run('beacon', 'bb/three.ts', 'other');
    await r.run('beacon', 'aa/one.ts', 'second');
    expect(r.stored().beacons.map((b) => b.text)).toEqual(['other', 'second']);
  });

  it('refuses a bad note, a folder, a file outside the snapshot and a missing argument, writing nothing', async () => {
    const r = await repo();
    for (const [args, err] of [
      [['aa/one.ts', 'two\nlines'], CONTROL], [['aa/one.ts', '   '], 'the note is empty'], [['aa/one.ts', 'x'.repeat(121)], 'longer than 120'],
      [['aa', 'a folder'], 'aa is a folder: leave a beacon on one of its files'], [['aa/nope.ts', 'x'], "isn't in the latest snapshot"],
      [['aa/one.ts'], 'one file and one note'], [['--bogus', 'x', 'y'], 'unknown option'], [['--remove'], '--remove takes one file'],
    ] as [string[], string][]) {
      const res = await r.run('beacon', ...args);
      expect(res.code, args.join(' ')).toBe(EXIT.usage);
      expect(res.err, args.join(' ')).toContain(err);
      // The refusal never echoes a control character back to the terminal.
      expect(res.err).not.toMatch(/two\nlines/);
    }
    expect(existsSync(r.file)).toBe(false);
  });

  it('follows a rename to the file\'s new path, and counts a deleted file\'s note as unplaced (Rule 1)', async () => {
    const r = await repo();
    await r.run('beacon', 'aa/one.ts', 'about one');
    await r.run('beacon', 'bb/three.ts', 'about three');
    r.commit(() => {
      r.git('mv', 'aa/one.ts', 'aa/uno.ts');
      rmSync(join(r.dir, 'bb/three.ts'));
      r.write('bb/four.ts', 'four, so bb stays a planet\n');
    });
    await r.scan();
    const v = await readBeacons(r.dir);
    expect(v.beacons.map((b) => [b.path, b.text])).toEqual([['aa/uno.ts', 'about one']]);
    expect(v.beacons[0]!.fileId).toBe(fileIdOf('aa/uno.ts'));
    expect(v.unplaced).toBe(1);
    const list = await r.run('beacon', 'list');
    expect(list.out).toContain('aa  aa/uno.ts  about one\n');
    expect(list.out).toContain("1 more can't be placed");
    // The stored note keeps the id and head it was left at.
    expect(r.stored().beacons[0]!.fileId).toBe(fileIdOf('aa/one.ts'));
    // A note on the renamed file replaces the one that followed it there.
    await r.run('beacon', 'aa/uno.ts', 'renamed');
    expect((await readBeacons(r.dir)).beacons.map((b) => b.text)).toEqual(['renamed']);
  });

  it('--remove takes the note off a file, and says when there was none', async () => {
    const r = await repo();
    await r.run('beacon', 'aa/one.ts', 'gone soon');
    const rm = await r.run('beacon', '--remove', 'aa/one.ts');
    expect(rm.code).toBe(0);
    expect(rm.out).toBe('Removed the beacon on aa/one.ts\n');
    expect(r.stored().beacons).toEqual([]);
    expect((await r.run('beacon', '--remove', '--', 'aa/one.ts')).out).toBe('No beacon on aa/one.ts; nothing changed\n');
  });

  it('commet chart --note charts the file and leaves the note; a bad note stops before anything is charted', async () => {
    const r = await repo();
    const bad = await r.run('chart', '--note', 'a\u001b[2Jb', 'aa/two.ts');
    expect(bad.code).toBe(EXIT.usage);
    expect(existsSync(join(r.dir, '.git', 'commet', 'chart.json'))).toBe(false);
    const res = await r.run('chart', '--note', 'two is the config loader', '--', 'aa/two.ts');
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/^Charted aa\/two\.ts at /);
    expect(res.out).toContain('Beacon left on aa/two.ts: two is the config loader\n');
    expect((await readFog(r.dir)).files.find((f) => f.fileId === fileIdOf('aa/two.ts'))!.state).toBe('charted');
    expect(r.stored().beacons.map((b) => b.text)).toEqual(['two is the config loader']);
    expect((await r.run('chart', '--note', 'x', 'status')).err).toContain('--note goes with charting one file');
  });

  it('refuses a symlinked or damaged beacons.json, and never resets it (exit 5)', async () => {
    const r = await repo();
    writeFileSync(r.file, '{"schemaVersion":"beacons.1","beacons":[{"fileId":"nope"}]}', { mode: 0o600 });
    for (const args of [['list'], ['aa/one.ts', 'x']]) {
      const res = await r.run('beacon', ...args);
      expect(res.code).toBe(EXIT.state);
      expect(res.err).toContain('beacons.json is unreadable (bad beacon); move it aside to start over');
    }
    expect(readFileSync(r.file, 'utf8')).toContain('"nope"');
    rmSync(r.file);
    const elsewhere = join(r.dir, 'elsewhere.json');
    writeFileSync(elsewhere, JSON.stringify(emptyBeacons()));
    symlinkSync(elsewhere, r.file);
    const res = await r.run('beacon', 'list');
    expect(res.code).toBe(EXIT.state);
    expect(res.err).toContain('symlink');
    expect(res.err).not.toContain(r.dir);
  });

  it('serialises concurrent writers under beacons.lock: no note is lost', async () => {
    const r = await repo();
    const src = await openFogSource(r.dir);
    const at = src.base.snapshot.repo.head;
    const paths = ['aa/one.ts', 'aa/two.ts', 'bb/three.ts', 'README.md'];
    const results = await Promise.all(paths.map((p) => writeBeacon(src, { fileId: fileIdOf(p), at, text: `note on ${p}` })));
    expect(results.every((x) => x.ok)).toBe(true);
    expect(r.stored().beacons.map((b) => b.text).sort()).toEqual(paths.map((p) => `note on ${p}`).sort());
  });

  it('refuses an unknown head, a file not at that head and a new note past MAX_BEACONS, changing nothing', async () => {
    const r = await repo();
    const { base } = await openFogSource(r.dir);
    const at = base.snapshot.repo.head;
    const one = fileIdOf('aa/one.ts');
    expect(applyBeaconAction(base, emptyBeacons(), { fileId: one, at: 'c'.repeat(40), text: 'x' })).toEqual({ ok: false, error: 'unknown-head', head: at });
    expect(applyBeaconAction(base, emptyBeacons(), { fileId: fileIdOf('zz/none.ts'), at, text: 'x' })).toEqual({ ok: false, error: 'no such file at that head' });
    expect(applyBeaconAction(base, emptyBeacons(), { fileId: one, at, text: 'a\nb' })).toEqual({ ok: false, error: CONTROL });
    // Full of notes that can't be placed (left before the window): kept and counted, so a new one is refused.
    const full: BeaconState = { schemaVersion: 'beacons.1', beacons: Array.from({ length: MAX_BEACONS }, (_, i) => ({ fileId: `f_${i.toString(16).padStart(12, '0')}` as FileId, at: 'd'.repeat(40), text: 'old' })) };
    const r2 = applyBeaconAction(base, full, { fileId: one, at, text: 'x' });
    expect(r2.ok).toBe(false);
    expect(!r2.ok && r2.error).toMatch(/already 1000 beacons/);
    expect(beaconViewFrom(base, full)).toMatchObject({ beacons: [], unplaced: MAX_BEACONS });
  });
});
