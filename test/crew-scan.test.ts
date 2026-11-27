// #207 (C1, C5, C7, C9–C11): `commet scan` of the shared crew fixture repo (test/fixtures/crew), then the crew
// and each member's panel through the server's readers, from the same snapshot/layout pair as the fog. Golden
// (update deliberately with UPDATE_GOLDEN=1 and a Golden-Update: reason).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/core/canonical-json.js';
import { EXIT } from '../src/core/errors.js';
import type { CrewDetail, CrewHome } from '../src/core/contract/crew.js';
import { fileIdOf } from '../src/core/fog/index.js';
import { personId } from '../src/core/hash.js';
import type { SnapshotV02 } from '../src/core/snapshot/types.js';
import { readCrew, readCrewDetail } from '../src/state/crew.js';
import { writeAtomic } from '../src/state/io.js';
import { cli } from './fixtures/cli.js';
import { ADA, BRAM_HOME, buildCrewRepo, CLEO, CREW_NAMES, DAX, ESME, IDENTITIES, NOVA, NOVA_OLD, type CrewRepo } from './fixtures/crew/repo.js';
import { realTempDir } from './fixtures/tmp.js';

const GOLDEN = join(import.meta.dirname, 'golden/crew.json');
const scanIn = (dir: string) => cli(['scan', '--no-ingest', '--no-root'], dir, { CLAUDE_CONFIG_DIR: join(dir, 'no-logs') });
const snapshotText = (dir: string) => readFileSync(join(dir, '.git/commet/snapshot.json'), 'utf8');

let repo: CrewRepo;
let snap: SnapshotV02;
beforeAll(async () => {
  repo = await buildCrewRepo(realTempDir('commet-crew-'));
  const r = await scanIn(repo.dir);
  if (r.code !== 0) throw new Error(`scan failed: ${r.err}`);
  snap = JSON.parse(snapshotText(repo.dir)) as SnapshotV02;
});

/** Every member's panel, in crew order. */
async function panels(dir: string): Promise<CrewDetail[]> {
  const crew = await readCrew(dir);
  return Promise.all(crew.members.map(async (m) => {
    const d = await readCrewDetail(dir, { person: m.person, at: crew.head });
    if (!d.ok) throw new Error('no detail');
    return d;
  }));
}

describe('the crew of the fixture repo', () => {
  it('matches the golden crew and panels', async () => {
    const json = canonicalJson({ crew: await readCrew(repo.dir), panels: await panels(repo.dir) });
    if (process.env['UPDATE_GOLDEN'] === '1') writeFileSync(GOLDEN, json);
    expect(json).toBe(readFileSync(GOLDEN, 'utf8'));
  });

  it('is one person per human author, aliases merged, bots and agents left out and counted, ordered by person id (C1, C6, C10)', async () => {
    const crew = await readCrew(repo.dir);
    expect(crew).toMatchObject({ schemaVersion: 'crew.1', head: repo.head, total: 6, bots: 2, needsRescan: false });
    expect(crew.members.map((m) => m.displayName).sort()).toEqual([...CREW_NAMES].sort());
    expect(crew.members.map((m) => m.person)).toEqual(crew.members.map((m) => m.person).sort());
    // Ada by `.mailmap` (her contractor address), Bram by his exact name (no mailmap entry): one id each.
    const ids = Object.fromEntries(crew.members.map((m) => [m.displayName, m.person]));
    expect(ids).toEqual({ [NOVA.name]: personId(NOVA.email), [ADA.name]: personId(ADA.email), 'Bram Tiller': personId(BRAM_HOME.email),
      [CLEO.name]: personId(CLEO.email), [DAX.name]: personId(DAX.email), [ESME.name]: personId(ESME.email) });
    // Bram's two emails author his commits under one person.
    expect(snap.commits.filter((c) => c.author === personId(BRAM_HOME.email)).map((c) => c.sha)).toEqual([repo.shas[2], repo.shas[3]]);
    expect(snap.people.filter((p) => p.isBot).map((p) => p.displayName).sort()).toEqual(['Cursor Agent', 'dependabot[bot]']);
  });

  it('makes you the captain, with your old laptop merged in by commet.selfEmail (C9)', async () => {
    const crew = await readCrew(repo.dir);
    expect(crew.members.filter((m) => m.captain)).toEqual([expect.objectContaining({ person: personId(NOVA.email), displayName: NOVA.name })]);
    expect(snap.repo.selfPersonIds).toEqual([personId(NOVA.email)]);
    expect(snap.commits[9]!.author).toBe(personId(NOVA.email));
  });

  it("gives each member's planets and files with their own touch counts and their last author date (C5)", async () => {
    const dirId = (path: string) => snap.dirs.find((d) => d.path === path)!.id as CrewHome;
    const [engine, ui, docs] = [dirId('engine'), dirId('ui'), dirId('docs')];
    const file = (path: string, home: CrewHome, touches: number) => ({ fileId: fileIdOf(path), path, home, touches });
    const bodies = (...b: [CrewHome, number][]) => b.sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([home, touches]) => ({ home, touches }));
    const detail = async (email: string) => readCrewDetail(repo.dir, { person: personId(email), at: repo.head });
    // You: c1, c10 (the old laptop) and c11, whose rename is no touch and whose deletion is a path no file at HEAD has.
    expect(await detail(NOVA.email)).toMatchObject({ captain: true, lastActive: '2026-10-11T10:00:00Z', otherFiles: 1,
      planets: bodies([engine, 1], [ui, 2], ['star', 1]),
      files: [file('.mailmap', 'star', 1), file('README.md', 'star', 1), file('engine/core.ts', engine, 1), file('ui/hud.ts', ui, 1), file('ui/panel.ts', ui, 1)] });
    // Ada: c2 from the contractor address, c12 from her own.
    expect(await detail(ADA.email)).toMatchObject({ captain: false, lastActive: '2026-10-12T10:00:00Z', otherFiles: 0,
      planets: bodies([engine, 2], [ui, 1]), files: [file('engine/core.ts', engine, 1), file('engine/physics.ts', engine, 2), file('ui/hud.ts', ui, 1)] });
    // Bram: c3 and c4 on the menu, followed through its rename to nav.
    expect(await detail(BRAM_HOME.email)).toMatchObject({ lastActive: '2026-10-04T10:00:00Z', planets: bodies([ui, 2]),
      files: [file('ui/nav.ts', ui, 2), file('ui/panel.ts', ui, 1)] });
    expect(await detail(CLEO.email)).toMatchObject({ planets: bodies([docs, 1], [ui, 2]), files: [file('docs/guide.md', docs, 1), file('ui/nav.ts', ui, 2)] });
    expect(await detail(DAX.email)).toMatchObject({ otherFiles: 1, planets: bodies([engine, 1]), files: [file('engine/core.ts', engine, 1)] });
    expect(await detail(ESME.email)).toMatchObject({ planets: bodies([docs, 1], ['star', 1]), files: [file('README.md', 'star', 1), file('docs/guide.md', docs, 1)] });
  });

  it('answers unknown-head for another head and no-such-person for a bot or a stranger', async () => {
    const bot = snap.people.find((p) => p.isBot)!.id;
    expect(await readCrewDetail(repo.dir, { person: personId(NOVA.email), at: 'f'.repeat(40) })).toEqual({ ok: false, error: 'unknown-head', head: repo.head });
    expect(await readCrewDetail(repo.dir, { person: bot, at: repo.head })).toEqual({ ok: false, error: 'no-such-person' });
    expect(await readCrewDetail(repo.dir, { person: personId('nobody@crew.test'), at: repo.head })).toEqual({ ok: false, error: 'no-such-person' });
  });

  it('holds no email anywhere: not in the snapshot, the crew or any panel (C7)', async () => {
    const out = [snapshotText(repo.dir), JSON.stringify(await readCrew(repo.dir)), JSON.stringify(await panels(repo.dir))];
    for (const text of out) {
      expect(text).not.toContain('@');
      for (const who of IDENTITIES) expect(text).not.toContain(who.email.slice(who.email.indexOf('@')));
    }
  });

  it('is byte-identical across scans', async () => {
    const before = snapshotText(repo.dir);
    expect((await scanIn(repo.dir)).code).toBe(0);
    expect(snapshotText(repo.dir)).toBe(before);
  });

  // Last in this block: it damages the scanned state.
  it('refuses damaged people as a state error, never guessing around them', async () => {
    const damaged = { ...snap, people: [{ ...snap.people[0]!, isBot: 'maybe' }, ...snap.people.slice(1)] };
    writeAtomic(join(repo.dir, '.git/commet/snapshot.json'), JSON.stringify(damaged));
    await expect(readCrew(repo.dir)).rejects.toMatchObject({ exitCode: EXIT.state, message: expect.stringContaining('run `commet scan`') });
    await expect(readCrewDetail(repo.dir, { person: personId(NOVA.email), at: repo.head })).rejects.toMatchObject({ exitCode: EXIT.state });
  });
});

describe('your emails (C9: user.email values and commet.selfEmail)', () => {
  it('leaves the old laptop a teammate without commet.selfEmail, and merges it again when it is another user.email', async () => {
    const r = await buildCrewRepo(realTempDir('commet-crew-self-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: r.dir, encoding: 'utf8' });
    git('config', '--unset', 'commet.selfEmail');
    expect((await scanIn(r.dir)).code).toBe(0);
    let crew = await readCrew(r.dir);
    expect(crew.total).toBe(7);
    expect(crew.members.find((m) => m.displayName === NOVA_OLD.name)).toMatchObject({ person: personId(NOVA_OLD.email), captain: false });
    // Two user.email values: git commits as the last one, so it keys you; the other merges in.
    git('config', '--add', 'user.email', NOVA_OLD.email);
    expect((await scanIn(r.dir)).code).toBe(0);
    crew = await readCrew(r.dir);
    expect(crew.total).toBe(6);
    expect(crew.members.filter((m) => m.captain)).toEqual([expect.objectContaining({ person: personId(NOVA_OLD.email), displayName: NOVA.name })]);
  });
});
