// The findings sweep (docs/features/repeat-findings.md R1–R10): read the Qodo findings on every
// PR the repo owner opened and every local review export, keep them in a ledger under
// `.git/factory/findings/`, have the judge group them by mistake, and open one `rule-proposal`
// issue when a mistake repeats across tickets, or comment on it when it repeats again.
// Fails closed throughout: an incomplete read is retried, an unusable judge answer decides nothing.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { findingsDir, LABELS, machinePaths, type Config } from './config.js';
import type { Exec, ExecResult } from './exec.js';
import { guarded } from './guard.js';
import {
  draftCall, findingText, groupCall, judgeArgs, parseDraft, parseGroupAnswer, readJudge, ruleQuery, type CatalogueGroup, type JudgeCall,
} from './judge.js';
import {
  classifyPrRead, emptyLedger, groupId, groupStates, ingest, isHistory, MAX_ATTEMPTS, membersByGroup, namedLikeExport, parseLedger, parseLocalExport,
  prReviewedAt, prTickets, sources, THRESHOLD, unjudged, unsettled, type GroupState, type Ledger, type LedgerFinding, type LedgerPr, type Sources,
} from './ledger.js';
import { iso, redact, RunLog, stamp, type Clock } from './log.js';
import { isExecutable, midwayHoursLeft } from './preflight.js';
import {
  postedIds, proposalBody, proposalComment, proposalMarker, proposalTitle, scrubLocalPaths, type ProposalFinding, type QodoRule,
} from './proposal.js';
import { firstJson } from './review.js';
import { Shell } from './shell.js';

export interface SweepDeps {
  exec: Exec;
  clock: Clock;
  env: NodeJS.ProcessEnv;
  print: (line: string) => void;
}

export interface SweepOptions {
  /** Findings reviewed up to this PR's latest review are history; later ones are new (R9). */
  seedThrough: number | null;
}

export interface GroupReport {
  group: string;
  mistake: string;
  findings: number;
  sources: string[];
  issue: number | null;
}

export interface SweepSummary {
  state: 'ok' | 'error';
  reason: string | null;
  /** A seeding sweep records history and opens nothing (R9). */
  seeding: boolean;
  prsRead: number;
  prsFailed: number[];
  exports: number;
  exportsPartial: string[];
  newFindings: number;
  judged: number;
  calls: number;
  costUsd: number;
  /** The LLM cap stopped work this sweep; the rest waits for the next (R10). */
  capped: boolean;
  waiting: number;
  unjudgeable: number;
  /** Groups at the threshold (R5), proposed or not. */
  meeting: GroupReport[];
  proposed: number[];
  commented: number[];
  /** Dry run: the issues and comments it would post. */
  would: string[];
}

export const ledgerFile = (cfg: Config) => join(findingsDir(cfg), 'ledger.json');
export const sweepsLog = (cfg: Config) => join(findingsDir(cfg), 'sweeps.jsonl');

const emptySummary = (): SweepSummary => ({
  state: 'ok', reason: null, seeding: false, prsRead: 0, prsFailed: [], exports: 0, exportsPartial: [], newFindings: 0,
  judged: 0, calls: 0, costUsd: 0, capped: false, waiting: 0, unjudgeable: 0, meeting: [], proposed: [], commented: [], would: [],
});

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * One findings sweep, writing nothing when `cfg.dryRun` and making at most `cfg.sweepMaxCalls`
 * LLM calls. Every gh and git command passes the runtime guardrails (R7). Never throws: any
 * failure is the summary's `error` state.
 */
export async function runSweep(cfg: Config, deps: SweepDeps, opts: SweepOptions): Promise<SweepSummary> {
  try {
    return await new Sweep(cfg, { ...deps, exec: guarded(deps.exec) }, opts).run();
  } catch (e) {
    const s = { ...emptySummary(), state: 'error' as const, reason: redact(message(e), machinePaths(cfg)) };
    deps.print(`findings sweep failed: ${s.reason}\n`);
    return s;
  }
}

/** Ends the sweep with state `error`. */
class SweepStop extends Error {}

interface OwnerPr {
  number: number;
  url: string;
  title: string;
  body?: string;
  headRefName: string;
  headRefOid: string;
  state: string;
  updatedAt: string;
  author?: { login?: string };
}

const MAX_EXPORT_BYTES = 5 * 1024 * 1024;

class Sweep {
  private log: RunLog;
  private shell: Shell;
  private ledger: Ledger = emptyLedger('');
  /** The ledger as loaded or last saved, so an unchanged one isn't rewritten. */
  private saved = '';
  private fresh = false;
  private deadline: number;
  private files = 0;
  private llm: string | null | undefined;
  private owner: boolean | undefined;
  private proposals: { number: number; body: string; state: string }[] | null | undefined;
  private s = emptySummary();

  constructor(private cfg: Config, private deps: SweepDeps, private opts: SweepOptions) {
    this.log = new RunLog(cfg.dryRun ? null : sweepsLog(cfg), deps.clock, deps.print, machinePaths(cfg));
    this.shell = new Shell(cfg, deps.exec, deps.clock, () => this.log, deps.env);
    this.deadline = deps.clock.now() + cfg.sweepBudgetMs;
  }

  async run(): Promise<SweepSummary> {
    this.log.event('findings-sweep', { dryRun: this.cfg.dryRun, seedThrough: this.opts.seedThrough, maxCalls: this.cfg.sweepMaxCalls });
    let loaded = false;
    try {
      this.load();
      loaded = true;
      this.s.seeding = this.fresh || this.opts.seedThrough !== null;
      await this.readPrs();
      this.readExports();
      this.seed();
      await this.judge();
      if (!this.s.seeding) await this.propose();
    } catch (e) {
      this.fail(e);
    }
    // Whatever was read completely, judged or posted before a stop is kept.
    try {
      if (loaded) this.save();
    } catch (e) {
      this.fail(e);
    }
    return this.end();
  }

  private fail(e: unknown): void {
    if (this.s.state === 'error') return;
    this.s.state = 'error';
    this.s.reason = redact(message(e), machinePaths(this.cfg));
  }

  // ----- ledger -----

  private load(): void {
    const file = ledgerFile(this.cfg);
    if (!existsSync(file)) {
      this.fresh = true;
      this.ledger = emptyLedger(iso(this.deps.clock.now()));
      this.log.event('findings-seeding', { cutoff: this.ledger.seedCutoff, why: 'no ledger yet: everything reviewed until now is history, and nothing is proposed' });
      return;
    }
    const damaged = (why: string) => new SweepStop(`the findings ledger is damaged (${why}); it is never reset: move ${file} aside to reseed`);
    if (lstatSync(file).isSymbolicLink()) throw damaged('a symlink');
    this.saved = readFileSync(file, 'utf8');
    const l = parseLedger(this.saved);
    if (!l) throw damaged('unreadable');
    this.ledger = l;
  }

  private save(): void {
    if (this.cfg.dryRun) return;
    const text = JSON.stringify(this.ledger, null, 1) + '\n';
    if (text === this.saved) return;
    const file = ledgerFile(this.cfg);
    mkdirSync(findingsDir(this.cfg), { recursive: true });
    writeFileSync(`${file}.tmp`, text, { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
    this.saved = text;
  }

  // ----- reading (R1, R2, R4) -----

  /** Every owner PR that is open, never fully read, or changed since its last full read. */
  private async readPrs(): Promise<void> {
    const { cfg } = this;
    const res = await this.shell.gh(['pr', 'list', '--repo', cfg.slug, '--author', cfg.owner, '--state', 'all', '--limit', String(cfg.prListLimit),
      '--json', 'number,url,title,body,headRefName,headRefOid,state,updatedAt,author']);
    if (res.code !== 0) throw new SweepStop(`listing the owner's PRs failed (gh exit ${res.code}${res.timedOut ? ', timed out' : ''})`);
    let list: OwnerPr[];
    try {
      list = JSON.parse(res.stdout) as OwnerPr[];
    } catch {
      throw new SweepStop('gh pr list printed unreadable JSON');
    }
    if (list.length >= cfg.prListLimit) this.log.event('findings-pr-list-full', { limit: cfg.prListLimit, why: 'older PRs may be left out' });
    // R1: the search already filters by author; this is the trust boundary, so check it again.
    const mine = list.filter((p) => p.author?.login === cfg.owner).sort((a, b) => a.number - b.number);
    if (mine.length !== list.length) this.log.event('findings-ignored', { prs: list.filter((p) => !mine.includes(p)).map((p) => p.number), why: 'not opened by the owner' });
    for (const pr of mine) {
      const known = this.ledger.prs[pr.number];
      if (known && known.readAt === pr.updatedAt && pr.state !== 'OPEN') continue;
      if (this.late('PR reads')) return;
      const read = classifyPrRead(await this.shell.qodo(['read', 'pr-review-session', 'findings', '--pr-url', pr.url, '--extended', '--json']), pr.headRefOid);
      const rec: LedgerPr = { readAt: null, lastReviewAt: null, ...known, number: pr.number, head: pr.headRefName, tickets: prTickets(pr) };
      this.ledger.prs[pr.number] = rec;
      if (read.kind === 'failed') {
        // R4: nothing from this read is kept, and the PR stays unread until a later sweep reads it whole.
        this.s.prsFailed.push(pr.number);
        this.log.event('findings-read-failed', { pr: pr.number, why: read.why, retry: 'next sweep' });
        continue;
      }
      const added = ingest(this.ledger, `pr:${pr.number}`, read.findings, prReviewedAt(read.runs, rec.lastReadAt));
      rec.lastReadAt = iso(this.deps.clock.now());
      this.s.prsRead++;
      this.s.newFindings += added.length;
      rec.lastReviewAt = read.lastReviewAt ?? rec.lastReviewAt;
      // R4: read again until a real review covers the head and its findings hold still: findings
      // land after a run completes, and neither they nor a later round need change updatedAt.
      const waiting = unsettled(read, rec.settleKey, this.deps.clock.now(), cfg.settleMs);
      rec.settleKey = read.settleKey;
      if (!waiting) rec.readAt = pr.updatedAt;
      this.log.event('findings-read', { pr: pr.number, findings: read.findings.length, new: added.length, ...(waiting ? { unfinished: waiting, retry: 'next sweep' } : {}) });
    }
  }

  /** Local `qodo review --json` exports under the evidence folder (R1), skipping unchanged complete ones. */
  private readExports(): void {
    const root = this.cfg.evidenceDir;
    if (!existsSync(root) || lstatSync(root).isSymbolicLink()) return;
    for (const { path, size, mtimeMs } of walk(root, 2)) {
      if (this.late('local exports')) break;
      const rel = relative(root, path).split(sep).join('/');
      const known = this.ledger.files[rel];
      if (known?.done && known.size === size && known.mtimeMs === mtimeMs) continue;
      const exp = size > MAX_EXPORT_BYTES ? { kind: 'partial' as const, why: 'over 5 MiB' } : parseLocalExport(readFileSync(path, 'utf8'), namedLikeExport(rel));
      if (exp.kind === 'other') continue;
      this.ledger.files[rel] = { size, mtimeMs, done: exp.kind === 'export' };
      if (exp.kind === 'partial') {
        this.s.exportsPartial.push(rel);
        continue;
      }
      const added = ingest(this.ledger, `file:${rel}`, exp.findings, () => exp.reviewedAt);
      this.s.exports++;
      this.s.newFindings += added.length;
      this.log.event('findings-export', { file: rel, findings: exp.findings.length, new: added.length });
    }
    // R4: these are re-read every sweep and never count until they're complete.
    if (this.s.exportsPartial.length) this.log.event('findings-export-partial', { files: this.s.exportsPartial, retry: 'next sweep' });
  }

  /** `--seed-through <PR>`: history is everything reviewed up to that PR's latest review (R9). */
  private seed(): void {
    const n = this.opts.seedThrough;
    if (n === null) return;
    const cutoff = this.ledger.prs[n]?.lastReviewAt;
    if (!cutoff) throw new SweepStop(`--seed-through ${n}: the ledger has no completed review of PR #${n} by the owner`);
    this.ledger.seedCutoff = cutoff;
    let history = 0;
    for (const f of Object.values(this.ledger.findings)) {
      f.seed = isHistory(this.ledger, f.reviewedAt);
      if (f.seed) history++;
    }
    this.log.event('findings-seed', { through: n, cutoff, history, new: Object.keys(this.ledger.findings).length - history });
  }

  // ----- judging (R4, R5, R10) -----

  private async judge(): Promise<void> {
    const queue = unjudged(this.ledger);
    // R3: nothing to judge, no LLM call.
    if (!queue.length || !(await this.llmReady())) return;
    while (queue.length) {
      if (this.capped('judge', queue.length) || this.late('judging')) break;
      const head = queue[0]!;
      // A finding that garbled an answer before goes alone, so it can't spoil a batch again.
      const batch = head.judgeAttempts > 0 ? [head] : takeWhile(queue, (f) => f.judgeAttempts === 0, this.cfg.judgeBatch);
      queue.splice(0, batch.length);
      const groups = this.catalogue();
      const ids = batch.map((f) => f.id);
      const placements = await this.ask('group', groupCall(groups, batch), (a) => parseGroupAnswer(a, ids, new Set(groups.map((g) => g.group))), { findings: ids });
      if (placements === 'infra') break;
      if (!placements) {
        // R4: no decision. The batch waits for a later sweep, one finding at a time.
        for (const f of batch) {
          f.judgeAttempts++;
          f.unjudgeable = f.judgeAttempts >= MAX_ATTEMPTS;
        }
        continue;
      }
      const made = new Map<string, string>();
      for (const p of placements) {
        const f = this.ledger.findings[p.finding]!;
        if ('group' in p) {
          f.group = p.group;
          // A broader name, once the group has a second kind of instance. A drafted group keeps its draft.
          const g = this.ledger.groups[p.group]!;
          if (p.rename && p.rename !== g.mistake) {
            this.log.event('findings-renamed', { group: g.id, from: g.mistake, to: p.rename });
            g.mistake = p.rename;
          }
          continue;
        }
        let id = made.get(p.label);
        if (!id) {
          id = groupId(this.ledger, f.id);
          made.set(p.label, id);
          this.ledger.groups[id] = { id, mistake: p.mistake, issue: null, reported: [], draft: null, draftAttempts: 0 };
        }
        f.group = id;
      }
      this.s.judged += batch.length;
      this.log.event('findings-judged', { placed: placements.map((p) => [p.finding.slice(0, 8), 'group' in p ? p.group : `new ${made.get(p.label)}`]) });
    }
  }

  /**
   * What the judge sees of each group, in creation order: its mistake, a few member titles and
   * its first description.
   */
  private catalogue(): CatalogueGroup[] {
    const members = membersByGroup(this.ledger);
    return Object.values(this.ledger.groups).map((g) => {
      const fs = members.get(g.id) ?? [];
      return { group: g.id, mistake: g.mistake, examples: fs.slice(0, 3).map((f) => f.title), ...(fs[0] ? { example: fs[0].description.slice(0, 300) } : {}) };
    });
  }

  // ----- proposals (R5, R6, R7) -----

  private async propose(): Promise<void> {
    const src = sources(this.ledger);
    for (const st of groupStates(this.ledger, src)) {
      const due = st.group.issue !== null ? st.members.some((f) => !st.group.reported.includes(f.id)) : st.meets && st.live;
      if (due && this.late('proposals')) return;
      if (st.group.issue !== null) {
        const reported = new Set(st.group.reported);
        const fresh = st.members.filter((f) => !reported.has(f.id));
        if (fresh.length) await this.comment(st, fresh, src);
      } else if (st.meets && st.live) {
        await this.open(st, src);
      }
    }
  }

  private async open(st: GroupState, src: Sources): Promise<void> {
    const g = st.group;
    if (!g.draft) {
      if (g.draftAttempts >= MAX_ATTEMPTS || this.capped('draft', 1) || this.late('drafting') || !(await this.llmReady())) return;
      const call = draftCall(g.mistake, st.members.map((f) => ({ ...findingText(f), source: src.label(src.of(f)).text })));
      const draft = await this.ask('draft', call, parseDraft, { group: g.id });
      if (draft === 'infra') return;
      if (!draft) {
        g.draftAttempts++;
        return;
      }
      g.draft = draft;
    }
    const rules = await this.ruleSearch(g.id, ruleQuery(g.draft));
    if (rules === null) return;
    const existing = await this.proposalIssue(g.id);
    if (existing === undefined) return;
    if (existing !== null) {
      // An earlier sweep opened it and lost the ledger write: adopt it rather than open a second.
      this.posted(g, existing, st.members);
      this.log.event('findings-adopted', { group: g.id, issue: existing });
      return;
    }
    const title = proposalTitle(g.draft);
    const body = proposalBody({ group: g.id, draft: g.draft, findings: st.members.map((f) => this.cite(f, src)), sources: st.sources.length, rules });
    const res = await this.post(`open "${title}" for ${g.id} (${st.members.length} findings from ${st.sources.length} sources): ${g.draft.mistake}`,
      `proposal-${g.id}.md`, body, (file) => ['issue', 'create', '--repo', this.cfg.slug, '--title', title, '--body-file', file, '--label', LABELS.proposal]);
    if (!res) return;
    const n = /\/issues\/(\d+)/.exec(res.stdout)?.[1];
    if (!n) {
      this.log.event('findings-post-failed', { group: g.id, action: 'issue create', why: 'no issue URL', retry: 'next sweep' });
      return;
    }
    this.posted(g, Number(n), st.members);
    this.s.proposed.push(g.issue!);
    this.log.event('findings-proposed', { group: g.id, issue: g.issue, findings: g.reported, sources: st.sources.length });
  }

  private async comment(st: GroupState, unreported: LedgerFinding[], src: Sources): Promise<void> {
    const g = st.group;
    const issue = g.issue!;
    const open = await this.issueOpen(issue);
    if (open === undefined) return;
    // Findings an earlier comment already listed (its ledger save was lost) are reported, not posted again.
    const already = open ? await this.commentedIds(issue) : new Set<string>();
    if (already === null) return;
    const posted = unreported.filter((f) => already.has(f.id));
    if (posted.length) {
      g.reported.push(...posted.map((f) => f.id));
      this.save();
      this.log.event('findings-already-posted', { group: g.id, issue, findings: posted.map((f) => f.id) });
    }
    const fresh = unreported.filter((f) => !already.has(f.id));
    if (!fresh.length) return;
    if (!open) {
      // The human closed it (rejected, or done with): the sightings stay in the ledger and the log, unposted.
      g.reported.push(...fresh.map((f) => f.id));
      this.save();
      this.log.event('findings-closed', { group: g.id, issue, findings: fresh.map((f) => f.id), why: 'the proposal is closed; not commenting' });
      return;
    }
    const body = proposalComment({ findings: fresh.map((f) => this.cite(f, src)), total: st.members.length, sources: st.sources.length });
    const res = await this.post(`comment on #${issue} (${g.id}): ${fresh.length} more finding(s)`, `comment-${issue}.md`, body,
      (file) => ['issue', 'comment', String(issue), '--repo', this.cfg.slug, '--body-file', file]);
    if (!res) return;
    this.posted(g, issue, fresh);
    this.s.commented.push(issue);
    this.log.event('findings-commented', { group: g.id, issue, findings: fresh.map((f) => f.id) });
  }

  /**
   * Posts one body under the owner's login (dry run: records what it would do). The result, or
   * null when nothing was posted; a failure is logged and retried next sweep.
   */
  private async post(would: string, name: string, body: string, args: (file: string) => string[]): Promise<ExecResult | null> {
    if (this.cfg.dryRun) {
      this.s.would.push(would);
      this.log.event('would', { action: would });
      return null;
    }
    if (!(await this.ownerLogin())) return null;
    const res = await this.shell.gh(args(this.writePost(name, body)));
    if (res.code === 0) return res;
    this.log.event('findings-post-failed', { action: name, exit: res.code, retry: 'next sweep' });
    return null;
  }

  /** The issue now lists these findings; saved at once, so a crash can't post them twice. */
  private posted(g: GroupState['group'], issue: number, fs: LedgerFinding[]): void {
    g.issue = issue;
    g.reported.push(...fs.map((f) => f.id).filter((id) => !g.reported.includes(id)));
    this.save();
  }

  /** How a finding is cited in a post: its PR, or the local review of its ticket (R6, R8: no local paths). */
  private cite(f: LedgerFinding, src: Sources): ProposalFinding {
    const gh = `https://github.com/${this.cfg.slug}`;
    const pr = f.origins.find((o) => o.startsWith('pr:'));
    let where: string;
    if (pr) {
      const n = pr.slice(3);
      where = `[PR #${n}](${gh}/pull/${n})`;
    } else {
      const label = src.label(src.of(f));
      const of = label.ticket !== null ? ` of [#${label.ticket}](${gh}/issues/${label.ticket})` : label.pr !== null ? ` of [PR #${label.pr}](${gh}/pull/${label.pr})` : '';
      where = `local review${of} (\`${basename(f.origins[0]!.replace(/^file:/, ''))}\`)`;
    }
    return { ...findingText(f), where };
  }

  /** Qodo's semantic rule search for the draft (R6); null when it failed, so the proposal waits. */
  private async ruleSearch(group: string, query: string): Promise<QodoRule[] | null> {
    const res = await this.shell.qodo(['read', 'rules', 'search', '--query', query, '--top-k', '3', '--scopes', `/${this.cfg.slug.toLowerCase()}/`, '--json']);
    const rules = res.code === 0 ? (firstJson(res.stdout) as { rules?: unknown } | null)?.rules : undefined;
    const ok = Array.isArray(rules) && rules.every((r) => r && typeof r === 'object' && typeof (r as QodoRule).name === 'string' && typeof (r as QodoRule).content === 'string');
    if (!ok) {
      this.log.event('findings-rule-search-failed', { group, exit: res.code, retry: 'next sweep' });
      return null;
    }
    return (rules as QodoRule[]).slice(0, 3);
  }

  /** The owner's `rule-proposal` issues, open or closed, read once per sweep; null if unreadable. */
  private async proposalList(): Promise<{ number: number; body: string; state: string }[] | null> {
    if (this.proposals === undefined) {
      const res = await this.shell.gh(['issue', 'list', '--repo', this.cfg.slug, '--label', LABELS.proposal, '--state', 'all', '--limit', '1000', '--json', 'number,body,author,state']);
      try {
        const list = res.code === 0 ? JSON.parse(res.stdout) as { number: number; body?: string; author?: { login?: string }; state?: string }[] : null;
        this.proposals = list ? list.filter((i) => i.author?.login === this.cfg.owner).map((i) => ({ number: i.number, body: i.body ?? '', state: i.state ?? '' })) : null;
      } catch {
        this.proposals = null;
      }
      if (!this.proposals) this.log.event('findings-post-failed', { action: 'list proposals', exit: res.code, retry: 'next sweep' });
    }
    return this.proposals;
  }

  /** The proposal carrying this group's marker: a number, null for none, undefined if unreadable. */
  private async proposalIssue(group: string): Promise<number | null | undefined> {
    const list = await this.proposalList();
    return list ? list.find((i) => i.body.includes(proposalMarker(group)))?.number ?? null : undefined;
  }

  /**
   * Finding ids the owner's own comments on the issue already list (their hidden markers), every
   * page of them; null if unreadable. Anyone can comment on a public issue, so only the owner's count.
   */
  private async commentedIds(n: number): Promise<Set<string> | null> {
    const res = await this.shell.gh(['api', '--paginate', `repos/${this.cfg.slug}/issues/${n}/comments`,
      '--jq', `.[] | select(.user.login == "${this.cfg.owner}") | .body`]);
    if (res.code === 0) return postedIds([res.stdout]);
    this.log.event('findings-post-failed', { action: `read #${n} comments`, exit: res.code, retry: 'next sweep' });
    return null;
  }

  /** Whether a proposal is still open: undefined if that can't be read (no comment this sweep). */
  private async issueOpen(n: number): Promise<boolean | undefined> {
    const list = await this.proposalList();
    if (!list) return undefined;
    const issue = list.find((i) => i.number === n);
    return issue ? issue.state === 'OPEN' : undefined;
  }

  /** Posts go out under the owner's login only, so a proposal passes the runner's own ticket checks. */
  private async ownerLogin(): Promise<boolean> {
    if (this.owner === undefined) {
      const res = await this.shell.gh(['api', 'user', '--jq', '.login']);
      this.owner = res.code === 0 && res.stdout.trim() === this.cfg.owner;
      if (!this.owner) this.log.event('findings-post-skipped', { why: `gh is not logged in as @${this.cfg.owner}`, retry: 'next sweep' });
    }
    return this.owner;
  }

  // ----- the LLM (R4, R10) -----

  /** The cap on LLM calls: true (and logged once) when it's reached. */
  private capped(what: string, left: number): boolean {
    if (this.s.calls < this.cfg.sweepMaxCalls) return false;
    if (!this.s.capped) this.log.event('findings-cap', { maxCalls: this.cfg.sweepMaxCalls, stopped: what, left, retry: 'next sweep' });
    this.s.capped = true;
    return true;
  }

  private async llmReady(): Promise<boolean> {
    if (this.llm === undefined) {
      const hours = await midwayHoursLeft(this.cfg.midwayCookie, this.deps.clock.now());
      this.llm = !(await isExecutable(this.cfg.claude)) ? 'claude is not installed'
        : hours === null || hours <= 0 ? 'no live Midway session' : null;
      if (this.llm) this.log.event('findings-judge-skipped', { why: this.llm, retry: 'next sweep' });
    }
    return this.llm === null;
  }

  /**
   * One judge call: the parsed answer, `infra` when the call itself failed (stop LLM work for this
   * sweep, no attempt counted), or null for an answer that is no decision (R4). Both failures are logged.
   */
  private async ask<T>(kind: string, call: JudgeCall, parse: (answer: unknown) => T | null, ctx: Record<string, unknown>): Promise<T | 'infra' | null> {
    this.s.calls++;
    // From HOME: not the repo (no project CLAUDE.md in the prompt) and not a temp dir, which
    // agent-run code may write (factory/sandbox.ts), so nothing there can plant context for the judge.
    const out = readJudge(await this.shell.sh(this.cfg.claude, judgeArgs(call, this.cfg.judgeBudgetUsd), {
      cwd: this.cfg.home, timeoutMs: this.cfg.timeouts.judge, env: { ...this.shell.env, GH_TOKEN: '', GITHUB_TOKEN: '' },
    }));
    this.s.costUsd += out.costUsd;
    this.log.event('findings-judge', { kind, ok: out.ok, ...(out.ok ? {} : { reason: out.reason }), costUsd: out.costUsd });
    if (!out.ok && out.infra) {
      // No more LLM calls this sweep, drafts included.
      this.llm = `a judge call failed (${out.reason})`;
      this.log.event('findings-judge-failed', { ...ctx, why: out.reason, retry: 'next sweep' });
      return 'infra';
    }
    const parsed = out.ok ? parse(out.answer) : null;
    if (parsed === null) this.log.event('findings-judge-garbled', { ...ctx, why: out.ok ? `the ${kind} answer is no decision` : out.reason });
    return parsed;
  }

  private late(what: string): boolean {
    if (this.deps.clock.now() <= this.deadline) return false;
    this.log.event('findings-out-of-time', { stopped: what, budgetMin: this.cfg.sweepBudgetMs / 60_000, retry: 'next sweep' });
    return true;
  }

  // ----- end -----

  private end(): SweepSummary {
    this.s.waiting = unjudged(this.ledger).length;
    this.s.unjudgeable = Object.values(this.ledger.findings).filter((f) => f.unjudgeable).length;
    const src = sources(this.ledger);
    this.s.meeting = groupStates(this.ledger, src).filter((st) => st.meets).map((st) => ({
      group: st.group.id, mistake: st.group.draft?.mistake ?? st.group.mistake, findings: st.members.length,
      sources: st.sources.map((x) => src.label(x).text), issue: st.group.issue,
    }));
    this.log.event('findings-end', { ...this.s, meeting: this.s.meeting.map((m) => `${m.group} ${m.findings}/${m.sources.length}${m.issue ? ` #${m.issue}` : ''}`) });
    return this.s;
  }

  /** Post bodies, redacted (R8), beside the ledger. */
  private writePost(name: string, text: string): string {
    const dir = join(findingsDir(this.cfg), 'posts');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${stamp(this.deps.clock.now())}-${String(++this.files).padStart(2, '0')}-${name}`);
    writeFileSync(file, scrubLocalPaths(redact(text, machinePaths(this.cfg))));
    return file;
  }
}

/** JSON files up to `depth` folders down, in codepoint order, never following a symlink. */
function walk(dir: string, depth: number): { path: string; size: number; mtimeMs: number }[] {
  const out: { path: string; size: number; mtimeMs: number }[] = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    const st = lstatSync(path);
    if (st.isDirectory() && depth > 0) out.push(...walk(path, depth - 1));
    else if (st.isFile() && name.endsWith('.json')) out.push({ path, size: st.size, mtimeMs: st.mtimeMs });
  }
  return out;
}

function takeWhile<T>(xs: T[], ok: (x: T) => boolean, max: number): T[] {
  const out: T[] = [];
  for (const x of xs) {
    if (out.length >= max || !ok(x)) break;
    out.push(x);
  }
  return out;
}

/** One line per summary, for a person at a terminal. */
export function summaryLines(s: SweepSummary): string[] {
  const out = [
    `findings sweep: ${s.state}${s.reason ? ` (${s.reason})` : ''}${s.seeding ? ', seeding (history only, nothing proposed)' : ''}`,
    `  read ${s.prsRead} PR(s) and ${s.exports} local export(s); ${s.newFindings} new finding(s)` +
      `${s.prsFailed.length ? `; failed (retried next sweep): PR ${s.prsFailed.map((n) => `#${n}`).join(', ')}` : ''}` +
      `${s.exportsPartial.length ? `; ${s.exportsPartial.length} partial export(s) not counted` : ''}`,
    `  judged ${s.judged} in ${s.calls} LLM call(s), $${s.costUsd.toFixed(2)}; ${s.waiting} waiting${s.capped ? ' (call cap reached)' : ''}, ${s.unjudgeable} set aside`,
    `  ${s.meeting.length} group(s) at the threshold (${THRESHOLD.findings} findings from ${THRESHOLD.sources} tickets):`,
    ...s.meeting.map((m) => `  - ${m.group}: ${m.findings} findings from ${m.sources.join(', ')}${m.issue ? ` → #${m.issue}` : ''}. ${m.mistake}`),
  ];
  if (s.proposed.length) out.push(`  opened: ${s.proposed.map((n) => `#${n}`).join(', ')}`);
  if (s.commented.length) out.push(`  commented on: ${s.commented.map((n) => `#${n}`).join(', ')}`);
  for (const w of s.would) out.push(`  would ${w}`);
  return out;
}
