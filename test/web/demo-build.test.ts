// The demo build (live-demo L2, L5): `npm run build:demo` either writes a site that passed every check,
// or leaves no site at all. Each test runs the real Vite build into its own temp folder (DEMO_OUT) on a
// dataset it writes (DEMO_DATA).
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { siteHits, siteOut } from '../../web/demo/site.js';
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

  it('removes as its output only a site folder in dist/ or the temp folder, never source (Qodo PR249 31482891)', () => {
    // never the checkout, a folder holding it, home, the root, or a folder of the checkout's own source
    for (const out of [ROOT, dirname(ROOT), homedir(), '/', '..', 'web', 'src', 'test/fixtures', 'web/demo', 'dist', join(ROOT, 'node_modules'), '.git']) {
      expect(() => siteOut(out), out).toThrow(/DEMO_OUT must be/);
    }
    // nor a temp folder holding something other than a site
    const notASite = tempDir('commet-demo-out-');
    writeFileSync(join(notASite, 'notes.txt'), 'mine');
    expect(() => siteOut(notASite)).toThrow(/holds files that aren't a demo site/);
    // the default, a fresh temp folder, an empty one, and an earlier site are fine
    expect(siteOut(undefined)).toBe(join(ROOT, 'dist/demo'));
    expect(siteOut('dist/demo-preview')).toBe(join(ROOT, 'dist/demo-preview'));
    const empty = tempDir('commet-demo-out-');
    expect(siteOut(empty)).toBe(empty);
    expect(siteOut(join(empty, 'site'))).toBe(join(empty, 'site'));
    const site = staleSite();
    expect(siteOut(site)).toBe(site);
  });

  it('refuses an output folder reached through a symlink, or one holding more than build output (Qodo PR249 864cf87e)', () => {
    // an allowed-looking path whose parent is a link to somewhere else: the target is never removed
    const area = tempDir('commet-demo-out-');
    const elsewhere = staleSite();
    writeFileSync(join(elsewhere, 'data', 'someone.txt'), 'not build output');
    symlinkSync(dirname(elsewhere), join(area, 'link'));
    expect(() => siteOut(join(area, 'link', elsewhere.split('/').at(-1)!))).toThrow(/symlink/);
    // a folder that is a link itself
    symlinkSync(elsewhere, join(area, 'direct'));
    expect(() => siteOut(join(area, 'direct'))).toThrow(/symlink|not a file or a link/);
    // a site whose data/ or assets/ hold something a build never writes
    expect(() => siteOut(elsewhere)).toThrow(/aren't a demo site/);
    const nested = staleSite();
    mkdirSync(join(nested, 'assets', 'more'), { recursive: true });
    expect(() => siteOut(nested)).toThrow(/aren't a demo site/);
    // an earlier build's files are fine
    const built = staleSite();
    mkdirSync(join(built, 'assets'));
    writeFileSync(join(built, 'assets', 'index-Ab12.js'), '');
    writeFileSync(join(built, 'assets', 'index-Cd34.css'), '');
    writeFileSync(join(built, 'data', 'manifest.json'), '{}');
    writeFileSync(join(built, '.nojekyll'), '');
    expect(siteOut(built)).toBe(built);
  });

  it('scans the data as the page reads it: escaped paths and agent-log keys are hits (Qodo PR249 dc9c36d7)', () => {
    const site = tempDir('commet-demo-site-');
    mkdirSync(join(site, 'data'));
    writeFileSync(join(site, 'index.html'), '<!doctype html><title>demo</title>');
    writeFileSync(join(site, 'data', 'beacons.json'), '{"beacons":[{"text":"see \\/Users\\/someone\\/notes"}]}');
    writeFileSync(join(site, 'data', 'crew.json'), JSON.stringify({ members: [], lastPrompt: 'anything' }));
    const hits = siteHits(site);
    expect(hits.filter((h) => h.where.includes('data/beacons.json')).map((h) => h.rule)).toContain('absolute path');
    expect(hits.filter((h) => h.where.includes('data/crew.json')).map((h) => h.rule)).toContain('agent-log field');
    expect(hits.every((h) => !h.excerpt.includes('someone/notes'))).toBe(true); // masked, as every hit
  });
});

