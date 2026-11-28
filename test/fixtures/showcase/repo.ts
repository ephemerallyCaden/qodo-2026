// The showcase fixture repo (live demo L1): an invented app, "harbor", with an invented crew, fixed
// dates and invented agent session logs, scripted so `commet scan` of it shows every planet look, all
// three fog levels, moons and moonlets, the crew, drones, co-change lines and flags, and stale branches.
// Identities, dates and contents are fixed, so its SHAs and the scan come out the same on every machine.
// README.md beside it says what each planet, person, session and branch is for.
import { execFile } from 'node:child_process';
import { mkdirSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface Who { name: string; email: string }

/** You: the captain, `user.email` in the repo's config. */
export const MARA: Who = { name: 'Mara Lindqvist', email: 'mara@example.com' };
/** Theo's canonical identity, and the old address `.mailmap` maps to it. */
export const THEO: Who = { name: 'Theo Park', email: 'theo@example.com' };
export const THEO_ALIAS: Who = { name: 'T. Park', email: 'theo.park@example.org' };
export const JUNO: Who = { name: 'Juno Abara', email: 'juno@example.com' };
export const IRIS: Who = { name: 'Iris Calloway', email: 'iris@example.org' };
export const FELIX: Who = { name: 'Felix Moreau', email: 'felix@example.com' };
export const SANA: Who = { name: 'Sana Whitlock', email: 'sana@example.org' };
/** A release bot: an author, never crew. */
export const BOT: Who = { name: 'release-bot[bot]', email: 'release-bot@example.com' };

/** Every identity that commits, for privacy checks (no email may reach any output). */
export const IDENTITIES: readonly Who[] = [MARA, THEO, THEO_ALIAS, JUNO, IRIS, FELIX, SANA, BOT];
/** The crew's display names: you and five teammates (the bot is left out). */
export const CREW_NAMES = [MARA.name, THEO.name, JUNO.name, IRIS.name, FELIX.name, SANA.name] as const;

export const MAILMAP = `${THEO.name} <${THEO.email}> <${THEO_ALIAS.email}>\n`;

/** The content root the scan is given: `src/*` are the content planets, `docs/` and `scripts/` outer ones. */
export const ROOT = 'src';

// ---- File contents: short invented code, generated in blocks so every line is unique ----

/** One word per five-line block: a file's n-th block is named after WORDS[n]. */
const WORDS = ['Draft', 'Pending', 'Active', 'Archived', 'Shared', 'Cached', 'Batch', 'Remote', 'Local', 'Recent', 'Signed', 'Queued',
  'Retry', 'Expired', 'Primary', 'Backup', 'Daily', 'Weekly', 'Manual', 'Scheduled', 'Public', 'Private', 'Trial', 'Paid', 'Bulk',
  'Single', 'Nested', 'Partial', 'Full', 'Quick', 'Hidden', 'Visible', 'Pinned', 'Muted', 'Starred', 'Linked'];

const lower = (s: string) => s[0]!.toLowerCase() + s.slice(1);

/** Lines of one block, by file kind: source, test or markdown. */
function block(kind: 'ts' | 'test' | 'md', noun: string, word: string, k: number): string[] {
  const n = lower(noun);
  const t = `${noun}${word}`;
  if (kind === 'test') {
    return [
      `test('${n} ${word.toLowerCase()} is empty for a missing id', () => { expect(load${t}('missing')).toBeUndefined(); });`,
      `test('${n} ${word.toLowerCase()} saves and loads', () => { save${t}({ id: 'a', label: 'A' }); expect(load${t}('a')?.label).toBe('A'); });`,
      `test('${n} ${word.toLowerCase()} has a positive limit', () => { expect(${n}${word}Limit).toBeGreaterThan(0); });`,
    ];
  }
  if (kind === 'md') {
    return [
      `## ${word} ${n}s`,
      `The ${word.toLowerCase()} ${n} flow runs before every release.`,
      `- Check the ${word.toLowerCase()} ${n} list with the team that owns it.`,
    ];
  }
  return [
    `export interface ${t} { id: string; label: string }`,
    `const ${n}${word}Store = new Map<string, ${t}>();`,
    `export function load${t}(id: string): ${t} | undefined { return ${n}${word}Store.get(id); }`,
    `export function save${t}(item: ${t}): void { ${n}${word}Store.set(item.id, item); }`,
    `export const ${n}${word}Limit = ${10 + ((k * 7) % 90)};`,
  ];
}

/** Each generated file's noun and kind. Hand-written files (README, package.json, …) aren't here. */
const NOUNS: Record<string, string> = {
  'src/index.ts': 'App',
  'src/core/config.ts': 'Setting', 'src/core/errors.ts': 'Failure', 'src/core/events.ts': 'Event', 'src/core/events.test.ts': 'Event',
  'src/sync/queue.ts': 'Job', 'src/sync/conflict.ts': 'Conflict', 'src/sync/offline.ts': 'Outbox',
  'src/api/server.ts': 'Endpoint', 'src/api/routes/users.ts': 'UserRoute', 'src/api/routes/orders.ts': 'OrderRoute',
  'src/api/routes/login.ts': 'LoginRoute', 'src/api/routes/users.test.ts': 'UserRoute',
  'src/api/schema/users.ts': 'UserShape', 'src/api/schema/orders.ts': 'OrderShape',
  'src/billing/invoice.ts': 'Invoice', 'src/billing/tax.ts': 'TaxRate', 'src/billing/refunds.ts': 'Refund', 'src/billing/invoice.test.ts': 'Invoice',
  'src/legacy/importer.ts': 'ImportRow', 'src/legacy/export.ts': 'ExportRow', 'src/legacy/xml.ts': 'XmlNode',
  'src/legacy/csv.ts': 'CsvRow', 'src/legacy/xml-stream.ts': 'XmlChunk',
  'src/ui/theme.ts': 'Palette', 'src/ui/components/button.ts': 'Button', 'src/ui/components/modal.ts': 'Modal',
  'src/ui/components/table.ts': 'Table', 'src/ui/components/table.test.ts': 'Table', 'src/ui/pages/home.ts': 'HomeCard',
  'src/ui/pages/settings.ts': 'SettingsPane',
  'src/auth/session.ts': 'Session', 'src/auth/session.test.ts': 'Session', 'src/auth/tokens.ts': 'Token', 'src/auth/tokens.test.ts': 'Token',
  'src/auth/password.ts': 'Password', 'src/auth/password.test.ts': 'Password', 'src/auth/roles.ts': 'Role', 'src/auth/roles.test.ts': 'Role',
  'docs/guide.md': 'guide', 'docs/architecture.md': 'module', 'docs/changelog.md': 'release',
  'scripts/release.ts': 'Release', 'scripts/seed.ts': 'Seed',
  'test/e2e/smoke.test.ts': 'Smoke',
};

const kindOf = (path: string) => (path.endsWith('.md') ? 'md' : /\.test\.ts$/.test(path) ? 'test' : 'ts');

// ---- Agent session logs, in the Claude Code v2.1.31x shape of test/fixtures/claude (invented content only) ----

type Row = Record<string, unknown>;

interface SessionLog {
  /** The transcript's file, under the projects dir. */
  file: string;
  rows: Row[];
  base: Row;
  model: string;
  uuid: number;
  meta?: { file: string; agentType: string };
}

export interface ShowcaseRepo {
  dir: string;
  /** `CLAUDE_CONFIG_DIR` for the scan: only this fixture's invented transcripts. */
  claudeDir: string;
  head: string;
  /** The commit the first-run baseline is charted at: everything up to it is seen. */
  baseline: string;
  shas: string[];
}

/**
 * Builds the repo in `<work>/repo` and its agent logs in `<work>/claude`. `work` must be empty or absent; the
 * tests pass a temp dir from test/fixtures/tmp.ts, which resolves symlinks (transcripts name the repo by its real path).
 */
export async function buildShowcaseRepo(work: string): Promise<ShowcaseRepo> {
  mkdirSync(work, { recursive: true });
  if (readdirSync(work).length > 0) throw new Error('buildShowcaseRepo needs an empty folder');
  const dir = join(work, 'repo');
  const claudeDir = join(work, 'claude');
  mkdirSync(dir);
  // No inherited GIT_* variable: GIT_DIR, GIT_WORK_TREE or GIT_INDEX_FILE would point these commands at
  // another repo (Qodo PR #247 c45b5bc3). SHA-1 whatever the machine's init.defaultObjectFormat (ea0b7d05).
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  const git = async (args: string[], env: Record<string, string> = {}) =>
    (await run('git', args, { cwd: dir, encoding: 'utf8', env: { ...clean, ...env } })).stdout.trim();
  await git(['init', '-q', '-b', 'main', '--object-format=sha1']);
  for (const [k, v] of [['user.name', MARA.name], ['user.email', MARA.email], ['commit.gpgsign', 'false'], ['tag.gpgsign', 'false'],
    ['core.autocrlf', 'false']] as const) await git(['config', k, v]);

  // The working tree as lines per file, and how many blocks each generated file has had.
  const files = new Map<string, string[]>();
  const blocks = new Map<string, number>();
  const write = (path: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), files.get(path)!.join('\n') + '\n');
  };
  /** Appends `n` generated blocks to `path` (creating it), and returns the new lines. */
  const grow = (path: string, n: number): string[] => {
    const noun = NOUNS[path];
    if (noun === undefined) throw new Error(`no noun for ${path}`);
    const added: string[] = [];
    for (let i = 0; i < n; i++) {
      const k = blocks.get(path) ?? 0;
      blocks.set(path, k + 1);
      added.push(...block(kindOf(path), noun, WORDS[k % WORDS.length]!, k));
    }
    files.set(path, [...(files.get(path) ?? []), ...added]);
    write(path);
    return added;
  };
  /** Appends one debt marker comment (TODO, FIXME, HACK or XXX). */
  const mark = (path: string, marker: 'TODO' | 'FIXME' | 'HACK' | 'XXX', why: string) => {
    files.set(path, [...files.get(path)!, path.endsWith('.md') ? `${marker}: ${why}` : `// ${marker}: ${why}`]);
    write(path);
  };
  const set = (path: string, lines: string[]) => {
    files.set(path, lines);
    write(path);
  };
  /** Changes the limit in block `k` of a source file to `value`: a changed line, so its diff shows a removal too. */
  const tweak = (path: string, k: number, value: number) => {
    const lines = [...files.get(path)!];
    const i = lines.findIndex((l, j) => j >= k * 5 && /^export const \w+Limit = \d+;$/.test(l));
    if (i < 0) throw new Error(`no limit in block ${k} of ${path}`);
    lines[i] = lines[i]!.replace(/= \d+;$/, `= ${value};`);
    set(path, lines);
  };

  const shas: string[] = [];
  const commit = async (who: Who, date: string, subject: string) => {
    await git(['add', '-A']);
    await git(['commit', '-q', '-m', subject], {
      GIT_AUTHOR_NAME: who.name, GIT_AUTHOR_EMAIL: who.email, GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_NAME: who.name, GIT_COMMITTER_EMAIL: who.email, GIT_COMMITTER_DATE: date,
    });
    const sha = await git(['rev-parse', 'HEAD']);
    shas.push(sha);
    return sha;
  };
  /** Work on another branch from here, then back to main with the working tree as it was. */
  const onBranch = async (name: string, work: () => Promise<void>) => {
    const saved = new Map([...files].map(([p, l]) => [p, [...l]]));
    const savedBlocks = new Map(blocks);
    await git(['switch', '-q', '-c', name]);
    await work();
    await git(['switch', '-q', 'main']);
    files.clear();
    for (const [p, l] of saved) files.set(p, l);
    blocks.clear();
    for (const [p, n] of savedBlocks) blocks.set(p, n);
  };

  // Agent sessions. Each records its edits as the tool results Claude Code logs, at fixed times.
  const sessions: SessionLog[] = [];
  const at = (p: string) => join(dir, p);
  const newSession = (id: string, model: string, branch: string, start: string): SessionLog => {
    const base = { sessionId: id, cwd: dir, gitBranch: branch, version: '2.1.31', userType: 'external', isSidechain: false };
    const s: SessionLog = { file: `projects/-showcase/${id}.jsonl`, rows: [], base, model, uuid: 0 };
    s.rows.push({ ...base, type: 'user', uuid: `${id.slice(0, 4)}-u0`, timestamp: start, message: { role: 'user', content: 'invented prompt' } });
    sessions.push(s);
    return s;
  };
  const subagent = (parent: SessionLog, agentId: string, agentType: string, model: string, start: string): SessionLog => {
    const id = parent.base['sessionId'] as string;
    const base = { ...parent.base, agentId, isSidechain: true };
    const s: SessionLog = { file: `projects/-showcase/${id}/subagents/agent-${agentId}.jsonl`, rows: [], base, model, uuid: 0,
      meta: { file: `projects/-showcase/${id}/subagents/agent-${agentId}.meta.json`, agentType } };
    s.rows.push({ ...base, type: 'user', uuid: `${agentId}-u0`, timestamp: start, message: { role: 'user', content: 'invented subtask' } });
    sessions.push(s);
    return s;
  };
  /** The session edits `path` at `ts`: `n` new blocks (a new file is a Write, an existing one an Edit). */
  const edit = (s: SessionLog, ts: string, path: string, n: number) => {
    const before = files.get(path)?.length ?? 0;
    const created = before === 0;
    const added = grow(path, n);
    const tag = `${String(s.base['agentId'] ?? (s.base['sessionId'] as string).slice(0, 4))}-${++s.uuid}`;
    s.rows.push({ ...s.base, type: 'assistant', uuid: `${tag}a`, timestamp: ts,
      message: { role: 'assistant', model: s.model, content: [{ type: 'tool_use', id: `t-${tag}`, name: created ? 'Write' : 'Edit', input: { file_path: at(path) } }] } });
    const result = created
      ? { type: 'create', filePath: at(path), content: files.get(path)!.join('\n') + '\n', structuredPatch: [] }
      : { filePath: at(path), userModified: false, replaceAll: false,
        structuredPatch: [{ oldStart: before + 1, oldLines: 0, newStart: before + 1, newLines: added.length, lines: added.map((l) => `+${l}`) }] };
    s.rows.push({ ...s.base, type: 'user', uuid: `${tag}r`, parentUuid: `${tag}a`, sourceToolAssistantUUID: `${tag}a`, timestamp: plusSecond(ts),
      toolUseResult: result, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `t-${tag}`, content: 'ok' }] } });
  };
  /** The session's last record: its span ends here. */
  const end = (s: SessionLog, ts: string) => {
    s.rows.push({ ...s.base, type: 'user', uuid: `${String(s.base['agentId'] ?? (s.base['sessionId'] as string).slice(0, 4))}-end`, timestamp: ts,
      message: { role: 'user', content: 'invented follow-up' } });
  };

  // ---- Before the baseline (June to August 2026): the app takes shape ----
  set('.mailmap', MAILMAP.trimEnd().split('\n'));
  set('README.md', ['# harbor', '', 'An invented app for the Commet live demo: accounts, orders, billing and offline sync.', '',
    '## Getting started', '', '- `npm ci`', '- `npm test`']);
  set('package.json', ['{', '  "name": "harbor",', '  "version": "0.1.0",', '  "private": true,', '  "type": "module",', '  "scripts": {',
    '    "build": "tsc",', '    "test": "vitest run"', '  }', '}']);
  set('tsconfig.json', ['{', '  "compilerOptions": {', '    "strict": true,', '    "module": "nodenext",', '    "outDir": "dist"', '  },',
    '  "include": ["src"]', '}']);
  grow('src/index.ts', 2);
  grow('src/core/config.ts', 3);
  grow('src/core/errors.ts', 2);
  await commit(MARA, '2026-06-01T09:00:00Z', 'chore: scaffold harbor');
  grow('src/core/events.ts', 3);
  grow('src/core/events.test.ts', 2);
  grow('src/sync/queue.ts', 5);
  await commit(MARA, '2026-06-03T09:00:00Z', 'feat(core): event bus and the sync job queue');
  grow('src/api/server.ts', 4);
  grow('src/api/routes/users.ts', 4);
  grow('src/api/schema/users.ts', 3);
  await commit(THEO_ALIAS, '2026-06-05T10:00:00Z', 'feat(api): users route and schema');
  grow('src/billing/invoice.ts', 16);
  grow('src/billing/tax.ts', 12);
  grow('src/billing/invoice.test.ts', 3);
  await commit(JUNO, '2026-06-08T11:00:00Z', 'feat(billing): invoices and tax rates');
  grow('src/legacy/importer.ts', 14);
  mark('src/legacy/importer.ts', 'FIXME', 'rows with a BOM are read as a blank first column');
  mark('src/legacy/importer.ts', 'HACK', 'retries the whole file when one row fails');
  grow('src/legacy/export.ts', 12);
  mark('src/legacy/export.ts', 'TODO', 'stream instead of building the whole file in memory');
  mark('src/legacy/export.ts', 'XXX', 'dates are written in the server time zone');
  await commit(FELIX, '2026-06-10T14:00:00Z', 'feat(legacy): port the old importer and exporter');
  grow('src/ui/theme.ts', 3);
  grow('src/ui/components/button.ts', 4);
  grow('src/ui/components/modal.ts', 4);
  await commit(IRIS, '2026-06-12T13:00:00Z', 'feat(ui): theme, button and modal');
  grow('src/auth/session.ts', 4);
  grow('src/auth/session.test.ts', 2);
  grow('src/api/routes/login.ts', 3);
  await commit(MARA, '2026-06-15T09:30:00Z', 'feat(auth): sessions and the login route');
  grow('docs/guide.md', 4);
  grow('docs/architecture.md', 4);
  await commit(SANA, '2026-06-18T15:00:00Z', 'docs: user guide and architecture notes');
  grow('src/api/routes/users.ts', 2);
  grow('src/api/schema/users.ts', 1);
  grow('src/api/routes/users.test.ts', 2);
  await commit(THEO, '2026-06-20T10:00:00Z', 'feat(api): paging for users');
  grow('src/ui/components/table.ts', 6);
  grow('src/ui/pages/home.ts', 5);
  await commit(IRIS, '2026-06-24T13:00:00Z', 'feat(ui): table and the home page');
  grow('src/legacy/xml.ts', 10);
  mark('src/legacy/xml.ts', 'FIXME', 'namespaces are dropped on import');
  grow('src/legacy/importer.ts', 1);
  await commit(FELIX, '2026-06-27T14:00:00Z', 'feat(legacy): xml import');
  grow('src/auth/tokens.ts', 4);
  grow('src/auth/tokens.test.ts', 3);
  grow('src/auth/session.ts', 1);
  await commit(MARA, '2026-07-01T09:00:00Z', 'feat(auth): refresh tokens');
  grow('src/billing/refunds.ts', 14);
  grow('src/billing/invoice.ts', 2);
  grow('src/billing/tax.ts', 2);
  await commit(JUNO, '2026-07-03T11:00:00Z', 'feat(billing): refunds');
  grow('src/sync/queue.ts', 2);
  grow('src/core/events.ts', 1);
  grow('src/sync/conflict.ts', 6);
  mark('src/sync/conflict.ts', 'TODO', 'merge edits to the same field instead of keeping the newest');
  await commit(MARA, '2026-07-07T09:00:00Z', 'feat(sync): conflict handling');
  grow('scripts/release.ts', 3);
  grow('scripts/seed.ts', 2);
  grow('docs/changelog.md', 3);
  await commit(SANA, '2026-07-10T15:00:00Z', 'chore: release and seed scripts');
  grow('src/api/routes/orders.ts', 5);
  grow('src/api/schema/orders.ts', 3);
  set('test/fixtures/orders.json', ['[', '  { "id": "o1", "status": "open", "total": 1200 },', '  { "id": "o2", "status": "paid", "total": 450 }', ']']);
  await commit(THEO, '2026-07-14T10:00:00Z', 'feat(api): orders');
  grow('src/auth/password.ts', 4);
  grow('src/auth/password.test.ts', 2);
  grow('src/auth/roles.ts', 3);
  grow('src/auth/roles.test.ts', 2);
  await commit(MARA, '2026-07-16T09:00:00Z', 'feat(auth): passwords and roles, with tests');
  grow('src/ui/pages/settings.ts', 5);
  grow('src/ui/components/table.test.ts', 2);
  await commit(IRIS, '2026-07-20T13:00:00Z', 'feat(ui): settings page');
  // An abandoned branch: two commits in July, never merged.
  await onBranch('feature/csv-export', async () => {
    grow('src/legacy/csv.ts', 4);
    grow('src/legacy/export.ts', 1);
    await commit(FELIX, '2026-07-22T14:00:00Z', 'wip: csv export');
    grow('src/legacy/csv.ts', 2);
    mark('src/legacy/csv.ts', 'TODO', 'quote fields that hold a comma');
    await commit(FELIX, '2026-07-28T14:00:00Z', 'wip: csv quoting');
  });
  grow('src/legacy/export.ts', 2);
  mark('src/legacy/export.ts', 'HACK', 'pads every row to 80 columns for the old reader');
  grow('src/legacy/xml.ts', 1);
  await commit(FELIX, '2026-07-24T14:00:00Z', 'fix(legacy): fixed-width rows for the old reader');
  grow('src/sync/offline.ts', 6);
  grow('src/sync/queue.ts', 2);
  grow('src/core/events.ts', 1);
  await commit(MARA, '2026-07-30T09:00:00Z', 'feat(sync): offline outbox');
  set('test/fixtures/users.json', ['[', '  { "id": "u1", "name": "Test User", "role": "admin" },', '  { "id": "u2", "name": "Second User", "role": "viewer" }', ']']);
  grow('src/billing/invoice.test.ts', 1);
  await commit(JUNO, '2026-08-04T11:00:00Z', 'test(billing): invoice cases and user fixtures');
  grow('src/auth/session.ts', 1);
  grow('src/api/routes/login.ts', 1);
  await commit(MARA, '2026-08-10T09:00:00Z', 'feat(auth): remember me');
  grow('docs/architecture.md', 2);
  set('README.md', [...files.get('README.md')!, '', '## Layout', '', '- `src/` holds one folder per area; `docs/` the guides.']);
  await commit(SANA, '2026-08-15T15:00:00Z', 'docs: layout overview');
  grow('src/api/server.ts', 1);
  grow('src/api/routes/orders.ts', 1);
  await commit(THEO, '2026-08-20T10:00:00Z', 'feat(api): order totals');
  grow('test/e2e/smoke.test.ts', 2);
  const baseline = await commit(MARA, '2026-08-27T09:00:00Z', 'test: end-to-end smoke test');

  // ---- After the baseline (September to November): teammates' and agents' changes, still unreviewed ----
  grow('src/api/routes/users.ts', 1);
  grow('src/api/schema/users.ts', 1);
  grow('src/api/routes/users.test.ts', 1);
  tweak('src/api/routes/users.ts', 0, 25);
  await commit(THEO_ALIAS, '2026-09-10T10:00:00Z', 'feat(api): user avatars');
  grow('src/billing/invoice.ts', 1);
  grow('src/billing/tax.ts', 1);
  mark('src/billing/tax.ts', 'TODO', 'round per line, not per invoice, for the new tax rules');
  tweak('src/billing/invoice.ts', 2, 60);
  await commit(JUNO, '2026-09-18T11:00:00Z', 'fix(billing): tax rounding');
  // Merged but never deleted: the branch still points at the fix, which main has.
  await git(['branch', 'fix/tax-rounding']);
  // An orphaned agent branch: a session's cleanup, committed on its own branch and never merged.
  await onBranch('claude/legacy-cleanup', async () => {
    const s6 = newSession('c6a1e000-0000-4000-8000-000000000006', 'claude-sonnet-4-5', 'claude/legacy-cleanup', '2026-09-20T10:00:00.000Z');
    edit(s6, '2026-09-20T10:05:00.000Z', 'src/legacy/xml.ts', 2);
    edit(s6, '2026-09-20T10:20:00.000Z', 'src/legacy/xml-stream.ts', 4);
    await commit(MARA, '2026-09-20T10:30:00Z', 'refactor(legacy): stream xml parsing');
    edit(s6, '2026-09-20T10:50:00.000Z', 'src/legacy/xml-stream.ts', 1);
    await commit(MARA, '2026-09-20T11:00:00Z', 'refactor(legacy): chunked reads');
    end(s6, '2026-09-20T11:10:00.000Z');
  });
  grow('src/ui/theme.ts', 1);
  grow('src/ui/components/button.ts', 1);
  tweak('src/ui/components/button.ts', 1, 32);
  await commit(IRIS, '2026-10-02T13:00:00Z', 'feat(ui): dark theme buttons');

  // Orders work by an agent with a subagent, then a small change of your own while its log covers the time.
  const s1 = newSession('a1b2c300-0000-4000-8000-000000000001', 'claude-opus-4-5', 'main', '2026-10-06T09:00:00.000Z');
  edit(s1, '2026-10-06T09:12:00.000Z', 'src/api/routes/orders.ts', 2);
  edit(s1, '2026-10-06T09:30:00.000Z', 'src/api/schema/orders.ts', 1);
  const s1sub = subagent(s1, 'b7e1', 'general-purpose', 'claude-haiku-4-5', '2026-10-06T09:40:00.000Z');
  edit(s1sub, '2026-10-06T09:55:00.000Z', 'src/api/routes/users.test.ts', 1);
  end(s1sub, '2026-10-06T10:15:00.000Z');
  edit(s1, '2026-10-06T10:20:00.000Z', 'src/api/routes/orders.ts', 1);
  await commit(MARA, '2026-10-06T10:40:00Z', 'feat(api): order status filters');
  grow('src/api/routes/login.ts', 1);
  await commit(MARA, '2026-10-06T11:00:00Z', 'fix(api): login rate limit');
  end(s1, '2026-10-06T11:30:00.000Z');

  const s2 = newSession('a1b2c300-0000-4000-8000-000000000002', 'claude-sonnet-4-5', 'main', '2026-10-14T13:00:00.000Z');
  edit(s2, '2026-10-14T13:20:00.000Z', 'src/sync/queue.ts', 2);
  edit(s2, '2026-10-14T14:05:00.000Z', 'src/sync/offline.ts', 2);
  edit(s2, '2026-10-14T14:50:00.000Z', 'src/sync/queue.ts', 1);
  await commit(MARA, '2026-10-14T15:00:00Z', 'feat(sync): retry with backoff');
  end(s2, '2026-10-14T15:40:00.000Z');

  const s3 = newSession('a1b2c300-0000-4000-8000-000000000003', 'claude-opus-4-5', 'main', '2026-10-22T09:00:00.000Z');
  edit(s3, '2026-10-22T09:30:00.000Z', 'src/ui/components/table.ts', 2);
  edit(s3, '2026-10-22T10:10:00.000Z', 'src/ui/pages/settings.ts', 1);
  edit(s3, '2026-10-22T10:45:00.000Z', 'src/ui/components/table.test.ts', 1);
  edit(s3, '2026-10-22T11:15:00.000Z', 'src/ui/components/table.ts', 1);
  await commit(MARA, '2026-10-22T11:30:00Z', 'feat(ui): sortable tables');
  end(s3, '2026-10-22T12:00:00.000Z');

  grow('src/legacy/export.ts', 1);
  mark('src/legacy/export.ts', 'HACK', 'skips rows the old reader rejects instead of fixing them');
  tweak('src/legacy/export.ts', 3, 80);
  await commit(FELIX, '2026-10-28T14:00:00Z', 'fix(legacy): hotfix the export for the old reader');

  const s4 = newSession('a1b2c300-0000-4000-8000-000000000004', 'claude-sonnet-4-5', 'main', '2026-11-03T10:00:00.000Z');
  edit(s4, '2026-11-03T10:15:00.000Z', 'src/auth/tokens.ts', 2);
  edit(s4, '2026-11-03T10:50:00.000Z', 'src/auth/tokens.test.ts', 2);
  edit(s4, '2026-11-03T11:30:00.000Z', 'src/auth/session.ts', 1);
  await commit(MARA, '2026-11-03T12:00:00Z', 'feat(auth): rotate refresh tokens');
  end(s4, '2026-11-03T12:30:00.000Z');

  grow('docs/guide.md', 1);
  grow('docs/changelog.md', 1);
  await commit(SANA, '2026-11-05T15:00:00Z', 'docs: offline mode in the guide');

  const s5 = newSession('a1b2c300-0000-4000-8000-000000000005', 'claude-haiku-4-5', 'main', '2026-11-10T16:00:00.000Z');
  const readme = files.get('README.md')!;
  set('README.md', [...readme, '', '## Offline mode', '', 'Changes made offline wait in the outbox and sync when the app reconnects.']);
  s5.rows.push(...editRows(s5, '2026-11-10T16:10:00.000Z', at('README.md'), readme.length, files.get('README.md')!.slice(readme.length)));
  edit(s5, '2026-11-10T16:25:00.000Z', 'src/index.ts', 1);
  const pkg = files.get('package.json')!;
  set('package.json', [...pkg.slice(0, 7), '    "lint": "eslint .",', ...pkg.slice(7)]);
  s5.rows.push(...editRows(s5, '2026-11-10T16:35:00.000Z', at('package.json'), 7, ['    "lint": "eslint .",']));
  await commit(MARA, '2026-11-10T16:50:00Z', 'chore: lint script and offline notes');
  end(s5, '2026-11-10T17:00:00.000Z');

  // Users route without its schema: usually they change together, so the schema gets a missing-pair flag.
  grow('src/api/routes/users.ts', 1);
  tweak('src/api/routes/users.ts', 2, 40);
  await commit(THEO, '2026-11-12T10:00:00Z', 'feat(api): user search');
  set('package.json', files.get('package.json')!.map((l) => (l === '  "version": "0.1.0",' ? '  "version": "0.2.0",' : l)));
  await commit(BOT, '2026-11-14T08:00:00Z', 'chore(release): 0.2.0');
  grow('src/ui/pages/home.ts', 1);
  tweak('src/ui/pages/home.ts', 0, 12);
  const head = await commit(IRIS, '2026-11-18T13:00:00Z', 'feat(ui): home page activity card');

  // The logs: every transcript (and subagent meta) written with its last record's time as its mtime.
  for (const s of sessions) {
    const file = join(claudeDir, s.file);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, s.rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const last = new Date(String(s.rows.at(-1)!['timestamp']));
    utimesSync(file, last, last);
    if (s.meta) writeFileSync(join(claudeDir, s.meta.file), JSON.stringify({ agentType: s.meta.agentType }));
  }
  return { dir, claudeDir, head, baseline, shas };
}

/** An Edit's call and result rows for hand-written lines inserted after line `after` (README, package.json). */
function editRows(s: SessionLog, ts: string, filePath: string, after: number, lines: string[]): Row[] {
  const tag = `${(s.base['sessionId'] as string).slice(0, 4)}-${++s.uuid}`;
  return [
    { ...s.base, type: 'assistant', uuid: `${tag}a`, timestamp: ts,
      message: { role: 'assistant', model: s.model, content: [{ type: 'tool_use', id: `t-${tag}`, name: 'Edit', input: { file_path: filePath } }] } },
    { ...s.base, type: 'user', uuid: `${tag}r`, parentUuid: `${tag}a`, sourceToolAssistantUUID: `${tag}a`, timestamp: plusSecond(ts),
      toolUseResult: { filePath, userModified: false, replaceAll: false,
        structuredPatch: [{ oldStart: after + 1, oldLines: 0, newStart: after + 1, newLines: lines.length, lines: lines.map((l) => `+${l}`) }] },
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `t-${tag}`, content: 'ok' }] } },
  ];
}

/** `2026-…T10:05:00.000Z` one second later (the tool result follows its call). */
function plusSecond(ts: string): string {
  return ts.replace(/:00\.000Z$/, ':01.000Z');
}
