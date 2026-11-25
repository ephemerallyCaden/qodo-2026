// visual-proof scene fog-levels (#201): its own repo stands each file one way before anyone opens it, and
// puts the three settlements by the pole, where the scene looks; parcelsOnScreen tells their parcels apart
// on screen. The levels' names change with #201's fog.2, but what makes each one doesn't: changed.ts is
// fogged by an unknown change, and the untouched and the charted file aren't fogged.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import { fileIdOf } from '../../src/core/fog/index.js';
import { readFog } from '../../src/state/chart.js';
import { focusPose, project, startPose } from '../../web/src/camera/pose.js';
import { surfacePlan } from '../../web/src/model/fog.js';
import { planetCentre, surfaceDirection, systemModel } from '../../web/src/model/system.js';
import { add, scale } from '../../web/src/model/vec.js';
import { fogLevels } from '../../.claude/skills/visual-proof/scenes/fog-levels.js';
import { parcelsOnScreen } from '../../.claude/skills/visual-proof/scenes/parcels.js';
import { makeFixtureRepo } from '../../.claude/skills/visual-proof/scripts/prepare.js';
import { cli } from '../fixtures/cli.js';
import { realTempDir } from '../fixtures/tmp.js';

const FILES = ['aa/untouched.ts', 'aa/changed.ts', 'aa/charted.ts'];

/** The scene's repo, scanned as a run scans it, with the scene's setup run on it. */
async function sceneRepo(): Promise<{ dir: string; layout: LayoutV1 }> {
  const dir = realTempDir('commet-vp-fog-');
  const f = fogLevels.fixture!;
  makeFixtureRepo(f.files, f.at, dir, f.earlier);
  const env = { ...process.env, CLAUDE_CONFIG_DIR: join(dir, 'no-claude') };
  expect((await cli(['scan', '--no-ingest', '--no-root'], dir, env)).code).toBe(0);
  const layout = JSON.parse(readFileSync(join(dir, '.git', 'commet', 'layout.json'), 'utf8')) as LayoutV1;
  const steps: string[][] = [];
  fogLevels.setup!({ layout, cli: (...args) => { steps.push(args); return ''; } });
  expect(steps).toEqual([['chart', '--', 'aa/charted.ts']]);
  for (const args of steps) expect((await cli(args, dir, env)).code).toBe(0);
  return { dir, layout };
}

describe('the fog-levels scene', () => {
  it('fogs only the file changed in the window by an unknown change, and puts the three on the cells by the pole, the opened one on the pole', async () => {
    const { dir, layout } = await sceneRepo();
    const fog = await readFog(dir);
    const level = (path: string) => fog.files.find((x) => x.fileId === fileIdOf(path));
    expect(level('aa/changed.ts')).toMatchObject({ state: 'fogged', reasons: ['unknown'] });
    expect(level('aa/untouched.ts')?.state).not.toBe('fogged');
    expect(level('aa/charted.ts')?.state).not.toBe('fogged');
    const [planet, ...more] = layout.planets;
    expect(more).toEqual([]);
    expect(planet!.path).toBe('aa');
    const cell = new Map(planet!.surface.settlements.map((s) => [s.fileId, s.cell]));
    expect(FILES.map((p) => cell.get(fileIdOf(p))).sort()).toEqual([0, 1, 2]);
    expect(cell.get(fileIdOf('aa/changed.ts'))).toBe(0);
  });

  it('parcelsOnScreen: from the pose the scene opens, all three parcels show, the planet\'s centre is the opened file\'s, and each cell faces as its owner', async () => {
    const { layout } = await sceneRepo();
    const model = systemModel(layout), p = model.planets[0]!;
    const opened = p.surface.settlements.find((s) => s.fileId === fileIdOf('aa/changed.ts'))!;
    const pose = focusPose(startPose(model), planetCentre(p, 0), p.radius, surfaceDirection(p, opened.cell, 0));
    const at = parcelsOnScreen(model, pose, 'aa', 0, 1280, 720);
    const px = new Map<string | null, number>();
    for (let y = 0; y < 720; y++) for (let x = 0; x < 1280; x++) px.set(at(x, y), (px.get(at(x, y)) ?? 0) + 1);
    for (const path of FILES) expect(px.get(fileIdOf(path)), path).toBeGreaterThan(10_000);
    expect([...px.keys()].filter((k) => k !== null).sort()).toEqual(FILES.map(fileIdOf).sort());
    expect(at(0, 0)).toBeNull();
    expect(at(640, 360)).toBe(fileIdOf('aa/changed.ts'));
    // a cell centre facing the camera, projected, lands in its owner's parcel (the shader's nearest-cell rule),
    // also 10 s on, with the surface turned and the planet moved along its orbit, seen from the side
    const plan = surfacePlan(p.surface);
    for (const frame of [0, 300]) {
      const seen = frame === 0 ? pose : focusPose(startPose(model), planetCentre(p, frame), p.radius);
      const on = parcelsOnScreen(model, seen, 'aa', frame, 1280, 720), centre = planetCentre(p, frame);
      let checked = 0;
      for (let cell = 0; cell < p.surface.cells; cell++) {
        const q = project(seen, add(centre, scale(surfaceDirection(p, cell, frame), p.radius)));
        if (!q || q.depth > project(seen, centre)!.depth - p.radius * 0.5) continue; // the near cap only
        expect(on(((q.x + 1) / 2) * 1280, ((1 - q.y) / 2) * 720), `frame ${frame}, cell ${cell}`).toBe(plan.fileIds[plan.territory.owner[cell]!]);
        checked++;
      }
      expect(checked, `frame ${frame}`).toBeGreaterThan(20);
    }
  });

  it('parcelsOnScreen refuses a viewport the pixel pass doesn\'t fill exactly', async () => {
    const { layout } = await sceneRepo();
    const model = systemModel(layout);
    expect(() => parcelsOnScreen(model, startPose(model), 'aa', 0, 1300, 720)).toThrow(/fills exactly/);
    expect(() => parcelsOnScreen(model, startPose(model), 'zz', 0, 1280, 720)).toThrow(/no planet zz/);
  });
});
