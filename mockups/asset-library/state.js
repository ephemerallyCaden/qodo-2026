// Library state: one plain object describes everything on screen (the asset or the composed
// scene, the render settings, the camera and the palette edits), so it can round-trip through
// the URL and a JSON block. normalise() is the one boundary for untrusted input (a pasted JSON
// block or a hand-edited URL): every field is type-checked, clamped to its control's range or
// replaced by its default. Pure module: no DOM, no three.js, so the tests run it in Node.
//
// The enums mirror the asset viewer's exports (BIOMES, LAVA_MODES, DEPTH_MODES, DEPTH_BANDS,
// RING_PRESETS, EYE_DESIGNS); test/fidelity.test.mjs checks they still match.
import { FAMILY_IDS, family as historyFamily } from './history.js';
import { TRIALS } from './trials.js';
import { DRONE_PROVIDERS, DRONE_VARIANTS, DRONE_FACES, PARAMS as DRONE_PARAMS } from './drones.js';
import { DEBRIS_DEFAULTS, MAX_DEBRIS, AGE_MIXES, CLASSES as DEBRIS_CLASSES, DEBRIS_DIRECTIONS, itemsOf } from './debris-spec.js';

export const VERSION = 1;
export const BIOME_KEYS = ['lush', 'ocean', 'ice', 'desert', 'lava', 'gas', 'moon', 'toxic'];
export const LAVA_MODES = ['layered', 'static-painted', 'full-warp'];
export const DEPTH_MODES = ['object', 'pixel-stepped', 'pixel-smooth', 'levels'];
export const DEPTH_BANDS = ['3-band', '6-band', '8-band'];
export const RING_MODES = ['off', 'thin', 'wide'];
export const RING_PRESETS = { thin: { inner: 1.69, width: 0.22 }, wide: { inner: 1.54, width: 0.72 } };
export const EYE_COUNT = 10;
export const CONTRIBUTOR_PRESETS = ['coral', 'mint', 'lilac'];
export const LAB_VARIANTS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
// Inspector foci for a planet item: which control group leads and what the stage isolates.
export const FOCI = ['planet', 'moon', 'ring', 'clouds', 'fx', 'debris'];
// Camera framings. Planet ones are the viewer's VIEWS; astronaut ones are offsets around the figure.
export const FRAMINGS = { planet: ['planet', 'clouds-zoom', 'top'], astronaut: ['body', 'crew', 'face'], lab: ['lab'], drone: ['drone', 'drone-close'], scene: ['depth', 'crew', 'system'] };
export const MAX_ITEMS = 16;
export const MODES = ['asset', 'scene', 'history'];

// The viewer's moon orbits (MOON_ORBITS in viewer.js), the default for every planet item.
export const MOON_DEFAULTS = [
  { size: 0.11, orbit: 1.75, incl: 0.34, yaw: 0.25, offset: 0.15 },
  { size: 0.062, orbit: 1.36, incl: 0.5, yaw: -0.4, offset: 0.62 },
];

export const PLANET_DEFAULTS = {
  kind: 'planet', biome: 'lush', seed: 7, size: 1,
  ring: 'thin', ringWidth: 0.22, ringInner: 1.69,
  cover: null, float: null, cloudShadow: true, // cover/float null = the biome's WEATHER values
  moons: true, moonOrbits: MOON_DEFAULTS, halo: false,
  artefacts: false, artAuto: true, artCount: 3, artTeal: false, lavaMode: 'layered',
  trial: null, // a trial look (trials.js) for this biome, or null: the shipped look
  debris: DEBRIS_DEFAULTS, // space debris (debris-spec.js): stale items near the planet
  layers: { surface: true, haze: true, clouds: true, ring: true }, // the library's isolation toggles
  pos: [0, 0, 0],
};
export const ASTRONAUT_DEFAULTS = {
  kind: 'astronaut', color: 'coral', eyeGlow: null, handle: '@caden', eyes: 'auto',
  phase: 0, yaw: 0, blink: true, pos: [0, 0, 0],
};
export const LAB_DEFAULTS = { kind: 'lab', variant: 'A', color: 'mint', eyes: 0, yaw: -0.75, sway: true };
// A drone (an agent session, the drone lab's): a provider's drone (session: its seeded details, null
// for the provider's own look) or an exploration variant A-E; the face idle, working or the full
// 12 s behaviour loop; params: drone-lab parameter overrides (the advanced sliders).
export const DRONE_DEFAULTS = { kind: 'drone', provider: 'generic', variant: null, session: null, face: 'idle', yaw: -0.5, blink: true, smoke: true, phase: 0, params: {}, pos: [0, 0, 0] };
export const RENDER_DEFAULTS = {
  pixelH: 180, t: 3, play: false, spin: true, lavaTime: null,
  depth: true, depthMode: 'pixel-smooth', depthBands: '3-band',
  period: 24, surfaceTurns: 2, cloudTurns: 3,
};

// ---------------------------------------------------------------- validation helpers
export const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v, lo, hi, def) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
const int = (v, lo, hi, def) => { const n = num(v, lo, hi, null); return n === null ? def : Math.round(n); };
const bool = (v, def) => (typeof v === 'boolean' ? v : def);
const oneOf = (v, list, def) => (list.includes(v) ? v : def);
const numOrNull = (v, lo, hi, def) => (v === null ? null : num(v, lo, hi, def));
export const HEX = /^#[0-9a-f]{6}$/;
export const hexOrNull = (v) => (typeof v === 'string' && HEX.test(v.toLowerCase()) ? v.toLowerCase() : null);
const vec3 = (v, lim, def) => (Array.isArray(v) && v.length === 3 ? v.map((x, i) => num(x, -lim, lim, def[i])) : [...def]);
const camera = (v) => (isObj(v) && Array.isArray(v.pos) && Array.isArray(v.target) ? { pos: vec3(v.pos, 200, [0, 0, 10]), target: vec3(v.target, 200, [0, 0, 0]) } : null);

const DEBRIS_ID = /^[\w-]{1,40}$/;
/** A planet's debris: on/off, the demo count and age mix, a seed (null: the planet's), edited items, sweeps and a selected piece. */
export function normaliseDebris(raw) {
  const r = isObj(raw) ? raw : {};
  const d = DEBRIS_DEFAULTS;
  const seen = new Set();
  const items = Array.isArray(r.items) ? r.items.slice(0, MAX_DEBRIS).filter((it) => isObj(it) && DEBRIS_ID.test(it.id) && !seen.has(it.id) && seen.add(it.id)).map((it) => ({
    id: it.id, cls: oneOf(it.cls, DEBRIS_CLASSES, DEBRIS_CLASSES[0]), diff: int(it.diff, 1, 100000, 240), age: int(it.age, 0, 3650, 21),
  })) : null;
  const out = { on: bool(r.on, d.on), count: int(r.count, 0, MAX_DEBRIS, d.count), mix: oneOf(r.mix, AGE_MIXES, d.mix), seed: r.seed === null || r.seed === undefined ? null : int(r.seed, 1, 9999, null), items };
  const ids = new Set(itemsOf(out).map((it) => it.id));
  const swept = new Set();
  out.sweeps = (Array.isArray(r.sweeps) ? r.sweeps : []).filter((x) => isObj(x) && ids.has(x.id) && !swept.has(x.id) && swept.add(x.id)).map((x) => ({ id: x.id, at: num(x.at, 0, 3600, 0) }));
  out.selected = ids.has(r.selected) ? r.selected : null;
  out.direction = oneOf(r.direction, DEBRIS_DIRECTIONS, d.direction); // the debris lab's directions (the history's explorations)
  return out;
}

export function normalisePlanet(raw) {
  const r = isObj(raw) ? raw : {};
  const d = PLANET_DEFAULTS;
  const orbits = Array.isArray(r.moonOrbits) && r.moonOrbits.length === 2 ? r.moonOrbits : d.moonOrbits;
  const layers = isObj(r.layers) ? r.layers : {};
  return {
    kind: 'planet',
    biome: oneOf(r.biome, BIOME_KEYS, d.biome),
    seed: int(r.seed, 1, 9999, d.seed),
    size: num(r.size, 0.25, 2.2, d.size),
    ring: oneOf(r.ring, RING_MODES, d.ring),
    ringWidth: num(r.ringWidth, 0.03, 1.0, d.ringWidth),
    ringInner: num(r.ringInner, 1.2, 2.8, d.ringInner),
    cover: numOrNull(r.cover, 0, 0.45, d.cover),
    float: numOrNull(r.float, 0, 0.2, d.float),
    cloudShadow: bool(r.cloudShadow, d.cloudShadow),
    moons: bool(r.moons, d.moons),
    moonOrbits: orbits.map((m, i) => {
      const o = isObj(m) ? m : {}, md = MOON_DEFAULTS[i];
      return { size: num(o.size, 0.02, 0.4, md.size), orbit: num(o.orbit, 1.1, 4, md.orbit), incl: num(o.incl, -1.5, 1.5, md.incl), yaw: num(o.yaw, -3.2, 3.2, md.yaw), offset: num(o.offset, 0, 1, md.offset) };
    }),
    halo: bool(r.halo, d.halo),
    artefacts: bool(r.artefacts, d.artefacts),
    artAuto: bool(r.artAuto, d.artAuto),
    artCount: int(r.artCount, 1, 5, d.artCount),
    artTeal: bool(r.artTeal, d.artTeal),
    lavaMode: oneOf(r.lavaMode, LAVA_MODES, d.lavaMode),
    trial: TRIALS[r.trial]?.biome === oneOf(r.biome, BIOME_KEYS, d.biome) ? r.trial : null,
    debris: normaliseDebris(r.debris),
    layers: Object.fromEntries(Object.entries(d.layers).map(([k, v]) => [k, bool(layers[k], v)])),
    pos: vec3(r.pos, 60, d.pos),
  };
}

export function normaliseAstronaut(raw) {
  const r = isObj(raw) ? raw : {};
  const d = ASTRONAUT_DEFAULTS;
  const color = CONTRIBUTOR_PRESETS.includes(r.color) ? r.color : hexOrNull(r.color) ?? d.color;
  const handle = typeof r.handle === 'string' ? r.handle.slice(0, 40) : d.handle;
  return {
    kind: 'astronaut', color, eyeGlow: hexOrNull(r.eyeGlow), handle,
    eyes: r.eyes === 'auto' ? 'auto' : int(r.eyes, 0, EYE_COUNT - 1, d.eyes),
    phase: num(r.phase, 0, 24, d.phase), yaw: num(r.yaw, -3.2, 3.2, d.yaw), blink: bool(r.blink, d.blink),
    pos: vec3(r.pos, 60, d.pos),
  };
}

export function normaliseLab(raw) {
  const r = isObj(raw) ? raw : {};
  const d = LAB_DEFAULTS;
  return {
    kind: 'lab', variant: oneOf(r.variant, LAB_VARIANTS, d.variant), color: oneOf(r.color, CONTRIBUTOR_PRESETS, d.color),
    eyes: int(r.eyes, 0, EYE_COUNT - 1, d.eyes), yaw: num(r.yaw, -3.2, 3.2, d.yaw), sway: bool(r.sway, d.sway),
  };
}

const DRONE_PARAM = Object.fromEntries(DRONE_PARAMS.map((p) => [p.key, p]));
/** Drone-lab parameter overrides: known keys only, each clamped to its range (a select: a whole option index). */
function droneParams(raw) {
  if (!isObj(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw).slice(0, 200)) {
    const p = DRONE_PARAM[k];
    if (!p) continue;
    const x = p.type === 'select' ? int(v, 0, p.options.length - 1, null) : num(v, p.min, p.max, null);
    if (x !== null) out[k] = x;
  }
  return out;
}
export function normaliseDrone(raw) {
  const r = isObj(raw) ? raw : {};
  const d = DRONE_DEFAULTS;
  return {
    kind: 'drone', provider: oneOf(r.provider, DRONE_PROVIDERS, d.provider), variant: oneOf(r.variant, DRONE_VARIANTS, null),
    session: r.session === null || r.session === undefined ? null : int(r.session, 0, 999, null),
    face: oneOf(r.face, DRONE_FACES, d.face), yaw: num(r.yaw, -3.2, 3.2, d.yaw), blink: bool(r.blink, d.blink), smoke: bool(r.smoke, d.smoke),
    phase: num(r.phase, 0, 24, d.phase), params: droneParams(r.params), pos: vec3(r.pos, 60, d.pos),
  };
}

export const normaliseItem = (raw, kinds = ['planet', 'astronaut', 'lab', 'drone']) => {
  const kind = oneOf(raw?.kind, kinds, null);
  return kind === 'astronaut' ? normaliseAstronaut(raw) : kind === 'lab' ? normaliseLab(raw) : kind === 'drone' ? normaliseDrone(raw) : normalisePlanet(raw);
};

export function normaliseRender(raw) {
  const r = isObj(raw) ? raw : {};
  const d = RENDER_DEFAULTS;
  return {
    pixelH: int(r.pixelH, 120, 480, d.pixelH), t: num(r.t, 0, 3600, d.t), play: bool(r.play, d.play), spin: bool(r.spin, d.spin),
    lavaTime: numOrNull(r.lavaTime, 0, 3600, d.lavaTime),
    depth: bool(r.depth, d.depth), depthMode: oneOf(r.depthMode, DEPTH_MODES, d.depthMode), depthBands: oneOf(r.depthBands, DEPTH_BANDS, d.depthBands),
    period: num(r.period, 1, 60, d.period), surfaceTurns: int(r.surfaceTurns, 1, 6, d.surfaceTurns), cloudTurns: int(r.cloudTurns, 0, 8, d.cloudTurns),
  };
}

// Palette edits: { 'land.2': '#rrggbb', 'depth.1.0': ..., 'haze.ocean': ... }. The path's shape is
// checked here; whether it names a real colour of the base palette is checked by palette.js.
export const PALETTE_PATH = /^[a-zA-Z]+(\.[a-zA-Z0-9]+){0,2}$/;
export function normalisePalette(raw) {
  if (!isObj(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw).slice(0, 400)) {
    const hex = hexOrNull(v);
    if (PALETTE_PATH.test(k) && hex) out[k] = hex;
  }
  return out;
}

// The iteration view (R10): which family and step is on the stage, which of its options, which
// step sits beside it for comparison (-1: none), and the orbit camera (null: the step's own).
export function normaliseHistory(raw) {
  const r = isObj(raw) ? raw : {};
  const id = oneOf(r.family, FAMILY_IDS, FAMILY_IDS[0]);
  const steps = historyFamily(id).steps;
  const step = int(r.step, 0, steps.length - 1, steps.length - 1);
  const options = steps[step].live?.options?.list.length ?? 1;
  const compare = int(r.compare, -1, steps.length - 1, -1);
  return { family: id, step, option: int(r.option, 0, options - 1, 0), compare: compare === step ? -1 : compare, camera: camera(r.camera) };
}

const framingFor = (kind) => FRAMINGS[kind] ?? FRAMINGS.planet;
export function normalise(raw) {
  const r = isObj(raw) ? raw : {};
  const asset = normaliseItem(r.asset);
  const s = isObj(r.scene) ? r.scene : {};
  // (a trial look renders alone, in the inspector: a scene has one palette for every item)
  const items = (Array.isArray(s.items) ? s.items : []).slice(0, MAX_ITEMS).map((it) => normaliseItem(it, ['planet', 'astronaut', 'drone'])).map((it) => (it.kind === 'planet' ? { ...it, trial: null } : it));
  return {
    v: VERSION,
    mode: oneOf(r.mode, MODES, 'asset'),
    focus: asset.kind === 'planet' ? oneOf(r.focus, FOCI, 'planet') : asset.kind,
    framing: oneOf(r.framing, framingFor(asset.kind), framingFor(asset.kind)[0]),
    camera: camera(r.camera),
    asset,
    scene: { items, selected: int(s.selected, -1, items.length - 1, -1), framing: oneOf(s.framing, FRAMINGS.scene, 'depth'), camera: camera(s.camera) },
    render: normaliseRender(r.render),
    palette: normalisePalette(r.palette),
    history: normaliseHistory(r.history),
    // the inspector's current | trial comparison, for a planet whose biome has a trial look
    trialCompare: bool(r.trialCompare, false) && asset.kind === 'planet' && Object.values(TRIALS).some((t) => t.biome === asset.biome),
  };
}

/** The default state: a lush planet in the inspector, paused at t = 3 (every field from its normaliser). */
export const defaultState = () => normalise({});

// ---------------------------------------------------------------- URL + JSON
// The URL hash is the state as base64url(JSON); copy JSON is the same object, pretty-printed.
const toB64 = (str) => btoa(String.fromCharCode(...new TextEncoder().encode(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

export const encodeHash = (state) => `#s=${toB64(JSON.stringify(normalise(state)))}`;
/** The state in a URL hash, or null if there is none or it doesn't parse. */
export function decodeHash(hash) {
  const m = /^#s=([A-Za-z0-9_-]+)$/.exec(hash ?? '');
  if (!m) return null;
  try {
    return normalise(JSON.parse(fromB64(m[1])));
  } catch {
    return null;
  }
}
export const toJSON = (state) => JSON.stringify(normalise(state), null, 2);
/** Parses a pasted JSON block; throws a short message when it isn't JSON. */
export function fromJSON(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('not valid JSON');
  }
  if (!isObj(raw)) throw new Error('expected a JSON object');
  return normalise(raw);
}
