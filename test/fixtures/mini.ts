// Minimal per-case fixtures for review findings (Qodo PR #6): a tiny self-authored repo plus
// synthetic transcripts (v2.1.31x key names, synthetic content only). Each case is scanned with
// and without the record that triggers it, so a test can't pass vacuously.
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { CommitAttribution } from '../../src/core/snapshot/types.js';
import { scan } from '../../src/scan/index.js';
import { SELF } from './build/basic.js';

export interface MiniCommit { id: string; at: string; path: string; lines: string[]; subject?: string }
export interface MiniRepo { dir: string; sha: Record<string, string> }

/** Commits each entry as self, in order, at its fixed date. */
export function miniRepo(commits: MiniCommit[], setup?: (dir: string) => void): MiniRepo {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'commet-mini-')));
  const git = (args: string[], env: Record<string, string> = {}) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } }).trim();
  git(['init', '-q', '-b', 'main']);
  for (const [k, v] of [['user.name', SELF.name], ['user.email', SELF.email], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) {
    git(['config', k!, v!]);
  }
  setup?.(dir);
  const sha: Record<string, string> = {};
  for (const c of commits) {
    mkdirSync(dirname(join(dir, c.path)), { recursive: true });
    writeFileSync(join(dir, c.path), c.lines.join('\n') + '\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', c.subject ?? `test: ${c.id}`], { GIT_AUTHOR_NAME: SELF.name, GIT_AUTHOR_EMAIL: SELF.email, GIT_AUTHOR_DATE: c.at,
      GIT_COMMITTER_NAME: SELF.name, GIT_COMMITTER_EMAIL: SELF.email, GIT_COMMITTER_DATE: c.at });
    sha[c.id] = git(['rev-parse', 'HEAD']);
  }
  return { dir, sha };
}

export type Row = object | string;

/** Record builders for one session; `cwd` is logged on every record. */
export function session(sessionId: string, cwd: string) {
  const base = { sessionId, cwd, gitBranch: 'main', version: '2.1.31', userType: 'external', isSidechain: false };
  return {
    user: (uuid: string, timestamp: string) => ({ ...base, type: 'user', uuid, timestamp, message: { role: 'user', content: 'synthetic prompt' } }),
    call: (uuid: string | undefined, timestamp: string, name: string, input: object = {}) => ({ ...base, type: 'assistant', uuid, timestamp,
      message: { role: 'assistant', model: 'claude-opus-4-1', content: [{ type: 'tool_use', id: `t-${uuid}`, name, input }] } }),
    result: (uuid: string, parent: string | undefined, timestamp: string, toolUseResult: object) => ({ ...base, type: 'user', uuid,
      parentUuid: parent, sourceToolAssistantUUID: parent, timestamp, toolUseResult,
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `t-${parent}`, content: 'ok' }] } }),
    /** One assistant record with several parallel tool uses, each with its own `id`. */
    calls: (uuid: string, timestamp: string, uses: { id: string; name: string; input: object }[]) => ({ ...base, type: 'assistant', uuid, timestamp,
      message: { role: 'assistant', model: 'claude-opus-4-1', content: uses.map((u) => ({ type: 'tool_use', ...u })) } }),
    /** The result of tool use `useId`, linked to its record by `source` and/or `parent`. */
    resultFor: (uuid: string, useId: string, links: { source?: string; parent?: string }, timestamp: string, toolUseResult: object) => ({ ...base,
      type: 'user', uuid, parentUuid: links.parent, sourceToolAssistantUUID: links.source, timestamp, toolUseResult,
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: useId, content: 'ok' }] } }),
  };
}

export const createResult = (filePath: string, lines: string[]) =>
  ({ type: 'create', filePath, content: lines.join('\n') + '\n', structuredPatch: [], originalFile: null });

/** Writes transcripts under `<claude>/projects/-mini/<name>.jsonl`; returns the projects dir. */
export function miniClaude(transcripts: Record<string, Row[]>): string {
  const projects = join(realpathSync(mkdtempSync(join(tmpdir(), 'commet-mini-claude-'))), 'projects');
  mkdirSync(join(projects, '-mini'), { recursive: true });
  for (const [name, rows] of Object.entries(transcripts)) {
    // `link:<file>` plants a symlink to an existing file; `mode000:<name>` writes an unreadable file.
    if (name.startsWith('link:')) {
      symlinkSync(name.slice(5), join(projects, '-mini', `${basename(name.slice(5), '.jsonl')}-link.jsonl`));
      continue;
    }
    const file = join(projects, '-mini', `${name.replace(/^mode000:/, '')}.jsonl`);
    writeFileSync(file, rows.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n') + '\n');
    if (name.startsWith('mode000:')) chmodSync(file, 0);
  }
  return projects;
}

export async function scanMini(repo: MiniRepo, projects: string) {
  const { snapshot, logs } = await scan({ repoDir: repo.dir, windowMonths: 24, ingest: true, claudeProjectsDir: projects,
    keyFor: () => new Uint8Array(32).fill(7) });
  const attr = (id: string): CommitAttribution => snapshot.commits.find((c) => c.sha === repo.sha[id])!.attribution;
  return { snapshot, logs: logs!, attr };
}
