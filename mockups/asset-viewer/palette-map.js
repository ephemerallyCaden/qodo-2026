// Maps a published palette onto the viewer's colour roles using only that
// palette's own colours. Lospec palettes are built from hand-made ramps, so we
// pick an anchor colour by hue, then walk darker and lighter by choosing the
// nearest-chroma neighbour (OKLab a/b) at each lightness step. That follows the
// palette's designed ramps, including their hue shifts.
import { LOSPEC } from './palettes.js';

// ---------------------------------------------------------------- colour maths
function oklab(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const r = lin((n >> 16) & 255), g = lin((n >> 8) & 255), b = lin(n & 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  const H = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { hex: `#${hex.replace('#', '')}`, L, A, B, C, H };
}
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const abDist = (p, q) => Math.hypot(p.A - q.A, p.B - q.B);
const labDist = (p, q) => Math.hypot(p.L - q.L, p.A - q.A, p.B - q.B);

// ---------------------------------------------------------------- ramps
// Next colour darker (dir -1) or lighter (dir +1) than `cur`, staying in its hue family.
function step(cols, cur, dir, used) {
  let best = null;
  let bestCost = Infinity;
  for (const c of cols) {
    const dL = (c.L - cur.L) * dir;
    if (dL < 0.035 || used.has(c.hex)) continue;
    if (dir > 0 && c.L > 0.93 && cur.C > 0.04) continue; // chromatic ramps don't climb into the palette's white
    let cost = abDist(c, cur) * 2.2 + Math.abs(dL - 0.11) * 1.2;
    if (dir > 0) cost += Math.max(0, cur.C - c.C) * 2.5; // keep saturation going up
    if (cost < bestCost) { bestCost = cost; best = c; }
  }
  return best;
}

/** n-colour ramp (dark -> light) through `anchor`; the anchor sits at `pos` (0..1) of the ramp. */
function rampFrom(cols, anchor, n, pos = 0.6) {
  const used = new Set([anchor.hex]);
  const dark = [];
  const light = [];
  for (let c = anchor; dark.length < n - 1; ) { c = step(cols, c, -1, used); if (!c) break; used.add(c.hex); dark.push(c); }
  for (let c = anchor; light.length < n - 1; ) { c = step(cols, c, 1, used); if (!c) break; used.add(c.hex); light.push(c); }
  const chain = [...dark.reverse(), anchor, ...light];
  const ai = dark.length;
  let start = Math.max(0, Math.min(chain.length - n, ai - Math.round(pos * (n - 1))));
  const out = chain.slice(start, start + n);
  while (out.length < n) out.push(out[out.length - 1]); // tiny palettes repeat their ends
  return out;
}

const quality = (ramp) => {
  const uniq = new Set(ramp.map((c) => c.hex)).size / ramp.length;
  const span = ramp[ramp.length - 1].L - ramp[0].L;
  const chroma = ramp.reduce((s, c) => s + c.C, 0) / ramp.length;
  return uniq * (0.4 + span) * (0.5 + chroma * 4);
};

// Best anchor for a hue: chromatic, near the hue, mid lightness.
function anchorFor(cols, hue, { minL = 0.35, maxL = 0.85, exclude = new Set() } = {}) {
  let best = null;
  let bestScore = -1;
  for (const c of cols) {
    if (exclude.has(c.hex)) continue;
    const hs = Math.exp(-((hueDist(c.H, hue) / 38) ** 2));
    const ls = c.L < minL || c.L > maxL ? 0.35 : 1;
    const score = hs * ls * Math.min(1, c.C * 8);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  // Tiny palettes can run out of candidates once others are excluded: reuse instead.
  if (!best && exclude.size) return anchorFor(cols, hue, { minL, maxL });
  return { anchor: best, score: bestScore };
}

// ---------------------------------------------------------------- roles
// Ocean/land pairings, stylised first; realistic Earth blue + green is penalised.
const PAIRS = [
  { ocean: 195, land: 115, weight: 1.1, tag: 'teal sea, lime land' },
  { ocean: 290, land: 165, weight: 1.1, tag: 'violet sea, mint land' },
  { ocean: 265, land: 75, weight: 1.05, tag: 'blue sea, ochre land' },
  { ocean: 315, land: 125, weight: 1.0, tag: 'purple sea, lime land' },
  { ocean: 230, land: 350, weight: 0.95, tag: 'cyan-blue sea, pink land' },
  { ocean: 260, land: 145, weight: 0.7, tag: 'earth blue + green' },
];

/**
 * Build a viewer palette from a Lospec palette. `hints` can force ramp anchor
 * hues per role, e.g. { ocean: 290, land: 165 }.
 */
export function mapPalette(slug, hints = {}) {
  const src = LOSPEC[slug];
  return mapColors(src.colors, { name: src.name, url: src.url }, hints);
}

/** Map any list of hexes onto every role (used for Lospec palettes). */
export function mapColors(hexes, { name = '', url = '' } = {}, hints = {}) {
  const cols = [...new Set(hexes.map((h) => h.replace('#', '').toLowerCase()))].map(oklab);
  const byL = [...cols].sort((a, b) => a.L - b.L);
  const hex = (r) => r.map((c) => c.hex);
  const cool = (c) => c.H > 190 && c.H < 330;

  // space: the darkest colour, preferring a cool one among the near-darkest
  const darkest = byL.filter((c) => c.L < byL[0].L + 0.03);
  const space = darkest.find(cool) ?? byL[0];
  const lightest = byL[byL.length - 1];

  // ocean + land: best-scoring pairing for this palette
  let pick = null;
  const pairs = hints.ocean != null ? [{ ocean: hints.ocean, land: hints.land, weight: 1, tag: 'hinted' }] : PAIRS;
  for (const p of pairs) {
    const o = anchorFor(cols, p.ocean);
    const l = anchorFor(cols, p.land, { exclude: new Set([o.anchor.hex]) });
    const oRamp = rampFrom(cols, o.anchor, 5, 0.55);
    const lRamp = rampFrom(cols, l.anchor, 5, 0.6);
    const sep = Math.min(1, hueDist(o.anchor.H, l.anchor.H) / 70);
    const score = o.score * l.score * quality(oRamp) * quality(lRamp) * sep * p.weight;
    if (!pick || score > pick.score) pick = { score, oRamp, lRamp, tag: p.tag };
  }

  const rampAt = (hue, n, pos, opts) => rampFrom(cols, anchorFor(cols, hue, opts).anchor, n, pos);
  const lightNeutral = [...cols].sort((a, b) => (b.L - b.C * 3) - (a.L - a.C * 3))[0];
  const midNeutral = [...cols].sort((a, b) => (Math.abs(a.L - 0.6) + a.C * 2) - (Math.abs(b.L - 0.6) + b.C * 2))[0];
  const visorPool = byL.filter(cool);
  const visor = (visorPool.length >= 2 ? visorPool : byL).slice(0, 2);

  const contributors = {};
  const taken = new Set();
  for (const [key, hue] of [['coral', hints.coral ?? 28], ['mint', hints.mint ?? 165], ['lilac', hints.lilac ?? 300]]) {
    const { anchor } = anchorFor(cols, hue, { minL: 0.45, maxL: 0.85, exclude: taken });
    taken.add(anchor.hex);
    contributors[key] = hex(rampFrom(cols, anchor, 4, 0.66));
  }

  const stars = [
    [...cols].sort((a, b) => Math.abs(a.L - 0.42) + a.C - (Math.abs(b.L - 0.42) + b.C))[0],
    [...cols].sort((a, b) => Math.abs(a.L - 0.78) + a.C - (Math.abs(b.L - 0.78) + b.C))[0],
    lightest,
  ];

  // Depth: tint toward the palette's darks, then snap back onto palette colours.
  // Never snap onto the space colour itself, so far objects stay visible.
  const tint = byL.find((c) => c.hex !== space.hex && cool(c)) ?? byL[1] ?? space;
  const notSpace = cols.filter((c) => c.hex !== space.hex);
  const darkPool = [...notSpace].sort((a, b) => a.L - b.L);

  // Biome roles (revision 4). Same rule: only this palette's colours.
  const warmDark = byL.filter((c) => c.hex !== space.hex && (c.H < 70 || c.H > 330)).concat(byL.filter((c) => c.hex !== space.hex))[0];
  const ashAnchor = [...cols].filter((c) => c.hex !== space.hex).sort((a, b) => (Math.abs(a.L - 0.32) + a.C * 3) - (Math.abs(b.L - 0.32) + b.C * 3))[0];
  // Ice: start at the lightest cool-ish colour and only walk darker, so it never drifts warm.
  const iceTop = [...cols].filter((c) => c.L > 0.72).sort((a, b) => (b.L - Math.min(1, hueDist(b.H, hints.ice ?? 230) / 90) * 0.25 * Math.min(1, b.C * 10)) - (a.L - Math.min(1, hueDist(a.H, hints.ice ?? 230) / 90) * 0.25 * Math.min(1, a.C * 10)))[0] ?? lightest;
  const ice = rampFrom(cols, iceTop, 5, 1);
  // Lava crust: only the palette's darker ~45%, so the crust stays dark in every palette.
  const darkHalf = byL.slice(0, Math.max(5, Math.ceil(byL.length * 0.45))).filter((c) => c.hex !== space.hex);
  const toxic = rampAt(hints.toxic ?? 120, 5, 0.6, { minL: 0.5 });
  const water = rampAt(hints.water ?? 245, 5, 0.55); // ocean worlds read as water: blue family
  const biome = {
    ice: hex(ice),
    crevasse: hex(rampAt(hints.crevasse ?? 265, 4, 0.5, { maxL: 0.6 })),
    sand: hex(rampAt(hints.sand ?? 75, 5, 0.6)),
    rock: hex(rampAt(hints.rock ?? 40, 4, 0.45, { minL: 0.25, maxL: 0.6 })),
    crust: hex(rampFrom(darkHalf.length ? darkHalf : cols, darkHalf.includes(warmDark) ? warmDark : darkHalf[0] ?? warmDark, 5, 0)),
    glow: hex(rampFrom(cols, anchorFor(cols, hints.glow ?? 30, { minL: 0.45, maxL: 0.75 }).anchor, 3, 0)),
    ash: hex(rampFrom(cols, ashAnchor, 4, 0.33)),
    gasA: hex(rampAt(hints.gasA ?? 60, 5, 0.6)),
    gasB: hex(rampAt(hints.gasB ?? 15, 5, 0.6)),
    moon: hex(rampFrom(cols, midNeutral, 5, 0.6)),
    toxic: hex(toxic),
    water: hex(water),
    sludge: hex(rampAt(hints.sludge ?? 180, 5, 0.4, { maxL: 0.65 })),
    fungus: hex(rampAt(hints.fungus ?? 320, 4, 0.5)),
    spore: hex(rampFrom(cols, toxic[3], 4, 1)),
    haze: { ocean: water[4].hex, ice: lightest.hex, toxic: toxic[4].hex },
  };

  return {
    ...biome,
    name,
    url,
    pairing: pick.tag,
    space: space.hex,
    stars: hex(stars),
    ocean: hex(pick.oRamp),
    land: hex(pick.lRamp),
    cap: hex(rampFrom(cols, anchorFor(cols, pick.oRamp[2].H, { minL: 0.7, maxL: 1.01 }).anchor, 4, 1)),
    cloud: hex(rampFrom(cols, lightest, 4, 1)),
    ring: hex(rampAt(hints.ring ?? 355, 4, 0.66, { exclude: new Set(pick.lRamp.map((c) => c.hex)) })),
    suit: hex(rampFrom(cols, lightNeutral, 4, 1)),
    gear: hex(rampFrom(cols, midNeutral, 4, 0.66)),
    visor: hex(visor),
    glint: lightest.hex,
    contributors,
    depth: [[space.hex, 0], [tint.hex, 0.38], [tint.hex, 0.72], [space.hex, 0.88]],
    // per-level snap pools: whole palette, its darker 40%, its 3 darkest (all minus space)
    snap: [null, notSpace.map((c) => c.hex), darkPool.slice(0, Math.max(2, Math.ceil(darkPool.length * 0.4))).map((c) => c.hex), darkPool.slice(0, 3).map((c) => c.hex)],
  };
}

/** Nearest colour (OKLab) in `pool` to an sRGB 0..1 triple. */
export function snapToPool(rgb, pool) {
  const toHex = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  const target = oklab(`${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`);
  let best = pool[0];
  let bd = Infinity;
  for (const h of pool) {
    const d = labDist(target, oklab(h));
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}
