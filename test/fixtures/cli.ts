import { main } from '../../src/cli/main.js';
import type { Ask } from '../../src/cli/roots.js';

/** Runs the CLI in-process, capturing stdout and stderr. `ask` stands in for a terminal (#71); without it there is none. */
export async function cli(args: string[], cwd: string, env: NodeJS.ProcessEnv, ask?: Ask) {
  let out = '';
  let err = '';
  const code = await main(args, { stdout: (t) => (out += t), stderr: (t) => (err += t), cwd, env, ask });
  return { code, out, err };
}

/** A terminal that answers with `lines` in turn (then end of input), recording each question it was asked. */
export function scripted(lines: string[]): Ask & { asked: string[] } {
  const asked: string[] = [];
  const ask = async (q: string) => {
    asked.push(q);
    return lines.shift() ?? null;
  };
  return Object.assign(ask, { asked });
}
