// Issue #71: content roots. The planet rule shared by layout and fog, the guess, roots as typed,
// choosing them (flags, the saved answer, the prompt with the terminal injected) and the scan's output.
import { lstatSync, mkdirSync, readFileSync, realpathSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { beforeAll, describe, expect, it } from 'vitest';
import { chooseRoots, terminalAsk, type Ask, type RootFlags } from '../src/cli/roots.js';
import type { LayoutV1 } from '../src/core/contract/layout.js';
import { CommetError, EXIT } from '../src/core/errors.js';
import { foldersOf, guessRoot, normalizeRoot, parseRoots } from '../src/core/roots.js';
import { folderHome, planetHome } from '../src/core/structure.js';
import { readFog, readLayoutRoots } from '../src/state/chart.js';
import { cli, scripted } from './fixtures/cli.js';
import { miniRepo, type MiniRepo } from './fixtures/mini.js';
import { realTempDir } from './fixtures/tmp.js';


describe('#71 C6 and A1: which planet a file is on', () => {
  const content = (path: string, depth: number) => ({ path, depth, zone: 'content' });
  const outer = (path: string) => ({ path, depth: 1, zone: 'outer' });
  it.each([
    // path, roots, home
    ['src/core/a.ts', [], outer('src')],
    ['src/core/a.ts', ['src'], content('src/core', 2)],
    ['src/core/deep/a.ts', ['src'], content('src/core', 2)],
    ['src/cli.ts', ['src'], null], // A1: directly inside a root, a moonlet of the star
    ['README.md', ['src'], null],
    ['docs/guide/x.md', ['src'], outer('docs')],
    ['src/core/a.test.ts', ['src'], null], // a test rides as a moon
    ['src/core/__fixtures__/x.json', ['src'], null], // test data is counted on the star
    ['packages/p/x.ts', ['packages', 'src'], content('packages/p', 2)],
    ['apps/web/src/a/x.ts', ['apps/web/src'], content('apps/web/src/a', 4)],
    ['apps/web/src/x.ts', ['apps/web/src'], null],
    ['apps/web/x.ts', ['apps/web/src'], outer('apps')], // beside a nested root, its top-level folder is an outer planet
    ['srcx/a/b.ts', ['src'], outer('srcx')], // a prefix of a name isn't inside it
  ] as const)('%s with roots %j', (path, roots, home) => {
    expect(planetHome(path, roots)).toEqual(home);
  });

  it('a root itself and the repo root hold no planet; a folder under a root names its subfolder', () => {
    expect([folderHome('src', ['src']), folderHome('', ['src']), folderHome('src/core/x', ['src'])])
      .toEqual([null, null, content('src/core', 2)]);
  });
});

describe('#71 C1: the guess', () => {
  const f = (path: string, loc: number) => ({ path, loc });

  it('is the top-level folder with the largest share of code, tests and test data left out', () => {
    expect(guessRoot([f('src/a/x.ts', 70), f('src/b/y.ts', 10), f('web/z.ts', 20), f('README.md', 0),
      f('test/big.test.ts', 900), f('tests/fixtures/huge.json', 900), f('src/a/x.test.ts', 900)])).toEqual({ root: 'src', sharePct: 80 });
  });

  it('is offered only for a folder with two or more subfolders holding code', () => {
    expect(guessRoot([f('src/a/x.ts', 70), f('src/b/x.test.ts', 10), f('src/y.ts', 5), f('web/z.ts', 20)])).toBeNull();
    expect(guessRoot([f('src/a/x.ts', 1), f('src/b/y.ts', 1)])).toEqual({ root: 'src', sharePct: 100 });
  });

  it('rounds the share down, breaks ties by codepoint, and needs some code', () => {
    expect(guessRoot([f('b/x/1.ts', 1), f('b/y/1.ts', 1), f('a/x/1.ts', 1), f('a/y/1.ts', 1), f('c.ts', 2)])).toEqual({ root: 'a', sharePct: 33 });
    expect(guessRoot([f('test/a.test.ts', 10)])).toBeNull();
    expect(guessRoot([])).toBeNull();
  });
});

describe('#71 C4 and C10: roots as typed', () => {
  it('spelling is normalised: ./src/ is src', () => {
    expect(['src', './src/', 'src//', '././a/b'].map(normalizeRoot)).toEqual([{ root: 'src' }, { root: 'src' }, { root: 'src' }, { root: 'a/b' }]);
  });

  it('absolute, home, drive and escaping paths are refused without being echoed', () => {
    for (const bad of [`${homedir()}/src`, '/etc', '~/src', 'C:\\src', 'c:/src', '\\\\host\\share', '..', 'a/../b', 'a//b', '.', '']) {
      const r = normalizeRoot(bad);
      expect('error' in r, bad).toBe(true);
      if ('error' in r && bad.length > 2) expect(r.error.includes(bad), bad).toBe(false);
    }
  });

  it('roots must be folders at HEAD, are sorted without repeats, and never nest', () => {
    const folders = new Set(['src', 'src/core', 'web', 'packages']);
    expect(parseRoots(['web', 'src/', 'web', 'packages'], folders)).toEqual({ roots: ['packages', 'src', 'web'] });
    expect(parseRoots(['lib'], folders)).toEqual({ error: 'no folder "lib" at HEAD' });
    expect(parseRoots(['src/core', 'src'], folders)).toEqual({ error: 'roots can\'t nest: "src/core" is inside "src"' });
    expect(parseRoots([], folders)).toEqual({ roots: [] });
  });
});

// src holds 13 of the 16 lines of code (81%) and has two subfolders with code.
const FILES = [['src/core/a.ts', 5], ['src/scan/b.ts', 5], ['src/cli.ts', 3], ['web/w.ts', 2], ['docs/d.md', 1], ['test/a.test.ts', 9]]
  .map(([path, loc]) => ({ path: path as string, loc: loc as number }));
const QUESTION = 'Use src as the system root? [Y/n/other] ';
const head = (files: { path: string; loc: number }[], commonDir: string) => ({ commonDir, files, folders: foldersOf(files.map((f) => f.path)) });

/** chooseRoots on FILES in a fresh state dir: what it returned, printed and saved. */
async function choose(flags: RootFlags, ask?: Ask, saved?: string) {
  const common = realTempDir('commet-roots-');
  if (saved !== undefined) {
    mkdirSync(join(common, 'commet'), { mode: 0o700 });
    writeFileSync(join(common, 'commet/config.json'), saved, { mode: 0o600 });
  }
  let out = '';
  const roots = await chooseRoots(flags, head(FILES, common), (t) => (out += t), ask);
  const file = join(common, 'commet/config.json');
  let config: string | null = null;
  try {
    config = readFileSync(file, 'utf8');
    expect(statSync(file).mode & 0o777).toBe(0o600);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  // Exactly one line says which roots, whatever happened (C3).
  expect(out.split('\n').filter((l) => l.startsWith('roots: '))).toHaveLength(1);
  return { roots, out, config: config === null ? null : JSON.parse(config) as unknown, common };
}
const DEFAULT: RootFlags = { kind: 'default' };

describe('#71 C2: the prompt (terminal injected)', () => {
  it('suggests the guess with its share; Enter or y takes it, and the answer is saved', async () => {
    for (const answer of ['', 'y', 'YES ']) {
      const ask = scripted([answer]);
      const r = await choose(DEFAULT, ask);
      expect(ask.asked).toEqual([QUESTION]);
      expect(r.out).toContain('src holds 81% of the code.\n');
      expect([r.roots, r.config]).toEqual([['src'], { roots: ['src'] }]);
      expect(r.out).toContain('roots: src (saved; change with --root <dir>, --no-root or `commet scan --ask`)');
    }
  });

  it('n means no root (#18\'s mapping), saved', async () => {
    const r = await choose(DEFAULT, scripted(['n']));
    expect([r.roots, r.config]).toEqual([[], { roots: [] }]);
  });

  it('"other" takes space-separated folders, each checked; a bad answer is explained and asked again', async () => {
    const ask = scripted(['other', 'web  nope', 'web src/']);
    const r = await choose(DEFAULT, ask);
    expect(ask.asked).toEqual([QUESTION, expect.stringMatching(/^Folders to use as system roots/), expect.stringMatching(/^Folders/)]);
    expect(r.out).toContain('no folder "nope" at HEAD\n');
    expect([r.roots, r.config]).toEqual([['src', 'web'], { roots: ['src', 'web'] }]);
    const direct = scripted(['/etc', 'web']);
    expect((await choose(DEFAULT, direct)).roots).toEqual(['web']);
    expect(direct.asked).toEqual([QUESTION, QUESTION]);
  });

  it('the end of input answers nothing: the guess is used and not saved', async () => {
    const r = await choose(DEFAULT, scripted([]));
    expect([r.roots, r.config]).toEqual([['src'], null]);
  });

  it('a saved answer is used without asking; --ask asks again', async () => {
    const quiet = scripted(['n']);
    const saved = await choose(DEFAULT, quiet, '{"roots":["web"]}');
    expect([quiet.asked, saved.roots]).toEqual([[], ['web']]);
    expect(saved.out).toBe('roots: web (saved; change with --root <dir>, --no-root or `commet scan --ask`)\n');
    const again = await choose({ kind: 'ask' }, scripted(['y']), '{"roots":["web"]}');
    expect([again.roots, again.config]).toEqual([['src'], { roots: ['src'] }]);
    // Asked again but not answered: the saved answer stands.
    expect((await choose({ kind: 'ask' }, scripted([]), '{"roots":["web"]}')).roots).toEqual(['web']);
  });

  it('with no folder to suggest, nothing is asked unless --ask', async () => {
    const common = realTempDir('commet-roots-');
    const files = [{ path: 'src/a/x.ts', loc: 1 }, { path: 'web/w.ts', loc: 1 }];
    const quiet = scripted(['web']);
    let out = '';
    expect(await chooseRoots(DEFAULT, head(files, common), (t) => (out += t), quiet)).toEqual([]);
    expect([quiet.asked, out]).toEqual([[], 'roots: none (no main folder to suggest; set one with --root <dir>)\n']);
    const asked = scripted(['src']);
    expect(await chooseRoots({ kind: 'ask' }, head(files, common), () => undefined, asked)).toEqual(['src']);
    expect(asked.asked).toEqual([expect.stringMatching(/^Folders to use as system roots/)]);
  });
});

describe('#71 C3: no terminal, no question', () => {
  it('uses the guess, unsaved, and says how to confirm or change it', async () => {
    const r = await choose(DEFAULT);
    expect([r.roots, r.config]).toEqual([['src'], null]);
    expect(r.out).toBe('roots: src (guessed: src holds 81% of the code; not saved: confirm with `commet scan --ask` in a terminal, '
      + 'or pass --root <dir> or --no-root)\n');
  });

  it('uses the saved answer; --ask without a terminal says it could not ask', async () => {
    expect((await choose(DEFAULT, undefined, '{"roots":["web"]}')).roots).toEqual(['web']);
    const r = await choose({ kind: 'ask' }, undefined, '{"roots":["web"]}');
    expect(r.out).toMatch(/^roots: web \(not asked: no terminal; saved;/);
    expect((await choose({ kind: 'ask' })).out).toMatch(/^roots: src \(not asked: no terminal; guessed:/);
  });

  it('a saved root that is no longer a folder is left out, and said so', async () => {
    const r = await choose(DEFAULT, undefined, '{"roots":["gone","web"]}');
    expect(r.roots).toEqual(['web']);
    expect(r.out).toContain('roots: web (saved; gone no longer a folder at HEAD, left out;');
  });

  it('only a real TTY on both stdin and stdout can be asked', async () => {
    const tty = () => Object.assign(new PassThrough(), { isTTY: true });
    expect(terminalAsk(new PassThrough(), tty())).toBeUndefined();
    expect(terminalAsk(tty(), new PassThrough())).toBeUndefined();
    expect(terminalAsk(Object.assign(new PassThrough(), { isTTY: false }), tty())).toBeUndefined();
    const [input, output] = [tty(), tty()];
    const ask = terminalAsk(input, output)!;
    const answer = ask(QUESTION);
    input.write('other\n');
    expect(await answer).toBe('other');
    const ended = ask(QUESTION);
    input.end();
    expect(await ended).toBeNull();
  });
});

describe('#71 C4 and C5: flags and the saved file', () => {
  it('--root overrides and saves; --no-root saves none', async () => {
    const set = await choose({ kind: 'set', roots: ['web', './src/'] }, scripted(['n']), '{"roots":[]}');
    expect([set.roots, set.config]).toEqual([['src', 'web'], { roots: ['src', 'web'] }]);
    expect(set.out).toBe('roots: src, web (from --root, saved; change with --root <dir>, --no-root or `commet scan --ask`)\n');
    const none = await choose({ kind: 'none' }, undefined, '{"roots":["src"]}');
    expect([none.roots, none.config]).toEqual([[], { roots: [] }]);
  });

  it('an unknown or invalid --root is a usage error (exit 2) that never echoes an absolute path', async () => {
    for (const bad of ['nope', `${homedir()}/src`, 'src/../web']) {
      const err = await chooseRoots({ kind: 'set', roots: [bad] }, head(FILES, realTempDir('commet-roots-')), () => undefined, undefined).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(CommetError);
      expect((err as CommetError).exitCode).toBe(EXIT.usage);
      if (bad.startsWith('/')) expect((err as CommetError).message).not.toContain(homedir());
    }
  });

  it('PR #72 r1 #3: a damaged config.json names only recoveries that work, and they replace it (a symlink itself, never its target)', async () => {
    const err = await choose(DEFAULT, undefined, 'not json').catch((e: unknown) => e) as CommetError;
    expect(err.exitCode).toBe(EXIT.state);
    const advertised = [...err.message.matchAll(/--(root|no-root|ask)\b/g)].map((m) => m[1]);
    expect(advertised).toEqual(['root', 'no-root']);
    expect((await choose({ kind: 'set', roots: ['src'] }, undefined, 'not json')).config).toEqual({ roots: ['src'] });
    expect((await choose({ kind: 'none' }, undefined, 'not json')).config).toEqual({ roots: [] });
    // --ask still refuses it: the saved answer would be its fallback, so it is never silently reset.
    expect(((await choose({ kind: 'ask' }, scripted(['y']), 'not json').catch((e: unknown) => e)) as CommetError).exitCode).toBe(EXIT.state);
    const common = realTempDir('commet-roots-');
    mkdirSync(join(common, 'commet'), { mode: 0o700 });
    writeFileSync(join(common, 'target.json'), 'not json');
    symlinkSync(join(common, 'target.json'), join(common, 'commet/config.json'));
    await chooseRoots({ kind: 'set', roots: ['web'] }, head(FILES, common), () => undefined, undefined);
    expect(lstatSync(join(common, 'commet/config.json')).isSymbolicLink()).toBe(false);
    expect(readFileSync(join(common, 'target.json'), 'utf8')).toBe('not json');
  });

  it('Qodo local r1 #2: saved roots that nest are damaged state (exit 5), not a usage error; order and repeats are only spelling', async () => {
    const err = await choose(DEFAULT, undefined, '{"roots":["src","src/core"]}').catch((e: unknown) => e);
    expect((err as CommetError).exitCode).toBe(EXIT.state);
    expect((err as CommetError).message).toContain('roots can\'t nest');
    expect((await choose(DEFAULT, undefined, '{"roots":["web","src","web"]}')).roots).toEqual(['src', 'web']);
  });

  it('config.json holds { roots } only; anything else, or a symlink, is a state error (exit 5), never reset', async () => {
    for (const bad of ['{"roots":["src"],"x":1}', '{"roots":["/etc"]}', '{"roots":"src"}', 'not json', '[]']) {
      const err = await choose(DEFAULT, undefined, bad).catch((e: unknown) => e);
      expect((err as CommetError).exitCode, bad).toBe(EXIT.state);
    }
    const common = realTempDir('commet-roots-');
    mkdirSync(join(common, 'commet'), { mode: 0o700 });
    writeFileSync(join(common, 'elsewhere.json'), '{"roots":["web"]}');
    symlinkSync(join(common, 'elsewhere.json'), join(common, 'commet/config.json'));
    const err = await chooseRoots(DEFAULT, head(FILES, common), () => undefined, undefined).catch((e: unknown) => e);
    expect((err as CommetError).exitCode).toBe(EXIT.state);
    expect(lstatSync(join(common, 'commet/config.json')).isSymbolicLink()).toBe(true);
  });
});

describe('#71 through commet scan', () => {
  let repo: MiniRepo;
  const NO_LOGS = { CLAUDE_CONFIG_DIR: realTempDir('commet-roots-claude-') };
  const at = (n: number) => `2026-01-0${n}T00:00:00Z`;
  const layoutOf = () => JSON.parse(readFileSync(join(repo.dir, '.git/commet/layout.json'), 'utf8')) as LayoutV1;
  const config = () => {
    try {
      return JSON.parse(readFileSync(join(repo.dir, '.git/commet/config.json'), 'utf8')) as unknown;
    } catch {
      return null;
    }
  };

  beforeAll(() => {
    repo = miniRepo([
      { id: 'a', at: at(1), path: 'src/core/a.ts', lines: ['a', 'b', 'c', 'd', 'e'] },
      { id: 'b', at: at(2), path: 'src/scan/b.ts', lines: ['a', 'b', 'c', 'd', 'e'] },
      { id: 'c', at: at(3), path: 'src/cli.ts', lines: ['a', 'b', 'c'] },
      { id: 'd', at: at(4), path: 'web/w.ts', lines: ['a', 'b'] },
      { id: 'e', at: at(5), path: 'test/a.test.ts', lines: ['t'] },
    ]);
  });

  it('without a terminal, the first scan uses the guess, says so once, saves nothing and never blocks', async () => {
    const r = await cli(['scan', '--no-ingest'], repo.dir, NO_LOGS);
    expect(r).toMatchObject({ code: 0, err: '' });
    expect(r.out.split('\n').filter((l) => l.startsWith('roots: '))).toEqual([expect.stringMatching(/^roots: src \(guessed: src holds 86% /)]);
    const l = layoutOf();
    expect(l.source.roots).toEqual(['src']);
    expect(l.planets.map((p) => [p.path, p.zone])).toEqual([['src/core', 'content'], ['src/scan', 'content'], ['web', 'outer']]);
    expect(config()).toBeNull();
  });

  it('at a terminal the first scan asks, and the answer is saved and used', async () => {
    const ask = scripted(['n']);
    const r = await cli(['scan', '--no-ingest'], repo.dir, NO_LOGS, ask);
    expect(r.code).toBe(0);
    expect(ask.asked).toEqual([QUESTION]);
    expect([layoutOf().source.roots, layoutOf().planets.map((p) => p.zone), config()]).toEqual([[], ['outer', 'outer'], { roots: [] }]);
    // Saved: the next scan doesn't ask.
    const again = scripted(['y']);
    expect((await cli(['scan', '--no-ingest'], repo.dir, NO_LOGS, again)).code).toBe(0);
    expect(again.asked).toEqual([]);
  });

  it('--root sets and saves; a bad --root or combined flags exit 2, writing nothing', async () => {
    expect((await cli(['scan', '--no-ingest', '--root', 'src'], repo.dir, NO_LOGS)).code).toBe(0);
    expect([layoutOf().source.roots, config()]).toEqual([['src'], { roots: ['src'] }]);
    const before = readFileSync(join(repo.dir, '.git/commet/layout.json'), 'utf8');
    for (const args of [['--root', 'nope'], ['--root', join(repo.dir, 'src')], ['--root', 'src', '--no-root'], ['--ask', '--no-root'], ['--root']]) {
      const r = await cli(['scan', '--no-ingest', ...args], repo.dir, NO_LOGS);
      expect(r.code, args.join(' ')).toBe(EXIT.usage);
      expect(r.err).not.toContain(repo.dir);
    }
    expect(readFileSync(join(repo.dir, '.git/commet/layout.json'), 'utf8')).toBe(before);
    expect(config()).toEqual({ roots: ['src'] });
  });

  it('C8: fog counts the planets of the layout beside the snapshot, content and outer', async () => {
    for (const args of [['--root', 'src'], ['--no-root']]) {
      expect((await cli(['scan', '--no-ingest', ...args], repo.dir, NO_LOGS)).code).toBe(0);
      const fog = await readFog(repo.dir);
      expect(fog.planets.map((p) => p.dirId).sort(), args[0]).toEqual(layoutOf().planets.map((p) => p.dirId).sort());
    }
    expect((await readFog(repo.dir)).planets).toHaveLength(2);
  });

  it('fog reads the layout\'s roots: none without a layout or from before roots; a damaged one is a state error', async () => {
    const dir = realTempDir('commet-roots-state-');
    expect(await readLayoutRoots(dir)).toEqual([]);
    const write = (text: string) => writeFileSync(join(dir, 'layout.json'), text, { mode: 0o600 });
    write('{"schemaVersion":"layout.1","source":{"repoId":"r","head":"h"}}');
    expect(await readLayoutRoots(dir)).toEqual([]);
    write('{"schemaVersion":"layout.1","source":{"repoId":"r","head":"h","roots":["src"]}}');
    expect(await readLayoutRoots(dir)).toEqual(['src']);
    for (const bad of ['{', '{"schemaVersion":"layout.1","source":{"roots":["/etc"]}}', '{"schemaVersion":"layout.1","source":{"roots":"src"}}', '[]',
      '{"schemaVersion":"layout.1","source":{"roots":["src","src/core"]}}', '{"schemaVersion":"layout.1","source":{"roots":["web","src"]}}']) {
      write(bad);
      expect(((await readLayoutRoots(dir).catch((e: unknown) => e)) as CommetError).exitCode, bad).toBe(EXIT.state);
    }
  });

  it('C10: no absolute path in config.json, the prompt or the output', async () => {
    const ask = scripted(['other', join(repo.dir, 'web'), 'web']);
    const r = await cli(['scan', '--no-ingest', '--ask'], repo.dir, NO_LOGS, ask);
    expect(r.code).toBe(0);
    const config = readFileSync(join(repo.dir, '.git/commet/config.json'), 'utf8');
    for (const text of [config, r.out, r.err, ask.asked.join('\n')]) {
      for (const abs of [repo.dir, homedir(), realpathSync(tmpdir())]) expect(text.includes(abs)).toBe(false);
    }
  });
});
