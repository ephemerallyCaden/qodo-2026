// The fog lab's looks: every direction but D2d (A-E, A2, D, D2a-D2c, D2e), and D2d before its last two
// fixes for their before/afters (D2d-warm: before the cool veil; D2d-haze: before its haze was
// fogged), registered into the asset
// viewer's fog (../asset-viewer/fog.js registerFogLook), so they all draw through the viewer's one
// shader path: its grid search, event fronts, pulse, cell texture and uniforms. D2d, the human's pick,
// is the viewer's own look. The GLSL below is the lab's, unchanged since the pick; it uses the
// viewer's fog helpers (fogTex, fstep, fogInk, fogScreen, fogGlyph, fogOutline, FOG_QMARK) and the
// planet shader's surface(), band(), snoise(), aluma(), ah(), rotY() and invL().
//
// The filter rule (§9): these looks only ever show the planet's own colours (fstep() moves a colour
// along the ramp it came from; C and D resample the terrain), except D2e's dark veil, which mixes
// toward space as D2d does.
import { registerFogLook, fogSpec as viewerFogSpec, fogLookIds, glsl, mask } from '../asset-viewer/fog.js';
import { GLYPHS, LUMA_SET, REASON_SET } from './glyphs.js';
import { SURFACE_CELLS } from './surface.js';

export { FRONT, QMARK_CELLS, DARK, LIMB_PX, FOG_WINDOW } from '../asset-viewer/fog.js';
/** D2's hatching: line spacing (px, along x) and dash (on, period) per strength, and hatch periods drifted per loop. */
export const HATCH = { b: { spacing: 6, on: 10, period: 10 }, c: { spacing: 9, on: 4, period: 10 }, cycles: 2 };
/** Ambient ticks per loop (A's glyph shimmer). Every per-cell rate below divides it, so the loop is seamless. */
export const FOG_TICKS = 48;
/** Mean spacing of neighbouring cell centres on the unit sphere: sqrt(4 pi / n). */
const SPACING = Math.sqrt((4 * Math.PI) / SURFACE_CELLS);
const masks = (names) => names.map((n) => mask(GLYPHS[n])).join(', ');
import { DARK, QMARK_CELLS, LIMB_PX } from '../asset-viewer/fog.js';

const LAB_GLSL = /* glsl */ `
  uniform int uFogReasons;         // 1: A's glyph follows the fog reason
  const int FOG_LUMA[4] = int[4](${masks(LUMA_SET)});
  const int FOG_REASON[6] = int[6](${masks(REASON_SET)});
  const int FOG_DOT = ${mask(GLYPHS.dot)};
  const int FOG_RATES[4] = int[4](4, 6, 8, 12); // ticks between a cell's shimmer rolls; each divides ${FOG_TICKS}
  // A: the glyph field. One glyph per fogged grid cell, at the cell's projected centre: the ink two
  // steps lighter than the terrain, on a ground one step darker, so the glyphs pop while the area's
  // mean lightness stays near the terrain's (the band reads through: three steps darker hid the
  // ash band's lightness and read it as toxic). The glyph follows the terrain's luminance (or, with
  // uFogReasons, the reason) and a few swap on slow loop-locked ticks. Too small to hold a glyph
  // (cells under 5.5 px apart): a dot per cell; at the limb, ground only.
  vec3 fogA(vec3 c, int i, vec4 st, bool thin) {
    vec3 ground = fstep(c, -1), ink = fstep(c, 2);
    if (abs(aluma(ink) - aluma(ground)) < 0.08) ink = fstep(c, 3); // dark ramps (toxic sludge, lava crust) need a third step
    if (abs(aluma(ink) - aluma(ground)) < 0.08) ink = fstep(c, -3); // the top of a ramp (ice white): darker ink
    float k = max(1.0, floor(uViewSize.y / 180.0 + 0.5));
    float spacing = ${glsl(SPACING)} * gRadiusPx;
    float g = max(k, floor(spacing / 9.0));
    float facing;
    vec2 s = fogScreen(fogTex(i, 2).xyz, facing);
    if (facing < 0.3) return ground;
    int m = FOG_DOT;
    if (!thin && spacing >= 5.5 * k) {
      float h = ah(vec2(float(i), 7.3));
      int lum = int(clamp(floor(aluma(c) * 4.0 / 0.85), 0.0, 3.0));
      int rate = FOG_RATES[int(h * 4.0)];
      int tick = int(floor(uFogPhase * ${FOG_TICKS}.0 + 1e-4)) % ${FOG_TICKS};
      // each cell rolls on its own offset (rolls never bunch on one tick), periodic in the loop's ticks
      int roll = ((tick + int(ah(vec2(float(i), 3.7)) * float(rate))) / rate) % (${FOG_TICKS} / rate);
      if (ah(vec2(float(i), float(roll) + 0.5)) > 0.85) lum = clamp(lum + (h > 0.5 ? 1 : -1), 0, 3);
      m = uFogReasons == 1 ? FOG_REASON[int(st.y)] : FOG_LUMA[lum];
    }
    return fogGlyph(m, s, g) ? ink : ground;
  }
  // B: unlit. The terrain two steps darker, as if unsurveyed land were out of the light; lava's glow
  // dims one step on its own ramp, so a fogged lava world still glows. No ambient motion.
  vec3 fogB(vec3 c, bool thin) {
    return fstep(c, fogGlow(c) ? -1 : thin ? -1 : -2);
  }
  // C: unrendered. The terrain resampled on a coarse object-space lattice (tiles about 10 px across,
  // and never more than a third of the radius, so a far disc keeps some structure), each tile flat
  // and lit by its own centre, like a low-resolution pass not yet refined. The thin zone is the next
  // refinement (tiles half the size).
  vec3 fogC(vec3 p, int b, bool thin) {
    float Q = max(3.0, floor(gRadiusPx / 10.0)) * (thin ? 2.0 : 1.0);
    vec3 pq = normalize((floor(p * Q) + 0.5) / Q);
    int bp = band(normalize(mat3(modelMatrix) * p));
    int bt = clamp(band(normalize(mat3(modelMatrix) * pq)) + (b - bp), 0, 3);
    return surface(pq, bt);
  }
  // D: survey parcels, like a map: each grid cell flat in the terrain colour at its centre (lit per
  // pixel, so the terminator stays), a step darker, and each fogged file's footprint outlined by a
  // 2 px line a step lighter (the edge between two files, or between fog and clear ground). You see
  // the parcels and their colour, not their detail. The thin zone is the lines alone.
  vec3 fogD(vec3 c, int b, int i, vec4 st, float a1, int i2, float a2, bool thin) {
    vec4 st2 = fogTex(i2, 0);
    bool otherFile = st2.z != st.z, otherClear = st2.x < 0.5;
    float edgePx = (a2 - a1) * 0.5 / gPx;
    vec3 fc = thin ? c : surface(fogTex(i, 2).xyz, b);
    vec3 ground = thin ? c : fstep(fc, -1);
    if ((otherFile && edgePx < 1.0) || (otherClear && edgePx < 2.0)) return fogInk(fc, ground);
    return ground;
  }
  // D2: D's parcels with the terrain's detail gone, in three strengths of "unseen" (level 1-3).
  //   1 D2a blank map: each fogged file's parcel is one flat tone, the ramp of the ground under the
  //     file's own cell, shaded only by the light band as plain ground is (so a parcel is one or two
  //     tones; molten ground smoulders in the glow's darkest step). Continents, cracks, craters, dunes
  //     and artefacts are gone; clouds and their shadows still pass over. The band's hue and lightness
  //     stay: every parcel is a sample of the band's own ground at its own light, never a darker ramp.
  //   2 D2b terra incognita: D2a plus sparse diagonal hatching (§9's back and forward slashes, per
  //     parcel) a step darker on the same ramp, anchored at the parcel's projected centre and drifting
  //     HATCH.cycles periods per loop.
  //   3 D2c veiled: D2b with the light softened to two steps (lit, and the night side), sparser
  //     hatching, the outline one step lighter only, and a single "?" on half the big parcels.
  // The outline is D's: 2 px at the edge between files and between fog and clear ground.
  vec3 fogD2(vec3 c, int b, int i, vec4 st, float a1, int i2, float a2, bool thin, int level) {
    if (thin) return fogD(c, b, i, st, a1, i2, a2, true);
    vec3 own = fogTex(int(st.z), 2).xyz;
    vec3 s = surface(own, 2); // the ground under the file's own cell, in full light
    int r = -1, k = 0;
    for (int q = 0; q < 4; q++) for (int j = 0; j < 5; j++) if (r < 0 && j < (q == 3 ? 3 : 5) && fogRamp(q, j) == s) { r = q; k = j; }
    if (r < 0) return fstep(c, -1);
    int lb = level == 3 ? (b >= 1 ? 2 : 1) : b;
    // glow is unlit, and smoulders: a parcel over molten ground takes the glow ramp's darkest step,
    // so fog never makes lava look hotter than it is (a sampled yellow or orange would fill the parcel)
    vec3 tone = r == 3 ? uG[0] : fogRamp(r, clamp(k + lb - 2, 0, 4));
    if (fogOutline(st, a1, i2, a2)) {
      if (level == 3) return fstep(tone, 1);
      vec3 ink = fstep(tone, 1);
      if (abs(aluma(ink) - aluma(tone)) < 0.06) ink = fstep(tone, 2);
      if (abs(aluma(ink) - aluma(tone)) < 0.06) ink = fstep(tone, -2);
      return ink;
    }
    if (level == 1) return tone;
    float facing;
    vec2 s0 = fogScreen(own, facing);
    float kp = max(1.0, floor(uViewSize.y / 180.0 + 0.5));
    vec2 rel = (floor(vec2(gl_FragCoord.x, uViewSize.y - gl_FragCoord.y)) - floor(s0)) / kp;
    if (level == 3 && fogTex(i, 1).z >= ${glsl(QMARK_CELLS)} && ah(vec2(st.z, 4.1)) > 0.5 && facing > 0.5) {
      ivec2 lp = ivec2(floor(rel)) + 2;
      if (lp.x >= 0 && lp.y >= 0 && lp.x < 5 && lp.y < 5) return ((FOG_QMARK >> (lp.y * 5 + lp.x)) & 1) == 1 ? fstep(tone, 1) : tone;
    }
    bool back = ah(vec2(st.z, 1.3)) > 0.5; // back or forward slash, per parcel
    float u = floor(back ? rel.x - rel.y : rel.x + rel.y), v = floor(back ? rel.x + rel.y : rel.x - rel.y);
    float spacing = level == 3 ? ${glsl(HATCH.c.spacing)} : ${glsl(HATCH.b.spacing)};
    float on = level == 3 ? ${glsl(HATCH.c.on)} : ${glsl(HATCH.b.on)}, period = ${glsl(HATCH.b.period)};
    float drift = floor(uFogPhase * ${glsl(HATCH.cycles)} * spacing);
    bool hatch = mod(u + drift, spacing) < 0.5 && mod(v + floor(ah(vec2(st.z, 7.7)) * period), period) < on;
    return hatch ? fstep(tone, -1) : tone;
  }
  // D2d and D2e: D2c's parcels under a dark veil (level 1 D2d, 2 D2e). The human asked for fog that's
  // unmistakably hidden, so these break the filter rule on purpose: a parcel is its ramp's darkest
  // step mixed toward the space colour (DARK.lit, or DARK.night on the night side), a new colour.
  // The hatching (D2c's) is faint, a little less veiled; the "?" is the ramp's middle step, so it
  // shows. D2d's outline is dim (DARK.line), and its fogged limb (LIMB_PX) is the halo colour, one step
  // above space, so the silhouette holds. D2e's outline is the middle step of the band's own ramp
  // (index 2, or 3 where that's too dark to read; lava's crust and toxic's sludge have no hue there,
  // so lava takes the glow body and toxic its rust ground), so the band reads from the parcel edges
  // while the area stays hidden. The middle step keeps toxic's edges a dull rust, apart from lava's
  // bright, emissive orange: bright rust on black read as lava cracks.
  vec3 fogDark(vec3 p, vec3 c, int b, int i, vec4 st, float a1, int i2, float a2, bool thin, int level) {
    if (thin) return fogD(c, b, i, st, a1, i2, a2, true);
    if (level == 1) {
      // the limb: px from the silhouette here, from the angle between the surface and the view
      vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz;
      float f = dot(normalize(mat3(modelMatrix) * p), normalize(cameraPosition - wp));
      if (gRadiusPx * (1.0 - sqrt(max(0.0, 1.0 - f * f))) < ${glsl(LIMB_PX)}) return uFogRim;
    }
    vec3 own = fogTex(int(st.z), 2).xyz;
    vec3 s = surface(own, 2);
    int r = -1, k = 0;
    for (int q = 0; q < 4; q++) for (int j = 0; j < 5; j++) if (r < 0 && j < (q == 3 ? 3 : 5) && fogRamp(q, j) == s) { r = q; k = j; }
    if (r < 0) return mix(c, uFogSpace, ${glsl(DARK.lit)});
    vec3 r0 = r == 3 ? uG[0] : fogRamp(r, 0);
    vec3 veil = mix(r0, uFogSpace, b >= 1 ? ${glsl(DARK.lit)} : ${glsl(DARK.night)});
    if (fogOutline(st, a1, i2, a2)) {
      if (level == 1) return mix(r0, uFogSpace, ${glsl(DARK.line)});
      vec3 e = r == 3 ? uG[1] : fogRamp(r, 2);
      if (aluma(e) < 0.3) e = fogRamp(r, 3);
      if (aluma(e) < 0.3) e = uBiome == 4 ? uG[1] : fogRamp(1, 2);
      return e;
    }
    float facing;
    vec2 s0 = fogScreen(own, facing);
    float kp = max(1.0, floor(uViewSize.y / 180.0 + 0.5));
    vec2 rel = (floor(vec2(gl_FragCoord.x, uViewSize.y - gl_FragCoord.y)) - floor(s0)) / kp;
    if (fogTex(i, 1).z >= ${glsl(QMARK_CELLS)} && ah(vec2(st.z, 4.1)) > 0.5 && facing > 0.5) {
      ivec2 lp = ivec2(floor(rel)) + 2;
      if (lp.x >= 0 && lp.y >= 0 && lp.x < 5 && lp.y < 5) return ((FOG_QMARK >> (lp.y * 5 + lp.x)) & 1) == 1 ? (r == 3 ? uG[1] : fogRamp(r, 2)) : veil;
    }
    bool back = ah(vec2(st.z, 1.3)) > 0.5;
    float u = floor(back ? rel.x - rel.y : rel.x + rel.y), v = floor(back ? rel.x + rel.y : rel.x - rel.y);
    float spacing = ${glsl(HATCH.c.spacing)}, on = ${glsl(HATCH.c.on)}, period = ${glsl(HATCH.c.period)};
    float drift = floor(uFogPhase * ${glsl(HATCH.cycles)} * spacing);
    bool hatch = mod(u + drift, spacing) < 0.5 && mod(v + floor(ah(vec2(st.z, 7.7)) * period), period) < on;
    return hatch ? mix(r0, uFogSpace, ${glsl(DARK.hatch)}) : veil;
  }
  // E: mist. Streaks of the terrain's lighter steps (one, or two in the thick of it) hugging the
  // ground and drifting west, one turn per loop against the surface (clouds drift east). Lava's glow
  // shows through unchanged.
  vec3 fogE(vec3 p, vec3 c, bool thin) {
    if (fogGlow(c)) return c; // mist doesn't brighten light the planet makes (lava would read hotter)
    vec3 q = rotY(p, uFogPhase * 6.2831853);
    float m = snoise(vec3(q.x * 2.2, q.y * 6.5, q.z * 2.2) + 7.3) * 0.65 + snoise(q * 5.0 + 2.1) * 0.35;
    if (thin) return m > 0.15 ? fstep(c, 1) : c;
    return fstep(c, m > 0.15 ? 2 : 1);
  }
  // A2: A's glyph field, each fogged file outlined as in D (the outline in A's ink)
  vec3 fogA2(vec3 c, int i, vec4 st, float a1, int i2, float a2, bool thin) {
    if (!thin && fogOutline(st, a1, i2, a2)) { vec3 g = fstep(c, -1), k = fstep(c, 2); if (abs(aluma(k) - aluma(g)) < 0.08) k = fstep(c, 3); if (abs(aluma(k) - aluma(g)) < 0.08) k = fstep(c, -3); return k; }
    return fogA(c, i, st, thin);
  }
`;

// The same looks on a moon (one test file, whole), on its own 4-tone ramp. A2's moon has always been
// drawn in E's moon look here (the lab's moon dispatch fell through to E), and still is.
const MOON_GLSL = /* glsl */ `
  const int MOON_GLYPH = ${mask(GLYPHS.ring)};
  vec3 moonA(vec3 p, int b, vec3 c, bool thin, float px, vec3 ground, vec3 ink) {
    // one glyph at the moon's projected centre, or ground only on a small moon
    vec4 w = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0), clip = projectionMatrix * viewMatrix * w;
    vec2 sc = vec2(clip.x / clip.w + 1.0, 1.0 - clip.y / clip.w) * 0.5 * uViewSize;
    vec2 fp = floor(vec2(gl_FragCoord.x, uViewSize.y - gl_FragCoord.y));
    float k = max(1.0, floor(uViewSize.y / 180.0 + 0.5));
    ivec2 lp = ivec2(floor((fp - floor(sc)) / k)) + 2;
    bool big = length(mat3(modelMatrix) * vec3(1.0, 0.0, 0.0)) * projectionMatrix[1][1] / -(viewMatrix * w).z * uViewSize.y * 0.5 >= 3.5 * k;
    bool on = !thin && big && lp.x >= 0 && lp.y >= 0 && lp.x < 5 && lp.y < 5 && ((MOON_GLYPH >> (lp.y * 5 + lp.x)) & 1) == 1;
    return on ? ink : ground;
  }
  vec3 moonC(vec3 p, bool thin) { vec3 pq = normalize(floor(p * (thin ? 2.0 : 1.0)) + 0.5); return uRamp[clamp(band(normalize(mat3(modelMatrix) * pq)), 0, 3)]; }
  vec3 moonD2(vec3 p, int b, vec3 c, bool thin, float px, int level) {
    int lb = level == 3 ? (b >= 1 ? 2 : 1) : b;
    vec3 tone = thin ? c : uRamp[clamp(lb, 0, 3)];
    if (abs(p.y) / px < 1.0) return mstep(tone, 1) == tone ? mstep(tone, -1) : mstep(tone, 1);
    if (thin || level == 1) return tone;
    vec2 fq = floor(vec2(gl_FragCoord.x, uViewSize.y - gl_FragCoord.y)) / max(1.0, floor(uViewSize.y / 180.0 + 0.5));
    float spacing = level == 3 ? ${glsl(HATCH.c.spacing)} : ${glsl(HATCH.b.spacing)};
    return mod(floor(fq.x - fq.y) + floor(uFogPhase * ${glsl(HATCH.cycles)} * spacing), spacing) < 0.5 ? mstep(tone, -1) : tone;
  }
  vec3 moonDarkEdge(vec3 p, int b, vec3 c, bool thin, float px, vec3 ink) {
    if (thin) return (abs(p.y) / px < 1.0) ? ink : c;
    if (abs(p.y) / px < 1.0) return uRamp[3];
    return mix(uRamp[0], uFogSpace, b >= 1 ? ${glsl(DARK.lit)} : ${glsl(DARK.night)});
  }
  // D2d before the cool veil (D2d-warm): the moon's darkest step mixed toward space, as fogDark level 1
  vec3 moonDarkWarm(vec3 p, int b, vec3 c, bool thin, float px, vec3 ink) {
    if (thin) return (abs(p.y) / px < 1.0) ? ink : c;
    if (abs(p.y) / px < 1.0) return mix(uRamp[0], uFogSpace, ${glsl(DARK.line)});
    return mix(uRamp[0], uFogSpace, b >= 1 ? ${glsl(DARK.lit)} : ${glsl(DARK.night)});
  }
  vec3 moonE(vec3 p, vec3 c, bool thin) {
    float m = sin(p.y * 7.0 + p.x * 2.0 + uFogPhase * 6.2831853);
    return thin ? (m > 0.3 ? mstep(c, 1) : c) : mstep(c, m > 0.3 ? 2 : 1);
  }
`;

const LOOKS = [
  ['A', 'fogA(c, i, st, thin)', 'moonA(p, b, c, thin, px, ground, ink)'],
  ['B', 'fogB(c, thin)', 'mstep(c, thin ? -1 : -2)'],
  ['C', 'fogC(p, b, thin)', 'moonC(p, thin)'],
  ['D', 'fogD(c, b, i, st, a1, i2, a2, thin)', '((abs(p.y) / px < 1.0) ? ink : thin ? c : ground)'],
  ['E', 'fogE(p, c, thin)', 'moonE(p, c, thin)'],
  ['A2', 'fogA2(c, i, st, a1, i2, a2, thin)', 'moonE(p, c, thin)'],
  ['D2a', 'fogD2(c, b, i, st, a1, i2, a2, thin, 1)', 'moonD2(p, b, c, thin, px, 1)'],
  ['D2b', 'fogD2(c, b, i, st, a1, i2, a2, thin, 2)', 'moonD2(p, b, c, thin, px, 2)'],
  ['D2c', 'fogD2(c, b, i, st, a1, i2, a2, thin, 3)', 'moonD2(p, b, c, thin, px, 3)'],
  ['D2e', 'fogDark(p, c, b, i, st, a1, i2, a2, thin, 2)', 'moonDarkEdge(p, b, c, thin, px, ink)'],
  // D2d as the human picked it, before the cool veil (art direction §9): the ramp's darkest step mixed
  // toward space, which on lava's neighbours read as crust. Kept for the before/after (lab.mjs veil).
  ['D2d-warm', 'fogDark(p, c, b, i, st, a1, i2, a2, thin, 1)', 'moonDarkWarm(p, b, c, thin, px, ink)'],
  // D2d before its haze was fogged: the lit-limb haze (ocean, ice, toxic) still drawn over fogged
  // cells, a band-coloured rim. Kept for the before/after (lab.mjs haze).
  ['D2d-haze', 'fogVeil(p, c, b, i, st, a1, i2, a2, thin)', 'moonVeil(p, b, c, thin, px, ink)'],
];
LOOKS.forEach(([id, call, moonCall], k) => registerFogLook({ id, call, moonCall, glsl: k === 0 ? LAB_GLSL : '', moonGlsl: k === 0 ? MOON_GLSL : '' }));

/** The lab's directions in its order (variants.js); each is a registered look. */
export const DIRECTION_IDS = ['A', 'B', 'C', 'D', 'E', 'A2', 'D2a', 'D2b', 'D2c', 'D2d', 'D2e'];
for (const id of DIRECTION_IDS) if (!fogLookIds().includes(id)) throw new Error(`fog look ${id} isn't registered`);

/** A fog spec with every look, plus the lab's own uniform (A's per-reason glyphs). */
export const fogSpec = () => viewerFogSpec({ extra: { uFogReasons: { value: 0 } } });
