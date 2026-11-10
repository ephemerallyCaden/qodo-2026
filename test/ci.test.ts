import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

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
  expect(runs(body)).toEqual(['npm ci', 'npm run test:render']);
});
