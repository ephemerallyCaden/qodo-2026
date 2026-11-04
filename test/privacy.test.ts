import { readFileSync, realpathSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { beforeAll, expect, it } from 'vitest';
import { DENIED_PATH, discoverClaude, metaToken, parseClaude } from '../src/attrib/parsers/claude.js';
import type { SnapshotV01 } from '../src/core/snapshot/types.js';
import { formatSummary } from '../src/core/summary.js';
import { buildBasicRepo, type FixtureRepo } from './fixtures/build/basic.js';
import { CANARIES, MAIN_SESSION, SUBAGENT_ID, writeClaudeFixture, type ClaudeFixture } from './fixtures/claude/basic.js';
import { cli } from './fixtures/cli.js';
import { createResult, miniClaude, miniRepo, session } from './fixtures/mini.js';

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

it('metadata fields reject path-shaped values but keep branch names (Qodo #3, Issue #5 case 6)', () => {
  const ok = ['main', 'feature/x', 'session/day1-ideation', 'claude-opus-4-1', 'general-purpose', 'plugin:agent', 'fix/tmp-cleanup',
    // Whole segments only: a home dir glued onto another segment no longer names the dir.
    `x${homedir().slice(1)}`];
  for (const v of ok) expect(metaToken(v), v).toBe(v);
  const home = homedir().slice(1);
  const bad = ['/etc/x', '~/x', 'C:/x', 'c:x', 'a/../b', '..', `x${homedir()}/y`, `x/${home}`, `${home}/y`, `${tmpdir()}/m`,
    `${realpathSync(tmpdir()).slice(1)}/m`, 'tmp/commet-x/y', 'two words'];
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
    '/projects/-unrelated-slug/77777777-7777-4777-8777-777777777777.jsonl',
  ]);
});

it('skips and counts a transcript deleted between discovery and parsing (Qodo #7)', async () => {
  const found = await discoverClaude(join(claude.claudeDir, 'projects'), join(repo.dir, '.git'), [repo.dir]);
  const victim = found.transcripts.find((t) => t.file.endsWith('77777777-7777-4777-8777-777777777777.jsonl'))!;
  rmSync(victim.file);
  const ingest = await parseClaude(found, new Set(), (l) => l);
  expect(ingest.unreadable).toEqual([victim.span]);
  expect(ingest.events.length).toBeGreaterThan(0);
  const summary = formatSummary(JSON.parse(outputs['snapshot']!) as SnapshotV01, { tooLarge: 0, unavailable: 1, dropped: 0, unattributed: 0 });
  expect(summary).toContain('1 transcript(s) skipped (too large 0, unavailable 1); commits during them are never classed human');
});

it('commit subjects carrying private paths are redacted in the snapshot and the summary (Qodo PR8 #4)', async () => {
  const lines = ['export const subjectCanaryOne = 5101;', 'export const subjectCanaryTwo = subjectCanaryOne + 1;'];
  const subject = `fix: copy ${CANARIES.home}/notes.txt and C:\\Users\\canary-win\\notes.txt (from ~/drafts, ${homedir().slice(1)}/x)`;
  const repo = miniRepo([{ id: 'agent', at: '2026-10-10T10:00:00Z', path: 'src/subject.ts', lines, subject }]);
  const s = session('56565656-5656-4565-8565-565656565656', repo.dir);
  const projects = miniClaude({ s: [s.user('u1', '2026-10-10T09:00:00.000Z'), s.call('a2', '2026-10-10T09:30:00.000Z', 'Write', {}),
    s.result('u3', 'a2', '2026-10-10T09:30:01.000Z', createResult(join(repo.dir, 'src/subject.ts'), lines))] });
  const r = await cli(['scan'], repo.dir, { CLAUDE_CONFIG_DIR: dirname(projects) });
  expect(r.code).toBe(0);
  const snapshot = readFileSync(join(repo.dir, '.git/commet/snapshot.json'), 'utf8');
  for (const text of [snapshot, r.out, r.err]) {
    for (const leak of ['canary-home', 'canary-win', 'C:\\', '~/drafts', homedir().slice(1)]) expect(text.includes(leak), leak).toBe(false);
  }
  // The rest of the subject survives, and the commit is still listed.
  const redacted = 'fix: copy <path> and <path> (from <path>, <path>)';
  expect((JSON.parse(snapshot) as SnapshotV01).commits[0]!.subject).toBe(redacted);
  expect(r.out).toContain(redacted.slice(0, 40));
});
