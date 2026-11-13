// readDrones (#80 AC 3/4): the glue reads the same snapshot/layout pair as the fog, and places a
// session on the planet the fog gives its files. A throwaway repo and state dir, scanned in-process.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileIdOf, homes } from '../src/core/fog/index.js';
import type { SnapshotV02 } from '../src/core/snapshot/types.js';
import { openFogSource, readDrones, readFog } from '../src/state/chart.js';
import { cli } from './fixtures/cli.js';
import { createResult, miniClaude, miniRepo, session } from './fixtures/mini.js';

const SID = '78787878-7878-4878-8878-787878787878';
const SID2 = '79797979-7979-4979-8979-797979797979';
const at = (t: string) => `2026-10-10T${t}.000Z`;
const L = (tag: string) => [1, 2, 3].map((i) => `export const ${tag}${i} = ${i};`);

function setup() {
  const files = { 'src/a.ts': L('a'), 'src/b.ts': L('b'), 'README.md': ['# Readme', 'A root file.', 'Third line.'] };
  const repo = miniRepo(Object.entries(files).map(([path, lines], i) => ({ id: `c${i}`, at: at(`09:0${i}:00`).replace('.000Z', 'Z'), path, lines })));
  const edit = (s: ReturnType<typeof session>, n: number, t: string, path: string) => [
    s.call(`a${n}`, at(t), 'Write', { file_path: join(repo.dir, path) }),
    s.result(`r${n}`, `a${n}`, at(t.replace(/:(\d\d)$/, (_, x: string) => `:${String(Number(x) + 1).padStart(2, '0')}`)), createResult(join(repo.dir, path), files[path as keyof typeof files])),
  ];
  const s1 = session(SID, repo.dir);
  const s2 = session(SID2, repo.dir);
  const projects = miniClaude({
    [SID]: [s1.user('u1', at('08:00:00')), ...edit(s1, 1, '08:10:10', 'src/a.ts'), ...edit(s1, 2, '08:20:10', 'src/b.ts'), s1.user('u9', at('08:30:00'))],
    [SID2]: [s2.user('v1', at('08:40:00')), ...edit(s2, 3, '08:50:10', 'README.md'), s2.user('v9', at('08:55:00'))],
  });
  const run = (...args: string[]) => cli(args, repo.dir, { CLAUDE_CONFIG_DIR: dirname(projects) });
  return { repo, run, state: join(repo.dir, '.git/commet') };
}

describe('readDrones on a scanned repo', () => {
  it('places each session on the planet the fog gives its files, from the fog\'s own pair', async () => {
    const r = setup();
    expect((await r.run('scan', '--no-root')).code).toBe(0);
    const v = await readDrones(r.repo.dir);
    const snap = JSON.parse(readFileSync(join(r.state, 'snapshot.json'), 'utf8')) as SnapshotV02;
    const fog = await readFog(r.repo.dir);
    const { base } = await openFogSource(r.repo.dir);
    expect(v.head).toBe(fog.head);
    expect(v.head).toBe(snap.repo.head);
    expect(v).toMatchObject({ needsRescan: false, total: snap.sessions.length });
    const planet = base.home.get(fileIdOf('src/a.ts'));
    expect(planet).toBe(base.home.get(fileIdOf('src/b.ts')));
    expect(planet).not.toBeNull();
    expect(base.home.get(fileIdOf('README.md'))).toBeNull();
    expect(base.home).toEqual(homes(snap, []));
    // Each session's home is the fog map's answer for the files it edited.
    const homeOf = (id: string) => v.sessions.find((s) => s.key === snap.sessions.find((x) => x.files.includes(fileIdOf(id)))!.key)!.home;
    expect(homeOf('src/a.ts')).toBe(planet);
    expect(homeOf('src/b.ts')).toBe(planet);
    expect(homeOf('README.md')).toBe('star');
    expect(v.placed).toBe(2);
  });

  it('refuses a snapshot and layout from different scans, as the fog does (#64)', async () => {
    const r = setup();
    expect((await r.run('scan', '--no-root')).code).toBe(0);
    const snapshotA = readFileSync(join(r.state, 'snapshot.json'));
    writeFileSync(join(r.repo.dir, 'src/c.ts'), L('c').join('\n') + '\n');
    // A second scan at a new head, then the first scan's snapshot put back beside its layout.
    execFileSync('git', ['add', '-A'], { cwd: r.repo.dir });
    execFileSync('git', ['commit', '-q', '-m', 'second'], { cwd: r.repo.dir, env: { ...process.env, GIT_COMMITTER_DATE: '2026-10-11T09:00:00Z', GIT_AUTHOR_DATE: '2026-10-11T09:00:00Z' } });
    expect((await r.run('scan', '--no-root')).code).toBe(0);
    writeFileSync(join(r.state, 'snapshot.json'), snapshotA, { mode: 0o600 });
    const msg = async (f: () => Promise<unknown>) => await f().then(() => 'ok', (e: Error) => e.message);
    const fogMsg = await msg(() => readFog(r.repo.dir));
    expect(fogMsg).toMatch(/come from different scans/);
    expect(await msg(() => readDrones(r.repo.dir))).toBe(fogMsg);
  });
});
