import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('the CI check job builds before it typechecks, lints and tests, so a broken build fails first (Qodo local #4)', () => {
  const workflow = readFileSync(join(import.meta.dirname, '../.github/workflows/ci.yml'), 'utf8');
  const runs = [...workflow.matchAll(/^\s*- run: (.+)$/gm)].map((m) => m[1]!.trim());
  expect(runs).toEqual(['npm ci', 'npm run build', 'npm run typecheck', 'npm run lint', 'npm test']);
});
