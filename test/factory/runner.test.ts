import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DENIED_TOOLS } from '../../factory/agent.js';
import { LABELS } from '../../factory/config.js';
import {
  assertGuardrails, BASE, claudeOut, COOKIE_VALUE, FAKE_TOKEN, finding, firstHeadOnly, fixDone, implementDone, OWNER, promptOf,
  RUNNER_SECRETS, T0, World,
} from './world.js';

const worlds: World[] = [];
const world = () => {
  const w = new World();
  worlds.push(w);
  return w;
};

// R8 and task AC1: across every scenario, nothing merges, pushes main or the session branch, or force-pushes.
afterEach(() => {
  for (const w of worlds.splice(0)) {
    assertGuardrails(w);
    w.cleanup();
  }
});

const labels = (w: World, n: number) => [...w.issues.get(n)!.labels].sort();
const runLog = (w: World) => w.readLog(join(w.runDir(), 'log.jsonl'));
const agentError = () => claudeOut({ subtype: 'error_during_execution', is_error: true, code: 1 });
const events = (w: World) => runLog(w).map((e) => e['event']);

describe('pick (R1)', () => {
  it('a tick with nothing labelled is idle and only lists issues', async () => {
    const w = world();
    w.addIssue(5, { labels: new Set() });
    expect(await w.tick()).toEqual({ state: 'idle' });
    expect(w.callsTo('gh').map((c) => c.args.slice(0, 2).join(' '))).toEqual(['issue list']);
    expect(w.callsTo('claude')).toHaveLength(0);
    expect(w.callsTo('qodo')).toHaveLength(0);
    const ticks = w.readLog(join(w.commonDir, 'factory/ticks.jsonl'));
    expect(ticks.map((e) => e['event'])).toEqual(['tick', 'exec', 'idle']);
    expect(existsSync(join(w.commonDir, 'factory/runs'))).toBe(false);
  });

  it('takes the oldest of several labelled tickets, by creation time, and leaves the rest', async () => {
    const w = world();
    w.addIssue(30, { createdAt: '2026-11-01T00:00:00Z' });
    w.addIssue(12, { createdAt: '2026-11-05T00:00:00Z' });
    w.addIssue(20, { createdAt: '2026-10-30T00:00:00Z' });
    w.claude.push(agentError);
    const out = await w.tick();
    expect(out).toMatchObject({ issue: 20 });
    expect(labels(w, 20)).toEqual([LABELS.help]);
    expect(labels(w, 12)).toEqual([LABELS.ready]);
    expect(labels(w, 30)).toEqual([LABELS.ready]);
  });
});

describe('a run that died mid-way (Qodo PR37 db513e99)', () => {
  it('a locked tick marks an orphaned agent-working ticket needs-help, then carries on', async () => {
    const w = world();
    w.addIssue(21, { labels: new Set([LABELS.working]), createdAt: '2026-11-01T00:00:00Z' });
    w.addIssue(24);
    w.claude.push(agentError);
    const out = await w.tick();
    expect(labels(w, 21)).toEqual([LABELS.help]);
    expect(w.issues.get(21)!.comments[0]).toMatch(/stopped mid-run/);
    expect(out).toMatchObject({ issue: 24 });
    expect(w.callsTo('gh').filter((c) => c.args[1] === 'list')).toHaveLength(1);
  });

  it('an idle tick with an orphan still makes one list call, then sweeps', async () => {
    const w = world();
    w.addIssue(21, { labels: new Set([LABELS.working]) });
    expect(await w.tick()).toEqual({ state: 'idle' });
    expect(labels(w, 21)).toEqual([LABELS.help]);
  });

  it('a dry run only says it would', async () => {
    const w = world();
    w.addIssue(21, { labels: new Set([LABELS.working]) });
    expect(await w.tick({ dryRun: true })).toEqual({ state: 'idle' });
    expect(labels(w, 21)).toEqual([LABELS.working]);
    expect(w.issues.get(21)!.comments).toEqual([]);
  });
});

describe('refuse before any agent (R3, R12)', () => {
  it('refuses a ticket without an Acceptance criteria section: needs-help, a comment, no agent', async () => {
    const w = world();
    w.addIssue(7, { body: 'Please make it faster.' });
    expect(await w.tick()).toMatchObject({ state: 'refused', issue: 7 });
    expect(labels(w, 7)).toEqual([LABELS.help]);
    expect(w.issues.get(7)!.comments[0]).toMatch(/no `## Acceptance criteria` section.*No agent was started/s);
    expect(w.callsTo('claude')).toHaveLength(0);
    expect(w.gitCalls('worktree')).toHaveLength(0);
    expect(events(w)).toContain('decision');
  });

  it('refuses an Acceptance criteria section with no criteria in it', async () => {
    const w = world();
    w.addIssue(7, { body: '## Acceptance criteria\n\n## Notes\n- not a criterion\n' });
    expect(await w.tick()).toMatchObject({ state: 'refused', reason: expect.stringContaining('lists no criteria') });
  });

  it('refuses an issue opened by someone other than the repo owner', async () => {
    const w = world();
    w.addIssue(8, { author: 'stranger' });
    expect(await w.tick()).toMatchObject({ state: 'refused', reason: expect.stringContaining('opened by @stranger') });
    expect(labels(w, 8)).toEqual([LABELS.help]);
    expect(w.callsTo('claude')).toHaveLength(0);
  });

  it('refuses an issue labelled by someone other than the repo owner', async () => {
    const w = world();
    w.addIssue(9, { labeler: 'collaborator' });
    expect(await w.tick()).toMatchObject({ state: 'refused', reason: expect.stringContaining('applied by @collaborator') });
    expect(w.callsTo('claude')).toHaveLength(0);
  });

  it('refuses when no labelled event is visible', async () => {
    const w = world();
    w.addIssue(9, { labeler: null });
    expect(await w.tick()).toMatchObject({ state: 'refused', reason: expect.stringContaining('nobody visible') });
  });

  it('refuses before pre-flight, so a bad ticket is refused even with expired credentials', async () => {
    const w = world();
    w.setCookieHours(-1);
    w.addIssue(7, { body: 'no criteria' });
    expect(await w.tick()).toMatchObject({ state: 'refused' });
    expect(w.callsTo('qodo')).toHaveLength(0);
  });
});

describe('a ticket revoked before the claim is left alone (Qodo PR37 d3e445f7)', () => {
  const revoke: [string, (w: World, n: number) => void][] = [
    ['closed', (w, n) => { w.issues.get(n)!.state = 'CLOSED'; }],
    ['unlabelled', (w, n) => { w.issues.get(n)!.labels.delete(LABELS.ready); }],
  ];
  it.each(revoke)('%s between the list and the read', async (_, change) => {
    const w = world();
    w.addIssue(24);
    const exec: typeof w.exec = async (cmd, args, opts) => {
      const res = await w.exec(cmd, args, opts);
      if (args[0] === 'issue' && args[1] === 'list') change(w, 24);
      return res;
    };
    expect(await w.tick({}, { exec })).toMatchObject({ state: 'skipped', issue: 24 });
    expect(w.callsTo('claude')).toHaveLength(0);
    expect(w.issues.get(24)!.comments).toEqual([]);
    expect(w.callsTo('gh').filter((c) => c.args[1] === 'edit')).toHaveLength(0);
  });

  it.each(revoke)('%s during pre-flight', async (_, change) => {
    const w = world();
    w.addIssue(24);
    const exec: typeof w.exec = async (cmd, args, opts) => {
      if (cmd.endsWith('qodo') && args[1] === 'whoami') change(w, 24);
      return w.exec(cmd, args, opts);
    };
    expect(await w.tick({}, { exec })).toMatchObject({ state: 'skipped', issue: 24 });
    expect(w.callsTo('claude')).toHaveLength(0);
    expect(w.callsTo('gh').filter((c) => c.args[1] === 'edit' || c.args[1] === 'comment')).toHaveLength(0);
  });

  it('an edit during pre-flight waits for the next tick instead of claiming stale text', async () => {
    const w = world();
    w.addIssue(24);
    const exec: typeof w.exec = async (cmd, args, opts) => {
      if (cmd.endsWith('qodo') && args[1] === 'whoami') w.editAt = w.now;
      return w.exec(cmd, args, opts);
    };
    expect(await w.tick({}, { exec })).toMatchObject({ state: 'skipped', reason: expect.stringContaining('changed') });
    expect(labels(w, 24)).toEqual([LABELS.ready]);
  });
});

describe('pre-flight (R13)', () => {
  const cases: [string, (w: World) => void, string][] = [
    ['an expired Midway session', (w) => w.setCookieHours(-1), 'midway'],
    ['a Midway session about to expire', (w) => w.setCookieHours(1), 'midway'],
    ['no Midway cookie', (w) => w.setCookieHours(null), 'midway: no Midway session cookie'],
    ['gh logged out', (w) => { w.ghAuth = false; }, 'gh: not logged in'],
    ['gh logged in as someone else', (w) => { w.ghUser = 'other'; }, 'gh: logged in as @other'],
    ['qodo logged out', (w) => { w.qodoOk = false; }, 'qodo'],
  ];
  it.each(cases)('%s leaves the ticket unclaimed', async (_, setup, reason) => {
    const w = world();
    w.addIssue(24);
    setup(w);
    const out = await w.tick();
    expect(out).toMatchObject({ state: 'preflight-failed', issue: 24, reasons: [expect.stringContaining(reason)] });
    expect(labels(w, 24)).toEqual([LABELS.ready]);
    expect(w.issues.get(24)!.comments).toEqual([]);
    expect(w.callsTo('claude')).toHaveLength(0);
    expect(w.callsTo('gh').filter((c) => c.args[1] === 'edit' || c.args[1] === 'comment')).toHaveLength(0);
    const ticks = readFileSync(join(w.commonDir, 'factory/ticks.jsonl'), 'utf8');
    expect(ticks).toContain('preflight-failed');
    expect(ticks).not.toContain(COOKIE_VALUE);
  });
});

describe('claim (R2) and work (R4)', () => {
  it('swaps ready-for-agent for agent-working and comments before any work', async () => {
    const w = world();
    w.addIssue(24);
    w.claude.push(agentError);
    await w.tick();
    const writes = w.calls.filter((c) => (c.args[0] === 'issue' && ['edit', 'comment'].includes(c.args[1]!)) || (c.cmd.endsWith('claude') && !c.args.includes('--no-session-persistence')) || c.args.includes('worktree'));
    expect(writes[0]!.args).toEqual(['issue', 'edit', '24', '--repo', 'owner/repo', '--remove-label', LABELS.ready, '--add-label', LABELS.working]);
    expect(writes[1]!.args.slice(0, 2)).toEqual(['issue', 'comment']);
    expect(w.issues.get(24)!.comments[0]).toMatch(/^Claimed by the agent runner/);
    expect(writes.findIndex((c) => c.args.includes('worktree'))).toBeGreaterThan(1);
  });

  it('runs the agent headless in a fresh .sandboxes worktree on agent/<N>-<slug>, cut from the session branch', async () => {
    const w = world();
    w.addIssue(24);
    w.claude.push(() => claudeOut({ subtype: 'error_max_turns', is_error: true, code: 1, turns: 121 }));
    await w.tick();
    const add = w.gitCalls('worktree')[0]!.args;
    expect(add).toEqual(['worktree', 'add', '--no-track', '-b', 'agent/24-scan-windowcommits-splits-numstat-on-u',
      join(w.repoDir, '.sandboxes/agent-24'), w.base]);
    // The base SHA, read right after the fetch; nothing compares against the movable ref after it.
    expect(w.gitCalls('rev-parse').map((c) => c.args[1])).toContain(`origin/${BASE}^{commit}`);
    const claude = w.agentCalls()[0]!;
    expect(claude.cwd).toBe(join(w.repoDir, '.sandboxes/agent-24'));
    expect(claude.args).toEqual(expect.arrayContaining(['--permission-mode', 'dontAsk', '--output-format', 'json', '--strict-mcp-config']));
    expect(claude.args).not.toContain('--no-session-persistence');
    expect(claude.args).not.toContain('--resume');
    const prompt = promptOf(claude.args);
    expect(prompt).toContain('Parse positionally on NUL.');
    const sys = claude.args[claude.args.indexOf('--append-system-prompt') + 1]!;
    expect(sys).toMatch(/AGENTS\.md and CLAUDE\.md/);
    // Publication belongs to the runner (task AC2).
    const denied = claude.args.slice(claude.args.indexOf('--disallowedTools') + 1);
    for (const rule of ['Bash(git push:*)', 'Bash(gh:*)', 'Bash(git merge:*)', 'WebFetch']) expect(denied).toContain(rule);
    expect(denied).toEqual(DENIED_TOOLS);
    expect(claude.env?.['GIT_CONFIG_VALUE_1']).toMatch(/push-disabled/);
    expect(claude.env?.['GH_TOKEN']).toBe('');
  });
});

describe('agent failures end in agent-needs-help (R7)', () => {
  const cases: [string, () => ReturnType<typeof claudeOut>, string][] = [
    ['an agent error', agentError, 'agent call failed: error_during_execution'],
    ['max turns', () => claudeOut({ subtype: 'error_max_turns', is_error: true, code: 1, turns: 121 }), 'agent hit max turns (121)'],
    ['a timeout', () => ({ code: null, stdout: '', stderr: '', timedOut: true }), 'agent call timed out after its 90 min timer (0 min wall clock)'],
    ['no JSON result', () => ({ code: 1, stdout: 'Error: boom', stderr: '', timedOut: false }), 'no JSON result'],
    ['a final message with no JSON block', () => claudeOut({ result: 'I did it.' }), 'no JSON block'],
    ['the agent reporting blocked', () => claudeOut({ result: '```json\n{"status":"blocked","blocked_reason":"the ticket contradicts AGENTS.md"}\n```' }), 'agent blocked: the ticket contradicts AGENTS.md'],
  ];
  it.each(cases)('%s', async (_, out, reason) => {
    const w = world();
    w.addIssue(24);
    w.claude.push(() => out());
    expect(await w.tick()).toEqual({ state: 'needs-help', issue: 24, reason: expect.stringContaining(reason) });
    expect(labels(w, 24)).toEqual([LABELS.help]);
    expect(w.issues.get(24)!.comments.at(-1)).toContain('needs help');
    expect(w.gitCalls('push')).toHaveLength(0);
  });

  it('a timeout names both clocks in the run log and the ticket comment (run #24)', async () => {
    const w = world();
    w.addIssue(24);
    w.claude.push((x) => {
      x.now += 143 * 60_000; // the laptop slept through most of the call
      return { code: null, stdout: '', stderr: '', timedOut: true };
    });
    const reason = 'agent call timed out after its 90 min timer (143 min wall clock)';
    expect(await w.tick()).toMatchObject({ state: 'needs-help', reason });
    const log = runLog(w);
    expect(log.find((e) => e['event'] === 'agent-end')).toMatchObject({ reason });
    expect(log.find((e) => e['event'] === 'stop')).toMatchObject({ reason });
    expect(w.issues.get(24)!.comments.at(-1)).toContain(reason);
  });

  it('names expired credentials when Midway ran out mid-run', async () => {
    const w = world();
    w.addIssue(24);
    w.claude.push((x) => {
      x.setCookieHours(-0.1);
      return agentError();
    });
    expect(await w.tick()).toMatchObject({ state: 'needs-help', reason: expect.stringMatching(/^Midway credentials expired/) });
  });

  it('stops when the agent made no commits', async () => {
    const w = world();
    w.addIssue(24);
    w.claude.push(implementDone(0));
    expect(await w.tick()).toMatchObject({ state: 'needs-help', reason: 'the agent made no commits' });
  });

  it('a protected path change is caught even after the agent moves origin/<base> in the shared .git', async () => {
    const w = world();
    w.addIssue(24);
    w.claude.push((x) => {
      const hidden = x.commit();
      x.commitFiles.set(hidden, ['.github/workflows/ci.yml']);
      x.commitFiles.set(x.commit(), ['src/x.ts']);
      // Repo code can write the shared .git's refs: point origin/<base> past the workflow change.
      x.originRef = hidden;
      return claudeOut({ result: '```json\n{"status":"done","summary":"s","criteria":[]}\n```' });
    });
    expect(await w.tick()).toMatchObject({ state: 'needs-help', reason: expect.stringContaining('.github/workflows/ci.yml') });
    expect(w.gitCalls('push')).toHaveLength(0);
  });

  it('stops before pushing when the agent touched a protected path', async () => {
    const w = world();
    w.addIssue(24);
    w.changed = ['src/x.ts', '.github/workflows/ci.yml'];
    w.claude.push(implementDone());
    expect(await w.tick()).toMatchObject({ state: 'needs-help', reason: expect.stringContaining('.github/workflows/ci.yml') });
    expect(w.gitCalls('push')).toHaveLength(0);
  });
});

/** Ticket #24, an agent that implements it in one commit, and whatever review the world gives. */
async function happy(w: World) {
  w.addIssue(24);
  w.claude.push(implementDone());
  return w.tick();
}

describe('publish (R5)', () => {
  it('pushes the agent branch with the gh credential helper and opens a PR against the session branch', async () => {
    const w = world();
    expect(await happy(w)).toEqual({ state: 'done', issue: 24, pr: 'https://github.com/owner/repo/pull/100' });
    const push = w.gitCalls('push')[0]!;
    // The verified commit by SHA, from the main checkout (Qodo PR104 2372ddf8).
    expect(push.args).toEqual(['push', 'origin', `${w.commits.at(-1)}:refs/heads/agent/24-scan-windowcommits-splits-numstat-on-u`]);
    expect(push.cwd).toBe(w.repoDir);
    // The human's gh login is the only credential helper; the keychain helper is reset (Research).
    expect(push.env).toMatchObject({ GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'credential.helper', GIT_CONFIG_VALUE_0: '',
      GIT_CONFIG_KEY_1: 'credential.helper', GIT_CONFIG_VALUE_1: '!/opt/homebrew/bin/gh auth git-credential' });
    const pr = w.prs[0]!;
    expect(pr.base).toBe(BASE);
    expect(pr.branch).toBe('agent/24-scan-windowcommits-splits-numstat-on-u');
    expect(pr.title).toBe('fix(scan): parse numstat positionally on NUL');
    // Task AC3: ticket link, Closes with the session-branch note, AC table with evidence.
    expect(pr.body).toContain('[#24](https://github.com/owner/repo/issues/24)');
    expect(pr.body).toMatch(/^Closes #24$/m);
    expect(pr.body).toContain('only auto-closes on the default branch');
    expect(pr.body).toContain('| 1 | A failing-first fixture keeps every file row. | yes | test "keeps every file row" fails before, passes after |');
    expect(pr.body).toContain('| 2 | Parse positionally on NUL. | yes | repo.ts uses the NUL parser |');
    expect(pr.body).toContain('| `npm test` | pass |');
    expect(pr.body).not.toContain(w.root);
  });

  it("runs npm ci and its own checks with the agent's no-push environment, since they run agent-written code", async () => {
    const w = world();
    await happy(w);
    const npm = w.npmCalls();
    expect(npm.map((c) => c.args.join(' '))).toEqual(['ci --ignore-scripts', 'rebuild', 'run build', 'run typecheck', 'run lint', 'test']);
    for (const c of npm) {
      expect(c.cwd).toBe(join(w.repoDir, '.sandboxes/agent-24'));
      expect(c.env).toMatchObject({ GIT_CONFIG_VALUE_0: '', GIT_CONFIG_VALUE_1: expect.stringMatching(/push-disabled/), GH_TOKEN: '' });
    }
  });

  it('re-runs the checks itself and sends a failure back to the agent as a fix round', async () => {
    const w = world();
    w.addIssue(24);
    w.checkFailures['npm run lint'] = 1;
    w.claude.push(implementDone(), fixDone());
    expect(await w.tick()).toMatchObject({ state: 'done' });
    const fix = w.agentCalls()[1]!.args;
    expect(fix).toEqual(expect.arrayContaining(['--resume', 'sess-1']));
    expect(promptOf(fix)).toContain(`The runner's own "npm run lint" failed`);
    expect(w.issues.get(24)!.comments.at(-1)).toContain('| Fix rounds used | 1 of 2 |');
  });
});

describe('review loop (R6, R7)', () => {
  it('a finding leads to a fix round, a clean review, then agent-done with a summary comment', async () => {
    const w = world();
    const f1 = firstHeadOnly(finding('f1'), finding('f1', { attribution_status: 'implemented' }));
    w.findings = (head) => [f1(head), finding('r1', { action_level: 'remediation_recommended' })];
    w.addIssue(24);
    w.claude.push(implementDone(), fixDone('confirmed'));
    expect(await w.tick()).toMatchObject({ state: 'done', issue: 24 });
    expect(labels(w, 24)).toEqual([LABELS.done]);
    expect(w.gitCalls('push')).toHaveLength(2);
    const fix = w.agentCalls()[1]!;
    expect(fix.args).toEqual(expect.arrayContaining(['--resume', 'sess-1']));
    expect(fix.cwd).toBe(join(w.repoDir, '.sandboxes/agent-24'));
    const prompt = promptOf(fix.args);
    expect(prompt).toContain('- id f1 ');
    expect(prompt).not.toContain('- id r1 ');
    expect(prompt).toContain('Validate each one');
    // One PR comment with the dispositions (R6 "replies to the finding").
    expect(w.prs[0]!.comments[0]).toMatch(/Agent fix round 1 of 2[\s\S]*Finding f1[\s\S]*\| confirmed \|/);
    const summary = w.issues.get(24)!.comments.at(-1)!;
    expect(summary).toContain('**Agent run done.**');
    expect(summary).toContain('| Fix rounds used | 1 of 2 |');
    expect(summary).toContain('| Completed Qodo reviews | 2');
    expect(summary).toContain('| CI on the head | check (20) success, check (22) success |');
    expect(summary).toMatch(/Finding f1.*\| action_required \| confirmed in round 1/);
    expect(summary).toMatch(/Finding r1.*\| remediation_recommended \| open recommendation \(optional\)/);
    expect(summary).not.toContain(w.root);
  });

  it('a failed summary comment never leaves agent-done behind (Qodo PR37 7713dac4)', async () => {
    const w = world();
    w.addIssue(24);
    w.claude.push(implementDone());
    const exec: typeof w.exec = (cmd, args, opts) => {
      const file = args[0] === 'issue' && args[1] === 'comment' ? args[args.indexOf('--body-file') + 1] : undefined;
      if (file && readFileSync(file, 'utf8').includes('**Agent run done.**')) return Promise.resolve({ code: 1, stdout: '', stderr: 'HTTP 502', timedOut: false });
      return w.exec(cmd, args, opts);
    };
    expect(await w.tick({}, { exec })).toMatchObject({ state: 'needs-help', reason: expect.stringContaining('comment on issue 24 failed') });
    expect(labels(w, 24)).toEqual([LABELS.help]);
  });

  it('still swaps to agent-needs-help when its own comment fails', async () => {
    const w = world();
    w.addIssue(24);
    w.claude.push(agentError);
    const exec: typeof w.exec = (cmd, args, opts) => {
      const file = args[0] === 'issue' && args[1] === 'comment' ? args[args.indexOf('--body-file') + 1] : undefined;
      if (file && readFileSync(file, 'utf8').includes('needs help')) return Promise.resolve({ code: 1, stdout: '', stderr: 'HTTP 502', timedOut: false });
      return w.exec(cmd, args, opts);
    };
    expect(await w.tick({}, { exec })).toMatchObject({ state: 'needs-help' });
    expect(labels(w, 24)).toEqual([LABELS.help]);
  });

  it('a would-be third fix round ends in agent-needs-help', async () => {
    const w = world();
    w.findings = (head) => [finding(`f-${head.slice(-4)}`)];
    w.addIssue(24);
    w.claude.push(implementDone(), fixDone(), fixDone());
    const out = await w.tick();
    expect(out).toMatchObject({ state: 'needs-help', reason: expect.stringMatching(/^retry limit: 2 fix rounds used and 1 blocking finding/) });
    expect(w.agentCalls()).toHaveLength(3);
    expect(w.gitCalls('push')).toHaveLength(3);
    expect(labels(w, 24)).toEqual([LABELS.help]);
    expect(w.issues.get(24)!.comments.at(-1)).toContain('| Fix rounds used | 2 of 2 |');
  });

  it('a failed CI check goes to the agent with its log', async () => {
    const w = world();
    w.ciConclusion = firstHeadOnly('failure', 'success');
    w.addIssue(24);
    w.claude.push(implementDone(), fixDone());
    expect(await w.tick()).toMatchObject({ state: 'done' });
    const prompt = promptOf(w.agentCalls()[1]!.args);
    expect(prompt).toContain('CI check "check (20)" ended failure');
    expect(prompt).toContain('Error: test failed');
  });

  it('review_effort=skip stops with "review skipped", never clean', async () => {
    const w = world();
    w.effort = 'skip';
    expect(await happy(w)).toMatchObject({ state: 'needs-help', reason: expect.stringMatching(/^review skipped/) });
    expect(labels(w, 24)).toEqual([LABELS.help]);
  });

  it('a review that never arrives stops with "review incomplete" after 30 min', async () => {
    const w = world();
    w.qodoDelayMs = null;
    const out = await happy(w);
    expect(out).toMatchObject({ state: 'needs-help', reason: expect.stringMatching(/^review incomplete: .*within 30 min.*Qodo: no review run on head yet/) });
    expect(w.now - T0).toBeLessThanOrEqual(31 * 60_000);
    expect(labels(w, 24)).not.toContain(LABELS.done);
  });

  it('a PR with more than 100 check runs reaches its CI state (Qodo PR93 34599baa)', async () => {
    const w = world();
    w.ciRunCount = 150;
    expect(await happy(w)).toMatchObject({ state: 'done' });
    expect(w.issues.get(24)!.comments.at(-1)).toContain('extra 149 success');
  });

  it('a failure on the second page of check runs goes to the agent (Qodo PR93 34599baa)', async () => {
    const w = world();
    w.ciRunCount = 150;
    w.ciConclusion = firstHeadOnly('failure', 'success');
    w.addIssue(24);
    w.claude.push(implementDone(), fixDone());
    expect(await w.tick()).toMatchObject({ state: 'done' });
    expect(promptOf(w.agentCalls()[1]!.args)).toContain('CI check "extra 149" ended failure');
  });

  it('a clean review from a poll that returns after the deadline is not accepted (Qodo PR93 ff427862)', async () => {
    const w = world();
    w.addIssue(24);
    w.claude.push(implementDone());
    // Each Qodo read takes 15 min: the second poll starts at 17 min, inside the 30 min deadline,
    // and returns the first clean, settled review at 32 min.
    const exec: typeof w.exec = async (cmd, args, opts) => {
      const res = await w.exec(cmd, args, opts);
      if (cmd.endsWith('qodo') && args[1] === 'pr-review-session') w.now += 15 * 60_000;
      return res;
    };
    const out = await w.tick({}, { exec });
    expect(out).toMatchObject({ state: 'needs-help', reason: expect.stringMatching(/^review incomplete: .*within 30 min/) });
    expect(labels(w, 24)).not.toContain(LABELS.done);
    const polls = runLog(w).filter((e) => e['event'] === 'poll');
    expect(polls.at(-1)).toMatchObject({ qodo: 'complete' });
  });

  it('CI that never finishes stops with "review incomplete"', async () => {
    const w = world();
    w.ciDelayMs = null;
    expect(await happy(w)).toMatchObject({ state: 'needs-help', reason: expect.stringMatching(/^review incomplete: .*CI: 2 check run\(s\) in_progress/) });
  });

  it('a failing qodo command is incomplete, not clean', async () => {
    const w = world();
    w.addIssue(24);
    w.claude.push(implementDone());
    const exec: typeof w.exec = (cmd, args, opts) => (cmd.endsWith('qodo') && args[1] === 'pr-review-session'
      ? Promise.resolve({ code: 1, stdout: '', stderr: 'boom', timedOut: false }) : w.exec(cmd, args, opts));
    const out = await w.tick({}, { exec });
    expect(out).toMatchObject({ state: 'needs-help', reason: expect.stringContaining('qodo output unreadable') });
  });

  it('action_required findings the agent rejected need the human, not agent-done', async () => {
    const w = world();
    w.findings = () => [finding('f1')];
    w.addIssue(24);
    w.claude.push(implementDone(), fixDone('rejected', 0));
    expect(await w.tick()).toMatchObject({ state: 'needs-help', reason: "1 action_required finding(s) the agent rejected need the human's decision" });
    expect(w.prs[0]!.comments[0]).toContain('| rejected |');
    expect(w.issues.get(24)!.comments.at(-1)).toMatch(/Finding f1.*rejected in round 1/);
  });

  it('a fix round that rewrites pushed history stops the run', async () => {
    const w = world();
    w.findings = firstHeadOnly([finding('f1')], []);
    w.addIssue(24);
    w.claude.push(implementDone(), (x) => {
      x.commits = [];
      x.commit();
      return claudeOut({ result: '```json\n{"status":"done","findings":[]}\n```' });
    });
    expect(await w.tick()).toMatchObject({ state: 'needs-help', reason: expect.stringContaining('rewrote pushed history') });
    expect(w.gitCalls('push')).toHaveLength(1);
  });

  it('never calls a review done while the PR itself is unreadable (Qodo PR37 bb7977bf)', async () => {
    const w = world();
    w.addIssue(24);
    w.claude.push(implementDone());
    const exec: typeof w.exec = (cmd, args, opts) => (args[0] === 'pr' && args[1] === 'view'
      ? Promise.resolve({ code: 1, stdout: '', stderr: 'HTTP 502', timedOut: false }) : w.exec(cmd, args, opts));
    const out = await w.tick({}, { exec });
    expect(out).toMatchObject({ state: 'needs-help', reason: expect.stringMatching(/^review incomplete: .*PR: state unavailable/) });
    expect(labels(w, 24)).not.toContain(LABELS.done);
  });

  it('stops if someone else moves the PR head', async () => {
    const w = world();
    w.addIssue(24);
    w.claude.push(implementDone());
    const exec: typeof w.exec = async (cmd, args, opts) => {
      const res = await w.exec(cmd, args, opts);
      return args[0] === 'pr' && args[1] === 'view' ? { ...res, stdout: JSON.stringify({ headRefOid: 'f'.repeat(40), state: 'OPEN' }) } : res;
    };
    expect(await w.tick({}, { exec })).toMatchObject({ state: 'needs-help', reason: expect.stringContaining('PR head moved to fffffff') });
  });
});

describe('trust boundary during the run (R12)', () => {
  it('an edit to the issue mid-run stops it', async () => {
    const w = world();
    w.editAt = T0 + 2 * 60_000;
    expect(await happy(w)).toMatchObject({ state: 'needs-help', reason: expect.stringContaining('the issue was edited during the run') });
    expect(labels(w, 24)).toEqual([LABELS.help]);
  });

  it('an edit before the push stops it before anything is published', async () => {
    const w = world();
    w.addIssue(24);
    w.claude.push((x) => {
      x.editAt = x.now;
      return implementDone()(x, []);
    });
    expect(await w.tick()).toMatchObject({ state: 'needs-help', reason: expect.stringContaining('edited') });
    expect(w.gitCalls('push')).toHaveLength(0);
    expect(w.prs).toHaveLength(0);
  });

  it('the agent works from the claim-time snapshot, which the run keeps', async () => {
    const w = world();
    w.addIssue(24);
    w.claude.push(() => claudeOut({ subtype: 'error_max_turns', is_error: true, code: 1 }));
    await w.tick();
    expect(readFileSync(join(w.runDir(), 'ticket.md'), 'utf8')).toContain('Parse positionally on NUL.');
  });
});

describe('run log (R9, task AC6)', () => {
  it('records timestamps for tick, claim, agent, push, PR, every poll, fix rounds and the end state, with no secrets', async () => {
    const w = world();
    w.findings = firstHeadOnly([finding('f1')], []);
    w.addIssue(24);
    w.claude.push((x) => {
      x.commit();
      const summary = `token=${FAKE_TOKEN} in ${x.repoDir}/src and ${x.home}/.aws`;
      return claudeOut({ result: '```json\n' + JSON.stringify({ status: 'done', summary, criteria: [] }) + '\n```' });
    }, fixDone());
    await w.tick();
    const log = runLog(w);
    for (const e of log) expect(e['ts']).toMatch(/^2026-11-09T\d\d:\d\d:\d\d\.\d{3}Z$/);
    const names = log.map((e) => e['event']);
    for (const name of ['tick', 'picked', 'assess', 'preflight', 'run', 'claim', 'worktree', 'agent-start', 'agent-end', 'verified', 'push', 'pr', 'poll', 'review', 'fix-round', 'fix-round-end', 'end']) {
      expect(names).toContain(name);
    }
    expect(log.find((e) => e['event'] === 'agent-end')).toMatchObject({ num_turns: 10, total_cost_usd: 1.25, session_id: 'sess-1' });
    expect(log.filter((e) => e['event'] === 'poll').every((e) => 'review_runs' in e)).toBe(true);
    expect(log.at(-1)).toMatchObject({ event: 'end', state: 'done', fixRounds: 1 });
    const dir = w.runDir();
    const raw = [join(w.commonDir, 'factory/ticks.jsonl'), ...readdirSync(dir).map((f) => join(dir, f))]
      .filter((f) => statSync(f).isFile()).map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(raw).not.toContain(FAKE_TOKEN);
    expect(raw).not.toContain(COOKIE_VALUE);
    expect(raw).not.toContain(w.root);
    expect(raw).toContain('in ./src and ~/.aws');
    expect(raw).toContain(OWNER);
  });
});

describe('agent output stays out of the run files (Qodo PR37 8310c5ac, AGENTS.md Rule 2)', () => {
  it('keeps only a regex category of each denied command, and none of the free text', async () => {
    const w = world();
    w.addIssue(24);
    w.claude.push((x) => {
      x.commit();
      return claudeOut({
        result: 'Here is the code: CANARY-RESULT-TEXT\n```json\n{"status":"done","summary":"s","criteria":[]}\n```',
        denials: [
          { tool_name: 'Bash', tool_use_id: 't1', tool_input: { command: 'gh pr create --title CANARY-BASH-CMD', description: 'CANARY-DESC' } },
          { tool_name: 'Bash', tool_use_id: 't2', tool_input: { command: 'git push origin HEAD --force # CANARY-PUSH' } },
          { tool_name: 'Write', tool_use_id: 't3', tool_input: { file_path: '.github/workflows/x.yml', content: 'CANARY-FILE-CONTENT' } },
        ],
      });
    });
    await w.tick();
    const dir = w.runDir();
    const all = [join(w.commonDir, 'factory/ticks.jsonl'), ...readdirSync(dir).map((f) => join(dir, f))]
      .filter((f) => statSync(f).isFile()).map((f) => readFileSync(f, 'utf8')).join('\n');
    for (const canary of ['CANARY-RESULT-TEXT', 'CANARY-BASH-CMD', 'CANARY-DESC', 'CANARY-PUSH', 'CANARY-FILE-CONTENT', '.github/workflows/x.yml']) {
      expect(all).not.toContain(canary);
    }
    expect(runLog(w).find((e) => e['event'] === 'agent-end')!['permission_denials']).toEqual([
      { tool: 'Bash', kind: 'gh' }, { tool: 'Bash', kind: 'git push' }, { tool: 'Write' },
    ]);
  });
});

describe('the agent runs sandboxed (Qodo PR93 b274f225)', () => {
  interface Settings {
    sandbox: { filesystem: { denyRead: string[]; denyWrite: string[] } } & Record<string, unknown>;
    permissions: { deny: string[]; blockWritesOutsideWorkingDirectories?: boolean };
  }
  const settingsOf = (args: string[]) => JSON.parse(args[args.indexOf('--settings') + 1]!) as Settings;
  const selfTests = (w: World) => w.callsTo('claude').filter((c) => c.args.includes('--no-session-persistence'));
  const stateDir = (w: World) => join(w.commonDir, 'factory');

  it('every agent call runs Bash sandboxed, with no fallback, no egress, and credentials denied to Bash and the file tools (S1, S2, S3, S4)', async () => {
    const w = world();
    w.findings = firstHeadOnly([finding('f1')], []);
    w.addIssue(24);
    w.claude.push(implementDone(), fixDone());
    expect(await w.tick()).toMatchObject({ state: 'done' });
    const calls = w.agentCalls();
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      const s = settingsOf(c.args);
      expect(s.sandbox).toMatchObject({
        enabled: true, failIfUnavailable: true, allowUnsandboxedCommands: false, autoAllowBashIfSandboxed: false,
        network: { allowedDomains: [], allowLocalBinding: true },
      });
      for (const dir of ['.midway', '.aws', '.ssh', '.config/gh']) {
        expect(s.sandbox.filesystem.denyRead).toContain(join(w.home, dir));
        expect(s.permissions.deny).toContain(`Read(/${join(w.home, dir)}/**)`);
      }
      expect(s.sandbox.filesystem.denyRead).toContain(join(w.home, '.claude/.credentials.json'));
      expect(s.permissions.deny).toContain(`Read(/${join(w.home, '.claude/.credentials.json')})`);
      expect(s.sandbox.filesystem.denyWrite).toEqual([stateDir(w), join(w.repoDir, '.sandboxes/agent-24/.git'),
        join(w.commonDir, 'commondir'), join(w.commonDir, 'config.worktree'),
        ...['commondir', 'gitdir', 'config.worktree'].map((r) => join(w.commonDir, 'worktrees/*', r))]);
      expect(s.sandbox.filesystem.denyRead).toEqual(expect.arrayContaining([join(w.home, '.npmrc'), join(w.home, '.netrc')]));
      // Qodo PR93 cf5b7463: no settings from the worktree, so nothing there can loosen these.
      expect(c.args.slice(c.args.indexOf('--setting-sources'), c.args.indexOf('--setting-sources') + 2)).toEqual(['--setting-sources', 'user']);
      expect(s.permissions.deny).toContain(`Edit(/${stateDir(w)}/**)`);
      expect(s.permissions.blockWritesOutsideWorkingDirectories).toBe(true);
    }
  });

  it("nothing the agent runs inherits the runner's secrets: an allowlisted environment (S6)", async () => {
    const w = world();
    await happy(w);
    const runs = [...w.agentCalls(), ...selfTests(w), ...w.npmCalls(), ...w.callsTo('sandbox-exec')];
    expect(runs.length).toBeGreaterThan(8);
    for (const c of runs) {
      for (const k of Object.keys(RUNNER_SECRETS)) expect(c.env?.[k], k).toBeUndefined();
      expect(c.env).toMatchObject({ PATH: '/usr/bin', HOME: w.home, GH_TOKEN: '', GITHUB_TOKEN: '', GIT_CONFIG_VALUE_1: expect.stringMatching(/push-disabled/) });
    }
  });

  it('npm ci runs no repo code while the network is open; install scripts and the checks run offline (S5)', async () => {
    const w = world();
    await happy(w);
    const [ci, ...rest] = w.npmCalls();
    expect(ci!.args).toEqual(['ci', '--ignore-scripts']);
    expect(rest.map((c) => c.args[0])).toEqual(['rebuild', 'run', 'run', 'run', 'test']);
    for (const c of [ci!, ...rest]) {
      expect(c.profile).toContain(`(deny file-read* (subpath "${join(w.home, '.midway')}")`);
      expect(c.profile).toContain(`(deny file-write* (subpath "${stateDir(w)}")`);
    }
    expect(ci!.profile).not.toContain('network-outbound');
    for (const c of rest) expect(c.profile).toContain('(deny network-outbound (require-not (remote ip "localhost:*")))');
  });

  it('proves both sandboxes before the claim with a canary it made itself, then cleans up (S4)', async () => {
    const w = world();
    await happy(w);
    const log = runLog(w);
    const at = (e: string) => log.findIndex((x) => x['event'] === e);
    expect(log[at('sandbox-selftest')]).toMatchObject({ ok: true, failures: [] });
    expect(at('sandbox-selftest')).toBeLessThan(at('claim'));
    const probe = w.callsTo('sandbox-exec').find((c) => c.args[2] === '/bin/sh')!;
    const [self] = selfTests(w);
    expect(w.calls.indexOf(probe)).toBeLessThan(w.calls.indexOf(self!));
    expect(w.calls.indexOf(self!)).toBeLessThan(w.calls.indexOf(w.agentCalls()[0]!));
    // The same settings as the agent's, plus only the runner's own canary dir.
    const agent = settingsOf(w.agentCalls()[0]!.args);
    const test = settingsOf(self!.args);
    const canaryDir = test.sandbox.filesystem.denyRead.at(-1)!;
    expect(canaryDir).toMatch(/factory-selftest-[^/]+\/denied$/);
    expect(test.sandbox.filesystem.denyRead).toEqual([...agent.sandbox.filesystem.denyRead, canaryDir]);
    expect(test.permissions.deny).toEqual(expect.arrayContaining(agent.permissions.deny.filter((r) => r.startsWith('Read('))));
    expect(self!.args).toEqual(expect.arrayContaining(['--setting-sources', 'user']));
    expect(probe.args[1]).toContain(`(subpath "${canaryDir}")`);
    expect(promptOf(self!.args)).toContain(`Read tool once on ${canaryDir}/canary.txt`);
    expect(self!.args).toEqual(expect.arrayContaining(['--allowedTools', 'Read', 'Bash(sh probe.sh)']));
    expect(existsSync(dirname(canaryDir))).toBe(false);
    expect(existsSync(join(stateDir(w), '.sandbox-probe'))).toBe(false);
  });

  const broken: [string, (w: World) => void, string][] = [
    ['claude ignores the settings', (w) => { w.claudeSandbox = 'off'; }, 'claude: read the denied canary file'],
    ['claude cannot start the sandbox', (w) => {
      w.selfTestClaude = () => ({ code: 1, stdout: '', stderr: 'Error: sandbox.failIfUnavailable is set but the sandbox is unavailable', timedOut: false });
    }, 'claude: no JSON result (exit 1, the sandbox could not start)'],
    ['the Read tool is not denied the canary', (w) => { w.readDenied = false; }, 'claude: the Read tool was not denied the canary'],
    ['the probe never runs under claude', (w) => { w.claudeSandbox = 'no-run'; }, 'claude: the probe did not run to the end'],
    ['claude ran the probe but exited with an error (Qodo PR93 138a8438)', (w) => {
      w.selfTestClaude = (x, args) => ({ ...x.runSelfTest(args), code: 1 });
    }, 'claude: ended success, exit 1'],
    ['claude ran the probe but flagged is_error (Qodo PR93 138a8438)', (w) => {
      w.selfTestClaude = (x, args) => {
        const res = x.runSelfTest(args);
        return { ...res, stdout: res.stdout.replace('"is_error":false', '"is_error":true') };
      };
    }, 'claude: ended success (is_error), exit 0'],
    ['sandbox-exec does not confine the probe', (w) => { w.seatbelt = 'off'; }, "sandbox-exec: read the denied canary file; sandbox-exec: wrote into the runner's state dir"],
  ];
  it.each(broken)('%s: the ticket goes back unclaimed with agent-needs-help and the reason, and no agent runs', async (_, breakIt, why) => {
    const w = world();
    w.addIssue(24);
    breakIt(w);
    const out = await w.tick();
    expect(out).toMatchObject({ state: 'needs-help', issue: 24, reason: expect.stringContaining('sandbox self-test failed: ') });
    expect((out as { reason: string }).reason).toContain(why);
    expect(labels(w, 24)).toEqual([LABELS.help]);
    expect(w.issues.get(24)!.comments).toEqual([expect.stringMatching(/stopped before claiming this ticket: sandbox self-test failed.*never runs one unsandboxed/s)]);
    expect(w.agentCalls()).toHaveLength(0);
    expect(w.gitCalls('worktree')).toHaveLength(0);
    expect(existsSync(join(stateDir(w), '.sandbox-probe'))).toBe(false);
    expect(runLog(w).at(-1)).toMatchObject({ event: 'end', state: 'needs-help' });
  });

  it("runs its own git in the worktree sandboxed, credential-free and pinned, and pushes by SHA from the main checkout (Qodo PR93 b301674c, PR104 2372ddf8)", async () => {
    const w = world();
    w.findings = firstHeadOnly([finding('f1')], []);
    w.addIssue(24);
    w.claude.push(implementDone(), fixDone());
    expect(await w.tick()).toMatchObject({ state: 'done' });
    const tree = join(w.repoDir, '.sandboxes/agent-24');
    const inTree = w.callsTo('git').filter((c) => c.cwd === tree);
    const [record, ...rest] = inTree;
    expect(record!.args).toEqual(['rev-parse', '--absolute-git-dir']);
    expect(rest.length).toBeGreaterThan(10);
    expect(rest.map((c) => c.args[0])).toEqual(expect.arrayContaining(['rev-list', 'diff', 'status', 'rev-parse', 'log', 'merge-base']));
    for (const c of inTree) {
      expect(c.profile, c.args.join(' ')).toContain('(deny network-outbound');
      expect(c.env?.['GIT_CONFIG_VALUE_1'], 'no gh credential helper').toMatch(/push-disabled/);
      for (const k of Object.keys(RUNNER_SECRETS)) expect(c.env?.[k]).toBeUndefined();
    }
    for (const c of rest) {
      expect(c.env, c.args.join(' ')).toMatchObject({ GIT_DIR: join(w.commonDir, 'worktrees/agent-24'), GIT_COMMON_DIR: w.commonDir, GIT_WORK_TREE: tree });
    }
    for (const c of w.gitCalls('status')) expect(c.args).toContain('--ignore-submodules=all');
    // Only main-checkout git runs unsandboxed, with the gh login; the pushes are the verified heads.
    const outside = w.callsTo('git').filter((c) => !c.profile);
    expect(outside.every((c) => c.cwd === w.repoDir)).toBe(true);
    expect(w.gitCalls('push').map((c) => c.args[2]!.split(':')[0])).toEqual(w.commits);
    for (const c of w.gitCalls('push')) expect(c.env?.['GIT_CONFIG_VALUE_1']).toMatch(/gh auth git-credential$/);
  });

  it('an agent call that exits because its sandbox cannot start stops the run and says so', async () => {
    const w = world();
    w.addIssue(24);
    w.claude.push(() => ({ code: 1, stdout: '', stderr: 'Error: sandbox required but unavailable', timedOut: false }));
    expect(await w.tick()).toMatchObject({ state: 'needs-help', reason: expect.stringContaining('the sandbox could not start') });
    expect(w.gitCalls('push')).toHaveLength(0);
  });
});

describe('dry run (task AC4)', () => {
  // Anything but gh reads, pre-flight and the Midway cookie counts as a side effect here.
  const writes = (w: World) => w.calls.filter((c) => {
    const cmd = c.cmd.split('/').at(-1);
    if (cmd === 'gh') return ['edit', 'comment', 'create'].includes(c.args[1]!) || c.args[0] === 'label';
    return !(cmd === 'qodo' || (cmd === 'npm' && c.args[0] === '--version'));
  });

  it('prints each decision for a good ticket and changes nothing', async () => {
    const w = world();
    w.addIssue(24);
    const lines: string[] = [];
    const out = await w.tick({ dryRun: true }, { print: (l) => lines.push(l) });
    expect(out).toEqual({ state: 'dry-run', issue: 24, decision: 'would claim' });
    expect(writes(w)).toEqual([]);
    expect(labels(w, 24)).toEqual([LABELS.ready]);
    expect(existsSync(join(w.commonDir, 'factory'))).toBe(false);
    const text = lines.join('');
    expect(text).toContain('assess');
    expect(text).toContain('preflight');
    expect(text).toMatch(/would action=claim #24/);
  });

  it('previews a refusal with --issue and changes nothing', async () => {
    const w = world();
    w.addIssue(7, { body: 'no criteria', labels: new Set(), labeler: null });
    const out = await w.tick({ dryRun: true, previewIssue: 7 });
    expect(out).toEqual({ state: 'dry-run', issue: 7, decision: 'refused: it has no `## Acceptance criteria` section' });
    expect(writes(w)).toEqual([]);
    expect(w.issues.get(7)!.comments).toEqual([]);
  });
});
