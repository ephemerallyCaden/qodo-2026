// The demo build (live-demo L2, L5): `npm run build:demo` either writes a site that passed every check,
// or leaves no site at all. Each test runs the real Vite build into its own temp folder (DEMO_OUT) on a
// dataset it writes (DEMO_DATA).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { siteOut } from '../../web/demo/site.js';
import { tempDir } from '../fixtures/tmp.js';

const ROOT = join(import.meta.dirname, '../..');
const CONFIG = join(ROOT, 'web/vite.demo.config.ts');
const MINI = join(ROOT, 'test/fixtures/contract');

/** A dataset folder: mini's layout and fog, with `over` replacing or adding files. */
function datasetDir(over: Record<string, string> = {}): string {
  const dir = tempDir('commet-demo-data-');
  const files: Record<string, string> = {
    'layout.json': readFileSync(join(MINI, 'mini.layout.json'), 'utf8'),
    'fog.json': readFileSync(join(MINI, 'mini.fog.json'), 'utf8'),
    'manifest.json': JSON.stringify({ schemaVersion: 'commet-demo.1', routes: { '/api/layout': 'layout.json', '/api/fog': 'fog.json' } }),
    ...over,
  };
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

/** An output folder holding a site from an earlier build. */
function staleSite(): string {
  const out = tempDir('commet-demo-out-');
  mkdirSync(join(out, 'data'));
  writeFileSync(join(out, 'index.html'), '<!doctype html><title>an earlier build</title>');
  return out;
}

const saved = { data: process.env['DEMO_DATA'], out: process.env['DEMO_OUT'] };
afterEach(() => {
  for (const [key, value] of [['DEMO_DATA', saved.data], ['DEMO_OUT', saved.out]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
const buildDemo = (data: string, out: string) => {
  process.env['DEMO_DATA'] = data;
  process.env['DEMO_OUT'] = out;
  return build({ configFile: CONFIG, logLevel: 'silent' });
};

describe('demo build', () => {
  it('writes a site from a good dataset', async () => {
    const out = staleSite();
    await buildDemo(datasetDir(), out);
    expect(readFileSync(join(out, 'index.html'), 'utf8')).toContain('DEMO: invented data');
    expect(existsSync(join(out, '.nojekyll'))).toBe(true);
    expect(JSON.parse(readFileSync(join(out, 'data/manifest.json'), 'utf8'))).toMatchObject({ routes: { '/api/layout': 'layout.json' } });
  }, 120_000);

  it('refuses a dataset whose answers the view would refuse, and leaves no site (Qodo PR249 cccddd73)', async () => {
    const out = staleSite();
    await expect(buildDemo(datasetDir({ 'layout.json': '{}' }), out)).rejects.toThrow(/layout from the demo data is invalid/);
    expect(existsSync(out) && existsSync(join(out, 'index.html'))).toBe(false);
  }, 120_000);

  it('leaves no earlier site behind when the dataset is broken (Qodo PR249 daf03b1b)', async () => {
    const out = staleSite();
    const data = datasetDir({ 'manifest.json': JSON.stringify({ schemaVersion: 'commet-demo.1', routes: { '/api/layout': 'layout.json', '/api/fog': 'gone.json' } }) });
    await expect(buildDemo(data, out)).rejects.toThrow(/gone\.json is missing/);
    expect(existsSync(out) && existsSync(join(out, 'index.html'))).toBe(false);
  }, 120_000);

  it('never removes the checkout, a folder holding it, the home folder or the root as its output', () => {
    for (const out of [ROOT, dirname(ROOT), homedir(), '/', '..']) expect(() => siteOut(out), out).toThrow(/DEMO_OUT must be a folder of its own/);
    expect(siteOut(undefined)).toBe(join(ROOT, 'dist/demo'));
  });
});

