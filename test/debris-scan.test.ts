// R13: `commet scan` of the debris fixture repo (test/fixtures/debris), then the debris view and every piece's
// panel through the server's readers, from the same snapshot/layout pair as the fog. Golden (update deliberately
// with UPDATE_GOLDEN=1 and a Golden-Update: reason).
import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/core/canonical-json.js';
import { DEBRIS_WARNINGS, type DebrisDetail } from '../src/core/contract/debris.js';
import { debrisId } from '../src/core/debris.js';
import { EXIT } from '../src/core/errors.js';
import { fileIdOf } from '../src/core/fog/index.js';
import type { SnapshotV02 } from '../src/core/snapshot/types.js';
import { readDebrisDetail, readDebrisView } from '../src/state/debris.js';
import { writeAtomic } from '../src/state/io.js';
import { cli } from './fixtures/cli.js';
import { BIDI, buildDebrisRepo, EXPECTED, HOSTILE, IDENTITIES, LOCK_REASON, NOT_DEBRIS, ODD_PATH, type DebrisRepo } from './fixtures/debris/repo.js';
import { realTempDir } from './fixtures/tmp.js';

const sh = promisify(execFile);
const GOLDEN = join(import.meta.dirname, 'golden/debris.json');
const scanIn = (dir: string) => cli(['scan', '--no-ingest', '--no-root'], dir, { CLAUDE_CONFIG_DIR: join(dir, 'no-logs') });
const snapshotText = (dir: string) => readFileSync(join(dir, '.git/commet/snapshot.json'), 'utf8');

let repo: DebrisRepo;
let snap: SnapshotV02;
beforeAll(async () => {
  repo = await buildDebrisRepo(realTempDir('commet-debris-'));
  const r = await scanIn(repo.dir);
  if (r.code !== 0) throw new Error(`scan failed: ${r.err}`);
  snap = JSON.parse(snapshotText(repo.dir)) as SnapshotV02;
});

/** Every piece's panel, in id order. */
async function panels(dir: string): Promise<DebrisDetail[]> {
  const view = await readDebrisView(dir);
  return Promise.all(view.pieces.map(async (p) => {
    const d = await readDebrisDetail(dir, { id: p.id, at: view.head });
    if (!d.ok) throw new Error('no detail');
    return d;
  }));
}
const byName = async () => new Map((await panels(repo.dir)).map((d) => [d.name ?? 'null', d]));

describe('the debris of the fixture repo', () => {
  it('matches the golden view and panels', async () => {
    const json = canonicalJson({ view: await readDebrisView(repo.dir), panels: await panels(repo.dir) });
    if (process.env['UPDATE_GOLDEN'] === '1') writeFileSync(GOLDEN, json);
    expect(json).toBe(readFileSync(GOLDEN, 'utf8'));
  });

  it('finds each class, and nothing that is never debris (HEAD, its upstream, the default branch, a tip at HEAD, within the grace, too young)', async () => {
    const found = await byName();
    expect(Object.fromEntries([...found].map(([n, d]) => [n, d.cls]))).toEqual(EXPECTED);
    for (const n of NOT_DEBRIS) expect(found.has(n), n).toBe(false);
    expect(snap.debris).toMatchObject({ settings: { abandonedDays: 30, mergedGraceDays: 3, agentDays: 7 }, defaults: ['main', 'master'], unreadable: 0 });
    const view = await readDebrisView(repo.dir);
    expect(view).toMatchObject({ schemaVersion: 'debris.1', head: repo.head, total: 15, prs: 'not-read', needsRescan: false });
    expect(view.pieces.map((p) => p.id)).toEqual(view.pieces.map((p) => p.id).sort());
    expect(view.pieces.every((p) => p.cls !== 'pr')).toBe(true);
  });

  it("ages each piece from HEAD's committer date, in three decay steps", async () => {
    const found = await byName();
    const view = await readDebrisView(repo.dir);
    const step = (name: string) => view.pieces.find((p) => p.id === found.get(name)!.id)!.ageStep;
    expect([found.get('ancient')!.ageDays, step('ancient')]).toEqual([244, 2]);
    expect([found.get('old-feature')!.ageDays, step('old-feature')]).toEqual([91, 1]);
    expect([found.get('shipped')!.ageDays, step('shipped')]).toEqual([30, 0]);
  });

  it('sizes a piece by the lines HEAD lacks and places it on the body holding its files (Rule 7 path included)', async () => {
    const found = await byName();
    const view = await readDebrisView(repo.dir);
    const dirId = (path: string) => snap.dirs.find((d) => d.path === path)!.id;
    expect(found.get('old-feature')).toMatchObject({ lines: 2, aheadCount: 1, filesOutside: 1, home: dirId('engine'), planets: [dirId('engine')] });
    expect(found.get('half-rebased')).toMatchObject({ lines: 2, aheadCount: 2, filesOutside: 1 });
    expect(found.get('shipped')).toMatchObject({ lines: 0, aheadCount: 0, home: dirId('ui') });
    expect(found.get('deps/bump')!.home).toBe('star');
    const shipped = snap.debris!.items.find((i) => i.ref === 'refs/heads/shipped')!;
    expect(shipped.files).toContain(fileIdOf(ODD_PATH));
    expect(view.mass).toBe(view.pieces.reduce((n, p) => n + p.lines, 0));
    expect(view.placed).toBe(view.pieces.filter((p) => p.home !== null).length);
  });

  it('names the creator and marks agents, rebases and worktrees (never the folder path or lock reason)', async () => {
    const found = await byName();
    expect(found.get('agent/claude-fix')!.creator).toEqual({ displayName: 'Claude', captain: false, agent: true });
    expect(found.get('wt-agent')!.creator).toMatchObject({ displayName: 'Cursor Agent', agent: true });
    expect(found.get('deps/bump')!.creator).toEqual({ displayName: 'dependabot[bot]', captain: false, agent: false });
    expect(found.get(HOSTILE)!.creator).toMatchObject({ displayName: 'Nova Reyes', captain: true });
    expect(found.get('rebased')).toMatchObject({ cls: 'merged', rebased: true, lines: 0 });
    expect(found.get('half-rebased')!.rebased).toBe(false);
    expect(found.get('wt-agent')!.worktree).toEqual({ prunable: false, locked: false });
    expect(found.get('locked-old')!.worktree).toEqual({ prunable: false, locked: true });
    expect(found.get('gone-wt')!.worktree).toEqual({ prunable: true, locked: false });
    expect(found.get('null')).toMatchObject({ name: null, aheadCount: 1, worktree: { prunable: true, locked: false } });
    expect(found.get('origin/stale-remote')!.remoteOnly).toBe(true);
  });

  it('gives each item its quoted cleanup and inspect commands, never -D', async () => {
    const found = await byName();
    const cmd = (n: string) => { const d = found.get(n)!; return [d.cleanup, d.inspect, d.warning]; };
    const W = DEBRIS_WARNINGS;
    expect(cmd('shipped')).toEqual([`git branch -d -- 'shipped' && git push --delete '--force-with-lease=refs/heads/shipped:${repo.shas['shipped']}' -- 'origin' 'refs/heads/shipped'`, null, null]);
    expect(cmd('origin/old-release')).toEqual([`git push --delete '--force-with-lease=refs/heads/old-release:${repo.shas['c3']}' -- 'origin' 'refs/heads/old-release'`, null, null]);
    expect(cmd('ancient')).toEqual(["git branch -d -- 'ancient'", "git log --oneline HEAD..'refs/heads/ancient' --", W.unmerged]);
    expect(cmd('rebased')).toEqual(["git branch -d -- 'rebased'", "git cherry -v HEAD 'refs/heads/rebased'", W.rebased]);
    expect(cmd('origin/stale-remote')).toEqual([null, "git log --oneline HEAD..'refs/remotes/origin/stale-remote' --", W.remoteUnmerged]);
    expect(cmd('wt-agent')).toEqual(["git worktree remove -- 'wt-agent-dir' && git branch -d -- 'wt-agent'",
      "git log --oneline HEAD..'refs/heads/wt-agent' --", W.unmerged]);
    expect(cmd('gone-wt')).toEqual(["git worktree remove -- 'gone-dir'", null, null]);
    expect(cmd('null')).toEqual([null, `git log --oneline HEAD..${repo.shas['detached']} --`, W.detached]);
    expect(cmd('locked-old')).toEqual([null, "git log --oneline HEAD..'refs/heads/locked-old' --", W.worktreeLocked]);
    expect(cmd(BIDI)).toEqual([null, null, W.hiddenCharacters]);
    expect(cmd(HOSTILE)[0]).toBe(`git branch -d -- '-x;touch\${IFS}pwned;$(touch\${IFS}pwned2)'\\''q\`touch\${IFS}pwned3\`'`);
    for (const d of found.values()) expect(`${d.cleanup} ${d.inspect}`).not.toMatch(/\s-D\b|--force(?!-with-lease=)|\s-f\b/);
  });

  it('a hostile name pasted into a shell stays one argument: nothing runs, and git refuses the unmerged branch', async () => {
    const d = (await byName()).get(HOSTILE)!;
    const inspect = await sh('sh', ['-c', d.inspect!], { cwd: repo.dir, encoding: 'utf8' });
    expect(inspect.stdout).toContain('hostile name');
    await expect(sh('sh', ['-c', d.cleanup!], { cwd: repo.dir, encoding: 'utf8' })).rejects.toMatchObject({ stderr: expect.stringContaining('not fully merged') });
    expect(readdirSync(repo.dir).filter((f) => f.startsWith('pwned'))).toEqual([]);
    expect(execFileSync('git', ['rev-parse', '--verify', `refs/heads/${HOSTILE}`], { cwd: repo.dir, encoding: 'utf8' }).trim()).toBe(repo.shas[HOSTILE]);
  });

  it("a prunable worktree's cleanup, pasted, removes only that worktree, never the detached one whose commits are on no branch (Qodo PR248 2d231f91)", async () => {
    const d = (await byName()).get('gone-wt')!;
    await sh('sh', ['-c', d.cleanup!], { cwd: repo.dir, encoding: 'utf8' });
    const list = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: repo.dir, encoding: 'utf8' });
    expect(list).not.toContain('gone-dir');
    expect(list).toContain(`HEAD ${repo.shas['detached']}`);
    // Put it back as it was (a prunable worktree on gone-wt), for the tests after this one.
    execFileSync('git', ['worktree', 'add', '-q', join(repo.root, 'wt', 'gone-dir'), 'gone-wt'], { cwd: repo.dir });
    rmSync(join(repo.root, 'wt', 'gone-dir'), { recursive: true, force: true });
  });

  it('holds no email, absolute path, worktree path or lock reason in the snapshot, the view or any panel (Rule 2)', async () => {
    const out = [snapshotText(repo.dir), JSON.stringify(await readDebrisView(repo.dir)), JSON.stringify(await panels(repo.dir))];
    for (const text of out) {
      expect(text).not.toContain('@');
      for (const who of IDENTITIES) expect(text).not.toContain(who.email.slice(who.email.indexOf('@')));
      expect(text).not.toContain(repo.root);
      expect(text).not.toContain(LOCK_REASON);
      expect(text).not.toContain('secret-project');
    }
    const strings: string[] = [];
    for (const text of out) JSON.parse(text, (_k, v: unknown) => (typeof v === 'string' && strings.push(v), v));
    expect(strings.filter((s) => /^([A-Za-z]:\\|\/|~)/.test(s))).toEqual([]);
    // The view lists no name, creator or commit at all (Rule 6).
    expect(out[1]).not.toMatch(/"(name|creator|displayName|subject|sha|ref|sessions)"/);
  });

  it("refuses a merged remote copy's delete once someone pushed to it since, and deletes it while it's where the scan saw it (Qodo PR248 81e79d3e)", async () => {
    const d = (await byName()).get('origin/old-release')!;
    const other = realTempDir('commet-debris-other-');
    const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
    git(other, 'clone', '-q', join(repo.root, 'origin.git'), 'c');
    const c = join(other, 'c');
    git(c, 'checkout', '-q', 'old-release');
    git(c, '-c', 'user.name=Pip', '-c', 'user.email=pip@debris.test', 'commit', '-q', '--allow-empty', '-m', 'newer work');
    git(c, 'push', '-q', 'origin', 'old-release');
    await expect(sh('sh', ['-c', d.cleanup!], { cwd: repo.dir, encoding: 'utf8' })).rejects.toMatchObject({ stderr: expect.stringContaining('stale info') });
    expect(git(repo.dir, 'ls-remote', 'origin', 'refs/heads/old-release')).not.toBe('');
    git(c, 'push', '-q', '--force', 'origin', `${repo.shas['c3']}:refs/heads/old-release`);
    await sh('sh', ['-c', d.cleanup!], { cwd: repo.dir, encoding: 'utf8' });
    expect(git(repo.dir, 'ls-remote', 'origin', 'refs/heads/old-release')).toBe('');
    // Put it back as it was, for the tests after this one.
    git(c, 'push', '-q', 'origin', `${repo.shas['c3']}:refs/heads/old-release`);
    git(repo.dir, 'update-ref', 'refs/remotes/origin/old-release', repo.shas['c3']!);
  });

  it("places a branch's change to a file HEAD renamed since on the file it is now (Qodo PR248 3815eaf8)", async () => {
    const dir = join(realTempDir('commet-debris-rename-'), 'r');
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe',
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
    let date = '2026-01-01T10:00:00Z';
    execFileSync('git', ['init', '-q', '-b', 'main', dir]);
    for (const [k, v] of [['user.name', 'Pip'], ['user.email', 'pip@debris.test'], ['commit.gpgsign', 'false']]) git('config', k!, v!);
    mkdirSync(join(dir, 'engine'));
    writeFileSync(join(dir, 'engine/a.ts'), 'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n');
    writeFileSync(join(dir, 'engine/keep.ts'), 'export const k = 1;\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'start');
    git('checkout', '-q', '-b', 'old');
    writeFileSync(join(dir, 'engine/a.ts'), 'export const a = 1;\nexport const b = 2;\nexport const c = 4;\n');
    date = '2026-02-01T10:00:00Z';
    git('commit', '-q', '-am', 'old: edit a');
    git('checkout', '-q', 'main');
    git('mv', 'engine/a.ts', 'engine/renamed.ts');
    date = '2026-04-01T10:00:00Z';
    git('commit', '-q', '-m', 'rename a');
    expect((await scanIn(dir)).code).toBe(0);
    const view = await readDebrisView(dir);
    const d = await readDebrisDetail(dir, { id: debrisId('refs/heads/old'), at: view.head });
    const s = JSON.parse(snapshotText(dir)) as SnapshotV02;
    expect(d).toMatchObject({ ok: true, cls: 'branch', filesOutside: 0, home: s.dirs.find((x) => x.path === 'engine')!.id });
    expect(s.debris!.items[0]!.files).toEqual([fileIdOf('engine/renamed.ts')]);
  });

  it('answers unknown-head for another head and no-such-item for an id it lacks', async () => {
    const id = debrisId('refs/heads/ancient');
    expect(await readDebrisDetail(repo.dir, { id, at: 'f'.repeat(40) })).toEqual({ ok: false, error: 'unknown-head', head: repo.head });
    expect(await readDebrisDetail(repo.dir, { id: debrisId('refs/heads/young'), at: repo.head })).toEqual({ ok: false, error: 'no-such-item' });
    expect((await readDebrisDetail(repo.dir, { id, at: repo.head })).ok).toBe(true);
  });

  it('is byte-identical across scans', async () => {
    const before = snapshotText(repo.dir);
    expect((await scanIn(repo.dir)).code).toBe(0);
    expect(snapshotText(repo.dir)).toBe(before);
  });

  // The last two damage the scanned state, and the last one runs a cleanup.
  it('answers needsRescan for a snapshot from before R13, and refuses damaged debris as a state error', async () => {
    const path = join(repo.dir, '.git/commet/snapshot.json');
    const { debris, ...old } = snap;
    writeAtomic(path, JSON.stringify(old));
    expect(await readDebrisView(repo.dir)).toEqual({ schemaVersion: 'debris.1', head: repo.head, pieces: [], total: 0, placed: 0, mass: 0,
      unreadable: 0, prs: 'not-read', needsRescan: true });
    expect(await readDebrisDetail(repo.dir, { id: debrisId('refs/heads/ancient'), at: repo.head })).toEqual({ ok: false, error: 'no-such-item' });
    const damaged = { ...snap, debris: { ...debris!, items: [{ ...debris!.items[0]!, tip: 'HEAD' }, ...debris!.items.slice(1)] } };
    writeAtomic(path, JSON.stringify(damaged));
    await expect(readDebrisView(repo.dir)).rejects.toMatchObject({ exitCode: EXIT.state, message: expect.stringContaining('run `commet scan`') });
    await expect(readDebrisDetail(repo.dir, { id: debris!.items[0]!.id, at: repo.head })).rejects.toMatchObject({ exitCode: EXIT.state });
    // Damaged sessions, which the panel reads, are a state error too, never a generic one (Qodo PR248 6fcfa051).
    writeAtomic(path, JSON.stringify({ ...snap, sessions: 'damaged' }));
    await expect(readDebrisDetail(repo.dir, { id: debris!.items[0]!.id, at: repo.head })).rejects.toMatchObject({ exitCode: EXIT.state });
    writeAtomic(path, JSON.stringify(snap));
  });

  it("a merged item's cleanup, pasted, removes its branch and its remote copy, and the next scan sweeps it", async () => {
    const d = (await byName()).get('shipped')!;
    await sh('sh', ['-c', d.cleanup!], { cwd: repo.dir, encoding: 'utf8' });
    expect(() => execFileSync('git', ['rev-parse', '--verify', '--quiet', 'refs/heads/shipped'], { cwd: repo.dir })).toThrow();
    const remote = execFileSync('git', ['ls-remote', 'origin'], { cwd: repo.dir, encoding: 'utf8' });
    expect(remote).not.toContain('refs/heads/shipped');
    expect((await scanIn(repo.dir)).code).toBe(0);
    expect((await byName()).has('shipped')).toBe(false);
  });
});
