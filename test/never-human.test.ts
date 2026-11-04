// Issue #5: "unknown, never human" (design §5.2.7, R6). Each `bug(...)` test asserts what the spec
// requires and is expected to FAIL on current code, so it is declared with `it.fails` to keep the
// suite green. The fix task flips `bug` to `it` (or deletes the alias). To see the real failures:
//   ISSUE5_STRICT=1 npx vitest run test/never-human.test.ts
// Preconditions are plain `it` tests: they must pass before and after the fix, so a broken
// fixture can never make an `it.fails` test pass vacuously.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CommitAttribution, SnapshotV01 } from '../src/core/snapshot/types.js';
import { formatSummary } from '../src/core/summary.js';
import { scan, type LogStats } from '../src/scan/index.js';
import { buildBasicRepo, type FixtureRepo } from './fixtures/build/basic.js';
import { buildNeverHumanRepo, EDGE_CASES, type EdgeCase } from './fixtures/build/never-human.js';
import { writeClaudeFixture } from './fixtures/claude/basic.js';
import { writeNeverHumanClaude, type NeverHumanClaude } from './fixtures/claude/never-human.js';

const bug = process.env['ISSUE5_STRICT'] === '1' ? it : it.fails;
/** Case 4b needs a case-insensitive filesystem (macOS APFS default, Windows); skipped elsewhere. */
const CASE_INSENSITIVE = existsSync(realpathSync(tmpdir()).toUpperCase());
const KEY = () => new Uint8Array(32).fill(7);

let repo: FixtureRepo;
let claude: NeverHumanClaude;
let snapshot: SnapshotV01;
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
    // The teammate's commit is off the first-parent chain; the merge really has two parents.
    expect(snapshot.commits.some((c) => c.sha === repo.commits['friend']!.sha)).toBe(false);
    const parents = execFileSync('git', ['rev-list', '--parents', '-n', '1', repo.commits['merge']!.sha], { cwd: repo.dir, encoding: 'utf8' });
    expect(parents.trim().split(' ')).toHaveLength(3);
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

  it.skipIf(!CASE_INSENSITIVE)('case 4b setup: the case-variant cwd is the same directory as the repo', () => {
    expect(claude.caseInsensitiveFs).toBe(true);
  });
});

describe('Issue #5 known bugs (it.fails; the fix flips `bug` to `it`)', () => {
  it('case 1: a commit the agent ran (agent_ran_commit) is never human, even when its edits were not parsed', () => {
    // Decision 2: unknown, keeping the evidence and the session link.
    expect(attr('bash')).toMatchObject({ class: 'unknown', tier: 'none', agentLineShareMilli: 0,
      evidence: [{ kind: 'agent_ran_commit', detail: 'git_commit_output' }] });
    expect(attr('bash').sessions).toHaveLength(1);
  });

  bug('case 2: a self-authored merge that brings in a teammate\'s lines is never human', () => {
    expect(attr('merge').class).not.toBe('human');
  });

  bug('case 3a: a commit inside a transcript that dropped an over-cap (>4 MiB) record is never human', () => {
    expect(attr('oversized').class).not.toBe('human');
  });

  bug('case 3b: a commit inside a transcript that dropped a malformed record is never human', () => {
    expect(attr('malformed').class).not.toBe('human');
  });

  bug('case 3c: a commit while a session with no readable cwd in its head was open is never human', () => {
    expect(attr('noCwd').class).not.toBe('human');
  });

  bug('case 3: every dropped record that could hold an edit is counted in the log stats and the summary', () => {
    // Field names are the fix's choice; at least the over-cap, malformed and no-cwd records count.
    const dropped = Object.entries(logs ?? {}).filter(([k]) => k !== 'transcripts').reduce((n, [, v]) => n + v, 0);
    expect(dropped).toBeGreaterThanOrEqual(3);
    expect(formatSummary(snapshot, logs)).toContain('never classed human');
  });

  bug('case 4: edits logged through a symlinked cwd are matched (agent), not dropped while coverage counts', () => {
    expect(attr('symlinked')).toMatchObject({ class: 'agent', agentLineShareMilli: 1000 });
  });

  (CASE_INSENSITIVE ? bug : it.skip)('case 4b: edits logged through a case-variant cwd are matched (agent), never human', () => {
    expect(attr('caseVariant').class).not.toBe('human');
    expect(attr('caseVariant')).toMatchObject({ class: 'agent', agentLineShareMilli: 1000 });
  });
});

describe('Issue #5 case 5: self identity under .mailmap', () => {
  let basic: FixtureRepo;
  let mapped: SnapshotV01;
  const CANONICAL = 'ada@canonical.example';

  beforeAll(async () => {
    basic = buildBasicRepo();
    const c = writeClaudeFixture(basic);
    // The user commits as their raw user.email; .mailmap canonicalises it (design §5.1.9).
    writeFileSync(join(basic.dir, '.mailmap'), `Ada Self <${CANONICAL}> <self@example.com>\n`);
    ({ snapshot: mapped } = await scan({ repoDir: basic.dir, windowMonths: 24, ingest: true,
      claudeProjectsDir: join(c.claudeDir, 'projects'), keyFor: KEY }));
  });

  it('setup: the mailmap is applied to commit authors', () => {
    const c3 = mapped.commits.find((c) => c.sha === basic.commits['c3']!.sha)!;
    expect(mapped.people.find((p) => p.id === c3.author)).toBeDefined();
    expect(mapped.repo.selfPersonIds).toHaveLength(1);
  });

  bug('case 5: a mailmapped self author is still self (people, selfPersonIds, human and self-committed agent work)', () => {
    const by = (id: string) => mapped.commits.find((c) => c.sha === basic.commits[id]!.sha)!;
    const self = mapped.people.find((p) => p.id === by('c3').author)!;
    expect({ isSelf: self.isSelf, selfIds: mapped.repo.selfPersonIds, c3: by('c3').attribution.class,
      c1SelfAgent: by('c1').attribution.selfCommittedAgentWritten })
      .toEqual({ isSelf: true, selfIds: [by('c3').author], c3: 'human', c1SelfAgent: true });
  });
});
