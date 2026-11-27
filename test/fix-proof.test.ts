// The fix-proof skill's test runner (.claude/skills/fix-proof/scripts/run-tests.sh, Qodo PR #187
// 08872fb6, a5e12b6d): a phase's log keeps every command's output and real exit status. The skill
// first piped each command through `tee`, which reports tee's status, not the test's, and truncates
// the log, so a phase that runs two test commands kept only the last one's output.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { realTempDir } from './fixtures/tmp.js';

const RUN = resolve(import.meta.dirname, '../.claude/skills/fix-proof/scripts/run-tests.sh');
const run = (logs: string, ...args: string[]) => spawnSync(RUN, args, { encoding: 'utf8', env: { ...process.env, FIX_PROOF_LOGS: logs } });

describe('fix-proof run-tests.sh', () => {
  it('exits with the test command\'s own status and records it, where a pipe through tee exits 0', () => {
    const logs = realTempDir('commet-fix-proof-');
    const piped = spawnSync('/bin/sh', ['-c', `node -e "process.exit(3)" 2>&1 | tee ${join(logs, 'piped.log')}`]);
    expect(piped.status, 'the old instruction: tee hides the failure').toBe(0);
    const r = run(logs, 'abc1234', 'removed', process.execPath, '-e', 'console.log("Expected: 0"); console.log("Received: 826"); process.exit(1)');
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('Received: 826');
    expect(readFileSync(join(logs, 'removed.log'), 'utf8')).toBe(`### removed: ${process.execPath} -e console.log("Expected: 0"); console.log("Received: 826"); process.exit(1)\nExpected: 0\nReceived: 826\nexit=1\n\n`);
  });

  it('appends every command of a phase to its log, so the first test\'s messages are still there after the second', () => {
    const logs = realTempDir('commet-fix-proof-');
    for (const word of ['first', 'second']) expect(run(logs, 'abc1234', 'fixed', 'echo', word).status).toBe(0);
    expect(readFileSync(join(logs, 'fixed.log'), 'utf8')).toBe('### fixed: echo first\nfirst\nexit=0\n\n### fixed: echo second\nsecond\nexit=0\n\n');
  });

  it('refuses an unknown phase or a missing command, running nothing', () => {
    const logs = realTempDir('commet-fix-proof-');
    expect(run(logs, 'abc1234', 'later', 'echo', 'x').status).toBe(2);
    expect(run(logs, 'abc1234', 'fixed').status).toBe(2);
  });
});
