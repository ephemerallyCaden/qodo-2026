#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './cli.js';
import { killAllChildren, realExec } from './exec.js';
import { realClock } from './log.js';

// If launchd (or a Ctrl-C) stops the runner mid-run, take its children down with it: SIGTERM
// first, so a locked inner tick can stop its own children, then SIGKILL.
const SIGNALS = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 } as const;
for (const [signal, n] of Object.entries(SIGNALS)) {
  process.once(signal, () => {
    killAllChildren('SIGTERM');
    setTimeout(() => {
      killAllChildren('SIGKILL');
      process.exit(128 + n);
    }, 2_000);
  });
}

const home = homedir();
// The job runs mise's stable `node/22` symlink when it exists, so a patch update doesn't break it.
const stableNode = join(home, '.local/share/mise/installs/node/22/bin/node');

process.exitCode = await main(process.argv.slice(2), {
  exec: realExec(),
  clock: realClock,
  env: process.env,
  cwd: process.cwd(),
  home,
  uid: process.getuid?.() ?? 0,
  user: userInfo().username,
  node: process.argv.includes('install') && existsSync(stableNode) ? stableNode : process.execPath,
  script: fileURLToPath(import.meta.url),
  print: (t) => process.stdout.write(t),
  printErr: (t) => process.stderr.write(t),
});
