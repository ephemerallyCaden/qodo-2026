// Fog of war (R5): the look the human picked in the fog lab, D2d · dark veil, drawn through
// makePlanet({ fog }) (FOG_SPLICE in viewer.js), and the machinery any fog look shares: the per-pixel
// search of #18's surface grid, the event fronts and the planet-clear pulse, the cell texture and the
// uniforms, and driveFog(), which sets them for a planet at a time. The data (the grid, the territory
// rule, the fog state over time) is fog-layout.js.
//
// Per fragment: the nearest cell of the 256-cell grid (cell centres come from a data texture; only
// the cells whose y is within the grid's covering radius are searched), then that cell's state. A
// fogged cell draws the look. A cell whose file is being charted or refogged draws the event's front,
// measured from its footprint's anchor:
//   clear  a fast front out across the footprint: a 1 px [OIII] teal core (an event, so teal is
//          allowed), a 1.5 px inverted-lightness rim (the art direction's §9 wavefront), a band of
//          thin fog (the look's lines alone), then clear ground;
//   refog  a slow front closing in from the footprint's far edge: a billowing edge of thin fog, no rim
//          and no teal, so it reads as fog rolling back in, never as a glitch or a second charting.
// The planet-clear pulse (the landing moment) is the clear front's core and rim travelling once over
// the whole planet from the last file charted.
//
// D2d · dark veil (fogVeil): each fogged file's footprint is a parcel in a cool blue-plum veil (VEIL),
// so unread code is unmistakably hidden, and a fogged planet never reads as lava's warm-dark crust. Health deliberately doesn't
// read through fogged land ("you can't see the health of code you haven't reviewed"); it reads on
// charted land and in the planet's label. The parcel has faint drifting hatching, a dim outline (the
// human's fog-only exception to §3's no-outlines rule, in the planet's own darks, gone once the file
// is charted) and, on half the big parcels, a "?". Its limb is the halo colour, one step above space,
// so a fully fogged planet's silhouette never merges into space. The veil's mixes are new colours,
// the human's exception to the filter rule (§9); the only other colour fog adds is teal, on events.
// Fog sits on top of artefacts: an artefact sector in a fogged cell is fogged too.
//
// Other looks (the fog lab's A-E, A2, D, D2a-D2c, D2e) register through registerFogLook(), so every
// look draws through this one shader path; a planet's shader holds the looks registered when its
// spec was made, and uFogDir picks one.
import * as THREE from 'three';
import { SURFACE_CELLS, TEX_ROWS, COVER_256, stateAt, cellData, fibonacciCell, MOON_CHARTED_FROM, EVENT } from './fog-layout.js';
import { ACCENTS } from './planet-ramps.js';

/** Cells searched either side of p's latitude: 1.7 covering radii (the second-nearest cell too, for the outlines). */
export const FOG_WINDOW = Math.ceil((1.7 * COVER_256 * (SURFACE_CELLS - 1)) / 2) + 1;
/** Event front widths, px: the teal core, the inverted rim behind it, the thin-fog zone behind that, the refog's rolling edge. */
export const FRONT = { core: 1, rim: 2.5, thin: 7, roll: 5 };
/** The veil's hatching: line spacing (px, along x), dash (on, period) and hatch periods drifted per loop (loop-locked). */
export const HATCH = { spacing: 9, on: 4, period: 10, cycles: 2 };
/** The "?": only on a parcel of at least this many cells, and on half of those. */
export const QMARK_CELLS = 7;
/**
 * D2d's veil: cool blue-plum darks in the halo's hue (OKLab h -72°, chroma 0.075-0.085), as dark as
 * the band darks mixed 65% / 82% toward space were (L 0.21 lit, 0.17 night), but at least 0.06 from
 * every lava-crust colour and from space. A fogged planet reads cool-dark, never as lava's warm-dark
 * crust (a false worst-band signal), whatever its band. The hatching is a little lighter, the outline
 * between them, the "?" a mid lavender. New colours: the human's exception to the filter rule.
 */
export const VEIL = { night: '#110432', lit: '#190e3d', line: '#1e1740', hatch: '#221a46', mark: '#615999' };
/** The fog lab's D2e still mixes its band darks toward space by these amounts (lit, night, hatch, line). */
export const DARK = { lit: 0.65, night: 0.82, hatch: 0.42, line: 0.3 };
/** Fogged pixels within this many px of the planet's silhouette take the halo colour (one step above space). */
export const LIMB_PX = 2;

/** Bit mask of a 5x5 glyph: bit (y * 5 + x), y down, '#' = ink. */
export const mask = (rows) => rows.join('').split('').reduce((m, ch, i) => (ch === '#' ? m | (1 << i) : m), 0);
/** The parcel's "?", hand-drawn 5x5 (the fog lab's glyph set; none of the artefacts' bug glyphs). */
export const QMARK = ['.###.', '#...#', '..##.', '.....', '..#..'];

export const glsl = (x) => x.toFixed(4);
/** '#rrggbb' -> a GLSL vec3 literal (exact bytes: these colours reach the screen untouched, before the depth fade). */
const vec3Of = (hex) => `vec3(${[1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(6)).join(', ')})`;

// Uses PLANET_FRAG's surface(), band(), snoise(), gPx, gRadiusPx, uViewSize, uA/uB/uC/uG and uBiome,
// and artefacts.js's invL(), aluma() and ah().
const FOG_CORE = /* glsl */ `
  uniform int uFogOn;              // 0: fog() returns c untouched
  uniform int uFogDir;             // the look (registerFogLook order; 0 is D2d)
  uniform int uFogDebug;           // 1: stage colours (r rest, g thin, b rim/core); 2: cell ids
  uniform highp sampler2D uFogCells; // ${SURFACE_CELLS} x ${TEX_ROWS} RGBA float (fog-layout.js cellData)
  uniform float uFogPhase;         // the shared loop's phase, 0..1 (ambient drift: whole cycles per loop)
  uniform vec4 uFogPulse;          // the planet-clear pulse: xyz origin (planet frame), w progress (0: none)
  uniform vec3 uFogAcc[4];         // [OIII] teal, events only
  uniform vec3 uFogSpace;          // the space colour (the dark veil mixes toward it)
  uniform vec3 uFogRim;            // one step above space (the halo colour): the fogged limb
  const int FOG_N = ${SURFACE_CELLS}, FOG_WIN = ${FOG_WINDOW};
  const int FOG_QMARK = ${mask(QMARK)};
  const vec3 VEIL_NIGHT = ${vec3Of(VEIL.night)}, VEIL_LIT = ${vec3Of(VEIL.lit)}, VEIL_LINE = ${vec3Of(VEIL.line)}, VEIL_HATCH = ${vec3Of(VEIL.hatch)}, VEIL_MARK = ${vec3Of(VEIL.mark)};

  vec4 fogTex(int i, int row) { return texelFetch(uFogCells, ivec2(i, row), 0); }

  // The nearest grid cell to p, and the second nearest (angles in rad). The cells within the grid's
  // covering radius of p in angle are within it in y too, so only that index window is searched.
  int fogNearest(vec3 p, out float a1, out int i2, out float a2) {
    int i0 = int(floor((1.0 - p.y) * 0.5 * float(FOG_N - 1) + 0.5));
    float b1 = -2.0, b2 = -2.0;
    int i1 = 0;
    i2 = 0;
    for (int i = max(0, i0 - FOG_WIN); i <= min(FOG_N - 1, i0 + FOG_WIN); i++) {
      float d = dot(p, fogTex(i, 2).xyz);
      if (d > b1) { b2 = b1; i2 = i1; b1 = d; i1 = i; } else if (d > b2) { b2 = d; i2 = i; }
    }
    a1 = acos(clamp(b1, -1.0, 1.0));
    a2 = acos(clamp(b2, -1.0, 1.0));
    return i1;
  }

  vec3 fogRamp(int r, int i) { return r == 0 ? uA[i] : r == 1 ? uB[i] : r == 2 ? uC[i] : uG[min(i, 2)]; }
  // c moved k distinct steps along the ramp it came from (darker < 0 < lighter), stopping at the ends.
  // A colour in no ramp (an artefact's inverted cell) comes back unchanged.
  vec3 fstep(vec3 c, int k) {
    for (int r = 0; r < 4; r++) {
      int len = r == 3 ? 3 : 5;
      for (int i = 0; i < 5; i++) {
        if (i >= len || fogRamp(r, i) != c) continue;
        int j = i, s = k > 0 ? 1 : -1, left = abs(k);
        vec3 cur = c;
        for (int m = 0; m < 5; m++) {
          if (left == 0 || j + s < 0 || j + s >= len) break;
          j += s;
          if (fogRamp(r, j) != cur) { cur = fogRamp(r, j); left--; }
        }
        return cur;
      }
    }
    return c;
  }
  bool fogGlow(vec3 c) { return uBiome == 4 && (c == uG[0] || c == uG[1] || c == uG[2]); }
  // An ink colour that reads on the ground: a lighter step, two, or else a darker one.
  vec3 fogInk(vec3 c, vec3 ground) {
    vec3 ink = fstep(c, 1);
    if (abs(aluma(ink) - aluma(ground)) < 0.08) ink = fstep(c, 2);
    if (abs(aluma(ink) - aluma(ground)) < 0.08) ink = fstep(c, -3);
    return ink;
  }
  vec2 fogScreen(vec3 q, out float facing) {
    vec4 w = modelMatrix * vec4(q, 1.0);
    vec4 clip = projectionMatrix * viewMatrix * w;
    facing = dot(normalize(mat3(modelMatrix) * q), normalize(cameraPosition - w.xyz));
    return vec2(clip.x / clip.w + 1.0, 1.0 - clip.y / clip.w) * 0.5 * uViewSize;
  }
  // Whether this pixel is ink of glyph m, drawn screen-aligned at q's projected centre (snapped to a
  // whole pixel, so it stays crisp as it travels), in g px per glyph pixel.
  bool fogGlyph(int m, vec2 s, float g) {
    vec2 fp = floor(vec2(gl_FragCoord.x, uViewSize.y - gl_FragCoord.y));
    ivec2 lp = ivec2(floor((fp - floor(s)) / g)) + 2;
    return lp.x >= 0 && lp.y >= 0 && lp.x < 5 && lp.y < 5 && ((m >> (lp.y * 5 + lp.x)) & 1) == 1;
  }
  // Whether this pixel is on a fogged file's 2 px outline: 1 px either side of the edge between two
  // files, 2 px on the fogged side of the edge between fog and clear ground.
  bool fogOutline(vec4 st, float a1, int i2, float a2) {
    vec4 st2 = fogTex(i2, 0);
    float edgePx = (a2 - a1) * 0.5 / gPx;
    return (st2.z != st.z && edgePx < 1.0) || (st2.x < 0.5 && edgePx < 2.0);
  }
  // The thin fog the event fronts pass through: the parcel outlines alone, a step lighter, over the terrain.
  vec3 fogLines(vec3 c, vec4 st, float a1, int i2, float a2) {
    return fogOutline(st, a1, i2, a2) ? fogInk(c, c) : c;
  }

  // D2d · dark veil: the parcel is the cool veil (VEIL: lit, or night on the night side), whatever
  // the band under it; the outline and the faint hatching a little lighter; the "?" mid lavender; the
  // limb the halo colour.
  vec3 fogVeil(vec3 p, vec3 c, int b, int i, vec4 st, float a1, int i2, float a2, bool thin) {
    if (thin) return fogLines(c, st, a1, i2, a2);
    {
      // the limb: px from the silhouette here, from the angle between the surface and the view
      vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz;
      float f = dot(normalize(mat3(modelMatrix) * p), normalize(cameraPosition - wp));
      if (gRadiusPx * (1.0 - sqrt(max(0.0, 1.0 - f * f))) < ${glsl(LIMB_PX)}) return uFogRim;
    }
    vec3 own = fogTex(int(st.z), 2).xyz;
    vec3 veil = b >= 1 ? VEIL_LIT : VEIL_NIGHT;
    if (fogOutline(st, a1, i2, a2)) return VEIL_LINE;
    float facing;
    vec2 s0 = fogScreen(own, facing);
    float kp = max(1.0, floor(uViewSize.y / 180.0 + 0.5));
    vec2 rel = (floor(vec2(gl_FragCoord.x, uViewSize.y - gl_FragCoord.y)) - floor(s0)) / kp;
    if (fogTex(i, 1).z >= ${glsl(QMARK_CELLS)} && ah(vec2(st.z, 4.1)) > 0.5 && facing > 0.5) {
      ivec2 lp = ivec2(floor(rel)) + 2;
      if (lp.x >= 0 && lp.y >= 0 && lp.x < 5 && lp.y < 5) return ((FOG_QMARK >> (lp.y * 5 + lp.x)) & 1) == 1 ? VEIL_MARK : veil;
    }
    bool back = ah(vec2(st.z, 1.3)) > 0.5;
    float u = floor(back ? rel.x - rel.y : rel.x + rel.y), v = floor(back ? rel.x + rel.y : rel.x - rel.y);
    float spacing = ${glsl(HATCH.spacing)}, on = ${glsl(HATCH.on)}, period = ${glsl(HATCH.period)};
    float drift = floor(uFogPhase * ${glsl(HATCH.cycles)} * spacing);
    bool hatch = mod(u + drift, spacing) < 0.5 && mod(v + floor(ah(vec2(st.z, 7.7)) * period), period) < on;
    return hatch ? VEIL_HATCH : veil;
  }
`;

// The fronts and the dispatch to the look (uFogDir). Variables in scope for a look's call: p, b, c,
// i (the grid cell), st and the outline's a1, i2, a2, and thin (the front's thin-fog zone).
const fogMain = (looks) => /* glsl */ `
  vec3 fog(vec3 p, int b, vec3 c) {
    if (uFogOn == 0) return c;
    float a1, a2;
    int i2;
    int i = fogNearest(p, a1, i2, a2);
    vec4 st = fogTex(i, 0), ev = fogTex(i, 1);
    if (uFogDebug == 2) return vec3(float(i), st.z, st.x * 255.0) / 255.0;
    int stage = st.x > 0.5 ? 2 : 0; // 0 clear, 1 thin fog, 2 fog, 3 rim, 4 rim core (teal)
    if (ev.x > 0.5) {
      float d = acos(clamp(dot(p, fogTex(int(st.z), 2).xyz), -1.0, 1.0)), s = ev.y;
      if (ev.x < 1.5) {
        // clearing: out from the footprint's anchor, easing out, with a small fixed wobble
        float r = (st.w + ${glsl(FRONT.thin + FRONT.rim)} * gPx) * (1.0 - (1.0 - s) * (1.0 - s));
        float e = (r - d - snoise(p * 13.0 + 5.7) * 1.5 * gPx) / gPx; // px behind the front
        stage = e < 0.0 ? 2 : e < ${glsl(FRONT.core)} ? 4 : e < ${glsl(FRONT.rim)} ? 3 : e < ${glsl(FRONT.rim + FRONT.thin)} ? 1 : 0;
      } else {
        // refogging: in from the far edge, easing in and out, the edge billowing as it rolls
        float r = (st.w + ${glsl(FRONT.roll)} * gPx) * (1.0 - s * s * (3.0 - 2.0 * s));
        float e = (d + snoise(p * 7.0 + vec3(0.0, s * 3.0, 0.0)) * 4.0 * gPx - r) / gPx; // px outside the front
        stage = e < 0.0 ? 0 : e < ${glsl(FRONT.roll)} ? 1 : 2;
      }
    }
    if (uFogPulse.w > 0.0) {
      float s = uFogPulse.w;
      float e = (3.14159 * (1.0 - (1.0 - s) * (1.0 - s)) - acos(clamp(dot(p, uFogPulse.xyz), -1.0, 1.0))) / gPx;
      if (e >= 0.0 && e < ${glsl(FRONT.rim)}) stage = e < ${glsl(FRONT.core)} ? 4 : 3;
    }
    if (uFogDebug == 1) return vec3(stage == 2 ? 1.0 : 0.0, stage == 1 ? 1.0 : 0.0, stage >= 3 ? 1.0 : 0.0);
    if (stage == 0) return c;
    if (stage == 4) return uFogAcc[3];
    if (stage == 3) return invL(c);
    bool thin = stage == 1;
${looks.map((l, k) => `    if (uFogDir == ${k}) return ${l.call};`).join('\n')}
    return c;
  }
`;

// A moon is one test file: fogged or not, as a whole, in the look on the moon's own 4-tone ramp
// (uRamp), with the event fronts running from its north pole to its south.
const MOON_CORE = /* glsl */ `
  in vec3 vLocal;
  uniform mat4 modelMatrix;
  uniform mat4 projectionMatrix;
  uniform vec2 uViewSize;
  uniform int uFogOn;
  uniform int uFogDir;
  uniform int uFogDebug;
  uniform float uFogPhase;
  uniform vec4 uMoonFog;           // x fogged, y event kind (1 clear, 2 refog), z progress
  uniform vec3 uFogAcc[4];
  uniform vec3 uFogSpace;
  const vec3 VEIL_NIGHT = ${vec3Of(VEIL.night)}, VEIL_LIT = ${vec3Of(VEIL.lit)}, VEIL_LINE = ${vec3Of(VEIL.line)};
  vec3 mstep(vec3 c, int k) {
    for (int i = 0; i < 4; i++) {
      if (uRamp[i] != c) continue;
      int j = i, s = k > 0 ? 1 : -1, left = abs(k);
      vec3 cur = c;
      for (int m = 0; m < 4; m++) {
        if (left == 0 || j + s < 0 || j + s >= 4) break;
        j += s;
        if (uRamp[j] != cur) { cur = uRamp[j]; left--; }
      }
      return cur;
    }
    return c;
  }
  vec3 minvL(vec3 c) { float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)); return clamp(c + (1.0 - mx - mn), 0.0, 1.0); }
  float mluma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  // D2d on a moon: the cool veil, with D's equator line in the outline's tone.
  vec3 moonVeil(vec3 p, int b, vec3 c, bool thin, float px, vec3 ink) {
    if (thin) return (abs(p.y) / px < 1.0) ? ink : c;
    if (abs(p.y) / px < 1.0) return VEIL_LINE;
    return b >= 1 ? VEIL_LIT : VEIL_NIGHT;
  }
`;
// Variables in scope for a moon look's call: p, b, c, thin, px (sphere units per px), ground and ink.
const moonMain = (looks) => /* glsl */ `
  vec3 fog(vec3 p, int b, vec3 c) {
    if (uFogOn == 0) return c;
    vec3 dp = dFdx(p), dq = dFdy(p);
    float px = max(1e-4, max(length(dp), length(dq)));
    int stage = uMoonFog.x > 0.5 ? 2 : 0;
    float d = acos(clamp(p.y, -1.0, 1.0)), s = uMoonFog.z;
    if (uMoonFog.y > 0.5 && uMoonFog.y < 1.5) {
      float e = (3.2 * (1.0 - (1.0 - s) * (1.0 - s)) - d) / px;
      stage = e < 0.0 ? 2 : e < ${glsl(FRONT.core)} ? 4 : e < ${glsl(FRONT.rim)} ? 3 : e < ${glsl(FRONT.rim + FRONT.thin)} ? 1 : 0;
    } else if (uMoonFog.y > 1.5) {
      float e = (3.2 * (1.0 - s * s * (3.0 - 2.0 * s)) - (3.14159 - d)) / px;
      stage = e > ${glsl(FRONT.roll)} ? 0 : e > 0.0 ? 1 : 2;
    }
    if (uFogDebug == 1) return vec3(stage == 2 ? 1.0 : 0.0, stage == 1 ? 1.0 : 0.0, stage >= 3 ? 1.0 : 0.0);
    if (stage == 0) return c;
    if (stage == 4) return uFogAcc[3];
    if (stage == 3) return minvL(c);
    bool thin = stage == 1;
    vec3 ground = mstep(c, -1), ink = mstep(c, 1);
    if (abs(mluma(ink) - mluma(ground)) < 0.08) ink = mstep(c, -3);
${looks.map((l, k) => `    if (uFogDir == ${k}) return ${l.moonCall};`).join('\n')}
    return c;
  }
`;

// ---------------------------------------------------------------- looks
const LOOKS = [];
/**
 * Adds a fog look to every fog spec made from now on. look: { id, call, glsl?, moonCall, moonGlsl? }:
 * glsl defines the look's functions (after the core helpers), call is the GLSL expression fog()
 * returns for it; the same for moons. Returns its index (uFogDir). Registering an id twice is a no-op.
 */
export function registerFogLook(look) {
  const k = LOOKS.findIndex((l) => l.id === look.id);
  if (k >= 0) return k;
  LOOKS.push({ glsl: '', moonGlsl: '', ...look });
  return LOOKS.length - 1;
}
/** The uFogDir of a registered look (-1 if none). */
export const fogLookIndex = (id) => LOOKS.findIndex((l) => l.id === id);
export const fogLookIds = () => LOOKS.map((l) => l.id);
registerFogLook({ id: 'D2d', call: 'fogVeil(p, c, b, i, st, a1, i2, a2, thin)', moonCall: 'moonVeil(p, b, c, thin, px, ink)' });

// ---------------------------------------------------------------- specs and driving
/**
 * A fog spec for makePlanet({ fog }): the GLSL of every look registered so far, the uniforms of one
 * planet (shared by its surface and cloud shadow) and its two moons, and the cell texture. The caller
 * owns the uniform objects; driveFog() writes them. extra: more uniforms for registered looks.
 */
export function fogSpec({ extra = {} } = {}) {
  const data = new Float32Array(SURFACE_CELLS * TEX_ROWS * 4);
  const tex = new THREE.DataTexture(data, SURFACE_CELLS, TEX_ROWS, THREE.RGBAFormat, THREE.FloatType);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  const acc = { value: ACCENTS.reveal.map((h) => new THREE.Color(h)) };
  const shared = { uFogOn: { value: 0 }, uFogDir: { value: 0 }, uFogDebug: { value: 0 }, uFogPhase: { value: 0 }, uFogAcc: acc, uFogSpace: { value: new THREE.Color('#0d0b16') }, uFogRim: { value: new THREE.Color('#30285a') } };
  const uniforms = { ...shared, ...extra, uFogCells: { value: tex }, uFogPulse: { value: new THREE.Vector4(0, 1, 0, 0) } };
  const view = { value: new THREE.Vector2(320, 180) }; // the drawing-buffer size, for the moons (keep it in step with the viewer's)
  const moons = [0, 1].map(() => ({ ...shared, uViewSize: view, uMoonFog: { value: new THREE.Vector4() } }));
  const looks = [...LOOKS];
  return {
    glsl: FOG_CORE + looks.map((l) => l.glsl).join('\n') + fogMain(looks),
    uniforms,
    moon: { glsl: MOON_CORE + looks.map((l) => l.moonGlsl).join('\n') + moonMain(looks), uniforms: moons },
    data, tex, view, looks: looks.map((l) => l.id),
  };
}

const wrap = (x) => ((x % 1) + 1) % 1;
/**
 * Sets a planet's fog for time t. layout: { planet, foot } (fog-layout.js demoLayout, or the
 * product's settlements and footprint); coverage or fogged: which files are fogged at rest; events:
 * [{ file, kind: 'clear' | 'refog', at }]; moonEvents: [{ moon, kind, at }]; look: a registered id;
 * on: false draws the planet untouched; period: the shared loop (s). Returns the fog state at t.
 */
export function driveFog(spec, { layout, coverage = 0.5, fogged = null, events = [], moonEvents = [], t = 0, period = 24, look = 'D2d', on = true, debug = 0 }) {
  const U = spec.uniforms;
  U.uFogOn.value = on ? 1 : 0;
  U.uFogDir.value = Math.max(0, spec.looks.indexOf(look));
  U.uFogDebug.value = debug;
  U.uFogPhase.value = wrap(t / period);
  const st = stateAt(layout.planet, { coverage, fogged, events, t });
  spec.data.set(cellData(layout.planet, layout.foot, st));
  spec.tex.needsUpdate = true;
  if (st.pulse) {
    const anchor = layout.foot.anchor[layout.planet.files.findIndex((f) => f.id === st.pulse.file)];
    U.uFogPulse.value.set(...fibonacciCell(anchor, SURFACE_CELLS), Math.max(1e-4, st.pulse.progress));
  } else U.uFogPulse.value.w = 0;
  spec.moon.uniforms.forEach((u, i) => {
    const evs = moonEvents.filter((x) => x.moon === i).sort((p, q) => p.at - q.at);
    // a moon's state before its first event is that event's starting state (a clear starts fogged)
    let fog = evs.length ? (evs[0].kind === 'clear' ? 1 : 0) : coverage < MOON_CHARTED_FROM[i] ? 1 : 0, kind = 0, progress = 0;
    for (const e of evs) {
      const s = (t - e.at) / EVENT[e.kind];
      if (s < 0) continue;
      if (s < 1) [kind, progress] = [e.kind === 'clear' ? 1 : 2, s];
      else [fog, kind] = [e.kind === 'clear' ? 0 : 1, 0];
    }
    u.uMoonFog.value.set(kind ? 0 : fog, kind, progress, 0);
  });
  return st;
}
