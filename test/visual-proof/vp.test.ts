// visual-proof's entry, vp.sh (fresh run 1): the run's own exit status, and a last line that says it, so
// a caller who pipes the output (`| tail -60`, as run 1 did) still reads how the run ended; on a STOP, the
// whole STOP block comes before that line. Each call compiles the tools (a few seconds).
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { realTempDir } from '../fixtures/tmp.js';

const ROOT = resolve(import.meta.dirname, '../..');
const VP = resolve(ROOT, '.claude/skills/visual-proof/scripts/vp.sh');
const STOPPED = 'vp.sh: exit 3 (stopped: report the STOP block above to the user and ask)';

describe('vp.sh', { timeout: 120_000 }, () => {
  it('a stop exits 3 and ends with its STOP block, then the exit line; nothing is written', () => {
    const out = realTempDir('commet-vp-sh-');
    const r = spawnSync(VP, ['run', '--base', 'HEAD', '--head', 'HEAD', '--scene', 'no-such-scene', '--out', out], { cwd: ROOT, encoding: 'utf8' });
    expect(r.status).toBe(3);
    const lines = r.stdout.trimEnd().split('\n');
    expect(lines.at(-1)).toBe(STOPPED);
    expect(lines.at(-2)).toMatch(/^STOP bad-input: no scene no-such-scene; the scenes are .*drone-panel/);
    expect(readdirSync(out)).toEqual([]);
  });

  it('piped through tail, the shell sees 0, but the last line still says the run stopped', () => {
    const out = realTempDir('commet-vp-sh-');
    const r = spawnSync('/bin/sh', ['-c', `"${VP}" run --base HEAD --head HEAD --scene no-such-scene --out "${out}" 2>&1 | tail -60`], { cwd: ROOT, encoding: 'utf8' });
    expect(r.status, "tail's own status").toBe(0);
    expect(r.stdout.trimEnd().split('\n').at(-1)).toBe(STOPPED);
  });

  it('a usage error exits 2 and says so last', () => {
    const r = spawnSync(VP, ['run', '--scene'], { cwd: ROOT, encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stdout.trimEnd().split('\n').at(-1)).toBe('vp.sh: exit 2 (usage: see above)');
  });
});
