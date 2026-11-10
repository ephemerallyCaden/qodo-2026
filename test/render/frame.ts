// Pure checks on one rendered frame: shape, empty output (AC 3), the draw budget (AC 4) and pixel
// diffs (AC 2). No browser here, so they're unit-tested in Vitest and reused by the Playwright specs.
import type { RenderStats } from '../../src/core/contract/api.js';
import { palette } from '../../src/core/palette.js';
import { BLANK, BUDGET, PIXELS } from './thresholds.js';

/** RGBA bytes of the low-res target, row 0 at the top (the contract's `lowResPixels()`). */
export interface Frame { width: number; height: number; rgba: Uint8Array }

/** `#rrggbb` of a packed RGBA value (alpha dropped). */
export const hex = (c: number) => `#${(c >>> 8).toString(16).padStart(6, '0')}`;
/** The pixel at byte offset i, packed as one unsigned RGBA integer. */
export const rgbaAt = (rgba: Uint8Array, i: number) => ((rgba[i]! << 24) | (rgba[i + 1]! << 16) | (rgba[i + 2]! << 8) | rgba[i + 3]!) >>> 0;

/** The default internal target (pixelHeight 180, 16:9). */
export const LOW_RES = { width: 320, height: 180 } as const;

const SPACE = parseInt(palette.world.space.slice(1), 16);

/** Unique RGB colours, and pixels that aren't the space colour. Alpha is ignored: the target is opaque. */
export function coverage(f: Frame): { colours: number; nonSpace: number } {
  const seen = new Set<number>();
  let nonSpace = 0;
  for (let i = 0; i < f.rgba.length; i += 4) {
    const rgb = rgbaAt(f.rgba, i) >>> 8;
    seen.add(rgb);
    if (rgb !== SPACE) nonSpace++;
  }
  return { colours: seen.size, nonSpace };
}

/** Everything wrong with a frame's shape and content; empty means it rendered. */
export function frameProblems(f: Frame, expected?: { width: number; height: number }): string[] {
  const { width: w, height: h } = f;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) return [`no frame: size ${w}x${h}`];
  if (f.rgba.length !== w * h * 4) return [`rgba has ${f.rgba.length} bytes, expected ${w * h * 4} for ${w}x${h}`];
  const out: string[] = [];
  if (expected && (w !== expected.width || h !== expected.height)) out.push(`frame is ${w}x${h}, expected the ${expected.width}x${expected.height} low-res target`);
  let translucent = 0;
  for (let i = 3; i < f.rgba.length; i += 4) if (f.rgba[i] !== 255) translucent++;
  // The target is opaque, so every colour check (palette, twin) can read RGB alone.
  if (translucent) out.push(`${translucent} px aren't opaque (alpha 255)`);
  const { colours, nonSpace } = coverage(f);
  const need = Math.ceil(BLANK.minNonSpaceFraction * w * h);
  if (colours < BLANK.minColours) out.push(`blank frame: ${colours} colour${colours === 1 ? '' : 's'} (need ${BLANK.minColours})`);
  if (nonSpace < need) out.push(`blank frame: ${nonSpace} of ${w * h} px aren't space ${palette.world.space} (need ${need})`);
  return out;
}

/** Budget and sanity problems in renderer.info figures for a frame; empty means within budget. */
export function statsProblems(s: RenderStats, f?: Pick<Frame, 'width' | 'height'>): string[] {
  const out: string[] = [];
  const count = (k: 'drawCalls' | 'triangles', max: number) => {
    const v = s[k];
    if (!Number.isInteger(v) || v < 1) out.push(`${k} is ${v}: nothing was drawn`);
    else if (v > max) out.push(`${k} ${v} is over the budget of ${max}`);
  };
  count('drawCalls', BUDGET.maxDrawCalls);
  count('triangles', BUDGET.maxTriangles);
  if (f && (s.width !== f.width || s.height !== f.height)) out.push(`stats report ${s.width}x${s.height}, pixels are ${f.width}x${f.height}`);
  return out;
}

/** Throws with every problem if the frame is empty, misshapen or over budget. */
export function assertRendered(f: Frame, s: RenderStats, expected?: { width: number; height: number }): void {
  const problems = [...frameProblems(f, expected), ...statsProblems(s, f)];
  if (problems.length) throw new Error(`render check failed:\n  ${problems.join('\n  ')}`);
}

/** Pixels where any channel differs by more than the tolerance. Different sizes throw. */
export function diffPixels(a: Frame, b: Frame, tolerance: number = PIXELS.channelTolerance): number {
  if (a.width !== b.width || a.height !== b.height) throw new Error(`can't diff ${a.width}x${a.height} against ${b.width}x${b.height}`);
  let n = 0;
  for (let i = 0; i < a.rgba.length; i += 4) {
    for (let k = 0; k < 4; k++) {
      if (Math.abs(a.rgba[i + k]! - b.rgba[i + k]!) > tolerance) { n++; break; }
    }
  }
  return n;
}
