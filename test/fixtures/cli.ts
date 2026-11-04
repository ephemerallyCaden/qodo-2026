import { main } from '../../src/cli/main.js';

/** Runs the CLI in-process, capturing stdout and stderr. */
export async function cli(args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  let out = '';
  let err = '';
  const code = await main(args, { stdout: (t) => (out += t), stderr: (t) => (err += t), cwd, env });
  return { code, out, err };
}
