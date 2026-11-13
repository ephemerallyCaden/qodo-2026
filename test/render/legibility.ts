// Overview readability (#59; system-design §10): does a far planet's health band still read? Pure
// parts, unit-tested in legibility.test.ts and used by overview.spec.ts. The measure follows the
// health-looks lab (feature/asset-library, mockups/health-looks/): colours in OKLab (Ottosson 2020),
// where a step of about 0.02 is just noticeable, and a look summed up as one vector over the disc.
import { eyeOf, fovOf, project, projectedRadius, systemDepth, type OrbitPose } from '../../web/src/camera/pose.js';
import { fadeStrength } from '../../web/src/model/depth.js';
import { HEALTHY_LOOKS, planetCentre, type Look, type SystemModel } from '../../web/src/model/system.js';
import { length, sub } from '../../web/src/model/vec.js';
import type { Frame } from './frame.js';

const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };

/** OKLab [L, a, b] of an 8-bit sRGB colour. */
export function oklab(r8: number, g8: number, b8: number): [number, number, number] {
  const r = lin(r8), g = lin(g8), b = lin(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** A planet as the frame shows it: its index, eye distance, fade, and disc centre and radius in internal px. */
export interface Far { i: number; d: number; fade: number; x: number; y: number; r: number }

/** The farthest planet whose centre is on screen at a pose (frame 0), faded as the view fades it. */
export function farthestOnScreen(model: SystemModel, pose: OrbitPose, frame: { width: number; height: number }): Far {
  const eye = eyeOf(pose), depth = systemDepth(model);
  let best: Far | null = null;
  for (const [i, p] of model.planets.entries()) {
    const c = planetCentre(p, 0), q = project(pose, c);
    if (!q || Math.abs(q.x) > 1 || Math.abs(q.y) > 1) continue;
    const d = length(sub(c, eye));
    if (best && d <= best.d) continue;
    const r = projectedRadius(p.radius, q.depth, fovOf(pose)) * (frame.height / 2);
    best = { i, d, fade: fadeStrength(d, depth), x: ((q.x + 1) / 2) * frame.width, y: ((1 - q.y) / 2) * frame.height, r };
  }
  if (!best) throw new Error('no planet on screen');
  return best;
}

/** A look measured in one vector, OKLab units: the disc's mean [L, a, b], mean chroma, lightness spread and mean |ΔL| between 4-neighbours (texture). */
export interface Swatch { px: number; vector: [number, number, number, number, number, number] }

/**
 * The look of the planet drawn in `f` within `r` px of (x, y): every pixel there that differs from
 * `without`, the same frame without that planet (so space, stars and other bodies never count).
 * The health-looks lab's look vector without its glow term, which needs sentinel renders.
 */
export function measureLook(f: Frame, without: Frame, x: number, y: number, r: number): Swatch {
  const at = new Map<number, [number, number, number]>();
  for (let j = Math.max(0, Math.floor(y - r)); j <= Math.min(f.height - 1, Math.ceil(y + r)); j++) {
    for (let i = Math.max(0, Math.floor(x - r)); i <= Math.min(f.width - 1, Math.ceil(x + r)); i++) {
      if (Math.hypot(i + 0.5 - x, j + 0.5 - y) > r) continue;
      const k = (j * f.width + i) * 4;
      if (f.rgba[k] === without.rgba[k] && f.rgba[k + 1] === without.rgba[k + 1] && f.rgba[k + 2] === without.rgba[k + 2]) continue;
      at.set(j * f.width + i, oklab(f.rgba[k]!, f.rgba[k + 1]!, f.rgba[k + 2]!));
    }
  }
  const px = [...at.values()], n = Math.max(1, px.length);
  const mean = [0, 1, 2].map((c) => px.reduce((s, o) => s + o[c]!, 0) / n) as [number, number, number];
  const chroma = px.reduce((s, o) => s + Math.hypot(o[1], o[2]), 0) / n;
  const spread = Math.sqrt(px.reduce((s, o) => s + (o[0] - mean[0]) ** 2, 0) / n);
  let edges = 0, pairs = 0;
  for (const [k, o] of at) {
    for (const nb of [k % f.width < f.width - 1 ? k + 1 : -1, k + f.width]) {
      const q = at.get(nb);
      if (q) { edges += Math.abs(q[0] - o[0]); pairs++; }
    }
  }
  return { px: px.length, vector: [...mean, chroma, spread, edges / Math.max(1, pairs)] };
}

const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((v, k) => v - b[k]!));

/** Every look, worst band to best: lava → toxic → ash (the desert look) → healthy (lush, ocean or ice). */
export const BAND_LOOKS = ['lava', 'toxic', 'desert', ...HEALTHY_LOOKS] as const satisfies readonly Look[];

/** Each step between neighbouring bands; ash → healthy is to the nearest healthy look. */
export function bandSteps(looks: Record<Look, Swatch>): { lavaToxic: number; toxicAsh: number; ashHealthy: number } {
  const v = (k: Look) => looks[k].vector;
  return {
    lavaToxic: distance(v('lava'), v('toxic')),
    toxicAsh: distance(v('toxic'), v('desert')),
    ashHealthy: Math.min(...HEALTHY_LOOKS.map((h) => distance(v('desert'), v(h)))),
  };
}
