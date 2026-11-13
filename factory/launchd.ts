// Loading and removing the scheduled job (R11), and the ticket labels. The human runs these;
// nothing in a tick calls them.
import { copyFileSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { LABELS, type Config } from './config.js';
import type { Exec } from './exec.js';

export const JOB_LABEL = 'dev.commet.agent-runner';

export interface InstallDeps {
  exec: Exec;
  print: (line: string) => void;
  printErr: (line: string) => void;
  uid: number;
  user: string;
  /** Node binary the job runs. */
  node: string;
  /** Directory holding the compiled runner (`factory/dist`). */
  distDir: string;
}

export const plistPath = (home: string) => join(home, 'Library/LaunchAgents', `${JOB_LABEL}.plist`);
export const installDir = (cfg: Config) => join(cfg.stateDir, 'bin');

/** The job's PATH (Research): the directories of claude, node (npm), gh and qodo, then the system's. */
function jobPath(cfg: Config, node: string): string {
  const dirs = [dirname(cfg.claude), dirname(node), dirname(cfg.gh), dirname(cfg.qodo), '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  return [...new Set(dirs)].join(':');
}

const bootout = (d: InstallDeps) => d.exec('launchctl', ['bootout', `gui/${d.uid}/${JOB_LABEL}`], { timeoutMs: 30_000 });

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderPlist(o: { cfg: Config; node: string; user: string; intervalSec: number }): string {
  const { cfg } = o;
  const args = [o.node, join(installDir(cfg), 'bin.js'), 'tick', '--repo', cfg.repoDir, '--base', cfg.base, '--github', cfg.slug];
  const env: [string, string][] = [['PATH', jobPath(cfg, o.node)], ['HOME', cfg.home], ['USER', o.user]];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    `  <key>Label</key><string>${JOB_LABEL}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    ...args.map((a) => `    <string>${xml(a)}</string>`),
    '  </array>',
    '  <key>EnvironmentVariables</key>',
    '  <dict>',
    ...env.map(([k, v]) => `    <key>${k}</key><string>${xml(v)}</string>`),
    '  </dict>',
    `  <key>WorkingDirectory</key><string>${xml(cfg.repoDir)}</string>`,
    `  <key>StartInterval</key><integer>${o.intervalSec}</integer>`,
    '  <key>RunAtLoad</key><false/>',
    `  <key>StandardOutPath</key><string>${xml(join(cfg.stateDir, 'launchd.out.log'))}</string>`,
    `  <key>StandardErrorPath</key><string>${xml(join(cfg.stateDir, 'launchd.err.log'))}</string>`,
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

/**
 * Copies the compiled runner to `<git-common-dir>/factory/bin` (so a branch switch in the main
 * checkout can't change the code that runs), writes the LaunchAgent and loads it. The copy is
 * staged in `bin.new` and swapped in whole, so a failed update keeps the runner that was there.
 */
export async function install(cfg: Config, d: InstallDeps, intervalSec: number): Promise<number> {
  const bin = installDir(cfg);
  const plist = plistPath(cfg.home);
  const text = renderPlist({ cfg, node: d.node, user: d.user, intervalSec });
  if (cfg.dryRun) {
    d.print(`would copy the compiled runner to ${bin}\nwould write ${plist}:\n${text}would run launchctl bootstrap gui/${d.uid} ${plist}\n`);
    return 0;
  }
  let files: string[];
  try {
    files = readdirSync(d.distDir).filter((x) => x.endsWith('.js'));
  } catch {
    files = [];
  }
  if (!files.includes('bin.js')) {
    d.printErr('no compiled runner to install; run npm run factory:build first. Nothing changed.\n');
    return 1;
  }
  const staged = `${bin}.new`;
  rmSync(staged, { recursive: true, force: true });
  mkdirSync(staged, { recursive: true });
  for (const f of files) copyFileSync(join(d.distDir, f), join(staged, f));
  writeFileSync(join(staged, 'package.json'), '{ "type": "module" }\n');
  rmSync(bin, { recursive: true, force: true });
  renameSync(staged, bin);
  mkdirSync(join(cfg.home, 'Library/LaunchAgents'), { recursive: true });
  writeFileSync(plist, text);
  // Reloading replaces an older copy of the job; "not loaded" is fine.
  await bootout(d);
  const res = await d.exec('launchctl', ['bootstrap', `gui/${d.uid}`, plist], { timeoutMs: 30_000 });
  if (res.code !== 0) {
    d.printErr(`launchctl bootstrap failed (exit ${res.code}): ${res.stderr.trim()}\nThe job is not loaded; fix that and re-run install.\n`);
    return 1;
  }
  d.print(`installed ${JOB_LABEL}: a tick every ${intervalSec} s; logs in ${cfg.stateDir}\n`);
  return 0;
}

/** Unloads the job and removes the plist and the installed copy. Run logs stay. */
export async function uninstall(cfg: Config, d: InstallDeps): Promise<number> {
  const plist = plistPath(cfg.home);
  if (cfg.dryRun) {
    d.print(`would run launchctl bootout gui/${d.uid}/${JOB_LABEL}\nwould remove ${plist} and ${installDir(cfg)}\n`);
    return 0;
  }
  const res = await bootout(d);
  rmSync(plist, { force: true });
  rmSync(installDir(cfg), { recursive: true, force: true });
  d.print(`uninstalled ${JOB_LABEL}${res.code === 0 ? '' : ' (it was not loaded)'}; run logs kept in ${cfg.stateDir}\n`);
  return 0;
}

export const LABEL_DEFS: { name: string; color: string; description: string }[] = [
  { name: LABELS.ready, color: '0E8A16', description: 'Owner-approved ticket for the agent runner' },
  { name: LABELS.working, color: 'FBCA04', description: 'The agent runner has claimed this ticket' },
  { name: LABELS.help, color: 'D93F0B', description: 'The agent runner stopped or refused; a human is needed' },
  { name: LABELS.done, color: '5319E7', description: 'The agent runner finished; the PR awaits the human' },
  { name: LABELS.proposal, color: 'C5DEF5', description: 'A Qodo finding that keeps recurring, proposed as a rule; the human decides' },
];

/** Creates or updates the runner's labels; `--force` makes it idempotent. */
export async function setupLabels(cfg: Config, d: Pick<InstallDeps, 'exec' | 'print'>): Promise<number> {
  let failed = 0;
  for (const l of LABEL_DEFS) {
    const args = ['label', 'create', l.name, '--repo', cfg.slug, '--color', l.color, '--description', l.description, '--force'];
    if (cfg.dryRun) {
      d.print(`would run gh ${args.join(' ')}\n`);
      continue;
    }
    const res = await d.exec(cfg.gh, args, { timeoutMs: cfg.timeouts.gh });
    d.print(`${res.code === 0 ? 'ok' : `FAILED (exit ${res.code})`} ${l.name}\n`);
    if (res.code !== 0) failed++;
  }
  return failed ? 1 : 0;
}
