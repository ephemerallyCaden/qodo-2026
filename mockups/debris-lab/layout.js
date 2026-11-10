// The lab's exploration arrangements (directions B, D, E), registered into the viewer's
// (../asset-viewer/debris-layout.js, which holds the shared layout, motion, ageing, sweep and nav
// lights, and the product arrangement, A3 `orbits`). Pure, so it's testable in Node. Heaps and the
// wake pack their pieces (`prepare`), so removing an item re-packs the rest.
import { ARRANGEMENTS, CENTRE, TAU, norm, cross, orbitPlace, orbitPoint } from '../asset-viewer/debris-layout.js';
import './kits.js'; // the lab's kits, registered before anything plans
import './palette.js'; // and their colours

export * from '../asset-viewer/debris-layout.js';

Object.assign(ARRANGEMENTS, {
  // Near-polar orbits, all one way: the planes stand across the equator (and any ring).
  polar: { place: (rnd, ctx) => ({ ...orbitPlace(rnd, ctx), dir: 1, incl: ((72 + 18 * rnd()) * Math.PI) / 180 }) },
  // Two parked heaps beside the planet (leading and trailing side), each piece circling inside
  // its heap. Sides alternate by rank so both fill; a heap grows with the pieces in it. The heaps
  // never sit in front of the disc in the hero view.
  heaps: {
    prepare: (built) => built.map((_, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      return { side, radius: 0.14 + 0.07 * Math.sqrt(side < 0 ? Math.ceil(built.length / 2) : Math.floor(built.length / 2)) };
    }),
    place: (rnd, { radius, slot }) => {
      const c = [slot.side * (radius * 1.32 + slot.radius + 0.04), radius * 0.12, -radius * 0.12];
      const o = { r: slot.radius * (0.3 + 0.7 * Math.sqrt(rnd())), e: 0, incl: rnd() * Math.PI, node: rnd() * TAU, peri: 0, dir: rnd() < 0.5 ? -1 : 1, turns: 1, off: rnd() };
      return { kind: 'heap', centre: c, orbit: o };
    },
  },
  // A comet-like wake trailing off one side: youngest nearest the planet, oldest at the tail end;
  // spacing shrinks so the tail stays about 2.6 R long. Each piece circles its slot; the circles
  // widen down the tail.
  wake: {
    prepare: (built, radius) => {
      const byAge = built.map((_, i) => i).sort((a, b) => built[a].it.age - built[b].it.age || (built[a].it.id < built[b].it.id ? -1 : 1));
      const natural = byAge.map((i) => built[i].size * 0.95 + 0.05);
      const squeeze = Math.min(1, (2.6 * Math.max(radius, 0.8)) / Math.max(1e-6, natural.reduce((s, x) => s + x, 0)));
      const slots = [];
      let d = 0;
      byAge.forEach((i, k) => {
        d += (natural[k] * squeeze) / 2;
        slots[i] = { d, k };
        d += (natural[k] * squeeze) / 2;
      });
      return slots;
    },
    place: (rnd, { radius, slot }) => {
      const axis = norm([1, -0.32, -0.3]);
      const u = norm(cross(axis, [0, 1, 0]));
      const v = cross(u, axis);
      return { kind: 'wake', axis, u, v, d: radius * 1.3 + slot.d, w: 0.03 + 0.022 * slot.k, off: rnd(), dir: rnd() < 0.5 ? -1 : 1 };
    },
  },
});

Object.assign(CENTRE, {
  heap: (m, phase) => orbitPoint(m.orbit, phase).map((x, i) => x + m.centre[i]),
  wake: (m, phase) => {
    const a = TAU * (m.dir * phase + m.off);
    return [0, 1, 2].map((i) => m.axis[i] * m.d + m.u[i] * m.w * Math.cos(a) + m.v[i] * m.w * Math.sin(a));
  },
});
