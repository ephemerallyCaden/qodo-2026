// Drones (agent sessions) in the library: how a drone item maps onto the drone lab's own cell,
// so the library drives the lab's drone exactly as the lab's renderTile does (R7 for drones: the
// same provider, session, time and view give the same pixels; test/drones.test.mjs compares).
// The drone lab (../drone-lab/) is imported read-only: brands, variants, parameters and palettes
// here (pure), its drone mesh in engine.js. Pure: no DOM, no three.js.
import { BRANDS, BRAND_BY_ID, sessionLook } from '../drone-lab/brands.js';
import { VARIANTS } from '../drone-lab/variants.js';
import { DEFAULTS, PARAMS } from '../drone-lab/params.js';
import { PALETTES } from '../drone-lab/palette.js';

export { BRANDS, PARAMS };
export const DRONE_PROVIDERS = BRANDS.map((b) => b.id); // the 10 distinct drones and "unknown agent" (generic's twin)
export const DRONE_VARIANTS = VARIANTS.map((v) => v.id); // the explorations A-E (D was picked: D-final is the generic)
export const DRONE_FACES = ['idle', 'working', 'motion'];
export const DRONE_VIEWS = [['front', 0], ['3/4', -0.75], ['side', -Math.PI / 2], ['back', Math.PI]]; // the lab's views
export const brandName = (id) => BRAND_BY_ID[id]?.name ?? id;
export const variantOf = (id) => VARIANTS.find((v) => v.id === id) ?? null;

// The lab's framing (lab.js renderTile, which can't be imported: it builds its own renderer).
// test/drones.test.mjs checks these against lab.js's source.
export const LAB = {
  frameH: 180, // tiles keep the 180p pixel density
  fov: 35,
  cam: [0, 0.43, 2.7], // the camera's offset from the drone, divided by the zoom
  low: 0.07, // the frame sits this much below the drone's middle, to leave room for the smoke
  hover: 0.52, // DRONE_HOVER: a drone's head centre above the crew's floor (the crew shot)
};
export const ZOOM = { drone: 1, 'drone-close': 2, 'thumb-drone': 2, 'thumb-drone-close': 2 }; // framing -> the lab's zoom (thumbnails: the close-up)

// The working face, as the lab's working-face sheet shows it: the 12 s behaviour loop inside its
// work plateau (5.8-10.2 s), with the drift, bank, look-around and bob held still.
const WORK = { from: 6, span: 4, hold: { drift: 0, bank: 0, lookYaw: 0, bobAmp: 0 } };

/** A drone item's parameters and palette, as the lab's resolveCell gives them for droneCell(it). */
export function droneLook(it) {
  const params = { ...(it.params ?? {}), ...(it.face === 'working' ? WORK.hold : {}) };
  const v = it.variant && variantOf(it.variant);
  if (v) return { params: { ...DEFAULTS, ...v.params, ...params }, palette: PALETTES.base };
  const look = sessionLook(it.provider, it.session ?? null);
  return { params: { ...DEFAULTS, ...look.params, ...params }, palette: look.palette };
}

const pmod = (x, m) => ((x % m) + m) % m;

/**
 * The lab cell for a drone item at library time t: { brand | variant, seed, params, t, yaw,
 * motion, blink, smoke } (the lab's resolveCell and renderTile read these). blink null: the
 * drone blinks on its own; 1: eyes held open. The item's phase offsets its time.
 */
export function droneCell(it, t) {
  const tt = t + (it.phase ?? 0);
  const working = it.face === 'working';
  return {
    ...(it.variant ? { variant: it.variant } : { brand: it.provider, seed: it.session ?? null }),
    params: { ...(it.params ?? {}), ...(working ? WORK.hold : {}) },
    t: working ? WORK.from + pmod(tt, WORK.span) : tt,
    yaw: it.yaw, motion: it.face !== 'idle', blink: it.blink ? null : 1, smoke: it.smoke,
  };
}

/** One pixel's world size per unit of depth at internal height h (the lab: 180p, divided by its zoom). */
export const pixK = (h, zoom = 1) => (2 * Math.tan(((LAB.fov / 2) * Math.PI) / 180)) / h / zoom;

/** The lab's camera for a drone whose extents (drone.js extents()) are { top, bottom }, at a zoom. */
export function droneCamera({ top, bottom }, zoom = 1) {
  const cy = (top + bottom) / 2 - LAB.low;
  return { pos: [LAB.cam[0] / zoom, LAB.cam[1] / zoom + cy, LAB.cam[2] / zoom], target: [0, cy, 0] };
}
