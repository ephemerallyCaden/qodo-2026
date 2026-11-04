import { readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, expect, it } from 'vitest';
import { DENIED_PATH, discoverClaude, metaToken } from '../src/attrib/parsers/claude.js';
import { buildBasicRepo, type FixtureRepo } from './fixtures/build/basic.js';
import { CANARIES, MAIN_SESSION, SUBAGENT_ID, writeClaudeFixture, type ClaudeFixture } from './fixtures/claude/basic.js';
import { cli } from './fixtures/cli.js';

let repo: FixtureRepo;
let claude: ClaudeFixture;
let outputs: Record<string, string>;

beforeAll(async () => {
  repo = buildBasicRepo();
  claude = writeClaudeFixture(repo);
  const r = await cli(['scan'], repo.dir, { CLAUDE_CONFIG_DIR: claude.claudeDir });
  expect(r.code).toBe(0);
  outputs = { snapshot: readFileSync(join(repo.dir, '.git/commet/snapshot.json'), 'utf8'), stdout: r.out, stderr: r.err };
});

it('fixture still plants every canary (guards against a vacuous pass)', () => {
  const planted = claude.transcripts.map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const canary of Object.values(CANARIES)) expect(planted).toContain(canary);
  expect(planted).toContain(`"cwd":"${repo.dir}"`);
});

it('no canary, cwd or absolute path reaches the snapshot, stdout or stderr', () => {
  const forbidden = [...Object.values(CANARIES), repo.dir, claude.claudeDir, homedir(), tmpdir()];
  for (const [name, text] of Object.entries(outputs)) {
    for (const f of forbidden) expect(text.includes(f), `${name} contains ${f}`).toBe(false);
  }
});

it('metadata fields reject path-shaped values but keep branch names (Qodo #3)', () => {
  for (const ok of ['main', 'feature/x', 'session/day1-ideation', 'claude-opus-4-1', 'general-purpose', 'plugin:agent']) expect(metaToken(ok)).toBe(ok);
  const bad = ['/etc/x', '~/x', 'C:/x', 'c:x', 'a/../b', '..', `x${homedir()}/y`, `x${homedir().slice(1)}`, `${tmpdir()}/m`, 'two words'];
  for (const v of bad) expect(metaToken(v), v).toBeUndefined();
});

it('no snapshot string value looks like an absolute or home path', () => {
  const strings: string[] = [];
  JSON.parse(outputs['snapshot']!, (_k, v: unknown) => (typeof v === 'string' && strings.push(v), v));
  expect(strings.length).toBeGreaterThan(50);
  expect(strings.filter((s) => /^([A-Za-z]:\\|\/|~)/.test(s))).toEqual([]);
});

it('never reads denylisted agent-log paths, even through file or directory symlinks (Qodo #2)', async () => {
  for (const p of ['/h/.claude/history.jsonl', '/h/.claude/file-history/x', '/h/p/api-request-1.jsonl']) expect(DENIED_PATH.test(p)).toBe(true);
  const found = await discoverClaude(join(claude.claudeDir, 'projects'), join(repo.dir, '.git'), [repo.dir]);
  const read = found.transcripts.map((t) => t.file.slice(claude.claudeDir.length));
  expect(read).toEqual([
    `/projects/-unrelated-slug/${MAIN_SESSION}/subagents/agent-${SUBAGENT_ID}.jsonl`,
    `/projects/-unrelated-slug/${MAIN_SESSION}.jsonl`,
    '/projects/-unrelated-slug/33333333-3333-4333-8333-333333333333.jsonl',
    '/projects/-unrelated-slug/66666666-6666-4666-8666-666666666666/subagents/agent-f00d.jsonl',
    '/projects/-unrelated-slug/66666666-6666-4666-8666-666666666666.jsonl',
  ]);
});
