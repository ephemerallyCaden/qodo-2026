import { describe, expect, it } from 'vitest';
import { fixResult, implementResult, lastJsonBlock, readClaude } from '../../factory/agent.js';
import { configError, defaults, slugFromRemote } from '../../factory/config.js';
import { assertGhAllowed, assertGitAllowed, guarded, GuardError } from '../../factory/guard.js';
import { redact } from '../../factory/log.js';
import { midwaySessionExpiry } from '../../factory/preflight.js';
import { ciState, isBlocking, parseQodo, qodoMarker, qodoState, type QodoOutput } from '../../factory/review.js';
import { acceptanceCriteria, cell, slugify, ticketHash } from '../../factory/ticket.js';
import { claudeOut, finding } from './world.js';

describe('acceptanceCriteria (R3)', () => {
  it.each([
    ['a numbered list', 'Intro.\n\n## Acceptance criteria\n1. One.\n2. Two\n   continued.\n\n## Notes\n- not this', ['One.', 'Two continued.']],
    ['checkboxes and another heading level', '### Acceptance Criteria:\n- [ ] One\n- [x] Two\n', ['One', 'Two']],
    ['a deeper sub-heading inside the section', '## Acceptance criteria\n- One\n### Detail\n- Two\n# Next\n- no', ['One', 'Two']],
    ['list markers inside a code fence', '## Acceptance criteria\n- One\n```\n- not an item\n# not a heading\n```\n- Two', ['One', 'Two']],
    ['an empty section', '## Acceptance criteria\n\n## Next\n- x', []],
    ['CRLF line endings', '## Acceptance criteria\r\n1. One\r\n', ['One']],
  ])('%s', (_, body, want) => expect(acceptanceCriteria(body)).toEqual(want));

  it.each([
    ['no heading at all', 'Acceptance criteria: it works.'],
    ['the words in a sentence', 'See the acceptance criteria below.\n- It works'],
    ['a heading with other words', '## Acceptance criteria notes\n- x'],
  ])('null for %s', (_, body) => expect(acceptanceCriteria(body)).toBeNull());
});

describe('slugify, hash, cell', () => {
  it('makes a short branch-safe slug', () => {
    expect(slugify('Scan: windowCommits splits numstat on U+0001')).toBe('scan-windowcommits-splits-numstat-on-u');
    expect(slugify('Fix!')).toBe('fix');
    expect(slugify('日本語')).toBe('ticket');
    expect(slugify('a'.repeat(60))).toHaveLength(40);
  });

  it('changes the ticket hash on any title or body edit (R12)', () => {
    const h = ticketHash('t', 'b');
    expect(ticketHash('t', 'b')).toBe(h);
    expect(ticketHash('t', 'b ')).not.toBe(h);
    expect(ticketHash('t ', 'b')).not.toBe(h);
    expect(ticketHash('tb', '')).not.toBe(ticketHash('t', 'b'));
  });

  it('keeps a table row intact', () => {
    expect(cell('a | b\nc')).toBe('a \\| b c');
    expect(cell('  ')).toBe('—');
  });
});

describe('Qodo done-check (R6)', () => {
  const HEAD = 'a'.repeat(40);
  const OLD = 'b'.repeat(40);
  const T = Date.parse('2026-11-09T12:00:00Z');
  const out = (over: Partial<QodoOutput> = {}): QodoOutput => ({
    runs: [{ commit_sha: HEAD, status: 'completed', started_at: '2026-11-09T12:00:00.000000Z', review_effort: 'standard' }],
    findings: [finding('f1')], truncated: false, ...over,
  });
  const at = (min: number) => T + min * 60_000;

  it('is complete only on a stable poll at least 3 min after the run started', () => {
    expect(qodoState(out(), HEAD, HEAD, null, at(1), T, 180_000)).toMatchObject({ kind: 'pending', why: 'settling', ids: ['f1'] });
    expect(qodoState(out(), HEAD, HEAD, null, at(4), T, 180_000)).toMatchObject({ kind: 'pending', why: 'finding ids not yet stable' });
    expect(qodoState(out(), HEAD, HEAD, ['f0'], at(4), T, 180_000)).toMatchObject({ kind: 'pending' });
    expect(qodoState(out(), HEAD, HEAD, ['f1'], at(4), T, 180_000)).toMatchObject({ kind: 'complete', findings: [{ id: 'f1' }] });
  });

  it.each([
    ['unreadable output', null, HEAD, 'qodo output unreadable'],
    ['a run on another commit only', out({ runs: [{ commit_sha: OLD, status: 'completed' }] }), HEAD, 'no review run on head yet'],
    ['a run still going', out({ runs: [{ commit_sha: HEAD, status: 'in_progress' }] }), HEAD, 'run status in_progress'],
    ['truncated output', out({ truncated: true }), HEAD, 'qodo output truncated'],
    ['the marker still on the old commit', out(), OLD, 'comment marker on bbbbbbb'],
    ['no marker', out(), null, 'comment marker on none'],
  ])('is pending for %s, never clean', (_, q, marker, why) => {
    expect(qodoState(q, HEAD, marker, ['f1'], at(10), T, 180_000)).toEqual({ kind: 'pending', why });
  });

  it('treats review_effort=skip as skipped, even though it has no findings', () => {
    const q = out({ runs: [{ commit_sha: HEAD, status: 'completed', review_effort: 'skip' }], findings: [] });
    expect(qodoState(q, HEAD, HEAD, [], at(10), T, 180_000)).toMatchObject({ kind: 'skipped' });
  });

  it('uses the latest run on the head', () => {
    const q = out({ runs: [
      { commit_sha: HEAD, status: 'completed', started_at: '2026-11-09T12:00:00Z', review_effort: 'skip' },
      { commit_sha: HEAD, status: 'in_progress', started_at: '2026-11-09T12:05:00Z', review_effort: 'standard' },
    ] });
    expect(qodoState(q, HEAD, HEAD, null, at(10), T, 180_000)).toEqual({ kind: 'pending', why: 'run status in_progress' });
  });

  it('parses the real output shape, ignoring the trailing trace line, and spots truncation', () => {
    const real = JSON.stringify({ pr_url: 'u', review_runs: [{ run_id: 1, commit_sha: HEAD, status: 'completed', review_effort: 'standard', review_complete: false }], findings: [] });
    expect(parseQodo(`${real}\ntrace 34233d17\n`)).toMatchObject({ runs: [{ commit_sha: HEAD }], findings: [], truncated: false });
    expect(parseQodo(JSON.stringify({ review_runs: [], findings: [], meta: { qar_operation_result_truncated: true } }))!.truncated).toBe(true);
    expect(parseQodo('not json')).toBeNull();
    expect(parseQodo(JSON.stringify({ findings: [] }))).toBeNull();
    expect(parseQodo(JSON.stringify({ review_runs: [{}], findings: [] }))).toBeNull();
  });

  it('blocks on open action_required findings only', () => {
    expect(isBlocking(finding('a'))).toBe(true);
    for (const s of ['pending', 'partial_implementation', 'not_implemented', 'focus_areas_edited', 'some_new_status']) {
      expect(isBlocking(finding('a', { attribution_status: s }))).toBe(true);
    }
    expect(isBlocking(finding('a', { attribution_status: 'implemented' }))).toBe(false);
    expect(isBlocking(finding('a', { dismiss_reason: 'false_positive' }))).toBe(false);
    expect(isBlocking(finding('a', { action_level: 'remediation_recommended' }))).toBe(false);
  });

  it('reads the last reviewed-commit marker for this repo only', () => {
    const body = `<!-- https://github.com/o/r/commit/${OLD} -->\n<!-- https://github.com/x/y/commit/${HEAD} -->\n<!-- https://github.com/o/r/commit/${HEAD} -->`;
    expect(qodoMarker(body, 'o/r')).toBe(HEAD);
    expect(qodoMarker('<!-- qodo-self-review-slot -->', 'o/r')).toBeNull();
  });
});

describe('CI state (R6)', () => {
  const runs = (...r: [string, string | null][]) => JSON.stringify({ check_runs: r.map(([status, conclusion], i) => ({ id: i, name: `c${i}`, status, conclusion })) });
  it('is pending with no runs, unreadable output or any run unfinished', () => {
    expect(ciState(runs())).toEqual({ kind: 'pending', why: 'no check runs yet' });
    expect(ciState('oops')).toEqual({ kind: 'pending', why: 'check runs unreadable' });
    expect(ciState(runs(['completed', 'success'], ['queued', null]))).toMatchObject({ kind: 'pending' });
  });
  it('fails anything that is not success', () => {
    expect(ciState(runs(['completed', 'success'], ['completed', 'success']))).toMatchObject({ kind: 'complete', failed: [] });
    expect(ciState(runs(['completed', 'success'], ['completed', 'cancelled']))).toMatchObject({ kind: 'complete', failed: [{ name: 'c1' }] });
  });
});

describe('agent output', () => {
  it('reads the last fenced json block', () => {
    expect(lastJsonBlock('```json\n{"a":1}\n```\ntext\n```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(lastJsonBlock('```json\nnot json\n```')).toBeNull();
    expect(lastJsonBlock('no block')).toBeNull();
  });

  it('fails a success subtype with a non-zero exit or is_error', () => {
    const done = '```json\n{"status":"done"}\n```';
    expect(readClaude(claudeOut({ result: done }), 45)).toMatchObject({ ok: true });
    expect(readClaude(claudeOut({ result: done, code: 1 }), 45)).toMatchObject({ ok: false });
    expect(readClaude(claudeOut({ result: done, is_error: true }), 45)).toMatchObject({ ok: false });
    expect(readClaude(claudeOut({ result: '```json\n{"status":"maybe"}\n```' }), 45)).toMatchObject({ ok: false, reason: 'agent result status "maybe"' });
    expect(readClaude({ code: null, stdout: '', stderr: '', timedOut: false, error: 'spawn ENOENT' }, 45)).toMatchObject({ ok: false, reason: expect.stringContaining('ENOENT') });
  });

  it('keeps one evidence row per ticket criterion and rejects a badly formed PR title', () => {
    const r = implementResult({ pr_title: 'Fixed stuff', criteria: [{ met: true, evidence: 'e1' }] }, 2);
    expect(r.prTitle).toBeNull();
    expect(r.criteria).toEqual([{ met: true, evidence: 'e1' }, { met: null, evidence: '' }]);
    expect(implementResult({ pr_title: 'fix(scan): parse on NUL' }, 0).prTitle).toBe('fix(scan): parse on NUL');
  });

  it('leaves a finding the agent skipped unanswered', () => {
    const r = fixResult({ findings: [{ id: 'a', verdict: 'rejected', reason: 'wrong' }, { id: 'zzz', verdict: 'confirmed' }] }, [finding('a'), finding('b')]);
    expect(r.dispositions.map((d) => [d.id, d.verdict])).toEqual([['a', 'rejected'], ['b', 'unanswered']]);
  });
});

describe('Midway cookie (R13)', () => {
  it('reads only the session cookie expiry for midway-auth', () => {
    const jar = [
      '# Netscape HTTP Cookie File',
      '#HttpOnly_.midway-auth.amazon.com\tTRUE\t/\tTRUE\t1794305831\ttpm_metrics\tv',
      '#HttpOnly_midway-auth.amazon.com\tFALSE\t/\tTRUE\t1794305000\tsession\tv',
      '#HttpOnly_midway-auth.amazon.com\tFALSE\t/\tTRUE\t1794305831\tsession\tv',
      '#HttpOnly_.auth.midway.aws.dev\tTRUE\t/\tTRUE\t1794999999\tsession\tv',
      'midway-auth.amazon.com\tFALSE\t/\tTRUE\t1825769829\tuser_name\tv',
    ].join('\n');
    expect(midwaySessionExpiry(jar)).toBe(1794305831);
    expect(midwaySessionExpiry('# empty\n')).toBeNull();
  });
});

describe('guardrails (R8)', () => {
  it.each([
    [['pr', 'merge', '100']], [['api', '-X', 'PUT', 'repos/o/r/pulls/1/merge']], [['api', 'repos/o/r/actions/secrets']],
    [['api', '--method=POST', 'repos/o/r/issues']], [['api', 'repos/o/r/labels', '-f', 'name=x']], [['repo', 'edit', '--visibility', 'private']],
    [['secret', 'set', 'X']], [['issue', 'edit', '1', '--body', 'x']], [['issue', 'close', '1']], [['pr', 'edit', '1', '--base', 'main']],
  ])('refuses gh %j', (args) => expect(() => assertGhAllowed(args)).toThrow(GuardError));

  it.each([
    [['issue', 'list', '--label', 'x']], [['issue', 'edit', '1', '--repo', 'o/r', '--remove-label', 'a', '--add-label', 'b']],
    [['api', '--paginate', 'repos/o/r/issues/1/events', '--jq', '.']], [['pr', 'create', '--base', 'session/week1']], [['label', 'create', 'x', '--force']],
  ])('allows gh %j', (args) => expect(() => assertGhAllowed(args)).not.toThrow());

  it.each([
    [['push', 'origin', 'HEAD:refs/heads/main']], [['push', 'origin', 'HEAD:refs/heads/session/week1']], [['push', '--force', 'origin', 'HEAD:refs/heads/agent/1-x']],
    [['push', 'origin', '+HEAD:refs/heads/agent/1-x']], [['push', '--force-with-lease', 'origin', 'HEAD:refs/heads/agent/1-x']],
    [['push', 'origin', 'HEAD:refs/heads/feature/x']], [['push', 'origin', 'HEAD:refs/heads/agent/1-x', '--delete']], [['push', 'origin', ':refs/heads/agent/1-x']],
    [['-c', 'credential.helper=', 'push', 'origin', 'HEAD:refs/heads/agent/1-x']], [['merge', 'origin/main']], [['reset', '--hard']], [['worktree', 'remove', 'x']],
    [['config', 'user.name', 'x']], [['remote', 'set-url', 'origin', 'x']],
  ])('refuses git %j', (args) => expect(() => assertGitAllowed(args)).toThrow(GuardError));

  it('allows the one push form the runner uses', () => {
    expect(() => assertGitAllowed(['push', 'origin', 'HEAD:refs/heads/agent/24-scan-x'])).not.toThrow();
    expect(() => assertGitAllowed(['merge-base', '--is-ancestor', 'a', 'HEAD'])).not.toThrow();
  });

  it('checks every gh and git command a wrapped exec runs, before it runs', async () => {
    const ran: string[] = [];
    const exec = guarded(async (cmd) => {
      ran.push(cmd);
      return { code: 0, stdout: '', stderr: '', timedOut: false };
    });
    await expect(exec('/opt/homebrew/bin/gh', ['pr', 'merge', '1'], { timeoutMs: 1 })).rejects.toThrow(GuardError);
    await expect(exec('git', ['push', 'origin', 'HEAD:refs/heads/main'], { timeoutMs: 1 })).rejects.toThrow(GuardError);
    await exec('npm', ['test'], { timeoutMs: 1 });
    expect(ran).toEqual(['npm']);
  });
});

describe('config', () => {
  const cfg = defaults('/h', '/r', '/r/.git', 'o/r');
  it('never targets main', () => {
    expect(configError(cfg)).toBeNull();
    expect(configError({ ...cfg, base: 'main' })).toMatch(/session\/<name>/);
    expect(configError({ ...cfg, base: 'feature/x' })).toMatch(/session\/<name>/);
    expect(configError({ ...cfg, previewIssue: 3 })).toMatch(/--dry-run/);
  });
  it('reads the GitHub slug from the remote', () => {
    expect(slugFromRemote('https://github.com/ephemerallyCaden/qodo-2026.git\n')).toBe('ephemerallyCaden/qodo-2026');
    expect(slugFromRemote('git@github.com:o/r.git')).toBe('o/r');
    expect(slugFromRemote('https://gitlab.com/o/r.git')).toBeNull();
  });
});

describe('redact', () => {
  it('removes tokens and machine paths', () => {
    const text = `ghp_${'a'.repeat(36)} github_pat_${'b'.repeat(30)} AKIAABCDEFGHIJKLMNOP Bearer abc.def.ghi password=hunter2hunter2 /Users/me/repo/x /Users/me/.aws`;
    expect(redact(text, [['/Users/me', '~'], ['/Users/me/repo', '.']])).toBe(
      'gh*_<redacted> github_pat_<redacted> <aws-key-id> Bearer <redacted> password=<redacted> ./x ~/.aws');
  });
});
