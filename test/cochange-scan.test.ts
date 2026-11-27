// #211 (R9): `commet scan` records co-change pairs and missing-pair flags in the snapshot, by file id at
// HEAD, from a scripted fixture repo (golden), byte-identical across runs.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/core/canonical-json.js';
import { fileIdOf } from '../src/core/fog/index.js';
import { scan } from '../src/scan/index.js';
import { buildCoChangeRepo, type CoChangeRepo } from './fixtures/build/cochange.js';

const GOLDEN = join(import.meta.dirname, 'golden/cochange.json');
let repo: CoChangeRepo;
beforeAll(async () => { repo = await buildCoChangeRepo(); });

const run = () => scan({ repoDir: repo.dir, windowMonths: 24, ingest: false, claudeProjectsDir: join(repo.dir, 'no-logs'), keyFor: () => new Uint8Array(32) });

describe('the co-change scan', () => {
  it('matches the golden record (update deliberately with UPDATE_GOLDEN=1 and a Golden-Update: reason)', async () => {
    const json = canonicalJson((await run()).snapshot.cochange);
    if (process.env['UPDATE_GOLDEN'] === '1') writeFileSync(GOLDEN, json);
    expect(json).toBe(readFileSync(GOLDEN, 'utf8'));
  });

  it('pairs by file id at HEAD, renames followed, and flags the file the latest change left out', async () => {
    const { snapshot } = await run();
    const cc = snapshot.cochange!;
    const id = (p: string) => fileIdOf(p);
    const pair = (x: string, y: string) => cc.pairs.find((p) => [p.a, p.b].sort().join() === [id(x), id(y)].sort().join());
    // fog.ts is in k0, k1, k2, k4, k5, k7 (6); the view model (fog.ts until k4) in k0, k1, k2, k4 (4), all with it: 4 / 6.
    expect(pair('src/core/fog.ts', 'web/model/fog-model.ts')).toMatchObject({ both: 4, strengthMilli: 666 });
    // the test: k0, k1, k7, all with fog.ts: 3 / 6.
    expect(pair('src/core/fog.ts', 'test/fog.test.ts')).toMatchObject({ both: 3, strengthMilli: 500 });
    // the doc shares k0 and k5 with fog.ts (2 / 6); the window and the readme share k0 and k3 (the bulk k6 is left out).
    expect(pair('src/core/fog.ts', 'docs/fog.md')).toMatchObject({ both: 2, strengthMilli: 333 });
    expect(pair('src/scan/window.ts', 'README.md')).toMatchObject({ both: 2, strengthMilli: 1000 });
    expect([cc.commits, cc.bulkCommits]).toEqual([17, 1]);
    expect(cc.pairs.some((p) => [p.a, p.b].includes(id('web/model/fog.ts')))).toBe(false); // the old name has no file at HEAD
    expect(cc.pairs.every((p) => p.a < p.b)).toBe(true);
    // k7, in the last 10 commits, left the view model out of fog.ts's change (4 shared commits). The readme's
    // latest change (the bulk k6) left the window out, but that's older than the last 10 commits: settled.
    expect(cc.missing).toEqual([{ fileId: id('web/model/fog-model.ts'), with: id('src/core/fog.ts'), strengthMilli: 666, at: repo.head }]);
    expect(cc.settings).toMatchObject({ minBoth: 2, flagMinBoth: 3, flagWindow: 10 });
    // the record holds ids, SHAs and counts only: no path
    expect(canonicalJson(cc)).not.toMatch(/fog\.ts|README|gen\//);
  });

  it('is byte-identical across scans', async () => {
    expect((await run()).json).toBe((await run()).json);
  });
});
