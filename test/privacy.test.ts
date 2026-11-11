import { readFileSync, realpathSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { beforeAll, expect, it } from 'vitest';
import { DENIED_PATH, discoverClaude, metaToken, parseClaude, redactPaths } from '../src/attrib/parsers/claude.js';
import { main } from '../src/cli/main.js';
import type { SnapshotV02 } from '../src/core/snapshot/types.js';
import { formatSummary } from '../src/core/summary.js';
import { buildBasicRepo, type FixtureRepo } from './fixtures/build/basic.js';
import { CANARIES, MAIN_SESSION, SUBAGENT_ID, writeClaudeFixture, type ClaudeFixture } from './fixtures/claude/basic.js';
import { cli } from './fixtures/cli.js';
import { createResult, miniClaude, miniRepo, session } from './fixtures/mini.js';
import { tempDir } from './fixtures/tmp.js';

let repo: FixtureRepo;
let claude: ClaudeFixture;
let outputs: Record<string, string>;

beforeAll(async () => {
  repo = await buildBasicRepo();
  claude = writeClaudeFixture(repo, { fileSymlink: true });
  const r = await cli(['scan'], repo.dir, { CLAUDE_CONFIG_DIR: claude.claudeDir });
  expect(r.code).toBe(0);
  outputs = { snapshot: readFileSync(join(repo.dir, '.git/commet/snapshot.json'), 'utf8'),
    layout: readFileSync(join(repo.dir, '.git/commet/layout.json'), 'utf8'), stdout: r.out, stderr: r.err };
});

it('fixture still plants every canary (guards against a vacuous pass)', () => {
  const planted = claude.transcripts.map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const canary of Object.values(CANARIES)) expect(planted).toContain(canary);
  expect(planted).toContain(`"cwd":"${repo.dir}"`);
});

it('no canary, cwd or absolute path reaches the snapshot, the layout, stdout or stderr', () => {
  const forbidden = [...Object.values(CANARIES), repo.dir, claude.claudeDir, homedir(), tmpdir()];
  for (const [name, text] of Object.entries(outputs)) {
    for (const f of forbidden) expect(text.includes(f), `${name} contains ${f}`).toBe(false);
  }
});

it('sessions[].files holds only f_ ids; other edited paths are counted, never named (#80)', () => {
  const snap = JSON.parse(outputs['snapshot']!) as SnapshotV02;
  const ids = new Set(snap.files.map((f) => f.id));
  const withFiles = snap.sessions.filter((s) => s.files.length > 0);
  expect(withFiles.length).toBeGreaterThan(0);
  for (const s of snap.sessions) {
    for (const id of s.files) expect(id, id).toMatch(/^f_/);
    for (const id of s.files) expect(ids.has(id), id).toBe(true);
    expect(s.files).toEqual([...new Set(s.files)].sort());
    expect(s.filesTouched).toBe(s.files.length + s.filesOutside);
  }
  // The canary-named edit is in the repo but not in the snapshot; the outside-the-repo one is dropped.
  expect(snap.sessions.some((s) => s.filesOutside > 0)).toBe(true);
  expect(outputs['snapshot']).not.toContain(CANARIES.editedFile);
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
  const summary = formatSummary(JSON.parse(outputs['snapshot']!) as SnapshotV02, { tooLarge: 0, unavailable: 1, dropped: 0, unattributed: 0,
    incompletePatches: 0 });
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
  expect((JSON.parse(snapshot) as SnapshotV02).commits[0]!.subject).toBe(redacted);
  expect(r.out).toContain(redacted.slice(0, 40));
});

it('absolute, ~, drive-letter and UNC paths are redacted anywhere inside a subject word (Qodo PR10 #7)', () => {
  const cases: [string, string][] = [
    ['build --prefix=/home/alice/app', 'build --prefix=<path>'], ['see path:/Users/bob/x.', 'see path:<path>.'],
    ['read file=/etc/secret', 'read file=<path>'], ['dir=C:\\Users\\carol\\x', 'dir=<path>'], ['share=\\\\host\\s\\x', 'share=<path>'],
    ['cfg=~/notes', 'cfg=<path>'], ['(see:/opt/dave/x)', '(see:<path>)'], ['a,/srv/erin/y', 'a,<path>'],
  ];
  for (const [subject, want] of cases) expect(redactPaths(subject), subject).toBe(want);
  // Plain relative paths, ratios and times are not paths.
  for (const keep of ['fix src/x.ts and lib/y', 'and/or', 'at 12:30', 'a:b/c', 'v1.2/3']) expect(redactPaths(keep), keep).toBe(keep);
});

it('an absolute path starting anywhere inside a subject word is redacted, only its suffix (Qodo local #2)', () => {
  const cases: [string, string][] = [
    ['fix-/Users/alice/private.txt', 'fix-<path>'], ['see_/home/bob/x', 'see_<path>'], ['x+/etc/secret,', 'x+<path>,'],
    ['note#~/drafts', 'note#<path>'], ['fix-C:\\Users\\carol\\x', 'fix-<path>'], ['fix.\\\\host\\s\\x', 'fix.<path>'],
    ['fix./Users/dave/x', 'fix.<path>'],
  ];
  for (const [subject, want] of cases) expect(redactPaths(subject), subject).toBe(want);
  // Relative paths (including ./ and ../ prefixes), ratios and times are kept.
  for (const keep of ['src/x.ts', 'and/or', '12:30', 'a/b', './scripts/run.sh', '../shared/lib', 'a/../b', 'v1.2/3']) {
    expect(redactPaths(keep), keep).toBe(keep);
  }
});

it('author names carrying private paths are redacted in people[].displayName (Qodo local #3)', async () => {
  const repo = miniRepo([{ id: 'root', at: '2026-10-10T08:00:00Z', path: 'README.md', lines: ['# Author fixture', 'An odd author name.'],
    author: { name: 'Eve C:\\Users\\canary-eve (/home/canary-eve/bin)', email: 'eve@example.com' } }]);
  const r = await cli(['scan'], repo.dir, { CLAUDE_CONFIG_DIR: tempDir('commet-author-claude-') });
  expect(r.code).toBe(0);
  const snapshot = readFileSync(join(repo.dir, '.git/commet/snapshot.json'), 'utf8');
  for (const text of [snapshot, r.out, r.err]) expect(text.includes('canary-eve'), 'canary-eve').toBe(false);
  expect((JSON.parse(snapshot) as SnapshotV02).people.map((p) => p.displayName)).toEqual(['Eve <path> (<path>)']);
});

it('named-user home paths (~alice/…) are redacted in subjects and names (Qodo local r2 #2)', () => {
  const cases: [string, string][] = [
    ['copy ~alice/secret.txt', 'copy <path>'], ['see:~bob/x,', 'see:<path>,'], ['fix-~carol.d/y', 'fix-<path>'], ['~dave', '<path>'],
  ];
  for (const [text, want] of cases) expect(redactPaths(text), text).toBe(want);
  for (const keep of ['about ~5% faster', 'a~b/c']) expect(redactPaths(keep), keep).toBe(keep);
});

it('a hook event keeps no prompt, code, command, cwd or absolute path: only hashes and allowlisted tokens reach events.jsonl (#77)', async () => {
  const repo = miniRepo([{ id: 'root', at: '2026-10-10T08:00:00Z', path: 'src/hooked.ts', lines: ['export const hookedValue = 1;'] }]);
  try {
    const sid = '5a5a5a5a-5a5a-45a5-85a5-5a5a5a5a5a5a';
    const file = join(repo.dir, 'src/hooked.ts');
    const payload = {
      session_id: sid, transcript_path: `${CANARIES.home}/.claude/projects/-slug/${sid}.jsonl`, cwd: repo.dir, permission_mode: 'default',
      hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_use_id: 'toolu_01Canary', prompt: CANARIES.prompt, last_prompt: CANARIES.lastPrompt,
      agent_id: 'a1b2', agent_type: `${CANARIES.home}/${CANARIES.metaAgentType}`,
      tool_input: { file_path: file, old_string: CANARIES.originalFile, new_string: CANARIES.code, command: CANARIES.command, description: CANARIES.description },
      tool_response: { filePath: file, oldString: CANARIES.originalFile, newString: CANARIES.code, originalFile: `${CANARIES.originalFile}\n${CANARIES.code}`,
        userModified: false, replaceAll: false, attachment: CANARIES.attachment,
        structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: [`-${CANARIES.prompt} old line`, `+${CANARIES.code}`, '+export const hookedValue = 2;'] }] },
    };
    let out = '';
    let err = '';
    const code = await main(['hook', 'event'], { stdout: (t) => (out += t), stderr: (t) => (err += t), cwd: repo.dir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: repo.dir }, stdin: Readable.from([JSON.stringify(payload)]) });
    expect(code).toBe(0);
    const events = readFileSync(join(repo.dir, '.git/commet/events.jsonl'), 'utf8');
    // Not vacuous: the edit was recorded, with its added and removed lines as hashes.
    const [event] = events.trim().split('\n').map((l) => JSON.parse(l) as { path: string; hunks: { addedHashes: string[]; removedHashes: string[] }[] });
    expect(event!.path).toBe('src/hooked.ts');
    expect(event!.hunks[0]!.addedHashes).toHaveLength(2);
    expect(event!.hunks[0]!.removedHashes).toHaveLength(1);
    const forbidden = [...Object.values(CANARIES), repo.dir, homedir(), tmpdir(), sid, 'toolu_01Canary', 'hookedValue', 'a1b2'];
    for (const [name, text] of Object.entries({ events, out, err })) {
      for (const f of forbidden) expect(text.includes(f), `${name} contains ${f}`).toBe(false);
    }
    const strings: string[] = [];
    JSON.parse(events, (_k, v: unknown) => (typeof v === 'string' && strings.push(v), v));
    expect(strings.filter((s) => /^([A-Za-z]:\\|\/|~)/.test(s))).toEqual([]);
  } finally {
    rmSync(repo.dir, { recursive: true, force: true });
  }
});
