// Where planet labels go: centred under each visible planet's disc, nearest planets first, and
// never for a planet (or a label) hidden behind a nearer planet or the star. Pure (no DOM), so it's testable.
import { flatHit, fovOf, project, projectedRadius, type OrbitPose } from '../camera/pose.js';
import type { Occluder, Sphere } from '../model/vec.js';

export interface Placed { i: number; x: number; y: number }

/**
 * Label anchors in device px for the planets (indexed as given), at most `max`. `occluders` are
 * other discs (the star and its corona) that can hide a planet but get no label here. Every disc is
 * judged at its centre's depth; a flat one (the corona) hides what its outline covers.
 */
export function placeLabels(pose: OrbitPose, planets: readonly Sphere[], occluders: readonly Occluder[], W: number, H: number, gap: number, max: number): Placed[] {
  const screen = (d: Sphere) => {
    const p = project(pose, d.centre);
    if (!p) return null;
    return { depth: p.depth, x: ((p.x + 1) / 2) * W, y: ((1 - p.y) / 2) * H, r: projectedRadius(d.radius, p.depth, fovOf(pose)) * (H / 2) };
  };
  const discs = planets.map(screen);
  const blockers = [...discs, ...occluders.map((o) => (o.flat ? null : screen(o)))];
  const flats = occluders.flatMap((o) => { const p = o.flat ? project(pose, o.centre) : null; return p ? [{ o, depth: p.depth }] : []; });
  const ndc = (x: number, y: number) => ({ x: (x / W) * 2 - 1, y: 1 - (y / H) * 2 });
  const out: (Placed & { depth: number })[] = [];
  discs.forEach((d, i) => {
    if (!d || d.x < -d.r || d.x > W + d.r || d.y < -d.r || d.y > H + d.r) return;
    const y = d.y + d.r + gap;
    // hidden when its centre or its label would sit on a nearer disc
    const covers = (b: (typeof blockers)[number], j: number) => b !== null && j !== i && b.depth < d.depth
      && (Math.hypot(b.x - d.x, b.y - d.y) < b.r || Math.hypot(b.x - d.x, b.y - y) < b.r);
    const veils = (f: (typeof flats)[number]) => f.depth < d.depth
      && (flatHit(pose, ndc(d.x, d.y), f.o) < Infinity || flatHit(pose, ndc(d.x, y), f.o) < Infinity);
    if (!blockers.some(covers) && !flats.some(veils)) out.push({ i, x: d.x, y, depth: d.depth });
  });
  out.sort((a, b) => a.depth - b.depth || a.i - b.i); // nearest first, so the cap keeps the nearest
  return out.slice(0, Math.max(0, max)).map(({ i, x, y }) => ({ i, x, y }));
}
