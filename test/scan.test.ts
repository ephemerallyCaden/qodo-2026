import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { sessionKey } from '../src/core/hash.js';
import { scan, type ScanOptions } from '../src/scan/index.js';
import { buildBasicRepo, type FixtureRepo } from './fixtures/build/basic.js';
import { cli } from './fixtures/cli.js';
import { MAIN_SESSION, SUBAGENT_ID, writeClaudeFixture, type ClaudeFixture } from './fixtures/claude/basic.js';

const GOLDEN = join(import.meta.dirname, 'golden/basic.snapshot.json');
let repo: FixtureRepo;
let claude: ClaudeFixture;

beforeAll(() => {
  repo = buildBasicRepo();
  claude = writeClaudeFixture(repo);
});

const run = (o: Partial<ScanOptions> = {}) => scan({ repoDir: repo.dir, windowMonths: 24, ingest: true,
  claudeProjectsDir: join(claude.claudeDir, 'projects'), keyFor: () => new Uint8Array(32).fill(7), ...o });

describe('scan', () => {
  it('matches the golden snapshot (update deliberately with UPDATE_GOLDEN=1 and a Golden-Update: reason)', async () => {
    const { json } = await run();
    if (process.env['UPDATE_GOLDEN'] === '1') writeFileSync(GOLDEN, json);
    expect(json).toBe(readFileSync(GOLDEN, 'utf8'));
  });

  it('classes commits, including agent work committed under the human identity', async () => {
    const { snapshot } = await run();
    const bySha = new Map(snapshot.commits.map((c) => [c.sha, c.attribution]));
    const cls = (id: string) => bySha.get(repo.commits[id]!.sha)!;
    expect(['c0', 'c1', 'c2', 'c3', 'c4', 'c5'].map((id) => cls(id).class))
      .toEqual(['unknown', 'agent', 'mixed', 'human', 'unknown', 'agent']);
    expect(cls('c1').selfCommittedAgentWritten).toBe(true);
    expect(cls('c1').evidence.map((e) => e.kind)).toEqual(['transcript_match', 'agent_ran_commit']);
    expect(cls('c2').agentLineShareMilli).toBe(500);
    expect(cls('c4').selfCommittedAgentWritten).toBe(false);
  });

  it('keys sessions by hash of tool + session ID and links subagents to their parent', async () => {
    const { snapshot } = await run();
    const mainKey = sessionKey('claude-code', MAIN_SESSION);
    const subKey = sessionKey('claude-code', MAIN_SESSION, SUBAGENT_ID);
    expect(snapshot.sessions.map((s) => [s.key, s.kind, s.parentKey])).toEqual([[mainKey, 'main', undefined], [subKey, 'subagent', mainKey]]);
    const [mainS, subS] = snapshot.sessions;
    expect(mainS).toMatchObject({ linesAdded: 8, filesTouched: 2, model: 'claude-opus-4-1', commits: [repo.commits['c1']!.sha, repo.commits['c2']!.sha] });
    expect(subS).toMatchObject({ agentType: 'general-purpose', commits: [repo.commits['c5']!.sha] });
    const c5 = snapshot.commits.find((c) => c.sha === repo.commits['c5']!.sha)!;
    expect(c5.attribution.sessions).toEqual([{ sessionKey: subKey, lines: 2 }]);
  });

  it('is byte-identical across runs and independent of the HMAC key', async () => {
    const a = await run();
    const b = await run();
    const c = await run({ keyFor: () => new Uint8Array(32).fill(9) });
    expect(b.json).toBe(a.json);
    expect(c.json).toBe(a.json);
  });

  it('classes everything unknown, never human, without log coverage', async () => {
    const { snapshot } = await run({ ingest: false });
    expect(new Set(snapshot.commits.map((c) => c.attribution.class))).toEqual(new Set(['unknown']));
    expect(snapshot.coverage).toEqual([]);
  });
});

describe('commet scan CLI', () => {
  it('writes .git/commet/snapshot.json (0600) and prints per-class counts', async () => {
    const r = await cli(['scan'], repo.dir, { CLAUDE_CONFIG_DIR: claude.claudeDir });
    expect(r).toMatchObject({ code: 0, err: '' });
    expect(r.out).toContain('6 commits: agent 2 · mixed 1 · human 1 · unknown 2');
    expect(r.out).toContain('committed by you, written by an agent: 3');
    const file = join(repo.dir, '.git/commet/snapshot.json');
    expect(readFileSync(file, 'utf8')).toBe(readFileSync(GOLDEN, 'utf8'));
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(join(repo.dir, '.git/commet')).mode & 0o777).toBe(0o700);
    expect(statSync(join(repo.dir, '.git/commet/key')).mode & 0o777).toBe(0o600);
  });

  it('refuses a shallow clone with exit 3 and an unshallow hint', async () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'commet-shallow-')), 'clone');
    execFileSync('git', ['clone', '-q', '--depth', '1', `file://${repo.dir}`, dir]);
    const r = await cli(['scan'], dir, { CLAUDE_CONFIG_DIR: claude.claudeDir });
    expect(r.code).toBe(3);
    expect(r.err).toContain('git fetch --unshallow');
  });

  it('exits 4 outside a repo and 2 on usage errors', async () => {
    expect((await cli(['scan'], mkdtempSync(join(tmpdir(), 'commet-norepo-')), {})).code).toBe(4);
    expect((await cli(['scan', '--window', 'x'], repo.dir, {})).code).toBe(2);
    expect((await cli(['frobnicate'], repo.dir, {})).code).toBe(2);
  });
});
