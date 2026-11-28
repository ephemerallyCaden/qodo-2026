// The drill must fail (live-demo L7): it runs __checks__/drill.spec.ts in its own Playwright run, against
// the same site as this one, and expects that run to fail at the focus step, naming the missing planet.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { DEMO_URL, NO_SUCH_PLANET } from '../__checks__/journey';

const HERE = join(import.meta.dirname, '..');

test('the drill check fails, and fails where the planet should be named', () => {
  const run = spawnSync('npx', ['playwright', 'test', '--config', 'tests/drill.config.ts'], {
    cwd: HERE, encoding: 'utf8', env: { ...process.env, DEMO_URL, DEMO_LOCAL: '', FORCE_COLOR: '0', NO_COLOR: '1' }, timeout: 300_000,
  });
  const out = `${run.stdout}\n${run.stderr}`;
  expect(run.status, out).not.toBe(0);
  expect(out).toContain('1 failed');
  expect(out).toContain(`focused ${NO_SUCH_PLANET.path}`); // the step it fails at: the planet isn't there to focus
});
