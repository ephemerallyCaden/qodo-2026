// Issue #5: "unknown, never human" (design §5.2.7, R6). Each case asserts what the spec requires;
// all failed before the fix. Preconditions must pass before and after it, so a broken fixture can
// never make a case pass vacuously.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CommitAttribution, SnapshotV02 } from '../src/core/snapshot/types.js';
import { formatSummary } from '../src/core/summary.js';
import { scan, type LogStats } from '../src/scan/index.js';
import { buildBasicRepo, type FixtureRepo } from './fixtures/build/basic.js';
import { buildNeverHumanRepo, EDGE_CASES, MERGES, type EdgeCase } from './fixtures/build/never-human.js';
import { writeClaudeFixture } from './fixtures/claude/basic.js';
import { writeNeverHumanClaude, type NeverHumanClaude } from './fixtures/claude/never-human.js';

/** Case 4b needs a case-insensitive filesystem (macOS APFS default, Windows); skipped elsewhere. */
const CASE_INSENSITIVE = existsSync(realpathSync(tmpdir()).toUpperCase());
const KEY = () => new Uint8Array(32).fill(7);

let repo: FixtureRepo;
let claude: NeverHumanClaude;
let snapshot: SnapshotV02;
let logs: LogStats;
const attr = (id: string): CommitAttribution => {
  const c = snapshot.commits.find((x) => x.sha === repo.commits[id]!.sha);
  if (!c) throw new Error(`fixture commit ${id} missing from snapshot`);
  return c.attribution;
};

beforeAll(async () => {
  repo = buildNeverHumanRepo();
  claude = writeNeverHumanClaude(repo);
  ({ snapshot, logs } = await scan({ repoDir: repo.dir, windowMonths: 24, ingest: true,
    claudeProjectsDir: join(claude.claudeDir, 'projects'), keyFor: KEY }));
});

describe('Issue #5 fixture preconditions (must pass before and after the fix)', () => {
  const ids = Object.keys(EDGE_CASES) as EdgeCase[];

  it('every edge commit is self-authored, on the first-parent chain, and inside log coverage', () => {
    const self = new Set(snapshot.repo.selfPersonIds);
    const covered = (iso: string) => snapshot.coverage.some((s) => iso >= s.from && iso <= s.to);
    for (const id of ids) {
      const c = snapshot.commits.find((x) => x.sha === repo.commits[id]!.sha);
      expect(c, id).toBeDefined();
      expect(self.has(c!.author), `${id} author is self`).toBe(true);
      expect(covered(c!.date), `${id} inside coverage`).toBe(true);
      expect(c!.files.some((f) => f[0] === EDGE_CASES[id][1] && f[1] > 0), `${id} adds lines to its file`).toBe(true);
    }
    // The teammates' commits are off the first-parent chain; each merge really has two parents.
    for (const id of ['friend', 'friend3', 'friend4']) expect(snapshot.commits.some((c) => c.sha === repo.commits[id]!.sha), id).toBe(false);
    for (const id of MERGES) {
      const parents = execFileSync('git', ['rev-list', '--parents', '-n', '1', repo.commits[id]!.sha], { cwd: repo.dir, encoding: 'utf8' });
      expect(parents.trim().split(' '), id).toHaveLength(3);
    }
  });

  it('positive control: human text in an idle session is human, so the setup can produce human at all', () => {
    expect(attr('control')).toMatchObject({ class: 'human', tier: 'high', agentLineShareMilli: 0 });
  });

  it('case 1 setup: the agent session is linked to the commit through its git commit output', () => {
    expect(attr('bash').evidence).toEqual([{ kind: 'agent_ran_commit', detail: 'git_commit_output' }]);
    expect(attr('bash').sessions).toHaveLength(1);
  });

  it('case 3 setup: the oversized record and the no-cwd head exceed 4 MiB, the malformed record is not JSON', () => {
    const file = (name: string) => readFileSync(join(claude.claudeDir, 'projects/-edge-slug', `${claude.sessionIds[name]}.jsonl`), 'utf8').split('\n');
    expect(file('oversized').some((l) => l.length > 4 << 20 && l.includes('"structuredPatch"'))).toBe(true);
    expect(file('noCwd')[0]!.length).toBeGreaterThan(4 << 20);
    const bad = file('malformed').find((l) => l.includes('"structuredPatch"'))!;
    expect(() => JSON.parse(bad)).toThrow();
  });

  it.skipIf(process.platform !== 'darwin')('case 4c setup: on macOS the /var/… cwd is a different string for the same directory', () => {
    expect(claude.varCwd).not.toBe(repo.dir);
    expect(realpathSync(claude.varCwd)).toBe(repo.dir);
  });

  it('case 4d setup: the subdirectory cwd is a symlink into the repo', () => {
    expect(realpathSync(claude.subLink)).toBe(join(repo.dir, 'src/linked'));
  });

  it.skipIf(!CASE_INSENSITIVE)('case 4b setup: the case-variant cwd is the same directory as the repo', () => {
    expect(claude.caseInsensitiveFs).toBe(true);
  });
});

describe('Issue #5 cases: never human', () => {
  it('case 1: a commit the agent ran (agent_ran_commit) is never human, even when its edits were not parsed', () => {
    // Decision 2: unknown, keeping the evidence and the session link.
    expect(attr('bash')).toMatchObject({ class: 'unknown', tier: 'none', agentLineShareMilli: 0,
      evidence: [{ kind: 'agent_ran_commit', detail: 'git_commit_output' }] });
    expect(attr('bash').sessions).toHaveLength(1);
  });

  it('case 2: a self-authored merge that brings in a teammate\'s lines is never human', () => {
    expect(attr('merge')).toMatchObject({ class: 'unknown', tier: 'none' });
  });

  it('case 2b: an agent-run git merge whose output names no SHA is never human', () => {
    // Qodo PR6 #2: the merge command's window now links it to the session, without a SHA.
    expect(attr('agentMerge')).toMatchObject({ class: 'unknown', tier: 'none', evidence: [{ kind: 'agent_ran_commit', detail: 'git_command' }] });
    expect(attr('agentMerge').sessions).toHaveLength(1);
  });

  it('case 2c: a merge with self-written resolution lines is never human (decision 3)', () => {
    expect(attr('resolvedMerge')).toMatchObject({ class: 'unknown', tier: 'none' });
  });

  it('case 3a: a commit inside a transcript that dropped an over-cap (>4 MiB) record is never human', () => {
    expect(attr('oversized')).toMatchObject({ class: 'unknown', tier: 'none' });
  });

  it('case 3b: a commit inside a transcript that dropped a malformed record is never human', () => {
    expect(attr('malformed')).toMatchObject({ class: 'unknown', tier: 'none' });
  });

  it('case 3c: a commit while a session with no readable cwd in its head was open is never human', () => {
    // The head is read past the 4 MiB cap (bounded by the file cap), so the session is placed and its Write matches.
    expect(attr('noCwd')).toMatchObject({ class: 'agent', agentLineShareMilli: 1000 });
  });

  it('case 3d: a transcript with no cwd at all is an unattributed blind span', () => {
    expect(attr('cwdless')).toMatchObject({ class: 'unknown', tier: 'none' });
    expect(logs?.unattributed).toBe(1);
  });

  it('case 3e: a commit inside a transcript that dropped an edit record missing its uuid is never human', () => {
    expect(attr('noUuid')).toMatchObject({ class: 'unknown', tier: 'none' });
  });

  it('case 3f: a commit inside a transcript with an in-cwd edit path that does not relativise is never human', () => {
    expect(attr('dotdot')).toMatchObject({ class: 'unknown', tier: 'none' });
  });

  it('case 3: every dropped record that could hold an edit is counted in the log stats and the summary', () => {
    // Field names are the fix's choice; at least the over-cap, malformed and no-cwd records count.
    const dropped = Object.entries(logs ?? {}).filter(([k]) => k !== 'transcripts').reduce((n, [, v]) => n + v, 0);
    expect(dropped).toBeGreaterThanOrEqual(3);
    const summary = formatSummary(snapshot, logs);
    expect(summary).toContain(`${logs!.dropped} log record(s) dropped (over the size cap, malformed, missing ids, or at a path outside the repo); `
      + 'commits during their transcripts are never classed human');
    expect(summary).toContain('1 transcript(s) could not be placed in a repo (no usable cwd); commits during them are never classed human');
  });

  it('case 4: edits logged through a symlinked cwd are matched (agent), not dropped while coverage counts', () => {
    expect(attr('symlinked')).toMatchObject({ class: 'agent', agentLineShareMilli: 1000 });
  });

  it.skipIf(!CASE_INSENSITIVE)('case 4b: edits logged through a case-variant cwd are matched (agent), never human', () => {
    expect(attr('caseVariant').class).not.toBe('human');
    expect(attr('caseVariant')).toMatchObject({ class: 'agent', agentLineShareMilli: 1000 });
  });

  it('case 4c: edits logged under a /var/… cwd for a /private/var/… repo are matched (agent)', () => {
    expect(attr('varCwd')).toMatchObject({ class: 'agent', agentLineShareMilli: 1000 });
  });

  it('case 4d: edits logged through a symlinked subdirectory cwd are matched (agent)', () => {
    expect(attr('symlinkedSub')).toMatchObject({ class: 'agent', agentLineShareMilli: 1000 });
  });

  it('cases 3–4: exactly the records the parser could not use are counted', () => {
    // oversized, malformed, noUuid and dotdot each drop one record; symlinked and case-variant
    // cwds no longer do. Only the cwd-less transcript is unattributed.
    expect(logs).toMatchObject({ tooLarge: 0, unavailable: 0, dropped: 4, unattributed: 1 });
  });
});

describe('Issue #5 case 5: self identity under .mailmap', () => {
  const CANONICAL = 'ada@canonical.example';
  /** Scans the basic fixture with a .mailmap and, optionally, a different raw user.email / user.name. */
  const scanMapped = async (mailmap: string, config: Record<string, string> = {}) => {
    const basic = buildBasicRepo();
    const c = writeClaudeFixture(basic);
    writeFileSync(join(basic.dir, '.mailmap'), mailmap);
    for (const [k, v] of Object.entries(config)) execFileSync('git', ['config', k, v], { cwd: basic.dir });
    const { snapshot: s } = await scan({ repoDir: basic.dir, windowMonths: 24, ingest: true,
      claudeProjectsDir: join(c.claudeDir, 'projects'), keyFor: KEY });
    const by = (id: string) => s.commits.find((x) => x.sha === basic.commits[id]!.sha)!;
    return { s, by };
  };
  /** people[].isSelf and selfPersonIds agree, and the self commits are self (human c3, self-committed agent c1). */
  const expectSelf = ({ s, by }: Awaited<ReturnType<typeof scanMapped>>) => {
    for (const p of s.people) expect(p.isSelf, p.displayName).toBe(s.repo.selfPersonIds.includes(p.id));
    const self = s.people.find((p) => p.id === by('c3').author)!;
    expect({ isSelf: self.isSelf, selfIds: s.repo.selfPersonIds, c3: by('c3').attribution.class,
      c1SelfAgent: by('c1').attribution.selfCommittedAgentWritten })
      .toEqual({ isSelf: true, selfIds: [by('c3').author], c3: 'human', c1SelfAgent: true });
    // The teammate stays someone else.
    expect(s.people.find((p) => p.id === by('c4').author)!.isSelf).toBe(false);
  };

  it('setup: the mailmap is applied to commit authors', async () => {
    const { s, by } = await scanMapped(`Ada Self <${CANONICAL}> <self@example.com>\n`);
    expect(s.people.find((p) => p.id === by('c3').author)).toBeDefined();
    expect(s.repo.selfPersonIds).toHaveLength(1);
  });

  it('case 5: a mailmapped self author is still self (people, selfPersonIds, human and self-committed agent work)', async () => {
    // The user commits as their raw user.email; .mailmap canonicalises it (design §5.1.9).
    expectSelf(await scanMapped(`Ada Self <${CANONICAL}> <self@example.com>\n`));
  });

  it('case 5b: a user.email that differs from the mailmap entry only by case is still self', async () => {
    expectSelf(await scanMapped(`<${CANONICAL}> <self@example.com>\n`, { 'user.email': 'Self@Example.COM' }));
  });

  it('case 5c: a mailmap entry that matches on name and email maps self only with the name', async () => {
    const mapped = await scanMapped(`Ada Canon <${CANONICAL}> Ada Self <self@example.com>\n`);
    expectSelf(mapped);
    expect(mapped.s.repo.selfPersonIds).not.toEqual([`p_${createHash('sha256').update('self@example.com').digest('hex').slice(0, 12)}`]);
  });

  it('case 5d: a mailmap entry that changes only the name keeps the email, so self is unchanged', async () => {
    const mapped = await scanMapped('Ada Renamed <self@example.com>\n');
    expectSelf(mapped);
    expect(mapped.s.people.find((p) => p.isSelf)!.displayName).toBe('Ada Renamed');
  });
});
