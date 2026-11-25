// Opt-in stills of the fog's three levels for a human checkpoint (#228): `npx playwright test -c
// test/render/probe.config.ts cloud-stills`. Renders the built view (dist/web), and, when STILLS_BEFORE
// names another build's dist/web, that build too, from the same inputs. Writes 4× nearest-upscaled PNGs
// to STILLS_OUT (default: a temp dir, printed), named <scene>-<level>-<build>.png.
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from '@playwright/test';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import { systemModel } from '../../web/src/model/system.js';
import { selfLikeRoots } from '../fixtures/overview.js';
import { encodePng } from './png.js';
import { fogFor, following, MINI, openView, render, systemView, type Target } from './harness.js';

const OUT = process.env['STILLS_OUT'] ?? join(tmpdir(), 'commet-cloud-stills');
const SCALE = 4;

function upscale(w: number, h: number, rgba: Uint8Array): Buffer {
  const out = new Uint8Array(w * SCALE * h * SCALE * 4);
  for (let y = 0; y < h * SCALE; y++) for (let x = 0; x < w * SCALE; x++) {
    const s = (Math.floor(y / SCALE) * w + Math.floor(x / SCALE)) * 4, d = (y * w * SCALE + x) * 4;
    out.set(rgba.subarray(s, s + 4), d);
  }
  return encodePng(w * SCALE, h * SCALE, out);
}

/** mini with `src` lush (healthy, a lush biome seed) and `web` toxic, as in the fixture. */
const LUSH_SEED = 1234566; // ≡ 0 mod 3: HEALTHY_LOOKS[0], lush
const mini: LayoutV1 = { ...MINI, planets: MINI.planets.map((p) => (p.path === 'src' ? { ...p, health: { ...p.health, band: 'healthy' as const }, biomeSeed: LUSH_SEED } : p)) };
const model = systemModel(mini);
const filesOf = (layout: LayoutV1, path: string) => {
  const p = layout.planets.find((x) => x.path === path)!;
  return [...p.surface.settlements.map((s) => s.fileId), ...p.moons.map((m) => m.fileId)];
};
const srcFirst = mini.planets.find((p) => p.path === 'src')!.surface.settlements[0]!.fileId;
const LEVELS = {
  fogged: fogFor(mini, () => true),
  misted: fogFor(mini, () => false, () => true),
  clear: fogFor(mini),
  'one-of-three': fogFor(mini, (id) => id === srcFirst),
};
/** The same lush planet with 30 files on a scanned planet's 256-cell grid: small territories, as on a real planet. */
const src = mini.planets.find((p) => p.path === 'src')!;
const many: LayoutV1 = { ...mini, planets: mini.planets.map((p) => (p !== src ? p : { ...p, surface: { ...p.surface, grid: { cells: 256, kind: 'fibonacci' as const },
  settlements: Array.from({ length: 30 }, (_, k) => ({ ...p.surface.settlements[0]!, fileId: `f_1${String(k).padStart(11, '0')}` as const, cell: (k * 37 + Math.floor(k / 5) * 3) % 256 })) } })) };
const manyIds: string[] = many.planets.find((p) => p.path === 'src')!.surface.settlements.map((s) => s.fileId);
const MANY = {
  fogged: fogFor(many, () => true),
  misted: fogFor(many, () => false, () => true),
  'one-in-three': fogFor(many, (id) => manyIds.indexOf(id) % 3 === 0, (id) => manyIds.indexOf(id) % 3 === 1),
};
const repoHalf = new Set<string>(fogFor(selfLikeRoots).files.filter((_, i) => i % 2 === 0).map((f) => f.fileId));

const builds: [string, Target][] = [['after', systemView()]];
if (process.env['STILLS_BEFORE']) builds.unshift(['before', { name: 'before', entry: '/index.html', mounts: [{ url: '/', dir: process.env['STILLS_BEFORE'] }] }]);

test('fog level stills', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  for (const [build, target] of builds) {
    const view = await openView(page, target);
    const shots: [string, Parameters<typeof render>[1]][] = [];
    for (const [level, fog] of Object.entries(LEVELS)) {
      shots.push([`lush-${level}`, { layout: mini, fog, camera: following(model, 'src', 0), reducedMotion: true }]);
      if (level !== 'one-of-three') shots.push([`toxic-${level}`, { layout: mini, fog, camera: following(model, 'web', 0), reducedMotion: true }]);
      if (level !== 'one-of-three') shots.push([`overview-${level}`, { layout: mini, fog, reducedMotion: true }]);
    }
    for (const [level, fog] of Object.entries(MANY)) shots.push([`many-${level}`, { layout: many, fog, camera: following(systemModel(many), 'src', 0), reducedMotion: true }]);
    shots.push(['repo-half', { layout: selfLikeRoots, fog: fogFor(selfLikeRoots, (id) => repoHalf.has(id), (id) => !repoHalf.has(id)), reducedMotion: true }]);
    for (const [name, input] of shots) {
      const [r] = await render(view, input, [0]);
      writeFileSync(join(OUT, `${name}-${build}.png`), upscale(r!.pixels.width, r!.pixels.height, r!.pixels.rgba));
      console.log(`${build} ${name}: ${r!.stats.drawCalls} draws, ${r!.stats.triangles} triangles`);
    }
    if (view.errors.length) throw new Error(view.errors.join('\n'));
  }
  console.log(`stills in ${OUT}; files of src: ${filesOf(mini, 'src').length}`);
});
