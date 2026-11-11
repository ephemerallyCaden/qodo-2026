// Scripted repo for Issue #5 ("unknown, never human"): one commit per edge case, each on its own
// day so each synthetic transcript covers exactly one case. Fixed identities and dates.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gitIn, SELF, TEAMMATE, type FixtureCommit, type FixtureRepo } from './basic.js';
import { realTempDir } from '../tmp.js';

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
  varCwd: ['export const varCwdWriteOne = 1301;', 'export const varCwdWriteTwo = varCwdWriteOne + 1;'],
  symlinkedSub: ['export const linkedSubWriteOne = 1401;', 'export const linkedSubWriteTwo = linkedSubWriteOne + 1;'],
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
  varCwd: ['2026-10-15', 'src/var-cwd.ts'],
  symlinkedSub: ['2026-10-16', 'src/linked/sub.ts'],
} as const;
/** Edge cases that are merge commits (two parents). */
export const MERGES: EdgeCase[] = ['merge', 'agentMerge', 'resolvedMerge'];
export type EdgeCase = keyof typeof EDGE_CASES;

export async function buildNeverHumanRepo(): Promise<FixtureRepo> {
  const dir = realTempDir('commet-edge-');
  const git = gitIn(dir);
  const write = (path: string, lines: string[]) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), lines.join('\n') + '\n');
  };
  const as = (who: typeof SELF, date: string) => ({ GIT_AUTHOR_NAME: who.name, GIT_AUTHOR_EMAIL: who.email, GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: who.name, GIT_COMMITTER_EMAIL: who.email, GIT_COMMITTER_DATE: date });
  await git(['init', '-q', '-b', 'main']);
  for (const [k, v] of [['user.name', SELF.name], ['user.email', SELF.email], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) {
    await git(['config', k!, v!]);
  }
  const commits: Record<string, FixtureCommit> = {};
  const commit = async (id: string, date: string, subject: string, who = SELF) => {
    await git(['add', '-A']);
    await git(['commit', '-q', '-m', subject], as(who, date));
    commits[id] = { sha: await git(['rev-parse', 'HEAD']), date };
  };
  const at = (c: EdgeCase) => `${EDGE_CASES[c][0]}T10:00:00Z`;

  // root: before any agent log → unknown.
  write('README.md', ['# Edge fixture', 'Edge cases for the never-human rule.']);
  await commit('root', '2026-10-01T09:00:00Z', 'chore: initial human commit');
  // Case 1: the agent wrote the file with a Bash heredoc (no bashEditDiff) and ran `git commit` itself.
  write(EDGE_CASES.bash[1], EDGE_LINES.bash);
  await commit('bash', at('bash'), 'feat: generated via bash');
  // Case 2: a teammate's branch, merged by self with --no-ff (git pull style). The teammate commit
  // is off the first-parent chain; the merge's first-parent diff carries the teammate's lines.
  await git(['checkout', '-q', '-b', 'teammate']);
  write(EDGE_CASES.merge[1], EDGE_LINES.friend);
  await commit('friend', '2026-10-03T08:00:00Z', 'feat: teammate module', TEAMMATE);
  await git(['checkout', '-q', 'main']);
  await git(['merge', '-q', '--no-ff', '-m', "Merge branch 'teammate'", 'teammate'], as(SELF, at('merge')));
  commits['merge'] = { sha: await git(['rev-parse', 'HEAD']), date: at('merge') };
  // Cases 3a–3c and 4: agent-written lines whose log records the parser drops or can't place.
  write(EDGE_CASES.oversized[1], EDGE_LINES.oversized);
  await commit('oversized', at('oversized'), 'feat: edit inside a very large file');
  write(EDGE_CASES.malformed[1], EDGE_LINES.malformed);
  await commit('malformed', at('malformed'), 'feat: edit logged on a malformed line');
  write(EDGE_CASES.noCwd[1], EDGE_LINES.noCwd);
  await commit('noCwd', at('noCwd'), 'feat: write from a session whose head has no cwd');
  write(EDGE_CASES.symlinked[1], EDGE_LINES.symlinked);
  await commit('symlinked', at('symlinked'), 'feat: write through a symlinked cwd');
  write(EDGE_CASES.caseVariant[1], EDGE_LINES.caseVariant);
  await commit('caseVariant', at('caseVariant'), 'feat: write through a case-variant cwd');
  // Positive control: human text inside an idle session's coverage → human.
  write(EDGE_CASES.control[1], EDGE_LINES.control);
  await commit('control', at('control'), 'docs: human control notes');
  // Case 2b: an agent-run `git merge` of a teammate branch; merge output names no SHA.
  const teammateBranch = async (branch: string, id: string, c: EdgeCase, lines: string[]) => {
    await git(['checkout', '-q', '-b', branch]);
    write(EDGE_CASES[c][1], lines);
    await commit(id, `${EDGE_CASES[c][0]}T08:00:00Z`, `feat: ${branch} module`, TEAMMATE);
    await git(['checkout', '-q', 'main']);
  };
  await teammateBranch('teammate3', 'friend3', 'agentMerge', EDGE_LINES.agentMerge);
  await git(['merge', '-q', '--no-ff', '-m', "Merge branch 'teammate3'", 'teammate3'], as(SELF, at('agentMerge')));
  commits['agentMerge'] = { sha: await git(['rev-parse', 'HEAD']), date: at('agentMerge') };
  // Case 2c: a merge where self adds resolution lines no parent has (an "evil merge").
  await teammateBranch('teammate4', 'friend4', 'resolvedMerge', EDGE_LINES.resolvedTeam);
  await git(['merge', '-q', '--no-ff', '--no-commit', 'teammate4'], as(SELF, at('resolvedMerge')));
  write(EDGE_CASES.resolvedMerge[1], [...EDGE_LINES.resolvedTeam, ...EDGE_LINES.resolvedSelf]);
  await commit('resolvedMerge', at('resolvedMerge'), "Merge branch 'teammate4'");
  // Cases 3d–3f: a transcript with no cwd anywhere, an edit record missing its uuid, and an
  // edit path under the cwd that doesn't relativise. Cases 4c–4d: a cwd logged as /var/… for a repo at /private/var/… (macOS), and a cwd that is a
  // symlink to a subdirectory of the repo.
  for (const c of ['cwdless', 'noUuid', 'dotdot', 'varCwd', 'symlinkedSub'] as const) {
    write(EDGE_CASES[c][1], EDGE_LINES[c]);
    await commit(c, at(c), `feat: agent-written ${c} module`);
  }
  return { dir, commits };
}
