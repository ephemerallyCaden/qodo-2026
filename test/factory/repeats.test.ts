import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaults, LABELS } from '../../factory/config.js';
import type { ExecResult } from '../../factory/exec.js';
import { judgeArgs, parseDraft, parseGroupAnswer, readJudge } from '../../factory/judge.js';
import {
  classifyPrRead, emptyLedger, exportStem, ingest, parseLedger, parseLocalExport, prTickets, sources, type Ledger,
} from '../../factory/ledger.js';
import { ledgerFile, runSweep, sweepsLog } from '../../factory/repeats.js';
import type { Finding, ReviewRun } from '../../factory/review.js';
import { acceptanceCriteria } from '../../factory/ticket.js';
import { assertGuardrails, DRAFT, fail, finding, judgeOut, kinded, kindJudge, ok, OWNER, SLUG, World, type FakeIssue, type OwnerPr } from './world.js';

const worlds: World[] = [];
const world = () => {
  const w = new World();
  worlds.push(w);
  return w;
};

afterEach(() => {
  for (const w of worlds.splice(0)) {
    assertGuardrails(w);
    w.cleanup();
  }
});

const judgeCalls = (w: World) => w.callsTo('claude').filter((c) => c.args.includes('--json-schema'));
const proposals = (w: World): FakeIssue[] => [...w.issues.values()].filter((i) => i.labels.has(LABELS.proposal));
const ledger = (w: World): Ledger => JSON.parse(readFileSync(ledgerFile(w.config()), 'utf8')) as Ledger;
const prUrl = (n: number) => `https://github.com/${SLUG}/pull/${n}`;
const qodoReads = (w: World, n: number) => w.callsTo('qodo').filter((c) => c.args.includes(prUrl(n)));
const sweepEvents = (w: World) => w.readLog(sweepsLog(w.config()));
const defaultsLimit = () => defaults('/h', '/r', '/r/.git', 'o/r').prListLimit;
/** The review data a fake owner PR was given (not a failing one). */
const reviewOf = (pr: OwnerPr) => pr.review as { runs: ReviewRun[]; findings: Finding[] };

/** Framing findings on PR #3 (no ticket) and PR #20 (ticket #16): `n` of them, across 2 sources. */
function framing(w: World, n = 3): void {
  w.addOwnerPr(3, [kinded('a1', 'framing')], { startedAt: '2026-11-04T11:34:32.697940Z' });
  w.addOwnerPr(20, Array.from({ length: n - 1 }, (_, i) => kinded(`a${i + 2}`, 'framing')), { ticket: 16, startedAt: '2026-11-06T19:20:00.000000Z' });
}

describe('repeats across sources become one proposal (R5, R6)', () => {
  it('2 findings of a group open nothing', async () => {
    const w = world();
    w.startLedger();
    framing(w, 2);
    const s = await w.sweep();
    expect(s).toMatchObject({ state: 'ok', seeding: false, newFindings: 2, judged: 2, meeting: [], proposed: [] });
    expect(proposals(w)).toEqual([]);
    const l = ledger(w);
    expect(l.findings['a1']!.group).toBe(l.findings['a2']!.group);
  });

  it('the 3rd, across 2 sources, opens one rule-proposal issue with everything the human needs', async () => {
    const w = world();
    w.startLedger();
    w.rules = [{ id: 4689412, name: 'NUL-frame path-listing git output', content: 'Require -z.', severity: 'error' }];
    framing(w);
    const s = await w.sweep();
    expect(s.proposed).toEqual([200]);
    expect(s.meeting).toEqual([{ group: 'g-a1', mistake: DRAFT.mistake, findings: 3, sources: ['#16', 'PR #3'], issue: 200 }]);
    const [issue] = proposals(w);
    expect([...issue!.labels]).toEqual([LABELS.proposal]);
    expect(issue!.author).toBe(OWNER);
    expect(issue!.title).toBe('Rule proposal: Frame path-listing git output on NUL');
    const body = issue!.body;
    expect(body).toContain('**3 Qodo findings from 2 different tickets**');
    for (const [id, pr] of [['a1', 3], ['a2', 20], ['a3', 20]] as const) expect(body).toContain(`| [PR #${pr}](${prUrl(pr)}) | \`${id}\` | [framing] Finding ${id} |`);
    expect(body).toContain(`**The shared mistake:** ${DRAFT.mistake}`);
    expect(body).toContain(`- **What:** ${DRAFT.rule.what}`);
    expect(body).toContain(`- **Where:** ${DRAFT.rule.where}`);
    expect(body).toContain(`- **Why:** ${DRAFT.rule.why}`);
    expect(body).toContain('- **NUL-frame path-listing git output** (rule 4689412, error): Require -z.');
    expect(acceptanceCriteria(body)).toEqual([...DRAFT.criteria, 'Only AGENTS.md changes: no code, tests or other docs.']);
    // One grouping call and one draft; Qodo's rule search gets the draft as its three-line query.
    expect(judgeCalls(w)).toHaveLength(2);
    const search = w.callsTo('qodo').find((c) => c.args[1] === 'rules')!.args;
    expect(search[search.indexOf('--query') + 1]).toBe(`Name: ${DRAFT.rule.name}\nCategory: Correctness\nContent: ${DRAFT.rule.what}`);
    expect(search).toEqual(expect.arrayContaining(['--scopes', '/owner/repo/']));
    expect(ledger(w).groups['g-a1']).toMatchObject({ issue: 200, reported: ['a1', 'a2', 'a3'] });
  });

  it('3 findings within one source open none: a PR and its own ticket\'s local review are one source', async () => {
    const w = world();
    w.startLedger();
    w.addOwnerPr(20, [kinded('b1', 'framing'), kinded('b2', 'framing')], { ticket: 16 });
    w.writeExport('t16-local/t16-qodo-r2.json', [kinded('b3', 'framing')]);
    const s = await w.sweep();
    expect(s.newFindings).toBe(3);
    expect(s.meeting).toEqual([]);
    expect(proposals(w)).toEqual([]);
  });

  it('a 4th finding comments on the open issue instead of opening another', async () => {
    const w = world();
    w.startLedger();
    framing(w);
    await w.sweep();
    w.addOwnerPr(30, [kinded('a4', 'framing', { description: 'Fourth time.' })], { ticket: 25 });
    const s = await w.sweep();
    expect(s.commented).toEqual([200]);
    expect(proposals(w)).toHaveLength(1);
    const comment = w.issues.get(200)!.comments.at(-1)!;
    expect(comment).toMatch(/^\*\*Seen again\.\*\* The agent runner found 1 more Qodo finding\(s\) .* now has 4 findings from 3 different tickets/);
    expect(comment).toContain(`| 1 | [PR #30](${prUrl(30)}) | \`a4\` |`);
    expect(comment).toContain('- `a4`: Fourth time.');
    expect(ledger(w).groups['g-a1']!.reported).toEqual(['a1', 'a2', 'a3', 'a4']);
    // Nothing new: no LLM call, no post.
    const calls = judgeCalls(w).length;
    expect(await w.sweep()).toMatchObject({ commented: [], proposed: [], calls: 0 });
    expect(judgeCalls(w)).toHaveLength(calls);
  });

  it('a local review export counts as its ticket\'s source, and a local id carried into the PR is one finding', async () => {
    const w = world();
    w.startLedger();
    w.writeExport('t16-local/t16-qodo.json', [kinded('c1', 'framing')]);
    w.writeExport('t17-local-r1.json', [kinded('c2', 'framing')]);
    w.writeExport('t17-local-r2.json', [kinded('c3', 'framing')]);
    // The same id on ticket #16's PR: one entry, two places.
    w.addOwnerPr(20, [kinded('c1', 'framing')], { ticket: 16 });
    const s = await w.sweep();
    expect(s).toMatchObject({ exports: 3, newFindings: 3 });
    expect(ledger(w).findings['c1']!.origins).toEqual(['pr:20', 'file:t16-local/t16-qodo.json']);
    expect(s.meeting[0]).toMatchObject({ findings: 3, sources: ['#16', '#17'] });
    const body = proposals(w)[0]!.body;
    expect(body).toContain(`| [PR #20](${prUrl(20)}) | \`c1\` |`);
    expect(body).toContain(`| local review of [#17](https://github.com/${SLUG}/issues/17) (\`t17-local-r1.json\`) | \`c2\` |`);
  });

  it('a Day PR (head session/*) adds findings but never the 2nd source on its own', async () => {
    const w = world();
    w.startLedger();
    w.addOwnerPr(37, [kinded('d1', 'gate')], { ticket: 24 });
    w.addOwnerPr(93, [kinded('d2', 'gate'), kinded('d3', 'gate')], { over: { head: 'session/week1', title: 'Week 2: everything' } });
    const s1 = await w.sweep();
    expect(s1.meeting).toEqual([]);
    expect(proposals(w)).toEqual([]);
    // A second ticket's finding is the real 2nd source; the Day PR's findings still count and are listed.
    w.addOwnerPr(40, [kinded('d4', 'gate')], { ticket: 30 });
    const s2 = await w.sweep();
    expect(s2.meeting).toEqual([expect.objectContaining({ findings: 4, sources: ['#24', '#30'] })]);
    const body = proposals(w)[0]!.body;
    expect(body).toContain('**4 Qodo findings from 2 different tickets**');
    expect(body).toContain(`| [PR #93](${prUrl(93)}) | \`d2\` |`);
  });

  it('keeps finding text to a bounded size, so a judge prompt stays a sane argument (PR #99 0ebf0f6f)', async () => {
    const w = world();
    w.startLedger();
    w.addOwnerPr(3, [finding('long', { title: 't'.repeat(5000), description: 'd'.repeat(100_000) })]);
    await w.sweep();
    const f = ledger(w).findings['long']!;
    expect(f.title.length).toBeLessThanOrEqual(300);
    expect(f.description.length).toBeLessThanOrEqual(2000);
    expect(Math.max(...judgeCalls(w).map((c) => c.input!.length))).toBeLessThan(20_000);
  });

  it('a local export carrying a dismissed finding\'s id never undoes the PR\'s false-positive dismissal (PR #99 30ccac80)', async () => {
    const w = world();
    w.startLedger();
    w.addOwnerPr(20, [kinded('fp', 'framing', { dismiss_reason: 'false_positive' })], { ticket: 16 });
    w.writeExport('t16-local-r1.json', [kinded('fp', 'framing')]);
    await w.sweep();
    expect(ledger(w).findings['fp']).toMatchObject({ falsePositive: true, group: null });
  });

  it('false positives are recorded but never counted', async () => {
    const w = world();
    w.startLedger();
    framing(w);
    reviewOf(w.ownerPrs[1]!).findings[1]!.dismiss_reason = 'false_positive';
    const s = await w.sweep();
    expect(s.meeting).toEqual([]);
    expect(ledger(w).findings['a3']).toMatchObject({ falsePositive: true, group: null });
  });
});

describe('the human decides (R6, R7)', () => {
  it('a proposal passes the runner\'s own ticket checks, so labelling it ready-for-agent works', async () => {
    const w = world();
    w.startLedger();
    framing(w);
    await w.sweep();
    const issue = w.issues.get(200)!;
    expect(acceptanceCriteria(issue.body)!.length).toBeGreaterThan(0);
    // The human approves by labelling it; the runner would claim it like any owner ticket.
    issue.labels.add(LABELS.ready);
    issue.labeler = OWNER;
    expect(await w.tick({ dryRun: true })).toEqual({ state: 'dry-run', issue: 200, decision: 'would claim' });
  });

  it('the runner never labels, relabels or closes a proposal: its only writes are the create and comments', async () => {
    const w = world();
    w.startLedger();
    framing(w);
    await w.sweep();
    w.addOwnerPr(30, [kinded('a4', 'framing')], { ticket: 25 });
    await w.sweep();
    const writes = w.callsTo('gh').filter((c) => !['list', 'view'].includes(c.args[1]!) && c.args[0] !== 'api');
    expect(writes.map((c) => c.args.slice(0, 2).join(' '))).toEqual(['issue create', 'issue comment']);
    expect(writes[0]!.args).toEqual(['issue', 'create', '--repo', SLUG, '--title', expect.any(String), '--body-file', expect.any(String), '--label', LABELS.proposal]);
    expect([...w.issues.get(200)!.labels]).toEqual([LABELS.proposal]);
  });

  it('a proposal the human closed gets no more comments; the findings are still recorded (Qodo local r1 5905af96)', async () => {
    const w = world();
    w.startLedger();
    framing(w);
    await w.sweep();
    w.issues.get(200)!.state = 'CLOSED';
    w.addOwnerPr(30, [kinded('a4', 'framing')], { ticket: 25 });
    const s = await w.sweep();
    expect(s.commented).toEqual([]);
    expect(w.issues.get(200)!.comments).toEqual([]);
    expect(ledger(w).findings['a4']!.group).toBe('g-a1');
    expect(sweepEvents(w).find((e) => e['event'] === 'findings-closed')).toMatchObject({ group: 'g-a1', issue: 200, findings: ['a4'] });
  });

  it('a comment whose ledger save was lost is not posted twice (PR #99 349e84d7)', async () => {
    const w = world();
    w.startLedger();
    framing(w);
    await w.sweep();
    w.addOwnerPr(30, [kinded('a4', 'framing')], { ticket: 25 });
    const before = readFileSync(ledgerFile(w.config()), 'utf8');
    await w.sweep();
    expect(w.issues.get(200)!.comments).toHaveLength(1);
    // The process died after the post, before the save.
    writeFileSync(ledgerFile(w.config()), before);
    const s = await w.sweep();
    expect(s.commented).toEqual([]);
    expect(w.issues.get(200)!.comments).toHaveLength(1);
    expect(ledger(w).groups['g-a1']!.reported).toContain('a4');
  });

  it('another person\'s comment with a marker suppresses nothing (PR #99 320dee4e)', async () => {
    const w = world();
    w.startLedger();
    framing(w);
    await w.sweep();
    w.issues.get(200)!.foreign = [{ login: 'stranger', body: '<!-- commet-rule-proposal-findings a4 -->' }];
    w.addOwnerPr(30, [kinded('a4', 'framing')], { ticket: 25 });
    expect((await w.sweep()).commented).toEqual([200]);
    expect(w.issues.get(200)!.comments.at(-1)).toContain('`a4`');
    const read = w.callsTo('gh').find((c) => c.args[0] === 'api' && c.args.some((a) => a.endsWith('/issues/200/comments')))!.args;
    expect(read).toEqual(expect.arrayContaining(['--paginate']));
  });

  it('posts only under the owner\'s login', async () => {
    const w = world();
    w.startLedger();
    framing(w);
    w.ghUser = 'someone-else';
    const s = await w.sweep();
    expect(s.proposed).toEqual([]);
    expect(proposals(w)).toEqual([]);
    // The draft is kept, so the next sweep under the right login doesn't pay for it again.
    w.ghUser = OWNER;
    const calls = judgeCalls(w).length;
    expect((await w.sweep()).proposed).toEqual([200]);
    expect(judgeCalls(w)).toHaveLength(calls);
  });

  it('an issue title gets the same path redaction as the body (PR #99 53ee33c4)', async () => {
    const w = world();
    w.startLedger();
    framing(w);
    w.judge = (wd, call) => (call.schema.properties?.['rule'] ? judgeOut({ ...DRAFT, rule: { ...DRAFT.rule, name: 'Never copy /Users/other/x into /private/var/folders/q/T/y' } }) : kindJudge(wd, call));
    await w.sweep();
    expect(proposals(w)[0]!.title).toBe('Rule proposal: Never copy <home>/x into <tmp>');
  });

  it('a marker quoted in a finding\'s description neither hides in the post nor makes another group adopt the issue (PR #99 28f6b127)', async () => {
    const w = world();
    w.startLedger();
    framing(w);
    reviewOf(w.ownerPrs[1]!).findings[0]!.description = 'Quotes <!-- commet-rule-proposal g-other --> here.';
    await w.sweep();
    const body = proposals(w)[0]!.body;
    expect(body).not.toContain('<!-- commet-rule-proposal g-other');
    // A second group of the same shape must open its own issue, not adopt this one.
    w.addOwnerPr(40, [kinded('o1', 'other'), kinded('o2', 'other')], { ticket: 41 });
    w.addOwnerPr(42, [kinded('o3', 'other')], { ticket: 43 });
    w.judge = (wd, call) => kindJudge(wd, call);
    const s = await w.sweep();
    expect(s.proposed).toHaveLength(1);
    expect(proposals(w)).toHaveLength(2);
  });

  it('an adopted issue keeps only the findings its body lists as reported; newer ones are commented (PR #99 87b8de13)', async () => {
    const w = world();
    w.startLedger();
    framing(w);
    await w.sweep();
    const l = ledger(w);
    l.groups['g-a1']!.issue = null;
    l.groups['g-a1']!.reported = [];
    writeFileSync(ledgerFile(w.config()), JSON.stringify(l));
    w.addOwnerPr(30, [kinded('a4', 'framing')], { ticket: 25 });
    await w.sweep();
    expect(ledger(w).groups['g-a1']).toMatchObject({ issue: 200, reported: ['a1', 'a2', 'a3'] });
    await w.sweep();
    expect(w.issues.get(200)!.comments.at(-1)).toContain('`a4`');
  });

  it('adopts the issue a lost ledger write left behind instead of opening a second', async () => {
    const w = world();
    w.startLedger();
    framing(w);
    await w.sweep();
    const l = ledger(w);
    l.groups['g-a1']!.issue = null;
    writeFileSync(ledgerFile(w.config()), JSON.stringify(l));
    const s = await w.sweep();
    expect(s.proposed).toEqual([]);
    expect(proposals(w)).toHaveLength(1);
    expect(ledger(w).groups['g-a1']!.issue).toBe(200);
  });
});

describe('fail closed (R4)', () => {
  const failures: [string, () => ExecResult][] = [
    ['a failed read', () => fail()],
    ['a timed-out read', () => ({ code: null, stdout: '', stderr: '', timedOut: true })],
    ['unreadable output', () => ok('Error: upstream down')],
    ['truncated output', () => ok(JSON.stringify({ review_runs: [], findings: [finding('t1')], qar_operation_result_truncated: true }))],
    ['a run still in progress', () => ok(JSON.stringify({ review_runs: [{ commit_sha: 'c'.repeat(40), status: 'in_progress' }], findings: [finding('t1')] }))],
  ];
  it.each(failures)('%s leaves the PR unprocessed, and a later sweep reads it again', async (_, read) => {
    const w = world();
    w.startLedger();
    const pr = w.addOwnerPr(3, [finding('t1')]);
    const good = pr.review;
    pr.review = read;
    const s = await w.sweep();
    expect(s).toMatchObject({ state: 'ok', prsFailed: [3], newFindings: 0 });
    expect(ledger(w).findings).toEqual({});
    expect(ledger(w).prs['3']!.readAt).toBeNull();
    expect(sweepEvents(w).find((e) => e['event'] === 'findings-read-failed')).toMatchObject({ pr: 3, retry: 'next sweep' });
    pr.review = good;
    expect(await w.sweep()).toMatchObject({ prsFailed: [], newFindings: 1 });
    expect(qodoReads(w, 3)).toHaveLength(2);
    // Done only once a second read finds the same ids (PR #99 6fcd135e).
    await w.sweep();
    expect(ledger(w).prs['3']!.readAt).toBe(pr.updatedAt);
  });

  it('a skipped latest review keeps the PR unread, though its earlier findings count', async () => {
    const w = world();
    w.startLedger();
    const pr = w.addOwnerPr(3, [finding('t1')]);
    reviewOf(pr).runs.push({ commit_sha: 'd'.repeat(40), started_at: '2026-11-09T00:00:00Z', status: 'completed', review_effort: 'skip' });
    expect(await w.sweep()).toMatchObject({ newFindings: 1, prsFailed: [] });
    expect(ledger(w).prs['3']!.readAt).toBeNull();
    await w.sweep();
    expect(qodoReads(w, 3)).toHaveLength(2);
  });

  it.each([
    ['no review run at all', (pr: OwnerPr) => { reviewOf(pr).runs = []; }],
    ['no review of its head yet', (pr: OwnerPr) => { pr.headOid = 'e'.repeat(40); }],
  ])('a closed PR with %s keeps its findings but is read again (Qodo local r1 090896c4)', async (_, change) => {
    const w = world();
    w.startLedger();
    const pr = w.addOwnerPr(3, [finding('t1')]);
    change(pr);
    await w.sweep();
    expect(ledger(w).prs['3']!.readAt).toBeNull();
    await w.sweep();
    expect(qodoReads(w, 3)).toHaveLength(2);
  });

  it('a closed PR read whole is not read again until it changes; an open one always is', async () => {
    const w = world();
    w.startLedger();
    const closed = w.addOwnerPr(3, [finding('t1')]);
    w.addOwnerPr(4, [finding('t2')], { over: { state: 'OPEN' } });
    for (let i = 0; i < 3; i++) await w.sweep();
    // Two reads with the same ids settle it; after that only a change brings it back.
    expect(qodoReads(w, 3)).toHaveLength(2);
    expect(qodoReads(w, 4)).toHaveLength(3);
    closed.updatedAt = '2026-11-09T00:00:00Z';
    await w.sweep();
    expect(qodoReads(w, 3)).toHaveLength(3);
  });

  it('a new head\'s first read never settles on the old head\'s ids (PR #99 2981c581)', async () => {
    const w = world();
    w.startLedger();
    const pr = w.addOwnerPr(3, [finding('t1')]);
    await w.sweep();
    await w.sweep();
    expect(ledger(w).prs['3']!.readAt).toBe(pr.updatedAt);
    // A push: a new head, reviewed long enough ago, with the same ids so far.
    pr.headOid = 'f'.repeat(40);
    pr.updatedAt = '2026-11-09T01:00:00Z';
    reviewOf(pr).runs.push({ run_id: 2, commit_sha: pr.headOid, started_at: '2026-11-09T00:30:00Z', status: 'completed', review_effort: 'standard' });
    await w.sweep();
    expect(ledger(w).prs['3']!.readAt).not.toBe(pr.updatedAt);
    await w.sweep();
    expect(ledger(w).prs['3']!.readAt).toBe(pr.updatedAt);
  });

  it('a finding a later run raised on an already-read commit is new, not history (PR #99 88a214cd)', async () => {
    const w = world();
    const pr = w.addOwnerPr(3, [finding('t1')], { startedAt: '2026-11-08T00:00:00Z' });
    await w.sweep();
    expect(ledger(w).findings['t1']!.seed).toBe(true);
    // A second run on the same commit, after install, raises t2 (its git_sha is the old commit).
    w.now += 15 * 60_000;
    const commit = reviewOf(pr).runs[0]!.commit_sha;
    reviewOf(pr).runs.push({ run_id: 2, commit_sha: commit, started_at: new Date(w.now - 10 * 60_000).toISOString(), status: 'completed', review_effort: 'standard' });
    reviewOf(pr).findings.push(finding('t2', { git_sha: commit }));
    await w.sweep();
    expect(ledger(w).findings['t2']!.seed).toBe(false);
  });

  it('a settled closed PR is read again once a day, in case Qodo changed it without GitHub noticing (PR #99 28c34d3f)', async () => {
    const w = world();
    w.startLedger();
    w.addOwnerPr(3, [finding('t1')]);
    await w.sweep();
    await w.sweep();
    await w.sweep();
    expect(qodoReads(w, 3)).toHaveLength(2);
    w.now += 25 * 60 * 60_000;
    await w.sweep();
    expect(qodoReads(w, 3)).toHaveLength(3);
  });

  it('a closed PR is done only once its findings hold still after the review (PR #99 6fcd135e)', async () => {
    const w = world();
    w.startLedger();
    const pr = w.addOwnerPr(3, [finding('t1')], { startedAt: new Date(w.now - 60_000).toISOString() });
    await w.sweep();
    expect(ledger(w).prs['3']!.readAt).toBeNull();
    // A finding lands after the run completed; updatedAt doesn't change.
    w.now += 15 * 60_000;
    reviewOf(pr).findings.push(finding('t2'));
    expect(await w.sweep()).toMatchObject({ newFindings: 1 });
    expect(ledger(w).prs['3']!.readAt).toBeNull();
    w.now += 15 * 60_000;
    await w.sweep();
    expect(ledger(w).prs['3']!.readAt).toBe(pr.updatedAt);
    expect(Object.keys(ledger(w).findings).sort()).toEqual(['t1', 't2']);
  });

  it('an export too big to read is reported as partial, not dropped silently (Qodo local r1 b73b3021)', async () => {
    const w = world();
    w.startLedger();
    w.writeExport('t16-local/t16-qodo.json', [finding('big', { description: 'x'.repeat(6 * 1024 * 1024) })]);
    expect(await w.sweep()).toMatchObject({ exports: 0, exportsPartial: ['t16-local/t16-qodo.json'] });
  });

  it('a local export that is not valid JSON is reported as partial (PR #99 c10f1820)', async () => {
    const w = world();
    w.startLedger();
    w.writeExport('t16-local-r1.json', [finding('l1')]);
    writeFileSync(join(w.evidenceDir, 't16-local-r1.json'), '{"findings": [');
    writeFileSync(join(w.evidenceDir, 'pr46-qodo-review-r1-comments.json'), '{"a":1}\n{"b":2}');
    expect(await w.sweep()).toMatchObject({ exports: 0, exportsPartial: ['t16-local-r1.json'] });
  });

  it('a partial or failed local export is never counted, and is read again', async () => {
    const w = world();
    w.startLedger();
    w.writeExport('t16-local/t16-qodo.json', [finding('l1')], { complete: false });
    w.writeExport('t17-local-r2-incomplete.json', [], { error: true });
    const s = await w.sweep();
    expect(s).toMatchObject({ exports: 0, newFindings: 0, exportsPartial: ['t16-local/t16-qodo.json', 't17-local-r2-incomplete.json'] });
    w.writeExport('t16-local/t16-qodo.json', [finding('l1')]);
    expect(await w.sweep()).toMatchObject({ exports: 1, newFindings: 1, exportsPartial: ['t17-local-r2-incomplete.json'] });
  });

  const garbled: [string, (call: Parameters<typeof kindJudge>[1]) => ExecResult][] = [
    ['an answer that is not JSON', () => judgeOut('I think they match.', { structured: false })],
    ['an unknown group id', (c) => judgeOut({ assignments: ids(c).map((id) => ({ finding: id, group: 'g-nope' })) })],
    ['an unknown finding id', (c) => judgeOut({ assignments: ids(c).map((id, i) => ({ finding: i ? id : 'zzz', group: 'new:x', mistake: 'm.' })) })],
    ['a finding left out', (c) => judgeOut({ assignments: ids(c).slice(1).map((id) => ({ finding: id, group: 'new:x', mistake: 'm.' })) })],
    ['a new group with no mistake', (c) => judgeOut({ assignments: ids(c).map((id) => ({ finding: id, group: 'new:x' })) })],
    ['max turns', () => judgeOut({}, { subtype: 'error_max_turns' })],
  ];
  const ids = (c: Parameters<typeof kindJudge>[1]) => [...c.prompt.matchAll(/"id":"([^"]+)"/g)].map((m) => m[1]!);
  it.each(garbled)('%s opens nothing and decides nothing', async (_, answer) => {
    const w = world();
    w.startLedger();
    framing(w);
    w.judge = (_w, call) => answer(call);
    const s = await w.sweep();
    expect(s).toMatchObject({ judged: 0, proposed: [], meeting: [], waiting: 3 });
    expect(proposals(w)).toEqual([]);
    expect(Object.values(ledger(w).findings).map((f) => [f.group, f.judgeAttempts])).toEqual([[null, 1], [null, 1], [null, 1]]);
    expect(sweepEvents(w).some((e) => e['event'] === 'findings-judge-garbled')).toBe(true);
  });

  it('a finding that keeps garbling goes alone, then is set aside and counted', async () => {
    const w = world();
    w.startLedger();
    w.addOwnerPr(3, [finding('bad'), finding('ok1')]);
    w.judge = (wd, call) => (call.prompt.includes('"bad"') ? judgeOut('nope', { structured: false }) : kindJudge(wd, call));
    await w.sweep();
    expect(ledger(w).findings['ok1']!.group).toBeNull();
    const s2 = await w.sweep();
    expect(ledger(w).findings['ok1']!.group).not.toBeNull();
    expect(s2.unjudgeable).toBe(0);
    const s3 = await w.sweep();
    expect(s3).toMatchObject({ unjudgeable: 1, waiting: 0 });
    expect(ledger(w).findings['bad']).toMatchObject({ unjudgeable: true, judgeAttempts: 3 });
    expect((await w.sweep()).calls).toBe(0);
  });

  it('a group the judge broadens takes the broader name, and is logged', async () => {
    const w = world();
    w.startLedger();
    w.addOwnerPr(3, [kinded('a1', 'framing')]);
    await w.sweep();
    w.addOwnerPr(20, [finding('z9')], { ticket: 16 });
    w.judge = () => judgeOut({ assignments: [{ finding: 'z9', group: 'g-a1', mistake: 'Parses tool output on assumptions it can break.' }] });
    await w.sweep();
    expect(ledger(w).groups['g-a1']!.mistake).toBe('Parses tool output on assumptions it can break.');
    expect(ledger(w).findings['z9']!.group).toBe('g-a1');
    expect(sweepEvents(w).find((e) => e['event'] === 'findings-renamed')).toMatchObject({ group: 'g-a1', from: 'Mistake: framing.' });
  });

  it('a group broadened after its draft was saved, but before it was posted, is drafted again (PR #99 37c1c34b)', async () => {
    const w = world();
    w.startLedger();
    framing(w);
    w.rules = null;
    await w.sweep();
    expect(ledger(w).groups['g-a1']!.draft).toEqual(DRAFT);
    w.rules = [];
    w.addOwnerPr(30, [finding('wide')], { ticket: 25 });
    w.judge = (wd, call) => (call.schema.properties?.['rule'] ? judgeOut({ ...DRAFT, rule: { ...DRAFT.rule, name: 'The broader rule' } })
      : judgeOut({ assignments: [{ finding: 'wide', group: 'g-a1', mistake: 'A broader mistake.' }] }));
    await w.sweep();
    expect(proposals(w)[0]!.title).toBe('Rule proposal: The broader rule');
  });

  it('a garbled draft opens nothing; the next sweep drafts again', async () => {
    const w = world();
    w.startLedger();
    framing(w);
    w.judge = (wd, call) => (call.schema.properties?.['rule'] ? judgeOut({ ...DRAFT, criteria: [] }) : kindJudge(wd, call));
    expect((await w.sweep()).proposed).toEqual([]);
    expect(ledger(w).groups['g-a1']).toMatchObject({ draft: null, draftAttempts: 1, issue: null });
    w.judge = kindJudge;
    expect((await w.sweep()).proposed).toEqual([200]);
  });

  it.each([
    ['error_max_structured_output_retries', { subtype: 'error_max_structured_output_retries', code: 1 }],
    ['error_max_budget_usd', { subtype: 'error_max_budget_usd', code: 1 }],
    ['a refusal (is_error)', { isError: true, code: 1 }],
  ])('a call the model answered but failed (%s) counts against the batch, so it is set aside in the end (PR #99 42e31888)', async (_, over) => {
    const w = world();
    w.startLedger();
    w.addOwnerPr(3, [finding('stuck')]);
    w.judge = () => judgeOut({}, { ...over, cost: 0.2 });
    for (let i = 0; i < 3; i++) await w.sweep();
    expect(ledger(w).findings['stuck']).toMatchObject({ judgeAttempts: 3, unjudgeable: true });
    expect((await w.sweep()).calls).toBe(0);
  });

  it('a call that never reached the model (no cost) is an infrastructure failure, not the batch\'s fault (PR #99 42e31888)', async () => {
    const w = world();
    w.startLedger();
    w.addOwnerPr(3, [finding('t1')]);
    w.judge = () => judgeOut({}, { isError: true, code: 1, cost: 0 });
    await w.sweep();
    expect(ledger(w).findings['t1']!.judgeAttempts).toBe(0);
  });

  it('a failed judge call stops judging for this sweep without counting against the findings', async () => {
    const w = world();
    w.startLedger();
    framing(w);
    w.judge = () => fail();
    const s = await w.sweep();
    expect(s).toMatchObject({ calls: 1, judged: 0, waiting: 3 });
    expect(Object.values(ledger(w).findings).every((f) => f.judgeAttempts === 0)).toBe(true);
  });

  it('after a failed judge call, the sweep makes no more LLM calls, drafts included (Qodo local r1 4ab989af)', async () => {
    const w = world();
    w.startLedger();
    framing(w);
    // A garbled draft leaves the group at the threshold, undrafted.
    w.judge = (wd, call) => (call.schema.properties?.['rule'] ? judgeOut({}) : kindJudge(wd, call));
    await w.sweep();
    w.addOwnerPr(30, [finding('n1')], { ticket: 25 });
    w.judge = () => fail();
    expect(await w.sweep()).toMatchObject({ calls: 1, proposed: [] });
  });

  it('past its time budget the sweep reads no more local exports (PR #99 5e7378c6)', async () => {
    const w = world();
    w.startLedger();
    w.writeExport('t16-local-r1.json', [finding('l1')]);
    // The PR list read eats the whole budget.
    const exec: typeof w.exec = async (cmd, args, opts) => {
      if (args[0] === 'pr' && args[1] === 'list') w.now += 25 * 60_000;
      return w.exec(cmd, args, opts);
    };
    const s = await runSweep(w.config({ sweepMaxCalls: 20 }), { exec, clock: w.clock, env: {}, print: () => {} }, { seedThrough: null });
    expect(s.exports).toBe(0);
    expect(sweepEvents(w).find((e) => e['event'] === 'findings-out-of-time')).toMatchObject({ stopped: 'local exports' });
  });

  it('a draft that runs past the budget posts nothing this sweep (PR #99 a53a285e)', async () => {
    const w = world();
    w.startLedger();
    framing(w);
    w.judge = (wd, call) => {
      if (call.schema.properties?.['rule']) wd.now += 25 * 60_000;
      return kindJudge(wd, call);
    };
    expect((await w.sweep()).proposed).toEqual([]);
    expect(proposals(w)).toEqual([]);
    expect(ledger(w).groups['g-a1']!.draft).toEqual(DRAFT);
    w.judge = kindJudge;
    expect((await w.sweep()).proposed).toEqual([200]);
  });

  it('past its time budget the sweep starts no proposal work (PR #99 5e7378c6)', async () => {
    const w = world();
    w.startLedger();
    framing(w);
    w.rules = null;
    await w.sweep();
    expect(ledger(w).groups['g-a1']!.draft).toEqual(DRAFT);
    // Next sweep: the draft is cached, but judging a new finding takes past the 20-minute budget.
    w.rules = [];
    w.addOwnerPr(30, [finding('slow')], { ticket: 25 });
    w.judge = (wd, call) => {
      wd.now += 25 * 60_000;
      return kindJudge(wd, call);
    };
    expect((await w.sweep()).proposed).toEqual([]);
    expect(proposals(w)).toEqual([]);
    expect(sweepEvents(w).find((e) => e['event'] === 'findings-out-of-time')).toMatchObject({ stopped: 'proposals' });
  });

  it('no Midway session: no judge call, findings wait', async () => {
    const w = world();
    w.startLedger();
    framing(w);
    w.setCookieHours(-1);
    expect(await w.sweep()).toMatchObject({ calls: 0, waiting: 3, newFindings: 3 });
  });

  it('a failed rule search opens nothing; the next sweep retries without drafting again', async () => {
    const w = world();
    w.startLedger();
    framing(w);
    w.rules = null;
    expect((await w.sweep()).proposed).toEqual([]);
    expect(ledger(w).groups['g-a1']!.draft).toEqual(DRAFT);
    w.rules = [];
    const calls = judgeCalls(w).length;
    expect((await w.sweep()).proposed).toEqual([200]);
    expect(judgeCalls(w)).toHaveLength(calls);
    expect(proposals(w)[0]!.body).toContain('`qodo read rules search` found no related rule.');
  });

  it('a damaged ledger stops the sweep and is never reset', async () => {
    const w = world();
    w.startLedger();
    writeFileSync(ledgerFile(w.config()), '{"version": 1, "prs": ');
    framing(w);
    const s = await w.sweep();
    expect(s).toMatchObject({ state: 'error', reason: expect.stringContaining('findings ledger is damaged') });
    expect(s.reason).not.toContain(w.root);
    expect(readFileSync(ledgerFile(w.config()), 'utf8')).toBe('{"version": 1, "prs": ');
    expect(w.callsTo('qodo')).toHaveLength(0);
  });
});

describe('seeding (R9)', () => {
  it('the first sweep records history and opens nothing; a later finding of that history proposes', async () => {
    const w = world();
    framing(w);
    const s1 = await w.sweep();
    expect(s1).toMatchObject({ seeding: true, newFindings: 3, judged: 3, proposed: [] });
    // History at the threshold is reported, but never proposed on its own.
    expect(s1.meeting).toHaveLength(1);
    expect(proposals(w)).toEqual([]);
    expect(Object.values(ledger(w).findings).every((f) => f.seed)).toBe(true);
    // R3: nothing new, no LLM call and still nothing proposed.
    const s2 = await w.sweep();
    expect(s2).toMatchObject({ seeding: false, calls: 0, proposed: [] });
    w.addOwnerPr(30, [kinded('a4', 'framing')], { ticket: 25, startedAt: '2026-11-10T00:00:00Z' });
    const s3 = await w.sweep();
    expect(s3.proposed).toEqual([200]);
    expect(proposals(w)[0]!.body).toContain('**4 Qodo findings from 3 different tickets**');
  });

  it('history a seeding sweep could not read is still history when a later sweep reads it (Qodo local r1 56807c1e)', async () => {
    const w = world();
    framing(w);
    const pr20 = w.ownerPrs[1]!;
    const good = pr20.review;
    pr20.review = () => fail();
    w.now = Date.parse('2026-11-09T00:00:00Z');
    expect(await w.sweep()).toMatchObject({ seeding: true, prsFailed: [20] });
    pr20.review = good;
    const s2 = await w.sweep();
    expect(s2).toMatchObject({ seeding: false, newFindings: 2, proposed: [] });
    expect(Object.values(ledger(w).findings).every((f) => f.seed)).toBe(true);
    expect(proposals(w)).toEqual([]);
  });

  it('--seed-through <PR> makes later PRs new, so the next sweep proposes', async () => {
    const w = world();
    w.addOwnerPr(3, [kinded('a1', 'framing')], { startedAt: '2026-11-04T11:34:32.697940Z' });
    w.writeExport('t16-local/t16-qodo.json', [kinded('a2', 'framing')], { startedAt: '2026-11-06T15:01:00.000000+00:00' });
    w.addOwnerPr(20, [kinded('a3', 'framing')], { ticket: 16, startedAt: '2026-11-06T19:20:00.000000Z' });
    const s1 = await w.sweep({ seedThrough: 3 });
    expect(s1).toMatchObject({ seeding: true, proposed: [] });
    const l = ledger(w);
    expect([l.findings['a1']!.seed, l.findings['a2']!.seed, l.findings['a3']!.seed]).toEqual([true, false, false]);
    expect(sweepEvents(w).find((e) => e['event'] === 'findings-seed')).toMatchObject({ through: 3, cutoff: '2026-11-04T11:34:32.697Z', history: 1, new: 2 });
    expect((await w.sweep()).proposed).toEqual([200]);
  });

  it('--seed-through a PR the ledger has no review of is an error', async () => {
    const w = world();
    expect(await w.sweep({ seedThrough: 99 })).toMatchObject({ state: 'error', reason: expect.stringContaining('PR #99') });
  });
});

describe('cost and scope (R1, R3, R10)', () => {
  it('caps LLM calls per sweep, logs it, and leaves the rest for the next sweep', async () => {
    const w = world();
    w.startLedger();
    w.addOwnerPr(3, ['x1', 'x2', 'x3', 'x4', 'x5'].map((id) => finding(id)));
    const s1 = await w.sweep({}, { sweepMaxCalls: 1, judgeBatch: 2 });
    expect(s1).toMatchObject({ calls: 1, judged: 2, waiting: 3, capped: true });
    expect(sweepEvents(w).find((e) => e['event'] === 'findings-cap')).toMatchObject({ maxCalls: 1, left: 3, retry: 'next sweep' });
    const s2 = await w.sweep({}, { sweepMaxCalls: 5, judgeBatch: 2 });
    expect(s2).toMatchObject({ calls: 2, judged: 3, waiting: 0, capped: false });
  });

  it('asks for up to 1000 PRs and logs when the list may be cut off (Qodo local r1 569eabea)', async () => {
    const w = world();
    w.startLedger();
    for (let n = 1; n <= 3; n++) w.addOwnerPr(n, []);
    await w.sweep({}, { prListLimit: 3 });
    expect(w.callsTo('gh').find((c) => c.args[1] === 'list')!.args).toEqual(expect.arrayContaining(['--limit', '3']));
    expect(sweepEvents(w).find((e) => e['event'] === 'findings-pr-list-full')).toMatchObject({ limit: 3 });
    expect(defaultsLimit()).toBe(1000);
  });

  it('reads only PRs the owner opened, even if the search lets others through', async () => {
    const w = world();
    w.startLedger();
    w.authorSearchLeaks = true;
    w.addOwnerPr(3, [finding('o1')]);
    w.addOwnerPr(5, [finding('s1')], { over: { author: 'stranger' } });
    const s = await w.sweep();
    expect(s.prsRead).toBe(1);
    expect(qodoReads(w, 5)).toHaveLength(0);
    expect(ledger(w).findings['s1']).toBeUndefined();
    expect(sweepEvents(w).find((e) => e['event'] === 'findings-ignored')).toMatchObject({ prs: [5] });
  });

  it('a judge call is fresh, tool-less, unsaved and on the user\'s settings only, from HOME (PR #104 rules)', async () => {
    const w = world();
    w.startLedger();
    framing(w);
    await w.sweep();
    for (const c of judgeCalls(w)) {
      expect(c.args).toEqual(expect.arrayContaining(['--tools', '', '--no-session-persistence', '--strict-mcp-config', '--permission-mode', 'dontAsk']));
      expect(c.args.slice(c.args.indexOf('--setting-sources'), c.args.indexOf('--setting-sources') + 2)).toEqual(['--setting-sources', 'user']);
      expect(c.args).not.toContain('--resume');
      // The prompt goes on stdin, so a large catalogue can't outgrow the argument limit (PR #99 3edb1940).
      expect(c.input).toContain('<findings>');
      expect(c.args.join(' ')).not.toContain('<findings>');
      // Never a temp dir: agent-run code can write those.
      expect(c.cwd).toBe(w.home);
      expect(c.cwd).not.toBe(tmpdir());
      expect(c.env?.['GH_TOKEN']).toBe('');
    }
  });

  it('a dry-run sweep reads and judges but writes nothing', async () => {
    const w = world();
    w.startLedger();
    framing(w);
    const s = await w.sweep({}, { dryRun: true });
    expect(s.would).toEqual([`open "Rule proposal: ${DRAFT.rule.name}" for g-a1 (3 findings from 2 sources): ${DRAFT.mistake}`]);
    expect(proposals(w)).toEqual([]);
    expect(ledger(w)).toEqual(emptyLedger('2000-01-01T00:00:00.000Z'));
    expect(existsSync(sweepsLog(w.config()))).toBe(false);
  });
});

describe('privacy (R8)', () => {
  it.each([['/private/var/folders/x/src/a.ts'], ['C:\\Users\\me\\src\\a.ts'], ['~/src/a.ts'], ['../outside/a.ts'], ['src/a`](https://evil.example)`.ts'], ['src/a\nb.ts']])('keeps only a repo-relative file, never %s (Qodo local r1 977bb86d)', async (path) => {
    const w = world();
    w.startLedger();
    framing(w);
    reviewOf(w.ownerPrs[1]!).findings[0]!.location = { file_path: path, start_line: 1, end_line: 2 };
    await w.sweep();
    expect(ledger(w).findings['a2']!.file).toBeNull();
    expect(proposals(w)[0]!.body).not.toContain(path);
  });

  it('a proposal carries Qodo text and links only: no machine paths, mentions or evidence', async () => {
    const w = world();
    w.startLedger();
    framing(w);
    Object.assign(reviewOf(w.ownerPrs[1]!).findings[0]!, {
      description: `Reads ${w.repoDir}/src/x.ts and ${w.home}/.claude/projects for @someone; temp /private/var/folders/ab/T/x and /Users/other/y.`,
      evidence: { explanation: 'CANARY-EXPLANATION', citations: [{ source: 'src/x.ts[1-2]', citation: 'CANARY-CODE' }] },
    });
    await w.sweep();
    const posted = proposals(w)[0]!.body;
    expect(posted).toContain('Reads ./src/x.ts and ~/.claude/projects for @\u200bsomeone; temp <tmp> and <home>/y.');
    expect(posted).not.toContain(w.root);
    expect(posted).not.toContain('CANARY');
    expect(posted).not.toMatch(/@someone/);
    // Other machine-local paths in Qodo's text are scrubbed too (PR #99 a7fb98cb).
    expect(posted).not.toContain('/private/var/folders/');
    expect(readFileSync(ledgerFile(w.config()), 'utf8')).not.toContain('CANARY');
  });
});

// ----- the pure parts -----

describe('sources (R5)', () => {
  it('reads the tickets a PR works on', () => {
    expect(prTickets({ title: 'feat(core): layout() and layout.json (#18)', body: 'Closes #18', headRefName: 'feature/18-layout' })).toEqual([18]);
    expect(prTickets({ title: 'feat(server): fog (#32 AC 8)', body: 'Closes #32\nAlso fixes #54.', headRefName: 'feature/32-fog-wiring' })).toEqual([32, 54]);
    expect(prTickets({ title: 'fix(factory): timer (#24 run 1)', body: '', headRefName: 'feature/runner-timer' })).toEqual([]);
    expect(prTickets({ title: 'x', body: 'Closes #24', headRefName: 'agent/24-scan-x-2' })).toEqual([24]);
  });

  it('a Day PR neither merges the tickets it closes nor bridges them through findings it shares (PR #99 cd40c8b1)', () => {
    const l = emptyLedger('2000-01-01T00:00:00.000Z');
    const pr = (number: number, head: string, tickets: number[]) => {
      l.prs[number] = { number, head, tickets, readAt: null, lastReviewAt: null };
    };
    pr(93, 'session/week1', [16, 33]);
    pr(20, 'feature/16-x', [16]);
    pr(50, 'feature/33-x', [33]);
    ingest(l, 'pr:20', [finding('a')], () => null);
    ingest(l, 'pr:50', [finding('b')], () => null);
    ingest(l, 'pr:93', [finding('a'), finding('b'), finding('d')], () => null);
    const src = sources(l);
    expect(src.of(l.findings['a']!)).not.toBe(src.of(l.findings['b']!));
    expect([src.label(src.of(l.findings['a']!)).text, src.label(src.of(l.findings['b']!)).text]).toEqual(['#16', '#33']);
    expect([src.counted(l.findings['a']!), src.counted(l.findings['d']!)]).toEqual([true, false]);
  });

  it.each([
    ['t16-local/t16-qodo-r2.json', 't16'], ['t18-local-qodo-review-r1.json', 't18'], ['t31b-local-qodo-review-r3.json', 't31b'],
    ['t32ac8-local-qodo-review-r2-incomplete.json', 't32ac8'], ['day5-rules-local-r1.json', 'day5-rules'], ['qodo-local-review-r2.json', 'qodo-local-review'],
    ['day1-qodo-local-review.json', 'day1'], ['pr-view/qodo-local-r1.json', 'pr-view'], ['pr27-rereview-local.json', 'pr27'],
    ['repeat-findings-local-r1.json', 'repeat-findings'],
  ])('files %s under %s', (path, stem) => expect(exportStem(path)).toBe(stem));

  it('joins a PR, its tickets, its branch\'s local exports and shared ids, but not a shared session branch', () => {
    const l = emptyLedger('2000-01-01T00:00:00.000Z');
    const pr = (number: number, head: string, tickets: number[]) => {
      l.prs[number] = { number, head, tickets, readAt: null, lastReviewAt: null };
    };
    pr(36, 'docs/day5-rules', []);
    pr(55, 'feature/30-view', [30]);
    pr(4, 'session/week1', [5]);
    pr(8, 'session/week1', []);
    pr(12, 'fix/local-review', []);
    pr(99, 'feature/repeat-findings', []);
    for (const f of ['day5-rules-local-r1.json', 'pr-view/qodo-local-r1.json', 't30-local-r1.json', 'qodo-local-review-r3.json', 'misc-local-r1.json', 'feature-repeat-findings-local-r1.json']) {
      l.files[f] = { size: 1, mtimeMs: 1, done: true };
    }
    const add = (id: string, origin: string) => ingest(l, origin, [finding(id)], () => null);
    add('f36', 'pr:36'); add('d5', 'file:day5-rules-local-r1.json');
    add('f55', 'pr:55'); add('pv', 'file:pr-view/qodo-local-r1.json'); add('t30', 'file:t30-local-r1.json');
    add('f4', 'pr:4'); add('f8', 'pr:8');
    add('f12', 'pr:12'); add('lr', 'file:qodo-local-review-r3.json'); add('f12', 'file:qodo-local-review-r3.json');
    add('mi', 'file:misc-local-r1.json');
    add('frpr', 'pr:99'); add('fr', 'file:feature-repeat-findings-local-r1.json');
    const src = sources(l);
    const of = (id: string) => src.of(l.findings[id]!);
    expect(of('d5')).toBe(of('f36'));
    expect(of('pv')).toBe(of('f55'));
    expect(of('t30')).toBe(of('f55'));
    expect(of('lr')).toBe(of('f12'));
    expect(of('f4')).not.toBe(of('f8'));
    // PR #99 ead2defd: an export named after the whole branch, slashes flattened, joins that PR.
    expect(of('fr')).toBe(of('frpr'));
    // Day PRs (#4 and #8 here) never supply a source; a finding also seen elsewhere takes that place's.
    expect(src.counted(l.findings['f8']!)).toBe(false);
    expect(src.counted(l.findings['f4']!)).toBe(false);
    expect(src.counted(l.findings['f12']!)).toBe(true);
    add('f8', 'file:misc-local-r1.json');
    expect(sources(l).counted(l.findings['f8']!)).toBe(true);
    expect(of('mi')).not.toBe(of('f12'));
    expect(src.label(of('f55')).text).toBe('#30');
    expect(src.label(of('f36')).text).toBe('PR #36');
    expect(src.label(of('mi')).text).toBe('local review "misc"');
  });
});

describe('reads (R2, R4)', () => {
  const run = (over: object = {}) => ({ commit_sha: 'c'.repeat(40), started_at: '2026-11-04T11:00:00Z', status: 'completed', review_effort: 'standard', ...over });
  const read = (runs: object[], head = 'c'.repeat(40)) => classifyPrRead(ok(JSON.stringify({ review_runs: runs, findings: [] })), head);

  it('classifies a PR read: aborted and superseded runs are over, a new status is not', () => {
    expect(read([run(), run({ status: 'aborted' }), run({ status: 'superseded' })])).toMatchObject({ kind: 'complete', unfinished: null });
    expect(read([run({ status: 'queued_v2' })])).toEqual({ kind: 'failed', why: 'a review run is queued_v2' });
    expect(read([run(), run({ started_at: '2026-11-05T00:00:00Z', review_effort: 'skip' })]))
      .toMatchObject({ kind: 'complete', unfinished: 'its latest review was skipped', lastReviewAt: '2026-11-04T11:00:00.000Z' });
    expect(read([run()], 'd'.repeat(40))).toMatchObject({ kind: 'complete', unfinished: 'no review of its head yet' });
    expect(read([])).toMatchObject({ kind: 'complete', unfinished: 'no review of its head yet' });
  });

  it('reads a local export only when it is complete', () => {
    const exp = (o: object) => JSON.stringify({ findings: [finding('x')], finding_state: { complete: true }, meta: { coverage: { complete: true }, run: { effort: { effective: 'standard' }, timing: { started_at: '2026-11-11T19:24:21.585517+00:00' } } }, ...o });
    expect(parseLocalExport(exp({}))).toMatchObject({ kind: 'export', reviewedAt: '2026-11-11T19:24:21.585Z' });
    expect(parseLocalExport(exp({ finding_state: { complete: false } }))).toMatchObject({ kind: 'partial' });
    expect(parseLocalExport(exp({ meta: { coverage: { complete: false } } }))).toMatchObject({ kind: 'partial' });
    expect(parseLocalExport(exp({ meta: { run: { effort: { effective: 'standard' } } } }))).toMatchObject({ kind: 'partial' });
    expect(parseLocalExport(exp({ meta: { run: { effort: { effective: 'skip' } } } }))).toMatchObject({ kind: 'partial' });
    expect(parseLocalExport('{"error":{"message":"review failed"}}')).toMatchObject({ kind: 'partial' });
    // PR #99 d1546926: an error is partial even beside findings and complete-looking state.
    expect(parseLocalExport(exp({ error: { message: 'review failed' } }))).toMatchObject({ kind: 'partial' });
    expect(parseLocalExport('{"page":1,"rules":[]}')).toEqual({ kind: 'other' });
    expect(parseLocalExport('[1,2]')).toEqual({ kind: 'other' });
  });

  it('the same id seen again is the same finding', () => {
    const l = emptyLedger('2026-11-05T00:00:00.000Z');
    expect(ingest(l, 'pr:3', [finding('x')], () => '2026-11-06T00:00:00.000Z')).toEqual(['x']);
    expect(ingest(l, 'pr:3', [finding('x', { title: 'Changed' })], () => null)).toEqual([]);
    expect(ingest(l, 'file:t3-local.json', [finding('x', { dismiss_reason: 'false_positive' })], () => null)).toEqual([]);
    expect(ingest(l, 'pr:4', [finding('old')], () => '2026-11-04T00:00:00.000Z')).toEqual(['old']);
    expect([l.findings['x']!.seed, l.findings['old']!.seed]).toEqual([false, true]);
    expect(l.findings['x']).toMatchObject({ title: 'Finding x', origins: ['pr:3', 'file:t3-local.json'], falsePositive: true });
  });

  it('refuses a ledger that is not one', () => {
    const empty = emptyLedger('2026-11-05T00:00:00.000Z');
    expect(parseLedger(JSON.stringify(empty))).toEqual(empty);
    expect(parseLedger('{"version":2,"seedCutoff":"x","prs":{},"files":{},"findings":{},"groups":{}}')).toBeNull();
    expect(parseLedger('{"version":1,"prs":{},"files":{},"findings":{},"groups":{}}')).toBeNull();
    expect(parseLedger('{"version":1,"seedCutoff":"x","prs":{},"files":{},"findings":{"x":{"id":"x"}},"groups":{}}')).toBeNull();
    // PR #99 2f5480fe: a finding in a group the ledger doesn't have is damage too.
    expect(parseLedger('{"version":1,"seedCutoff":"x","prs":{},"files":{},"findings":{"x":{"id":"x","origins":["pr:1"],"group":"g-gone"}},"groups":{}}')).toBeNull();
    // PR #99 6d3239b8: an empty or non-string origin is damage, refused at the boundary.
    expect(parseLedger('{"version":1,"seedCutoff":"x","prs":{},"files":{},"findings":{"x":{"id":"x","origins":[]}},"groups":{}}')).toBeNull();
    expect(parseLedger('{"version":1,"seedCutoff":"x","prs":{},"files":{},"findings":{"x":{"id":"x","origins":[3]}},"groups":{}}')).toBeNull();
    expect(parseLedger('nope')).toBeNull();
  });
});

describe('judge answers (R4)', () => {
  const groups = new Set(['g-1']);
  it('accepts one placement per finding into known or new groups', () => {
    expect(parseGroupAnswer({ assignments: [
      { finding: 'a', group: 'g-1' }, { finding: 'b', group: 'new:x', mistake: '  Frames\noutput badly. ' }, { finding: 'c', group: 'new:x' },
    ] }, ['a', 'b', 'c'], groups)).toEqual([
      { finding: 'a', group: 'g-1' }, { finding: 'b', label: 'x', mistake: 'Frames output badly.' }, { finding: 'c', label: 'x', mistake: 'Frames output badly.' },
    ]);
  });

  it('takes a broader name for an existing group', () => {
    expect(parseGroupAnswer({ assignments: [{ finding: 'a', group: 'g-1', mistake: 'Broader.' }, { finding: 'b', group: 'g-1', mistake: '' }] }, ['a', 'b'], groups))
      .toEqual([{ finding: 'a', group: 'g-1', rename: 'Broader.' }, { finding: 'b', group: 'g-1' }]);
  });

  it.each([
    ['null', null], ['no list', {}], ['a duplicate', { assignments: [{ finding: 'a', group: 'g-1' }, { finding: 'a', group: 'g-1' }] }],
    ['a bad label', { assignments: [{ finding: 'a', group: 'new:has space', mistake: 'm' }, { finding: 'b', group: 'g-1' }] }],
    ['an overlong mistake', { assignments: [{ finding: 'a', group: 'new:x', mistake: 'm'.repeat(501) }, { finding: 'b', group: 'g-1' }] }],
    ['an overlong new name for a group', { assignments: [{ finding: 'a', group: 'g-1', mistake: 'm'.repeat(501) }, { finding: 'b', group: 'g-1' }] }],
  ])('refuses %s', (_, answer) => expect(parseGroupAnswer(answer, ['a', 'b'], groups)).toBeNull());

  it('refuses an incomplete draft', () => {
    expect(parseDraft(DRAFT)).toEqual(DRAFT);
    expect(parseDraft({ ...DRAFT, category: 'Vibes' })).toBeNull();
    expect(parseDraft({ ...DRAFT, rule: { ...DRAFT.rule, why: '' } })).toBeNull();
    expect(parseDraft({ ...DRAFT, criteria: ['ok', 3] })).toBeNull();
    // PR #99 697440e9: the schema's 2 to 4 criteria, no more and no fewer.
    expect(parseDraft({ ...DRAFT, criteria: ['only one'] })).toBeNull();
    expect(parseDraft({ ...DRAFT, criteria: ['a', 'b', 'c', 'd', 'e'] })).toBeNull();
    expect(parseDraft({ ...DRAFT, rule: { ...DRAFT.rule, what: 'w'.repeat(2001) } })).toBeNull();
    expect(parseDraft({ ...DRAFT, rule: { ...DRAFT.rule, what: 'w'.repeat(1000) } })).not.toBeNull();
  });

  it('reads the structured output, or a JSON result, and tells a failed call from a bad answer', () => {
    expect(readJudge(judgeOut({ a: 1 }))).toMatchObject({ ok: true, answer: { a: 1 }, costUsd: 0.1 });
    expect(readJudge(judgeOut({ a: 1 }, { structured: false }))).toMatchObject({ ok: true, answer: { a: 1 } });
    expect(readJudge({ code: 1, stdout: '', stderr: '', timedOut: false })).toMatchObject({ ok: false, infra: true });
    expect(readJudge({ code: null, stdout: '', stderr: '', timedOut: true })).toMatchObject({ ok: false, infra: true });
    expect(readJudge(judgeOut({}, { subtype: 'error_max_turns' }))).toMatchObject({ ok: false, infra: false });
    expect(readJudge(judgeOut({}, { subtype: 'error_max_structured_output_retries', code: 1 }))).toMatchObject({ ok: false, infra: false });
    expect(readJudge(judgeOut({}, { subtype: 'error_during_execution', code: 1, cost: 0 }))).toMatchObject({ ok: false, infra: true });
    expect(readJudge(judgeOut({}, { isError: true, cost: 0 }))).toMatchObject({ ok: false, infra: true });
    expect(readJudge(judgeOut('free text', { structured: false }))).toMatchObject({ ok: true, answer: 'free text' });
  });

  it('builds a call with no tools and no saved session, the prompt kept off the command line (PR #99 3edb1940)', () => {
    const args = judgeArgs({ system: 's', prompt: 'THE-PROMPT', schema: { type: 'object' } }, 1);
    expect(args[0]).toBe('-p');
    expect(args).not.toContain('THE-PROMPT');
    expect(args).toEqual(expect.arrayContaining(['--tools', '', '--no-session-persistence', '--json-schema', '{"type":"object"}', '--system-prompt', 's']));
  });
});
