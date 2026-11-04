// Planet artefacts (ASCII/cyberbrutalist concept 3, "filter" form; ported from
// feature/ascii-fx 29c64a1, mockups/ascii-fx/fx.js ARTEFACT_HOOK). Corrupted sectors
// lodged in a planet's surface glitch the planet's OWN colours. They live in the
// planet surface shader, so they rotate with the planet and pass under the clouds.
//
// Sector membership is decided per glyph cell. The cell grid is screen-aligned and
// anchored at the sector's projected centre (snapped to whole pixels), so glyphs stay
// crisp while they travel; the shape is squashed by how much the sector faces the
// camera, so it foreshortens and slides off the limb. Cell types, all from surface():
//   glyph   a bug glyph in the terrain's inverted lightness (edges: a band up), on a darker band
//   block   the terrain at the cell centre, flat and a band up (pixelated)
//   mosh    terrain from somewhere else on the planet
//   invert  inverted lightness, or the light bands flipped (lit terrain goes dark)
//   tear    the cell's rows slid around the axis by different amounts
// Differences from the reference: everything (projection, size, cell scale) is worked
// out in the shader, so it works for any camera and planet (sectors under 1 cell are skipped); time is a loop-locked tick
// (ART_TICKS per surface turn, every re-roll rate divides it); glyphs that would vanish into
// the terrain (lava's near-black crust) take inverted lightness so they stay legible.

export const MAX_ART = 5;
// Glyph clamp: the cells across a sector stay within these bounds at any zoom. Zooming in grows
// each cell (in whole internal pixels per glyph pixel) instead of adding cells; zooming out never
// shrinks a sector below `min` cells (discs under ~1.5x that width, 13.5 px radius at 180p, are skipped).
export const ART_CELLS = { min: 3, max: 10 };
export const ART_TICKS = 180; // per surface turn (15 ticks/s at 12 s per turn); rates 2..6 all divide it

// 5x5 glyphs ('#' = ink), drawn in 6 px cells; from mockups/ascii-fx/glyphs.js.
const GLYPHS = {
  cross: ['##.##', '##.##', '..#..', '##.##', '##.##'],
  times: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  hash: ['.#.#.', '#####', '.#.#.', '#####', '.#.#.'],
  semi: ['..#..', '.....', '..#..', '..#..', '.#...'],
  bang: ['..#..', '..#..', '..#..', '.....', '..#..'],
  lbrace: ['..##.', '..#..', '.#...', '..#..', '..##.'],
  rbrace: ['.##..', '..#..', '...#.', '..#..', '.##..'],
  star: ['#.#.#', '.###.', '#####', '.###.', '#.#.#'],
  zero: ['.###.', '#..##', '#.#.#', '##..#', '.###.'],
  one: ['..#..', '.##..', '..#..', '..#..', '.###.'],
  plus: ['..#..', '..#..', '#####', '..#..', '..#..'],
};
// bit (y * 5 + x), y down
const mask = (rows) => rows.join('').split('').reduce((m, ch, i) => (ch === '#' ? m | (1 << i) : m), 0);
const BUGS = ['cross', 'times', 'hash', 'semi', 'bang', 'lbrace', 'rbrace', 'star', 'zero', 'one'];

// Planet size range (the viewer's size slider; size = LOC). Sector count by size: the
// smallest planets get 1, the biggest MAX_ART, linear in radius, rounded to whole sectors.
export const ART_SIZE = { min: 0.25, max: 2.2 };
export const artefactCount = (size) => Math.round(1 + (MAX_ART - 1) * Math.min(1, Math.max(0, (size - ART_SIZE.min) / (ART_SIZE.max - ART_SIZE.min))));

/** Sector centres (unit directions in the planet's own frame) and sizes in glyph cells.
 *  Longitudes step by the golden angle, so any first n sectors are spread around the
 *  planet and one is usually facing the camera as it turns. */
export function artefactSectors(rnd, count) {
  const lon0 = rnd() * Math.PI * 2;
  return Array.from({ length: count }, (_, i) => {
    const lat = (i % 2 ? 1 : -1) * (0.05 + rnd() * 0.45), lon = lon0 + i * 2.39996 + (rnd() - 0.5) * 0.4;
    return { dir: [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)], size: 3.8 + rnd() * 1.8 };
  });
}

// Needs surface(p, band), uBiome, the light-band uniforms, modelMatrix / projectionMatrix,
// uViewSize and gRadiusPx (the planet's radius in screen px) from PLANET_FRAG.
export const ARTEFACTS_GLSL = /* glsl */ `
  uniform int uArtN;            // 0 = off: artefacts() returns c untouched
  uniform int uArtTick;         // 0..ART_TICKS * surfaceTurns - 1, loop-locked
  uniform int uArtTeal;
  uniform vec3 uArtTealC;
  uniform vec4 uArtSec[${MAX_ART}]; // xyz = centre direction (planet frame), w = size in cells
  uniform int uArtDebug;        // 1 = debug view (no row slip): rgb = cell x + 128, cell y + 128, sector * 50 + cells across * 4
  const float ART_CELLS_MIN = ${ART_CELLS.min.toFixed(1)}, ART_CELLS_MAX = ${ART_CELLS.max.toFixed(1)};
  const int BUGS[10] = int[10](${BUGS.map((n) => mask(GLYPHS[n])).join(', ')});
  const int PLUS = ${mask(GLYPHS.plus)};
  float ah(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
  vec3 invL(vec3 c) { float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)); return clamp(c + (1.0 - mx - mn), 0.0, 1.0); }
  float aluma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  vec3 rotY(vec3 p, float a) { float s = sin(a), k = cos(a); return vec3(k * p.x + s * p.z, p.y, -s * p.x + k * p.z); }
  bool ink(int g, ivec2 lp) { return lp.x < 5 && lp.y < 5 && ((g >> (lp.y * 5 + lp.x)) & 1) == 1; }

  vec3 artefacts(vec3 p, int b, vec3 c) {
    if (uArtN == 0) return c; // uniform, so the derivatives below stay in uniform control flow
    vec3 dpx = dFdx(p), dpy = dFdy(p); // to find each cell's centre on the sphere
    vec3 base = c;
    vec2 fp = vec2(gl_FragCoord.x, uViewSize.y - gl_FragCoord.y); // px, top-down
    float k = max(1.0, floor(uViewSize.y / 180.0 + 0.5)); // base glyph pixel scale: 1 at 180p, 2 at 360p
    float radiusPx = gRadiusPx;
    int lo = max(b - 1, 0), hi = min(b + 1, 3);
    for (int i = 0; i < ${MAX_ART}; i++) {
      if (i >= uArtN) break;
      vec3 dir = uArtSec[i].xyz;
      if (dot(p, dir) < 0.55) continue;
      vec4 w = modelMatrix * vec4(dir, 1.0);
      vec4 clip = projectionMatrix * viewMatrix * w;
      vec2 s = vec2(clip.x / clip.w + 1.0, 1.0 - clip.y / clip.w) * 0.5 * uViewSize;
      float facing = dot(normalize(mat3(modelMatrix) * dir), normalize(cameraPosition - w.xyz));
      if (facing < 0.2) continue;
      // natural half-width in base cells: ~half the disc across on big planets, a smaller share on
      // small ones (down to 0.6x below ~25 px radius), so one sector never swamps a small disc
      float cells = uArtSec[i].w * radiusPx / (50.0 * k) * mix(0.6, 1.0, clamp((radiusPx - 25.0) / 35.0, 0.0, 1.0));
      if (radiusPx < ART_CELLS_MIN * 4.5 * k) continue; // the disc can't hold a ART_CELLS_MIN sector (under ~1.5x its width): too small to read
      // glyph clamp: grow the glyph pixel g (whole px) until at most ART_CELLS_MAX cells span the
      // sector, then hold at least ART_CELLS_MIN
      float g = max(k, ceil(2.0 * cells * k / ART_CELLS_MAX - 1e-3));
      cells = max(cells * k / g, ART_CELLS_MIN * 0.5);
      float cellPx = 6.0 * g;
      float seed = float(i) * 17.3 + 3.1;
      // whole-sector row slip on a few ticks
      float slipStep = floor(float(uArtTick) / 3.0);
      vec2 rel = fp - floor(s);
      if (uArtDebug == 0 && ah(vec2(slipStep, seed)) > 0.8) rel.x += (floor(ah(vec2(floor(rel.y / (3.0 * g)), slipStep + seed)) * 7.0) - 3.0) * g;
      ivec2 cell = ivec2(floor(rel / cellPx));
      ivec2 lp = ivec2(floor((rel - vec2(cell) * cellPx) / g));
      vec2 cc = vec2(cell) + 0.5;
      vec2 hs = vec2(cells * max(facing, 0.25), cells * 0.8);
      float e = length(cc / hs);
      float rough = ah(vec2(cell) + seed);
      if (e > 0.7 + rough * 0.55) continue;
      if (uArtDebug == 1) { c = vec3(float(cell.x) + 128.0, float(cell.y) + 128.0, float(i) * 50.0 + floor(cells * 8.0 + 0.5)) / 255.0; continue; }
      vec2 toCentre = cc * cellPx - rel; // px, top-down
      vec3 pc = normalize(p + dpx * toCentre.x - dpy * toCentre.y);
      // each cell re-rolls at its own rate (2..6 ticks, all dividing ${ART_TICKS}), so the sector simmers
      float rate = 2.0 + floor(ah(vec2(cell) * 1.7 + seed) * 5.0);
      float st = floor(float(uArtTick) / rate);
      float r = ah(vec2(cell) + seed * 3.1 + st * 0.37);
      bool core = e < 0.45;
      if (r < (core ? 0.2 : 0.08)) {
        c = surface(pc, hi); // block
      } else if (r < 0.3) {
        vec3 off = vec3(ah(vec2(st, seed)), ah(vec2(seed, st)), ah(vec2(st + seed, 2.0))) - 0.5;
        c = surface(normalize(pc + off * 0.9), b); // mosh
      } else if (r < 0.46) {
        c = ah(vec2(cell) + 9.1) > 0.5 ? invL(base) : surface(p, 3 - b); // invert: lightness, or the light bands
      } else if (r < 0.55) {
        c = surface(rotY(p, (ah(vec2(floor(rel.y / (2.0 * g)), st + seed)) - 0.5) * 0.6), b); // tear
      } else {
        int g = BUGS[int(ah(vec2(cell) * 2.3 + st) * 10.0)];
        if (!core && r > 0.85) g = PLUS;
        vec3 bg = surface(pc, core ? max(b - 2, 0) : lo);
        if (ink(g, lp)) {
          vec3 fg = core ? invL(surface(pc, b)) : surface(pc, hi);
          // legibility: the terrain colour or its inverted lightness, whichever stands out more
          // from the cell background (lava's near-black crust takes the inverted one)
          vec3 fi = invL(fg);
          c = abs(aluma(fi) - aluma(bg)) > abs(aluma(fg) - aluma(bg)) ? fi : fg;
          if (uArtTeal == 1 && core && ah(vec2(cell) + st * 0.11) > 0.72) c = uArtTealC;
        } else c = bg; // glyph
      }
    }
    return c;
  }
`;
