// The monitor's folder holds no account data (live-demo L7): the Checkly key, account id and alert email
// live only in ~/.config/commet/checkly.env and reach the CLI at deploy time (monitoring/checkly/scripts/
// checkly.sh). A canary over every file in monitoring/ (its own node_modules and run output aside) for
// anything shaped like them, and the key file's mode check, which runs without a key.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

  it('takes a 0600 key file and names what it sets, never printing a value', () => {
    const r = run(keyFile(0o600));
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('sets CHECKLY_API_KEY CHECKLY_ACCOUNT_ID CHECKLY_ALERT_EMAIL');
    expect(`${r.stdout}${r.stderr}`).not.toContain(secret);
    expect(`${r.stdout}${r.stderr}`).not.toContain('acct-test');
  });
});
