// Issue #5 case 6: metaToken's home/temp redaction must match whole path segments and give the
// same result on macOS and Linux. Platform dirs are simulated by mocking node:os before the
// parser module loads (PRIVATE_DIRS is computed at import time).
import { realpathSync } from 'node:fs';
import { tmpdir as realTmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

  it('case 6: on Linux (tmpdir /tmp) a branch containing "tmp" inside a segment is kept', async () => {
    const metaToken = await metaTokenWith(LINUX);
    expect(['fix/tmp-cleanup', 'feature/html-tmpl'].map((b) => metaToken(b))).toEqual(['fix/tmp-cleanup', 'feature/html-tmpl']);
  });

  it('case 6: as root on Linux (homedir /root) a branch containing "root" inside a segment is kept', async () => {
    const metaToken = await metaTokenWith(LINUX_ROOT);
    expect(['fix/root-cause', 'chore/uproot-deps'].map((b) => metaToken(b))).toEqual(['fix/root-cause', 'chore/uproot-deps']);
  });

  it('case 6: the same branch names give the same tokens on macOS and Linux', async () => {
    const mac = (await metaTokenWith(MACOS));
    const onMac = BRANCHES.map((b) => mac(b));
    const linux = (await metaTokenWith(LINUX_ROOT));
    expect(BRANCHES.map((b) => linux(b))).toEqual(onMac);
  });

  it('case 6: platform-neutral values give identical output under macOS, Linux and Linux-root dirs', async () => {
    const values = [...BRANCHES, 'x/tmp/y', 'tmp', 'tmp/commet-x/y', 'feature/x', '/etc/x', '~/x', 'a/../b', 'claude-opus-4-1'];
    const outputs = [];
    for (const dirs of [MACOS, LINUX, LINUX_ROOT]) {
      const metaToken = await metaTokenWith(dirs);
      outputs.push(values.map((v) => metaToken(v) ?? null));
    }
    expect(outputs[1]).toEqual(outputs[0]);
    expect(outputs[2]).toEqual(outputs[0]);
    // Ordinary names survive; de-rooted temp paths and path forms don't.
    expect(outputs[0]).toEqual([...BRANCHES, 'x/tmp/y', 'tmp', null, 'feature/x', null, null, null, 'claude-opus-4-1']);
  });

  it('case 6: rejection still holds for de-rooted temp and home paths on each platform', async () => {
    for (const dirs of [MACOS, LINUX, LINUX_ROOT]) expect((await metaTokenWith(dirs))('tmp/commet-x/y'), dirs.home).toBeUndefined();
    const linux = await metaTokenWith(LINUX);
    expect(['home/dev/x', 'x/home/dev'].map((v) => linux(v))).toEqual([undefined, undefined]);
    const mac = await metaTokenWith(MACOS);
    expect(['m/Users/dev/model', 'Users/dev', `${MACOS.tmp.slice(1)}/y`].map((v) => mac(v))).toEqual([undefined, undefined, undefined]);
    expect((await metaTokenWith(LINUX_ROOT))('root/notes')).toBeUndefined();
  });
});
