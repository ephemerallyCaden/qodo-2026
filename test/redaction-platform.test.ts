// Issue #5 case 6: metaToken's home/temp redaction must match whole path segments and give the
// same result on macOS and Linux. Platform dirs are simulated by mocking node:os before the
// parser module loads (PRIVATE_DIRS is computed at import time). `bug(...)` tests are `it.fails`
// until the fix; run with ISSUE5_STRICT=1 to see the real failures.
import { realpathSync } from 'node:fs';
import { tmpdir as realTmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

const bug = process.env['ISSUE5_STRICT'] === '1' ? it : it.fails;

/** Loads a fresh copy of the parser with the given home and temp dirs (temp must exist). */
async function metaTokenWith(dirs: { home: string; tmp: string }) {
  vi.resetModules();
  vi.doMock('node:os', async (orig) => ({ ...(await orig<typeof import('node:os')>()), homedir: () => dirs.home, tmpdir: () => dirs.tmp }));
  return (await import('../src/attrib/parsers/claude.js')).metaToken;
}

const LINUX = { home: '/home/dev', tmp: '/tmp' };
const LINUX_ROOT = { home: '/root', tmp: '/tmp' };
const MACOS = { home: '/Users/dev', tmp: realpathSync(realTmpdir()) };
/** Ordinary branch names that merely contain "tmp", "root" or "dev" inside a segment. */
const BRANCHES = ['fix/tmp-cleanup', 'feature/html-tmpl', 'fix/root-cause', 'chore/uproot-deps', 'feature/dev-tools', 'main'];

afterEach(() => {
  vi.doUnmock('node:os');
  vi.resetModules();
});

describe('Issue #5 case 6: metaToken redaction is segment-based and platform-independent', () => {
  it('setup: the mock reaches the parser (a Linux temp path is still rejected)', async () => {
    const metaToken = await metaTokenWith(LINUX);
    expect(metaToken('tmp/commet-x/y')).toBeUndefined();
    expect(metaToken('home/dev/notes')).toBeUndefined();
  });

  bug('case 6: on Linux (tmpdir /tmp) a branch containing "tmp" inside a segment is kept', async () => {
    const metaToken = await metaTokenWith(LINUX);
    expect(['fix/tmp-cleanup', 'feature/html-tmpl'].map((b) => metaToken(b))).toEqual(['fix/tmp-cleanup', 'feature/html-tmpl']);
  });

  bug('case 6: as root on Linux (homedir /root) a branch containing "root" inside a segment is kept', async () => {
    const metaToken = await metaTokenWith(LINUX_ROOT);
    expect(['fix/root-cause', 'chore/uproot-deps'].map((b) => metaToken(b))).toEqual(['fix/root-cause', 'chore/uproot-deps']);
  });

  bug('case 6: the same branch names give the same tokens on macOS and Linux', async () => {
    const mac = (await metaTokenWith(MACOS));
    const onMac = BRANCHES.map((b) => mac(b));
    const linux = (await metaTokenWith(LINUX_ROOT));
    expect(BRANCHES.map((b) => linux(b))).toEqual(onMac);
  });
});
