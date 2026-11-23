// visual-proof (R8): the saved record is created when the run starts and every step is written to it
// as soon as it's done, so a run that dies midway still shows each step it finished; it ends with a status.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RunRecord, redact, uniqueName } from '../../.claude/skills/visual-proof/scripts/record.js';
import { tempDir } from '../fixtures/tmp.js';

describe('RunRecord', () => {
  it('exists from the start with Status: running, then holds each step as soon as it is written', () => {
    const dir = tempDir('commet-vp-record-');
    const r = RunRecord.create(join(dir, 'visual-proof-x.md'), 'visual-proof: 8cf028c → 4f3fe57, panel-labels', ['Base: `8cf028c`']);
    let text = readFileSync(r.path, 'utf8');
    expect(text).toMatch(/^# visual-proof: 8cf028c → 4f3fe57, panel-labels\n/);
    expect(text).toContain('\nStatus: running\n');
    expect(text).toContain('Base: `8cf028c`');
    r.step('Builds', ['base: built in 4.1 s', '```', 'npm run build', '```']);
    text = readFileSync(r.path, 'utf8');
    expect(text).toContain('## 1. Builds\nbase: built in 4.1 s\n```\nnpm run build\n```\n');
    r.step('Takes', ['4 takes']);
    expect(readFileSync(r.path, 'utf8')).toContain('## 2. Takes\n4 takes\n');
  });

  it('ends with a status line that says how the run ended, written over the running one', () => {
    const dir = tempDir('commet-vp-record-');
    const r = RunRecord.create(join(dir, 'r.md'), 't', []);
    r.step('Builds', ['ok']);
    r.finish('stopped (no-view-change) at step 1: base and head build the same view bundle');
    const text = readFileSync(r.path, 'utf8');
    expect(text).not.toContain('Status: running');
    expect(text).toContain('\nStatus: stopped (no-view-change) at step 1: base and head build the same view bundle\n');
    expect(text.trimEnd().split('\n').at(-1)).toBe('Final status: stopped (no-view-change) at step 1: base and head build the same view bundle');
  });

  it('never overwrites an earlier record: the next free name gets -2, -3', () => {
    const dir = tempDir('commet-vp-record-');
    expect(uniqueName(dir, 'visual-proof-a', ['.md', ''])).toBe('visual-proof-a');
    writeFileSync(join(dir, 'visual-proof-a.md'), 'old');
    expect(uniqueName(dir, 'visual-proof-a', ['.md', ''])).toBe('visual-proof-a-2');
    writeFileSync(join(dir, 'visual-proof-a-2'), 'a folder by that name blocks it too');
    expect(uniqueName(dir, 'visual-proof-a', ['.md', ''])).toBe('visual-proof-a-3');
    expect(() => RunRecord.create(join(dir, 'visual-proof-a.md'), 't', [])).toThrow(/exists/);
    expect(readFileSync(join(dir, 'visual-proof-a.md'), 'utf8')).toBe('old');
    expect(existsSync(join(dir, 'visual-proof-a-3.md'))).toBe(false);
  });

  it('writes the run scratch, the main checkout and HOME as names, never as absolute paths', () => {
    const dir = tempDir('commet-vp-record-');
    const literals = [{ name: '$SCRATCH', value: '/tmp/visual-proof-x' }, { name: '$MAIN', value: '/Users/a/repo' }, { name: '~', value: '/Users/a' }];
    expect(redact('cd /tmp/visual-proof-x/base && ls /Users/a/repo/.git /Users/a/.cache', literals)).toBe('cd $SCRATCH/base && ls $MAIN/.git ~/.cache');
    const r = RunRecord.create(join(dir, 'r.md'), 't', ['in /Users/a/repo'], literals);
    r.step('s', ['built /tmp/visual-proof-x/head']);
    expect(readFileSync(r.path, 'utf8')).not.toContain('/Users/a');
    expect(readFileSync(r.path, 'utf8')).toContain('built $SCRATCH/head');
  });
});
