// Fog as clouds (the fog-as-clouds variants C1-C5; the human's idea, 2026-11-14): instead of a veil on the
// ground, the uncharted territory is covered by cloud, so the planet's cloud cover reads the share still
// unknown, and charting a file clears the cloud over it. Pure: no DOM, no three.js, no clock. It turns the
// fog state (fog-layout.js: footprint() + stateAt()) into puff placements for planet.setFogClouds().
//
// - One clump per fogged grid cell (a lead puff and satellites), so coverage is exactly the fogged share of
//   the surface (fog-layout's territory rule shares every cell among the files). `density` < 1 leaves some
//   fogged cells open, so the ground shows through gaps.
// - Events: a clear thins the clouds outward from the file's anchor at the fog's own front speed (reach x
//   progress), a refog thickens them from the far edge inward; both on their own clock, outside the loop lock.
// - The clouds sit in the ground's frame: they stay over their files instead of drifting with the weather.
import { centresOf, neighbours, hash01, SURFACE_CELLS } from './fog-layout.js';

/**
 * ordinary: whether the biome's own seeded weather stays on (false: the fog clouds replace it, so a fully
 * charted planet is clear); ramp: the cloud ramp ('cloud' cream as today, 'ash' the ash-smoke greys);
 * density: the share of fogged cells that get cloud; size / lift / float / flat / stretch: the puff shape.
 */
export const CLOUD_FOGS = {
  C1: { id: 'C1', name: 'overcast', idea: 'the fog is the clouds: the cloud cover is the unknown share, and a charted planet is clear',
    ordinary: false, ramp: 'cloud', density: 1, size: 0.15, lift: 1, float: 0.055, flat: 0.6, stretch: 1 },
  C2: { id: 'C2', name: 'storm over weather', idea: 'the planet keeps its own cream weather; the unknown is a darker, higher storm layer on top',
    ordinary: true, ramp: 'ash', density: 1, size: 0.15, lift: 1.2, float: 0.085, flat: 0.6, stretch: 1 },
  C3: { id: 'C3', name: 'broken cloud', idea: 'cloud with gaps: the ground shows through, so the band can read through the unknown',
    ordinary: false, ramp: 'cloud', density: 0.6, size: 0.12, lift: 0.9, float: 0.055, flat: 0.6, stretch: 1 },
  C4: { id: 'C4', name: 'storm front', idea: 'a dark storm replaces the weather: unknown is stormy, known is clear',
    ordinary: false, ramp: 'ash', density: 0.9, size: 0.15, lift: 1.3, float: 0.07, flat: 0.6, stretch: 1 },
  C5: { id: 'C5', name: 'stratus bands', idea: 'long east-west cloud bands over the unknown, like the streaks of a gas giant',
    ordinary: false, ramp: 'cloud', density: 0.85, size: 0.1, lift: 0.5, float: 0.05, flat: 0.35, stretch: 3 },
  // The human's pick (2026-11-16): C4's storm-front shape in white. Cloud cover is the undiscovered share:
  // no clouds at 100% discovered. The cream weather (lush, ocean) goes; lava's ash and toxic's rust
  // smoke stay, since they're health-band cues, not clouds ('smoke').
  C6: { id: 'C6', name: 'white storm front', idea: 'the fog is white storm cloud over the undiscovered share; a fully discovered planet has no clouds',
    ordinary: 'smoke', ramp: 'cloud', density: 0.9, size: 0.15, lift: 1.3, float: 0.07, flat: 0.6, stretch: 1 },
};

/** The fog's look (the viewer's and the library's fog). */
export const FINAL_CLOUD_FOG = 'C6';

/**
 * Whether a planet's own seeded weather still draws under a cloud fog. weatherRamp: the biome weather's
 * ramp ('cloud' for cream clouds, 'ash' for lava's plumes, 'spore' for toxic's rust smoke), or null (no weather).
 */
export function weatherShown(variant, weatherRamp) {
  const v = typeof variant === 'string' ? CLOUD_FOGS[variant] : variant;
  if (!weatherRamp) return false;
  if (v.ordinary === true) return true;
  if (v.ordinary === 'smoke') return weatherRamp !== 'cloud';
  return false;
}

const FRONT_SOFT = 0.1; // rad: how softly a clear or refog front thins the cloud

/** The share of a cell's cloud left at time t: 1 fogged at rest, 0 charted, in between inside a front. */
function veil(planet, foot, state, i) {
  const k = foot.owner[i];
  if (k < 0) return 0;
  const id = planet.files[k].id;
  const ev = state.active.get(id);
  if (!ev) return state.fogged.has(id) ? 1 : 0;
  const c = centresOf(planet.cells);
  const a = foot.anchor[k];
  const d = Math.acos(Math.min(1, c[3 * i] * c[3 * a] + c[3 * i + 1] * c[3 * a + 1] + c[3 * i + 2] * c[3 * a + 2]));
  const front = ev.progress * foot.reach[k];
  const soft = (x) => Math.min(1, Math.max(0, x));
  if (ev.kind === 1) return soft((d - front) / FRONT_SOFT + 0.5); // a clear: cloud ahead of the front stays, behind it is gone
  return soft((d - (foot.reach[k] - front)) / FRONT_SOFT + 0.5); // a refog: cloud rolls back in from the far edge
}

/**
 * The fog clouds of a planet at a moment: { ramp, items, cover } for planet.setFogClouds().
 * cover: the share of grid cells carrying cloud (the lab's coverage measure).
 */
export function fogClouds(planet, foot, state, variant) {
  const v = typeof variant === 'string' ? CLOUD_FOGS[variant] : variant;
  const n = planet.cells ?? SURFACE_CELLS;
  const c = centresOf(n);
  const nb = neighbours(n);
  // Gaps: in each file's territory, the same fixed share of its cells (1 - density, picked by a seeded rank)
  // stays open, so the cloud cover is exactly density x the undiscovered share of the surface.
  const gap = new Uint8Array(n);
  const byFile = new Map();
  for (let i = 0; i < n; i++) if (foot.owner[i] >= 0) (byFile.get(foot.owner[i]) ?? byFile.set(foot.owner[i], []).get(foot.owner[i])).push(i);
  for (const [k, cells] of byFile) {
    const ranked = cells.map((i) => [hash01(`${v.id}|gap|${planet.files[k].id}|${i}`), i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const gaps = Math.round(cells.length * (1 - v.density));
    for (let j = 0; j < gaps; j++) gap[ranked[j][1]] = 1;
  }
  const open = new Float32Array(n);
  let covered = 0;
  for (let i = 0; i < n; i++) {
    const w = veil(planet, foot, state, i);
    if (w > 0 && !gap[i]) { open[i] = w; covered++; }
  }
  // masses: connected cloudy cells, each shaded as one dome (the weather's mass anchors)
  const mass = new Int16Array(n).fill(-1);
  const masses = [];
  for (let i = 0; i < n; i++) {
    if (open[i] <= 0 || mass[i] >= 0) continue;
    const stack = [i];
    mass[i] = masses.length;
    const cells = [];
    while (stack.length) {
      const j = stack.pop();
      cells.push(j);
      for (const q of nb[j]) if (open[q] > 0 && mass[q] < 0) { mass[q] = masses.length; stack.push(q); }
    }
    masses.push(cells);
  }
  const anchors = masses.map((cells) => {
    const s = [0, 0, 0];
    for (const j of cells) for (let a = 0; a < 3; a++) s[a] += c[3 * j + a];
    const len = Math.hypot(...s) || 1;
    const cen = s.map((x) => x / len);
    let minDot = 1;
    for (const j of cells) minDot = Math.min(minDot, cen[0] * c[3 * j] + cen[1] * c[3 * j + 1] + cen[2] * c[3 * j + 2]);
    const radius = Math.acos(Math.min(1, minDot));
    const depth = 1 + v.float - Math.min(0.5, Math.max(0.06, radius * 1.1)); // below the mass's centre, so the dome normal tilts out
    return cen.map((x) => x * depth);
  });
  const items = [];
  for (let i = 0; i < n; i++) {
    const w = open[i];
    if (w <= 0) continue;
    // the clear: a clearing file's remaining cloud draws in teal while it thins away (an event only, F5)
    const k = foot.owner[i];
    const front = k >= 0 && state.active.get(planet.files[k].id)?.kind === 1;
    const h = (tag) => hash01(`${v.id}|${tag}|${planet.seed ?? 0}|${i}`);
    const jit = (tag) => (h(tag) - 0.5) * 0.09;
    const dir = [c[3 * i] + jit('x'), c[3 * i + 1] + jit('y'), c[3 * i + 2] + jit('z')];
    const anchor = anchors[mass[i]];
    const size = v.size * (0.85 + h('s') * 0.3) * (0.4 + 0.6 * w); // a thinning front shrinks the puffs before they go
    items.push({ dir, size, lift: v.lift * (0.7 + 0.3 * w), flat: v.flat, stretch: v.stretch, float: v.float, anchor, front });
    // satellites: lumpy edges and fill between neighbouring cells
    const sats = 2 + Math.floor(h('n') * 2);
    for (let q = 0; q < sats; q++) {
      const ang = h(`a${q}`) * Math.PI * 2, off = 0.11 + h(`o${q}`) * 0.06;
      const [dx, dy, dz] = [c[3 * i], c[3 * i + 1], c[3 * i + 2]];
      const el = Math.hypot(dz, dx) || 1;
      const [ex, ez] = [dz / el, -dx / el]; // east: y x d, as the weather's tangent frame
      const north = [dy * ez, dz * ex - dx * ez, -dy * ex]; // north: d x east
      const e = Math.cos(ang) * 1.4 * v.stretch * off, nn = Math.sin(ang) * 0.7 * off;
      const d2 = [dx + ex * e + north[0] * nn, dy + north[1] * nn, dz + ez * e + north[2] * nn];
      items.push({ dir: d2, size: size * (0.5 + h(`z${q}`) * 0.25), lift: v.lift * 0.5, flat: v.flat, stretch: v.stretch, float: v.float, anchor, front });
    }
  }
  return { ramp: v.ramp, items, cover: covered / n };
}
