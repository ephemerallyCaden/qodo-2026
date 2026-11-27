// #189 probe: when the open drone panel hides a drone, frame by frame. For each seed and viewport it renders the
// fixture of drone-panel.spec.ts through the render hook (the same view code, start pose, frame numbers as the live
// view's) with and without that one drone, takes the drone's drawn pixels from the difference, and says what share of
// them lies inside the panel's box as drone-panel.spec.ts measured it in the live view. Prints the frames where that
// state changes. Run: `npx playwright test -c test/render/probe.config.ts drone-panel-sweep` (SWEEP=seed@width,...).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import type { DirId } from '../../src/core/snapshot/types.js';
import { FPS } from '../../web/src/model/motion.js';
import { systemModel } from '../../web/src/model/system.js';
import { readFog } from '../../src/state/chart.js';
import { cli } from '../fixtures/cli.js';
import { droneView, session } from '../fixtures/drones.js';
import { realTempDir, removeTempDirs } from '../fixtures/tmp.js';
import { openView, render, systemView } from './harness.js';

test.afterAll(() => removeTempDirs());

/** #drone-panel's box with drone-panel.spec.ts's one-file session open (CSS px, dpr 1), as the live view laid it out. */
const PANEL = { 1280: { x0: 8, y0: 298.625, x1: 296.984375, y1: 680 }, 1920: { x0: 8, y0: 658.625, x1: 296.984375, y1: 1040 } } as const;
const RUNS = (process.env['SWEEP'] ?? '28@1280,28@1920,78@1920').split(',').map((r) => r.split('@').map(Number) as [number, 1280 | 1920]);

for (const [seed, W] of RUNS) {
  test(`drone seed ${seed} on bb at ${W}x${(W * 9) / 16}: under the panel by frame`, async ({ page }) => {
    const H = (W * 9) / 16, panel = PANEL[W];
    const dir = realTempDir('commet-189-');
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
    git('init', '-q', '-b', 'main');
    for (const [k, v] of [['user.name', 'Mate'], ['user.email', 'mate@example.com'], ['commit.gpgsign', 'false']]) git('config', k!, v!);
    for (const [path, text] of [['aa/one.ts', 'one\n'], ['aa/two.ts', 'two\n'], ['bb/three.ts', 'three\n'], ['README.md', '# r\n']]) {
      mkdirSync(dirname(join(dir, path!)), { recursive: true });
      writeFileSync(join(dir, path!), text!);
    }
    git('add', '-A');
    const at = '2026-10-10T09:00:00Z';
    execFileSync('git', ['commit', '-q', '-m', at], { cwd: dir, env: { ...process.env, GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at } });
    expect((await cli(['scan', '--no-ingest', '--no-root'], dir, { ...process.env, CLAUDE_CONFIG_DIR: join(dir, 'no-claude') })).code).toBe(0);
    const layout = JSON.parse(readFileSync(join(dir, '.git', 'commet', 'layout.json'), 'utf8')) as LayoutV1;
    const bb = systemModel(layout).planets.find((p) => p.path === 'bb')!;
    const fog = await readFog(dir);
    await page.setViewportSize({ width: W, height: H });
    const view = await openView(page, systemView());
    const frames = Array.from({ length: 480 }, (_, i) => i * 3); // one 48 s loop: two turns of the drone round bb
    const withDrone = await render(view, { layout, fog, drones: droneView(layout.source.head, [session(1, bb.dirId as DirId, { seed })]) }, frames);
    const without = await render(view, { layout, fog, drones: null }, frames);
    const rows: string[] = [];
    let last = '';
    for (let j = 0; j < frames.length; j++) {
      const a = withDrone[j]!.pixels, b = without[j]!.pixels, k = W / a.width;
      let area = 0, under = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
      for (let y = 0; y < a.height; y++) {
        for (let x = 0; x < a.width; x++) {
          const i = (y * a.width + x) * 4;
          if (a.rgba[i] === b.rgba[i] && a.rgba[i + 1] === b.rgba[i + 1] && a.rgba[i + 2] === b.rgba[i + 2]) continue;
          area += k * k;
          under += Math.max(0, Math.min((x + 1) * k, panel.x1) - Math.max(x * k, panel.x0)) * Math.max(0, Math.min((y + 1) * k, panel.y1) - Math.max(y * k, panel.y0));
          x0 = Math.min(x0, x * k); y0 = Math.min(y0, y * k); x1 = Math.max(x1, (x + 1) * k); y1 = Math.max(y1, (y + 1) * k);
        }
      }
      const state = area === 0 ? 'not drawn (off screen or behind bb)' : under >= area ? 'FULLY under the panel' : under > 0 ? 'partly under' : 'clear';
      if (state !== last) rows.push(`frame ${frames[j]} (${(frames[j]! / FPS).toFixed(1)} s): ${state}; ${area} px drawn, ${Math.round((100 * under) / Math.max(1, area))}% under, box x ${x0}-${x1}, y ${y0}-${y1}`);
      last = state;
    }
    console.log(`seed ${seed} at ${W}x${H}, panel x ${panel.x0}-${panel.x1}, y ${panel.y0}-${panel.y1}:\n  ${rows.join('\n  ')}`);
    expect(rows.length, 'the drone was drawn in some frame').toBeGreaterThan(1);
  });
}
