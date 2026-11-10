// Golden images for the render tests (#31 AC 5-6). A golden is a PNG of the low-res target plus its
// text twin, under test/golden/render/. Each twin records the environment its golden was made in, and
// the golden compares strictly only there (the pinned Playwright image in CI): test/render/README.md.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { RenderStats } from '../../src/core/contract/api.js';
import { assertRendered, diffPixels, type Frame } from './frame.js';
import { decodePng, encodePng } from './png.js';
import { PIXELS } from './thresholds.js';
import { envJson, twinRecord, twinText, type RenderEnv } from './twin.js';

const ROOT = join(import.meta.dirname, '../..');
export const GOLDEN_DIR = join(ROOT, 'test/golden/render');
/** Every run writes what UPDATE_GOLDEN=1 would write here; CI uploads it as an artifact. */
const CANDIDATE_DIR = join(ROOT, 'test-results/render-goldens');

export interface GoldenOptions {
  env: RenderEnv;
  /** Rewrite the golden instead of comparing (UPDATE_GOLDEN=1). */
  update?: boolean;
  /** In CI a golden recorded in another environment fails instead of being skipped. */
  ci?: boolean;
  dir?: string;
  candidates?: string;
}

type GoldenResult =
  | { status: 'written' }
  | { status: 'match' }
  /** Local run outside the golden's environment: everything but the golden compare was enforced. */
  | { status: 'unpinned'; diffPixels: number; recorded: RenderEnv };

/** Repo-relative when inside the repo, so messages stay short; absolute otherwise. */
const shown = (p: string) => { const r = relative(ROOT, p); return r === '' || r.startsWith('..') ? p : r; };
export const describeEnv = (e: RenderEnv) => `${e.platform}/${e.arch}, Playwright ${e.playwright}, browser ${e.browser}, ${e.webgl}`;

/** Lines only in the golden twin (-) and only in the new one (+), in order. */
function twinDiff(golden: string, actual: string): string {
  const g = golden.split('\n'), a = actual.split('\n');
  const gs = new Set(g), as = new Set(a);
  return [...g.filter((l) => !as.has(l)).map((l) => `- ${l}`), ...a.filter((l) => !gs.has(l)).map((l) => `+ ${l}`)].join('\n');
}

function write(dir: string, name: string, png: Buffer, twin: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.png`), png);
  writeFileSync(join(dir, `${name}.txt`), twin);
}

/**
 * Compares a frame with its golden, or writes it with `update`. A blank, misshapen or over-budget
 * frame throws before anything is written, so an empty render can never become a golden.
 */
export function checkGolden(name: string, frame: Frame, stats: RenderStats, opts: GoldenOptions): GoldenResult {
  const dir = opts.dir ?? GOLDEN_DIR;
  assertRendered(frame, stats);
  const twin = twinText(name, frame, { stats, env: opts.env });
  const png = encodePng(frame.width, frame.height, frame.rgba);
  const candidates = opts.candidates ?? CANDIDATE_DIR;
  write(candidates, name, png, twin);
  if (opts.update) {
    write(dir, name, png, twin);
    return { status: 'written' };
  }
  const goldenPng = join(dir, `${name}.png`), goldenTwin = join(dir, `${name}.txt`);
  for (const f of [goldenPng, goldenTwin]) {
    if (!existsSync(f)) throw new Error(`missing golden ${relative(dir, f)} in ${shown(dir)}: render it with UPDATE_GOLDEN=1 in the pinned environment (test/render/README.md)`);
  }
  const golden = decodePng(readFileSync(goldenPng));
  const committed = readFileSync(goldenTwin, 'utf8');
  const was = twinRecord(committed);
  const sameSize = golden.width === frame.width && golden.height === frame.height;
  const diff = sameSize ? diffPixels(golden, frame) : frame.width * frame.height;
  if (envJson(was.env) !== envJson(opts.env)) {
    if (opts.ci) {
      throw new Error(`${name}: render goldens are authoritative only where they were made (${describeEnv(was.env)}), ` +
        `but this CI run is ${describeEnv(opts.env)}. Pin the CI image to that environment, or regenerate the goldens in this one on purpose.`);
    }
    return { status: 'unpinned', diffPixels: diff, recorded: was.env };
  }
  const candidate = shown(join(candidates, `${name}.png`));
  if (!sameSize) throw new Error(`${name}: golden is ${golden.width}x${golden.height}, frame is ${frame.width}x${frame.height}. New image: ${candidate}`);
  // Within a non-zero threshold the twin's counts may drift with the pixels; its stats and, at 0 px, its every line may not.
  if (diff > PIXELS.maxDiffPixels || was.stats.drawCalls !== stats.drawCalls || was.stats.triangles !== stats.triangles || (diff === 0 && committed !== twin)) {
    throw new Error(`${name}: ${diff} px differ from the golden (max ${PIXELS.maxDiffPixels}). New image: ${candidate}\n${twinDiff(committed, twin)}`);
  }
  return { status: 'match' };
}
