import { readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, expect, it } from 'vitest';
import { DENIED_PATH, listTranscripts } from '../src/attrib/parsers/claude.js';
import { buildBasicRepo, type FixtureRepo } from './fixtures/build/basic.js';
import { CANARIES, writeClaudeFixture, type ClaudeFixture } from './fixtures/claude/basic.js';
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

it('no snapshot string value looks like an absolute or home path', () => {
  const strings: string[] = [];
  JSON.parse(outputs['snapshot']!, (_k, v: unknown) => (typeof v === 'string' && strings.push(v), v));
  expect(strings.length).toBeGreaterThan(50);
  expect(strings.filter((s) => /^([A-Za-z]:\\|\/|~)/.test(s))).toEqual([]);
});

it('never lists denylisted agent-log paths', () => {
  for (const p of ['/h/.claude/history.jsonl', '/h/.claude/file-history/x', '/h/p/api-request-1.jsonl']) expect(DENIED_PATH.test(p)).toBe(true);
  const listed = listTranscripts(join(claude.claudeDir, 'projects')).map((t) => t.file);
  expect(listed.length).toBe(4);
  expect(listed.some((f) => DENIED_PATH.test(f) || f.endsWith('.meta.json'))).toBe(false);
});
