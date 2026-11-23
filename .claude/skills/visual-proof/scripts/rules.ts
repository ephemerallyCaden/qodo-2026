// visual-proof (R2, R5, R7, R11, R12): the conditions that stop a run. A Stop is never an error to
// work around: the run records it, prints `STOP <code>: <message>`, and the user decides.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { diffPixels, type Box } from './frames.js';
import { readPng } from './png.js';
import type { Hit } from './privacy.js';

export type StopCode =
  | 'bad-input' | 'tool-missing' | 'build-failed' | 'no-view-change' | 'data-change'
  | 'scene-unreachable' | 'takes-differ' | 'privacy';

export class Stop extends Error {
  constructor(readonly code: StopCode, message: string, readonly detail: string[] = []) {
    super(message);
    this.name = 'Stop';
  }
}

/**
 * R12: what the snapshot and layout are made of. A diff here means the two builds would see different
 * data, so the same-data guarantee no longer holds: stop and ask.
 */
export const DATA_PATHS = ['src/scan/', 'src/attrib/', 'src/core/layout/', 'src/core/snapshot/', 'src/core/contract/'] as const;

export const dataPathsTouched = (paths: readonly string[]): string[] => paths.filter((p) => DATA_PATHS.some((d) => p.startsWith(d)));

/** dist/web, digested: every file's path and bytes. Its JS name is a content hash too. */
export interface Bundle { digest: string; files: string[] }

/** R11: the same bundle on both sides means no view change, so nothing to film. */
export function noViewChange(base: Bundle, head: Bundle): Stop | null {
  if (base.digest !== head.digest) return null;
  const js = base.files.filter((f) => f.endsWith('.js')).join(', ') || base.files.join(', ');
  return new Stop('no-view-change', `no view change: base and head build the same view bundle (${js}, dist/web sha256 ${base.digest.slice(0, 12)})`);
}

export interface TakeCompare {
  frames: number;
  /** Frames whose pixels differ between the two takes. */
  differing: { k: number; px: number; box: Box | null }[];
  /** Parts of the take logs that differ: frame count, stills, probes, page texts. */
  logDiffers: string[];
}

interface TakeLog { frames: { k: number; probes?: unknown }[]; stills: unknown; texts: unknown }

const framesOf = (dir: string) => readdirSync(join(dir, 'raw')).filter((f) => /^\d{4}\.png$/.test(f)).sort();

/** R2: the two takes of one build, frame by frame (pixels) and log by log. */
export async function compareTakes(a: string, b: string): Promise<TakeCompare> {
  const fa = framesOf(a), fb = framesOf(b);
  const la = JSON.parse(readFileSync(join(a, 'log.json'), 'utf8')) as TakeLog;
  const lb = JSON.parse(readFileSync(join(b, 'log.json'), 'utf8')) as TakeLog;
  const logDiffers: string[] = [];
  if (fa.length !== fb.length || la.frames.length !== lb.frames.length) logDiffers.push(`frame count (${fa.length} and ${fb.length})`);
  if (JSON.stringify(la.stills) !== JSON.stringify(lb.stills)) logDiffers.push('stills');
  if (JSON.stringify(la.frames.map((f) => f.probes)) !== JSON.stringify(lb.frames.map((f) => f.probes))) logDiffers.push('probes');
  if (JSON.stringify(la.texts) !== JSON.stringify(lb.texts)) logDiffers.push('page texts');
  const differing: TakeCompare['differing'] = [];
  for (let k = 0; k < Math.min(fa.length, fb.length); k++) {
    const x = readFileSync(join(a, 'raw', fa[k]!)), y = readFileSync(join(b, 'raw', fb[k]!));
    if (x.equals(y)) continue;
    const d = diffPixels(readPng(x), readPng(y));
    if (d.px) differing.push({ k, px: d.px, box: d.box });
  }
  return { frames: Math.max(fa.length, fb.length), differing, logDiffers };
}

const boxText = (b: Box | null) => (b ? `x ${b.x0}-${b.x1}, y ${b.y0}-${b.y1}` : 'nowhere');

/** R2: any difference between two takes of one build stops the run. */
export function takesStop(side: string, c: TakeCompare): Stop | null {
  if (!c.differing.length && !c.logDiffers.length) return null;
  const parts = [
    ...(c.differing.length ? [`${c.differing.length} of ${c.frames} frames differ in pixels (first, frame ${c.differing[0]!.k}: ${c.differing[0]!.px} px, ${boxText(c.differing[0]!.box)})`] : []),
    ...(c.logDiffers.length ? [`the logs differ in ${c.logDiffers.join(', ')}`] : []),
  ];
  return new Stop('takes-differ', `the two ${side} takes differ: ${parts.join('; ')}`,
    c.differing.slice(0, 12).map((d) => `frame ${d.k}: ${d.px} px, ${boxText(d.box)}`));
}

/** R5: any hit stops; the detail names rule and place, with a masked excerpt only. */
export function privacyStop(hits: readonly Hit[]): Stop | null {
  if (!hits.length) return null;
  return new Stop('privacy', `privacy scan: ${hits.length} hit${hits.length === 1 ? '' : 's'}; nothing was composed or kept from this run`,
    hits.map((h) => `${h.rule} in ${h.where}: ${h.excerpt}`));
}

/** R7: a tool the run needs is missing. */
export function missingTools(found: Readonly<Record<string, boolean>>): Stop | null {
  const missing = Object.entries(found).filter(([, ok]) => !ok).map(([name]) => name);
  if (!missing.length) return null;
  return new Stop('tool-missing', `missing: ${missing.join(', ')}`, missing.map((m) => HOW_TO_GET[m] ?? m));
}

const HOW_TO_GET: Record<string, string> = {
  git: 'git: install it, then rerun',
  node: 'node: Node 20.19 or later',
  node_modules: 'node_modules: run `npm ci` in this checkout (the tools load @playwright/test and typescript from it)',
  chromium: "chromium: run `npx playwright install chromium` (the render tests' browser)",
  tar: 'tar: the system tar, to unpack `git archive`',
};
