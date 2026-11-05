// The committed palette (AGENTS.md Rule 5): pinned to a fixture so it only changes on purpose,
// plus invariant checks that each run against the real palette and against a broken copy.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { palette, type Palette } from '../src/core/palette.js';

const ROOT = join(import.meta.dirname, '..');
const GOLDEN = join(import.meta.dirname, 'golden/palette.v1.json');
const BLK_36: string[] = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/blk-36.published.json'), 'utf8')).colors;
const TEAL = ['#004538', '#007c66', '#00bc9c', '#00ffd5'];

// The palette's own type pins each literal; a broken copy widens them so a test can write other values.
type Mutable<T> = T extends string ? string : T extends number ? number : T extends readonly (infer U)[] ? Mutable<U>[] : { -readonly [K in keyof T]: Mutable<T[K]> };
/** A writable deep copy to break on purpose (the real palette is frozen). */
const broken = (): Mutable<Palette> => structuredClone(palette) as unknown as Mutable<Palette>;

/** Every string leaf, with its path (e.g. `world.ocean[2]`). */
function strings(v: unknown, at = ''): [string, string][] {
  if (typeof v === 'string') return [[at, v]];
  if (Array.isArray(v)) return v.flatMap((x, i) => strings(x, `${at}[${i}]`));
  if (typeof v === 'object' && v !== null) return Object.entries(v).flatMap(([k, x]) => strings(x, at ? `${at}.${k}` : k));
  return [];
}
const hexes = (v: unknown) => strings(v).map(([, h]) => h);

/**
 * Sorted-keys JSON with a two-space indent and a trailing newline. Byte-stable like canonicalJson,
 * but keeps the depth strengths as the floats §5 states (canonicalJson only takes integers).
 */
const sortedJson = (v: unknown) => JSON.stringify(v, (_, x: unknown) => typeof x === 'object' && x !== null && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x, 2) + '\n';

// ---------------------------------------------------------------- invariants

const notLowerRgb = (p: unknown) => strings(p).filter(([, h]) => !/^#[0-9a-f]{6}$/.test(h)).map(([at]) => at);
const pureBlack = (p: unknown) => strings(p).filter(([, h]) => h.toLowerCase() === '#000000').map(([at]) => at);
const notBlk36 = (p: { readonly crew: unknown }) => strings(p.crew).filter(([, h]) => !BLK_36.includes(h)).map(([at]) => `crew.${at}`);
/** Depth strengths are fractions (0..1, never 380 for 0.38) that only grow with distance. */
const depthViolations = (p: { readonly world: { readonly depth: readonly { readonly strength: number }[] } }) =>
  p.world.depth.flatMap(({ strength }, i, all) => strength < 0 || strength > 1 || strength < (all[i - 1]?.strength ?? 0)
    ? [`world.depth[${i}].strength ${strength}`] : []);
const tealMismatch = (p: { readonly accent: unknown }) => JSON.stringify(p.accent) === JSON.stringify({ teal: TEAL }) ? [] : ['accent'];

/** OKLCH lightness, chroma and hue (degrees) of an sRGB hex. */
function oklch(hex: string): { L: number; C: number; H: number } {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const [r, g, b] = [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), H: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

/**
 * The hue bands rings and clouds may never use (art-direction §4), in OKLCH hue degrees:
 * pink [330, 30), violet [285, 330), yellow [75, 115). A colour only counts as one of them if it
 * visibly carries the hue, at chroma ≥ 0.08, so creams like #f2d8b8 (C 0.05) and #fffaf0 pass.
 * Calibrated on the rejected v2 ring #ff86bf (pink, H 352), #8463e6 (violet, H 291), #ffd38a
 * (yellow, H 79) and the removed cloud mid-shadow #8f74b0 (violet, H 304).
 */
function bannedHue(hex: string): string | undefined {
  const { C, H } = oklch(hex);
  if (C < 0.08) return undefined;
  if (H >= 330 || H < 30) return 'pink';
  if (H >= 285) return 'violet';
  if (H >= 75 && H < 115) return 'yellow';
  return undefined;
}
/**
 * The one named exception: the cloud's warm-shadow ramp step #30285a (L 0.31, C 0.09, H 288), a deep
 * navy-plum one step above space that art-direction §4 sets explicitly (Cloud ramp, Halo).
 */
const APPROVED_SHADOWS = new Set(['#30285a']);

/**
 * Each biome's own ramps, as the asset viewer assigns them (viewer.js BIOMES, WEATHER and haze):
 * surface ramps, weather and lit-limb haze. Glow is in every biome's surface set.
 */
const BIOME_RAMPS = {
  lush: ['ocean', 'land', 'cap', 'glow', 'cloud'],
  ocean: ['water', 'land', 'cap', 'glow', 'cloud', 'haze.ocean'],
  ice: ['ice', 'crevasse', 'water', 'glow', 'haze.ice'],
  desert: ['sand', 'rock', 'cap', 'glow'],
  lava: ['crust', 'ash', 'glow'],
  gas: ['gasA', 'gasB', 'cap', 'glow'],
  moon: ['moon', 'glow'],
  toxic: ['sludge', 'toxic', 'fungus', 'glow', 'spore', 'haze.toxic'],
} as const;
const isBiome = (b: string): b is keyof typeof BIOME_RAMPS => Object.hasOwn(BIOME_RAMPS, b);

/**
 * The ring's family. What ships is one ring ramp shared by every biome, built from lush colours
 * (art-direction §4 Rings: ocean darkest, cloud cream, ocean step, pale ocean), so it may only use
 * ocean and cloud colours. Per-biome rings (`ring.<biome>`, the human's planned direction) may only
 * use that biome's own ramps. Clouds are a family ramp themselves (§4), so the hue ban is their check.
 */
function ringAndCloudViolations(p: { readonly world: object }): string[] {
  const w = p.world as Readonly<Record<string, unknown>>;
  const colours = (role: string) => hexes(role.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], w));
  const ring = w['ring'];
  const out: string[] = [];
  // [path, ramp, owner, owner's colours]
  const owned: [string, unknown, string, Set<string>][] = Array.isArray(ring)
    ? [['world.ring', ring, 'ocean or cloud', new Set([...colours('ocean'), ...colours('cloud')])]]
    : Object.entries(ring ?? {}).map(([b, ramp]) => {
      if (!isBiome(b)) out.push(`world.ring.${b} is not a biome`);
      return [`world.ring.${b}`, ramp, `the ${b} biome`, new Set(isBiome(b) ? BIOME_RAMPS[b].flatMap(colours) : [])];
    });
  for (const [path, ramp, owner, family] of owned) {
    for (const [at, h] of strings(ramp, path)) if (!family.has(h)) out.push(`${at} ${h} is not from ${owner}`);
  }
  for (const [at, h] of [...strings(ring, 'world.ring'), ...strings(w['cloud'], 'world.cloud')]) {
    const band = APPROVED_SHADOWS.has(h) ? undefined : bannedHue(h);
    if (band) out.push(`${at} ${h} is ${band}`);
  }
  return out;
}

// ---------------------------------------------------------------- colour literals in source

/**
 * Colour literals: hex (#rgb, #rgba, #rrggbb, #rrggbbaa) anywhere a value can stand, including unquoted
 * CSS like `linear-gradient(#f00, #000)` and `1px solid #fff` (Qodo PR #13); 0xrrggbb; CSS
 * rgb()/rgba()/hsl()/hsla(). Not counted: comments (so "Qodo #123" is fine); `#` glued to a name or
 * path (`this.#fade`, `&#123;`, a URL fragment `/#top`); and a `#name` that opens a declaration (a TS
 * `#private` member or a CSS id selector: first on its line or after `{`, `}` or `;`, past modifiers).
 * Not covered: colours written as GLSL vec3/vec4 floats, which need a shader-aware check.
 */
const COLOUR_LITERAL = /(?<![\w.$#&/])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b0x[0-9a-f]{6}\b|\b(?:rgba?|hsla?)\(/gi;
const DECLARATION = /(?:^|[{};])\s*(?:(?:static|readonly|async|get|set|declare|override|accessor|\*)\s+)*$/;
// Block, HTML and line comments; `//` right after `:` is a URL, not a comment.
const COMMENT = /\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(?<!:)\/\/.*$/gm;
function colourLiterals(text: string): string[] {
  const code = text.replace(COMMENT, '');
  return [...code.matchAll(COLOUR_LITERAL)]
    .filter((m) => !m[0].startsWith('#') || !DECLARATION.test(code.slice(code.lastIndexOf('\n', m.index - 1) + 1, m.index)))
    .map((m) => m[0]);
}
const PALETTE_MODULE = 'src/core/palette.ts';
const SOURCE = /\.(?:[cm]?[jt]sx?|glsl|vert|frag|css|html)$/;

/** Source files under `dir`, repo-relative with '/' separators; never enters node_modules or dist. */
function sourceFiles(dir: string): string[] {
  if (!existsSync(join(ROOT, dir))) return [];
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const path = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'dist' ? [] : sourceFiles(path);
    return SOURCE.test(e.name) ? [path] : [];
  });
}

// ---------------------------------------------------------------- tests

describe('palette', () => {
  it('matches the pinned fixture (update deliberately with UPDATE_GOLDEN=1 and a Golden-Update: reason)', () => {
    const json = sortedJson(palette);
    if (process.env['UPDATE_GOLDEN'] === '1') writeFileSync(GOLDEN, json);
    expect(json).toBe(readFileSync(GOLDEN, 'utf8'));
  });

  it('is frozen, so nothing can retune it at runtime', () => {
    expect(() => { (palette.world.ocean as unknown as string[])[2] = '#ff00ff'; }).toThrow(TypeError);
    expect(palette.world.ocean[2]).toBe('#2b6ee0');
  });

  it('writes every colour as lowercase #rrggbb', () => {
    expect(hexes(palette).length).toBeGreaterThan(100);
    expect(notLowerRgb(palette)).toEqual([]);
    const b = broken();
    b.world.cap[3] = '#FFFFFF';
    b.world.halo = '#fff';
    expect(notLowerRgb(b)).toEqual(['world.cap[3]', 'world.halo']);
  });

  it('has no pure black anywhere', () => {
    expect(pureBlack(palette)).toEqual([]);
    const b = broken();
    b.world.space = '#000000';
    b.crew.visor[0] = '#000000';
    expect(pureBlack(b)).toEqual(['world.space', 'crew.visor[0]']);
  });

  it('takes every crew colour unchanged from published BLK 36', () => {
    expect(notBlk36(palette)).toEqual([]);
    const b = broken();
    b.crew.suit[0] = '#4186d8'; // retuned by one step
    expect(notBlk36(b)).toEqual(['crew.suit[0]']);
  });

  it('has exactly the four [OIII] teal accent values', () => {
    expect(tealMismatch(palette)).toEqual([]);
    const extra = broken();
    extra.accent.teal.push('#9cfff0');
    expect(tealMismatch(extra)).toEqual(['accent']);
    const retuned = broken();
    retuned.accent.teal[3] = '#00ffd4';
    expect(tealMismatch(retuned)).toEqual(['accent']);
  });

  it('gives depth strengths as the §5 fractions, rising with distance', () => {
    expect(palette.world.depth.map((s) => s.strength)).toEqual([0, 0.38, 0.72, 0.88]);
    expect(depthViolations(palette)).toEqual([]);
    const b = broken();
    b.world.depth[1]!.strength = 380; // a permille value slipped in
    b.world.depth[3]!.strength = 0.5; // fades less than the step before it
    expect(depthViolations(b)).toEqual(['world.depth[1].strength 380', 'world.depth[2].strength 0.72', 'world.depth[3].strength 0.5']);
  });

  it('draws rings from the planet family and keeps rings and clouds off pink, violet and yellow', () => {
    expect(ringAndCloudViolations(palette)).toEqual([]);
    const b = broken();
    b.world.ring[2] = '#ff86bf'; // the rejected v2 pink ring
    b.world.ring[3] = '#ffd38a'; // the rejected v2 yellow speck
    b.world.cloud[1] = '#8f74b0'; // the removed purple cloud mid-shadow
    expect(ringAndCloudViolations(b)).toEqual([
      'world.ring[2] #ff86bf is not from ocean or cloud',
      'world.ring[3] #ffd38a is not from ocean or cloud',
      'world.ring[2] #ff86bf is pink',
      'world.ring[3] #ffd38a is yellow',
      'world.cloud[1] #8f74b0 is violet',
    ]);
    const fungus = broken();
    fungus.world.ring[0] = '#381444'; // dark toxic-fungus violet: another biome's colour
    fungus.world.ring[2] = '#c678d2'; // light toxic-fungus violet
    fungus.world.cloud[0] = '#29174c'; // a dark violet in place of the approved shadow
    expect(ringAndCloudViolations(fungus)).toEqual([
      'world.ring[0] #381444 is not from ocean or cloud', 'world.ring[2] #c678d2 is not from ocean or cloud',
      'world.ring[0] #381444 is violet', 'world.ring[2] #c678d2 is violet', 'world.cloud[0] #29174c is violet',
    ]);
  });

  it('checks a per-biome ring (ring.<biome>) against that biome\'s own ramps', () => {
    const withRings = (ring: unknown) => {
      const b = broken();
      (b.world as unknown as { ring: unknown }).ring = ring;
      return ringAndCloudViolations(b);
    };
    // Built from each biome's own ramps: rock and sand; crevasse and ice. Not proposed colours, just test data.
    expect(withRings({ desert: ['#2e1c14', '#7a4c30', '#d8944a'], ice: ['#16234e', '#3a64b0', '#e6f4ff'] })).toEqual([]);
    expect(withRings({ desert: ['#2e1c14', '#2b6ee0', '#a4744c'] })).toEqual(['world.ring.desert[1] #2b6ee0 is not from the desert biome']);
    expect(withRings({ swamp: ['#2e1c14'] })).toEqual(['world.ring.swamp is not a biome', 'world.ring.swamp[0] #2e1c14 is not from the swamp biome']);
    expect(withRings({ toxic: ['#381444', '#c678d2'] })).toEqual(['world.ring.toxic[0] #381444 is violet', 'world.ring.toxic[1] #c678d2 is violet']);
  });

  it('is the only source file with colour literals', () => {
    const files = [...sourceFiles('src'), ...sourceFiles('web')];
    expect(files.length).toBeGreaterThan(10);
    expect(files).toContain(PALETTE_MODULE);
    expect(colourLiterals(readFileSync(join(ROOT, PALETTE_MODULE), 'utf8')).length).toBeGreaterThan(100);
    const offenders = files.filter((f) => f !== PALETTE_MODULE)
      .flatMap((f) => colourLiterals(readFileSync(join(ROOT, f), 'utf8')).map((c) => `${f}: ${c}`));
    expect(offenders).toEqual([]);
    expect(colourLiterals("renderer.setClearColor(0x000000); const c = '#FF00FF', d = \"#fff\";\nbody { color: #0d0b16; fill: rgb(0, 0, 0); }"))
      .toEqual(['0x000000', '#FF00FF', '#fff', '#0d0b16', 'rgb(']);
    expect(colourLiterals('background: linear-gradient(#ff0000, #000000);\nborder: 1px solid #fff;\nconst c = [#0d0b16];'))
      .toEqual(['#ff0000', '#000000', '#fff', '#0d0b16']);
    expect(colourLiterals('// Qodo #123, issue #5\n/* see #abc */ <!-- #fed -->\nclass A { #decade = 1;\n  static #fade() { return this.#facade ?? &#123; }\n  #bad?: string;\n}\n#face { color: red; }\nconst u = "https://x.test/#add";'))
      .toEqual([]);
  });
});
