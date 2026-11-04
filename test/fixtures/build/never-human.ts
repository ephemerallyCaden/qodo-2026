// Scripted repo for Issue #5 ("unknown, never human"): one commit per edge case, each on its own
// day so each synthetic transcript covers exactly one case. Fixed identities and dates.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { SELF, TEAMMATE, type FixtureCommit, type FixtureRepo } from './basic.js';

/** Lines per case; every line is countable (8+ chars, has word characters). */
export const EDGE_LINES = {
  bash: ['export const bashWrittenOne = 101;', 'export const bashWrittenTwo = bashWrittenOne + 1;'],
  friend: ['export const teammateLineOne = 201;', 'export const teammateLineTwo = teammateLineOne + 1;',
    'export const teammateLineThree = teammateLineTwo + 1;'],
  oversized: ['export const oversizedEditOne = 301;', 'export const oversizedEditTwo = oversizedEditOne + 1;'],
  malformed: ['export const malformedEditOne = 401;', 'export const malformedEditTwo = malformedEditOne + 1;'],
  noCwd: ['export const noCwdWriteOne = 501;', 'export const noCwdWriteTwo = noCwdWriteOne + 1;'],
  symlinked: ['export const symlinkedWriteOne = 601;', 'export const symlinkedWriteTwo = symlinkedWriteOne + 1;'],
  caseVariant: ['export const caseVariantWriteOne = 701;', 'export const caseVariantWriteTwo = caseVariantWriteOne + 1;'],
  control: ['# Control', 'Typed by the human while an idle agent session was open.'],
  agentMerge: ['export const thirdLineOne = 801;', 'export const thirdLineTwo = thirdLineOne + 1;'],
  resolvedTeam: ['export const resolvedTeamOne = 901;', 'export const resolvedTeamTwo = resolvedTeamOne + 1;'],
  resolvedSelf: ['export const resolvedBySelfOne = 911;', 'export const resolvedBySelfTwo = resolvedBySelfOne + 1;'],
  cwdless: ['export const cwdlessWriteOne = 1001;', 'export const cwdlessWriteTwo = cwdlessWriteOne + 1;'],
  noUuid: ['export const noUuidWriteOne = 1101;', 'export const noUuidWriteTwo = noUuidWriteOne + 1;'],
  dotdot: ['export const dotdotWriteOne = 1201;', 'export const dotdotWriteTwo = dotdotWriteOne + 1;'],
};

/** Case id → [day, repo path]. Each commit lands at <day>T10:00:00Z. */
export const EDGE_CASES = {
  bash: ['2026-10-02', 'src/bash-gen.ts'],
  merge: ['2026-10-03', 'lib/friend.ts'],
  oversized: ['2026-10-04', 'src/oversized.ts'],
  malformed: ['2026-10-05', 'src/malformed.ts'],
  noCwd: ['2026-10-06', 'src/no-cwd.ts'],
  symlinked: ['2026-10-07', 'src/symlinked.ts'],
  caseVariant: ['2026-10-08', 'src/case-variant.ts'],
  control: ['2026-10-09', 'docs/control.md'],
  agentMerge: ['2026-10-10', 'lib/third.ts'],
  resolvedMerge: ['2026-10-11', 'lib/resolved.ts'],
  cwdless: ['2026-10-12', 'src/cwdless.ts'],
  noUuid: ['2026-10-13', 'src/no-uuid.ts'],
  dotdot: ['2026-10-14', 'src/dotdot.ts'],
} as const;
/** Edge cases that are merge commits (two parents). */
export const MERGES: EdgeCase[] = ['merge', 'agentMerge', 'resolvedMerge'];
export type EdgeCase = keyof typeof EDGE_CASES;

export function buildNeverHumanRepo(): FixtureRepo {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'commet-edge-')));
  const git = (args: string[], env: Record<string, string> = {}) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } }).trim();
  const write = (path: string, lines: string[]) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), lines.join('\n') + '\n');
  };
  const as = (who: typeof SELF, date: string) => ({ GIT_AUTHOR_NAME: who.name, GIT_AUTHOR_EMAIL: who.email, GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: who.name, GIT_COMMITTER_EMAIL: who.email, GIT_COMMITTER_DATE: date });
  git(['init', '-q', '-b', 'main']);
  for (const [k, v] of [['user.name', SELF.name], ['user.email', SELF.email], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) {
    git(['config', k!, v!]);
  }
  const commits: Record<string, FixtureCommit> = {};
  const commit = (id: string, date: string, subject: string, who = SELF) => {
    git(['add', '-A']);
    git(['commit', '-q', '-m', subject], as(who, date));
    commits[id] = { sha: git(['rev-parse', 'HEAD']), date };
  };
  const at = (c: EdgeCase) => `${EDGE_CASES[c][0]}T10:00:00Z`;

  // root: before any agent log → unknown.
  write('README.md', ['# Edge fixture', 'Edge cases for the never-human rule.']);
  commit('root', '2026-10-01T09:00:00Z', 'chore: initial human commit');
  // Case 1: the agent wrote the file with a Bash heredoc (no bashEditDiff) and ran `git commit` itself.
  write(EDGE_CASES.bash[1], EDGE_LINES.bash);
  commit('bash', at('bash'), 'feat: generated via bash');
  // Case 2: a teammate's branch, merged by self with --no-ff (git pull style). The teammate commit
  // is off the first-parent chain; the merge's first-parent diff carries the teammate's lines.
  git(['checkout', '-q', '-b', 'teammate']);
  write(EDGE_CASES.merge[1], EDGE_LINES.friend);
  commit('friend', '2026-10-03T08:00:00Z', 'feat: teammate module', TEAMMATE);
  git(['checkout', '-q', 'main']);
  git(['merge', '-q', '--no-ff', '-m', "Merge branch 'teammate'", 'teammate'], as(SELF, at('merge')));
  commits['merge'] = { sha: git(['rev-parse', 'HEAD']), date: at('merge') };
  // Cases 3a–3c and 4: agent-written lines whose log records the parser drops or can't place.
  write(EDGE_CASES.oversized[1], EDGE_LINES.oversized);
  commit('oversized', at('oversized'), 'feat: edit inside a very large file');
  write(EDGE_CASES.malformed[1], EDGE_LINES.malformed);
  commit('malformed', at('malformed'), 'feat: edit logged on a malformed line');
  write(EDGE_CASES.noCwd[1], EDGE_LINES.noCwd);
  commit('noCwd', at('noCwd'), 'feat: write from a session whose head has no cwd');
  write(EDGE_CASES.symlinked[1], EDGE_LINES.symlinked);
  commit('symlinked', at('symlinked'), 'feat: write through a symlinked cwd');
  write(EDGE_CASES.caseVariant[1], EDGE_LINES.caseVariant);
  commit('caseVariant', at('caseVariant'), 'feat: write through a case-variant cwd');
  // Positive control: human text inside an idle session's coverage → human.
  write(EDGE_CASES.control[1], EDGE_LINES.control);
  commit('control', at('control'), 'docs: human control notes');
  // Case 2b: an agent-run `git merge` of a teammate branch; merge output names no SHA.
  const teammateBranch = (branch: string, id: string, c: EdgeCase, lines: string[]) => {
    git(['checkout', '-q', '-b', branch]);
    write(EDGE_CASES[c][1], lines);
    commit(id, `${EDGE_CASES[c][0]}T08:00:00Z`, `feat: ${branch} module`, TEAMMATE);
    git(['checkout', '-q', 'main']);
  };
  teammateBranch('teammate3', 'friend3', 'agentMerge', EDGE_LINES.agentMerge);
  git(['merge', '-q', '--no-ff', '-m', "Merge branch 'teammate3'", 'teammate3'], as(SELF, at('agentMerge')));
  commits['agentMerge'] = { sha: git(['rev-parse', 'HEAD']), date: at('agentMerge') };
  // Case 2c: a merge where self adds resolution lines no parent has (an "evil merge").
  teammateBranch('teammate4', 'friend4', 'resolvedMerge', EDGE_LINES.resolvedTeam);
  git(['merge', '-q', '--no-ff', '--no-commit', 'teammate4'], as(SELF, at('resolvedMerge')));
  write(EDGE_CASES.resolvedMerge[1], [...EDGE_LINES.resolvedTeam, ...EDGE_LINES.resolvedSelf]);
  commit('resolvedMerge', at('resolvedMerge'), "Merge branch 'teammate4'");
  // Cases 3d–3f: a transcript with no cwd anywhere, an edit record missing its uuid, and an
  // edit path under the cwd that doesn't relativise.
  for (const c of ['cwdless', 'noUuid', 'dotdot'] as const) {
    write(EDGE_CASES[c][1], EDGE_LINES[c]);
    commit(c, at(c), `feat: agent-written ${c} module`);
  }
  return { dir, commits };
}
