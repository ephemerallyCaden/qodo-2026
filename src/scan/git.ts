import { execFile } from 'node:child_process';

// Pinned so results never depend on the user's git or diff config (design §5).
const CONFIG = [
  '-c', 'core.quotepath=off', '-c', 'diff.renameLimit=4000', '-c', 'log.showSignature=false',
  '-c', 'diff.noprefix=false', '-c', 'diff.mnemonicPrefix=false', '-c', 'diff.relative=false',
  '-c', 'diff.indentHeuristic=true', '-c', 'color.ui=false', '-c', 'i18n.logOutputEncoding=UTF-8',
];
export const DIFF_OPTS = [
  '--no-ext-diff', '--no-textconv', '--no-color', '--diff-algorithm=myers', '-M',
  '--src-prefix=a/', '--dst-prefix=b/',
];
export const LOG_OPTS = ['--first-parent', '-m', '--use-mailmap', ...DIFF_OPTS];

export type Git = (args: string[]) => Promise<string>;

/** Async runner so independent git queries can run in parallel. */
export function gitRunner(cwd: string): Git {
  const env = { ...process.env, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' };
  return (args) => new Promise((resolve, reject) => {
    const child = execFile('git', [...CONFIG, ...args], { cwd, env, encoding: 'utf8', maxBuffer: 1 << 30 },
      (err, stdout) => (err ? reject(err) : resolve(stdout)));
    child.stdin?.end();
  });
}

export async function tryGit(git: Git, args: string[]): Promise<string | null> {
  try {
    return await git(args);
  } catch {
    return null;
  }
}
