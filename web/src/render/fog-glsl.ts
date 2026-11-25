// Fog of war's GLSL (R5, #74; #224): the fog is cloud (art-direction §9, "fog of war is cloud", C6 · the
// white storm front), puffs over each fogged file's territory and thin mist over each misted one, drawn
// by render/fog.ts FogClouds from model/fog-cloud.ts. The dark veil (D2d) is gone: nothing here darkens
// the ground. What the shaders that already run still do for the fog:
// - the planet surface and its cloud shadows: the planet-clear pulse (F5's landing moment), the clear
//   front's 1 px [OIII] teal core and inverted-lightness rim travelling once over the whole planet;
// - the fog's own puffs and shadows (FOG_SKY): nothing while the planet has no fog (uFogOn 0);
// - the haze shell and the lava smoke (FOG_HAZE): none over a fogged or changing cell, found by the
//   nearest cell of the planet's #18 grid (cell centres in a cells × 3 data texture, model/fog.ts
//   cellRows; only the cells within 1.7 covering radii of the pixel's latitude are searched);
// - moons and moonlets (FOG_MOON): one file each, all cloud, a mist line or nothing.
//
// This module is the GLSL and its constants only (no three.js), so shaders.ts can splice it in;
// fog.ts holds the uniforms, the cell texture, the moon attributes and the cloud meshes.
import { FOG_TEX_ROWS } from '../model/fog.js';

/** The planet-clear pulse's widths, internal px: the teal core and the inverted rim behind it. */
export const FRONT = { core: 1, rim: 2.5 } as const;

const g4 = (x: number) => x.toFixed(4);

/** The grid search, for the haze shell and the smoke. */
export const FOG_GRID = /* glsl */ `
  uniform int uFogOn;                // 0: nothing on this planet is fogged, misted or changing
  uniform highp sampler2D uFogCells; // cells x ${FOG_TEX_ROWS} RGBA float (model/fog.ts cellRows)
  uniform int uFogN;                 // grid cells
  uniform int uFogWin;               // search window, cells either side of p's latitude index
  vec4 fogTex(int i, int row) { return texelFetch(uFogCells, ivec2(i, row), 0); }
  // The nearest grid cell to p.
  int fogNearest(vec3 p) {
    int i0 = uFogN <= 1 ? 0 : int(floor((1.0 - p.y) * 0.5 * float(uFogN - 1) + 0.5));
    float b1 = -2.0;
    int i1 = 0;
    for (int i = max(0, i0 - uFogWin); i <= min(uFogN - 1, i0 + uFogWin); i++) {
      float d = dot(p, fogTex(i, 2).xyz);
      if (d > b1) { b1 = d; i1 = i; }
    }
    return i1;
  }
`;

/**
 * fog(p, b, c) for the planet surface and its cloud shadows: c, the body's colour at p (unit sphere, the
 * surface's own frame) in light band b. The fog itself is cloud over the ground (render/fog.ts FogClouds),
 * so the ground is never veiled; the surface only carries the planet-clear pulse, the clear front's teal
 * core and inverted-lightness rim (§9's wavefront) travelling once over the whole planet. Uses SURFACE's gPx.
 */
export const FOG_SURFACE = /* glsl */ `
  uniform int uFogOn;      // 0: nothing on this planet is fogged, misted or changing
  uniform vec4 uFogPulse;  // the planet-clear pulse: xyz origin (surface frame), w progress (0: none)
  uniform vec3 uFogTeal;   // [OIII] teal, events only
  // Inverted lightness (art-direction §9's filter rule): the event rim.
  vec3 fogInvL(vec3 c) { float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)); return clamp(c + (1.0 - mx - mn), 0.0, 1.0); }
  vec3 fog(vec3 p, int b, vec3 c) {
    if (uFogOn == 0 || uFogPulse.w <= 0.0) return c;
    float s = uFogPulse.w;
    float e = (3.14159 * (1.0 - (1.0 - s) * (1.0 - s)) - acos(clamp(dot(p, uFogPulse.xyz), -1.0, 1.0))) / gPx;
    if (e >= 0.0 && e < ${g4(FRONT.rim)}) return e < ${g4(FRONT.core)} ? uFogTeal : fogInvL(c);
    return c;
  }
`;

/**
 * The fog sky's own switch, for the cloud and shadow shaders: uFogSky is 1 on the fog's puffs and their
 * shadows (0 on a planet's weather), and they draw nothing while the planet's uFogOn is 0.
 */
export const FOG_SKY = /* glsl */ `
  uniform float uFogSky;
  bool fogSkyOff() { return uFogSky > 0.5 && uFogOn == 0; }
`;

/**
 * The haze shell's and the lava smoke's fog: none over a fogged or changing cell, so neither hints at the
 * band from over the storm. A misted cell (#201, read) shows its ground, so it keeps them.
 */
export const FOG_HAZE = /* glsl */ `
  ${FOG_GRID}
  uniform mat4 uFogToSurface; // world → the surface's own frame
  bool fogHidesHaze(vec3 posW) {
    if (uFogOn == 0) return false;
    int i = fogNearest(normalize((uFogToSurface * vec4(posW, 1.0)).xyz));
    return fogTex(i, 0).x > 1.5 || fogTex(i, 1).x > 0.5;
  }
`;

/**
 * moonFog(p, b, c) for moons and moonlets (the toon shader): one file each, under fog as a whole. Fogged,
 * the moon is all cloud, drawn in the cloud ramp by light band; misted, a thin 2 px equator line in the
 * mist ramp over its own colours; clear, nothing. Fronts run pole to pole: a clear's cloud still ahead of
 * the front is teal, a refog rolls the new level in with no teal. Never dark: no veil (#224).
 * vFog: (level at rest 0..2, event kind, progress, the level the event started from), one per instance.
 */
export const FOG_MOON = /* glsl */ `
  flat in vec4 vFog;
  in vec3 vLocal;
  uniform vec3 uMoonCloud[4]; // world.cloud: a fogged moon
  uniform vec3 uMoonMist[4];  // fog.mist: a misted moon's equator line
  uniform vec3 uMoonTeal[4];  // accent.teal: a fogged moon's cloud while it clears
  int moonRest(float level) { return level > 1.5 ? 2 : level > 0.5 ? 1 : 0; }
  vec3 moonFog(vec3 p, int b, vec3 c) {
    if (vFog.x < 0.5 && vFog.y < 0.5) return c;
    vec3 dp = dFdx(p), dq = dFdy(p);
    float px = max(1e-4, max(length(dp), length(dq)));
    int level = moonRest(vFog.x), from = moonRest(vFog.w);
    float d = acos(clamp(p.y, -1.0, 1.0)), s = vFog.z;
    bool teal = false;
    if (vFog.y > 0.5 && vFog.y < 1.5) {
      // a clear: the new level spreads from the north pole, the old one still ahead of it
      if (d > 3.2 * (1.0 - (1.0 - s) * (1.0 - s))) { teal = from == 2; level = from; }
    } else if (vFog.y > 1.5) {
      // a refog: the new level rolls in from the north pole, the old one still ahead of it
      if (3.14159 - d < 3.2 * (1.0 - s * s * (3.0 - 2.0 * s))) level = from;
    }
    if (level == 0) return c;
    if (level == 2) return teal ? uMoonTeal[b] : uMoonCloud[b];
    return abs(p.y) / px < 1.0 ? uMoonMist[b] : c;
  }
`;
