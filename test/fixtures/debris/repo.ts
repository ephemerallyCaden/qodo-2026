// The debris fixture repo (R13): a scripted repo with backdated branches, a remote, and live, prunable, detached
// and locked worktrees, so every debris class and every exclusion comes out the same on every machine. See
// README.md beside it for each branch and what it covers. Shared by the debris scan tests and the renderer's
// manual checks.
import { execFile } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface Who { name: string; email: string }

/** You: `user.email` in the repo's config. */
export const NOVA: Who = { name: 'Nova Reyes', email: 'nova@debris.test' };
/** A teammate. */
export const PIP: Who = { name: 'Pip Okafor', email: 'pip@debris.test' };
/** Agents: Claude on the web, and Cursor's cloud agent. */
export const CLAUDE: Who = { name: 'Claude', email: 'noreply@anthropic.com' };
export const CURSOR: Who = { name: 'Cursor Agent', email: 'cursoragent@cursor.com' };
/** A bot that isn't an agent. */
export const DEPENDABOT: Who = { name: 'dependabot[bot]', email: '49699333+dependabot[bot]@users.noreply.github.com' };

export const IDENTITIES: readonly Who[] = [NOVA, PIP, CLAUDE, CURSOR, DEPENDABOT];

/** HEAD's committer date: every age is counted back from it. */
export const HEAD_DATE = '2026-10-31T12:00:00Z';

/** A refname that would run code if pasted unquoted: a leading `-`, `;`, `$(…)`, a quote and backticks. */
export const HOSTILE = "-x;touch${IFS}pwned;$(touch${IFS}pwned2)'q`touch${IFS}pwned3`";
/** A refname with a right-to-left override (legal in refnames): no command may be built from it. */
export const BIDI = 'rtl\u202Eevil';
/** A path holding U+0001, a newline and a tab (AGENTS.md Rule 7), added on `shipped`. */
export const ODD_PATH = 'ui/odd\u0001na\nme\t.ts';
/** A lock reason with a path in it: it must never reach any output. */
export const LOCK_REASON = 'kept for /Users/someone/secret-project';

/** The items the scan finds, by name (`null`: the detached worktree), with their class. */
export const EXPECTED = {
  ancient: 'branch', 'old-feature': 'branch', 'deps/bump': 'branch', [HOSTILE]: 'branch', [BIDI]: 'branch', 'half-rebased': 'branch',
  'origin/stale-remote': 'branch', 'locked-old': 'branch', rebased: 'merged', shipped: 'merged', 'origin/old-release': 'merged',
  'agent/claude-fix': 'agent', 'wt-agent': 'agent', 'gone-wt': 'agent', null: 'agent',
} as const;

/** Refs that are never debris here, each for its own reason (README.md). */
export const NOT_DEBRIS = ['young', 'agent/recent', 'just-merged', 'fresh', 'main', 'origin/main', 'session/s1', 'origin/session/s1', 'origin/HEAD'];

export interface DebrisRepo {
  /** The repo (the scan's cwd). Its worktrees sit beside it under the same root. */
  dir: string;
  root: string;
  head: string;
  shas: Record<string, string>;
}

/**
 * Builds the debris repo under `root`, which must be empty or absent; the scan tests pass a temp dir from
 * test/fixtures/tmp.ts. The repo is `<root>/repo`, its bare remote `<root>/origin.git` and its worktrees
 * `<root>/wt/…`. Run `commet scan --no-root --no-ingest` in `dir`: `engine/`, `ui/` and `docs/` are the
 * planets and `README.md` sits on the star.
 */
export async function buildDebrisRepo(root: string): Promise<DebrisRepo> {
  mkdirSync(root, { recursive: true });
  if (readdirSync(root).length > 0) throw new Error('buildDebrisRepo needs an empty folder');
  const dir = join(root, 'repo');
  const wt = (name: string) => join(root, 'wt', name);
  mkdirSync(dir);
  mkdirSync(join(root, 'wt'));
  const git = async (args: string[], env: Record<string, string> = {}, cwd = dir) =>
    (await run('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } })).stdout.trim();
  await git(['init', '-q', '--bare', join(root, 'origin.git')], {}, root);
  await git(['init', '-q', '-b', 'main']);
  for (const [k, v] of [['user.name', NOVA.name], ['user.email', NOVA.email], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false'],
    ['init.defaultBranch', 'main']] as const) await git(['config', k, v]);
  await git(['remote', 'add', 'origin', join(root, 'origin.git')]);

  const shas: Record<string, string> = {};
  /** Appends a line to each file in `cwd` and commits them as `who` at `date` (author and committer). */
  const commit = async (who: Who, date: string, subject: string, paths: string[], cwd = dir) => {
    for (const p of paths) {
      const file = join(cwd, p);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `// ${subject}\n`, { flag: 'a' });
    }
    await git(['add', '-A'], {}, cwd);
    await git(['commit', '-q', '-m', subject], {
      GIT_AUTHOR_NAME: who.name, GIT_AUTHOR_EMAIL: who.email, GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_NAME: who.name, GIT_COMMITTER_EMAIL: who.email, GIT_COMMITTER_DATE: date,
    }, cwd);
    return git(['rev-parse', 'HEAD'], {}, cwd);
  };
  const branchAt = async (name: string, at: string) => git(['checkout', '-q', '-b', name, at]);
  const at = (date: string) => `${date}T10:00:00Z`;

  shas['c0'] = await commit(NOVA, at('2026-01-01'), 'c0: start', ['README.md', 'engine/core.ts', 'ui/panel.ts', 'docs/guide.md']);
  // Abandoned: unmerged and 30+ days before HEAD, in each decay step.
  await branchAt('ancient', shas['c0']);
  shas['ancient'] = await commit(PIP, at('2026-03-01'), 'ancient: a panel idea', ['ui/panel.ts']);
  await branchAt('old-feature', shas['c0']);
  shas['old-feature'] = await commit(PIP, at('2026-08-01'), 'old-feature: new engine part', ['engine/core.ts', 'engine/new.ts']);
  // A bot's branch is abandoned, not an agent's.
  await branchAt('deps/bump', shas['c0']);
  shas['deps/bump'] = await commit(DEPENDABOT, at('2026-09-20'), 'deps: bump', ['README.md']);
  // Hostile and invisible-character names (`git branch` refuses a leading `-`; update-ref doesn't).
  await git(['checkout', '-q', '--detach', shas['c0']]);
  shas[HOSTILE] = await commit(NOVA, at('2026-09-01'), 'hostile name', ['engine/core.ts']);
  await git(['update-ref', `refs/heads/${HOSTILE}`, shas[HOSTILE]]);
  await git(['checkout', '-q', '--detach', shas['c0']]);
  shas[BIDI] = await commit(NOVA, at('2026-09-02'), 'bidi name', ['docs/guide.md']);
  await git(['update-ref', `refs/heads/${BIDI}`, shas[BIDI]]);
  // Unmerged, only on the remote, 30+ days.
  await branchAt('stale-remote', shas['c0']);
  shas['stale-remote'] = await commit(PIP, at('2026-09-01'), 'stale-remote: an experiment', ['engine/core.ts']);
  await git(['push', '-q', 'origin', 'stale-remote']);
  await git(['checkout', '-q', '--detach']);
  await git(['branch', '-q', '-D', 'stale-remote']);
  // Young: unmerged but 20 days old, so not debris yet.
  await branchAt('young', shas['c0']);
  shas['young'] = await commit(PIP, at('2026-10-11'), 'young: still going', ['ui/panel.ts']);
  // Locked worktree on an abandoned branch.
  await branchAt('locked-old', shas['c0']);
  shas['locked-old'] = await commit(PIP, at('2026-09-10'), 'locked-old: parked', ['docs/guide.md']);

  // The main line.
  await git(['checkout', '-q', 'main']);
  shas['c1'] = await commit(NOVA, at('2026-06-01'), 'c1: engine', ['engine/core.ts']);
  // Rebased, then merged (its change picked onto main), its upstream gone; and half of one.
  await branchAt('rebased', shas['c1']);
  shas['rebased'] = await commit(PIP, at('2026-08-20'), 'rebased: panel copy', ['ui/panel.ts']);
  await branchAt('half-rebased', shas['c1']);
  shas['half-a'] = await commit(PIP, at('2026-09-15'), 'half-rebased: guide', ['docs/guide.md']);
  shas['half-rebased'] = await commit(PIP, '2026-09-15T11:00:00Z', 'half-rebased: engine', ['engine/extra.ts']);
  for (const b of ['rebased', 'half-rebased']) {
    await git(['config', `branch.${b}.remote`, 'origin']);
    await git(['config', `branch.${b}.merge`, `refs/heads/${b}`]);
  }
  await git(['checkout', '-q', 'main']);
  const pick = { GIT_COMMITTER_NAME: NOVA.name, GIT_COMMITTER_EMAIL: NOVA.email };
  await git(['cherry-pick', shas['rebased']], { ...pick, GIT_COMMITTER_DATE: at('2026-09-10') });
  await git(['cherry-pick', shas['half-a']], { ...pick, GIT_COMMITTER_DATE: at('2026-09-16') });
  shas['c3'] = await git(['rev-parse', 'HEAD']);
  // Merged into HEAD and pushed (its upstream folds in), 30 days old; its tip adds a Rule 7 path.
  await branchAt('shipped', shas['c3']);
  shas['shipped'] = await commit(PIP, at('2026-10-01'), 'shipped: odd file', [ODD_PATH, 'ui/panel.ts']);
  await git(['push', '-q', '-u', 'origin', 'shipped']);
  await git(['checkout', '-q', 'main']);
  await git(['merge', '-q', '--no-ff', '-m', 'merge shipped', 'shipped'], {
    GIT_AUTHOR_DATE: at('2026-10-02'), GIT_COMMITTER_DATE: at('2026-10-02') });
  shas['merge'] = await git(['rev-parse', 'HEAD']);
  // Merged, only on the remote, 45 days.
  await git(['push', '-q', 'origin', `${shas['c3']}:refs/heads/old-release`]);
  await git(['push', '-q', 'origin', 'main']);
  await git(['remote', 'set-head', 'origin', 'main']);

  // Agents' branches: idle 10 days (debris), 3 days (not yet), and one in a live worktree, 15 days.
  await branchAt('agent/claude-fix', shas['c3']);
  shas['agent/claude-fix'] = await commit(CLAUDE, at('2026-10-21'), 'agent: fix core', ['engine/core.ts']);
  await branchAt('agent/recent', shas['c3']);
  shas['agent/recent'] = await commit(CLAUDE, at('2026-10-28'), 'agent: recent', ['ui/panel.ts']);
  await branchAt('wt-agent', shas['c3']);
  shas['wt-agent'] = await commit(CURSOR, at('2026-10-16'), 'agent: guide', ['docs/guide.md']);
  await branchAt('gone-wt', shas['c3']);
  shas['gone-wt'] = await commit(PIP, at('2026-10-29'), 'gone-wt: fresh work', ['ui/panel.ts']);

  // HEAD: session/s1, its upstream pushed at the merge (merged, past the grace: still never debris).
  await git(['checkout', '-q', '-b', 'session/s1', shas['merge']]);
  await git(['push', '-q', '-u', 'origin', 'session/s1']);
  shas['just-merged'] = await commit(NOVA, at('2026-10-30'), 'session: nearly there', ['engine/core.ts']);
  await git(['branch', 'just-merged', shas['just-merged']]);
  shas['head'] = await commit(NOVA, HEAD_DATE, 'session: head', ['engine/core.ts']);
  await git(['branch', 'fresh', shas['head']]);

  // Worktrees: live (wt-agent), prunable (gone-wt, and a detached one with a commit of its own), locked.
  await git(['worktree', 'add', '-q', wt('wt-agent-dir'), 'wt-agent']);
  await git(['worktree', 'add', '-q', wt('gone-dir'), 'gone-wt']);
  await git(['worktree', 'add', '-q', '--detach', wt('detached-dir'), shas['c0']]);
  shas['detached'] = await commit(PIP, at('2026-09-25'), 'detached: lost work', ['engine/core.ts'], wt('detached-dir'));
  await git(['worktree', 'add', '-q', wt('locked-dir'), 'locked-old']);
  await git(['worktree', 'lock', '--reason', LOCK_REASON, wt('locked-dir')]);
  rmSync(wt('gone-dir'), { recursive: true, force: true });
  rmSync(wt('detached-dir'), { recursive: true, force: true });
  return { dir, root, head: shas['head'], shas };
}
