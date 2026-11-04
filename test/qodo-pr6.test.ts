// Qodo PR #6 findings on the Issue #5 fix. Each case scans a tiny repo twice: a control without
// the triggering record (must be human or agent as stated) and the case itself.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { createResult, miniClaude, miniRepo, scanMini, session, type Row } from './fixtures/mini.js';

const SID = '12121212-1212-4121-8121-121212121212';
const IDLE = '34343434-3434-4343-8343-343434343434';
const DAY = '2026-10-10';
const at = (hhmmss: string) => `${DAY}T${hhmmss}.000Z`;
const LINES = ['export const reviewedLineOne = 4101;', 'export const reviewedLineTwo = reviewedLineOne + 1;'];
const PATH = 'src/reviewed.ts';

/** One self commit of LINES at 10:00 inside an idle session's coverage, plus an earlier root commit. */
const repoWith = (setup?: (dir: string) => void) => miniRepo([
  { id: 'root', at: `${DAY}T08:00:00Z`, path: 'README.md', lines: ['# Mini fixture', 'A root commit before the logs.'] },
  { id: 'target', at: `${DAY}T10:00:00Z`, path: PATH, lines: LINES },
], setup);
/** An idle session in `cwd` covering the target commit; it logs no edit. */
const idle = (cwd: string): Row[] => { const s = session(IDLE, cwd); return [s.user('i1', at('09:00:00')), s.user('i2', at('10:30:00'))]; };
/** Scans the control (without `trigger`) and the case (with it) against fresh copies of one repo. */
async function controlAndCase(build: (dir: string, withTrigger: boolean) => Record<string, Row[]>, setup?: (dir: string) => void) {
  const [a, b] = [repoWith(setup), repoWith(setup)];
  return { control: await scanMini(a, miniClaude(build(a.dir, false))), withCase: await scanMini(b, miniClaude(build(b.dir, true))) };
}

describe('Qodo PR6 #5: one dropped record counts once', () => {
  it('a bashEditDiff record with two unplaceable files gives dropped = 1', async () => {
    const repo = repoWith();
    const s = session(SID, repo.dir);
    const bad = (name: string) => ({ filePath: `${repo.dir}/src/../${name}`, created: true,
      hunks: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 2, lines: LINES.map((l) => `+${l}`) }] });
    const rows = [s.user('u1', at('09:00:00')), s.call('a2', at('09:30:00'), 'Bash', { command: 'synthetic edit' }),
      s.result('u3', 'a2', at('09:30:01'), { stdout: '', bashEditDiff: { files: [bad('one.ts'), bad('two.ts')] } }), s.user('u4', at('10:30:00'))];
    const { logs, attr } = await scanMini(repo, miniClaude({ [SID]: rows }));
    expect(logs.dropped).toBe(1);
    expect(attr('target').class).toBe('unknown');
  });
});

describe('Qodo PR6 #1: a drop outside the datable records still widens the partial span', () => {
  // The dropped Write result is malformed, so it has no usable timestamp of its own.
  const malformedWrite = (dir: string) => JSON.stringify(session(SID, dir).result('u0', 'a0', at('09:30:01'),
    createResult(join(dir, PATH), LINES))).slice(0, -3);

  it('a dropped record at the very start of a transcript keeps a commit covered by another transcript from being human', async () => {
    const { control, withCase } = await controlAndCase((dir, trigger) => {
      const s = session(SID, dir);
      return { [IDLE]: idle(dir), [SID]: [...(trigger ? [malformedWrite(dir)] : []), s.user('u1', at('11:00:00')), s.user('u2', at('11:30:00'))] };
    });
    expect(control.attr('target')).toMatchObject({ class: 'human' });
    expect(withCase.logs.dropped).toBe(1);
    expect(withCase.attr('target')).toMatchObject({ class: 'unknown', tier: 'none' });
  });

  it('a dropped record at the very end of a transcript keeps a later covered commit from being human', async () => {
    const { control, withCase } = await controlAndCase((dir, trigger) => {
      const s = session(SID, dir);
      return { [IDLE]: idle(dir), [SID]: [s.user('u1', at('08:30:00')), s.user('u2', at('08:40:00')), ...(trigger ? [malformedWrite(dir)] : [])] };
    });
    expect(control.attr('target')).toMatchObject({ class: 'human' });
    expect(withCase.attr('target')).toMatchObject({ class: 'unknown', tier: 'none' });
  });
});
