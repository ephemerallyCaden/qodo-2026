import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from './fixtures/tmp.js';

const workflow = readFileSync(join(import.meta.dirname, '../.github/workflows/ci.yml'), 'utf8');
/** One job's body: from its key to the next job key (two-space indent) or the end of the file. */
function job(name: string): string {
  const m = new RegExp(`^ {2}${name}:\\n([\\s\\S]*?)(?=^ {2}\\S|(?![\\s\\S]))`, 'm').exec(workflow);
  if (!m) throw new Error(`no ${name} job in ci.yml`);
  return m[1]!;
}
const runs = (body: string) => [...body.matchAll(/^\s*- run: (.+)$/gm)].map((m) => m[1]!.trim());

it('the CI check job builds before it typechecks, lints and tests, so a broken build fails first (Qodo local #4)', () => {
  expect(runs(job('check'))).toEqual(['npm ci', 'npm run build', 'npm run typecheck', 'npm run lint', 'npm test']);
});

it('the CI render job runs in the Playwright image matching @playwright/test, pinned by digest, where goldens are authoritative (#31)', () => {
  const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf8')) as { devDependencies: Record<string, string> };
  const version = pkg.devDependencies['@playwright/test']!;
  expect(version).toMatch(/^\d+\.\d+\.\d+$/); // exact, so the browser build can't drift from the image's
  const body = job('render');
  expect(body).toMatch(new RegExp(`^ +image: mcr\\.microsoft\\.com/playwright:v${version.replaceAll('.', '\\.')}-noble@sha256:[0-9a-f]{64}$`, 'm'));
  // On a failure, the same image reruns the failed tests with UPDATE_GOLDEN=1 (the root config, as
  // test:render) and uploads what it wrote: the gated update path. Only the failures, so the rerun fits the
  // job's time limit (#225).
  expect(runs(body)).toEqual(['npm ci', 'npm run test:render', 'UPDATE_GOLDEN=1 npx playwright test --last-failed']);
  expect(JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf8')).scripts['test:render']).toBe('playwright test');
  expect(body).toMatch(/if: failure\(\) && steps\.update\.outcome == 'success'\n\s+uses: actions\/upload-artifact@v4\n\s+with:\n\s+name: render-goldens\n\s+path: test\/golden\/render\//);
});

it('every render run builds dist/web first (Playwright global setup), so the render job never drives a missing or stale view (#31 AC 8)', async () => {
  const { default: config } = await import('../playwright.config.js');
  expect(config.globalSetup).toBe('./test/render/global-setup.ts');
});

const indentOf = (line: string) => line.length - line.trimStart().length;
const uncommented = (line: string) => line.replace(/(^|\s)#.*$/, '');
/**
 * Every `actions/checkout` step in a workflow: its 1-based line and its `persist-credentials` input (undefined if unset).
 * An indentation reader, not a YAML parser: it reads block-style steps only, so a flow-style `with: { … }` reads as unset.
 * It throws on a line naming actions/checkout that it can't place in a step, so an unreadable step never passes.
 */
function checkoutSteps(yaml: string): { line: number; persistCredentials: string | undefined }[] {
  const lines = yaml.split('\n');
  const content = (i: number) => uncommented(lines[i]!).trim() !== '';
  return lines.flatMap((text, i) => {
    if (!uncommented(text).includes('actions/checkout')) return [];
    if (!/^\s*(- )?uses:\s*['"]?actions\/checkout@/.test(text)) throw new Error(`line ${i + 1}: can't read actions/checkout here`);
    // The step is the list item holding this key: this line, or the nearest less-indented line above, which must be its `- `.
    let start = i;
    if (!/^\s*- /.test(text)) {
      do start--; while (start >= 0 && !(content(start) && indentOf(lines[start]!) < indentOf(text)));
      if (start < 0 || !/^\s*- /.test(lines[start]!) || indentOf(lines[start]!) + 2 !== indentOf(text)) {
        throw new Error(`line ${i + 1}: actions/checkout isn't a step key`);
      }
    }
    const keys = indentOf(lines[start]!) + 2; // the column of the step's own keys, after its `- `
    let end = start + 1;
    while (end < lines.length && !(content(end) && indentOf(lines[end]!) < keys)) end++;
    const step = [lines[start]!.replace(/^(\s*)- /, '$1  '), ...lines.slice(start + 1, end)];
    const w = step.findIndex((l) => indentOf(l) === keys && /^\s*with:\s*$/.test(uncommented(l)));
    if (w < 0) return [{ line: i + 1, persistCredentials: undefined }];
    let withEnd = w + 1;
    while (withEnd < step.length && !(uncommented(step[withEnd]!).trim() !== '' && indentOf(step[withEnd]!) <= keys)) withEnd++;
    const inputs = step.slice(w + 1, withEnd).filter((l) => uncommented(l).trim() !== '');
    const own = inputs.filter((l) => indentOf(l) === indentOf(inputs[0] ?? '')); // direct children of with: only
    const value = own.map((l) => /^\s*persist-credentials:\s*(.*)$/.exec(uncommented(l))).find(Boolean)?.[1]!.trim();
    return [{ line: i + 1, persistCredentials: value?.replace(/^(['"])(.*)\1$/, '$2') }];
  });
}

describe('every actions/checkout step sets persist-credentials: false, so no artifact can carry GITHUB_TOKEN (Arnica: artipacked)', () => {
  it('reads persist-credentials from the checkout step\'s own with: block, and nowhere else', () => {
    const fixture = [
      'jobs:',
      '  a:',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/checkout@v4 # a comment',
      '        with:',
      '          fetch-depth: 0',
      '          persist-credentials: false',
      '      - name: named first',
      '        uses: "actions/checkout@0123abc"',
      '        env:',
      '          persist-credentials: false',
      '        with:',
      '          # persist-credentials: false',
      '          persist-credentials: true',
      '      - uses: actions/setup-node@v4',
      '        with:',
      '          persist-credentials: false',
      '  b:',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '        with:',
      "          persist-credentials: 'false'",
      '      - run: echo actions/checkout # a run step naming it is unreadable, so it throws',
    ];
    expect(() => checkoutSteps(fixture.join('\n'))).toThrow("line 24: can't read actions/checkout here");
    expect(checkoutSteps(fixture.slice(0, -1).join('\n'))).toEqual([
      { line: 4, persistCredentials: undefined },
      { line: 5, persistCredentials: 'false' },
      { line: 10, persistCredentials: 'true' },
      { line: 21, persistCredentials: 'false' },
    ]);
  });

  it('holds for every workflow in .github/workflows', () => {
    const dir = join(import.meta.dirname, '../.github/workflows');
    const steps = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort().flatMap((f) =>
      checkoutSteps(readFileSync(join(dir, f), 'utf8')).map((s) => ({ step: `${f}:${s.line}`, persistCredentials: s.persistCredentials })));
    expect(steps.length).toBeGreaterThan(0); // a reader that finds nothing checks nothing
    expect(steps).toEqual(steps.map((s) => ({ ...s, persistCredentials: 'false' })));
  });
});

describe('Golden-Update gate (.github/scripts/golden-update.sh)', () => {
  const SCRIPT = join(import.meta.dirname, '../.github/scripts/golden-update.sh');

  it('runs on every pull request over the PR\'s own commits', () => {
    const body = job('goldens');
    expect(body).toMatch(/^ +if: github\.event_name == 'pull_request'$/m);
    expect(runs(body)).toEqual(['sh .github/scripts/golden-update.sh "$BASE" "$HEAD"']);
    expect(body).toContain('BASE: ${{ github.event.pull_request.base.sha }}');
    expect(body).toContain('HEAD: ${{ github.event.pull_request.head.sha }}');
  });

  it('fails a commit that changes test/golden/ without a Golden-Update: <reason> line, and only that commit', () => {
    const dir = tempDir('commet-golden-gate-');
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
    const commit = (file: string, message: string) => {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), message);
      git('add', file);
      git('-c', 'user.name=Gate', '-c', 'user.email=gate@example.com', 'commit', '-q', '-m', message);
      return git('rev-parse', 'HEAD');
    };
    git('init', '-q');
    const base = commit('README.md', 'chore: base');
    commit('src/a.ts', 'feat: no golden, no line needed');
    commit('test/golden/a.json', 'test: golden with a reason\n\nGolden-Update: new fixture');
    const good = git('rev-parse', 'HEAD');
    const gate = (from: string, to: string) => spawnSync('sh', [SCRIPT, from, to], { cwd: dir, encoding: 'utf8' });
    expect(gate(base, good).status).toBe(0);
    // A range git can't read fails the gate; it never passes having checked nothing.
    const unreadable = gate('0000000000000000000000000000000000000000', good);
    expect(unreadable.status).toBe(2);
    expect(unreadable.stdout).toContain("::error::can't list commits in 0000000000000000000000000000000000000000..");
    commit('test/golden/render/b.txt', 'test: golden without a reason\n\nGolden-Update:');
    commit('test/golden/c.json', 'test: another golden, no line');
    const bad = gate(base, git('rev-parse', 'HEAD'));
    expect(bad.status).toBe(1);
    expect(bad.stdout.trim().split('\n').map((l) => l.replace(/^::error::\w+ /, ''))).toEqual([
      "test: another golden, no line changes test/golden/ without a 'Golden-Update: <reason>' line",
      "test: golden without a reason changes test/golden/ without a 'Golden-Update: <reason>' line",
    ]);
  });
});
