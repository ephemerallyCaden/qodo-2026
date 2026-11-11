// Brand drones (phase 2): one drone per supported agent provider, each a variation of D-final.
// A brand is a parameter set laid over D-final plus a palette (palette.js BRAND_PALETTES), so the
// family stays one family: same size class, head-is-body, thruster pack and smoke, screen face
// with a V2 eye, the full idle loop, BLK 36 colours. Each one borrows a silhouette, one or two
// signature features and a colour from its provider's mascot or logo. They are original designs:
// no logo is drawn and no brand is named inside the pixel pass (names are labels outside it).
// Per-session variety (R2b / A5): sessionLook(brand, session) hashes a session id into seeded
// details only (a trim swap, one small shape detail, personality), never the silhouette.
// Accessory drones (human, 2026-11-10): Copilot and Claude are D-final's exact shape plus one
// signature accessory and the brand palette (ACCESSORIES); the unknown agent is the generic drone.
import { FINAL } from './variants.js';
import { DEFAULTS, PARAM_BY_KEY, DRONE_EYE } from './params.js';
import { BRAND_PALETTES, OPTION_PALETTES } from './palette.js';
import { hashStr } from '../asset-viewer/faces.js';

// Eyes (V2 indices): 0 dots 1 cyclops 2 visor slit 3 binocular 4 three 5 happy 6 LED bar 7 heartbeat 8 slant 9 X;
// then the drone-only 10 pills (Copilot) and 11 prompt >_ (Codex), approved by the human (2026-11-10).
// Every other brand uses its closest V2 eye. `v2Eyes` is the V2 fallback a drone-only eye replaced,
// kept as a parameter option (`eyes`) but not rendered in the outputs.

// Accessories (human, 2026-11-10: "don't change the shape of the drone from generic ... just add
// cute goggles"; "same with claude ... just add the tentacles and orange"). An accessory drone is
// D-final's exact shape (head, saucer rim, antenna, under-jet, size, screen) and motion, plus one
// signature accessory and the brand's palette: only the accessory's own parameters and the face
// (FACE_KEYS) differ from D-final. Accessories take the accent slot (goggle lenses take the screen
// tones). Each brings its own seeded detail for per-session variety. Other brands could switch to
// the same pattern later. The human picked Copilot's own palette and Claude's legs; `tentacles` was
// Claude's option b, kept as a parameter set but not rendered.
export const ACCESSORIES = {
  goggles: {
    words: 'flat pilot goggles worn flush across the top of the screen: two lenses joined by a bridge, strapped round the head',
    params: { topper: 1, gogW: 0.048, gogH: 0.034, gogX: 0.42, gogY: 0.6, gogT: 0.012, gogFrame: 0.015, gogBridge: 1, gogStrap: 1, gogStrapY: 0.3 },
    detail: { key: 'gogY', min: 0.55, max: 0.65 },
  },
  legs: {
    words: 'four stubby legs in two pairs, hanging below the saucer',
    params: { skirt: 1, skirtN: 4, skirtL: 0.05, skirtR: 0.019, skirtSpread: 0.7, skirtZ: 0.55 },
    detail: { key: 'skirtL', min: 0.044, max: 0.056 },
  },
  tentacles: {
    words: 'six curling tentacles under the saucer, swaying with the bob',
    params: { skirt: 2, skirtN: 6, skirtL: 0.06, skirtR: 0.015, skirtSpread: 0.86, skirtCurl: 0.8, skirtWave: 0.006 },
    detail: { key: 'skirtL', min: 0.054, max: 0.066 },
  },
  'antenna star': {
    words: 'a small puffy four-point sparkle on the antenna in place of its tip, its tips in the four Gemini colours',
    params: { starPart: 1, starR: 0.06, starT: 0.42 },
    detail: { key: 'starR', min: 0.057, max: 0.063 },
  },
};
/** The face keys an accessory drone may set besides its accessory: its eye and its working glyphs. */
export const FACE_KEYS = ['eyes', 'glyphSet'];

const ENTRIES = [
  {
    id: 'claude', name: 'Claude Code', covers: 'Claude Code (CLI, web, Action)',
    mascot: 'Clawd, the CLI block-pixel critter: terracotta, two eye notches, four stubby legs',
    signature: "the generic drone's exact shape in terracotta orange, with Clawd's four stubby legs under the saucer; works with an asterisk spinner",
    accessory: 'legs', face: { eyes: 0, glyphSet: 1 },
    trims: [['#3f233c', '#872a38', '#cc5250', '#ff6866'], ['#3f233c', '#872a38', '#cc5250', '#ff965f'], ['#872a38', '#cc5250', '#ff965f', '#ffe091']],
  },
  {
    id: 'cursor', name: 'Cursor', covers: 'Cursor (IDE, CLI, cloud agent)',
    mascot: 'logo only: an isometric hexagonal cube with a light arrow facet',
    signature: 'a crisp graphite cube with a white top facet and a flat screen, sputtering precise dots',
    params: {
      rim: 0, antenna: 0,
      headW: 0.104, headH: 0.1, headD: 0.104, headRound: 0, headCorner: 0.16, headTaper: 1, headFlat: 0,
      accent: 4, accentY: 0.82,
      screenW: 0.74, screenH: 0.6, screenY: -0.08, screenRound: 8, bezel: 0.08, eyes: 6, screenFlat: 1,
      thrusters: 1, thrR: 0.028, thrL: 0.02, thrFlare: 0.9,
      smoke: 2, puffSize: 1.1, puffRate: 0.55, sparkles: 0,
      bobAmp: 0.02, drift: 0.14, bank: 0.18, lookYaw: 0.28,
    },
    detail: { key: 'headCorner', min: 0.12, max: 0.2 },
    trims: [['#464b8c', '#909edd', '#c1d9f2', '#ffffff'], ['#293268', '#6b74b2', '#c1d9f2', '#ffffff'], ['#6b74b2', '#909edd', '#ffffff', '#ffffff']],
  },
  {
    id: 'copilot', name: 'GitHub Copilot', covers: 'GitHub Copilot (cloud agent, CLI, app, VS Code)',
    mascot: 'the goggled head (its goggles kept with GitHub\'s permission, human 2026-11-10): goggles above upright pill eyes',
    signature: "the generic drone's exact shape in blue to violet, with flat pilot goggles across the top of its screen (two lenses joined by a bridge, strapped round the head) above upright pill eyes",
    accessory: 'goggles', face: { eyes: DRONE_EYE.pills },
    v2Eyes: 0, // Dots
    trims: [['#354ab2', '#4185d8', '#5ab9e5', '#a5e6ff'], ['#36277f', '#4185d8', '#5ab9e5', '#ffffff'], ['#643499', '#8c51cc', '#b991f2', '#a5e6ff']],
  },
  {
    id: 'codex', name: 'OpenAI Codex', covers: 'OpenAI Codex (CLI, cloud)',
    mascot: 'Codey, the Codex pet: one smooth cloud-blob head, mid blue, with a big dark rounded screen face and >_ glyph eyes',
    signature: 'one smooth mid-blue cloud head (five broad, low lobes blended into one shape) round a big dark navy screen with >_ prompt eyes; works in prompt characters',
    params: {
      rim: 0, antenna: 0,
      headW: 0.122, headH: 0.098, headD: 0.11, headRound: 0.9, headCorner: 0.6, headTaper: 1, headFlat: 0.2,
      crown: 1, crownN: 5, crownR: 0.052, crownArc: 1.75, crownOut: -0.3, crownK: 0.032, crownZ: -0.1,
      screenW: 0.82, screenH: 0.6, screenY: 0.02, screenRound: 4.5, bezel: 0.08, eyes: DRONE_EYE.prompt,
      thrusters: 0, thrR: 0.026, thrL: 0.022, thrSpread: 0.55, thrFlare: 1.1,
      smoke: 0, puffSize: 1.15, puffRate: 0.45, sparkles: 1, glyphSet: 3,
      bobAmp: 0.03, drift: 0.16, bank: 0.26, lookYaw: 0.4,
    },
    v2Eyes: 5, // Happy
    detail: { key: 'crownR', min: 0.049, max: 0.055 },
    trims: [['#293268', '#354ab2', '#4185d8', '#5ab9e5'], ['#354ab2', '#4185d8', '#5ab9e5', '#a5e6ff'], ['#293268', '#4185d8', '#5ab9e5', '#a5e6ff']],
  },
  {
    id: 'google', name: 'Google', covers: 'Google: Jules, Gemini CLI, Antigravity (one drone)',
    mascot: 'the Jules octopus: a domed head, two oval eyes, curled tentacles (the site\'s pixel avatar is purple)',
    signature: 'a tall purple dome on a ring of six curling tentacles that sway in time with the bob',
    params: {
      rim: 0, antenna: 0,
      headW: 0.104, headH: 0.112, headD: 0.1, headRound: 1, headCorner: 0.6, headTaper: 1, headFlat: 0.42,
      skirt: 2, skirtN: 6, skirtL: 0.055, skirtR: 0.014, skirtSpread: 0.86, skirtCurl: 0.8, skirtWave: 0.006,
      screenW: 0.72, screenH: 0.42, screenY: -0.02, screenRound: 3, bezel: 0.14, eyes: 0,
      thrusters: 1, thrR: 0.026, thrL: 0.018, thrFlare: 0.9,
      smoke: 0, puffSize: 0.9, puffRate: 0.35, sparkles: 1,
      bobAmp: 0.036, drift: 0.15, bank: 0.24, lookYaw: 0.4,
    },
    detail: { key: 'skirtL', min: 0.042, max: 0.054 },
    trims: [['#8c51cc', '#b991f2', '#ffffff', '#ffffff'], ['#643499', '#8c51cc', '#b991f2', '#ffffff'], ['#354ab2', '#4185d8', '#b991f2', '#ffffff']],
  },
  {
    id: 'devin', name: 'Devin', covers: 'Devin (cloud, CLI, Devin Desktop, formerly Windsurf)',
    mascot: 'logo only: three joined white hexagons on near-black',
    signature: 'a near-black hexagonal head between two white hexagonal side pods (three hexagons in a row), three eyes',
    params: {
      rim: 0, antenna: 0,
      headHex: 1, headW: 0.094, headH: 0.112, headD: 0.07, headRound: 0, headCorner: 0.16, headTaper: 1, headFlat: 0,
      ears: 3, earR: 0.04, earT: 0.03, earY: 0,
      screenW: 0.74, screenH: 0.42, screenY: 0.04, screenRound: 6, bezel: 0.12, eyes: 4, screenFlat: 1,
      thrusters: 1, thrR: 0.028, thrL: 0.02, thrFlare: 0.9,
      smoke: 0, puffSize: 0.95, puffRate: 0.4, sparkles: 0,
      bobAmp: 0.026, drift: 0.15, bank: 0.24, lookYaw: 0.32,
    },
    detail: { key: 'earR', min: 0.036, max: 0.044 },
    trims: [['#6b74b2', '#c1d9f2', '#ffffff', '#ffffff'], ['#909edd', '#c1d9f2', '#ffffff', '#ffffff'], ['#464b8c', '#909edd', '#c1d9f2', '#ffffff']],
  },
  {
    id: 'kiro', name: 'Kiro', covers: 'Kiro (CLI, IDE, cloud agent) and Amazon Q',
    mascot: 'the Kiro ghost: a white dome with a wavy hem and two black oval eyes',
    signature: 'a white ghost dome with a scalloped hem that wobbles, shaded in Kiro purple, trailing wisps; floats high',
    params: {
      rim: 0, antenna: 0,
      headW: 0.1, headH: 0.118, headD: 0.095, headRound: 1, headCorner: 0.6, headTaper: 1.18, headFlat: 0.35,
      skirt: 3, skirtN: 7, skirtR: 0.024, skirtSpread: 0.92, skirtWave: 0.004,
      screenW: 0.6, screenH: 0.36, screenY: 0.24, screenRound: 2.6, bezel: 0.1, eyes: 0,
      thrusters: 1, thrR: 0.028, thrL: 0.02, thrFlare: 0.9,
      smoke: 1, puffSize: 1, puffRate: 0.5, sparkles: 0,
      bobAmp: 0.045, drift: 0.18, bank: 0.3, lookYaw: 0.36,
    },
    detail: { key: 'skirtR', min: 0.021, max: 0.027 },
    trims: [['#412866', '#643499', '#8c51cc', '#b991f2'], ['#29174c', '#412866', '#643499', '#8c51cc'], ['#643499', '#8c51cc', '#b991f2', '#ffffff']],
  },
  {
    id: 'opencode', name: 'OpenCode', covers: 'OpenCode (CLI, GitHub agent)',
    mascot: 'logo only: a pixel block "O", a light square ring round a dark-over-grey core',
    signature: 'a tall sharp white block, its square screen a thick ring round a dark-over-grey split core; a cyclops ring eye',
    params: {
      rim: 0, antenna: 0,
      headW: 0.094, headH: 0.118, headD: 0.088, headRound: 0, headCorner: 0.1, headTaper: 1, headFlat: 0,
      screenW: 0.5, screenH: 0.42, screenY: 0.02, screenRound: 10, bezel: 0.5, eyes: 1, screenSplit: 1, splitY: -0.12, screenFlat: 1,
      thrusters: 1, thrR: 0.026, thrL: 0.02, thrFlare: 0.9,
      smoke: 2, puffSize: 1.1, puffRate: 0.5, sparkles: 0,
      bobAmp: 0.022, drift: 0.14, bank: 0.2, lookYaw: 0.28,
    },
    detail: { key: 'bezel', min: 0.44, max: 0.56 },
    trims: [['#909edd', '#c1d9f2', '#ffffff', '#ffffff'], ['#6b74b2', '#909edd', '#c1d9f2', '#ffffff'], ['#c1d9f2', '#ffffff', '#ffffff', '#ffffff']],
  },
  {
    id: 'qodo', name: 'Qodo', covers: 'Qodo (the code-review bot and its fix commits)',
    mascot: 'the white anteater in a purple hoodie, with classic black sunglasses, on a skateboard',
    signature: 'a white hooded head with a long white snout tipped purple and black sunglasses for a face, no eyes; purple in its boosters, a hem band and its nose tip; reviews: head dipped, a glint sweeping across the lenses line by line',
    params: {
      rim: 0, antenna: 0,
      headW: 0.112, headH: 0.098, headD: 0.112, headRound: 0.9, headCorner: 0.6, headTaper: 1.05, headFlat: 0.2,
      snout: 1, snoutL: 0.09, snoutR: 0.024, snoutY: -0.28, snoutDrop: 0.35,
      ears: 1, earR: 0.026, earT: 0.012, earY: 0.55,
      snoutTip: 0.3, // a purple nose tip (human, 2026-11-11)
      screenW: 0.78, screenH: 0.5, screenY: 0.32, screenRound: 4, bezel: 0.14, eyes: 8, eyeScale: 0.8, screenShades: 1,
      noEyes: 1, // just the sunglasses (human, 2026-11-11: "remove the angry teal eyes")
      thrAccent: 1, accent: 1, accentY: -0.65, accentW: 0.12, // purple boosters and a hoodie hem band
      thrusters: 0, thrR: 0.024, thrL: 0.022, thrSpread: 0.6, thrFlare: 1.1,
      smoke: 0, puffSize: 0.95, puffRate: 0.4, sparkles: 1, glyphSet: 4, workNod: 0.2, // reviews: head dipped, a glint sweeping across the lenses
      bobAmp: 0.028, drift: 0.2, bank: 0.32, lookYaw: 0.3, size: 1.5,
    },
    detail: { key: 'snoutL', min: 0.082, max: 0.098 },
    trims: [['#909edd', '#c1d9f2', '#ffffff', '#ffffff'], ['#6b74b2', '#c1d9f2', '#ffffff', '#ffffff'], ['#b991f2', '#c1d9f2', '#ffffff', '#ffffff']],
  },
  {
    id: 'generic', name: 'generic', covers: 'every other detected tool, labelled with its name',
    mascot: '-',
    signature: 'D-final exactly, with the tool name as a text label',
    params: {},
    detail: { key: 'antL', min: 0.04, max: 0.05 },
    trims: [['#6b74b2', '#909edd', '#c1d9f2', '#ffffff'], ['#464b8c', '#6b74b2', '#c1d9f2', '#ffffff']],
  },
  {
    // The generic drone exactly (human, 2026-11-10: "unknown should use generic"), labelled "unknown agent".
    id: 'unknown', name: 'unknown agent', covers: 'agent evidence with no known tool, labelled "unknown agent"',
    mascot: '-',
    signature: 'the generic drone exactly (D-final), with "unknown agent" as its label',
    sameAs: 'generic',
  },
];
const ENTRY_BY_ID = Object.fromEntries(ENTRIES.map((e) => [e.id, e]));

// One normaliser: D-final, then the accessory, the face and the brand's own parameters. A `sameAs`
// drone takes its twin's parameters, seeded details and palette (only its label differs).
export const BRANDS = ENTRIES.map((e) => {
  const b = e.sameAs ? { ...ENTRY_BY_ID[e.sameAs], ...e } : e;
  return {
    ...b,
    params: { ...DEFAULTS, ...FINAL.params, ...ACCESSORIES[b.accessory]?.params, ...b.face, ...b.params },
    detail: b.detail ?? ACCESSORIES[b.accessory].detail,
    palette: BRAND_PALETTES[b.sameAs ?? b.id],
  };
});

export const BRAND_BY_ID = Object.fromEntries(BRANDS.map((b) => [b.id, b]));
/** The nine providers with a custom drone (not generic or unknown). */
export const PROVIDERS = BRANDS.filter((b) => b.id !== 'generic' && b.id !== 'unknown');
/** The drones A4 measures: a `sameAs` drone is its twin (only the label differs), so it isn't measured again. */
export const DISTINCT = BRANDS.filter((b) => !b.sameAs);

// Google options (human, 2026-11-11): "for the google bot, I want to completely redesign it ... inspired
// by the google gemini logo ... do 5 variations I can pick from". The Gemini sparkle is a four-point
// star with deeply concave sides and rounded tips, a soft gradient from red at the top, yellow on the
// left and green at the bottom to blue on the right and in the middle. Each option maps that gradient
// to flat quadrant panels of BLK 36 (palette.js OPTION_PALETTES `tints`: top, left, bottom, right) on
// a different idea. They're normalised like the brand drones but aren't in BRANDS: the current Google
// drone stays until the human picks, so the asset library's catalogue is unchanged.
const OPTION_ENTRIES = [
  {
    id: 'g1', name: 'G1 · Sparkle', brand: 'google',
    look: 'head-is-body: the drone is a puffy four-point sparkle, its tips in the four Gemini colours, with a round screen in its blue middle',
    params: {
      rim: 0, antenna: 0,
      headStar: 1, headW: 0.15, headH: 0.15, headD: 0.06, headRound: 0, starCurve: 1.15, starTip: 0.08, quadTint: 1,
      screenW: 0.4, screenH: 0.4, screenY: 0, screenRound: 2, bezel: 0.2, eyes: 0,
      thrusters: 0, thrR: 0.02, thrL: 0.018, thrSpread: 0.9, thrFlare: 1,
      smoke: 0, puffSize: 0.9, puffRate: 0.4, sparkles: 3,
      bobAmp: 0.035, drift: 0.16, bank: 0.28, lookYaw: 0.4,
    },
    detail: { key: 'starCurve', min: 1.1, max: 1.2 },
    trims: [['#909edd', '#c1d9f2', '#ffffff', '#ffffff'], ['#6b74b2', '#c1d9f2', '#ffffff', '#ffffff']],
  },
  {
    id: 'g2', name: 'G2 · Star antenna', brand: 'google',
    look: "the generic drone's exact shape in white, a big four-colour sparkle on its antenna in place of the tip",
    accessory: 'antenna star', face: {},
    trims: [['#354ab2', '#4185d8', '#5ab9e5', '#a5e6ff'], ['#36277f', '#354ab2', '#4185d8', '#5ab9e5']],
  },
  {
    id: 'g3', name: 'G3 · Sparkle visor', brand: 'google',
    look: "the generic drone's exact shape in Gemini's light blue, its screen a four-point sparkle framed in the four Gemini colours, small dot eyes in the middle",
    face: { screenStar: 1, quadTint: 2, bezel: 0.24, screenW: 0.9, screenH: 0.62, screenY: 0.2, eyes: 0, eyeScale: 0.6 },
    detail: { key: 'antL', min: 0.04, max: 0.05 },
    trims: [['#909edd', '#c1d9f2', '#ffffff', '#ffffff'], ['#6b74b2', '#c1d9f2', '#ffffff', '#ffffff']],
  },
  {
    id: 'g4', name: 'G4 · Compass fins', brand: 'google',
    look: 'a round light-blue core with four tapered fins pointing up, left, down and right in the four Gemini colours (a sparkle drawn as a compass)',
    params: {
      rim: 0, antenna: 0,
      headW: 0.1, headH: 0.1, headD: 0.1, headRound: 1, headCorner: 0.6, headTaper: 1, headFlat: 0,
      fins: 1, finL: 0.06, finR: 0.03, finTip: 0.3,
      screenW: 0.7, screenH: 0.55, screenY: 0, screenRound: 3, bezel: 0.14, eyes: 5,
      thrusters: 0, thrR: 0.02, thrL: 0.018, thrSpread: 0.9, thrFlare: 1,
      smoke: 0, puffSize: 0.9, puffRate: 0.4, sparkles: 2,
      bobAmp: 0.03, drift: 0.16, bank: 0.28, lookYaw: 0.4,
    },
    detail: { key: 'finL', min: 0.055, max: 0.065 },
    trims: [['#354ab2', '#4185d8', '#5ab9e5', '#a5e6ff'], ['#36277f', '#354ab2', '#4185d8', '#5ab9e5']],
  },
  {
    id: 'g5', name: 'G5 · Orbiting sparkle', brand: 'google',
    look: 'a Gemini-blue egg with a wraparound visor band, and a small four-colour sparkle orbiting its crown once per 6 s, spinning as it goes',
    params: {
      rim: 0, antenna: 0,
      headW: 0.1, headH: 0.13, headD: 0.105, headRound: 1, headCorner: 0.6, headTaper: 1, headFlat: 0.25,
      starPart: 2, starR: 0.042, starT: 0.42, orbR: 1.5, orbY: 0.7, orbTilt: 0.25, orbSpin: 2,
      screenW: 1.6, screenH: 0.35, screenY: 0.05, screenRound: 4, bezel: 0.1, eyes: 0,
      thrusters: 1, thrR: 0.03, thrL: 0.018, thrFlare: 0.9,
      smoke: 0, puffSize: 0.9, puffRate: 0.4, sparkles: 2,
      bobAmp: 0.035, drift: 0.16, bank: 0.28, lookYaw: 0.4,
    },
    detail: { key: 'orbY', min: 0.65, max: 0.75 },
    trims: [['#909edd', '#c1d9f2', '#ffffff', '#ffffff'], ['#6b74b2', '#c1d9f2', '#ffffff', '#ffffff']],
  },
];
export const GOOGLE_OPTIONS = OPTION_ENTRIES.map((o) => ({
  ...o,
  params: { ...DEFAULTS, ...FINAL.params, ...ACCESSORIES[o.accessory]?.params, ...o.face, ...o.params },
  detail: o.detail ?? ACCESSORIES[o.accessory].detail,
  palette: OPTION_PALETTES[o.id],
}));
export const OPTION_BY_ID = Object.fromEntries(GOOGLE_OPTIONS.map((o) => [o.id, o]));

// The Gemini sparkle's colours, sampled from the human's reference (21 x 21 px means; the soft blends
// between them aren't mapped: each quadrant is one flat ramp), -> BLK 36 for palette.js GEMINI_TINTS.
// `note` flags a pick to keep an eye on. lab.mjs adds the nearest entries and the OKLab distances.
export const GEMINI_COLOURS = [
  { part: 'top tip (coral red)', quad: 0, hex: '#df525f', chosen: ['#cc5250'], why: '' },
  { part: 'left side (orange)', quad: 1, hex: '#e2992d', chosen: ['#ff965f'], why: '' },
  { part: 'left tip (yellow)', quad: 1, hex: '#d4c02c', chosen: ['#ffe091'], why: '', note: 'a loose match (0.129): BLK 36 has no saturated yellow, so the left tip reads cream-yellow over an orange shade' },
  { part: 'bottom tip (green)', quad: 2, hex: '#2bb67b', chosen: ['#42bc7f'], why: '', note: "0.041 from the [OIII] event teal #00bc9c, and the green ramp's #22896e is 0.043 from #007c66: closer than the teal slate the brand drones avoid (0.037). It's a lit body colour, never emissive, and only the bottom quadrant, beside red, yellow and blue" },
  { part: 'right tip and middle (blue)', quad: 3, hex: '#3287ff', chosen: ['#4185d8'], why: '' },
];

// Per-session seeded details: personality ranges every brand shares (applied round the brand's
// own value, clamped to the parameter's range), plus each brand's one shape detail and trims.
export const SESSION_VARY = { puffRate: 0.08, gaze: 1, glance: 1, lookYaw: 0.06 };
export const SESSION_SPARKLES = 2; // up to +- this many sparkles

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clampTo = (key, v) => { const p = PARAM_BY_KEY[key]; return Math.min(p.max, Math.max(p.min, v)); };

/**
 * One session's look: the brand's drone with seeded details only. Same session id, same look.
 * Returns { params, palette, phase, trim } (phase: a time offset in seconds, so sessions bob out of step).
 */
export function sessionLook(brandId, session) {
  const b = BRAND_BY_ID[brandId] ?? OPTION_BY_ID[brandId]; // a brand drone, or a Google option
  if (session == null) return { params: b.params, palette: b.palette, phase: 0, trim: -1 };
  const rnd = mulberry32(hashStr(`${brandId}:${session}`));
  const params = { ...b.params };
  for (const [k, d] of Object.entries(SESSION_VARY)) params[k] = clampTo(k, b.params[k] + (rnd() * 2 - 1) * d);
  params.sparkles = clampTo('sparkles', b.params.sparkles + Math.round((rnd() * 2 - 1) * SESSION_SPARKLES));
  params[b.detail.key] = b.detail.min + rnd() * (b.detail.max - b.detail.min);
  const trim = Math.floor(rnd() * b.trims.length) % b.trims.length;
  return { params, palette: { ...b.palette, trim: b.trims[trim] }, phase: Math.floor(rnd() * 120) / 10, trim };
}

// Brand colour -> BLK 36, for the README and params.md (lab.mjs adds the nearest entries and
// OKLab distances). `chosen` is what the palette uses; `why` explains any pick that isn't the nearest.
export const BRAND_COLOURS = [
  { brand: 'claude', part: 'Clawd terracotta', hex: '#d77757', chosen: ['#ff965f', '#cc5250'], why: 'The nearest, #ff6866, is a pink-red coral (hue 24° against the brand\'s 39°) and the coral contributor\'s brightest tone. The lit front takes #ff965f (the hue) and turned faces take #cc5250 (the lightness), so the shell averages to a terracotta orange.' },
  { brand: 'cursor', part: 'near-black', hex: '#14120b', chosen: ['#12173d'], why: '' },
  { brand: 'cursor', part: 'cream (light facet)', hex: '#f0efea', chosen: ['#ffffff'], why: '' },
  { brand: 'cursor', part: 'cube grey', hex: '#43413c', chosen: ['#293268', '#464b8c'], why: 'The nearest, #0f4a4c, is a teal slate 0.037 from the [OIII] event teal #004538, so it would read as an event. The gear greys read as graphite.' },
  { brand: 'copilot', part: 'head blue', hex: '#2f5bff', chosen: ['#354ab2'], why: 'Tied with #4185d8 (0.125). #354ab2 keeps it off the suit ramp and apart from Codex.' },
  { brand: 'copilot', part: 'head lilac', hex: '#b18cff', chosen: ['#8c51cc'], why: 'The nearest, #b991f2, washes the lit shell out to Kiro\'s lilac. One step darker keeps the blue-to-violet read.' },
  { brand: 'copilot', part: 'goggle frames', hex: '#5cc8ff', chosen: ['#5ab9e5'], why: '' },
  { brand: 'codex', part: 'Codey blue, lit (human\'s reference, 2026-11-10)', hex: '#4a6cf0', chosen: ['#4185d8'], why: '' },
  { brand: 'codex', part: 'Codey shaded rim (estimated from the reference)', hex: '#3a52c0', chosen: ['#354ab2'], why: '' },
  { brand: 'codex', part: 'Codey screen', hex: '#232d66', chosen: ['#293268'], why: '' },
  { brand: 'google', part: 'Jules purple', hex: '#642cc2', chosen: ['#643499'], why: '' },
  { brand: 'devin', part: 'near-black', hex: '#0e1015', chosen: ['#12173d'], why: '' },
  { brand: 'devin', part: 'hexagons', hex: '#ffffff', chosen: ['#ffffff'], why: '' },
  { brand: 'kiro', part: 'Kiro purple', hex: '#9046ff', chosen: ['#8c51cc'], why: '' },
  { brand: 'kiro', part: 'ghost white', hex: '#ffffff', chosen: ['#ffffff'], why: '' },
  { brand: 'opencode', part: 'ring light', hex: '#eeeeee', chosen: ['#ffffff'], why: '' },
  { brand: 'opencode', part: 'core dark', hex: '#0c0c0c', chosen: ['#000000'], why: 'The nearest, #12173d, is the screen\'s usual navy. True black makes the split core read as two tones.' },
  { brand: 'opencode', part: 'core grey', hex: '#4b4b4b', chosen: ['#293268'], why: 'The nearest, #0f4a4c, is a teal slate next to the [OIII] event teal. The gear navy keeps the eyes the only teal.' },
  { brand: 'qodo', part: 'anteater white', hex: '#ffffff', chosen: ['#ffffff'], why: '' },
  { brand: 'qodo', part: 'hoodie purple (boosters, hem band)', hex: '#7a68fa', chosen: ['#8c51cc'], why: '' },
  { brand: 'qodo', part: 'sunglasses black', hex: '#000000', chosen: ['#000000', '#12173d'], why: '' },
];
