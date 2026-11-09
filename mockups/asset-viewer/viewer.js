// Codebase Space Explorer: batch 1 asset viewer.
// Every asset is a live three.js mesh with flat, banded toon shading. The scene
// is rendered at a low internal resolution and upscaled by an integer factor
// with nearest-neighbour, so pixels stay crisp. There's no dithering and no outline.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EYE_DESIGNS, EYES_GLSL, eyesFor } from './faces.js';
import { LOSPEC, LOSPEC_ORDER, SPARES } from './palettes.js';
import { mapPalette, snapToPool } from './palette-map.js';
import { V2_PLANET_RAMPS, ACCENTS } from './planet-ramps.js';
import { tangentFrame } from './cloud-frame.js';
import { voronoiCells, poolField, crackMask, crackShare } from './snoise.js';
import { ASTRO_SDF_GLSL, BMIN as ASTRO_BMIN, BMAX as ASTRO_BMAX, SCALE as ASTRO_SCALE, LIFT as ASTRO_LIFT, layout as astroLayout, pose as astroPose } from './astronaut.js';
import { ARTEFACTS_GLSL, MAX_ART, ART_TICKS, artefactSectors, artefactCount } from './artefacts.js';

THREE.ColorManagement.enabled = false; // palette hexes go to the screen untouched

// Library mode: ../asset-library sets window.ASSET_VIEWER_LIBRARY = true before this module loads.
// The viewer then builds no showcase scene, binds no UI and starts no loop; the library drives the
// shared renderer, camera and factories (exported below), so its assets are these exact meshes and shaders.
const LIBRARY = globalThis.ASSET_VIEWER_LIBRARY === true;

// ---------------------------------------------------------------- palette
// Ramps run dark -> light. Each depth entry is [tint, amount]. Level 0 is near, 1 is mid (about -35% value),
// 2 is far (about -70%), and 3 is a dark silhouette that keeps a faint hint of colour.
// On near-black space the silhouette tint sits a little above the background so it still reads.
export const PALETTES = {};
// Published palettes, mapped onto our roles using only their own colours.
for (const slug of [...LOSPEC_ORDER, ...SPARES]) PALETTES[`lospec:${slug}`] = mapPalette(slug);
// "final" (the human's call): astronauts BLK 36 exactly (tile 19); space, stars and depth
// from v2; planets, clouds, caps, haze and rings from V2_PLANET_RAMPS.
{
  const blk = PALETTES['lospec:blk-36'];
  const CREW = ['suit', 'gear', 'visor', 'glint', 'contributors'];
  PALETTES.final = {
    space: '#0d0b16',
    stars: ['#3b3866', '#9a90e0', '#fff8ff'],
    depth: [['#1b1f4a', 0], ['#1b1f4a', 0.38], ['#1b1f4a', 0.72], ['#17172f', 0.88]],
    ...V2_PLANET_RAMPS,
    ...Object.fromEntries(CREW.map((k) => [k, blk[k]])),
    name: 'final (BLK 36 crew + v2 world)',
  };
}
// Every palette keeps a flat background.
for (const pal of Object.values(PALETTES)) {
  pal.spaceBands ??= [pal.space, pal.space, pal.space];
  // Roles added in revision 5 get stand-ins from each palette's own ramps.
  pal.moonBody ??= pal.moon.slice(1, 5);
  pal.halo ??= pal.stars[0];
}
export const CONTRIBUTOR_KEYS = ['coral', 'mint', 'lilac'];
const HANDLES = { coral: '@caden', mint: '@mira', lilac: '@juno' }; // faces are hashed from these
let paletteName = 'final';
// Ramp keys are paths into the active palette, e.g. 'ocean' or 'contributors.mint'.
// A missing sub-key falls back to its parent (e.g. 'ring.lush' -> 'ring' on palettes
// that have one ring ramp for every biome). A '#rrggbb' key is that colour itself.
export const resolve = (key) => {
  if (key.startsWith('#')) return key;
  const v = key.split('.').reduce((o, k) => o?.[k], PALETTES[paletteName]);
  return v !== undefined || !key.includes('.') ? v : resolve(key.split('.').slice(0, -1).join('.'));
};
/** Makes `name` (a PALETTES key) the active palette; true if the caller must retint. edited: its
 *  colours changed in place (the asset library's palette editor), so drop the cached depth fades. */
export function usePalette(name, { edited = false } = {}) {
  if (edited) depthCache.clear();
  if (name === paletteName && !edited) return false;
  paletteName = name;
  return true;
}
/** Makes every palette material under root re-resolve its ramps on its next setDepthLevel. */
export const retint = (root) => root.traverse((o) => { if (o.userData.depthLevel !== undefined) o.userData.depthLevel = -1; });

const DEPTH_RANGES = [12, 26, 44]; // camera distances at which an object (or, per pixel, a fragment) drops a level
const depthCache = new Map();

// Depth mode. 'object' (the original): each whole object picks a level from its distance
// and its ramps are swapped for pre-faded colours on the CPU. 'pixel-stepped' (default):
// each fragment picks the level from its OWN camera distance, using the same thresholds,
// tints and strengths (palette.depth), so an object straddling a threshold shows a crisp
// pixel edge between levels. 'pixel-smooth': a continuous per-pixel lerp through the same
// strengths, for comparison only. 'levels': debug view, every fragment in its level colour.
export const DEPTH_MODES = ['object', 'pixel-stepped', 'pixel-smooth', 'levels'];
// Band presets for the per-pixel modes (one data place). '3-band' is the original: levels
// start at DEPTH_RANGES with the palette's 4 depth steps. The N-band presets put N levels on
// geometric thresholds from `near` to `far` (thin bands near the camera, wider far away), and
// interpolate the palette's 4 steps, so the overall near -> far strength range is the same
// with smaller steps. pixel-smooth grades continuously (log distance) from SMOOTH.near to
// SMOOTH.far through the same strengths. The object mode always uses the original 4 levels.
export const DEPTH_BANDS = {
  '3-band': { from: DEPTH_RANGES },
  '6-band': { levels: 6, near: 6, far: 44 },
  '8-band': { levels: 8, near: 6, far: 44 },
};
const SMOOTH = { near: 5, far: 44 };
const MAX_LEVELS = 8;
const bandThresholds = (b) => b.from ?? Array.from({ length: b.levels - 1 }, (_, i) => b.near * (b.far / b.near) ** (i / (b.levels - 2)));
// Shared by every fading material: mode, level count, thresholds, smooth range, and per family
// (0 planet, 1 crew) the tint (rgb) and strength (a) of each level. Filled in applyState.
const DEPTH_U = {
  uDepthMode: { value: 1 },
  uDepthLevels: { value: 4 },
  uDepthFrom: { value: Array.from({ length: MAX_LEVELS - 1 }, (_, i) => DEPTH_RANGES[i] ?? 1e9) },
  uDepthSmooth: { value: new THREE.Vector2(SMOOTH.near, SMOOTH.far) },
  uDepthTint: { value: Array.from({ length: MAX_LEVELS * 2 }, () => new THREE.Vector4()) },
};
// depthFade(colour, world position, k): k scales the strength (emissive lava glow fades at
// half strength so a far lava world still glows). uDepthFamily is set per material.
const DEPTH_GLSL = /* glsl */ `
  uniform int uDepthMode;
  uniform int uDepthFamily;
  uniform int uDepthLevels;
  uniform float uDepthFrom[${MAX_LEVELS - 1}];
  uniform vec2 uDepthSmooth;
  uniform vec4 uDepthTint[${MAX_LEVELS * 2}];
  vec3 depthFade(vec3 c, vec3 posW, float k) {
    if (uDepthMode == 0) return c; // object mode: the ramps are already faded on the CPU
    float d = distance(posW, cameraPosition);
    int f = uDepthFamily * ${MAX_LEVELS};
    int l = 0;
    for (int i = 0; i < ${MAX_LEVELS - 1}; i++) if (i < uDepthLevels - 1 && d >= uDepthFrom[i]) l = i + 1;
    if (uDepthMode == 3) { // debug: one colour per level
      const vec3 IDS[8] = vec3[8](vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 1), vec3(1, 1, 0), vec3(0, 1, 1), vec3(1, 0, 1), vec3(1, 0.5, 0), vec3(1));
      return IDS[l];
    }
    vec4 tint = uDepthTint[f + l];
    if (uDepthMode == 2) { // smooth: log distance from uDepthSmooth.x to .y, through every level's tint
      float x = clamp(log(max(d, 1e-3) / uDepthSmooth.x) / log(uDepthSmooth.y / uDepthSmooth.x), 0.0, 1.0) * float(uDepthLevels - 1);
      int i = int(min(floor(x), float(uDepthLevels - 2)));
      tint = mix(uDepthTint[f + i], uDepthTint[f + i + 1], x - float(i));
    }
    return mix(c, tint.rgb, tint.a * k);
  }
`;
const depthUniforms = (family = 0) => ({ ...DEPTH_U, uDepthFamily: { value: family } });
function depthColor(hex, level) {
  const key = `${paletteName}:${hex}:${level}`;
  if (!depthCache.has(key)) {
    const pal = PALETTES[paletteName];
    const [tint, t] = pal.depth[level];
    const c = new THREE.Color(hex).lerp(new THREE.Color(tint), t);
    // Published palettes snap each depth step back onto their own (darker) colours.
    depthCache.set(key, pal.snap?.[level] ? new THREE.Color(snapToPool(c, pal.snap[level])) : c);
  }
  return depthCache.get(key);
}

const LIGHT_DIR = new THREE.Vector3(-0.3, 0.55, 0.78).normalize(); // top-left key ~40° off the view: concentric crescents

// ---------------------------------------------------------------- GLSL
// 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT). Value noise left grid creases.
const NOISE = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
  float fbm(vec3 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * snoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return s / 0.9375 * 0.5 + 0.5;
  }
`;

// Light bands: 0 night, 1 terminator, 2 lit, 3 full light.
const BANDS = /* glsl */ `
  uniform vec3 uLight;
  uniform vec3 uBands;
  int band(vec3 n) {
    float d = dot(n, uLight);
    return d > uBands.z ? 3 : d > uBands.y ? 2 : d > uBands.x ? 1 : 0;
  }
`;

const VERT = /* glsl */ `
  out vec3 vNormalW;
  out vec3 vPosW;
  out vec3 vLocal;
  void main() {
    #ifdef USE_INSTANCING
      mat4 m = modelMatrix * instanceMatrix;
    #else
      mat4 m = modelMatrix;
    #endif
    vLocal = position;
    vNormalW = normalize(transpose(inverse(mat3(m))) * normal); // correct for squashed cloud puffs
    vec4 wp = m * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const TOON_FRAG = /* glsl */ `
  ${BANDS}
  ${DEPTH_GLSL}
  uniform vec3 uRamp[4];
  in vec3 vNormalW;
  in vec3 vPosW;
  void main() { gl_FragColor = vec4(depthFade(uRamp[band(normalize(vNormalW))], vPosW, 1.0), 1.0); }
`;

// Clouds: each puff's normal is blended with two smooth fields, so the puffs of a mass
// shade as ONE lumpy body instead of a pile of spheres:
//   R  the planet-radial direction (the layer as a whole)
//   M  the mass dome: the direction from the mass's anchor (aMass.xyz, a point below the
//      centre of the puff's connected mass) to this fragment. It is a continuous function
//      of position, so where two puffs of a mass meet their shading agrees and the seam
//      vanishes; the mass reads as one dome lit from the top left.
// The puff normal N keeps a small weight for a lumpy edge. aMass.w = 1 for cloud masses,
// 0 for lava smoke (plain puff + radial blend).
const CLOUD_VERT = /* glsl */ `
  in vec4 aMass;
  out vec3 vNormalW;
  out vec3 vPosW;
  out vec3 vAnchorW;
  out float vMass;
  void main() {
    mat4 m = modelMatrix * instanceMatrix;
    vNormalW = normalize(transpose(inverse(mat3(m))) * normal); // correct for squashed puffs
    vec4 wp = m * vec4(position, 1.0);
    vPosW = wp.xyz;
    vAnchorW = (modelMatrix * vec4(aMass.xyz, 1.0)).xyz;
    vMass = aMass.w;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const CLOUD_FRAG = /* glsl */ `
  ${BANDS}
  ${DEPTH_GLSL}
  uniform vec3 uRamp[4];
  uniform vec3 uCenter;
  in vec3 vNormalW;
  in vec3 vPosW;
  in vec3 vAnchorW;
  in float vMass;
  void main() {
    // Scalar blend of Lambert terms: dot(n, L) is a weighted mean of N.L, R.L and M.L. The
    // vector is left unnormalised (renormalising made shading run against the puff's
    // curvature), and the parts of R and M that oppose the puff surface are dropped, so
    // undersides facing the planet stay shaded and n never points into the puff.
    vec3 g = normalize(vNormalW), r = normalize(vPosW - uCenter), m = normalize(vPosW - vAnchorW);
    float rg = dot(r, g), mg = dot(m, g);
    if (rg < 0.0) r -= rg * g;
    if (mg < 0.0) m -= mg * g;
    vec3 n = mix((g * 0.55 + r * 0.8) / 1.35, (g * 0.1 + r * 0.3 + m * 1.1) / 1.5, vMass);
    gl_FragColor = vec4(uRamp[band(n)], 1.0);
    gl_FragColor.rgb = depthFade(gl_FragColor.rgb, vPosW, 1.0);
  }
`;

// Cell hash, Voronoi cells, the crack mask and the pool field, shared by the planet shader and
// the CPU port (snoise.js voronoiCells / crackMask / poolField) that sets each planet's pool cut
// and places lava ash on the fissures and pool shores.
// pool: which whole plates are open (lava pools, ice water). scale = the cluster field's
// frequency in cells (lower = bigger lakes and seas); share = the open share of the whole
// sphere, held per seed by a quantile (poolCut), like cloud cover.
// Scale (art-direction §6): the crack set and widths are fixed on the planet, so zoom only makes
// the same rock bigger or smaller. Widths are given in px at the hero framing (HERO_PX: a size-1
// planet at distance 7, 180p) and scale with the planet on screen, with a screen floor (FLOOR_PX
// half-width) that only bites when the planet is small on screen. half = the widest crack's
// half-width; a crack ends where its mask-driven width drops below tip (hero px), on every zoom.
// lift: small planets show fewer cracks, as the mask cut rises by up to `max`, keyed to the planet's
// SIZE (LOC, a data value), never its projected size: `max` at size <= from, 0 from size `to`. (The
// old screen-radius ramp, 18 -> 68 px, at the hero framing, so hero planets keep their crack sets.)
const CRACKS = {
  lava: { freq: 3.2, cut: 0.25, half: 1.5, tip: 0.55, pool: { scale: 0.3, share: 0.3 } },
  ice: { freq: 3.8, cut: 0.23, half: 1.2, tip: 0.55, pool: { scale: 0.35, share: 0.27 } },
  lift: { max: 0.35, from: 0.44, to: 1.67 },
  HERO_PX: 40.8, FLOOR_PX: 1.0,
};
const crackLift = (size) => { const { max, from, to } = CRACKS.lift; return max * (1 - THREE.MathUtils.clamp((size - from) / (to - from), 0, 1)); };
// The field cut that opens `share` of the sphere's area (Fibonacci samples through the CPU port).
// off is the offset the shader passes for that biome's plates.
function poolCut({ freq, pool }, off) {
  const N = 3000, vals = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - ((i + 0.5) / N) * 2, r = Math.sqrt(1 - y * y), lon = i * 2.39996;
    const { own } = voronoiCells(Math.cos(lon) * r * freq + off.x, y * freq + off.y, Math.sin(lon) * r * freq + off.z);
    vals.push(poolField(...own, off.x, off.y, off.z, pool.scale));
  }
  return vals.sort((a, b) => b - a)[Math.round(pool.share * N)];
}
// Animated lava (LAVA_MODES, viewer control). 'layered' (default) is two layers: a molten layer,
// the domain-warped FBM over the whole sphere, under solid crust plates with gaps between them.
// A crack is simply a gap between plates (no painted line), so it shows the moving lava, and pools
// and seas are where whole plates are missing; cracks and pools are the same field, so they flow
// into each other. Plate, gap and pool geometry stay static (ash placement and the CPU ports still
// match); only the molten layer moves. 'static-painted' is the 3b6a482 'flow' mode, for A/B: the
// same geometry with orange fissure lines painted on the crust, and only the pool fill churning.
// 'full-warp' paints the whole surface from the warped FBM (classic Quilez look), for comparison.
// The field is loop-locked: its warp inputs ride circles in noise space, `cycles` times per surface turn.
//   freq   base frequency on the unit sphere (top octave ~4x: features stay >= 2-3 px at 180p)
//   warp   warp strength (noise units) of each of the two passes
//   drift  radius of the warp inputs' circles (how far the flow moves per cycle)
//   layer  layered molten bands on the field: below [0] a dark cooling skin (open pools only, away
//          from the shore, so a crack never crusts over), below [1] the cooler rim colour, below [2]
//          orange, above it yellow (accents only)
//   pool   static-painted pool fill cuts on the field: below [0] a dark cooling skin, below [1] the
//          cooler rim colour, below [2] orange, above it yellow (accents only)
//   crack  static-painted: how far the field shifts a fissure pixel's core position (pulses course along)
//   full   full-warp cuts: crust below [0] (its top 0.05 a light step up), rim below [1], orange
//          below [3] ([2] unused), yellow above
// The field's quantiles (debug probe, 4 seeds x 6 phases): 10% 0.337, 30% 0.431, 50% 0.498,
// 70% 0.565, 90% 0.655, 95% 0.690.
export const LAVA_MODES = ['layered', 'static-painted', 'full-warp'];
const LAVA_FLOW = { freq: 1.2, warp: 1.0, drift: 0.5, cycles: 1, layer: [0.337, 0.39, 0.65], pool: [0.337, 0.38, 0.665], crack: 0.9, full: [0.467, 0.513, 0.6, 0.683] }; // cuts ~ field quantiles: layer 10/20/89%, pool 10/17/91%, full 40/55/94%
const WORLEY_GLSL = /* glsl */ `
  vec3 hash33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
  // Integer cell hash (pcg3d), bit-exact on the CPU, unlike the float hash33 (whose large
  // fract() arguments differ by GPU rounding). Cells are offset to stay non-negative.
  uvec3 pcg3d(uvec3 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
    return v;
  }
  vec3 cellHash(vec3 c) { return vec3(pcg3d(uvec3(ivec3(c) + 4096))) * (1.0 / 4294967296.0); }
  // Distance to the nearest Voronoi cell edge (the bisector plane between the nearest feature
  // and each neighbour; Quilez's two-pass method). Exact, so cracks have even width and
  // sharp corners instead of blobs at the junctions. own = the nearest cell, across = the
  // neighbour on the other side of that edge (integer cell coords).
  float voronoiCells(vec3 p, out vec3 own, out vec3 across) {
    vec3 i = floor(p), f = fract(p);
    vec3 r1 = vec3(0.0), c1 = vec3(0.0);
    float d1 = 9.0;
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec3 g = vec3(x, y, z);
      vec3 r = g + cellHash(i + g) - f;
      float dd = dot(r, r);
      if (dd < d1) { d1 = dd; r1 = r; c1 = g; }
    }
    float e = 9.0;
    vec3 ga = c1;
    for (int z = -2; z <= 2; z++) for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
      vec3 g = c1 + vec3(x, y, z);
      vec3 r = g + cellHash(i + g) - f;
      vec3 dr = r - r1;
      if (dot(dr, dr) > 1e-5) {
        float d = dot(0.5 * (r1 + r), normalize(dr));
        if (d < e) { e = d; ga = g; }
      }
    }
    own = i + c1;
    across = i + ga;
    return e;
  }
  float voronoiEdge(vec3 p) { vec3 own, across; return voronoiCells(p, own, across); }
  // Open plates (lava pools, ice water): whole Voronoi cells of the crack network where the crust
  // or ice sheet has broken away. A low-frequency field over the cells clusters them into lakes
  // and seas with straight, jagged shores; a per-cell jitter adds lone pools. cell = integer coords.
  // A plate is open where poolField > the planet's cut (uPoolCut, a quantile set on the CPU).
  float poolField(vec3 cell, vec3 off, float scale) { return snoise((cell + cellHash(cell)) * scale + off.zxy) + (cellHash(cell + 31.0).x - 0.5) * 0.5; } // at the feature point: off-lattice, so CPU and GPU never tie in snoise
  float crackMask(vec3 p, float freq, vec3 off) { return snoise(p * freq * 0.35 + off.yzx) * 0.5 + 0.5; }
  const float LAVA_CRACK_FREQ = ${CRACKS.lava.freq.toFixed(2)}, LAVA_CRACK_CUT = ${CRACKS.lava.cut.toFixed(2)};
  const float ICE_CRACK_FREQ = ${CRACKS.ice.freq.toFixed(2)}, ICE_CRACK_CUT = ${CRACKS.ice.cut.toFixed(2)};
  const float LAVA_POOL_SCALE = ${CRACKS.lava.pool.scale.toFixed(3)}, ICE_POOL_SCALE = ${CRACKS.ice.pool.scale.toFixed(3)};
  const float LAVA_CRACK_HALF = ${CRACKS.lava.half.toFixed(2)}, ICE_CRACK_HALF = ${CRACKS.ice.half.toFixed(2)};
  const float LAVA_CRACK_TIP = ${CRACKS.lava.tip.toFixed(2)}, ICE_CRACK_TIP = ${CRACKS.ice.tip.toFixed(2)};
  const float CRACK_HERO_PX = ${CRACKS.HERO_PX.toFixed(2)}, CRACK_FLOOR_PX = ${CRACKS.FLOOR_PX.toFixed(2)};
`;
// Loop-locked domain-warped FBM (Inigo Quilez, "warp"): f(p + w * r), r = fbm(p + w * q + drift(t)),
// q = fbm(p + drift(t)), with each pass's input riding its own circle (uLavaTime = cos, sin of the
// lava angle), so the molten rock swirls and churns and returns to itself every cycle. 0..1, ~0.5 mean.
const LAVA_GLSL = /* glsl */ `
  uniform int uLavaMode;  // LAVA_MODES index
  uniform vec2 uLavaTime; // cos, sin of the loop-locked lava angle
  float fbmL(vec3 p, int oct) {
    float s = 0.0, a = 0.5, n = 0.0;
    for (int i = 0; i < 3; i++) { if (i >= oct) break; s += a * snoise(p); n += a; p = p * 2.03 + 11.7; a *= 0.5; }
    return s / n * 0.5 + 0.5;
  }
  vec3 fbm3v(vec3 p) { return vec3(snoise(p), snoise(p + vec3(5.2, 1.3, 2.8)), snoise(p + vec3(1.7, 9.2, 4.1))) * 0.5; } // warp vectors: one octave each (compile cost)
  float lavaFlow(vec3 p) {
    const float D = ${LAVA_FLOW.drift.toFixed(3)}, W = ${LAVA_FLOW.warp.toFixed(3)};
    vec3 a = p * ${LAVA_FLOW.freq.toFixed(3)} + uSeedOff.zxy;
    vec3 q = fbm3v(a + vec3(uLavaTime * D, 0.0));
    vec3 r = fbm3v(a + W * q + vec3(8.3, 2.8, 1.1) + vec3(0.0, uLavaTime.yx * D));
    return fbmL(a + W * r, 3);
  }
`;

// Biome surfaces (art-direction: biome = module health). All flat light bands from
// palette ramps; lava fissures are emissive and ignore lighting.
// uA/uB/uC are 5-entry ramps and uG a 3-entry glow ramp, re-keyed per biome (BIOMES).
const PLANET_FRAG = /* glsl */ `
  ${NOISE}
  ${BANDS}
  ${DEPTH_GLSL}
  uniform int uBiome;
  uniform vec3 uA[5];
  uniform vec3 uB[5];
  uniform vec3 uC[5];
  uniform vec3 uG[3];
  uniform vec3 uSeedOff;
  uniform float uSea;
  uniform mat4 modelMatrix;      // three sets these per program; the fragment stage reads them
  uniform mat4 projectionMatrix; // for the planet's screen size (cracks, artefacts)
  uniform vec2 uViewSize;        // drawing-buffer size in px
  uniform float uPoolCut;        // open plates: poolField above this (lava pools, ice water)
  uniform float uCrackLift;      // crack mask-cut lift from the planet's size (crackLift, CPU)
  uniform int uRegions;          // 1 = debug view: ground blue, crack red, open plates green (measurement)
  in vec3 vNormalW;
  in vec3 vLocal;
  in vec3 vPosW;

  ${WORLEY_GLSL}
  ${LAVA_GLSL}
  // Worley F1 distance plus a random id for the nearest cell.
  vec2 worley(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    float d = 9.0, id = 0.0;
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec3 g = vec3(x, y, z);
      vec3 r = g + hash33(i + g) - f;
      float dd = dot(r, r);
      if (dd < d) { d = dd; id = hash33(i + g + 7.7).x; }
    }
    return vec2(sqrt(d), id);
  }
  float ridge(vec3 p) { return 1.0 - abs(snoise(p)); } // 1.0 along a network of thin lines

  // Screen scale, set once per fragment in main() (uniform control flow) and read by surface():
  // gPx = sphere units per screen pixel here, gRadiusPx = the planet's radius in screen px (artefact
  // cells only), gHero = screen px per hero-framing px here (world-space widths, CRACKS.HERO_PX).
  float gPx = 0.01, gRadiusPx = 60.0, gHero = 1.0;
  void setScreenScale(vec3 p) {
    vec3 dx = dFdx(p), dy = dFdy(p);
    gPx = max(1e-5, max(length(dx), length(dy))); // the foreshortened axis: lines never swell at the limb
    float size = length(modelMatrix[0].xyz); // the planet's size (its group scale, ~ LOC)
    vec4 centreV = viewMatrix * modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    gRadiusPx = size * projectionMatrix[1][1] / -centreV.z * uViewSize.y * 0.5;
    gHero = 1.0 / (CRACK_HERO_PX * gPx * size);
  }
  // A width fixed on the planet (heroPx at the hero framing) in screen px here, never under floorPx.
  float worldPx(float heroPx, float floorPx) { return max(heroPx * gHero, floorPx); }
  // Jagged cracks (lava fissures, ice crevasses): Voronoi cell edges, i.e. straight segments
  // meeting at pointed junctions. A mask (crackMask) picks which edges show and how wide, so
  // cracks branch and taper. Both are fixed on the planet (art-direction §6 Scale): which edges
  // show depends only on the mask and the planet's size (uCrackLift: small planets raise the cut,
  // so they show fewer cracks), and the width is world-space (halfPx at the widest, in hero px), so
  // zooming only makes the same rock bigger or smaller. A crack ends where its world width drops
  // below tipPx; where the planet is small on screen the width is floored at CRACK_FLOOR_PX, so far
  // planets get relatively thicker cracks instead of tips breaking into dots. The 1 px lip on
  // plate edges (lava) stays a screen-px outline: it never changes which plates or cracks exist.
  // plates() returns the px distance to the nearest cell edge, and the plates on either side of
  // it; crackHero() the crack's half-width there in hero px (0 where no crack shows), crackPx() the
  // same in screen px here, floored. Inside a crack when dpx < w (screen px); core = dpx / w is how
  // central the pixel is (0 centre .. 1 edge).
  float plates(vec3 p, float freq, vec3 off, out vec3 own, out vec3 across) { return voronoiCells(p * freq + off, own, across) / (freq * gPx); }
  float crackHero(vec3 p, float freq, vec3 off, float cut, float halfPx, float tipPx) {
    float w = halfPx * smoothstep(cut + uCrackLift, cut + uCrackLift + 0.25, crackMask(p, freq, off)); // crackShare (CPU)
    return w < tipPx ? 0.0 : w;
  }
  float crackPx(float hero) { return hero > 0.0 ? worldPx(hero, CRACK_FLOOR_PX) : 0.0; }
  // Region of the last surface() sample, for the regions debug view: 0 ground, 1 crack, 2 open (pool / water).
  int gRegion = 0;
  // The animated lava field at this fragment. lavaFlow() is evaluated once per fragment in main(),
  // not in surface(): surface() is inlined at every artefact resample, and each copy of the warped
  // FBM costs seconds of shader compile in SwiftShader.
  float gLavaV = 0.5;

  // Craters: sparse cells get a dark floor and a bright rim.
  vec3 craters(vec3 p, vec3 c, int b, float scale, float density) {
    vec2 w = worley(p * scale + uSeedOff);
    if (w.y < density) {
      float r = 0.2 + 0.22 * fract(w.y * 13.1);
      if (w.x < r * 0.72) c = uB[max(b - 1, 0)]; // floor a band darker, so craters read even on one-ramp moons
      else if (w.x < r) c = uA[min(b + 1, 4)];
    }
    return c;
  }

  // The surface colour is a function so artefacts can resample it (cell centres, moshed terrain, flipped bands).
  vec3 surface(vec3 p, int b) {
    vec3 c;
    gRegion = 0;
    if (uBiome == 0 || uBiome == 1 || uBiome == 7) {
      // lush / ocean / toxic: sea + land
      float h = fbm(p * 1.6 + uSeedOff) + (fbm(p * 4.1 + uSeedOff.zxy) - 0.5) * 0.22;
      if (h < uSea) c = uA[min(b + (h > uSea - 0.04 ? 1 : 0), 4)];
      else c = uB[min(b + (h > uSea + 0.11 ? 1 : 0), 4)];
      if (uBiome == 7) {
        if (h >= uSea && worley(p * 6.0 + uSeedOff).x < 0.3) c = uC[min(b + 1, 4)]; // fungal blooms
        if (h < uSea && ridge(p * 5.0 + uSeedOff) > 0.965) c = uB[4]; // glowing sludge veins
      } else {
        float lat = abs(p.y) + (fbm(p * 3.0 + uSeedOff) - 0.5) * 0.25;
        if (lat > 0.9) c = uC[b];
      }
    } else if (uBiome == 2) {
      // ice: bright strata and a network of jagged crevasses (deeper blue at the core)
      float h = fbm(p * 2.3 + uSeedOff);
      float strata = sin((p.y * 5.0 + h * 2.4) * 3.14159);
      c = uA[min(b + 1 + (strata > 0.55 ? 1 : 0), 4)];
      vec3 own, across;
      float dpx = plates(p, ICE_CRACK_FREQ, uSeedOff.yzx, own, across);
      if (poolField(own, uSeedOff.yzx, ICE_POOL_SCALE) > uPoolCut) {
        // open dark-blue water between the sheets, with a paler submerged-ice fringe at the shore
        gRegion = 2;
        bool shore = poolField(across, uSeedOff.yzx, ICE_POOL_SCALE) <= uPoolCut && dpx < worldPx(1.5, 1.5);
        c = shore ? uC[min(b, 2)] : uC[max(min(b, 2) - 1, 0)]; // two dark steps; the lit fringe one up
      } else {
        float w = crackPx(crackHero(p, ICE_CRACK_FREQ, uSeedOff.yzx, ICE_CRACK_CUT, ICE_CRACK_HALF, ICE_CRACK_TIP));
        // no crack along a shore: the water's fringe marks that edge (a clipped half-crack is a 1 px sliver)
        if (dpx < w && poolField(across, uSeedOff.yzx, ICE_POOL_SCALE) <= uPoolCut) { gRegion = 1; c = dpx < w * 0.5 ? uB[max(b - 1, 0)] : uB[min(b, 4)]; }
      }
    } else if (uBiome == 3 || uBiome == 6) {
      // desert dunes / barren moon, both cratered
      float h = fbm(p * 2.0 + uSeedOff);
      int shift = h > 0.56 ? 1 : 0;
      if (uBiome == 3) shift = sin((p.y * 9.0 + p.x * 2.5 + h * 4.5) * 3.14159) > 0.3 ? 1 : 0;
      c = uA[min(b + shift, 4)];
      c = craters(p, c, b, 2.4, uBiome == 6 ? 0.55 : 0.3);
      c = craters(p, c, b, 5.2, uBiome == 6 ? 0.45 : 0.2);
    } else if (uBiome == 4) {
      // lava: dark crust plates over a molten layer (layered), or painted fissures (static-painted)
      float h = fbm(p * 2.4 + uSeedOff);
      int crust = min(b, 2) + (h > 0.58 ? 1 : 0);
      c = uA[crust]; // crust stays in the darkest steps
      vec3 own, across;
      float dpx = 9.0, w = 0.0, wHero = 0.0;
      bool pool = false, shore = false, fissure = false;
      if (uLavaMode != 2) {
        dpx = plates(p, LAVA_CRACK_FREQ, uSeedOff, own, across);
        pool = poolField(own, uSeedOff, LAVA_POOL_SCALE) > uPoolCut;
        shore = poolField(across, uSeedOff, LAVA_POOL_SCALE) <= uPoolCut; // the edge here faces solid crust
        // no crack along a shore: the pool itself opens that edge (a clipped half-crack is a 1 px sliver)
        if (!pool) { wHero = crackHero(p, LAVA_CRACK_FREQ, uSeedOff, LAVA_CRACK_CUT, LAVA_CRACK_HALF, LAVA_CRACK_TIP); w = crackPx(wHero); fissure = dpx < w && shore; }
      }
      float v = gLavaV; // the warped field at this fragment (set once in main(); artefact resamples reuse it)
      if (uLavaMode == 0) {
        // layered: a gap between plates (crack) or a missing plate (pool) shows the molten layer,
        // banded rim -> orange -> yellow, with dark cooling skins only out in the open pools
        const vec3 L = vec3(${LAVA_FLOW.layer.map((x) => x.toFixed(3)).join(', ')});
        if (pool || fissure) {
          gRegion = pool ? 2 : 1;
          bool deep = pool && (!shore || dpx > worldPx(2.0, 2.0)); // skins stay > 2 px (hero px, scaling up close) from shore
          c = v < L.x && deep ? uA[crust + 1] : v < L.y ? uG[0] : v < L.z ? uG[1] : uG[2];
        } else if ((w > 0.0 && shore && dpx < w + 1.0) || (!shore && dpx < 1.0)) {
          // the plate's 1 px edge facing a gap or a pool, lit by the lava: the crust's warm top step
          // (one step darker was invisible on the near-black crust), so the plate sits above the lava
          c = uA[4];
        }
      } else if (uLavaMode == 2) {
        // full-warp: the whole surface is the warped field, banded crust -> rim -> orange -> yellow
        const vec4 F = vec4(${LAVA_FLOW.full.map((x) => x.toFixed(3)).join(', ')});
        if (v < F.x) c = uA[min(b, 2) + (v > F.x - 0.05 ? 1 : 0)];
        else { gRegion = 2; c = v < F.y ? uG[0] : v < F.w ? uG[1] : uG[2]; }
      } else if (pool) {
        // static-painted: open molten pool where the crust broke away, a cooler rim at the shore, and
        // the warped field churning the fill (dark cooling skins, cooler swirls, yellow hot cores)
        gRegion = 2;
        const vec3 P = vec3(${LAVA_FLOW.pool.map((x) => x.toFixed(3)).join(', ')});
        c = shore && dpx < 1.5 ? uG[0] : v < P.x ? uA[min(b, 2) + 1] : v < P.y ? uG[0] : v < P.z ? uG[1] : uG[2];
      } else if (fissure) {
        // static-painted: emissive fissures painted on the crust, orange with darker glowing edges and
        // yellow only down the core of the widest; the field slides the core, so pulses course along
        gRegion = 1;
        float k = dpx / w - (v - 0.5) * ${LAVA_FLOW.crack.toFixed(3)};
        c = k < 0.25 && wHero > 1.4 ? uG[2] : k < 0.7 ? uG[1] : uG[0]; // yellow down the widest (world width)
      }
    } else {
      // gas giant: turbulent alternating bands and a storm
      float t = fbm(p * vec3(1.4, 0.45, 1.4) + uSeedOff);
      float lat = p.y * 4.2 + (t - 0.5) * 1.8;
      bool alt = mod(floor(lat), 2.0) < 1.0;
      int shift = fract(lat) > 0.72 ? 1 : 0;
      c = alt ? uA[min(b + shift, 4)] : uB[min(b + shift, 4)];
      vec3 sp = normalize(vec3(0.55, -0.32, 0.77));
      vec3 dp = p - sp;
      if (length(dp * vec3(0.7, 1.6, 0.7)) < 0.16) c = uB[min(b + 2, 4)];
    }
    return c;
  }
  ${ARTEFACTS_GLSL}
  void main() {
    vec3 p = normalize(vLocal);
    setScreenScale(p);
    if (uBiome == 4) gLavaV = lavaFlow(p); // uniform branch: free on other biomes
    int b = band(normalize(vNormalW));
    gl_FragColor = vec4(artefacts(p, b, surface(p, b)), 1.0);
    if (uRegions == 1) { gl_FragColor = vec4(gRegion == 1 ? 1.0 : 0.0, gRegion == 2 ? 1.0 : 0.0, gRegion == 0 ? 1.0 : 0.0, 1.0); return; } // debug: ground / crack / open
    bool glow = uBiome == 4 && (gl_FragColor.rgb == uG[0] || gl_FragColor.rgb == uG[1] || gl_FragColor.rgb == uG[2]);
    gl_FragColor.rgb = depthFade(gl_FragColor.rgb, vPosW, glow ? 0.5 : 1.0); // emissive glow fades at half strength
  }
`;

// Cloud shadow: the cloud puffs projected along the light onto the planet (r = 1.003),
// drawn as the terrain one light band darker. Shares the surface material's uniforms,
// so it is the planet's own colours; the offset from each cloud sells its height.
const SHADOW_VERT = /* glsl */ `
  uniform vec3 uLight;
  uniform vec3 uCenter;
  uniform float uRadius;
  uniform mat4 uToSurface; // world -> surface-local (inverse of the surface's matrixWorld)
  out vec3 vLocal;
  out vec3 vHitW;
  out vec3 vPosW;
  out float vReach;
  void main() {
    vec3 w = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
    vec3 oc = w - uCenter;
    float R = uRadius * 1.003, b = dot(oc, uLight), disc = b * b - (dot(oc, oc) - R * R);
    if (disc < 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; } // the light ray misses the planet: no shadow
    float t = b - sqrt(disc);
    if (t <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; } // both roots behind the cloud (it faces away from the light): no shadow, not its mirror image on the lit side
    vec3 hit = w - uLight * t;
    vHitW = hit - uCenter;
    vPosW = hit;
    vReach = t / uRadius; // how far the shadow falls from its cloud, in planet radii
    vLocal = (uToSurface * vec4(hit, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(hit, 1.0);
  }
`;
const SHADOW_FRAG = PLANET_FRAG.replace(/void main\(\) \{[\s\S]*\}\s*$/, `in vec3 vHitW;
  in float vReach;
  void main() {
    if (vReach < 0.0 || vReach > 0.1) discard; // straddling-triangle residue of culled vertices; near the terminator shadows would smear across the disc
    vec3 p = normalize(vLocal);
    setScreenScale(p);
    int b = band(normalize(vHitW));
    if (b == 0) discard; // the night side is already the darkest step
    gl_FragColor = vec4(depthFade(surface(p, b - 1), vPosW, 1.0), 1.0);
  }
`);

// Atmosphere haze: a slightly larger shell drawn only near the lit limb, so it rims
// the planet and breaks the silhouette without reading as an outline.
const HAZE_FRAG = /* glsl */ `
  ${DEPTH_GLSL}
  uniform vec3 uHaze;
  uniform vec3 uLight;
  in vec3 vNormalW;
  in vec3 vPosW;
  void main() {
    vec3 n = normalize(vNormalW);
    float rim = 1.0 - abs(dot(n, normalize(cameraPosition - vPosW)));
    if (rim < 0.72 || dot(n, uLight) < 0.3) discard; // a thin crescent on the lit limb only
    gl_FragColor = vec4(depthFade(uHaze, vPosW, 1.0), 1.0);
  }
`;

// Single-pixel points (ring dust, stars). Ring points darken in the planet's shadow.
const POINTS_VERT = /* glsl */ `
  in float aShade;
  in float aSize;
  out float vShade;
  out vec3 vPosW;
  void main() {
    vShade = aShade;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
    gl_PointSize = aSize;
  }
`;
const RING_FRAG = /* glsl */ `
  uniform vec3 uRamp[4];
  uniform vec3 uLight;
  uniform vec3 uCenter;
  uniform float uRadius;
  in float vShade;
  in vec3 vPosW;
  void main() {
    int i = int(vShade);
    vec3 oc = vPosW - uCenter;
    float bq = dot(oc, uLight);
    if (bq < 0.0 && dot(oc, oc) - bq * bq < uRadius * uRadius) i = 0;
    gl_FragColor = vec4(uRamp[i], 1.0);
  }
`;
const STAR_FRAG = /* glsl */ `
  uniform vec3 uRamp[3];
  in float vShade;
  void main() { gl_FragColor = vec4(uRamp[int(vShade)], 1.0); }
`;

// ---------------------------------------------------------------- helpers
const mulberry32 = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Seeded 3D value-noise fbm for CPU-side placement (cloud masses), roughly 0..1.
function makeFbm3(seed) {
  const h = (x, y, z) => {
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683) ^ Math.imul(seed, 2246822519);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const noise = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
      l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
      w);
  };
  return (x, y, z) => {
    let sum = 0, amp = 0.5, f = 1;
    for (let i = 0; i < 4; i++) { sum += amp * noise(x * f + 31.7 * i, y * f, z * f); f *= 2.03; amp *= 0.5; }
    return sum / 0.9375;
  };
}

// A material whose colour ramps can be re-tinted for depth. `ramps` maps uniform -> hex list.
function paletteMaterial(frag, ramps, extra = {}, opts = {}) {
  const uniforms = { uLight: { value: LIGHT_DIR }, uBands: { value: new THREE.Vector3(-0.08, 0.28, 0.62) }, ...depthUniforms(), ...extra };
  for (const [name, key] of Object.entries(ramps)) {
    const hexes = resolve(key);
    uniforms[name] = { value: Array.isArray(hexes) ? hexes.map((h) => new THREE.Color(h)) : new THREE.Color(hexes) };
  }
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, ...opts });
  mat.userData.ramps = ramps;
  return mat;
}

export function setDepthLevel(obj, level) {
  if (obj.userData.depthLevel === level) return;
  obj.userData.depthLevel = level;
  const family = obj.userData.depthFamily ?? 'crew';
  obj.traverse((o) => {
    const mats = o.material ? [o.material].flat() : [];
    for (const m of mats) {
      if (m.uniforms?.uDepthFamily) m.uniforms.uDepthFamily.value = family === 'planet' ? 0 : 1; // per-pixel fades use the same family tints
      for (const [name, key] of Object.entries(m.userData.ramps ?? {})) {
        const hexes = resolve(key);
        const arr = m.uniforms[name].value;
        if (Array.isArray(arr)) arr.forEach((u, i) => u.copy(depthColor(hexes[Math.min(i, hexes.length - 1)], level))); // short ramps repeat their last colour
        else arr.copy(depthColor(hexes, level));
      }
    }
  });
}

// ---------------------------------------------------------------- planet
// Biomes: which palette ramps feed uA/uB/uC/uG, sea level, weather and haze.
// `extra` marks the optional ones (not in the art-direction core set).
export const BIOMES = {
  lush: { id: 0, label: 'lush', ramps: ['ocean', 'land', 'cap', 'glow'], sea: [0.47, 0.55], weather: 'cloud', haze: null },
  ocean: { id: 1, label: 'ocean', ramps: ['water', 'land', 'cap', 'glow'], sea: [0.7, 0.73], weather: 'thin', haze: 'haze.ocean' },
  ice: { id: 2, label: 'ice', ramps: ['ice', 'crevasse', 'water', 'glow'], weather: null, haze: 'haze.ice' },
  desert: { id: 3, label: 'desert', ramps: ['sand', 'rock', 'cap', 'glow'], weather: null, haze: null },
  lava: { id: 4, label: 'lava', ramps: ['crust', 'crust', 'ash', 'glow'], weather: 'ash', haze: null },
  gas: { id: 5, label: 'gas giant (extra)', ramps: ['gasA', 'gasB', 'cap', 'glow'], weather: null, haze: null, extra: true },
  moon: { id: 6, label: 'barren moon (extra)', ramps: ['moon', 'moon', 'moon', 'glow'], weather: null, haze: null, extra: true },
  toxic: { id: 7, label: 'toxic', ramps: ['sludge', 'toxic', 'fungus', 'glow'], sea: [0.5, 0.56], weather: 'spore', haze: 'haze.toxic' },
};
// Weather: cloud-puff settings per biome; the one place to tune cover.
//   cover   share of the visible disc the weather hides (measure: debug/measure-cloud-cover.mjs).
//           The densest `cover * gain` of the sky sites get weather, so cover holds per seed;
//           `gain` converts site share to disc share for that weather's puff sizes
//   mass    frequency of the merged-mass field (higher = more, smaller masses)
//   size, lift, strays  puff scale, how high dense cores dome, stray mini-clumps at the edges
//   flat, stretch       radial squash and east-west elongation
//   float   gap between the surface and the puff bases (a separate layer hovering above the terrain)
//   fissure lava: short smoke plumes rise only off the glowing fissures, trailing downwind
export const WEATHER = {
  cloud: { ramp: 'cloud', cover: 0.27, gain: 0.57, float: 0.055, mass: 2.0, size: 1, lift: 1, strays: 0.012 }, // Planetarium: ~25-30%
  thin: { ramp: 'cloud', cover: 0.27, gain: 0.63, float: 0.05, mass: 2.2, size: 0.7, lift: 0.5, strays: 0.012 },
  spore: { ramp: 'spore', cover: 0.27, gain: 0.62, float: 0.05, mass: 2.2, size: 0.7, lift: 1.1, strays: 0.05 },
  ash: { ramp: 'ash', cover: 0.08, gain: 0.3, size: 0.45, lift: 0.3, flat: 0.3, stretch: 3.0, fissure: true }, // light, low, streaky smoke
};

const PLANET_GEO = new THREE.SphereGeometry(1, 72, 48);
const PUFF_GEO = new THREE.IcosahedronGeometry(1, 3);
const MAX_PUFFS = 3200; // enough for the densest weather (ocean) at the slider maximum, 45%
const ramp5 = () => ({ value: Array.from({ length: 5 }, () => new THREE.Color()) });

// Loop lock: every planet layer completes whole cycles per LOOP.period (seconds).
// The surface turns surfaceTurns times and the cloud layer cloudTurns times, so the
// clouds drift over the terrain (24 s at 2:3 = clouds 1.5x the surface; 1 turn per 12 s,
// as before). Per surface turn (one "cycle", period / surfaceTurns), each moon orbits
// once, the ring's 5-fold debris pattern advances one sector (1/5 turn) and the crew
// bob and blink once.
export const LOOP = { period: 24, surfaceTurns: 2, cloudTurns: 3 };
const cycle = () => LOOP.period / LOOP.surfaceTurns;
const RING_SECTORS = 5;
// Ring geometry, a per-planet data channel (reserved for codebase metrics; mapping TBD), in
// planet radii: inner = distance of the inner edge (hugging the surface .. far out), width =
// radial width (a thread .. a wide belt). RING_PRESETS are the ring control's presets: thin is
// the default look exactly; wide is the old two-lane shared-lib belt at the same density.
export const RING = { inner: [1.2, 2.8], width: [0.03, 1.0] }; // inner from just above the cloud tops (~1.15 R)
export const RING_PRESETS = { thin: { inner: 1.69, width: 0.22 }, wide: { inner: 1.54, width: 0.72 } };
const RING_DENSITY = 15 / (1.91 ** 2 - 1.69 ** 2); // clusters per unit of (outer^2 - inner^2): the thin ring's 15
// Lanes [centre radius, half-width, clusters] for a ring. Past width 0.3 a gap opens between an
// inner and an outer lane (a Cassini-style division), growing to 0.2 / 0.72 of the width at 0.72
// (the wide preset's lanes: 1.54-1.78 and 1.98-2.26).
// Clusters scale with each lane's area, so particle density is the same at every size.
export function ringLanes({ inner, width }) {
  const lane = (r, w) => [r + w / 2, w / 2, Math.max(2, Math.round(RING_DENSITY * ((r + w) ** 2 - r ** 2)))];
  const gap = width * (0.2 / 0.72) * THREE.MathUtils.clamp((width - 0.3) / 0.42, 0, 1);
  if (gap === 0) return [lane(inner, width)];
  const a = (width - gap) * (0.24 / 0.52); // the inner lane is the narrower one (0.24 : 0.28 at 0.72)
  return [lane(inner, a), lane(inner + a + gap, width - gap - a)];
}

// Ring debris: chunky points. aType 0 = 1 px, 1 = 2x2 block, 2 = 3x3 plus.
const RING_VERT = /* glsl */ `
  in float aShade;
  in float aType;
  out float vShade;
  out float vType;
  out vec3 vPosW;
  void main() {
    vShade = aShade;
    vType = aType;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
    gl_PointSize = aType < 0.5 ? 1.0 : aType < 1.5 ? 2.0 : 3.0;
  }
`;
const RING_CHUNK_FRAG = /* glsl */ `
  ${DEPTH_GLSL}
  uniform vec3 uRamp[4];
  uniform vec3 uLight;
  uniform vec3 uCenter;
  uniform float uRadius;
  in float vShade;
  in float vType;
  in vec3 vPosW;
  void main() {
    if (vType > 1.5) { // plus shape: drop the 3x3 corners
      vec2 cell = floor(gl_PointCoord * 3.0);
      if (cell.x != 1.0 && cell.y != 1.0) discard;
    }
    int i = int(vShade);
    vec3 oc = vPosW - uCenter;
    float bq = dot(oc, uLight);
    if (bq < 0.0 && dot(oc, oc) - bq * bq < uRadius * uRadius) i = 0; // in the planet's shadow
    gl_FragColor = vec4(depthFade(uRamp[i], vPosW, 1.0), 1.0);
  }
`;
const FLAT_FRAG = /* glsl */ `${DEPTH_GLSL} uniform vec3 uColor; in vec3 vPosW; void main() { gl_FragColor = vec4(depthFade(uColor, vPosW, 1.0), 1.0); }`;
const MOON_GEO = new THREE.SphereGeometry(1, 20, 14);
// The two moons of every planet (sizes and orbits in planet radii; offset = orbit phase, 0..1).
export const MOON_ORBITS = [
  { size: 0.11, orbit: 1.75, incl: 0.34, yaw: 0.25, offset: 0.15 },
  { size: 0.062, orbit: 1.36, incl: 0.5, yaw: -0.4, offset: 0.62 },
];
const VIEW_SIZE = { value: new THREE.Vector2(320, 180) }; // drawing-buffer size, shared by every planet surface (artefact cells)

export function makePlanet() {
  const group = new THREE.Group();
  group.userData.depthFamily = 'planet'; // planet tint slot of the per-pixel depth fade
  const surfaceMat = paletteMaterial(PLANET_FRAG, {}, {
    uBiome: { value: 0 }, uA: ramp5(), uB: ramp5(), uC: ramp5(), uG: { value: [0, 1, 2].map(() => new THREE.Color()) },
    uSeedOff: { value: new THREE.Vector3() }, uSea: { value: 0.5 }, uPoolCut: { value: 9 }, uRegions: { value: 0 }, uCrackLift: { value: 0 },
    uBands: { value: new THREE.Vector3(0.2, 0.58, 0.86) }, // lit directional terminator, crescent bands
    // artefacts (artefacts.js): off while uArtN = 0
    uArtN: { value: 0 }, uArtTick: { value: 0 }, uArtTeal: { value: 0 }, uArtDebug: { value: 0 }, uLavaMode: { value: 0 }, uLavaTime: { value: new THREE.Vector2(1, 0) }, uArtTealC: { value: new THREE.Color(ACCENTS.reveal[3]) }, // [OIII] teal, garnish only
    uArtSec: { value: Array.from({ length: MAX_ART }, () => new THREE.Vector4(0, 0, 1, 4)) }, uViewSize: VIEW_SIZE,
  });
  const spin = new THREE.Group(); // the surface turns surfaceTurns per loop
  const surface = new THREE.Mesh(PLANET_GEO, surfaceMat);
  spin.add(surface);
  group.add(spin);

  const hazeMat = paletteMaterial(HAZE_FRAG, { uHaze: 'glint' });
  const haze = new THREE.Mesh(PLANET_GEO, hazeMat);
  haze.scale.setScalar(1.06);
  group.add(haze);

  // Optional dark halo (teal-GIF look): a back-face shell in the bg+1 colour, ~2 px at hero size.
  const haloMat = paletteMaterial(FLAT_FRAG, { uColor: 'halo' }, {}, { side: THREE.BackSide });
  const halo = new THREE.Mesh(PLANET_GEO, haloMat);
  halo.scale.setScalar(1.055);
  halo.visible = false;
  group.add(halo);

  // Clouds / ash / spores: clusters of overlapping puffs floating a little above the
  // surface (WEATHER.float), so the tops bulge past the silhouette at the limb. They
  // turn as their own layer (cloudTurns per loop), drifting over the terrain.
  const cloudMat = paletteMaterial(CLOUD_FRAG, { uRamp: 'cloud' }, {
    uBands: { value: new THREE.Vector3(-0.3, 0.12, 0.42) }, uCenter: { value: new THREE.Vector3() },
  });
  cloudMat.vertexShader = CLOUD_VERT;
  const puffGeo = PUFF_GEO.clone(); // own copy: carries this planet's per-puff mass anchors
  const massAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 4), 4);
  puffGeo.setAttribute('aMass', massAttr);
  const puffs = new THREE.InstancedMesh(puffGeo, cloudMat, MAX_PUFFS);
  const sky = new THREE.Group();
  sky.add(puffs);
  group.add(sky);
  // Cloud shadow: same instances, projected onto the surface (shares its uniforms and ramps).
  const shadowMat = new THREE.ShaderMaterial({
    vertexShader: SHADOW_VERT, fragmentShader: SHADOW_FRAG, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: { ...surfaceMat.uniforms, uCenter: { value: new THREE.Vector3() }, uRadius: { value: 1 }, uToSurface: { value: new THREE.Matrix4() } },
  });
  const shadow = new THREE.InstancedMesh(puffGeo, shadowMat, MAX_PUFFS);
  shadow.instanceMatrix = puffs.instanceMatrix;
  shadow.frustumCulled = puffs.frustumCulled = false; // instances span the whole planet
  sky.add(shadow);

  // Ring: clustered chunky debris. A modifier on any biome: off, thin or wide.
  const ringMat = new THREE.ShaderMaterial({
    vertexShader: RING_VERT, fragmentShader: RING_CHUNK_FRAG,
    uniforms: {
      uRamp: { value: [0, 1, 2, 3].map(() => new THREE.Color()) }, uLight: { value: LIGHT_DIR },
      uCenter: { value: new THREE.Vector3() }, uRadius: { value: 1 }, ...depthUniforms(),
    },
  });
  ringMat.userData.ramps = { uRamp: 'ring' };
  const ringTilt = new THREE.Group();
  ringTilt.rotation.set(0.2, 0, -0.32); // shallow tilt so the front arc crosses the disc
  const ring = new THREE.Points(new THREE.BufferGeometry(), ringMat);
  ringTilt.add(ring);
  group.add(ringTilt);

  // Moons: a big (~9 px) and a small (~5 px) warm sphere on inclined orbits that pass
  // in front at the bottom and fully behind the disc (depth-sorted by the z-buffer).
  const moonMat = paletteMaterial(TOON_FRAG, { uRamp: 'moonBody' }, { uBands: { value: new THREE.Vector3(-0.15, 0.35, 0.7) } });
  const MOONS = MOON_ORBITS.map((m) => ({ ...m, mesh: Object.assign(new THREE.Mesh(MOON_GEO, moonMat), { visible: false }) }));
  for (const m of MOONS) {
    m.mesh.scale.setScalar(m.size);
    group.add(m.mesh);
  }

  const m4 = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  let built = '';

  let moonReach = 1; // moon orbits scale out with a ring pushed past the thin preset's distance
  // cover: optional override of the biome's WEATHER cover (the viewer's cloud slider).
  // ringGeo: { inner, width } (RING); defaults to the ringMode preset.
  // size: the planet's size (~ LOC), its group scale; it also sets how many cracks show (crackLift).
  // float: optional override of the weather's WEATHER.float (the asset library's cloud control).
  function rebuild(seed, biomeKey = 'lush', ringMode = 'thin', cover = null, ringGeo = RING_PRESETS[ringMode], size = 1, floatOverride = null) {
    const lift = crackLift(size);
    group.scale.setScalar(size);
    surfaceMat.uniforms.uCrackLift.value = lift;
    const key = `${seed}|${biomeKey}|${ringMode}|${cover}|${ringGeo?.inner}|${ringGeo?.width}|${biomeKey === 'lava' ? lift : ''}|${floatOverride ?? ''}`; // size only moves lava ash (crack set)
    if (key === built) return;
    built = key;
    const biome = BIOMES[biomeKey];
    const rnd = mulberry32(seed * 7919 + 13);
    surfaceMat.uniforms.uBiome.value = biome.id;
    surfaceMat.uniforms.uSeedOff.value.set(rnd() * 50, rnd() * 50, rnd() * 50);
    const [s0, s1] = biome.sea ?? [0.5, 0.5];
    surfaceMat.uniforms.uSea.value = s0 + rnd() * (s1 - s0);
    const so = surfaceMat.uniforms.uSeedOff.value;
    surfaceMat.uniforms.uPoolCut.value = biomeKey === 'lava' ? poolCut(CRACKS.lava, so) : biomeKey === 'ice' ? poolCut(CRACKS.ice, new THREE.Vector3(so.y, so.z, so.x)) : 9;
    const [a, b, c, g] = biome.ramps;
    surfaceMat.userData.ramps = { uA: a, uB: b, uC: c, uG: g };
    haze.visible = !!biome.haze;
    if (biome.haze) hazeMat.userData.ramps = { uHaze: biome.haze };
    ringMat.userData.ramps = { uRamp: `ring.${biomeKey}` };
    const weather = WEATHER[biome.weather];
    if (weather) cloudMat.userData.ramps = { uRamp: weather.ramp };
    group.userData.depthLevel = -1; // re-tint with the new ramps

    // Noise-driven placement, like Planetarium: one fbm field makes a few big merged
    // masses, a latitude-stretched field makes long east-west streaks, and everything
    // else stays clear sky. Denser sites get bigger, higher puffs, so cores merge and
    // dome. Puffs are squashed radially so clumps hug the surface; `stretch` elongates
    // them east-west (streaky smoke).
    let n = 0;
    let dirsOf = [];
    let masses = [];
    let mass = -1; // index of the mass the next puffs belong to (-1 = no mass shading)
    const puffMass = [];
    const float = floatOverride ?? weather?.float ?? 0;
    // Bases float at about 1 + float; lift raises dense cores so they dome.
    const put = (dir, size, lift, flat = 0.6, stretch = 1) => {
      if (n >= MAX_PUFFS) return;
      const d = dir.clone().normalize();
      const { east, north } = tangentFrame(THREE, d); // right-handed: det > 0, outer shell stays front-facing
      m4.makeBasis(east.multiplyScalar(size * stretch), d.clone().multiplyScalar(size * flat), north.multiplyScalar(size));
      m4.setPosition(d.multiplyScalar(1 + float + size * flat * (0.75 + lift * 0.5)));
      puffMass[n] = mass;
      puffs.setMatrixAt(n++, m4);
    };
    // A lone sphere reads as a white ball, so thin weather is built as a mini-clump:
    // a lead puff plus smaller satellites beside it.
    const clump = (center, size, lift, satellites, flat, stretch) => {
      put(center, size, lift, flat, stretch);
      const { east, north } = tangentFrame(THREE, center.clone().normalize());
      for (let k = 0; k < satellites; k++) {
        const ang = rnd() * Math.PI * 2;
        const off = size * (0.9 + rnd() * 0.5);
        put(center.clone().addScaledVector(east, Math.cos(ang) * off * 1.4 * stretch).addScaledVector(north, Math.sin(ang) * off * 0.7), size * (0.5 + rnd() * 0.25), lift * 0.5, flat, stretch);
      }
    };
    if (weather) {
      const share = Math.min(1, (cover ?? weather.cover) * weather.gain);
      const flat = weather.flat ?? 0.6;
      const stretch = weather.stretch ?? 1;
      // smaller puffs need denser sites so masses stay solid; fissures are thin, so lava samples finer
      const SITES = weather.fissure ? 4000 : Math.round(1500 / weather.size ** 2);
      const dirs = (dirsOf = []);
      for (let i = 0; i < SITES; i++) {
        const y = 1 - ((i + 0.5) / SITES) * 2;
        const r = Math.sqrt(1 - y * y);
        const lon = i * 2.39996;
        dirs.push(new THREE.Vector3(Math.cos(lon) * r, y, Math.sin(lon) * r));
      }
      // Raw weather density per site, then a threshold at the (1 - share) quantile.
      let raw;
      if (weather.fissure) {
        // the surface shader's fissures and pool shores (PLANET_FRAG lava branch: voronoiCells,
        // crackMask, poolField), plus a patch field so only some of them smoke. Sites off the
        // visible fissures and shores (solid crust, the open middle of a lake) never qualify.
        const o = surfaceMat.uniforms.uSeedOff.value;
        const { freq, cut, half, tip, pool } = CRACKS.lava;
        const openCut = surfaceMat.uniforms.uPoolCut.value;
        const patch = makeFbm3(seed * 23 + 3);
        raw = dirs.map((d) => {
          const { edge, own, across } = voronoiCells(d.x * freq + o.x, d.y * freq + o.y, d.z * freq + o.z);
          const open = [own, across].filter((c) => poolField(...c, o.x, o.y, o.z, pool.scale) > openCut).length;
          if (open === 2) return -1; // inside a lake: no edge shows here
          if (open === 0 && crackShare(crackMask(d.x, d.y, d.z, freq, o.x, o.y, o.z), cut, lift) * half < tip) return -1; // the shader draws no crack here (crackHero)
          return 1 - (edge / freq) * 8 + (patch(d.x * 1.6, d.y * 1.6, d.z * 1.6) - 0.5) * 0.25; // edge / freq: sphere units to the fissure or shore
        });
      } else {
        const massField = makeFbm3(seed * 31 + 5);
        const streakField = makeFbm3(seed * 17 + 9);
        const k = weather.mass;
        raw = dirs.map((d) => Math.max(massField(d.x * k + 4, d.y * k, d.z * k), streakField(d.x * 0.9, d.y * 6.0 + 2, d.z * 0.9)));
      }
      const sorted = [...raw].sort((a, b) => b - a);
      const thr = share > 0 ? sorted[Math.min(SITES - 1, Math.round(share * SITES))] - 0.012 : Infinity;
      // Masses: the cloudy sites joined to their neighbours (union-find), so each mass can
      // shade as one dome. Strays and lava plumes are their own small masses.
      const cloudy = weather.fissure ? [] : dirs.map((_, i) => i).filter((i) => raw[i] - thr > 0.012);
      const root = new Map(cloudy.map((i) => [i, i]));
      const find = (i) => { while (root.get(i) !== i) { root.set(i, root.get(root.get(i))); i = root.get(i); } return i; };
      const near = Math.cos(1.8 * Math.sqrt((4 * Math.PI) / SITES)); // ~1.8 site spacings
      for (let a = 0; a < cloudy.length; a++) for (let b = a + 1; b < cloudy.length; b++) {
        if (dirs[cloudy[a]].dot(dirs[cloudy[b]]) > near) root.set(find(cloudy[a]), find(cloudy[b]));
      }
      const massOf = new Map(); // site -> mass index
      masses = [];
      for (const i of cloudy) {
        const r = find(i);
        if (!massOf.has(r)) { massOf.set(r, masses.length); masses.push([]); }
        massOf.set(i, massOf.get(r));
        masses[massOf.get(r)].push(i);
      }
      const newMass = (sites) => { masses.push(sites); return masses.length - 1; };
      for (let i = 0; i < SITES; i++) {
        const density = raw[i] - thr;
        const jitter = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.05);
        const dir = dirs[i];
        mass = massOf.get(i) ?? -1;
        if (weather.fissure) {
          if (density <= 0.012) continue;
          mass = -1; // smoke keeps plain puff shading
          // a plume: a lead puff on the fissure, then smaller, thinner puffs trailing east
          const { east } = tangentFrame(THREE, dir);
          const size = (0.022 + rnd() * 0.014) * weather.size * 2;
          const trail = 2 + Math.floor(rnd() * 3);
          for (let k = 0; k <= trail; k++) {
            put(dir.clone().addScaledVector(east, k * size * stretch * 1.1), size * (1 - k * 0.22), weather.lift * (1 + k * 0.4), flat, stretch);
          }
        } else if (density > 0.012) {
          const core = Math.min(1, density * 7);
          // radius >= ~0.06, wider than half the site spacing (~0.09 at size 1): neighbours always overlap, so a mass is one body
          clump(dir.add(jitter), (0.058 + core * 0.04 + rnd() * 0.01) * weather.size, (0.2 + core * 0.9) * weather.lift, core < 0.35 ? 2 + Math.floor(rnd() * 2) : 1, flat, stretch);
        } else if (density > -0.08 && rnd() < weather.strays) {
          mass = newMass([i]);
          clump(dir.add(jitter), (0.026 + rnd() * 0.012) * weather.size, 0.3 * weather.lift, 2 + Math.floor(rnd() * 2), flat, stretch);
        }
      }
    }
    // Mass anchors: below each mass's centre by about its radius (at least a puff's size),
    // so the dome normal tilts out toward the mass edge.
    const anchors = (weather && !weather.fissure ? masses : []).map((sites) => {
      const c = new THREE.Vector3();
      for (const i of sites) c.add(dirsOf[i]);
      c.normalize();
      const radius = Math.acos(Math.min(1, Math.min(...sites.map((i) => dirsOf[i].dot(c)))));
      return c.multiplyScalar(1 + float - Math.min(0.5, Math.max(0.06, radius * 1.1)));
    });
    for (let i = 0; i < n; i++) {
      const a = anchors[puffMass[i]];
      if (a) massAttr.setXYZW(i, a.x, a.y, a.z, 1);
      else massAttr.setXYZW(i, 0, 0, 0, 0);
    }
    massAttr.needsUpdate = true;
    puffs.count = shadow.count = n;
    shadow.visible = !!weather && !weather.fissure;
    puffs.instanceMatrix.needsUpdate = true;

    // Ring debris (Planetarium): >= 70% chunky 2x2 / plus particles grouped in
    // clusters, plus sparse 1 px dust. One sector is generated and repeated
    // RING_SECTORS times, so flowing it 1/RING_SECTORS of a turn per loop is seamless.
    // Colour mix: mauve-grey > the planet's own colour > taupe specks.
    ring.visible = ringMode !== 'off' && !!ringGeo;
    moonReach = ring.visible ? Math.max(1, ringGeo.inner / RING_PRESETS.thin.inner) : 1;
    const pts = [];
    const shade = [];
    const type = [];
    const bands = ring.visible ? ringLanes(ringGeo) : [];
    const sector = (Math.PI * 2) / RING_SECTORS;
    const pick = () => { const v = rnd(); return v < 0.5 ? 1 : v < 0.8 ? 2 : 3; };
    const one = [];
    for (const [r0, spread, clusters] of bands) {
      for (let c = 0; c < clusters; c++) {
        const ca = rnd() * sector;
        const cr = r0 + (rnd() * 2 - 1) * spread * 0.7;
        const count = 5 + Math.floor(rnd() * 12);
        const tone = pick();
        for (let k = 0; k < count; k++) {
          const ang = ca + (rnd() - 0.5) * 0.11;
          const rr = cr + (rnd() - 0.5) * spread * 0.5;
          one.push([ang, rr, rnd() < 0.7 ? tone : pick(), rnd() < 0.55 ? 1 : 2]);
        }
      }
      for (let k = 0; k < clusters * 2; k++) one.push([rnd() * sector, r0 + (rnd() * 2 - 1) * spread, pick(), 0]); // loose 1 px dust
    }
    for (let s = 0; s < RING_SECTORS; s++) {
      for (const [ang, rr, tone, t] of one) {
        const a2 = ang + s * sector;
        pts.push(Math.cos(a2) * rr, 0, Math.sin(a2) * rr);
        shade.push(tone);
        type.push(t);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute('aShade', new THREE.Float32BufferAttribute(shade, 1));
    geo.setAttribute('aType', new THREE.Float32BufferAttribute(type, 1));
    ring.geometry.dispose();
    ring.geometry = geo;

    // Artefact sectors: their own stream, so turning them on never changes the terrain.
    artefactSectors(mulberry32(seed * 104729 + 7), MAX_ART).forEach((sec, i) => surfaceMat.uniforms.uArtSec.value[i].set(...sec.dir, sec.size));
  }

  /** phase in [0, 1): position in the shared loop; lavaPhase: the molten lava field's (default: the same). */
  function update(phase, lavaPhase = phase) {
    const turn = phase * Math.PI * 2 * LOOP.surfaceTurns; // whole surface turns per loop
    spin.rotation.y = -turn; // right -> left
    sky.rotation.y = -phase * Math.PI * 2 * LOOP.cloudTurns; // clouds drift ahead of the ground
    const lavaAngle = lavaPhase * Math.PI * 2 * LOOP.surfaceTurns * LAVA_FLOW.cycles; // whole cycles per surface turn: loop-locked
    surfaceMat.uniforms.uLavaTime.value.set(Math.cos(lavaAngle), Math.sin(lavaAngle));
    const ticks = ART_TICKS * LOOP.surfaceTurns;
    surfaceMat.uniforms.uArtTick.value = Math.floor(phase * ticks + 1e-6) % ticks; // glitches re-roll on loop-locked ticks
    artUpdate();
    ring.rotation.y = -turn / RING_SECTORS; // debris flow: one sector per surface turn
    for (const m of MOONS) {
      const a = turn + m.offset * Math.PI * 2; // one orbit per surface turn; no easing
      const orbit = m.orbit * moonReach;
      const p = new THREE.Vector3(Math.cos(a) * orbit, -Math.sin(a) * orbit * Math.sin(m.incl), Math.sin(a) * orbit * Math.cos(m.incl));
      m.mesh.position.copy(p.applyAxisAngle(up, m.yaw));
    }
    group.updateMatrixWorld(true);
    group.getWorldPosition(ringMat.uniforms.uCenter.value);
    cloudMat.uniforms.uCenter.value.copy(ringMat.uniforms.uCenter.value);
    shadowMat.uniforms.uCenter.value.copy(ringMat.uniforms.uCenter.value);
    ringMat.uniforms.uRadius.value = shadowMat.uniforms.uRadius.value = group.scale.x;
    shadowMat.uniforms.uToSurface.value.copy(surface.matrixWorld).invert();
  }
  // artefacts: 0 = off, 1..5 = that many sectors, 'auto' = by planet size (artefactCount).
  let artefactsOpt = 0;
  function setExtras({ moons = false, halo: showHalo = false, artefacts = 0, teal = false, cloudShadow = true, regions = false, artDebug = false, lavaMode = 'layered' } = {}) {
    surfaceMat.uniforms.uLavaMode.value = Math.max(0, LAVA_MODES.indexOf(lavaMode));
    surfaceMat.uniforms.uRegions.value = regions ? 1 : 0;
    surfaceMat.uniforms.uArtDebug.value = artDebug ? 1 : 0;
    for (const m of MOONS) m.mesh.visible = moons;
    shadowMat.visible = cloudShadow;
    halo.visible = showHalo;
    artefactsOpt = artefacts;
    surfaceMat.uniforms.uArtTeal.value = teal ? 1 : 0;
  }
  const artUpdate = () => { // per frame: the planet's size (scale) may change after setExtras
    surfaceMat.uniforms.uArtN.value = artefactsOpt === 'auto' ? artefactCount(group.scale.x) : Math.min(artefactsOpt, MAX_ART);
  };

  // parts and moons: for the asset library, which shows layers on their own and edits moon orbits.
  const parts = { surface, haze, halo, sky, ringTilt };
  return { group, rebuild, update, ring, setExtras, parts, moons: MOONS };
}

// ---------------------------------------------------------------- astronaut
// Variant K from the astronaut lab (geometry in astronaut.js): one signed-distance body,
// raymarched inside a proxy box. Every part joins one surface, so a single lighting pass
// shades the whole figure. Cast shadows and contact occlusion come from marching the same
// field toward the light. White limbs are smooth bent tubes; the grey ring collars, cuffs and
// neck seal are separate crisp parts. Figure units: 1 tall, facing +z (scaled by SCALE).
const ASTRO_FRAG = /* glsl */ `
  uniform mat4 uInvModel;
  uniform mat4 uModel;
  uniform mat4 uProj;
  uniform vec3 uLightLocal;
  uniform vec3 uSuit[4];
  uniform vec3 uGear[4];
  uniform vec3 uAccent[4];
  uniform vec3 uVisor[2];
  uniform vec3 uGlint;
  uniform vec3 uEyeGlow; // the eye light: the contributor ramp's step 2 unless the library overrides it
  ${DEPTH_GLSL}
  ${EYES_GLSL}
  ${ASTRO_SDF_GLSL}
  in vec3 vPosW;

  vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0015;
    return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
  }

  float shadow(vec3 ro, vec3 rd) {
    float t = 0.02;
    for (int i = 0; i < 48; i++) {
      float h = map(ro + rd * t);
      if (h < 0.002) return 0.0;
      t += max(h * 0.85, 0.008);
      if (t > 1.4) break;
    }
    return 1.0;
  }

  float occlusion(vec3 p, vec3 n) {
    float o = 0.0;
    for (int i = 1; i <= 4; i++) {
      float h = 0.025 * float(i);
      o += (h - map(p + n * h)) / h;
    }
    return clamp(1.0 - o * 0.3, 0.0, 1.0);
  }

  void main() {
    vec3 ro = (uInvModel * vec4(cameraPosition, 1.0)).xyz;
    vec3 rd = normalize((uInvModel * vec4(vPosW, 1.0)).xyz - ro);
    vec3 t0 = (BMIN - ro) / rd, t1 = (BMAX - ro) / rd;
    vec3 tmin = min(t0, t1), tmax = max(t0, t1);
    float tn = max(max(max(tmin.x, tmin.y), tmin.z), 0.0);
    float tf = min(min(tmax.x, tmax.y), tmax.z);
    float t = tn;
    bool hit = false;
    for (int i = 0; i < 160; i++) {
      float h = map(ro + rd * t);
      if (h < 0.0012 * (1.0 + t)) { hit = true; break; }
      t += h * 0.8; // under-step a little to stay on the thin rings
      if (t > tf) break;
    }
    if (!hit) discard;
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    vec3 L = normalize(uLightLocal);
    float lit = dot(n, L);
    if (shadow(p + n * 0.006, L) < 0.5) lit = min(lit, 0.1) - 0.3;
    lit -= (1.0 - occlusion(p, n)) * 0.6;
    int b = lit > 0.7 ? 3 : lit > 0.32 ? 2 : lit > -0.12 ? 1 : 0;
    int r = region(p);
    vec3 c;
    if (r == 3) {
      vec3 refl = reflect(rd, n);
      c = (refl.y > 0.18 && b >= 2) ? uVisor[1] : uVisor[0];
      // Eyes: evaluated analytically at the hit point, glowing unlit in the contributor
      // colour; the internal-resolution render is what pixelates them.
      vec2 uv = visorUV(p).xy;
      if (eyeLit(uv)) c = uEyeGlow;
      if (glintLit(uv)) c = uGlint;
    } else if (r == 2) c = uAccent[b];
    else if (r == 1) c = uGear[b];
    else c = uSuit[b];
    vec4 pw = uModel * vec4(p, 1.0);
    gl_FragColor = vec4(depthFade(c, pw.xyz, 1.0), 1.0);
    vec4 clip = uProj * viewMatrix * pw;
    gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
  }
`;

const PROXY_GEO = new THREE.BoxGeometry(ASTRO_BMAX[0] - ASTRO_BMIN[0], ASTRO_BMAX[1] - ASTRO_BMIN[1], ASTRO_BMAX[2] - ASTRO_BMIN[2])
  .translate((ASTRO_BMAX[0] + ASTRO_BMIN[0]) / 2, (ASTRO_BMAX[1] + ASTRO_BMIN[1]) / 2, (ASTRO_BMAX[2] + ASTRO_BMIN[2]) / 2);
const ASTRO_LAYOUT = astroLayout();

export function makeAstronaut(colorKey) {
  // root (placement, yaw) -> lift (boot sole at LIFT) -> body (bob, sway, SCALE) -> proxy
  const root = new THREE.Group();
  const lift = new THREE.Group();
  lift.position.y = ASTRO_LIFT;
  const body = new THREE.Group();
  body.scale.setScalar(ASTRO_SCALE);
  root.add(lift);
  lift.add(body);
  const joints = Array.from({ length: 12 }, () => new THREE.Vector3());
  const rings = [];
  const mat = paletteMaterial(ASTRO_FRAG, {
    uSuit: 'suit', uGear: 'gear', uAccent: `contributors.${colorKey}`, uEyeGlow: `contributors.${colorKey}.2`, uVisor: 'visor', uGlint: 'glint',
  }, {
    uInvModel: { value: new THREE.Matrix4() }, uModel: { value: null }, uProj: { value: camera.projectionMatrix },
    uLightLocal: { value: new THREE.Vector3() }, uJ: { value: joints }, uEyes: { value: 0 }, uBlink: { value: 1 },
    uRingC: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) },
    uRingA: { value: Array.from({ length: 8 }, () => new THREE.Vector3(0, 1, 0)) },
    uRingR: { value: new Array(8).fill(0.05) },
  }, { side: THREE.BackSide });
  const proxy = new THREE.Mesh(PROXY_GEO, mat);
  mat.uniforms.uModel.value = proxy.matrixWorld;
  body.add(proxy);

  const q = new THREE.Quaternion();
  // Relaxed float: elbows and knees softly bent; the bends breathe with the bob (astronaut.js).
  function update(t) {
    const p = t + root.userData.phase;
    const W = (Math.PI * 2) / cycle(); // loop-locked: whole cycles per loop
    astroPose(ASTRO_LAYOUT, p, cycle(), joints, rings);
    rings.forEach((r, i) => { mat.uniforms.uRingC.value[i].copy(r.c); mat.uniforms.uRingA.value[i].copy(r.a).normalize(); mat.uniforms.uRingR.value[i] = r.r; });
    body.position.y = Math.sin(p * 2 * W) * 0.05;
    body.rotation.z = Math.sin(p * W) * 0.07;
    body.rotation.x = Math.sin(p * W + 1.3) * 0.05;
    mat.uniforms.uBlink.value = root.userData.blink === false ? 1 : blink(p); // the library's blink-off: eyes stay open
    root.updateMatrixWorld(true);
    mat.uniforms.uInvModel.value.copy(proxy.matrixWorld).invert();
    proxy.matrixWorld.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    mat.uniforms.uLightLocal.value.copy(LIGHT_DIR).applyQuaternion(q.invert());
  }
  // eyeGlow: the eye light's ramp key (default the contributor ramp's step 2; the library passes a free colour).
  function setColor(key, eyeGlow = `contributors.${key}.2`) {
    mat.userData.ramps.uAccent = `contributors.${key}`;
    mat.userData.ramps.uEyeGlow = eyeGlow;
    root.userData.depthLevel = -1; // force a re-tint
  }
  function setFace(idx) {
    mat.uniforms.uEyes.value = idx;
  }
  // Blink: a quick Y-squash of the eyes once per loop, staggered per astronaut.
  const BLINK_LEN = 0.18;
  function blink(p) {
    const P = cycle();
    const k = ((p + root.userData.phase * 0.37) % P + P) % P;
    if (k > BLINK_LEN) return 1;
    return 1 - Math.sin((k / BLINK_LEN) * Math.PI) * 0.88;
  }
  root.userData.phase = 0; // callers stagger this so the crew doesn't bob in sync
  return { group: root, update, setColor, setFace, material: mat };
}

// ---------------------------------------------------------------- sky
// Screen-space background bands (top -> bottom), drawn behind everything. Hard
// steps, no smooth gradient; stars and the scene draw over it.
const SKY_VERT = /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.9999, 1.0); }`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 uBands[3];
  uniform float uHeight;
  void main() {
    float y = 1.0 - gl_FragCoord.y / uHeight; // 0 at the top
    gl_FragColor = vec4(uBands[y < 0.6 ? 0 : y < 0.84 ? 1 : 2], 1.0);
  }
`;
export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, depthTest: false, depthWrite: false,
    uniforms: { uBands: { value: resolve('spaceBands').map((h) => new THREE.Color(h)) }, uHeight: { value: 180 } },
  });
  mat.userData.ramps = { uBands: 'spaceBands' };
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -2;
  return sky;
}

// ---------------------------------------------------------------- stars
export function makeStars() {
  const rnd = mulberry32(4242);
  const pts = [];
  const shade = [];
  const sizes = [];
  for (let i = 0; i < 900; i++) { // sparse: ~0.5-1.5 visible per 1000 px²
    const u = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    pts.push(Math.cos(a) * s * 500, u * 500, Math.sin(a) * s * 500);
    const r = rnd();
    shade.push(r < 0.8 ? 0 : r < 0.96 ? 1 : 2); // mostly dim, static
    sizes.push(1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('aShade', new THREE.Float32BufferAttribute(shade, 1));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: POINTS_VERT, fragmentShader: STAR_FRAG, depthWrite: false,
    uniforms: { uRamp: { value: resolve('stars').map((h) => new THREE.Color(h)) } },
  });
  mat.userData.ramps = { uRamp: 'stars' };
  const stars = new THREE.Points(g, mat);
  stars.renderOrder = -1;
  return stars;
}

// ---------------------------------------------------------------- world
const canvas = document.getElementById('view');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.05, 1200);
export const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

const sky = makeSky();
scene.add(sky);
const stars = makeStars();
scene.add(stars);

// Hero planet at the origin, plus mid, far and silhouette copies (same seed) to prove depth.
const planets = LIBRARY ? [] : [
  { pos: [0, 0, 0] },
  { pos: [-6.5, 1.2, -13] },
  { pos: [9, 2.2, -27] },
  { pos: [-13, 5, -40] },
].map(({ pos }) => {
  const p = makePlanet();
  p.group.position.set(...pos);
  scene.add(p.group);
  return p;
});

// Crew line-up for the close-up, off to the side of the hero planet.
export const CREW_SPOT = new THREE.Vector3(-1.35, -0.2, 4.6); // in front of the hero planet, so one shot shows crew + planet + depth
const crew = LIBRARY ? [] : CONTRIBUTOR_KEYS.map((key, i) => {
  const a = makeAstronaut(key);
  a.group.position.set(CREW_SPOT.x + (i - 1) * 0.72, CREW_SPOT.y, CREW_SPOT.z);
  a.group.rotation.y = [0.4, 0.05, -0.4][i];
  a.userData = { color: key };
  a.group.userData.phase = i * 1.7;
  scene.add(a.group);
  return a;
});

// Solo astronauts at the mid, far and silhouette steps (the crew covers near); they wear the selected contributor colour.
const solos = LIBRARY ? [] : [
  { pos: [4.6, -0.4, -8], ry: -0.3 },
  { pos: [-1.5, 2.6, -21], ry: 0.4 },
  { pos: [6.5, 4.2, -38], ry: -0.5 },
].map(({ pos, ry }, i) => {
  const a = makeAstronaut('coral');
  a.userData = { color: null }; // follows state.color
  a.group.position.set(...pos);
  a.group.rotation.y = ry;
  a.group.userData.phase = 0.6 + i * 2.3;
  scene.add(a.group);
  return a;
});

// System scene: mixed biomes, sizes (size ~ LOC) and depths with the crew in front.
// Hidden unless the 'system' view is active; it previews the GIF composition.
const SYSTEM = LIBRARY ? [] : [
  { biome: 'lush', seed: 7, size: 1.0, ring: 'thin', pos: [0.75, 0.15, 0] },
  { biome: 'gas', seed: 5, size: 2.2, ring: 'off', pos: [-10.5, 2.4, -17] },
  { biome: 'ice', seed: 21, size: 0.62, ring: 'off', pos: [5.4, 0.1, -3.2] },
  { biome: 'lava', seed: 11, size: 0.7, ring: 'off', pos: [3.3, -0.9, 0.9] },
  { biome: 'desert', seed: 3, size: 0.85, ring: 'wide', pos: [-1.0, 3.4, -9] },
  { biome: 'ocean', seed: 42, size: 1.25, ring: 'off', pos: [7.2, 3.6, -19] },
  { biome: 'moon', seed: 9, size: 0.28, ring: 'off', pos: [2.15, 1.3, -0.5] },
  { biome: 'toxic', seed: 13, size: 1.1, ring: 'off', pos: [13, 1.2, -36] },
].map((cfg) => {
  const p = makePlanet();
  p.rebuild(cfg.seed, cfg.biome, cfg.ring, null, RING_PRESETS[cfg.ring], cfg.size);
  p.group.position.set(...cfg.pos);
  scene.add(p.group);
  return p;
});

export const VIEWS = {
  // Hero close-ups: distance 7 puts a size-1 planet at ~45% of frame height (Planetarium 42-50%).
  planet: { pos: [1.92, 1.12, 6.69], target: [0, 0, 0], scene: 'solo' },
  studio: { pos: [1.92, 1.12, 6.69], target: [0, 0, 0], scene: 'solo' }, // same framing, for biome sheets
  system: { pos: [0.1, 1.3, 10.2], target: [-0.4, 0.4, -6], scene: 'system' },
  crew: { pos: [CREW_SPOT.x + 0.35, CREW_SPOT.y + 0.95, CREW_SPOT.z + 2.7], target: [CREW_SPOT.x, CREW_SPOT.y + 0.52, CREW_SPOT.z] },
  depth: { pos: [0.1, 1.2, 9.6], target: [-0.3, 0.3, -6] },
  face: { pos: [CREW_SPOT.x + 0.08, CREW_SPOT.y + 0.8, CREW_SPOT.z + 1.15], target: [CREW_SPOT.x, CREW_SPOT.y + 0.62, CREW_SPOT.z] }, // head close-up (mint)
};

// ---------------------------------------------------------------- state
const state = {
  view: 'planet', seed: 7, biome: 'lush', size: 1, ringMode: 'thin', color: 'coral', pixelH: 180, depth: true, spin: true,
  ringInner: RING_PRESETS.thin.inner, ringWidth: RING_PRESETS.thin.width, // ring geometry (RING); the ring control sets a preset
  time: null, ui: true, palette: 'final', eyes: 'auto', period: 24, surfaceTurns: 2, cloudTurns: 3, moons: true, halo: false, cloudShadow: true,
  depthMode: 'pixel-smooth', // DEPTH_MODES (the human's pick)
  depthBands: '3-band', // DEPTH_BANDS (per-pixel modes)
  artefacts: false, artAuto: true, artCount: 3, artTeal: false, // planet artefacts (artefacts.js); artAuto: sector count by planet size
  cover: null, // cloud-cover override (0..1) for the hero planets; null = the biome's WEATHER cover
  regions: false, // debug (measurement only): planet surfaces as ground / crack / open-plate colours
  lavaMode: 'layered', // LAVA_MODES: layered (default), static-painted (3b6a482 flow, A/B), full-warp
  lavaTime: null, // debug: pin the molten lava field to this loop time (s), even with spin off; null = follow the loop
  artDebug: false, // debug (measurement only): artefact cells as cell-index colours (artefacts.js uArtDebug)
};

// Keep the orbit camera out of the cloud layer in planet views (clouds reach ~1.1 R).
const minOrbit = () => ((VIEWS[state.view]?.scene ?? 'showcase') === 'solo' ? 1.35 * state.size : 0.5);

function applyView(name) {
  const v = VIEWS[name];
  controls.minDistance = minOrbit();
  camera.position.set(...v.pos);
  controls.target.set(...v.target);
  controls.update();
}

export const frameWidth = (h) => Math.floor((h * 16) / 9); // floor so e.g. 240 tall -> 426 wide still fits x3 on 1280
/** Sizes the drawing buffer (the internal pixels) and everything that reads it: artefact cells, sky bands, the camera. */
export function setPixelSize(w, h, skies = [sky]) {
  renderer.setSize(w, h, false);
  setViewSize(w, h, skies);
}
/** The same without resizing the canvas: for off-screen renders (the asset library's thumbnails). */
export function setViewSize(w, h, skies = [sky]) {
  VIEW_SIZE.value.set(w, h);
  for (const s of skies) s.material.uniforms.uHeight.value = h;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function resize() {
  const h = state.pixelH;
  const w = frameWidth(h);
  setPixelSize(w, h);
  const scale = Math.max(1, Math.floor(Math.min(innerWidth / w, innerHeight / h)));
  canvas.style.width = `${w * scale}px`;
  canvas.style.height = `${h * scale}px`;
  const readout = document.getElementById('pixel-readout');
  if (readout) readout.textContent = `${w}×${h} ×${scale}`;
}

let lastPixelDepth = null;
// The ring control picks a preset: it resets the width and distance sliders to that preset.
function ringPreset() {
  const pre = RING_PRESETS[state.ringMode];
  if (pre) Object.assign(state, { ringInner: pre.inner, ringWidth: pre.width });
}

/** The shared loop from the loop controls (whole turns, a period of at least 1 s). */
export function setLoop({ period, surfaceTurns, cloudTurns }) {
  LOOP.period = Math.max(1, period);
  LOOP.surfaceTurns = Math.max(1, Math.round(surfaceTurns));
  LOOP.cloudTurns = Math.max(0, Math.round(cloudTurns));
}

/** Depth-fade uniforms for every fading material, for the active palette. True when objects must retint
 *  (the switch between object and per-pixel modes: pixel modes keep level-0 ramps). */
export function applyDepth({ depth, depthMode, depthBands }) {
  const pixelDepth = depthMode !== 'object';
  DEPTH_U.uDepthMode.value = depth ? DEPTH_MODES.indexOf(depthMode) : 0;
  const bands = DEPTH_BANDS[depthBands];
  const from = bandThresholds(bands);
  const levels = from.length + 1;
  DEPTH_U.uDepthLevels.value = levels;
  DEPTH_U.uDepthFrom.value.forEach((_, i, a) => (a[i] = from[i] ?? 1e9));
  const pal = PALETTES[paletteName];
  ['planet', 'crew'].forEach((_, f) => {
    for (let l = 0; l < levels; l++) {
      // the palette's 4 steps, interpolated onto this preset's levels (exact for 3-band)
      const x = (l / (levels - 1)) * 3, i = Math.min(2, Math.floor(x)), u = x - i;
      const c = new THREE.Color(pal.depth[i][0]).lerp(new THREE.Color(pal.depth[i + 1][0]), u);
      DEPTH_U.uDepthTint.value[f * MAX_LEVELS + l].set(c.r, c.g, c.b, pal.depth[i][1] + (pal.depth[i + 1][1] - pal.depth[i][1]) * u);
    }
  });
  const changed = pixelDepth !== lastPixelDepth;
  lastPixelDepth = pixelDepth;
  return changed;
}

/** An object's depth level (object mode) at camera distance d; 0 in the per-pixel modes or with the fade off. */
export const depthLevelAt = (d, { depth, depthMode }) => (!depth || depthMode !== 'object' ? 0 : DEPTH_RANGES.filter((r) => d >= r).length);

/** Poses planets and astronauts at time t (s) on the shared loop, as the viewer's frame does. */
export function poseWorld(t, { planets: ps = [], astronauts = [], spin = true, lavaTime = null }) {
  const wrap = (s) => (((s / LOOP.period) % 1) + 1) % 1;
  const phase = wrap(t);
  const lavaPhase = lavaTime == null ? (spin ? phase : 0) : wrap(lavaTime);
  ps.forEach((p) => p.update(spin ? phase : 0, lavaPhase));
  astronauts.forEach((a) => a.update(t));
}

function applyState() {
  setLoop(state);
  const art = { artefacts: !state.artefacts ? 0 : state.artAuto ? 'auto' : state.artCount, teal: state.artTeal, cloudShadow: state.cloudShadow, regions: state.regions, artDebug: state.artDebug, lavaMode: state.lavaMode };
  document.getElementById('art-auto').checked = state.artAuto;
  planets.forEach((p, i) => p.setExtras({ moons: i === 0 && state.moons, halo: state.halo, ...art }));
  SYSTEM.forEach((p, i) => p.setExtras({ moons: i === 0 && state.moons, halo: state.halo, ...art }));
  controls.minDistance = minOrbit();
  planets.forEach((p) => p.rebuild(state.seed, state.biome, state.ringMode, state.cover, { inner: state.ringInner, width: state.ringWidth }, state.size));
  // Which objects a view shows: showcase (hero + depth copies + crew), solo planet, or the system.
  const sceneMode = VIEWS[state.view]?.scene ?? 'showcase';
  planets.forEach((p, i) => (p.group.visible = sceneMode === 'showcase' || (sceneMode === 'solo' && i === 0)));
  SYSTEM.forEach((p) => (p.group.visible = sceneMode === 'system'));
  crew.forEach((a) => (a.group.visible = sceneMode !== 'solo'));
  solos.forEach((a) => (a.group.visible = sceneMode === 'showcase'));
  if (usePalette(state.palette)) retint(scene); // force a re-tint
  renderer.setClearColor(resolve('space'));
  // Per-pixel depth: the same thresholds and per-level tints/strengths as the object fade.
  if (applyDepth(state)) retint(scene); // re-tint: pixel modes keep level-0 ramps
  document.body.style.background = resolve('space');
  solos.forEach((s) => s.setColor(state.color));
  // Faces: hashed from each contributor's handle unless the UI overrides the eye design.
  for (const a of [...crew, ...solos]) {
    a.setFace(state.eyes === 'auto' ? eyesFor(HANDLES[a.userData.color ?? state.color]) : +state.eyes);
  }
  document.getElementById('ui').hidden = !state.ui;
  for (const [id, key] of [['ring-width', 'ringWidth'], ['ring-inner', 'ringInner']]) {
    document.getElementById(id).value = Math.round(state[key] * 100);
    document.getElementById(id).disabled = state.ringMode === 'off';
    document.getElementById(`${id}-readout`).textContent = state[key].toFixed(2);
  }
  const weather = WEATHER[BIOMES[state.biome].weather];
  const cov = document.getElementById('cover');
  cov.disabled = !weather;
  cov.value = Math.round((state.cover ?? weather?.cover ?? 0) * 100);
  document.getElementById('cover-readout').textContent = weather ? `${cov.value}%` : '—';
  resize();
}

const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
function frame() {
  const t = state.time ?? clock.getElapsedTime();
  controls.update();
  stars.position.copy(camera.position);
  poseWorld(t, { planets: [...planets, ...SYSTEM], astronauts: [...crew, ...solos], spin: state.spin, lavaTime: state.lavaTime });
  setDepthLevel(stars, 0); // stars and sky never fade, but still follow palette switches
  setDepthLevel(sky, 0);
  for (const obj of [...planets, ...SYSTEM, ...crew, ...solos].map((o) => o.group)) {
    setDepthLevel(obj, depthLevelAt(camera.position.distanceTo(obj.getWorldPosition(tmp)), state));
  }
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- UI
function bindUi() {
  const $ = (id) => document.getElementById(id);
  for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => { state.view = b.dataset.view; applyView(state.view); applyState(); });
  $('seed').addEventListener('input', (e) => { state.seed = +e.target.value; $('seed-readout').textContent = state.seed; applyState(); });
  $('reseed').addEventListener('click', () => { state.seed = 1 + Math.floor(Math.random() * 999); $('seed').value = state.seed; $('seed-readout').textContent = state.seed; applyState(); });
  $('ring').addEventListener('change', (e) => { state.ringMode = e.target.value; ringPreset(); applyState(); });
  for (const [id, key] of [['ring-width', 'ringWidth'], ['ring-inner', 'ringInner']]) {
    const [lo, hi] = RING[key === 'ringWidth' ? 'width' : 'inner'];
    Object.assign($(id), { min: lo * 100, max: hi * 100, value: state[key] * 100 });
    $(id).addEventListener('input', (e) => { state[key] = +e.target.value / 100; applyState(); });
  }
  for (const [key, b] of Object.entries(BIOMES)) $('biome').add(new Option(b.label, key));
  $('biome').addEventListener('change', (e) => { state.biome = e.target.value; state.cover = null; applyState(); });
  $('cover').addEventListener('input', (e) => { state.cover = +e.target.value / 100; applyState(); });
  $('size').addEventListener('input', (e) => { state.size = +e.target.value / 100; $('size-readout').textContent = state.size.toFixed(2); applyState(); });
  $('color').addEventListener('change', (e) => { state.color = e.target.value; applyState(); });
  $('pixel').addEventListener('input', (e) => { state.pixelH = +e.target.value; applyState(); });
  $('depth').addEventListener('change', (e) => { state.depth = e.target.checked; applyState(); });
  for (const m of DEPTH_MODES) $('depth-mode').add(new Option(m, m));
  $('depth-mode').value = state.depthMode;
  $('depth-mode').addEventListener('change', (e) => { state.depthMode = e.target.value; applyState(); });
  for (const m of LAVA_MODES) $('lava-mode').add(new Option(m, m));
  $('lava-mode').value = state.lavaMode;
  $('lava-mode').addEventListener('change', (e) => { state.lavaMode = e.target.value; applyState(); });
  for (const b of Object.keys(DEPTH_BANDS)) $('depth-bands').add(new Option(b, b));
  $('depth-bands').value = state.depthBands;
  $('depth-bands').addEventListener('change', (e) => { state.depthBands = e.target.value; applyState(); });
  $('spin').addEventListener('change', (e) => { state.spin = e.target.checked; });
  $('palette').addEventListener('change', (e) => { state.palette = e.target.value; applyState(); });
  $('moons').addEventListener('change', (e) => { state.moons = e.target.checked; applyState(); });
  $('halo').addEventListener('change', (e) => { state.halo = e.target.checked; applyState(); });
  $('artefacts').addEventListener('change', (e) => { state.artefacts = e.target.checked; applyState(); });
  $('art-count').addEventListener('input', (e) => { state.artCount = +e.target.value; state.artAuto = false; $('art-count-readout').textContent = state.artCount; applyState(); });
  $('art-auto').addEventListener('change', (e) => { state.artAuto = e.target.checked; applyState(); });
  $('art-teal').addEventListener('change', (e) => { state.artTeal = e.target.checked; applyState(); });
  $('period').addEventListener('change', (e) => { state.period = +e.target.value || 24; applyState(); });
  $('surface-turns').addEventListener('change', (e) => { state.surfaceTurns = +e.target.value || 1; applyState(); });
  $('cloud-turns').addEventListener('change', (e) => { state.cloudTurns = +e.target.value; applyState(); });
  $('cloud-shadow').addEventListener('change', (e) => { state.cloudShadow = e.target.checked; applyState(); });
  const fill = (sel, items, label) => items.forEach((v, i) => sel.add(new Option(label(v), String(i))));
  fill($('eyes'), EYE_DESIGNS, (d) => d.name);
  // Published palettes: the 25 contact-sheet picks, then the spares.
  for (const [label, slugs] of [['lospec (contact sheet)', LOSPEC_ORDER], ['lospec (spares)', SPARES]]) {
    const group = document.createElement('optgroup');
    group.label = label;
    slugs.forEach((slug, i) => group.append(new Option(`${label.includes('sheet') ? `${String(i + 1).padStart(2, '0')} ` : ''}${LOSPEC[slug].name}`, `lospec:${slug}`)));
    $('palette').append(group);
  }
  $('eyes').addEventListener('change', (e) => { state.eyes = e.target.value; applyState(); });
  addEventListener('resize', resize);
}

if (!LIBRARY) {
  renderer.setAnimationLoop(frame);
  bindUi();
  applyView(state.view);
  applyState();
  document.getElementById('palette').value = state.palette;
}

// Hook for the screenshot script: set state, pin time, render one frame synchronously. (Not in library mode.)
if (!LIBRARY) window.viewer = {
  ready: true,
  set(opts) {
    Object.assign(state, opts);
    if (opts.ringMode && opts.ringInner === undefined && opts.ringWidth === undefined) ringPreset(); // a ring mode alone means its preset
    if (opts.view) applyView(opts.view);
    if (opts.camera) {
      camera.position.set(...opts.camera.pos);
      controls.target.set(...opts.camera.target);
      controls.update();
    }
    applyState();
    frame();
    frame(); // second pass so depth tints set during the first one are drawn
  },
};

// Internals for the comparison mockups (../camera-modes, ../day2-compare), which pose the camera, hide objects and wrap the render passes.
if (!LIBRARY) window.viewer.internals = { renderer, scene, camera, controls, sky, stars, state, frame, SYSTEM, planets, crew, solos };
