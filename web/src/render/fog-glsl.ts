// Fog of war, drawn (R5, #74): D2d · dark veil, the look the human picked (art-direction §9,
// docs/features/fog-of-war-art.md F1–F8; ported from feature/fog-lab 69be694,
// mockups/asset-viewer/fog.js). Fog is drawn inside shaders that already run (the planet surface, its
// cloud shadow, the haze and the moons), so it adds no draw call and no triangle.
//
// Per fragment on a planet: the nearest and second-nearest cells of the planet's #18 grid (cell
// centres in a cells × 3 data texture; only the cells within 1.7 covering radii of the pixel's
// latitude are searched), then that cell's file (model/fog.ts cellRows):
// - fogged at rest: the veil. The parcel (the file's territory) is the darkest step of the ramp under
//   its anchor, mixed toward space (palette.fog.veil: the mixes are named palette roles, picked
//   here, never mixed on the GPU), with faint drifting `\ /` hatching, a dim 2 px parcel line (the
//   human's fog-only exception to the no-outlines rule) and, on half the big parcels, a hand-drawn
//   5×5 "?". Within 2 px of the silhouette it is the halo colour, so a fogged planet never merges
//   into space. Fog hides health on purpose: nothing of the terrain shows through.
// - clearing (an event): a front out from the parcel's anchor, with a 1 px [OIII] teal core (an
//   event, so teal is allowed), an inverted-lightness rim (§9's wavefront), then thin fog (the parcel
//   lines alone) and clear ground.
// - refogging: a slower front rolling in from the parcel's far edge, a billowing band of thin fog,
//   with no rim and no teal, so it never reads as a glitch or a second charting.
// - the planet-clear pulse: the clear front's core and rim travelling once over the whole planet.
// Clear and charted cells are the same "not fogged" bit, so they draw the same.
//
// This module is the GLSL and its constants only (no three.js), so shaders.ts can splice it in;
// fog.ts holds the uniforms, the cell texture and the moon attributes.
import { FOG_TEX_ROWS } from '../model/fog.js';

/** Event front widths, internal px: the teal core, the inverted rim behind it, the thin-fog band behind that, the refog's rolling edge. */
export const FRONT = { core: 1, rim: 2.5, thin: 7, roll: 5 } as const;
/** The veil's hatching: line spacing (px), dash on and period (px), and hatch spacings drifted per 24 s loop (whole cycles: loop-locked). */
export const HATCH = { spacing: 9, on: 4, period: 10, cycles: 2 } as const;
/** Fogged pixels within this many px of the planet's silhouette take the halo colour. */
export const LIMB_PX = 2;
/** The parcel's "?", hand-drawn 5×5 ('#' ink), from the fog lab's glyph set; none of the artefacts' bug glyphs. */
export const QMARK = ['.###.', '#...#', '..##.', '.....', '..#..'] as const;
/** Bit mask of a 5×5 glyph: bit (y × 5 + x), y down. */
export const glyphMask = (rows: readonly string[]): number => rows.join('').split('').reduce((m, ch, i) => (ch === '#' ? m | (1 << i) : m), 0);

const g4 = (x: number) => x.toFixed(4);

/** The grid search, shared by the surface, its cloud shadow and the haze. */
export const FOG_GRID = /* glsl */ `
  uniform int uFogOn;                // 0: nothing on this planet is fogged or changing
  uniform highp sampler2D uFogCells; // cells x ${FOG_TEX_ROWS} RGBA float (model/fog.ts cellRows)
  uniform int uFogN;                 // grid cells
  uniform int uFogWin;               // search window, cells either side of p's latitude index
  vec4 fogTex(int i, int row) { return texelFetch(uFogCells, ivec2(i, row), 0); }
  // The nearest grid cell to p and the second nearest, with their angles (rad).
  int fogNearest(vec3 p, out float a1, out int i2, out float a2) {
    int i0 = uFogN <= 1 ? 0 : int(floor((1.0 - p.y) * 0.5 * float(uFogN - 1) + 0.5));
    float b1 = -2.0, b2 = -2.0;
    int i1 = 0;
    i2 = 0;
    for (int i = max(0, i0 - uFogWin); i <= min(uFogN - 1, i0 + uFogWin); i++) {
      float d = dot(p, fogTex(i, 2).xyz);
      if (d > b1) { b2 = b1; i2 = i1; b1 = d; i1 = i; } else if (d > b2) { b2 = d; i2 = i; }
    }
    a1 = acos(clamp(b1, -1.0, 1.0));
    a2 = acos(clamp(b2, -1.0, 1.0));
    return i1;
  }
`;

/**
 * fog(p, b, c) for the planet surface and its cloud shadow: c, the body's colour at p (unit sphere,
 * the surface's own frame) in light band b, before the depth fade. Uses SURFACE's surface(), band
 * helpers, gPx, gGlow, gLavaV, the ramps uA..uG and uEye.
 */
export const FOG_SURFACE = /* glsl */ `
  ${FOG_GRID}
  uniform mat4 projectionMatrix;
  uniform float uFogPhase;      // the loop's phase, 0..1 (the hatch drift: whole cycles per loop)
  uniform vec2 uFogView;        // the internal target's size, px
  uniform vec4 uFogPulse;       // the planet-clear pulse: xyz origin (surface frame), w progress (0: none)
  uniform mat4 uFogModel;       // the surface's world matrix (the cloud shadow's own modelMatrix is the sky's)
  uniform float uFogRadiusPx;   // the planet's radius on screen, internal px
  uniform vec3 uFogVeil[16];    // per ramp uA, uB, uC, uG: the veil lit, night, hatch, line (palette.fog.veil)
  uniform vec3 uFogTeal;        // [OIII] teal, events only
  uniform vec3 uFogLimb;        // the halo colour: the fogged limb
  const int FOG_QMARK = ${glyphMask(QMARK)};

  vec3 fogRamp(int r, int i) { return r == 0 ? uA[i] : r == 1 ? uB[i] : r == 2 ? uC[i] : uG[min(i, 2)]; }
  int fogRampLen(int r) { return r == 3 ? 3 : 5; }
  // c moved k distinct steps along the ramp it came from (darker < 0 < lighter), stopping at the ends.
  vec3 fogStep(vec3 c, int k) {
    for (int r = 0; r < 4; r++) {
      for (int i = 0; i < 5; i++) {
        if (i >= fogRampLen(r) || fogRamp(r, i) != c) continue;
        int j = i, s = k > 0 ? 1 : -1, left = abs(k);
        vec3 cur = c;
        for (int m = 0; m < 5; m++) {
          if (left == 0 || j + s < 0 || j + s >= fogRampLen(r)) break;
          j += s;
          if (fogRamp(r, j) != cur) { cur = fogRamp(r, j); left--; }
        }
        return cur;
      }
    }
    return c;
  }
  float fogLuma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  // Inverted lightness (art-direction §9's filter rule): the event rim.
  vec3 fogInvL(vec3 c) { float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)); return clamp(c + (1.0 - mx - mn), 0.0, 1.0); }
  // An ink that reads on the ground: a lighter step, two, or else a darker one.
  vec3 fogInk(vec3 c) {
    vec3 ink = fogStep(c, 1);
    if (abs(fogLuma(ink) - fogLuma(c)) < 0.08) ink = fogStep(c, 2);
    if (abs(fogLuma(ink) - fogLuma(c)) < 0.08) ink = fogStep(c, -3);
    return ink;
  }
  // The ramp (0..3: uA, uB, uC, uG) of the ground at q, sampled at a fixed lava phase so a parcel's
  // tone never churns with the lava; the pixel's own glow flag and lava value are kept.
  int fogRampOf(vec3 q) {
    bool glow = gGlow;
    float v = gLavaV;
    gLavaV = 0.5;
    vec3 s = surface(q, 2);
    gGlow = glow;
    gLavaV = v;
    for (int r = 0; r < 4; r++) for (int i = 0; i < 5; i++) if (i < fogRampLen(r) && fogRamp(r, i) == s) return r;
    return 0;
  }
  // q's position on the internal target (px from the top-left), and how squarely it faces the eye.
  vec2 fogScreen(vec3 q, out float facing) {
    vec4 w = uFogModel * vec4(q, 1.0);
    vec4 clip = projectionMatrix * viewMatrix * w;
    facing = dot(normalize(mat3(uFogModel) * q), normalize(uEye - w.xyz));
    return vec2(clip.x / clip.w + 1.0, 1.0 - clip.y / clip.w) * 0.5 * uFogView;
  }
  // Whether this pixel is on a fogged file's 2 px parcel line: 1 px either side of the edge between
  // two files (told apart by their anchors), 2 px on the fogged side of an edge with clear ground.
  bool fogOutline(vec4 st, float a1, int i2, float a2) {
    vec4 st2 = fogTex(i2, 0);
    float edgePx = (a2 - a1) * 0.5 / gPx;
    return (st2.y != st.y && edgePx < 1.0) || (st2.x < 0.5 && edgePx < 2.0);
  }

  // D2d · dark veil.
  vec3 fogVeil(vec3 p, vec3 c, int b, vec4 st, vec4 ev, float a1, int i2, float a2, bool thin) {
    if (thin) return fogOutline(st, a1, i2, a2) ? fogInk(c) : c;
    vec3 wp = (uFogModel * vec4(p, 1.0)).xyz;
    float f = dot(normalize(mat3(uFogModel) * p), normalize(uEye - wp));
    if (uFogRadiusPx * (1.0 - sqrt(max(0.0, 1.0 - f * f))) < ${g4(LIMB_PX)}) return uFogLimb;
    vec3 own = fogTex(int(st.y), 2).xyz;
    int r = fogRampOf(own);
    vec3 veil = uFogVeil[r * 4 + (b >= 1 ? 0 : 1)];
    if (fogOutline(st, a1, i2, a2)) return uFogVeil[r * 4 + 3];
    float facing;
    vec2 s0 = fogScreen(own, facing);
    float kp = max(1.0, floor(uFogView.y / 180.0 + 0.5)); // glyph px per internal px: the glyphs keep their size on screen
    vec2 rel = (floor(vec2(gl_FragCoord.x, uFogView.y - gl_FragCoord.y)) - floor(s0)) / kp;
    int flags = int(st.w + 0.5);
    if ((flags & 2) != 0 && facing > 0.5) {
      ivec2 lp = ivec2(floor(rel)) + 2;
      if (lp.x >= 0 && lp.y >= 0 && lp.x < 5 && lp.y < 5) return ((FOG_QMARK >> (lp.y * 5 + lp.x)) & 1) == 1 ? (r == 3 ? uG[1] : fogRamp(r, 2)) : veil;
    }
    bool back = (flags & 1) != 0;
    float u = floor(back ? rel.x - rel.y : rel.x + rel.y), v = floor(back ? rel.x + rel.y : rel.x - rel.y);
    float spacing = ${g4(HATCH.spacing)}, on = ${g4(HATCH.on)}, period = ${g4(HATCH.period)};
    float drift = floor(uFogPhase * ${g4(HATCH.cycles)} * spacing);
    bool hatch = mod(u + drift, spacing) < 0.5 && mod(v + floor(ev.w * period), period) < on;
    return hatch ? uFogVeil[r * 4 + 2] : veil;
  }

  vec3 fog(vec3 p, int b, vec3 c) {
    if (uFogOn == 0) return c;
    float a1, a2;
    int i2;
    int i = fogNearest(p, a1, i2, a2);
    vec4 st = fogTex(i, 0), ev = fogTex(i, 1);
    int stage = st.x > 0.5 ? 2 : 0; // 0 clear, 1 thin fog, 2 fog, 3 rim, 4 rim core (teal)
    if (ev.x > 0.5) {
      float d = acos(clamp(dot(p, fogTex(int(st.y), 2).xyz), -1.0, 1.0)), s = ev.y;
      if (ev.x < 1.5) {
        // clearing: out from the anchor across the whole footprint, with a small fixed wobble
        float r = (st.z + ${g4(FRONT.thin + FRONT.rim)} * gPx) * (1.0 - (1.0 - s) * (1.0 - s));
        float e = (r - d - snoise(p * 13.0 + 5.7) * 1.5 * gPx) / gPx; // px behind the front
        stage = e < 0.0 ? 2 : e < ${g4(FRONT.core)} ? 4 : e < ${g4(FRONT.rim)} ? 3 : e < ${g4(FRONT.rim + FRONT.thin)} ? 1 : 0;
      } else {
        // refogging: in from the far edge, the edge billowing as it rolls
        float r = (st.z + ${g4(FRONT.roll)} * gPx) * (1.0 - s * s * (3.0 - 2.0 * s));
        float e = (d + snoise(p * 7.0 + vec3(0.0, s * 3.0, 0.0)) * 4.0 * gPx - r) / gPx; // px outside the front
        stage = e < 0.0 ? 0 : e < ${g4(FRONT.roll)} ? 1 : 2;
      }
    }
    if (uFogPulse.w > 0.0) {
      float s = uFogPulse.w;
      float e = (3.14159 * (1.0 - (1.0 - s) * (1.0 - s)) - acos(clamp(dot(p, uFogPulse.xyz), -1.0, 1.0))) / gPx;
      if (e >= 0.0 && e < ${g4(FRONT.rim)}) stage = e < ${g4(FRONT.core)} ? 4 : 3;
    }
    if (stage == 0) return c;
    if (stage == 4) return uFogTeal;
    if (stage == 3) return fogInvL(c);
    return fogVeil(p, c, b, st, ev, a1, i2, a2, stage == 1);
  }
`;

/** The haze shell's fog: no haze over a fogged or changing cell, so the limb never hints at a band (fog hides health). */
export const FOG_HAZE = /* glsl */ `
  ${FOG_GRID}
  uniform mat4 uFogToSurface; // world → the surface's own frame
  bool fogHidesHaze(vec3 posW) {
    if (uFogOn == 0) return false;
    float a1, a2;
    int i2;
    int i = fogNearest(normalize((uFogToSurface * vec4(posW, 1.0)).xyz), a1, i2, a2);
    return fogTex(i, 0).x > 0.5 || fogTex(i, 1).x > 0.5;
  }
`;

/**
 * moonFog(p, b, c) for moons and moonlets (the toon shader): one file each, fogged as a whole, in
 * the moon's own darkest step toward space with a dim equator line; fronts run pole to pole.
 * vFog: (fogged, event kind, progress), one per instance.
 */
export const FOG_MOON = /* glsl */ `
  flat in vec3 vFog;
  in vec3 vLocal;
  uniform vec3 uRampFog[4];  // the moon ramp's veil: lit, night, hatch, line (palette.fog.veil)
  uniform vec3 uFogTeal;
  vec3 moonStep(vec3 c, int k) {
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
  float moonLuma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  vec3 moonInvL(vec3 c) { float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)); return clamp(c + (1.0 - mx - mn), 0.0, 1.0); }
  vec3 moonFog(vec3 p, int b, vec3 c) {
    if (vFog.x < 0.5 && vFog.y < 0.5) return c;
    vec3 dp = dFdx(p), dq = dFdy(p);
    float px = max(1e-4, max(length(dp), length(dq)));
    int stage = vFog.x > 0.5 ? 2 : 0;
    float d = acos(clamp(p.y, -1.0, 1.0)), s = vFog.z;
    if (vFog.y > 0.5 && vFog.y < 1.5) {
      float e = (3.2 * (1.0 - (1.0 - s) * (1.0 - s)) - d) / px;
      stage = e < 0.0 ? 2 : e < ${g4(FRONT.core)} ? 4 : e < ${g4(FRONT.rim)} ? 3 : e < ${g4(FRONT.rim + FRONT.thin)} ? 1 : 0;
    } else if (vFog.y > 1.5) {
      float e = (3.2 * (1.0 - s * s * (3.0 - 2.0 * s)) - (3.14159 - d)) / px;
      stage = e > ${g4(FRONT.roll)} ? 0 : e > 0.0 ? 1 : 2;
    }
    if (stage == 0) return c;
    if (stage == 4) return uFogTeal;
    if (stage == 3) return moonInvL(c);
    bool line = abs(p.y) / px < 1.0;
    if (stage == 1) {
      vec3 ink = moonStep(c, 1);
      if (abs(moonLuma(ink) - moonLuma(moonStep(c, -1))) < 0.08) ink = moonStep(c, -3);
      return line ? ink : c;
    }
    return line ? uRampFog[3] : uRampFog[b >= 1 ? 0 : 1];
  }
`;

