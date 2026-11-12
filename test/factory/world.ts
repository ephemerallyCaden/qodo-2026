// An offline stand-in for everything the agent runner talks to: gh, git, npm, claude, qodo,
// lockf and launchctl, plus a clock that jumps instead of sleeping. No network, no real agent.
import { chmodSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';
import { defaults, LABELS, type Config } from '../../factory/config.js';
import type { Exec, ExecOptions, ExecResult } from '../../factory/exec.js';
import type { Clock } from '../../factory/log.js';
import { emptyLedger } from '../../factory/ledger.js';
import { ledgerFile, runSweep, type SweepOptions, type SweepSummary } from '../../factory/repeats.js';
import type { CheckRun, Finding, ReviewRun } from '../../factory/review.js';
import { runTick, type Deps, type Outcome } from '../../factory/runner.js';
import { PROBE, STATE_MARK } from '../../factory/sandbox.js';
import { realTempDir } from '../fixtures/tmp.js';

export const OWNER = 'owner';
export const SLUG = 'owner/repo';
export const BASE = 'session/week1';
export const T0 = Date.UTC(2026, 10, 9, 12, 0, 0);
export const COOKIE_VALUE = 'COOKIE-VALUE-MUST-NOT-LEAK-0123456789';
export const FAKE_TOKEN = 'ghp_' + 'A'.repeat(36);
/** Secrets in the runner's environment that nothing the agent runs may inherit (S6). */
export const RUNNER_SECRETS = { AWS_SECRET_ACCESS_KEY: 'AWS-SECRET-MUST-NOT-LEAK', SSH_AUTH_SOCK: '/tmp/agent.sock', ANTHROPIC_API_KEY: 'ANTHROPIC-KEY-MUST-NOT-LEAK' };

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
  /** Comments by other people (the runner's own are `comments`). */
  foreign?: { login: string; body: string }[];
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
/** 'off' behaves as if unsandboxed (settings ignored); 'no-run' never runs the probe at all. */
export type SandboxMode = 'on' | 'off' | 'no-run';

/** One judge call as the fake sees it: the system prompt, the prompt and the JSON schema. */
export interface JudgeSeen {
  system: string;
  prompt: string;
  schema: { properties?: Record<string, unknown> };
}
export type Judge = (w: World, call: JudgeSeen) => ExecResult;

/** A PR the owner opened by hand (not the runner's), with the review Qodo gives it. */
export interface OwnerPr {
  number: number;
  title: string;
  body: string;
  head: string;
  state: 'OPEN' | 'MERGED' | 'CLOSED';
  updatedAt: string;
  author: string;
  /** The PR's head commit; by default the commit its one review ran on. */
  headOid: string;
  /** Qodo's answer to `read pr-review-session findings` for this PR. */
  review: { runs: ReviewRun[]; findings: Finding[] } | (() => ExecResult);
}

export const ok = (stdout = ''): ExecResult => ({ code: 0, stdout, stderr: '', timedOut: false });
export const fail = (code = 1, stderr = 'failed'): ExecResult => ({ code, stdout: '', stderr, timedOut: false });
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

/** A judge call that answers with `answer` as its structured output. */
export function judgeOut(answer: unknown, over: { subtype?: string; code?: number; structured?: boolean } = {}): ExecResult {
  const json = {
    type: 'result', subtype: over.subtype ?? 'success', is_error: false, result: JSON.stringify(answer), num_turns: 2, total_cost_usd: 0.1,
    ...(over.structured === false ? {} : { structured_output: answer }),
  };
  return { code: over.code ?? 0, stdout: JSON.stringify(json), stderr: '', timedOut: false };
}

/** The JSON between `<tag>` and `</tag>` in a judge prompt. */
export const tagged = <T>(prompt: string, tag: string): T => JSON.parse(new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`).exec(prompt)![1]!) as T;

/** The kind a fake finding repeats: its title's `[kind]` prefix, else its own id (a one-off). */
export const kindOf = (f: { id: string; title: string }) => /^\[([a-z0-9-]+)\]/.exec(f.title)?.[1] ?? f.id;

export const DRAFT = {
  mistake: 'Git output is framed with a byte other than NUL.',
  rule: { name: 'Frame path-listing git output on NUL', what: 'Read git output that lists paths with -z and split it on NUL only.', where: 'src/scan/** and src/attrib/**', why: 'Seen 3 times across 2 tickets.' },
  category: 'Correctness',
  criteria: ['AGENTS.md has a rule saying what to do, where and why.', 'The rule cites the findings in this issue.'],
};

/**
 * A judge that groups findings by `kindOf`, naming each group "Mistake: <kind>.", and answers
 * every draft with DRAFT. Deterministic, so tests can count groups.
 */
export const kindJudge: Judge = (_, call) => {
  if (call.schema.properties?.['rule']) return judgeOut(DRAFT);
  const groups = tagged<{ group: string; mistake: string }[]>(call.prompt, 'groups');
  const findings = tagged<{ id: string; title: string }[]>(call.prompt, 'findings');
  return judgeOut({
    assignments: findings.map((f) => {
      const mistake = `Mistake: ${kindOf(f)}.`;
      const known = groups.find((g) => g.mistake === mistake);
      return known ? { finding: f.id, group: known.group } : { finding: f.id, group: `new:${kindOf(f).replace(/[^A-Za-z0-9_-]/g, '')}`, mistake };
    }),
  });
};

/** A finding of a repeating kind (see `kindOf`). */
export const kinded = (id: string, kind: string, over: Partial<Finding> = {}) => finding(id, { title: `[${kind}] Finding ${id}`, ...over });

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
  // Real paths: the sandbox-exec profile names resolved paths (/private/var/…).
  readonly root = realTempDir('agent-runner-');
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
  /** Check runs on each head; GitHub serves them in pages of `per_page` (default 30, at most 100). */
  ciRunCount = 2;
  ciConclusion: (head: string) => string = () => 'success';
  /** The issue's body changes at this time. */
  editAt: number | null = null;
  lockBusy = false;
  /** What lockf runs once it holds the lock. */
  inner: (() => Promise<number>) | null = null;
  ownerPrs: OwnerPr[] = [];
  /** `qodo read rules search` results; null = the search fails. */
  rules: { id: number; name: string; content: string; severity: string }[] | null = [];
  judge: Judge = kindJudge;
  /** GitHub's author search lets other people's PRs through (the runner must filter them itself). */
  authorSearchLeaks = false;
  /** `gh issue list --label rule-proposal` works. */
  proposalListOk = true;
  readonly evidenceDir = join(this.repoDir, '.archive/docs/hackathon/evidence');
  /** How the probe fares under claude's sandbox and under sandbox-exec: 'on' refuses what it should. */
  claudeSandbox: SandboxMode = 'on';
  seatbelt: SandboxMode = 'on';
  /** The self-test's claude call, before the probe: null runs it, anything else replaces it. */
  selfTestClaude: ((w: World, args: string[]) => ExecResult) | null = null;
  /** Whether the self-test's Read of the canary comes back as a permission denial. */
  readDenied = true;
  /** Where the shared `.git`'s `origin/<base>` ref points if something moved it after the fetch (null: the base). */
  originRef: string | null = null;
  /** The files each commit changes; when empty, every diff is `changed`. */
  commitFiles = new Map<string, string[]>();

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

  /** One findings sweep with the real defaults, except a generous call cap. */
  sweep(opts: Partial<SweepOptions> = {}, over: Partial<Config> = {}): Promise<SweepSummary> {
    return runSweep(this.config({ sweepMaxCalls: 20, ...over }), { exec: this.exec, clock: this.clock, env: { PATH: '/usr/bin', GH_TOKEN: FAKE_TOKEN }, print: () => {} },
      { seedThrough: null, ...opts });
  }

  /** Starts an empty ledger seeded long ago, so the next sweep isn't the seeding one and every finding is new. */
  startLedger(): void {
    mkdirSync(join(this.commonDir, 'factory/findings'), { recursive: true });
    writeFileSync(ledgerFile(this.config()), JSON.stringify(emptyLedger('2000-01-01T00:00:00.000Z')));
  }

  /** An owner PR for ticket `ticket` (or none), reviewed once at `startedAt` with these findings. */
  addOwnerPr(number: number, findings: Finding[], o: { ticket?: number; startedAt?: string; over?: Partial<OwnerPr> } = {}): OwnerPr {
    const commit = sha(9000 + number);
    const pr: OwnerPr = {
      number, title: `feat: change ${number}`, body: o.ticket ? `Does it.\n\nCloses #${o.ticket}\n` : 'Does it.\n',
      head: o.ticket ? `feature/${o.ticket}-change` : `feature/change-${number}`, state: 'MERGED', updatedAt: '2026-11-08T00:00:00Z', author: OWNER, headOid: commit,
      review: {
        runs: [{ run_id: number, commit_sha: commit, started_at: o.startedAt ?? '2026-11-08T00:00:00.000000Z', status: 'completed', review_effort: 'standard' }],
        findings: findings.map((f) => ({ git_sha: commit, ...f })),
      },
      ...o.over,
    };
    this.ownerPrs.push(pr);
    return pr;
  }

  /** A local \`qodo review --json\` export under the evidence folder. */
  writeExport(rel: string, findings: Finding[], o: { startedAt?: string; complete?: boolean; error?: boolean } = {}): void {
    const file = join(this.evidenceDir, rel);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, JSON.stringify(o.error ? { error: { message: 'review failed' } } : {
      findings, finding_state: { complete: o.complete ?? true, introduced: findings.map((f) => f.id), resolved: [], still_open: [], dismissed: [] },
      review_agent_comment: 'x',
      meta: { coverage: { complete: true }, run: { effort: { effective: 'standard' }, timing: { started_at: o.startedAt ?? '2026-11-07T00:00:00.000000+00:00' } } },
    }));
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
    return runTick(this.config(over), {
      exec: this.exec, clock: this.clock, env: { PATH: '/usr/bin', HOME: this.home, GH_TOKEN: FAKE_TOKEN, ...RUNNER_SECRETS }, print: () => {}, ...deps,
    });
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
      case 'sandbox-exec': {
        const [, , inner, ...rest] = args;
        if (inner === 'npm') return this.npm(rest);
        if (inner === 'git') return this.git(rest, opts);
        if (inner === '/bin/sh' && rest[0] === PROBE) return this.probe(opts.cwd!, this.seatbelt);
        throw new Error(`unexpected sandbox-exec ${inner}`);
      }
      case 'claude': {
        // The judge first: like the self-test it saves no session, but only it asks for a JSON schema.
        if (args.includes('--json-schema')) {
          const at = (f: string) => args[args.indexOf(f) + 1]!;
          return this.judge(this, { system: at('--system-prompt'), prompt: at('-p'), schema: JSON.parse(at('--json-schema')) as JudgeSeen['schema'] });
        }
        if (args.includes('--no-session-persistence')) {
          this.selfTestCwd = opts.cwd!;
          return this.selfTestClaude ? this.selfTestClaude(this, args) : this.selfTest(args, opts);
        }
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
      const all = args.includes('--state') && flag('--state') === 'all';
      if (args.includes('--label') && flag('--label') === LABELS.proposal && !this.proposalListOk) return fail();
      const list = [...this.issues.values()].filter((i) => (all || i.state === 'OPEN') && wanted.some((l) => i.labels.has(l))).sort((x, y) => y.number - x.number);
      return ok(JSON.stringify(list.map((i) => ({
        number: i.number, createdAt: i.createdAt, labels: [...i.labels].map((name) => ({ name })), title: i.title, body: i.body, author: { login: i.author }, state: i.state,
      }))));
    }
    if (a === 'issue' && b === 'create') {
      const number = Math.max(199, ...this.issues.keys()) + 1;
      this.issues.set(number, {
        number, title: flag('--title'), body: readFileSync(flag('--body-file'), 'utf8'), author: this.ghUser, createdAt: new Date(this.now).toISOString(),
        labels: new Set([flag('--label')]), labeler: null, comments: [], state: 'OPEN',
      });
      return ok(`https://github.com/${SLUG}/issues/${number}\n`);
    }
    if (a === 'pr' && b === 'list') {
      const mine = this.prs.map((p) => ({ number: p.number, url: p.url, title: p.title, body: p.body, headRefName: p.branch, headRefOid: this.remoteHead, state: p.state, updatedAt: new Date(this.now).toISOString(), author: { login: this.ghUser } }));
      const owner = this.ownerPrs.map((p) => ({ number: p.number, url: `https://github.com/${SLUG}/pull/${p.number}`, title: p.title, body: p.body, headRefName: p.head, headRefOid: p.headOid, state: p.state, updatedAt: p.updatedAt, author: { login: p.author } }));
      return ok(JSON.stringify([...owner, ...mine].filter((p) => this.authorSearchLeaks || !args.includes('--author') || p.author.login === flag('--author'))));
    }
    if (a === 'issue' && b === 'view') {
      const i = issue(args[2]!);
      return ok(JSON.stringify({
        number: i.number, ...this.issueText(i), author: { login: i.author }, url: `https://github.com/${SLUG}/issues/${i.number}`,
        state: i.state, labels: [...i.labels].map((name) => ({ name })), comments: i.comments.map((body) => ({ body })),
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
      const proposalComments = /issues\/(\d+)\/comments$/.exec(path);
      if (proposalComments && this.issues.has(Number(proposalComments[1]))) {
        // Emulates `--jq '.[] | select(.user.login == "<login>") | .body'`.
        const i = this.issues.get(Number(proposalComments[1]))!;
        const login = /select\(\.user\.login == "([^"]+)"\)/.exec(flag('--jq'))?.[1];
        const all = [...i.comments.map((body) => ({ login: this.ghUser, body })), ...(i.foreign ?? [])];
        return ok(all.filter((c) => c.login === login).map((c) => c.body).join('\n'));
      }
      if (/issues\/\d+\/comments$/.test(path)) {
        const h = this.remoteHead;
        return ok(h && this.reviewStarted(h) ? `<h3>Code Review by Qodo</h3>\n<!-- https://github.com/${SLUG}/commit/${h} -->\n` : '');
      }
      const runs = /commits\/([0-9a-f]+)\/check-runs/.exec(path);
      if (runs) {
        const all = this.checkRuns(runs[1]!);
        const per = Math.min(100, Number(/per_page=(\d+)/.exec(path)?.[1] ?? 30));
        const pages = Array.from({ length: Math.ceil(all.length / per) }, (_, i) => ({ total_count: all.length, check_runs: all.slice(i * per, (i + 1) * per) }));
        if (!args.includes('--paginate')) return ok(JSON.stringify(pages[0]));
        // gh --paginate alone concatenates the page objects; --slurp wraps them in one array.
        return ok(args.includes('--slurp') ? JSON.stringify(pages) : pages.map((x) => JSON.stringify(x)).join(''));
      }
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
    const names = Array.from({ length: this.ciRunCount }, (_, i) => (i < 2 ? `check (${20 + 2 * i})` : `extra ${i}`));
    return names.map((name, i) => ({
      id: 1000 + i, name, status: done ? 'completed' : 'in_progress', conclusion: done ? this.ciConclusion(head) : null,
    }));
  }

  private qodo(args: string[]): ExecResult {
    if (args[1] === 'whoami') return this.qodoOk ? ok('{"schema_version":1}\ntrace abc\n') : fail();
    if (args[1] === 'rules') return this.rules ? ok(`${JSON.stringify({ rules: this.rules })}\n  trace 1\n`) : fail();
    const url = args[args.indexOf('--pr-url') + 1];
    const owned = this.ownerPrs.find((p) => url === `https://github.com/${SLUG}/pull/${p.number}`);
    if (owned) {
      if (typeof owned.review === 'function') return owned.review();
      const { runs, findings } = owned.review;
      return ok(`${JSON.stringify({ pr_url: url, finding_count: findings.length, findings, review_runs: runs })}\ntrace 123\n`);
    }
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
        if (rest[0] === '--absolute-git-dir') return ok(`${join(this.commonDir, 'worktrees', opts.cwd!.split('/').at(-1)!)}\n`);
        if (rest[0]?.startsWith('origin/')) return ok(`${this.resolve(rest[0].replace('^{commit}', ''))}\n`);
        return ok(`${this.head}\n`);
      case 'remote': return ok(`https://github.com/${SLUG}.git\n`);
      case 'fetch':
        this.originRef = null;
        return ok();
      case 'worktree': return ok();
      case 'ls-remote': return ok('');
      case 'rev-list': return ok(`${this.commitsAfter(rest.find((a) => a.endsWith('..HEAD'))!.slice(0, -'..HEAD'.length)).length}\n`);
      case 'merge-base': return rest[1] === this.base || this.commits.includes(rest[1]!) ? ok() : fail();
      case 'diff': {
        if (!this.commitFiles.size) return ok(this.changed.join('\n') + '\n');
        const after = this.commitsAfter(rest.find((a) => a.endsWith('...HEAD'))!.slice(0, -'...HEAD'.length));
        return ok([...new Set(after.flatMap((c) => this.commitFiles.get(c) ?? []))].join('\n') + '\n');
      }
      case 'status': return ok(this.dirty);
      case 'log': return ok('fix(scan): parse numstat positionally on NUL\n');
      case 'push': {
        // The runner pushes the commit it verified, by SHA, from the main checkout.
        expect(opts.cwd).toBe(this.repoDir);
        const sha = rest[1]!.split(':')[0]!;
        this.remoteHead = sha === 'HEAD' ? this.head : sha;
        this.pushTimes.set(this.remoteHead, this.now);
        return ok();
      }
      default: throw new Error(`unrouted git ${args.join(' ')}`);
    }
  }

  /** The probe's out-* files as a working sandbox (or none, or a broken one) would leave them. */
  private probe(cwd: string, mode: SandboxMode): ExecResult {
    if (mode === 'no-run') return fail(1, 'sh: probe.sh: Operation not permitted');
    const on = mode === 'on';
    const out = (name: string, text: string) => writeFileSync(join(cwd, `out-${name}`), text);
    out('visible', readFileSync(join(cwd, 'visible.txt'), 'utf8'));
    out('canary', on ? 'cat: ../denied/canary.txt: Operation not permitted\n' : readFileSync(join(cwd, '../denied/canary.txt'), 'utf8'));
    const mark = join(this.config().stateDir, STATE_MARK);
    if (on) out('write', `touch: ${mark}: Operation not permitted\n`);
    else writeFileSync(mark, '');
    out('net', on ? 'NET_EPERM\n' : 'NET_TIMEOUT\n');
    out('local', 'LOCAL_OK\n');
    out('done', 'done\n');
    return ok();
  }

  /** The self-test call as a working sandbox answers it; tests wrap it to break one part. */
  runSelfTest(args: string[]): ExecResult {
    return this.selfTest(args, { cwd: this.selfTestCwd, timeoutMs: 1 });
  }

  private selfTestCwd = '';

  private selfTest(args: string[], opts: ExecOptions): ExecResult {
    this.probe(opts.cwd!, this.claudeSandbox);
    const read = this.readDenied && this.claudeSandbox !== 'off';
    return claudeOut({ result: 'done', session: 'selftest', turns: 3, cost: 0.1,
      denials: read ? [{ tool_name: 'Read', tool_use_id: 't1', tool_input: { file_path: promptOf(args).match(/Read tool once on (\S+)\./)?.[1] } }] : [] });
  }

  /** What a rev names: `origin/<base>` is the fetched base unless something moved the ref since. */
  private resolve(rev: string): string {
    return rev === `origin/${BASE}` ? this.originRef ?? this.base : rev;
  }

  /** The commits after `rev` on the agent's branch (all of them for the base). */
  private commitsAfter(rev: string): string[] {
    const i = this.commits.indexOf(this.resolve(rev));
    return i >= 0 ? this.commits.slice(i + 1) : this.commits;
  }

  private npm(args: string[]): ExecResult {
    if (args[0] === 'ci' || args[0] === 'rebuild' || args[0] === '--version') return ok('10.9.0\n');
    const name = args[0] === 'test' ? 'npm test' : `npm run ${args[1]}`;
    if ((this.checkFailures[name] ?? 0) > 0) {
      this.checkFailures[name]!--;
      return { code: 1, stdout: `FAIL ${name}\nexpected 1 to be 2`, stderr: '', timedOut: false };
    }
    return ok('ok\n');
  }

  // ----- queries for assertions -----

  /** Calls of `cmd`, including those run under sandbox-exec (unwrapped, with their profile). */
  callsTo(cmd: string): (Call & { profile?: string })[] {
    const name = (c: string) => c.split('/').at(-1);
    return this.calls.flatMap((c) => {
      if (name(c.cmd) === cmd) return [c];
      if (name(c.cmd) === 'sandbox-exec' && name(c.args[2] ?? '') === cmd) return [{ ...c, cmd: c.args[2]!, args: c.args.slice(3), profile: c.args[1]! }];
      return [];
    });
  }

  gitCalls(sub: string): Call[] {
    return this.callsTo('git').filter((c) => c.args[0] === sub);
  }

  /** npm runs in the worktree, each under sandbox-exec: the npm args, with the profile it ran under. */
  npmCalls(): (Call & { profile?: string })[] {
    return this.callsTo('npm').filter((c) => c.profile);
  }

  /** The agent's own calls, without the sandbox self-test's. */
  agentCalls(): Call[] {
    return this.callsTo('claude').filter((c) => !c.args.includes('--no-session-persistence'));
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
    expect(refspec).toMatch(/^[0-9a-f]{40}:refs\/heads\/agent\/\d+-/);
    expect(refspec).not.toMatch(/refs\/heads\/(main|session\/)/);
  }
}
