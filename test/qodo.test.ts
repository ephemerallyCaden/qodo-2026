// Issue #17: opt-in Qodo findings as a code-health input. One describe per acceptance criterion.
// `gh` and `qodo` are fake binaries on an isolated PATH, so no test touches the network.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FileQodo, SnapshotV02 } from '../src/core/snapshot/types.js';
import { formatSummary } from '../src/core/summary.js';
import { scan } from '../src/scan/index.js';
import { cli } from './fixtures/cli.js';
import { SELF } from './fixtures/build/basic.js';
import { miniRepo, type MiniRepo } from './fixtures/mini.js';

const NO_LOGS = mkdtempSync(join(tmpdir(), 'commet-qodo-claude-'));
const REAL_GIT = realpathSync(execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim());

// Finding text Commet must never keep: titles, descriptions, URLs, snippets, error output.
const CANARY = {
  title: 'qodo-canary-title-5e1d', description: 'qodo-canary-description-9b2c', url: 'qodo-canary-url-77a0',
  snippet: 'qodo-canary-snippet-3f4e', stderr: 'qodo-canary-stderr-c0de', home: 'qodo-canary-home-1a2b',
};
const PR = (n: number) => `https://github.com/acme/widgets/pull/${n}`;

type Finding = { id: string; status: string; level: string; path: string | null };
const finding = ({ id, status, level, path }: Finding) => ({
  id, attribution_status: status, action_level: level, title: `${CANARY.title} ${id}`, description: `${CANARY.description} ${id}`,
  category: 'Correctness', git_sha: 'a'.repeat(40),
  location: path === null ? null : { file_path: path, start_line: 3, end_line: 4, side: 'right', snippet: CANARY.snippet },
  evidence: { citations: [{ source_type: 'web', source: `https://example.com/${CANARY.url}` }] },
});
const session = (n: number, status = 'completed', complete = true) =>
  ({ run_id: n, status, commit_sha: 'b'.repeat(40), started_at: '2026-10-05T10:00:00Z', review_complete: complete });
const response = (n: number, findings: Finding[] | null, extra: object = {}) => ({
  pr_url: PR(n), git_provider: null, finding_count: findings?.length ?? 0, review_session: findings === null ? null : session(n),
  findings: (findings ?? []).map(finding), ...extra,
});

/**
 * The fixture's PRs: #3 is closed unmerged (never fetched, but counted), #4 has no review yet and #5's
 * review is still running, so the files they change are unknown.
 */
const PRS = [{ number: 1, url: PR(1), state: 'MERGED' }, { number: 2, url: PR(2), state: 'OPEN' },
  { number: 3, url: PR(3), state: 'CLOSED' }, { number: 4, url: PR(4), state: 'MERGED' }, { number: 5, url: PR(5), state: 'OPEN' }];
/** `gh pr view --json files,changedFiles` for the PRs without a complete review. */
const VIEWS: Record<number, object> = {
  4: { changedFiles: 2, files: [{ path: 'README.md', additions: 1, deletions: 0, changeType: 'MODIFIED' },
    { path: 'src/gone.ts', additions: 1, deletions: 0, changeType: 'ADDED' }] },
  5: { changedFiles: 1, files: [{ path: 'src/new.ts', additions: 1, deletions: 0, changeType: 'MODIFIED' }] },
};
const FINDINGS: Record<number, object> = {
  1: response(1, [
    { id: 'f1', status: 'pending', level: 'action_required', path: 'src/a.ts' },
    { id: 'f2', status: 'implemented', level: 'action_required', path: 'src/a.ts' },
    { id: 'f3', status: 'partial_implementation', level: 'informational', path: 'src/a.ts' },
    { id: 'f4', status: 'dismissed', level: 'remediation_recommended', path: 'src/b.ts' },
    { id: 'f5', status: 'not_implemented', level: 'remediation_recommended', path: 'src/b.ts' },
    // Renamed since (src/old.ts → src/new.ts), never at HEAD, an absolute path, and no file at all.
    { id: 'f6', status: 'pending', level: 'action_required', path: 'src/old.ts' },
    { id: 'f7', status: 'pending', level: 'action_required', path: 'src/gone.ts' },
    { id: 'f8', status: 'pending', level: 'informational', path: `/Users/${CANARY.home}/src/a.ts` },
    { id: 'f9', status: 'pending', level: 'informational', path: null },
  ]),
  2: response(2, [
    { id: 'g1', status: 'focus_areas_edited', level: 'remediation_recommended', path: 'src/a.ts' },
    { id: 'g2', status: 'outdated', level: 'action_required', path: 'src/b.ts' },
    { id: 'g3', status: 'detected_after_merge', level: 'action_required', path: 'src/b.ts' },
    { id: 'g4', status: 'full_implementation', level: 'action_required', path: 'src/b.ts' },
    // A status or level Commet doesn't know: counted open (never assumed fixed), level `other`.
    { id: 'g5', status: 'brand_new_status', level: 'brand_new_level', path: 'src/a.ts' },
    // The same finding listed again is counted once.
    { id: 'f1', status: 'pending', level: 'action_required', path: 'src/a.ts' },
  ]),
  3: response(3, [{ id: 'h1', status: 'pending', level: 'action_required', path: 'src/a.ts' }]),
  4: response(4, null),
  // Running, with no findings yet: not a clean review (Qodo local r1 #2).
  5: response(5, [], { review_session: session(5, 'running', false) }),
};
const levels = (actionRequired: number, remediationRecommended: number, informational: number, other: number) =>
  ({ actionRequired, remediationRecommended, informational, other });

interface Stubs { bin: string; log: string; calls: () => { tool: string; args: string[] }[] }

/**
 * An isolated PATH holding real git and, unless left out, fake `gh` and `qodo`. Each fake logs its
 * argv. `gh` prints `prs`; `qodo` prints the findings for its `--pr-url`. `fail` replaces a fake's
 * body with a Node snippet (it may use `log` and `args`).
 */
function stubs(o: { prs?: unknown; findings?: Record<number, unknown>; views?: Record<number, unknown>; omit?: ('gh' | 'qodo')[]; fail?: Partial<Record<'gh' | 'qodo', string>> } = {}): Stubs {
  const bin = mkdtempSync(join(tmpdir(), 'commet-qodo-bin-'));
  const log = join(bin, 'calls.jsonl');
  symlinkSync(REAL_GIT, join(bin, 'git'));
  const data = join(bin, 'data.json');
  writeFileSync(data, JSON.stringify({ prs: o.prs ?? PRS, findings: o.findings ?? FINDINGS, views: o.views ?? VIEWS }));
  const head = (tool: string) => `#!${process.execPath}\nconst fs = require('node:fs');\nconst args = process.argv.slice(2);\n`
    + `fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ tool: ${JSON.stringify(tool)}, args }) + '\\n');\n`
    + `const data = JSON.parse(fs.readFileSync(${JSON.stringify(data)}, 'utf8'));\n`;
  const body = {
    gh: 'process.stdout.write(JSON.stringify(args[1] === "view" ? data.views[args[2].split("/").pop()] : data.prs));\n',
    qodo: 'const url = args[args.indexOf("--pr-url") + 1];\nprocess.stdout.write(JSON.stringify(data.findings[url.split("/").pop()]));\n'
      + `process.stderr.write("  trace ${CANARY.stderr}\\n");\n`,
  };
  for (const tool of ['gh', 'qodo'] as const) {
    if (o.omit?.includes(tool)) continue;
    writeFileSync(join(bin, tool), head(tool) + (o.fail?.[tool] ?? body[tool]), { mode: 0o755 });
  }
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { tool: string; args: string[] }) : []);
  return { bin, log, calls };
}

/** Runs `fn` with PATH set to the stub dir only. */
async function onPath<T>(s: Stubs, fn: () => Promise<T>): Promise<T> {
  const path = process.env['PATH'];
  process.env['PATH'] = s.bin;
  try {
    return await fn();
  } finally {
    process.env['PATH'] = path;
  }
}

const buildRepo = () => {
  const repo = miniRepo([
    { id: 'readme', at: '2026-10-01T10:00:00Z', path: 'README.md', lines: ['# Widgets', 'A fixture.'] },
    { id: 'a', at: '2026-10-02T10:00:00Z', path: 'src/a.ts', lines: ['export const a = 1;', 'export const a2 = a + 1;'] },
    { id: 'b', at: '2026-10-03T10:00:00Z', path: 'src/b.ts', lines: ['export const b = 2;', 'export const b2 = b + 1;'] },
    { id: 'old', at: '2026-10-04T10:00:00Z', path: 'src/old.ts', lines: ['export const old = 3;', 'export const old2 = old + 1;'] },
  ]);
  commit(repo, '2026-10-05T10:00:00Z', ['mv', 'src/old.ts', 'src/new.ts'], 'refactor: rename old to new');
  return repo;
};
/** Runs one git change in `repo` and commits it at `at`. */
function commit(repo: MiniRepo, at: string, change: string[], subject: string): void {
  const env = { ...process.env, GIT_AUTHOR_NAME: SELF.name, GIT_AUTHOR_EMAIL: SELF.email, GIT_AUTHOR_DATE: at,
    GIT_COMMITTER_NAME: SELF.name, GIT_COMMITTER_EMAIL: SELF.email, GIT_COMMITTER_DATE: at };
  execFileSync('git', change, { cwd: repo.dir, env });
  execFileSync('git', ['commit', '-q', '-m', subject], { cwd: repo.dir, env });
}

const CACHE = (repo: MiniRepo) => join(repo.dir, '.git/commet/qodo-findings.json');
const SNAPSHOT = (repo: MiniRepo) => join(repo.dir, '.git/commet/snapshot.json');
const scanCli = (repo: MiniRepo, args: string[] = []) => cli(['scan', '--no-ingest', ...args], repo.dir, { CLAUDE_CONFIG_DIR: NO_LOGS });
const readSnap = (repo: MiniRepo) => JSON.parse(readFileSync(SNAPSHOT(repo), 'utf8')) as SnapshotV02;
const qodoOf = (s: SnapshotV02) => Object.fromEntries(s.files.map((f) => [f.path, f.qodo]));
const open = (byLevel: ReturnType<typeof levels>): FileQodo => ({ open: Object.values(byLevel).reduce((a, b) => a + b, 0), byLevel });

let repo: MiniRepo;
beforeEach(() => {
  repo = buildRepo();
});

describe('#17 AC1: --with-qodo is off by default and the default scan spawns no qodo or gh', () => {
  it('without the flag no qodo or gh process runs, and every file is unknown', async () => {
    const s = stubs();
    const r = await onPath(s, () => scanCli(repo));
    expect(r.code).toBe(0);
    expect(s.calls()).toEqual([]);
    const snap = readSnap(repo);
    expect(snap.qodo).toEqual({ status: 'none' });
    expect(snap.files.map((f) => f.qodo)).toEqual([null, null, null, null]);
    expect(existsSync(CACHE(repo))).toBe(false);
    expect(r.out).toContain('qodo findings: not read (opt in with --with-qodo)');
  });

  it('the stubs are live: the same PATH with the flag does run them (guards against a vacuous pass)', async () => {
    const s = stubs();
    expect((await onPath(s, () => scanCli(repo, ['--with-qodo']))).code).toBe(0);
    expect(s.calls().length).toBeGreaterThan(0);
  });

  it('a scan() call without qodo options reads no cache and spawns nothing', async () => {
    const s = stubs();
    const { snapshot } = await onPath(s, () => scan({ repoDir: repo.dir, windowMonths: 24, ingest: false,
      claudeProjectsDir: join(NO_LOGS, 'projects'), keyFor: () => new Uint8Array(32).fill(7) }));
    expect(s.calls()).toEqual([]);
    expect(snapshot.qodo).toEqual({ status: 'none' });
  });

  it('nothing in src/ opens a socket or makes an HTTP request', () => {
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
    const src = files(join(import.meta.dirname, '../src')).filter((f) => f.endsWith('.ts'));
    expect(src.length).toBeGreaterThan(10);
    for (const f of src) {
      const text = readFileSync(f, 'utf8');
      expect(/from '(node:)?(https?|http2|net|tls|dgram|dns)'|\bfetch\(|XMLHttpRequest|WebSocket/.test(text), f).toBe(false);
    }
  });
});

describe('#17 AC2: read-only tools only, unresolved findings on files at HEAD only', () => {
  it('calls only `gh pr list`, `gh pr view` and `qodo read … findings`, and skips closed unmerged PRs', async () => {
    const s = stubs();
    expect((await onPath(s, () => scanCli(repo, ['--with-qodo']))).code).toBe(0);
    const calls = s.calls();
    const gh = calls.filter((c) => c.tool === 'gh');
    expect(gh[0]).toEqual({ tool: 'gh', args: ['pr', 'list', '--state', 'all', '--limit', '1000', '--json', 'number,url,state'] });
    // Only the PRs without a complete review get their file list read.
    expect(gh.slice(1).map((c) => c.args).sort()).toEqual([4, 5].map((n) => ['pr', 'view', PR(n), '--json', 'files,changedFiles']));
    const qodo = calls.filter((c) => c.tool === 'qodo');
    for (const c of qodo) expect(c.args.slice(0, 4)).toEqual(['--no-onboarding', 'read', 'pr-review-session', 'findings']);
    expect(qodo.map((c) => c.args[c.args.indexOf('--pr-url') + 1]).sort()).toEqual([PR(1), PR(2), PR(4), PR(5)]);
    expect(calls.length).toBe(7);
  });

  it('counts only open findings, per file per level, deduplicated by id', async () => {
    const s = stubs();
    await onPath(s, () => scanCli(repo, ['--with-qodo']));
    expect(qodoOf(readSnap(repo))).toEqual({
      'README.md': null,
      'src/a.ts': open(levels(1, 1, 1, 1)),
      'src/b.ts': open(levels(0, 1, 0, 0)),
      'src/new.ts': null,
    });
  });

  it('a file changed by a PR with no complete review is unknown, not 0 (Qodo local r1 #2)', async () => {
    const r = await onPath(stubs(), () => scanCli(repo, ['--with-qodo']));
    expect(r.out).toContain('2 PR(s) have no complete Qodo review; the 2 file(s) at HEAD they change are unknown, not 0');
    // With #5's review complete, its file is evidence-backed again.
    const done = stubs({ findings: { ...FINDINGS, 5: response(5, []) } });
    await onPath(done, () => scanCli(repo, ['--with-qodo']));
    expect(qodoOf(readSnap(repo))['src/new.ts']).toEqual(open(levels(0, 0, 0, 0)));
    expect(done.calls().filter((c) => c.args[1] === 'view').map((c) => c.args[2])).toEqual([PR(4)]);
  });

  it('a finding on a renamed, deleted, absolute or missing path is left out and counted, never moved', async () => {
    const s = stubs();
    const r = await onPath(s, () => scanCli(repo, ['--with-qodo']));
    const snap = readSnap(repo);
    expect(snap.qodo).toEqual({ status: 'read', head: snap.repo.head, prs: 4, skipped: 1, unreviewed: 2, offHead: 4 });
    expect(r.out).toContain('qodo findings: 5 open on 2 file(s) (action_required 1 · remediation_recommended 2 · informational 1 · other 1), '
      + `from 2 reviewed PR(s) as of ${snap.repo.head.slice(0, 7)}`);
    // Skipped PRs are counted, not dropped silently (Qodo local r1 #1).
    expect(r.out).toContain('1 closed PR(s) that never merged were not read');
    expect(r.out).toContain('4 open finding(s) are on files not at HEAD (deleted, renamed, excluded or none) and are left out');
  });

  it('zero PRs: no review evidence, so every file is unknown, not 0', async () => {
    const s = stubs({ prs: [] });
    const r = await onPath(s, () => scanCli(repo, ['--with-qodo']));
    expect(r.code).toBe(0);
    expect(s.calls().map((c) => c.tool)).toEqual(['gh']);
    const snap = readSnap(repo);
    expect(snap.qodo).toEqual({ status: 'read', head: snap.repo.head, prs: 0, skipped: 0, unreviewed: 0, offHead: 0 });
    expect(snap.files.map((f) => f.qodo)).toEqual([null, null, null, null]);
    expect(r.out).toContain('qodo findings: unknown (no PR has a Qodo review)');
  });
});

describe('#17 AC3: the cache holds counts per file per level only; finding text never leaves the fetch', () => {
  it('fixture plants every canary (guards against a vacuous pass)', () => {
    const planted = JSON.stringify(FINDINGS);
    for (const k of ['title', 'description', 'url', 'snippet', 'home'] as const) expect(planted).toContain(CANARY[k]);
  });

  it('writes <git-common-dir>/commet/qodo-findings.json with counts only', async () => {
    const s = stubs();
    await onPath(s, () => scanCli(repo, ['--with-qodo']));
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo.dir, encoding: 'utf8' }).trim();
    expect(JSON.parse(readFileSync(CACHE(repo), 'utf8'))).toEqual({
      schema: 'commet.qodo-findings.v1', head, prs: 4, skipped: 1, unreviewed: 2, offHead: 4,
      files: { 'src/a.ts': levels(1, 1, 1, 1), 'src/b.ts': levels(0, 1, 0, 0) }, unknown: ['README.md', 'src/new.ts'],
    });
  });

  it('no title, description, URL, snippet, error text or foreign path reaches the cache, snapshot, stdout or stderr', async () => {
    const s = stubs();
    const r = await onPath(s, () => scanCli(repo, ['--with-qodo']));
    const outputs = { cache: readFileSync(CACHE(repo), 'utf8'), snapshot: readFileSync(SNAPSHOT(repo), 'utf8'), stdout: r.out, stderr: r.err };
    for (const [name, text] of Object.entries(outputs)) {
      for (const c of [...Object.values(CANARY), 'github.com', 'https://', 'Correctness']) expect(text.includes(c), `${name} has ${c}`).toBe(false);
    }
  });

  it('error output from a failing tool is never shown', async () => {
    const s = stubs({ fail: { qodo: `process.stderr.write('${CANARY.stderr} /Users/${CANARY.home}\\n');\nprocess.stdout.write('{"error":{"code":"${CANARY.title}","message":"${CANARY.description}"}}');\nprocess.exit(1);\n` } });
    const r = await onPath(s, () => scanCli(repo, ['--with-qodo']));
    for (const text of [r.out, r.err, readFileSync(SNAPSHOT(repo), 'utf8')]) {
      for (const c of Object.values(CANARY)) expect(text.includes(c), c).toBe(false);
    }
    expect(r.out).toContain('qodo findings: unavailable (qodo failed)');
  });
});

describe('#17 AC4: files[].qodo, and a scan without the flag reads the cache', () => {
  it('a later scan without the flag gives the byte-identical snapshot from the cache, spawning nothing', async () => {
    const s = stubs();
    const fetched = await onPath(s, () => scanCli(repo, ['--with-qodo']));
    const first = readFileSync(SNAPSHOT(repo), 'utf8');
    const none = stubs({ omit: ['gh', 'qodo'] });
    const cached = await onPath(none, () => scanCli(repo));
    expect(none.calls()).toEqual([]);
    expect(readFileSync(SNAPSHOT(repo), 'utf8')).toBe(first);
    expect(cached.out).toContain('qodo findings (cached): 5 open on 2 file(s)');
    expect(fetched.out).not.toContain('(cached)');
  });

  it('a cached file no longer at HEAD is left out and counted, not carried to another path', async () => {
    await onPath(stubs(), () => scanCli(repo, ['--with-qodo']));
    const fetchHead = readSnap(repo).repo.head;
    commit(repo, '2026-10-06T10:00:00Z', ['rm', '-q', 'src/b.ts'], 'chore: drop b');
    const r = await onPath(stubs({ omit: ['gh', 'qodo'] }), () => scanCli(repo));
    const snap = readSnap(repo);
    expect(qodoOf(snap)).toEqual({ 'README.md': null, 'src/a.ts': open(levels(1, 1, 1, 1)), 'src/new.ts': null });
    expect(snap.qodo).toEqual({ status: 'read', head: fetchHead, prs: 4, skipped: 1, unreviewed: 2, offHead: 5 });
    expect(r.out).toContain(`as of ${fetchHead.slice(0, 7)} (HEAD has moved since)`);
  });

  it('a malformed, oversized-count or symlinked cache is unknown, not 0', async () => {
    const s = stubs({ omit: ['gh', 'qodo'] });
    const cache = (o: object) => JSON.stringify({ schema: 'commet.qodo-findings.v1', head: 'a'.repeat(40), prs: 1, skipped: 0, unreviewed: 0,
      offHead: 0, files: {}, unknown: [], ...o });
    const big = 2 ** 52;
    const bad = [
      '{not json', cache({ head: 'x' }), cache({ files: { 'src/a.ts': { ...levels(1, 0, 0, 0), actionRequired: -1 } } }),
      cache({ files: { 'src/a.ts': { ...levels(1, 0, 0, 0), title: CANARY.title } } }), cache({ unknown: [CANARY.title, 7] }),
      cache({ skipped: undefined }),
      // Each count is a safe integer, but a file's total or the off-HEAD sum is not (Qodo local r1 #4).
      cache({ files: { 'src/a.ts': levels(big, big, 0, 0) } }),
      cache({ offHead: big, files: { 'src/gone.ts': levels(big, 0, 0, 0) } }),
    ];
    await onPath(s, () => scanCli(repo));
    for (const text of bad) {
      writeFileSync(CACHE(repo), text);
      const r = await onPath(s, () => scanCli(repo));
      expect(r.code, text).toBe(0);
      expect(readSnap(repo).qodo, text).toEqual({ status: 'unavailable', reason: 'cache unreadable' });
      expect(readSnap(repo).files.every((f) => f.qodo === null), text).toBe(true);
      expect(r.out).toContain('qodo findings: unavailable (cache unreadable)');
    }
    const target = join(mkdtempSync(join(tmpdir(), 'commet-qodo-target-')), 'x.json');
    writeFileSync(target, cache({}));
    rmSync(CACHE(repo));
    symlinkSync(target, CACHE(repo));
    expect((await onPath(s, () => scanCli(repo))).out).toContain('qodo findings: unavailable (cache unreadable)');
  });
});

describe('#17 AC5: a failed fetch exits 0 with qodo null and an "unavailable (<reason>)" line', () => {
  const failing: [string, Parameters<typeof stubs>[0], string][] = [
    ['qodo not installed', { omit: ['qodo'] }, 'qodo not installed'],
    ['gh not installed', { omit: ['gh'] }, 'gh not installed'],
    ['not logged in to Qodo', { fail: { qodo: 'process.stdout.write(\'{"error":{"code":"not_logged_in","message":"Not logged in. Run `qodo login`."}}\');\nprocess.exit(1);\n' } }, 'not logged in'],
    ['not logged in to gh', { fail: { gh: 'process.stderr.write("To get started with GitHub CLI, please run:  gh auth login\\n");\nprocess.exit(4);\n' } }, 'not logged in'],
    ['network down', { fail: { gh: 'process.stderr.write("error connecting to api.github.com\\ncheck your internet connection or https://githubstatus.com\\n");\nprocess.exit(1);\n' } }, 'network error'],
    ['rate limited', { fail: { qodo: 'process.stdout.write(\'{"error":{"code":"rate_limited","message":"Too many requests"}}\');\nprocess.exit(1);\n' } }, 'rate limited'],
    ['a GitHub API rate limit', { fail: { gh: 'process.stderr.write("GraphQL: API rate limit exceeded for user ID 1.\\n");\nprocess.exit(1);\n' } }, 'rate limited'],
    ['a remote that is not GitHub', { fail: { gh: 'process.stderr.write("none of the git remotes configured for this repository point to a known GitHub host.\\n");\nprocess.exit(1);\n' } }, 'no GitHub remote'],
    ['malformed JSON', { fail: { qodo: 'process.stdout.write("{oops");\n' } }, 'malformed response'],
    ['a malformed PR list', { prs: [{ number: 1, url: '--exec=evil', state: 'OPEN' }] }, 'malformed response'],
    ['a truncated read', { findings: { ...FINDINGS, 2: { ...(FINDINGS[2] as object), qar_operation_result_truncated: true } } }, 'truncated result'],
    ['a finding count that disagrees with the list', { findings: { ...FINDINGS, 1: { ...(FINDINGS[1] as object), finding_count: 99 } } }, 'truncated result'],
    ['a PR file list cut short', { views: { ...VIEWS, 4: { changedFiles: 3, files: (VIEWS[4] as { files: object[] }).files } } }, 'truncated result'],
    ['a malformed PR file list', { views: { ...VIEWS, 5: { changedFiles: 1, files: [{ path: 7 }] } } }, 'malformed response'],
    ['too many PRs to list', { prs: Array.from({ length: 1000 }, (_, i) => ({ number: i + 1, url: PR(i + 1), state: 'CLOSED' })) }, 'too many PRs'],
  ];
  for (const [name, o, reason] of failing) {
    it(`${name} → unavailable (${reason})`, async () => {
      const s = stubs(o);
      const r = await onPath(s, () => scanCli(repo, ['--with-qodo']));
      expect(r.code).toBe(0);
      const snap = readSnap(repo);
      expect(snap.qodo).toEqual({ status: 'unavailable', reason });
      expect(snap.files.map((f) => f.qodo)).toEqual([null, null, null, null]);
      expect(r.out).toContain(`qodo findings: unavailable (${reason}); every file's finding count is unknown, not zero`);
      expect(existsSync(CACHE(repo))).toBe(false);
    });
  }

  it('a timeout → unavailable (timed out), and the hung tool is killed', async () => {
    const s = stubs({ fail: { qodo: 'setTimeout(() => {}, 60000);\n' } });
    const { snapshot } = await onPath(s, () => scan({ repoDir: repo.dir, windowMonths: 24, ingest: false,
      claudeProjectsDir: join(NO_LOGS, 'projects'), keyFor: () => new Uint8Array(32).fill(7),
      qodo: { fetch: true, stateDir: () => join(repo.dir, '.git/commet'), timeoutMs: 1500 } }));
    expect(snapshot.qodo).toEqual({ status: 'unavailable', reason: 'timed out' });
    expect(snapshot.files.every((f) => f.qodo === null)).toBe(true);
  });

  it('the first failure stops the read and kills the calls still running', async () => {
    const s = stubs({ fail: { qodo: 'if (args.includes("' + PR(2) + '")) setTimeout(() => {}, 60000);\n'
      + 'else setTimeout(() => { process.stdout.write(\'{"error":{"code":"not_logged_in"}}\'); process.exit(1); }, 300);\n' } });
    const t0 = Date.now();
    const { snapshot } = await onPath(s, () => scan({ repoDir: repo.dir, windowMonths: 24, ingest: false,
      claudeProjectsDir: join(NO_LOGS, 'projects'), keyFor: () => new Uint8Array(32).fill(7),
      qodo: { fetch: true, stateDir: () => join(repo.dir, '.git/commet'), timeoutMs: 20_000 } }));
    expect(snapshot.qodo).toEqual({ status: 'unavailable', reason: 'not logged in' });
    expect(Date.now() - t0).toBeLessThan(10_000);
  });

  it('scan() itself never writes the cache; the CLI does (altitude review #1)', async () => {
    const { snapshot } = await onPath(stubs(), () => scan({ repoDir: repo.dir, windowMonths: 24, ingest: false,
      claudeProjectsDir: join(NO_LOGS, 'projects'), keyFor: () => new Uint8Array(32).fill(7),
      qodo: { fetch: true, stateDir: () => join(repo.dir, '.git/commet') } }));
    expect(snapshot.qodo).toMatchObject({ status: 'read', prs: 4 });
    expect(existsSync(CACHE(repo))).toBe(false);
  });

  it('a cache that cannot be written still gives the snapshot and says so (Qodo local r1 #3)', async () => {
    await onPath(stubs({ omit: ['gh', 'qodo'] }), () => scanCli(repo));
    mkdirSync(CACHE(repo));
    const out = join(mkdtempSync(join(tmpdir(), 'commet-qodo-out-')), 'snap.json');
    const r = await onPath(stubs(), () => scanCli(repo, ['--with-qodo', '--out', out]));
    expect(r.code).toBe(0);
    expect((JSON.parse(readFileSync(out, 'utf8')) as SnapshotV02).qodo).toMatchObject({ status: 'read', prs: 4 });
    expect(r.out).toContain('qodo findings: 5 open on 2 file(s)');
    expect(r.out).toContain('qodo findings cache could not be written; a scan without --with-qodo will not see these counts');
  });

  it('a failed fetch keeps the earlier cache instead of overwriting it with nothing', async () => {
    await onPath(stubs(), () => scanCli(repo, ['--with-qodo']));
    const before = readFileSync(CACHE(repo), 'utf8');
    const r = await onPath(stubs({ omit: ['qodo'] }), () => scanCli(repo, ['--with-qodo']));
    expect(r.out).toContain('qodo findings: unavailable (qodo not installed)');
    expect(readSnap(repo).files.every((f) => f.qodo === null)).toBe(true);
    expect(readFileSync(CACHE(repo), 'utf8')).toBe(before);
  });

  it('the summary line comes from the snapshot alone', () => {
    const base = { files: [], dirs: [], branches: [], commits: [], sessions: [], coverage: [], people: [],
      exclusions: { rulesetVersion: '1', rules: [], counts: {} }, unreadable: { dirs: 0, files: 0, branches: 0, bulkCommits: 0 },
      window: { months: 24, since: '2026-01-01T00:00:00Z', until: '2026-02-01T00:00:00Z', firstParent: true } } as unknown as SnapshotV02;
    expect(formatSummary({ ...base, qodo: { status: 'unavailable', reason: 'network error' } }, null))
      .toContain("qodo findings: unavailable (network error); every file's finding count is unknown, not zero");
  });
});
