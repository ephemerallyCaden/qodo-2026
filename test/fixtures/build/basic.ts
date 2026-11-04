// Scripted fixture repo with fixed identities and dates, so commit SHAs are reproducible.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const SELF = { name: 'Ada Self', email: 'self@example.com' };
export const TEAMMATE = { name: 'Tom Mate', email: 'mate@example.com' };

/** Lines the synthetic agent writes; the fixture commits them verbatim. */
export const AGENT_FILE = [
  'export function agentWritten(input: number): number {',
  '  const doubled = input * 2;',
  '  return doubled + 1;',
  '}',
  'const CANARY_CODE = 1;',
  'export const agentConstant = CANARY_CODE;',
];
export const CORE_V1 = ['export function core(): string {', "  return 'human original core';", '}'];
export const CORE_AGENT = ['export const agentAddedOne = core().length;', 'export const agentAddedTwo = agentAddedOne * 3;'];
export const CORE_HUMAN = ['export const humanAddedOne = core().toUpperCase();', 'export const humanAddedTwo = humanAddedOne.trim();'];
export const HELPER = ['export function subagentHelper(): string {', "  return 'written by a subagent via bash';", '}'];
export const LATE = ['Late notes typed by the human before committing.', 'The author date is set later than the commit.'];
/** A line with U+0001 (Qodo #4): it must not split the patch stream. */
export const CONTROL = ['export const marker = "\u0001 control char";', 'export const afterMarkerOne = marker.length;',
  'export const afterMarkerTwo = afterMarkerOne + 1;'];
/** Paths git decorates in patch headers (Qodo #5): a space (trailing tab) and C-style quoting. */
export const SPACED = { plain: 'dir/my file.ts', quoted: 'dir/naïve "q".ts', lock: 'sub dir/package-lock.json' };
export const SPACED_LINES = ['export const spacedPathValue = 41;', 'export const spacedPathNext = spacedPathValue + 1;'];
export const NOTES = ['# Notes', 'These notes were typed by the human author.', 'A second human-written sentence here.'];

export interface FixtureCommit { sha: string; date: string }
export interface FixtureRepo { dir: string; commits: Record<string, FixtureCommit> }

export function buildBasicRepo(): FixtureRepo {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'commet-fixture-')));
  const git = (args: string[], env: Record<string, string> = {}) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } }).trim();
  const write = (path: string, lines: string[] | Buffer) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), Array.isArray(lines) ? lines.join('\n') + '\n' : lines);
  };
  git(['init', '-q', '-b', 'main']);
  for (const [k, v] of [['user.name', SELF.name], ['user.email', SELF.email], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) {
    git(['config', k!, v!]);
  }
  const commits: Record<string, FixtureCommit> = {};
  const commit = (id: string, date: string, subject: string, who = SELF, authorDate = date) => {
    git(['add', '-A']);
    git(['commit', '-q', '-m', subject], {
      GIT_AUTHOR_NAME: who.name, GIT_AUTHOR_EMAIL: who.email, GIT_AUTHOR_DATE: authorDate,
      GIT_COMMITTER_NAME: who.name, GIT_COMMITTER_EMAIL: who.email, GIT_COMMITTER_DATE: date,
    });
    commits[id] = { sha: git(['rev-parse', 'HEAD']), date };
  };

  // c0: before any agent log exists → unknown (never human).
  write('README.md', ['# Fixture', 'A small repo for Commet golden tests.']);
  write('src/core.ts', CORE_V1);
  commit('c0', '2026-10-01T09:00:00Z', 'chore: initial human commit');
  // c1: the agent's Write-created file, plus a lockfile and a binary (both excluded) → agent.
  write('src/agent.ts', AGENT_FILE);
  write('package-lock.json', ['{', '  "lockfileVersion": 3', '}']);
  write('assets/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 1, 2, 3]));
  commit('c1', '2026-10-02T10:00:00Z', 'feat: agent writes the agent module');
  // c2: half agent (Edit), half human → mixed.
  write('src/core.ts', [...CORE_V1, ...CORE_AGENT, ...CORE_HUMAN]);
  commit('c2', '2026-10-03T10:00:00Z', 'feat: extend core together');
  // c3: human-only text inside coverage → human.
  write('docs/notes.md', NOTES);
  commit('c3', '2026-10-04T10:00:00Z', 'docs: human notes');
  // c4: a teammate with no trailer, bot or note → unknown (R6).
  write('docs/team.md', ['# Team', 'Written by a teammate on their own machine.']);
  commit('c4', '2026-10-05T10:00:00Z', 'docs: teammate page', TEAMMATE);
  // c5: written by a subagent through a Bash edit → agent.
  write('src/sub/helper.ts', HELPER);
  commit('c5', '2026-10-06T10:00:00Z', 'feat: subagent helper');
  // c6: author date after the committer date; an agent writes the same lines only after the commit.
  write('docs/late.md', LATE);
  commit('c6', '2026-10-07T10:00:00Z', 'docs: late-dated human notes', SELF, '2026-10-09T10:00:00Z');
  // c7: agent-written lines around a U+0001 → agent.
  write('src/ctrl.ts', CONTROL);
  commit('c7', '2026-10-08T10:00:00Z', 'feat: control-character module');
  // c8: agent files at decorated paths, plus a lockfile under a spaced dir (excluded) → agent.
  write(SPACED.plain, SPACED_LINES);
  write(SPACED.quoted, SPACED_LINES);
  write(SPACED.lock, ['{', '  "name": "fixture-lock-entry",', '  "lockfileVersion": 3', '}']);
  commit('c8', '2026-10-09T10:00:00Z', 'feat: files at awkward paths');
  // c9: human-looking text in a gap between transcripts (Qodo #6) → unknown, never human.
  write('docs/gap.md', ['# Gap', 'Written while no agent log was being recorded.']);
  commit('c9', '2026-10-20T10:00:00Z', 'docs: gap notes');
  return { dir, commits };
}
