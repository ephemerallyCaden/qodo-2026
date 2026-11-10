// Where planet labels go: centred under each visible planet's disc, nearest planets first, and
// never for a planet (or a label) hidden behind a nearer planet or the star. Pure (no DOM), so it's testable.
import { fovOf, project, projectedRadius, type OrbitPose } from '../camera/pose.js';
import type { Sphere } from '../model/vec.js';

export interface Placed { i: number; x: number; y: number }

/**
 * Label anchors in device px for the planets (indexed as given), at most `max`. `occluders` are
 * other discs (the star) that can hide a planet but get no label here.
 */
export function placeLabels(pose: OrbitPose, planets: readonly Sphere[], occluders: readonly Sphere[], W: number, H: number, gap: number, max: number): Placed[] {
  const screen = (d: Sphere) => {
    const p = project(pose, d.centre);
    if (!p) return null;
    return { depth: p.depth, x: ((p.x + 1) / 2) * W, y: ((1 - p.y) / 2) * H, r: projectedRadius(d.radius, p.depth, fovOf(pose)) * (H / 2) };
  };
  const discs = planets.map(screen);
  const blockers = [...discs, ...occluders.map(screen)];
  const out: (Placed & { depth: number })[] = [];
  discs.forEach((d, i) => {
    if (!d || d.x < -d.r || d.x > W + d.r || d.y < -d.r || d.y > H + d.r) return;
    const y = d.y + d.r + gap;
    // hidden when its centre or its label would sit on a nearer disc
    const covers = (b: (typeof blockers)[number], j: number) => b !== null && j !== i && b.depth < d.depth
      && (Math.hypot(b.x - d.x, b.y - d.y) < b.r || Math.hypot(b.x - d.x, b.y - y) < b.r);
    if (!blockers.some(covers)) out.push({ i, x: d.x, y, depth: d.depth });
  });
  out.sort((a, b) => a.depth - b.depth || a.i - b.i); // nearest first, so the cap keeps the nearest
  return out.slice(0, Math.max(0, max)).map(({ i, x, y }) => ({ i, x, y }));
}
