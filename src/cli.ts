#!/usr/bin/env node
import { main } from './cli/main.js';
import { terminalAsk } from './cli/roots.js';

process.exitCode = await main(process.argv.slice(2), {
  stdout: (t) => process.stdout.write(t),
  stderr: (t) => process.stderr.write(t),
  cwd: process.cwd(),
  env: process.env,
  ask: terminalAsk(process.stdin, process.stdout),
});
