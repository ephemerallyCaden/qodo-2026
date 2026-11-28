// The monitor's folder holds no account data (live-demo L7): the Checkly key, account id and alert email
// live only in ~/.config/commet/checkly.env and reach the CLI at deploy time (monitoring/checkly/scripts/
// checkly.sh). A canary over every file in monitoring/ (its own node_modules and run output aside) for
// anything shaped like them, and the key file's mode check, which runs without a key.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { privacyHits } from '../.claude/skills/visual-proof/scripts/privacy.js';
import { tempDir } from './fixtures/tmp.js';

const ROOT = join(import.meta.dirname, '..');
const MONITORING = join(ROOT, 'monitoring');
const SKIP = new Set(['node_modules', 'test-results', 'playwright-report', '.checkly']);

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (SKIP.has(e.name) ? []
    : e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
}

const SHAPES: readonly { what: string; re: RegExp }[] = [
  { what: 'an email address', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/ },
  { what: 'a Checkly API key', re: /\bcu_[A-Za-z0-9]{16,}/ },
  { what: 'an account id (a UUID)', re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i },
  { what: 'a key-file value', re: /CHECKLY_(?:API_KEY|ACCOUNT_ID|ALERT_EMAIL)[ \t]*=[ \t]*(?![<$"'`\s]|\.\.\.)\S/ },
];

/** What in `text` is shaped like account data: the shapes above, and visual-proof's secret prefixes. */
function accountData(where: string, text: string): string[] {
  return [
    ...SHAPES.filter((s) => s.re.test(text)).map((s) => `${where}: ${s.what}`),
    ...privacyHits([{ where, text }], { literals: [] }).filter((h) => h.rule === 'secret prefix').map((h) => `${where}: ${h.rule}`),
  ];
}

describe('monitoring/', () => {
  const all = existsSync(MONITORING) ? files(MONITORING) : [];

  it('holds the monitor (not vacuous)', () => {
    expect(all.map((f) => relative(MONITORING, f))).toEqual(expect.arrayContaining(['checkly/checkly.config.ts', 'checkly/__checks__/demo.check.ts', 'checkly/scripts/checkly.sh']));
  });

  it('holds no key, account id, alert email or key file', () => {
    expect(all.filter((f) => f.endsWith('.env')).map((f) => relative(ROOT, f))).toEqual([]);
    expect(all.flatMap((f) => accountData(relative(ROOT, f), readFileSync(f, 'utf8')))).toEqual([]);
  });

  it('the canary catches each shape', () => {
    // built from parts, so this file holds none of them whole
    const at = '@';
    for (const sample of [`alerts${at}example.com`, `cu_${'Ab3'.repeat(8)}`, `${'0123abcd'}-1234-5678-9abc-${'def012345678'}`,
      `CHECKLY_API_KEY=${'x'.repeat(10)}`, `ghp_${'A1b2'.repeat(6)}`]) {
      expect(accountData('sample', sample), sample).not.toEqual([]);
    }
    for (const fine of ['CHECKLY_API_KEY=<your key>', 'CHECKLY_ALERT_EMAIL=...', 'export "$k=$v"', '@playwright/test', 'checkly@10.5.0']) {
      expect(accountData('sample', fine), fine).toEqual([]);
    }
  });
});

describe('monitoring/checkly/scripts/checkly.sh', () => {
  const SCRIPT = join(MONITORING, 'checkly/scripts/checkly.sh');
  const run = (file: string) => spawnSync('sh', [SCRIPT, 'env-check'], { encoding: 'utf8', env: { ...process.env, CHECKLY_ENV_FILE: file } });
  const secret = `cu_${'Zz9'.repeat(8)}`;
  const keyFile = (mode: number) => {
    const file = join(tempDir('commet-checkly-'), 'checkly.env');
    writeFileSync(file, `CHECKLY_API_KEY=${secret}\nCHECKLY_ACCOUNT_ID=acct-test\nCHECKLY_ALERT_EMAIL=alerts\n`);
    chmodSync(file, mode);
    return file;
  };

  it('refuses a key file whose mode isn\'t 0600, and a missing one', () => {
    for (const mode of [0o644, 0o640, 0o400]) {
      const r = run(keyFile(mode));
      expect(r.status, mode.toString(8)).toBe(2);
      expect(r.stderr).toMatch(/must be 600/);
    }
    expect(run(join(tempDir('commet-checkly-'), 'none.env')).status).toBe(2);
  });

  /**
   * A folder holding a fake `stat` in GNU's manner (`-c %a` is the mode; `-f` is the filesystem's status, and
   * succeeds) or BSD's (`-f %Lp` is the mode; `-c` is an illegal option), so both are tried on any host.
   */
  const fakeStat = (kind: 'gnu' | 'bsd') => {
    const bin = join(tempDir('commet-stat-'), 'bin');
    mkdirSync(bin);
    const mode = `node -e 'process.stdout.write((require("fs").statSync(process.argv[1]).mode & 0o777).toString(8) + "\\n")' "$3"`;
    const body = kind === 'gnu'
      ? `case $1 in -c) ${mode} ;; -f) echo '  File: "'"$3"'"'; echo '    ID: 0 Namelen: 255 Type: ext2/ext3' ;; *) exit 1 ;; esac`
      : `case $1 in -f) ${mode} ;; *) echo "stat: illegal option -- \${1#-}" >&2; exit 1 ;; esac`;
    writeFileSync(join(bin, 'stat'), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, 'stat'), 0o755);
    return bin;
  };

  it('reads the mode with GNU stat (Linux, CI) and BSD stat (macOS) alike (CI e53efa6)', () => {
    for (const kind of ['gnu', 'bsd'] as const) {
      const env = { ...process.env, PATH: `${fakeStat(kind)}:${process.env['PATH'] ?? ''}` };
      const go = (file: string) => spawnSync('sh', [SCRIPT, 'env-check'], { encoding: 'utf8', env: { ...env, CHECKLY_ENV_FILE: file } });
      const ok = go(keyFile(0o600));
      expect(ok.status, `${kind}: ${ok.stderr}`).toBe(0);
      const open = go(keyFile(0o644));
      expect(open.status, kind).toBe(2);
      expect(open.stderr, kind).toMatch(/mode is 644; it must be 600/);
    }
  });

  /**
   * A copy of the monitor's folder (its package.json and the script) with, as asked, a fake installed CLI
   * that reports `version` and records how it was run, and a fake `npx` on PATH that records any call.
   */
  const project = (cli: string | null) => {
    const dir = tempDir('commet-checkly-project-');
    mkdirSync(join(dir, 'scripts'));
    writeFileSync(join(dir, 'scripts/checkly.sh'), readFileSync(SCRIPT));
    writeFileSync(join(dir, 'package.json'), readFileSync(join(MONITORING, 'checkly/package.json')));
    const record = join(dir, 'ran.txt');
    const bin = join(dir, 'fake-bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'npx'), `#!/bin/sh\necho "npx $*" >> "${record}"\n`);
    chmodSync(join(bin, 'npx'), 0o755);
    if (cli !== null) {
      mkdirSync(join(dir, 'node_modules/.bin'), { recursive: true });
      writeFileSync(join(dir, 'node_modules/.bin/checkly'), `#!/bin/sh\nif [ "$1" = --version ]; then echo "checkly/${cli} linux-x64 node-v22.13.0"; exit 0; fi\n` +
        `echo "checkly $* drill=\${CHECKLY_FAIL_DRILL:-} key=\${#CHECKLY_API_KEY}" >> "${record}"\n`);
      chmodSync(join(dir, 'node_modules/.bin/checkly'), 0o755);
    }
    const go = (cmd: string) => spawnSync('sh', [join(dir, 'scripts/checkly.sh'), cmd], { encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}`, CHECKLY_ENV_FILE: keyFile(0o600) } });
    return { go, ran: () => (existsSync(record) ? readFileSync(record, 'utf8') : '') };
  };
  const pinned = (JSON.parse(readFileSync(join(MONITORING, 'checkly/package.json'), 'utf8')) as { devDependencies: Record<string, string> }).devDependencies['checkly']!;

  it('deploys only with the folder\'s own pinned CLI, never one npx would fetch (Qodo PR256 59c5ca8d)', () => {
    // not installed: refused before the key is read, and npx is never asked
    const bare = project(null);
    for (const cmd of ['deploy', 'drill', 'restore']) {
      const r = bare.go(cmd);
      expect(r.status, cmd).toBe(2);
      expect(r.stderr, cmd).toMatch(/npm ci/);
    }
    expect(bare.ran()).toBe('');
    // installed at another version: refused too
    const other = project('9.9.9');
    expect(other.go('deploy').status).toBe(2);
    expect(other.ran()).toBe('');
    // the pinned one: run with the key in its environment, the drill flag only for the drill
    const ok = project(pinned);
    for (const cmd of ['deploy', 'drill', 'restore']) expect(ok.go(cmd).status, cmd).toBe(0);
    expect(ok.ran().trim().split('\n')).toEqual([
      `checkly deploy --force drill= key=${secret.length}`, `checkly deploy --force drill=1 key=${secret.length}`, `checkly deploy --force drill= key=${secret.length}`]);
  });

  it('takes a 0600 key file and names what it sets, never printing a value', () => {
    const r = run(keyFile(0o600));
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('sets CHECKLY_API_KEY CHECKLY_ACCOUNT_ID CHECKLY_ALERT_EMAIL');
    expect(`${r.stdout}${r.stderr}`).not.toContain(secret);
    expect(`${r.stdout}${r.stderr}`).not.toContain('acct-test');
  });
});

describe('CI', () => {
  it('runs the monitor\'s own typecheck, and its spec and drill test against a local build (Qodo PR256 39fd103c)', () => {
    const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    const job = /\n {2}monitoring:\n([\s\S]*?)(?=\n {2}[a-z][\w-]*:\n|$)/.exec(ci)?.[1] ?? '';
    expect(job, 'a monitoring job in .github/workflows/ci.yml').not.toBe('');
    expect(job).toMatch(/working-directory: monitoring\/checkly/);
    for (const step of ['npm ci', 'npm run typecheck', 'npm run test:local']) expect(job, step).toContain(`run: ${step}`);
    expect(job, 'never against the live site from CI').not.toMatch(/run: npm test\b|DEMO_URL/);
    // the repo's CI rules (#234): read-only, no secrets, every checkout without the token
    expect(job).toMatch(/\n {4}permissions:\n {6}contents: read\n(?! {6})/);
    expect(job).not.toMatch(/secrets\./);
    expect(job).toMatch(/uses: actions\/checkout@v4\n {8}with:\n {10}persist-credentials: false/);
    expect(job, 'the render job\'s pinned container').toContain(/image: (\S+@sha256:[0-9a-f]{64})/.exec(ci.slice(ci.indexOf('\n  render:')))![1]);
  });
});

