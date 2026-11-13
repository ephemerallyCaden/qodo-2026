// One tick of the agent runner (docs/features/agent-runner.md R1–R13): pick the oldest
// owner-labelled ticket, refuse it or claim it, run the headless agent in a fresh worktree,
// publish its branch as a PR, then loop on CI and Qodo with at most two fix rounds.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  agentEnv, agentRecord, claudeArgs, fixPrompt, fixResult, implementPrompt, implementResult, isPrTitle, readClaude,
  systemPrompt, type AgentCall, type Disposition, type FixInput, type ImplementResult,
} from './agent.js';
import { LABELS, machinePaths, ticksFile, type Config } from './config.js';
import type { Exec, ExecResult } from './exec.js';
import { guarded, GuardError } from './guard.js';
import { redact, RunLog, stamp, type Clock } from './log.js';
import { isExecutable, midwayHoursLeft, type Check } from './preflight.js';
import { dispositionsComment, prBody, summaryComment, type CheckResult } from './report.js';
import {
  ciState, isBlocking, parseQodo, qodoMarker, qodoState, shortSha,
  type CheckRun, type CiState, type Finding, type QodoState, type ReviewRun,
} from './review.js';
import { claudeSettings, SANDBOX_EXEC, sandboxSelfTest, seatbelt, seatbeltProfile, worktreeGit, type SandboxPaths } from './sandbox.js';
import { Shell } from './shell.js';
import { acceptanceCriteria, branchStem, ticketHash, ticketMarkdown, type Ticket } from './ticket.js';

export interface Deps {
  exec: Exec;
  clock: Clock;
  /** Base environment for every child process. */
  env: NodeJS.ProcessEnv;
  print: (line: string) => void;
}

export type Outcome =
  | { state: 'idle' }
  | { state: 'error'; reason: string }
  | { state: 'preflight-failed'; issue: number; reasons: string[] }
  | { state: 'refused'; issue: number; reason: string }
  /** The ticket was closed, unlabelled or edited before the claim: nothing touched, the next tick re-reads it. */
  | { state: 'skipped'; issue: number; reason: string }
  | { state: 'dry-run'; issue: number; decision: string }
  | { state: 'done'; issue: number; pr: string }
  | { state: 'needs-help'; issue: number; reason: string };

/** Ends a claimed run with `agent-needs-help` and this reason (R7). */
class Stop extends Error {}

const CHECKS: [string, string[]][] = [
  ['npm run build', ['run', 'build']], ['npm run typecheck', ['run', 'typecheck']],
  ['npm run lint', ['run', 'lint']], ['npm test', ['test']],
];
const PROTECTED = [/^\.github\//, /^\.claude\//, /^CONSTITUTION\.md$/];
const QODO_BOT = 'qodo-code-review[bot]';

const tail = (s: string, lines = 120) => s.split('\n').slice(-lines).join('\n').trim();
const firstLine = (s: string) => s.trim().split('\n')[0] ?? '';
const needsHuman = (n: number) => new Stop(`${n} action_required finding(s) the agent rejected need the human's decision`);

/** Every gh and git command a tick runs passes the runtime guardrails (R8). */
export function runTick(cfg: Config, deps: Deps): Promise<Outcome> {
  return new Tick(cfg, { ...deps, exec: guarded(deps.exec) }).run();
}

interface IssueView {
  number: number;
  title: string;
  body?: string;
  author?: { login?: string };
  url: string;
  state: string;
  labels?: { name: string }[];
}

/** Why an issue the owner has revoked (closed or unlabelled) must not be claimed, or null. */
function revoked(v: IssueView): string | null {
  if (v.state !== 'OPEN') return `#${v.number} is ${v.state.toLowerCase()}`;
  if (!v.labels?.some((l) => l.name === LABELS.ready)) return `#${v.number} no longer has ${LABELS.ready}`;
  return null;
}

interface Review {
  ci: CheckRun[];
  failed: CheckRun[];
  run: ReviewRun;
  findings: Finding[];
}

class Tick {
  private log: RunLog;
  private shell: Shell;
  /** Environment for the runner's own commands. */
  private env: NodeJS.ProcessEnv;
  /** Environment for anything that runs agent-written code: the agent and the checks. */
  private agentEnv: NodeJS.ProcessEnv = {};
  /** What the agent's sandbox and the runner's own (sandbox-exec) deny. */
  private sandbox: SandboxPaths;
  private runId = '';
  private runDir = '';
  private ticket: Ticket | null = null;
  private criteria: string[] = [];
  private snapshot = '';
  private branch = '';
  private worktree = '';
  /** The worktree's git dir, recorded before anything agent-written runs in it (b301674c). */
  private gitDir = '';
  /**
   * The base commit as fetched. Every later comparison uses it, never the `origin/<base>` ref,
   * which anything the agent runs can move in the shared `.git`.
   */
  private baseSha = '';
  private pr: { url: string; number: number } | null = null;
  /** The last pushed (and verified) commit. */
  private head: string | null = null;
  private fixRounds = 0;
  private reviewRounds = 0;
  private agentCalls = 0;
  private turns = 0;
  private costUsd = 0;
  private sessionId = '';
  private checks: CheckResult[] = [];
  private lastReview: Review | null = null;
  private dispositions: (Disposition & { round: number })[] = [];
  private files = 0;

  constructor(private cfg: Config, private deps: Deps) {
    this.log = new RunLog(cfg.dryRun ? null : ticksFile(cfg), deps.clock, deps.print, machinePaths(cfg));
    this.shell = new Shell(cfg, deps.exec, deps.clock, () => this.log, deps.env);
    this.env = this.shell.env;
    this.sandbox = { home: cfg.home, stateDir: cfg.stateDir, env: deps.env };
  }

  async run(): Promise<Outcome> {
    const { cfg } = this;
    this.log.event('tick', { dryRun: cfg.dryRun, base: cfg.base, repo: cfg.slug });
    let n: number | null;
    try {
      n = await this.pick();
    } catch (e) {
      return this.error(e);
    }
    if (n === null) {
      this.log.event('idle', { label: LABELS.ready });
      return { state: 'idle' };
    }
    this.runId = `${stamp(this.deps.clock.now())}-issue${n}`;
    this.runDir = join(cfg.stateDir, 'runs', this.runId);
    try {
      return await this.take(n);
    } catch (e) {
      return this.error(e);
    }
  }

  /**
   * The oldest open `ready-for-agent` issue (R1), or the `--issue` preview. The same single list
   * call finds `agent-working` orphans, which are swept first.
   */
  private async pick(): Promise<number | null> {
    if (this.cfg.previewIssue !== null) {
      this.log.event('picked', { issue: this.cfg.previewIssue, preview: true });
      return this.cfg.previewIssue;
    }
    const list = this.json<{ number: number; createdAt: string; labels?: { name: string }[] }[]>(await this.ghOk(['issue', 'list',
      '--repo', this.cfg.slug, '--state', 'open', '--search', `sort:created-asc label:${LABELS.ready},${LABELS.working}`,
      '--limit', '100', '--json', 'number,createdAt,labels'], 'list labelled issues'), 'labelled issues');
    const has = (i: (typeof list)[number], label: string) => !!i.labels?.some((l) => l.name === label);
    for (const orphan of list.filter((i) => has(i, LABELS.working))) await this.sweep(orphan.number);
    const ready = list.filter((i) => has(i, LABELS.ready) && !has(i, LABELS.working));
    if (!ready.length) return null;
    ready.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.number - b.number));
    this.log.event('picked', { issue: ready[0]!.number, labelled: ready.map((i) => i.number) });
    return ready[0]!.number;
  }

  /**
   * A tick runs under the lock, so no live run owns an `agent-working` ticket: its run died
   * (killed, rebooted, past the time cap). Hand it to the human rather than leave it claimed.
   */
  private async sweep(n: number): Promise<void> {
    const action = `#${n} has ${LABELS.working} but no live run: relabel ${LABELS.help} and comment`;
    if (this.cfg.dryRun) {
      this.log.event('would', { action });
      return;
    }
    this.log.event('orphan', { issue: n });
    await this.post('issue', String(n), `The agent runner stopped mid-run on this ticket (killed, rebooted or past its time cap) ` +
      `and could not report why. Its log is in \`.git/factory/runs/\` (the latest \`*-issue${n}\`). Re-apply \`${LABELS.ready}\` to retry.`,
    join(this.cfg.stateDir, 'sweep', `${stamp(this.deps.clock.now())}-issue${n}`));
    await this.relabel(LABELS.working, LABELS.help, n);
  }

  /** Trust and acceptance checks, pre-flight, claim, then the work (R2, R3, R12, R13). */
  private async take(n: number): Promise<Outcome> {
    const { cfg } = this;
    const [raw, labeler] = await Promise.all([this.viewIssue(n), this.labeler(n)]);
    const ticket: Ticket = { number: raw.number, title: raw.title, body: raw.body ?? '', url: raw.url, author: raw.author?.login ?? '' };
    this.ticket = ticket;
    const criteria = acceptanceCriteria(ticket.body);
    this.log.event('assess', {
      issue: n, title: ticket.title, author: ticket.author, labeler, owner: cfg.owner, state: raw.state, criteria: criteria?.length ?? null,
    });
    // The list is a moment old: the owner may have closed or unlabelled the ticket since (a preview may be of anything).
    const gone = cfg.previewIssue === null ? revoked(raw) : null;
    if (gone) return this.skip(n, gone);
    if (ticket.author !== cfg.owner) return this.refuse(`it was opened by @${ticket.author || 'unknown'}, not the repo owner @${cfg.owner}`);
    if (labeler !== cfg.owner) return this.refuse(`\`${LABELS.ready}\` was applied by ${labeler ? `@${labeler}` : 'nobody visible'}, not the repo owner @${cfg.owner}`);
    if (criteria === null) return this.refuse('it has no `## Acceptance criteria` section');
    if (!criteria.length) return this.refuse('its `## Acceptance criteria` section lists no criteria');
    this.criteria = criteria;

    const failed = (await this.preflight()).filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`);
    if (failed.length) {
      this.log.event('end', { state: 'preflight-failed', reasons: failed });
      return { state: 'preflight-failed', issue: n, reasons: failed };
    }
    if (cfg.dryRun) {
      const stem = branchStem(ticket);
      return this.preview(n, 'would claim', [
        'sandbox self-test (sandbox-exec, then one headless call); a failure hands the ticket back with agent-needs-help',
        `claim #${n}: ${LABELS.ready} → ${LABELS.working}, comment`,
        `worktree .sandboxes/agent-${n} on ${stem} from origin/${cfg.base}, npm ci --ignore-scripts, npm rebuild (sandboxed)`,
        `run ${basename(cfg.claude)} -p (dontAsk, sandboxed, ${cfg.maxTurns} turns, $${cfg.maxBudgetUsd}) on the ticket snapshot`,
        `verify (sandboxed), push ${stem}, open a PR against ${cfg.base}, wait for CI + Qodo (≤ ${cfg.maxFixRounds} fix rounds)`,
      ]);
    }

    // Pre-flight takes seconds and the self-test up to minutes; re-read after each, so a revoke or an
    // edit in that window wins and nothing is spent on a ticket that's gone.
    const late = await this.changedSince(ticket);
    if (late) return this.skip(n, late);
    // S4: no claim, and so no agent, until both sandboxes have proved themselves on this machine.
    const sandbox = await sandboxSelfTest({
      exec: (cmd, args, opts) => this.sh(cmd, args, opts), claude: cfg.claude, paths: this.sandbox, agentBaseEnv: this.env, tmpRoot: tmpdir(),
    });
    this.log.event('sandbox-selftest', { ...sandbox });
    const later = await this.changedSince(ticket);
    if (later) return this.skip(n, later);
    if (!sandbox.ok) return this.handBack(`sandbox self-test failed: ${sandbox.failures.join('; ')}`);

    this.startRunLog();
    try {
      await this.claim();
      await this.work();
      return await this.finish();
    } catch (e) {
      const reason = e instanceof Stop ? e.message
        : e instanceof GuardError ? `guardrail: ${e.message}` : `runner error: ${e instanceof Error ? e.message : String(e)}`;
      return this.needsHelp(reason);
    }
  }

  // ----- decisions before the claim -----

  /** Who last applied `ready-for-agent`, from the issue's events (R12). A preview assumes the owner. */
  private async labeler(n: number): Promise<string | null> {
    if (this.cfg.previewIssue !== null) return this.cfg.owner;
    const out = await this.ghOk(['api', '--paginate', `repos/${this.cfg.slug}/issues/${n}/events`, '--jq',
      `.[] | select(.event == "labeled" and .label.name == "${LABELS.ready}") | .actor.login`], `read #${n} events`);
    return out.trim().split('\n').filter(Boolean).at(-1) ?? null;
  }

  private async viewIssue(n: number): Promise<IssueView> {
    return this.json<IssueView>(await this.ghOk(['issue', 'view', String(n), '--repo', this.cfg.slug, '--json',
      'number,title,body,author,url,state,labels'], `read #${n}`), `#${n}`);
  }

  /** Why the ticket may no longer be claimed (revoked, or edited since `ticket` was read), or null. */
  private async changedSince(ticket: Ticket): Promise<string | null> {
    const again = await this.viewIssue(ticket.number);
    return revoked(again) ?? (ticketHash(again.title, again.body ?? '') !== ticketHash(ticket.title, ticket.body)
      ? `#${ticket.number} changed while it was being checked` : null);
  }

  private skip(n: number, reason: string): Outcome {
    this.log.event('end', { state: 'skipped', reason });
    return { state: 'skipped', issue: n, reason };
  }

  /** A dry run's answer: what it would do, with nothing done (task AC4). */
  private preview(n: number, decision: string, actions: string[]): Outcome {
    for (const action of actions) this.log.event('would', { action });
    this.log.event('end', { state: 'dry-run', decision });
    return { state: 'dry-run', issue: n, decision };
  }

  /**
   * A tick that refuses or claims a ticket gets its own run log, starting with this tick's events
   * so far. Idle, busy and pre-flight-failed ticks stay in ticks.jsonl only.
   */
  private startRunLog(): void {
    const file = join(this.runDir, 'log.jsonl');
    this.log.event('run', { issue: this.ticket!.number, log: file });
    this.log = this.log.to(file);
  }

  private async refuse(why: string): Promise<Outcome> {
    const n = this.ticket!.number;
    const reason = `refused: ${why}`;
    if (this.cfg.dryRun) return this.preview(n, reason, [`label #${n} ${LABELS.help} (was ${LABELS.ready}) and comment why`]);
    this.startRunLog();
    this.log.event('decision', { refuse: reason });
    await this.relabel(LABELS.ready, LABELS.help);
    await this.post('issue', String(n), `The agent runner refused this ticket: ${why}. No agent was started.\n\n` +
      'The runner only works on issues the repo owner both opened and labelled, with an `## Acceptance criteria` section. ' +
      `Fix that and re-apply \`${LABELS.ready}\` to retry.`);
    this.log.event('end', { state: 'refused', reason });
    return { state: 'refused', issue: n, reason };
  }

  /** S4: the sandbox didn't prove itself, so the ticket goes back to the human unclaimed, with the reason. */
  private async handBack(reason: string): Promise<Outcome> {
    const n = this.ticket!.number;
    this.startRunLog();
    this.log.event('stop', { reason });
    await this.relabel(LABELS.ready, LABELS.help);
    await this.post('issue', String(n), `The agent runner stopped before claiming this ticket: ${reason}. No agent was started, ` +
      'and the runner never runs one unsandboxed. Its log is in `.git/factory/runs/`. ' +
      `Fix the sandbox on the runner's machine and re-apply \`${LABELS.ready}\` to retry.`);
    this.log.event('end', { state: 'needs-help', reason });
    return { state: 'needs-help', issue: n, reason };
  }

  /** Credentials and tools, checked before anything is claimed (R13). Never logs a credential value. */
  private async preflight(): Promise<Check[]> {
    const { cfg } = this;
    const [hours, claude, user, qodo, npm] = await Promise.all([
      midwayHoursLeft(cfg.midwayCookie, this.deps.clock.now()),
      isExecutable(cfg.claude),
      this.gh(['api', 'user', '--jq', '.login']),
      this.qodo(['read', 'whoami', '--json']),
      this.sh('npm', ['--version'], { timeoutMs: cfg.timeouts.gh }),
    ]);
    const login = user.code === 0 ? user.stdout.trim() : '';
    const checks: Check[] = [
      { name: 'midway', ok: hours !== null && hours >= cfg.minCredHours, detail: hours === null ? 'no Midway session cookie' : `${hours.toFixed(1)} h left (need ${cfg.minCredHours})` },
      { name: 'claude', ok: claude, detail: cfg.claude },
      { name: 'gh', ok: login === cfg.owner, detail: login ? `logged in as @${login}` : 'not logged in' },
      { name: 'qodo', ok: qodo.code === 0, detail: qodo.code === 0 ? 'logged in' : qodo.timedOut ? 'timed out' : `exit ${qodo.code}` },
      { name: 'npm', ok: npm.code === 0, detail: npm.code === 0 ? npm.stdout.trim() : 'not found' },
    ];
    this.log.event('preflight', { checks });
    return checks;
  }

  private async claim(): Promise<void> {
    const t = this.ticket!;
    await this.relabel(LABELS.ready, LABELS.working);
    this.snapshot = ticketHash(t.title, t.body);
    this.writeRunFile('ticket.md', ticketMarkdown(t), false);
    await this.post('issue', String(t.number), `Claimed by the agent runner (run \`${this.runId}\`). The agent works from a snapshot ` +
      `of this issue taken now; editing the issue stops the run. The PR will target \`${this.cfg.base}\`.`);
    this.log.event('claim', { issue: t.number, snapshot: this.snapshot.slice(0, 12) });
  }

  // ----- the claimed run -----

  private async work(): Promise<void> {
    const { cfg } = this;
    const t = this.ticket!;
    const ghDir = join(this.runDir, 'gh-empty');
    mkdirSync(ghDir, { recursive: true });
    this.agentEnv = agentEnv(this.env, ghDir);
    await this.git(cfg.repoDir, ['fetch', 'origin', cfg.base]);
    this.baseSha = (await this.git(cfg.repoDir, ['rev-parse', `origin/${cfg.base}^{commit}`])).trim();
    if (!/^[0-9a-f]{40}$/.test(this.baseSha)) throw new Stop(`could not read the fetched origin/${cfg.base}`);
    await this.chooseBranch(t);
    await this.git(cfg.repoDir, ['worktree', 'add', '--no-track', '-b', this.branch, this.worktree, this.baseSha]);
    this.gitDir = (await this.git(this.worktree, ['rev-parse', '--absolute-git-dir'])).trim();
    this.log.event('worktree', { branch: this.branch, path: this.worktree });
    // S5: with the network open no repo code runs (no lifecycle scripts); the install scripts then run offline.
    for (const [what, args, mode] of [['npm ci', ['ci', '--ignore-scripts'], 'install'], ['npm rebuild', ['rebuild'], 'check']] as const) {
      const res = await this.npm([...args], cfg.timeouts.npmCi, mode);
      if (res.code !== 0) throw new Stop(`${what} failed in the worktree${res.timedOut ? ' (timed out)' : ''}: ${firstLine(tail(res.stderr, 5))}`);
    }

    const call = await this.agent(implementPrompt(t, this.criteria), cfg.maxTurns, cfg.maxBudgetUsd, cfg.timeouts.agent);
    const impl = implementResult(call.block, this.criteria.length);
    await this.verifyAndPush();
    await this.openPr(impl);
    await this.reviewLoop();
  }

  /** `agent/<N>-<slug>`, or `-2`, `-3`… if an earlier run left that name locally, on origin or on disk. */
  private async chooseBranch(t: Ticket): Promise<void> {
    const stem = branchStem(t);
    const remote = new Set((await this.git(this.cfg.repoDir, ['ls-remote', '--heads', 'origin', `refs/heads/${stem}*`]))
      .split('\n').map((l) => l.split('\t')[1]).filter(Boolean));
    for (let k = 1; k <= 9; k++) {
      const branch = k === 1 ? stem : `${stem}-${k}`;
      const dir = join(this.cfg.repoDir, '.sandboxes', `agent-${t.number}${k === 1 ? '' : `-${k}`}`);
      if (existsSync(dir) || remote.has(`refs/heads/${branch}`)) continue;
      if ((await this.gitTry(this.cfg.repoDir, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])).code === 0) continue;
      this.branch = branch;
      this.worktree = dir;
      return;
    }
    throw new Stop(`branches ${stem} through -9 already exist`);
  }

  /** Runs the agent; any failure stops the run, naming expired credentials when that's the cause (R7). */
  private async agent(prompt: string, maxTurns: number, budget: number, timeoutMs: number): Promise<AgentCall & { ok: true }> {
    const { cfg } = this;
    const k = ++this.agentCalls;
    const resume = this.sessionId || undefined;
    this.log.event('agent-start', { call: k, resume: resume ?? null, maxTurns, budgetUsd: budget });
    const args = claudeArgs({
      prompt, systemPrompt: systemPrompt(this.branch, cfg.base), maxTurns, maxBudgetUsd: budget, ...(resume ? { resume } : {}),
      settings: JSON.stringify(claudeSettings(this.sandbox, { worktree: this.worktree })),
    });
    const t0 = this.deps.clock.now();
    const res = await this.sh(cfg.claude, args, { cwd: this.worktree, timeoutMs, env: this.agentEnv });
    const call = readClaude(res, { timeoutMs, wallMs: this.deps.clock.now() - t0 });
    if (call.out) {
      this.turns += call.out.num_turns ?? 0;
      this.costUsd += call.out.total_cost_usd ?? 0;
      if (call.out.session_id) this.sessionId = call.out.session_id;
    }
    const record = agentRecord(res, call);
    this.writeRunFile(`agent-${k}.json`, JSON.stringify({ ...record, block: call.ok ? call.block : null }, null, 2), false);
    this.log.event('agent-end', { call: k, ...record });
    if (call.ok) return call;
    const hours = await midwayHoursLeft(cfg.midwayCookie, this.deps.clock.now());
    throw new Stop(hours === null || hours <= 0 ? `Midway credentials expired (${call.reason})` : call.reason);
  }

  /** The runner's own checks on the agent's commits until they pass; failures go back as fix rounds. */
  private async verifyAndPush(): Promise<void> {
    for (;;) {
      const verified = await this.verify();
      if (typeof verified !== 'string') {
        await this.fixRound({ findings: [], ciFailures: [], localFailures: verified });
        continue;
      }
      await this.assertNotEdited();
      // The exact commit verified, from the main checkout: no git config the agent can reach applies.
      await this.git(this.cfg.repoDir, ['push', 'origin', `${verified}:refs/heads/${this.branch}`]);
      this.head = verified;
      this.log.event('push', { branch: this.branch, head: verified });
      return;
    }
  }

  /** The verified HEAD, or the problems to send back to the agent. */
  private async verify(): Promise<string | { check: string; output: string }[]> {
    const { cfg } = this;
    const ahead = Number((await this.git(this.worktree, ['rev-list', '--count', `${this.baseSha}..HEAD`])).trim());
    if (!ahead) throw new Stop('the agent made no commits');
    if (this.head && (await this.gitTry(this.worktree, ['merge-base', '--is-ancestor', this.head, 'HEAD'])).code !== 0) {
      throw new Stop(`the agent rewrote pushed history (${shortSha(this.head)} is no longer an ancestor of HEAD)`);
    }
    const changed = (await this.git(this.worktree, ['diff', '--name-only', `${this.baseSha}...HEAD`])).split('\n').filter(Boolean);
    const touched = changed.filter((f) => PROTECTED.some((re) => re.test(f)));
    if (touched.length) throw new Stop(`the agent changed protected paths: ${touched.join(', ')}`);
    // Never into a nested repo the agent planted: git would run under that repo's config.
    const dirty = (await this.git(this.worktree, ['status', '--porcelain', '--ignore-submodules=all'])).trim();
    if (dirty) return [{ check: 'git status', output: `Uncommitted changes:\n${dirty}` }];
    this.checks = [];
    for (const [name, args] of CHECKS) {
      const res = await this.npm(args, cfg.timeouts.check);
      this.checks.push({ check: name, ok: res.code === 0 });
      if (res.code !== 0) return [{ check: name, output: res.timedOut ? `timed out after ${cfg.timeouts.check / 60_000} min` : tail(res.stdout + '\n' + res.stderr) }];
    }
    const sha = await this.revHead();
    this.log.event('verified', { head: sha, commits: ahead, checks: this.checks });
    return sha;
  }

  /** One fix round (R7: at most `maxFixRounds`; a would-be extra round stops the run). */
  private async fixRound(input: Omit<FixInput, 'round' | 'maxRounds' | 'head'>): Promise<{ notes: string; dispositions: Disposition[] }> {
    const { cfg } = this;
    if (this.fixRounds >= cfg.maxFixRounds) {
      const what = [
        input.findings.length ? `${input.findings.length} blocking finding(s)` : '',
        input.ciFailures.length ? `CI failing (${input.ciFailures.map((c) => c.run.name).join(', ')})` : '',
        input.localFailures.length ? `the runner's ${input.localFailures.map((c) => c.check).join(', ')} failing` : '',
      ].filter(Boolean).join(', ');
      throw new Stop(`retry limit: ${cfg.maxFixRounds} fix rounds used and ${what} remain`);
    }
    const round = ++this.fixRounds;
    const head = await this.revHead();
    this.log.event('fix-round', { round, head, findings: input.findings.map((f) => f.id), ci: input.ciFailures.map((c) => c.run.name), local: input.localFailures.map((c) => c.check) });
    const call = await this.agent(fixPrompt({ ...input, round, maxRounds: cfg.maxFixRounds, head }), cfg.fixMaxTurns, cfg.fixMaxBudgetUsd, cfg.timeouts.fix);
    const res = fixResult(call.block, input.findings);
    this.dispositions.push(...res.dispositions.map((d) => ({ ...d, round })));
    this.log.event('fix-round-end', { round, dispositions: res.dispositions });
    return res;
  }

  private async openPr(impl: ImplementResult): Promise<void> {
    const { cfg } = this;
    const t = this.ticket!;
    const subject = firstLine(await this.git(this.worktree, ['log', '--reverse', '--format=%s', `${this.baseSha}..HEAD`]));
    const title = impl.prTitle ?? (isPrTitle(subject) ? subject : `chore(agent): resolve #${t.number}`);
    const body = prBody({
      ticket: t, base: cfg.base, branch: this.branch, head: this.head!, summary: impl.summary, criteria: this.criteria,
      evidence: impl.criteria, checks: this.checks, sessionId: this.sessionId, turns: this.turns, costUsd: this.costUsd,
    });
    const file = this.writeRunFile('pr-body.md', body);
    const out = await this.ghOk(['pr', 'create', '--repo', cfg.slug, '--base', cfg.base, '--head', this.branch, '--title', title, '--body-file', file], 'open the PR');
    const url = /https:\/\/github\.com\/\S+\/pull\/(\d+)/.exec(out);
    if (!url) throw new Stop('gh pr create printed no PR URL');
    this.pr = { url: url[0], number: Number(url[1]) };
    this.log.event('pr', { url: this.pr.url, base: cfg.base, title });
  }

  /** Review → fix → push until clean, a stop, or the retry limit (R6, R7). */
  private async reviewLoop(): Promise<void> {
    for (;;) {
      const r = await this.waitForReview();
      this.reviewRounds++;
      this.lastReview = r;
      const rejected = new Set(this.dispositions.filter((d) => d.verdict === 'rejected').map((d) => d.id));
      const blocking = r.findings.filter(isBlocking);
      const fresh = blocking.filter((f) => !rejected.has(f.id));
      this.log.event('review', { round: this.reviewRounds, head: this.head, ciFailed: r.failed.map((c) => c.name), blocking: blocking.map((f) => f.id), fresh: fresh.map((f) => f.id) });
      if (!r.failed.length && !fresh.length) {
        if (blocking.length) throw needsHuman(blocking.length);
        return;
      }
      const ciFailures = await Promise.all(r.failed.map(async (run) => ({ run, log: await this.failedLog(run) })));
      const before = this.head!;
      const res = await this.fixRound({ findings: fresh, ciFailures, localFailures: [] });
      const moved = (await this.revHead()) !== before;
      if (moved) await this.verifyAndPush();
      await this.post('pr', this.pr!.url, dispositionsComment({
        round: this.fixRounds, maxRounds: this.cfg.maxFixRounds, before, after: this.head!,
        findings: fresh, dispositions: res.dispositions, ciFailures: r.failed, notes: res.notes,
      }));
      if (moved) continue;
      if (r.failed.length || res.dispositions.some((d) => d.verdict !== 'rejected')) {
        throw new Stop('the fix round made no commits, but CI failures or open findings remain');
      }
      throw needsHuman(blocking.length);
    }
  }

  /**
   * Polls until CI and Qodo have both finished on the exact head, within one deadline. A skipped
   * review stops at once; a timeout is "review incomplete", never clean (AGENTS.md).
   */
  private async waitForReview(): Promise<Review> {
    const { cfg, deps } = this;
    const head = this.head!;
    const pr = this.pr!;
    const deadline = deps.clock.now() + cfg.reviewTimeoutMs;
    let prevIds: string[] | null = null;
    let firstSeen: number | null = null;
    let marker: string | null = null;
    let ci: CiState = { kind: 'pending', why: 'not polled' };
    let qs: QodoState = { kind: 'pending', why: 'not polled' };
    // The PR must be confirmed open on the head in the same poll that finds the review done.
    let prOk = false;
    for (let poll = 1; deps.clock.now() + cfg.pollMs <= deadline; poll++) {
      // Nothing can have finished the moment after a push, so each poll waits first.
      await deps.clock.sleep(cfg.pollMs);
      const [issue, view, runs, qres] = await Promise.all([
        this.readTicket(),
        this.gh(['pr', 'view', pr.url, '--json', 'headRefOid,state']),
        this.gh(['api', '--paginate', '--slurp', `repos/${cfg.slug}/commits/${head}/check-runs?per_page=100`]),
        this.qodo(['read', 'pr-review-session', 'findings', '--pr-url', pr.url, '--extended', '--json']),
      ]);
      this.assertSnapshot(issue);
      prOk = view.code === 0;
      if (prOk) {
        const v = this.json<{ headRefOid: string; state: string }>(view.stdout, 'gh pr view');
        if (v.headRefOid !== head) throw new Stop(`the PR head moved to ${shortSha(v.headRefOid)}; someone else pushed`);
        if (v.state !== 'OPEN') throw new Stop(`the PR is ${v.state.toLowerCase()}`);
      }
      ci = runs.code === 0 ? ciState(runs.stdout) : { kind: 'pending', why: 'check runs unavailable' };
      const q = qres.code === 0 ? parseQodo(qres.stdout) : null;
      const onHead = q?.runs.filter((r) => r.commit_sha === head) ?? [];
      if (firstSeen === null && onHead.length) firstSeen = deps.clock.now();
      // The marker only matters once Qodo has a finished run on the head, and can't move off it after.
      if (marker !== head && onHead.some((r) => r.status === 'completed')) {
        const comments = await this.gh(['api', '--paginate', `repos/${cfg.slug}/issues/${pr.number}/comments`, '--jq', `.[] | select(.user.login == "${QODO_BOT}") | .body`]);
        if (comments.code === 0) marker = qodoMarker(comments.stdout, cfg.slug);
      }
      qs = qodoState(q, head, marker, prevIds, deps.clock.now(), firstSeen ?? deps.clock.now(), cfg.settleMs);
      prevIds = qs.kind === 'pending' && qs.ids ? qs.ids : null;
      this.log.event('poll', {
        poll, head, ci: ci.kind === 'complete' ? ci.runs.map((r) => `${r.name}:${r.conclusion}`) : ci.why,
        review_runs: q?.runs ?? null, marker, qodo: qs.kind, why: qs.kind === 'pending' ? qs.why : null,
        findings: q?.findings.length ?? null, qodoExit: qres.code,
      });
      if (qs.kind === 'skipped') throw new Stop(`review skipped: Qodo's run on ${shortSha(head)} has review_effort=skip, which is not a clean review`);
      // A poll admitted before the deadline can return after it (Qodo PR #93 ff427862): that's a timeout, not a review.
      if (deps.clock.now() > deadline) break;
      if (prOk && ci.kind === 'complete' && qs.kind === 'complete') return { ci: ci.runs, failed: ci.failed, run: qs.run, findings: qs.findings };
    }
    const ciWhy = ci.kind === 'pending' ? ci.why : `done, ${ci.failed.length} failed`;
    const qWhy = qs.kind === 'pending' ? qs.why : qs.kind;
    throw new Stop(`review incomplete: no finished CI + Qodo review of ${shortSha(head)} within ${cfg.reviewTimeoutMs / 60_000} min ` +
      `(CI: ${ciWhy}; Qodo: ${qWhy}; PR: ${prOk ? 'open on head' : 'state unavailable'})`);
  }

  private async failedLog(run: CheckRun): Promise<string> {
    const res = await this.gh(['run', 'view', '--repo', this.cfg.slug, '--job', String(run.id), '--log-failed']);
    return res.code === 0 ? tail(res.stdout, 150) : `(log unavailable: gh exit ${res.code})`;
  }

  private readTicket(): Promise<ExecResult> {
    return this.gh(['issue', 'view', String(this.ticket!.number), '--repo', this.cfg.slug, '--json', 'title,body']);
  }

  /** R12: the issue's title and body must still match the claim-time snapshot. */
  private assertSnapshot(res: ExecResult): void {
    const n = this.ticket!.number;
    if (res.code !== 0) throw new Stop(`could not re-read #${n} to check it wasn't edited`);
    const now = this.json<{ title: string; body?: string }>(res.stdout, `#${n}`);
    if (ticketHash(now.title, now.body ?? '') !== this.snapshot) {
      throw new Stop('the issue was edited during the run (the agent works only from the claim-time snapshot)');
    }
  }

  private async assertNotEdited(): Promise<void> {
    this.assertSnapshot(await this.readTicket());
  }

  // ----- end states -----

  private stats() {
    return {
      pr: this.pr?.url ?? null, head: this.head, fixRounds: this.fixRounds, reviewRounds: this.reviewRounds,
      agentCalls: this.agentCalls, turns: this.turns, costUsd: this.costUsd, sessionId: this.sessionId,
    };
  }

  private summary(state: 'done' | 'needs-help', reason: string | null): string {
    return summaryComment({
      state, reason, runId: this.runId, logPath: join(this.runDir, 'log.jsonl'), checks: this.checks, ci: this.lastReview?.ci ?? null,
      lastRun: this.lastReview?.run ?? null, maxFixRounds: this.cfg.maxFixRounds, findings: this.lastReview?.findings ?? [],
      dispositions: this.dispositions, ...this.stats(),
    });
  }

  /**
   * Posts the summary (R9), then swaps `agent-working` for `agent-done`. The label goes last: if
   * the comment fails, the ticket still carries agent-working, which needs-help then replaces.
   */
  private async finish(): Promise<Outcome> {
    await this.assertNotEdited();
    await this.post('issue', String(this.ticket!.number), this.summary('done', null));
    await this.relabel(LABELS.working, LABELS.done);
    this.log.event('end', { state: 'done', reason: null, ...this.stats() });
    return { state: 'done', issue: this.ticket!.number, pr: this.pr!.url };
  }

  /** The last resort: each step runs even if the one before failed. */
  private async needsHelp(reason: string): Promise<Outcome> {
    this.log.event('stop', { reason });
    const steps = [
      () => this.post('issue', String(this.ticket!.number), this.summary('needs-help', reason)),
      () => this.relabel(LABELS.working, LABELS.help),
    ];
    for (const step of steps) {
      try {
        await step();
      } catch (e) {
        this.log.event('end-report-failed', { error: e instanceof Error ? e.message : String(e) });
      }
    }
    this.log.event('end', { state: 'needs-help', reason, ...this.stats() });
    return { state: 'needs-help', issue: this.ticket!.number, reason };
  }

  private error(e: unknown): Outcome {
    const reason = e instanceof Error ? e.message : String(e);
    this.log.event('end', { state: 'error', reason });
    return { state: 'error', reason };
  }

  // ----- commands -----

  private sh(cmd: string, args: readonly string[], opts: { cwd?: string; timeoutMs: number; env?: NodeJS.ProcessEnv }): Promise<ExecResult> {
    return this.shell.sh(cmd, args, opts);
  }

  private gh(args: string[]): Promise<ExecResult> {
    return this.shell.gh(args);
  }

  private async ghOk(args: string[], what: string): Promise<string> {
    const res = await this.gh(args);
    if (res.code !== 0) throw new Stop(`${what} failed (gh exit ${res.code}${res.timedOut ? ', timed out' : ''}): ${firstLine(res.stderr)}`);
    return res.stdout;
  }

  private qodo(args: string[]): Promise<ExecResult> {
    return this.shell.qodo(args);
  }

  /** npm in the worktree runs agent-written code, so it gets the agent's environment and limits (S5). */
  private npm(args: string[], timeoutMs: number, mode: 'install' | 'check' = 'check'): Promise<ExecResult> {
    const profile = seatbeltProfile(this.sandbox, { worktree: this.worktree, mode });
    return this.sh(SANDBOX_EXEC, seatbelt(profile, 'npm', args), { cwd: this.worktree, timeoutMs, env: this.agentEnv });
  }

  /**
   * git with the human's gh login as the only credential helper (Research: not the keychain). In
   * the agent's worktree it runs sandboxed, credential-free and pinned instead (`worktreeGit`).
   */
  private gitTry(cwd: string, args: string[]): Promise<ExecResult> {
    const timeoutMs = this.cfg.timeouts.git;
    if (cwd === this.worktree) {
      const g = worktreeGit(this.sandbox, { gitDir: this.gitDir, worktree: this.worktree }, args, this.agentEnv);
      return this.sh(g.cmd, g.args, { cwd, timeoutMs, env: g.env });
    }
    return this.sh('git', args, {
      cwd, timeoutMs,
      env: { ...this.env, GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'credential.helper', GIT_CONFIG_VALUE_0: '',
        GIT_CONFIG_KEY_1: 'credential.helper', GIT_CONFIG_VALUE_1: `!${this.cfg.gh} auth git-credential` },
    });
  }

  private async git(cwd: string, args: string[]): Promise<string> {
    const res = await this.gitTry(cwd, args);
    if (res.code !== 0) throw new Stop(`git ${args[0]} failed${res.timedOut ? ' (timed out)' : ''}: ${firstLine(res.stderr)}`);
    return res.stdout;
  }

  private async revHead(): Promise<string> {
    return (await this.git(this.worktree, ['rev-parse', 'HEAD'])).trim();
  }

  private async relabel(from: string, to: string, issue = this.ticket!.number): Promise<void> {
    const n = String(issue);
    await this.ghOk(['issue', 'edit', n, '--repo', this.cfg.slug, '--remove-label', from, '--add-label', to], `relabel #${n} ${from} → ${to}`);
  }

  private async post(kind: 'issue' | 'pr', target: string, body: string, dir = this.runDir): Promise<void> {
    const file = this.writeRunFile(`${kind}-comment-${target.split('/').at(-1)}.md`, body, true, dir);
    await this.ghOk([kind, 'comment', target, ...(kind === 'issue' ? ['--repo', this.cfg.slug] : []), '--body-file', file], `comment on ${kind} ${target}`);
  }

  private json<T>(text: string, what: string): T {
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Stop(`${what}: gh printed unreadable JSON`);
    }
  }

  /** The only writer into the run directory (or the sweep's); everything it writes is redacted. */
  private writeRunFile(name: string, text: string, numbered = true, dir = this.runDir): string {
    mkdirSync(dir, { recursive: true });
    const file = join(dir, numbered ? `${String(++this.files).padStart(2, '0')}-${name}` : name);
    writeFileSync(file, redact(text, machinePaths(this.cfg)));
    return file;
  }
}
