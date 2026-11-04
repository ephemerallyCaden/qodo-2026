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
  const commit = (id: string, date: string, subject: string, who = SELF) => {
    git(['add', '-A']);
    git(['commit', '-q', '-m', subject], {
      GIT_AUTHOR_NAME: who.name, GIT_AUTHOR_EMAIL: who.email, GIT_AUTHOR_DATE: date,
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
  return { dir, commits };
}
