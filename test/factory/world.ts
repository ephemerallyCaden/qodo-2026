// An offline stand-in for everything the agent runner talks to: gh, git, npm, claude, qodo,
// lockf and launchctl, plus a clock that jumps instead of sleeping. No network, no real agent.
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from 'vitest';
import { defaults, LABELS, type Config } from '../../factory/config.js';
import type { Exec, ExecOptions, ExecResult } from '../../factory/exec.js';
import type { Clock } from '../../factory/log.js';
import type { CheckRun, Finding, ReviewRun } from '../../factory/review.js';
import { runTick, type Deps, type Outcome } from '../../factory/runner.js';

export const OWNER = 'owner';
export const SLUG = 'owner/repo';
export const BASE = 'session/week1';
export const T0 = Date.UTC(2026, 10, 9, 12, 0, 0);
export const COOKIE_VALUE = 'COOKIE-VALUE-MUST-NOT-LEAK-0123456789';
export const FAKE_TOKEN = 'ghp_' + 'A'.repeat(36);

export const AC_BODY = 'A bug.\n\n## Acceptance criteria\n1. A failing-first fixture keeps every file row.\n2. Parse positionally on NUL.\n';

export interface FakeIssue {
  number: number;
  title: string;
  body: string;
  author: string;
  createdAt: string;
  labels: Set<string>;
  labeler: string | null;
  comments: string[];
  state: 'OPEN' | 'CLOSED';
}

export interface FakePr {
  number: number;
  url: string;
  base: string;
  branch: string;
  title: string;
  body: string;
  comments: string[];
  state: string;
}

export interface Call {
  cmd: string;
  args: string[];
  cwd: string | undefined;
  env: NodeJS.ProcessEnv | undefined;
}

type Claude = (w: World, args: string[]) => ExecResult;

export const ok = (stdout = ''): ExecResult => ({ code: 0, stdout, stderr: '', timedOut: false });
const fail = (code = 1, stderr = 'failed'): ExecResult => ({ code, stdout: '', stderr, timedOut: false });
const sha = (n: number) => n.toString(16).padStart(40, 'c');

/** The text of the prompt in a recorded claude call. */
export const promptOf = (args: readonly string[]) => args[args.indexOf('-p') + 1] ?? '';

/** `a` for the first head the fake sees, `b` for every later one. */
export function firstHeadOnly<T>(a: T, b: T): (head: string) => T {
  let first: string | null = null;
  return (head) => ((first ??= head) === head ? a : b);
}

export function claudeOut(o: {
  result?: string; subtype?: string; is_error?: boolean; code?: number; session?: string; turns?: number; cost?: number; denials?: unknown[];
}): ExecResult {
  const json = {
    type: 'result', subtype: o.subtype ?? 'success', is_error: o.is_error ?? false, result: o.result ?? '',
    session_id: o.session ?? 'sess-1', num_turns: o.turns ?? 10, total_cost_usd: o.cost ?? 1.25, permission_denials: o.denials ?? [],
  };
  return { code: o.code ?? 0, stdout: JSON.stringify(json), stderr: '', timedOut: false };
}

const fence = (block: object) => `All done.\n\n\`\`\`json\n${JSON.stringify(block, null, 2)}\n\`\`\`\n`;

/** An agent call that commits once and reports done. */
export function agentDone(block: object = {}, commits = 1): Claude {
  return (w) => {
    for (let i = 0; i < commits; i++) w.commit();
    return claudeOut({ result: fence({ status: 'done', ...block }) });
  };
}

export const implementDone = (commits = 1) => agentDone({
  pr_title: 'fix(scan): parse numstat positionally on NUL',
  summary: 'Parses numstat on NUL like lineageLog.',
  criteria: [
    { criterion: 'x', met: true, evidence: 'test "keeps every file row" fails before, passes after' },
    { criterion: 'y', met: true, evidence: 'repo.ts uses the NUL parser' },
  ],
}, commits);

/** A fix round that answers every finding it was sent with `verdict`. */
export function fixDone(verdict: 'confirmed' | 'rejected' = 'confirmed', commits = 1): Claude {
  return (w, args) => {
    const ids = [...promptOf(args).matchAll(/^- id (\S+) /gm)].map((m) => m[1]!);
    for (let i = 0; i < commits; i++) w.commit();
    return claudeOut({
      result: fence({ status: 'done', findings: ids.map((id) => ({ id, verdict, reason: `${verdict} by trace`, fix: verdict === 'confirmed' ? 'test "x" fails first' : '' })), notes: '' }),
      session: 'sess-2', turns: 5, cost: 0.5,
    });
  };
}

export function finding(id: string, over: Partial<Finding> = {}): Finding {
  return {
    id, title: `Finding ${id}`, description: 'Something is wrong.', action_level: 'action_required', category: 'Correctness',
    attribution_status: 'pending', dismiss_reason: null, location: { file_path: 'src/scan/repo.ts', start_line: 10, end_line: 12 },
    evidence: { explanation: 'Because.' }, ...over,
  };
}

export class World {
  calls: Call[] = [];
  now = T0;
  readonly clock: Clock = { now: () => this.now, sleep: async (ms) => { this.now += ms; } };
  readonly root = mkdtempSync(join(tmpdir(), 'agent-runner-'));
  readonly home = join(this.root, 'home');
  readonly repoDir = join(this.root, 'repo');
  readonly commonDir = join(this.repoDir, '.git');
  issues = new Map<number, FakeIssue>();
  prs: FakePr[] = [];
  ghUser = OWNER;
  ghAuth = true;
  qodoOk = true;
  readonly base = 'b'.repeat(40);
  commits: string[] = [];
  private made = 0;
  dirty = '';
  changed = ['src/scan/repo.ts', 'test/scan.test.ts'];
  remoteHead: string | null = null;
  pushTimes = new Map<string, number>();
  checkFailures: Record<string, number> = {};
  claude: Claude[] = [];
  /** Findings Qodo reports once it has reviewed `head`. */
  findings: (head: string, w: World) => Finding[] = () => [];
  effort = 'standard';
  /** Qodo starts this long after a push; null = never. */
  qodoDelayMs: number | null = 10_000;
  /** CI completes this long after a push; null = never. */
  ciDelayMs: number | null = 60_000;
  ciConclusion: (head: string) => string = () => 'success';
  /** The issue's body changes at this time. */
  editAt: number | null = null;
  lockBusy = false;
  /** What lockf runs once it holds the lock. */
  inner: (() => Promise<number>) | null = null;

  constructor() {
    mkdirSync(join(this.home, '.toolbox/bin'), { recursive: true });
    writeFileSync(join(this.home, '.toolbox/bin/claude'), '#!/bin/sh\nexit 1\n');
    chmodSync(join(this.home, '.toolbox/bin/claude'), 0o755);
    mkdirSync(this.commonDir, { recursive: true });
    this.setCookieHours(12);
  }

  /** Writes a Midway jar whose session cookie expires `hours` after now (null = no jar). */
  setCookieHours(hours: number | null): void {
    mkdirSync(join(this.home, '.midway'), { recursive: true });
    const exp = Math.floor(this.now / 1000 + (hours ?? 0) * 3600);
    writeFileSync(join(this.home, '.midway/cookie'), hours === null ? '# Netscape HTTP Cookie File\n' :
      `# Netscape HTTP Cookie File\n#HttpOnly_midway-auth.amazon.com\tFALSE\t/\tTRUE\t${exp}\tsession\t${COOKIE_VALUE}\n`);
  }

  config(over: Partial<Config> = {}): Config {
    return { ...defaults(this.home, this.repoDir, this.commonDir, SLUG), ...over };
  }

  addIssue(n: number, over: Partial<FakeIssue> = {}): FakeIssue {
    const issue: FakeIssue = {
      number: n, title: 'Scan: windowCommits splits numstat on U+0001', body: AC_BODY, author: OWNER,
      createdAt: '2026-11-06T19:22:03Z', labels: new Set([LABELS.ready]), labeler: OWNER, comments: [], state: 'OPEN', ...over,
    };
    this.issues.set(n, issue);
    return issue;
  }

  get head(): string {
    return this.commits.at(-1) ?? this.base;
  }

  commit(): string {
    const s = sha(++this.made);
    this.commits.push(s);
    return s;
  }

  tick(over: Partial<Config> = {}, deps: Partial<Deps> = {}): Promise<Outcome> {
    return runTick(this.config(over), { exec: this.exec, clock: this.clock, env: { PATH: '/usr/bin', GH_TOKEN: FAKE_TOKEN }, print: () => {}, ...deps });
  }

  cleanup(): void {
    rmSync(this.root, { recursive: true, force: true });
  }

  readonly exec: Exec = async (cmd, args, opts) => {
    this.calls.push({ cmd, args: [...args], cwd: opts.cwd, env: opts.env });
    return this.route(cmd.split('/').at(-1)!, [...args], opts);
  };

  private async route(cmd: string, args: string[], opts: ExecOptions): Promise<ExecResult> {
    switch (cmd) {
      case 'lockf': return this.lockBusy ? fail(75, '') : { ...ok(), code: await this.inner!() };
      case 'gh': return this.gh(args);
      case 'git': return this.git(args, opts);
      case 'npm': return this.npm(args);
      case 'claude': {
        const next = this.claude.shift();
        if (!next) throw new Error('unexpected claude call');
        return next(this, args);
      }
      case 'qodo': return this.qodo(args);
      case 'launchctl': return ok();
      default: throw new Error(`unexpected command ${cmd}`);
    }
  }

  private issueText(i: FakeIssue): { title: string; body: string } {
    return { title: i.title, body: this.editAt !== null && this.now >= this.editAt ? i.body + '\nEdited.' : i.body };
  }

  private gh(args: string[]): ExecResult {
    const [a, b] = args;
    const flag = (f: string) => args[args.indexOf(f) + 1]!;
    const issue = (n: string) => {
      const i = this.issues.get(Number(n));
      if (!i) throw new Error(`no issue ${n}`);
      return i;
    };
    if (a === 'api' && b === 'user') return this.ghAuth ? ok(`${this.ghUser}\n`) : fail();
    if (a === 'issue' && b === 'list') {
      // `--label x`, or GitHub search's `label:a,b` (either label).
      const wanted = args.includes('--label') ? [flag('--label')] : (/\blabel:(\S+)/.exec(flag('--search'))?.[1] ?? '').split(',');
      // Newest first, so the runner has to sort for itself.
      const list = [...this.issues.values()].filter((i) => i.state === 'OPEN' && wanted.some((l) => i.labels.has(l))).sort((x, y) => y.number - x.number);
      return ok(JSON.stringify(list.map((i) => ({ number: i.number, createdAt: i.createdAt, labels: [...i.labels].map((name) => ({ name })) }))));
    }
    if (a === 'issue' && b === 'view') {
      const i = issue(args[2]!);
      return ok(JSON.stringify({
        number: i.number, ...this.issueText(i), author: { login: i.author }, url: `https://github.com/${SLUG}/issues/${i.number}`,
        state: i.state, labels: [...i.labels].map((name) => ({ name })),
      }));
    }
    if (a === 'issue' && b === 'edit') {
      const i = issue(args[2]!);
      i.labels.delete(flag('--remove-label'));
      i.labels.add(flag('--add-label'));
      return ok();
    }
    if (a === 'issue' && b === 'comment') {
      issue(args[2]!).comments.push(readFileSync(flag('--body-file'), 'utf8'));
      return ok();
    }
    if (a === 'pr' && b === 'create') {
      const number = 100 + this.prs.length;
      const url = `https://github.com/${SLUG}/pull/${number}`;
      this.prs.push({ number, url, base: flag('--base'), branch: flag('--head'), title: flag('--title'), body: readFileSync(flag('--body-file'), 'utf8'), comments: [], state: 'OPEN' });
      return ok(`${url}\n`);
    }
    if (a === 'pr' && b === 'view') return ok(JSON.stringify({ headRefOid: this.remoteHead, state: this.prs[0]!.state }));
    if (a === 'pr' && b === 'comment') {
      this.prs.find((p) => p.url === args[2])!.comments.push(readFileSync(flag('--body-file'), 'utf8'));
      return ok();
    }
    if (a === 'run' && b === 'view') return ok('step 3\nError: test failed\n');
    if (a === 'api') {
      const path = args.find((x) => x.startsWith('repos/'))!;
      const events = /issues\/(\d+)\/events$/.exec(path);
      if (events) {
        const i = issue(events[1]!);
        return ok(i.labeler ? `someone-else\n${i.labeler}\n` : '');
      }
      if (/issues\/\d+\/comments$/.test(path)) {
        const h = this.remoteHead;
        return ok(h && this.reviewStarted(h) ? `<h3>Code Review by Qodo</h3>\n<!-- https://github.com/${SLUG}/commit/${h} -->\n` : '');
      }
      const runs = /commits\/([0-9a-f]+)\/check-runs/.exec(path);
      if (runs) return ok(JSON.stringify({ total_count: 2, check_runs: this.checkRuns(runs[1]!) }));
    }
    throw new Error(`unrouted gh ${args.join(' ')}`);
  }

  /** True once `delay` has passed since `head` was pushed; a null delay never passes. */
  private since(head: string, delay: number | null): boolean {
    const t = this.pushTimes.get(head);
    return t !== undefined && delay !== null && this.now >= t + delay;
  }

  private reviewStarted(head: string): boolean {
    return this.since(head, this.qodoDelayMs);
  }

  private checkRuns(head: string): CheckRun[] {
    const done = this.since(head, this.ciDelayMs);
    return ['check (20)', 'check (22)'].map((name, i) => ({
      id: 1000 + i, name, status: done ? 'completed' : 'in_progress', conclusion: done ? this.ciConclusion(head) : null,
    }));
  }

  private qodo(args: string[]): ExecResult {
    if (args[1] === 'whoami') return this.qodoOk ? ok('{"schema_version":1}\ntrace abc\n') : fail();
    const head = this.remoteHead;
    const runs: ReviewRun[] = [];
    let findings: Finding[] = [];
    if (head && this.reviewStarted(head)) {
      const started = this.pushTimes.get(head)! + this.qodoDelayMs!;
      runs.push({ run_id: 1, commit_sha: head, started_at: new Date(started).toISOString(), status: 'completed', review_effort: this.effort });
      findings = this.findings(head, this);
    }
    return ok(`${JSON.stringify({ pr_url: 'x', finding_count: findings.length, findings, review_runs: runs })}\ntrace 123\n`);
  }

  private git(args: string[], opts: ExecOptions): ExecResult {
    const [sub, ...rest] = args;
    switch (sub) {
      case 'rev-parse':
        if (rest[0] === '--path-format=absolute') return ok(`${this.commonDir}\n`);
        if (rest[0] === '--verify') return fail();
        return ok(`${this.head}\n`);
      case 'remote': return ok(`https://github.com/${SLUG}.git\n`);
      case 'fetch': case 'worktree': return ok();
      case 'ls-remote': return ok('');
      case 'rev-list': return ok(`${this.commits.length}\n`);
      case 'merge-base': return rest[1] === this.base || this.commits.includes(rest[1]!) ? ok() : fail();
      case 'diff': return ok(this.changed.join('\n') + '\n');
      case 'status': return ok(this.dirty);
      case 'log': return ok('fix(scan): parse numstat positionally on NUL\n');
      case 'push':
        expect(opts.cwd).toContain('.sandboxes');
        this.remoteHead = this.head;
        this.pushTimes.set(this.head, this.now);
        return ok();
      default: throw new Error(`unrouted git ${args.join(' ')}`);
    }
  }

  private npm(args: string[]): ExecResult {
    if (args[0] === 'ci' || args[0] === '--version') return ok('10.9.0\n');
    const name = args[0] === 'test' ? 'npm test' : `npm run ${args[1]}`;
    if ((this.checkFailures[name] ?? 0) > 0) {
      this.checkFailures[name]!--;
      return { code: 1, stdout: `FAIL ${name}\nexpected 1 to be 2`, stderr: '', timedOut: false };
    }
    return ok('ok\n');
  }

  // ----- queries for assertions -----

  callsTo(cmd: string): Call[] {
    return this.calls.filter((c) => c.cmd.split('/').at(-1) === cmd);
  }

  gitCalls(sub: string): Call[] {
    return this.callsTo('git').filter((c) => c.args[0] === sub);
  }

  runDir(): string {
    const runs = join(this.commonDir, 'factory/runs');
    return join(runs, readdirSync(runs)[0]!);
  }

  readLog(file: string): Record<string, unknown>[] {
    return readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
  }
}

/**
 * Guardrails every scenario must hold (R8): no merge of any kind, no push to main or the
 * session branch, no force push. Written independently of factory/guard.ts.
 */
export function assertGuardrails(w: World): void {
  for (const c of w.callsTo('gh')) {
    expect(c.args.slice(0, 2), 'gh pr merge').not.toEqual(['pr', 'merge']);
    expect(c.args, 'no gh merge of any kind').not.toContain('merge');
    expect(['repo', 'secret', 'variable', 'ruleset'], 'no repo settings or secrets').not.toContain(c.args[0]);
  }
  for (const c of w.callsTo('git')) {
    expect(c.args[0], 'no git merge').not.toBe('merge');
    expect(c.args[0]!.startsWith('-'), `no leading git options: ${c.args.join(' ')}`).toBe(false);
  }
  for (const c of w.gitCalls('push')) {
    const refspec = c.args.at(-1)!;
    expect(c.args.some((a) => /^(-f|--force.*|--mirror|--all|--delete|-d)$/.test(a)), `force push: ${c.args.join(' ')}`).toBe(false);
    expect(refspec.startsWith('+')).toBe(false);
    expect(refspec).toMatch(/^HEAD:refs\/heads\/agent\/\d+-/);
    expect(refspec).not.toMatch(/refs\/heads\/(main|session\/)/);
  }
}
