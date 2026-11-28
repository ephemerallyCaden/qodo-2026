// The view against the real debris answers (R13): the debris fixture repo (test/fixtures/debris: every class, hostile
// and right-to-left names, a locked, a live, a prunable and a detached worktree) is scanned, and the debris view and
// every piece's panel the server builds from it pass the view's own checks, draw only placed pieces, and show each
// command exactly as the server sent it, one printable line. So the renderer and the scan can't drift apart.
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DebrisDetail, DebrisView } from '../../src/core/contract/debris.js';
import { readDebrisDetail, readDebrisView } from '../../src/state/debris.js';
import { checkDebris, checkDebrisDetail } from '../../web/src/debris/check.js';
import { debrisCommands, debrisRows } from '../../web/src/debris/detail.js';
import { drawables } from '../../web/src/debris/select.js';
import { cli } from '../fixtures/cli.js';
import { buildDebrisRepo, EXPECTED } from '../fixtures/debris/repo.js';
import { realTempDir } from '../fixtures/tmp.js';

let view: DebrisView;
let panels: DebrisDetail[];
beforeAll(async () => {
  const repo = await buildDebrisRepo(realTempDir('commet-debris-view-'));
  const r = await cli(['scan', '--no-ingest', '--no-root'], repo.dir, { CLAUDE_CONFIG_DIR: join(repo.dir, 'no-logs') });
  if (r.code !== 0) throw new Error(`scan failed: ${r.err}`);
  view = await readDebrisView(repo.dir);
  panels = await Promise.all(view.pieces.map(async (p) => {
    const d = await readDebrisDetail(repo.dir, { id: p.id, at: view.head });
    if (!d.ok) throw new Error(`no detail for ${p.id}`);
    return d;
  }));
}, 120_000);

describe("the view and the server's debris answers", () => {
  it('accepts the debris view, and draws exactly its placed pieces', () => {
    expect(checkDebris(view)).toEqual({ ok: true, value: view });
    expect(view.total).toBe(Object.keys(EXPECTED).length);
    expect(drawables(view).map((p) => p.id)).toEqual(view.pieces.filter((p) => p.home !== null).map((p) => p.id));
  });

  it("accepts every piece's panel, hostile and hidden-character names included, and offers its commands as sent", () => {
    for (const d of panels) {
      expect(checkDebrisDetail(d), d.id).toEqual({ ok: true, value: d });
      expect(debrisCommands(d).map((c) => c.command)).toEqual([d.cleanup, d.inspect].filter((c): c is string => c !== null));
      for (const [, v] of debrisRows(d, () => null)) expect(v).not.toMatch(/[\p{Cc}\p{Cf}]/u); // printable only
    }
    expect(panels.some((d) => d.cleanup === null && d.warning !== null)).toBe(true); // no safe command: the warning says why
  });
});
