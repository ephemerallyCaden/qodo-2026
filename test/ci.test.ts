import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

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
  // On a failure, the same image reruns with UPDATE_GOLDEN=1 and uploads what it wrote: the gated update path.
  expect(runs(body)).toEqual(['npm ci', 'npm run test:render', 'UPDATE_GOLDEN=1 npm run test:render']);
  expect(body).toMatch(/if: failure\(\) && steps\.update\.outcome == 'success'\n\s+uses: actions\/upload-artifact@v4\n\s+with:\n\s+name: render-goldens\n\s+path: test\/golden\/render\//);
});

it('every render run builds dist/web first (Playwright global setup), so the render job never drives a missing or stale view (#31 AC 8)', async () => {
  const { default: config } = await import('../playwright.config.js');
  expect(config.globalSetup).toBe('./test/render/global-setup.ts');
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
    const dir = mkdtempSync(join(tmpdir(), 'commet-golden-gate-'));
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
