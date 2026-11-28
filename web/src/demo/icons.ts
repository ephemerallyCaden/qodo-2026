// The legend's little pictures (live-demo L3): hand-drawn pixel icons in the palette's own colours,
// drawn on small canvases at whole-pixel scale outside the pixel pass, like the labels (art-direction §3).
// Each is a mask of letters, one colour per letter, or a lit disc from a planet ramp. No randomness: the
// same icon is the same pixels every time.
import { palette } from '../../../src/core/palette.js';
import { BEACON_SHAPE } from '../render/beacons.js';

/** One icon: rows of letters, and the colour of each letter ('.' is clear). */
export interface PixelIcon { rows: readonly string[]; colours: Readonly<Record<string, string>> }

const W = palette.world;
const R = 6; // a disc's radius in icon pixels
const SIZE = 2 * R + 1;
/** The key light, from the top left (art-direction §6). */
const LIGHT = (() => { const l = [-0.55, 0.6, 0.58]; const n = Math.hypot(...l); return l.map((v) => v / n) as [number, number, number]; })();
/** A fixed, seedless pattern for terrain patches (no clock, no Math.random). */
const patch = (x: number, y: number, k: number) => (((x * 7 + y * 13 + k * 5) ^ (x * y)) & 7) < 3;

type Surface = (x: number, y: number, band: 0 | 1 | 2) => string | null;

/** A disc lit from the key light in three flat bands; `surface` picks each pixel's letter, null for none. */
function disc(surface: Surface): readonly string[] {
  const rows: string[] = [];
  for (let y = 0; y < SIZE; y++) {
    let row = '';
    for (let x = 0; x < SIZE; x++) {
      const dx = (x - R) / (R + 0.5), dy = (R - y) / (R + 0.5);
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) { row += '.'; continue; }
      const lit = dx * LIGHT[0] + dy * LIGHT[1] + Math.sqrt(1 - d2) * LIGHT[2];
      row += surface(x, y, lit > 0.62 ? 2 : lit > 0.12 ? 1 : 0) ?? '.';
    }
    rows.push(row);
  }
  return rows;
}
/** Letters for a 3-band ramp: band 0 → `a`, 1 → `b`, 2 → `c` (or the given three). */
const bands = (abc: string) => (b: 0 | 1 | 2) => abc[b]!;

const healthyLush = (b: 0 | 1 | 2, x: number, y: number) => (patch(x, y, 1) ? bands('def')(b) : bands('abc')(b));
const lushColours = { a: W.ocean[0], b: W.ocean[2], c: W.ocean[3], d: W.land[1], e: W.land[2], f: W.land[3] };

/** The four health looks, worst first, and the three healthy varieties. */
export const HEALTH_ICONS: Readonly<Record<'lava' | 'toxic' | 'ash' | 'lush' | 'ocean' | 'ice', PixelIcon>> = {
  lava: {
    // near-black crust broken by glowing fissures (unlit, as in the product)
    rows: disc((x, y, b) => ((x + 2 * y) % 6 === 0 || (2 * x - y + 30) % 9 === 0 ? (b === 2 ? 'g' : 'h') : bands('abc')(b))),
    colours: { a: W.crust[1], b: W.crust[3], c: W.crust[4], g: W.glow[2], h: W.glow[1] },
  },
  toxic: {
    rows: disc((x, y, b) => (patch(x, y, 3) ? bands('def')(b) : bands('abc')(b))),
    colours: { a: W.toxic[0], b: W.toxic[2], c: W.toxic[4], d: W.sludge[1], e: W.sludge[3], f: W.sludge[4] },
  },
  ash: {
    // the desert look: dunes and dark-floored craters
    rows: disc((x, y, b) => ((x - 7) ** 2 + (y - 7) ** 2 <= 2 || (x - 3) ** 2 + (y - 8) ** 2 <= 1 ? 'd' : bands('abc')(b))),
    colours: { a: W.sand[0], b: W.sand[2], c: W.sand[3], d: W.sand[1] },
  },
  lush: { rows: disc((x, y, b) => healthyLush(b, x, y)), colours: lushColours },
  ocean: {
    rows: disc((x, y, b) => (patch(x, y, 5) && patch(y, x, 2) ? bands('def')(b) : bands('abc')(b))),
    colours: { a: W.water[0], b: W.water[2], c: W.water[3], d: W.land[1], e: W.land[2], f: W.land[3] },
  },
  ice: {
    rows: disc((x, y, b) => ((x + y) % 5 === 0 ? 'd' : bands('abc')(b))),
    colours: { a: W.ice[0], b: W.ice[2], c: W.ice[4], d: W.crevasse[1] },
  },
};

/** The three fog levels, drawn over the same lush planet: cloud, a little thin mist, nothing. */
export const FOG_ICONS: Readonly<Record<'fogged' | 'misted' | 'clear', PixelIcon>> = {
  fogged: {
    rows: disc((x, y, b) => {
      const cloud = ((x - 4) ** 2 + (y - 4) ** 2 <= 6) || ((x - 8) ** 2 + (y - 7) ** 2 <= 5) || ((x - 4) ** 2 + (y - 10) ** 2 <= 3);
      return cloud ? (b === 0 ? 'w' : 'v') : healthyLush(b, x, y);
    }),
    colours: { ...lushColours, v: W.cloud[1], w: W.cloud[0] },
  },
  misted: {
    rows: disc((x, y, b) => ((x * 3 + y * 5) % 11 === 0 && b > 0 ? 'v' : healthyLush(b, x, y))),
    colours: { ...lushColours, v: W.cloud[3] },
  },
  clear: { rows: disc((x, y, b) => healthyLush(b, x, y)), colours: lushColours },
};

/** The other things on the map: an agent drone, the crew's ship, a co-change line and its flag, a beacon, a test moon. */
export const THING_ICONS: Readonly<Record<'drone' | 'ship' | 'cochange' | 'flag' | 'beacon' | 'moon' | 'debris', PixelIcon>> = {
  drone: {
    rows: ['.....ss.....', '...ssttss...', '..sddddddss.', '.sdveevvedss', '.sdvvvvvvdss', '..sddddddss.', '...ssssss...', '....s..s....', '...m....m...'],
    colours: { s: palette.drone.claude.shell[1], t: palette.drone.claude.shell[3], d: palette.drone.claude.shell[2], v: palette.crew.visor[0], e: palette.accent.teal[3], m: palette.drone.claude.smoke[0] },
  },
  ship: {
    rows: ['....hhhh....', '..hhsssshh..', '.hsswsswsssh', '.hsswsswsssh', 'hssssssssssh', 'tttttttttttt', '.mmmmmmmmmm.', '..m..ff..m..', '.....ff.....'],
    colours: { h: palette.ship.hull.shell[1], s: palette.ship.hull.shell[2], w: palette.ship.hull.interior[0], t: palette.ship.hull.trim[2], m: palette.ship.hull.metal[2], f: palette.ship.hull.flame[2] },
  },
  cochange: {
    rows: ['oo..........', 'oo..........', '..rrHT......', '..rrHTrr....', '......rrrr..', '........rroo', '..........oo'],
    colours: { o: W.stars[1], r: W.stars[0], H: W.stars[2], T: W.stars[1] },
  },
  flag: {
    rows: ['.dd.....rrr.', 'dddd...r...r', 'ddddlllr...r', 'dddd...r...r', '.dd.....rrr.'],
    colours: { d: palette.accent.teal[2], l: palette.accent.teal[2], r: palette.accent.teal[3] },
  },
  beacon: { rows: BEACON_SHAPE, colours: { R: palette.crew.suit[1], C: palette.crew.glint, M: palette.crew.gear[3] } },
  moon: {
    rows: ['..aab..', '.abbcc.', 'abbccc.', 'abbbcc.', '.aabb..'],
    colours: { a: W.moonBody[0], b: W.moonBody[1], c: W.moonBody[2] },
  },
  // R13's stale PR, a comms satellite: a grey bus and dish between two solar wings, the red outline, a nav light
  debris: {
    rows: ['.....rr.....', '....rGGr....', 'rrrrrGGrrrrr', 'rdmdrGmrdmdl', 'rdmdrmmrdmdr', 'rrrrrmmrrrrr', '....rrrr....'],
    colours: { r: palette.debris.outline.bright, G: palette.debris.metal[3], m: palette.debris.metal[2], d: palette.debris.metal[0], l: palette.debris.light },
  },
};

/** An icon as a canvas: `scale` CSS px per icon pixel, drawn at whole device pixels. */
export function iconCanvas(icon: PixelIcon, scale: number, dpr: number): HTMLCanvasElement {
  const px = Math.max(1, Math.round(scale * dpr));
  const w = Math.max(...icon.rows.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = w * px;
  c.height = icon.rows.length * px;
  c.style.width = `${c.width / dpr}px`;
  c.style.height = `${c.height / dpr}px`;
  c.className = 'icon';
  c.setAttribute('aria-hidden', 'true');
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  icon.rows.forEach((row, y) => [...row].forEach((k, x) => {
    const colour = icon.colours[k];
    if (colour === undefined) return;
    ctx.fillStyle = colour;
    ctx.fillRect(x * px, y * px, px, px);
  }));
  return c;
}
