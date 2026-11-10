// Brand drones (phase 2): one drone per supported agent provider, each a variation of D-final.
// A brand is a parameter set laid over D-final plus a palette (palette.js BRAND_PALETTES), so the
// family stays one family: same size class, head-is-body, thruster pack and smoke, screen face
// with a V2 eye, the full idle loop, BLK 36 colours. Each one borrows a silhouette, one or two
// signature features and a colour from its provider's mascot or logo. They are original designs:
// no logo is drawn and no brand is named inside the pixel pass (names are labels outside it).
// Per-session variety (R2b / A5): sessionLook(brand, session) hashes a session id into seeded
// details only (a trim swap, one small shape detail, personality), never the silhouette.
import { FINAL } from './variants.js';
import { DEFAULTS, PARAM_BY_KEY, LAB_EYE } from './params.js';
import { BRAND_PALETTES } from './palette.js';
import { hashStr } from '../asset-viewer/faces.js';

// Eyes (V2 indices): 0 dots 1 cyclops 2 visor slit 3 binocular 4 three 5 happy 6 LED bar 7 heartbeat 8 slant 9 X.
// Every brand uses its closest V2 eye; `protoEyes` names a lab-only prototype shown beside it.
export const BRANDS = [
  {
    id: 'claude', name: 'Claude Code', covers: 'Claude Code (CLI, web, Action)',
    mascot: 'Clawd, the CLI block-pixel critter: a wide flat body, two eye notches, a stub each side, four stubby legs',
    signature: 'a wide flat block body on four stubby legs (two pairs), side stubs, terracotta orange; works with an asterisk spinner',
    params: {
      rim: 0, antenna: 0,
      headW: 0.15, headH: 0.074, headD: 0.105, headRound: 0.08, headCorner: 0.45, headTaper: 1, headFlat: 0,
      ears: 2, earR: 0.025, earT: 0.02, earY: -0.2, earSweep: 0,
      skirt: 1, skirtN: 4, skirtL: 0.036, skirtR: 0.017, skirtSpread: 0.82, skirtZ: 0.55,
      screenW: 0.62, screenH: 0.42, screenY: 0.22, screenRound: 7, bezel: 0.08, eyes: 0, screenFlat: 1,
      thrusters: 1, thrR: 0.032, thrL: 0.02, thrFlare: 0.9,
      smoke: 0, puffSize: 0.9, puffRate: 0.4, sparkles: 2, glyphSet: 1,
      bobAmp: 0.022, drift: 0.2, bank: 0.22, lookYaw: 0.35,
    },
    detail: { key: 'skirtL', min: 0.03, max: 0.042 },
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
    mascot: 'the goggled helmet head (kept with GitHub\'s permission, human 2026-11-10): goggles over a lower face plate, round ear pads',
    signature: 'a wide helmet with big pilot goggles across the top, low ear pads and a lower face plate; blue to violet with cyan frames',
    params: {
      rim: 0, antenna: 0,
      headW: 0.15, headH: 0.104, headD: 0.12, headRound: 0.55, headCorner: 0.85, headTaper: 1.12, headFlat: 0.15,
      topper: 1, gogW: 0.056, gogH: 0.038, gogX: 0.4, gogY: 0.45,
      ears: 1, earR: 0.045, earT: 0.018, earY: -0.35,
      screenW: 0.66, screenH: 0.4, screenY: -0.42, screenRound: 3.5, bezel: 0.12, eyes: 0,
      thrusters: 0, thrR: 0.025, thrL: 0.025, thrSpread: 0.5, thrFlare: 1.1,
      smoke: 0, puffSize: 1, puffRate: 0.45, sparkles: 2,
      bobAmp: 0.03, drift: 0.17, bank: 0.3, lookYaw: 0.4,
    },
    protoEyes: LAB_EYE.pills,
    detail: { key: 'earR', min: 0.04, max: 0.05 },
    trims: [['#354ab2', '#4185d8', '#5ab9e5', '#a5e6ff'], ['#36277f', '#4185d8', '#5ab9e5', '#ffffff'], ['#643499', '#8c51cc', '#b991f2', '#a5e6ff']],
  },
  {
    id: 'codex', name: 'OpenAI Codex', covers: 'OpenAI Codex (CLI, cloud)',
    mascot: 'Codey, the Codex pet: a cloud-puff head with a dark rounded screen face and >_ glyph eyes',
    signature: 'a cloud-puff head round a big dark navy screen, sky blue, puffing clouds; works in prompt characters',
    params: {
      rim: 0, antenna: 0,
      headW: 0.122, headH: 0.098, headD: 0.11, headRound: 0.9, headCorner: 0.6, headTaper: 1, headFlat: 0.2,
      crown: 1, crownN: 7, crownR: 0.039, crownArc: 2.05, crownZ: -0.2,
      screenW: 0.76, screenH: 0.55, screenY: 0.02, screenRound: 4.5, bezel: 0.08, eyes: 5,
      thrusters: 0, thrR: 0.026, thrL: 0.022, thrSpread: 0.55, thrFlare: 1.1,
      smoke: 0, puffSize: 1.15, puffRate: 0.45, sparkles: 1, glyphSet: 3,
      bobAmp: 0.03, drift: 0.16, bank: 0.26, lookYaw: 0.4,
    },
    protoEyes: LAB_EYE.prompt,
    detail: { key: 'crownR', min: 0.036, max: 0.042 },
    trims: [['#4185d8', '#5ab9e5', '#a5e6ff', '#ffffff'], ['#354ab2', '#4185d8', '#5ab9e5', '#a5e6ff'], ['#5ab9e5', '#a5e6ff', '#ffffff', '#ffffff']],
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
    mascot: 'the anteater in a purple hoodie, with sunglasses, on a skateboard',
    signature: 'a purple hooded head with a long white snout and a shades-shaped visor; reviews: reads diff marks row by row, head dipped',
    params: {
      rim: 0, antenna: 0,
      headW: 0.112, headH: 0.098, headD: 0.112, headRound: 0.9, headCorner: 0.6, headTaper: 1.05, headFlat: 0.2,
      snout: 1, snoutL: 0.09, snoutR: 0.024, snoutY: -0.28, snoutDrop: 0.35,
      ears: 1, earR: 0.026, earT: 0.012, earY: 0.55,
      screenW: 0.78, screenH: 0.28, screenY: 0.32, screenRound: 4, bezel: 0.14, eyes: 8,
      thrusters: 0, thrR: 0.024, thrL: 0.022, thrSpread: 0.6, thrFlare: 1.1,
      smoke: 0, puffSize: 0.95, puffRate: 0.4, sparkles: 1, glyphSet: 2, workNod: 0.2,
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
    id: 'unknown', name: 'unknown agent', covers: 'agent evidence with no known tool',
    mascot: '-',
    signature: "D-final's saucer in a dusty plum no provider uses, no white trim, dim eyes in a narrow faceless visor, a question-mark antenna",
    params: { antenna: 3, antL: 0.04, antTilt: 0, eyes: 2, screenH: 0.42, screenY: 0.22, sparkles: 0, puffRate: 0.3 },
    detail: { key: 'antL', min: 0.036, max: 0.044 },
    trims: [['#3f233c', '#66334b', '#8c4b63', '#8c4b63'], ['#29174c', '#3f233c', '#66334b', '#8c4b63']],
  },
].map((b) => ({ ...b, params: { ...DEFAULTS, ...FINAL.params, ...b.params }, palette: BRAND_PALETTES[b.id] }));

export const BRAND_BY_ID = Object.fromEntries(BRANDS.map((b) => [b.id, b]));
/** The nine providers with a custom drone (not generic or unknown). */
export const PROVIDERS = BRANDS.filter((b) => b.id !== 'generic' && b.id !== 'unknown');

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
  const b = BRAND_BY_ID[brandId];
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
  { brand: 'copilot', part: 'helmet blue', hex: '#2f5bff', chosen: ['#354ab2'], why: 'Tied with #4185d8 (0.125). #354ab2 keeps it off the suit ramp and apart from Codex.' },
  { brand: 'copilot', part: 'helmet lilac', hex: '#b18cff', chosen: ['#8c51cc'], why: 'The nearest, #b991f2, washes the lit helmet out to Kiro\'s lilac. One step darker keeps the blue-to-violet read.' },
  { brand: 'copilot', part: 'goggle frames', hex: '#5cc8ff', chosen: ['#5ab9e5'], why: '' },
  { brand: 'codex', part: 'Codey blue', hex: '#6e9bfa', chosen: ['#4185d8', '#5ab9e5'], why: 'The nearest, #909edd, is the generic drone\'s shell (A4 measured them too alike). The saturated azure keeps Codex apart from generic and from Copilot.' },
  { brand: 'codex', part: 'Codey screen', hex: '#232d66', chosen: ['#293268'], why: '' },
  { brand: 'google', part: 'Jules purple', hex: '#642cc2', chosen: ['#643499'], why: '' },
  { brand: 'devin', part: 'near-black', hex: '#0e1015', chosen: ['#12173d'], why: '' },
  { brand: 'devin', part: 'hexagons', hex: '#ffffff', chosen: ['#ffffff'], why: '' },
  { brand: 'kiro', part: 'Kiro purple', hex: '#9046ff', chosen: ['#8c51cc'], why: '' },
  { brand: 'kiro', part: 'ghost white', hex: '#ffffff', chosen: ['#ffffff'], why: '' },
  { brand: 'opencode', part: 'ring light', hex: '#eeeeee', chosen: ['#ffffff'], why: '' },
  { brand: 'opencode', part: 'core dark', hex: '#0c0c0c', chosen: ['#000000'], why: 'The nearest, #12173d, is the screen\'s usual navy. True black makes the split core read as two tones.' },
  { brand: 'opencode', part: 'core grey', hex: '#4b4b4b', chosen: ['#293268'], why: 'The nearest, #0f4a4c, is a teal slate next to the [OIII] event teal. The gear navy keeps the eyes the only teal.' },
  { brand: 'qodo', part: 'hoodie purple', hex: '#7a68fa', chosen: ['#8c51cc'], why: '' },
];
