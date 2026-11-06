import { execFile, spawn } from 'node:child_process';

// Pinned so results never depend on the user's git or diff config (design §5).
const CONFIG = [
  '-c', 'core.quotepath=off', '-c', 'diff.renameLimit=4000', '-c', 'log.showSignature=false',
  '-c', 'diff.noprefix=false', '-c', 'diff.mnemonicPrefix=false', '-c', 'diff.relative=false',
  '-c', 'diff.indentHeuristic=true', '-c', 'color.ui=false', '-c', 'i18n.logOutputEncoding=UTF-8',
  // The root commit's patch and numstat are needed; submodules diff as a one-line SHA change.
  '-c', 'log.showRoot=true', '-c', 'diff.submodule=short',
  // git grep output is parsed as `<tree>:<full path>\0<match>`.
  '-c', 'grep.lineNumber=false', '-c', 'grep.column=false', '-c', 'grep.fullName=true',
];
export const DIFF_OPTS = [
  '--no-ext-diff', '--no-textconv', '--no-color', '--diff-algorithm=myers', '-M',
  '--src-prefix=a/', '--dst-prefix=b/',
];
export const LOG_OPTS = ['--first-parent', '-m', '--use-mailmap', ...DIFF_OPTS];

/**
 * Runs git and resolves with its stdout. `stream`, when present, hands stdout over chunk by chunk
 * (UTF-8 decoded across chunk boundaries) for output too large to buffer, such as full history.
 */
export type Git = ((args: string[]) => Promise<string>) & {
  stream?: (args: string[], onData: (chunk: string) => void) => Promise<void>;
};

/** Async runner so independent git queries can run in parallel. */
export function gitRunner(cwd: string): Git {
  const env = { ...process.env, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' };
  const run = (args: string[]) => new Promise<string>((resolve, reject) => {
    const child = execFile('git', [...CONFIG, ...args], { cwd, env, encoding: 'utf8', maxBuffer: 1 << 30 },
      (err, stdout) => (err ? reject(err) : resolve(stdout)));
    child.stdin?.end();
  });
  const stream = (args: string[], onData: (chunk: string) => void) => new Promise<void>((resolve, reject) => {
    const child = spawn('git', [...CONFIG, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'ignore'] });
    let failed: unknown;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (failed !== undefined) return;
      try {
        onData(chunk);
      } catch (e) {
        failed = e;
        child.kill();
      }
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (failed !== undefined) reject(failed);
      else if (code === 0) resolve();
      else reject(Object.assign(new Error(`git ${args[0] ?? ''} exited with ${code}`), { code }));
    });
  });
  return Object.assign(run, { stream });
}

export async function tryGit(git: Git, args: string[]): Promise<string | null> {
  try {
    return await git(args);
  } catch {
    return null;
  }
}
