// Every knob of the parameterised drone, with its range and a plain-words meaning.
// Lengths are world units, the same as the crew's (a K astronaut is 0.95 tall; a drone is
// about half that). The drone is head-is-body: one rounded head with a face screen, with an
// optional tiny chin pod, on a thruster pack. The head is the shape a brand reskin morphs.
// type 'range' is a slider; 'select' is a part or shape choice (values are indices).
import { EYE_DESIGNS } from '../asset-viewer/faces.js';

export const EYES = EYE_DESIGNS.map((d) => d.name); // the astronauts' V2 set, read-only
// Drone-only eyes (drone.js), approved by the human for drones (2026-11-10): Copilot's pills and
// Codex's prompt. They are not in faces.js, so the crew's set stays the 10 V2 designs; drones have 12.
export const DRONE_EYES = ['Pills (drone-only)', 'Prompt >_ (drone-only)'];
export const DRONE_EYE = { pills: EYES.length, prompt: EYES.length + 1 };
export const THRUSTERS = ['twin under-pods', 'single under-jet', 'quad corner nozzles', 'single rear jet', 'twin rear jets'];
export const SMOKE = ['round puffs', 'wispy trails', 'sputter dots'];

export const PARAMS = [
  // Head: the whole body. One shape family covers dome, capsule, cube, teardrop and saucer.
  { key: 'headW', group: 'head', min: 0.08, max: 0.28, step: 0.0025, def: 0.17, words: 'Head half-width' },
  { key: 'headH', group: 'head', min: 0.07, max: 0.24, step: 0.0025, def: 0.15, words: 'Head half-height' },
  { key: 'headD', group: 'head', min: 0.06, max: 0.3, step: 0.0025, def: 0.16, words: 'Head half-depth (front to back)' },
  { key: 'headRound', group: 'head', min: 0, max: 1, step: 0.01, def: 0.6, words: 'Blend from a rounded box (0) to an ellipsoid (1)' },
  { key: 'headCorner', group: 'head', min: 0.1, max: 1, step: 0.01, def: 0.6, words: "Box corner radius / the head's smallest half-size" },
  { key: 'headTaper', group: 'head', min: 0.55, max: 1.6, step: 0.01, def: 1, words: 'Bottom width / top width (above 1 = a teardrop or bell, below 1 = narrows downward)' },
  { key: 'headFlat', group: 'head', min: 0, max: 1, step: 0.01, def: 0, words: 'Cuts the bottom flat (1 = a half dome)' },
  { key: 'rim', group: 'head', type: 'select', options: ['off', 'on'], def: 0, words: 'A trim ring round the head (a saucer brim)' },
  { key: 'rimY', group: 'head', min: -0.8, max: 0.6, step: 0.01, def: -0.3, words: 'Rim height (share of the head half-height)' },
  { key: 'rimT', group: 'head', min: 0.01, max: 0.04, step: 0.001, def: 0.018, words: 'Rim tube thickness' },
  { key: 'chin', group: 'head', type: 'select', options: ['off', 'on'], def: 0, words: 'A tiny chin pod under the head (the thrusters mount on it)' },
  { key: 'chinR', group: 'head', min: 0.03, max: 0.12, step: 0.0025, def: 0.07, words: 'Chin pod radius' },
  { key: 'ears', group: 'head', type: 'select', options: ['none', 'pods', 'fins', 'hex pods'], def: 0, words: 'Side parts: round ear pods, swept fins, or front-facing hexagonal pods' },
  { key: 'earR', group: 'head', min: 0.025, max: 0.11, step: 0.0025, def: 0.055, words: 'Ear pod radius / fin height / hex pod apothem' },
  { key: 'earT', group: 'head', min: 0.008, max: 0.05, step: 0.001, def: 0.02, words: 'Ear pod or fin thickness' },
  { key: 'earY', group: 'head', min: -0.6, max: 0.7, step: 0.01, def: 0, words: 'Ear height (share of the head half-height)' },
  { key: 'earSweep', group: 'head', min: -0.8, max: 1.2, step: 0.01, def: 0.5, words: 'Fin sweep back (radians)' },
  { key: 'topper', group: 'head', type: 'select', options: ['none', 'goggles', 'crest'], def: 0, words: 'On top: pilot goggles, or a fin crest (both in the accent colour; the lenses take the screen tones)' },
  { key: 'gogW', group: 'head', min: 0.025, max: 0.1, step: 0.0025, def: 0.06, words: 'Goggle lens half-width' },
  { key: 'gogH', group: 'head', min: 0.015, max: 0.07, step: 0.0025, def: 0.04, words: 'Goggle lens half-height' },
  { key: 'gogX', group: 'head', min: 0.2, max: 0.7, step: 0.01, def: 0.42, words: 'Goggle lens centre, out from the middle (share of the head half-width)' },
  { key: 'gogY', group: 'head', min: 0.2, max: 1.6, step: 0.01, def: 0.55, words: 'Goggle height (share of the head half-height; above 1 pushes them up onto the crown)' },
  { key: 'gogTilt', group: 'head', min: 0, max: 1, step: 0.01, def: 0, words: 'Goggle lenses: lying on the head (0) to standing upright, facing out (1)' },
  { key: 'gogLift', group: 'head', min: 0, max: 1, step: 0.01, def: 0, words: 'Goggles stand up off the head by this share of the lens height (pushed up onto the crown)' },
  { key: 'gogT', group: 'head', min: 0.006, max: 0.03, step: 0.001, def: 0.012, words: 'Goggle frame half-depth' },
  { key: 'gogFrame', group: 'head', min: 0.006, max: 0.03, step: 0.001, def: 0.014, words: 'Goggle frame width round each lens (the bridge and strap are as thick)' },
  { key: 'gogBridge', group: 'head', type: 'select', options: ['off', 'on'], def: 0, words: 'A bridge joining the two lenses' },
  { key: 'gogStrap', group: 'head', type: 'select', options: ['off', 'on'], def: 0, words: 'A strap round the head, from the goggles down to gogStrapY at the back' },
  { key: 'gogStrapY', group: 'head', min: -0.6, max: 0.9, step: 0.01, def: 0.3, words: 'Strap height at the back of the head (share of the head half-height)' },
  { key: 'crestH', group: 'head', min: 0.02, max: 0.08, step: 0.0025, def: 0.04, words: 'Crest height' },
  { key: 'antenna', group: 'head', type: 'select', options: ['none', 'stalk', 'twin', 'question hook'], def: 0, words: 'Antenna: one stalk, two in a V, or a stalk curled into a question mark; the tip glows' },
  { key: 'antL', group: 'head', min: 0.025, max: 0.14, step: 0.0025, def: 0.06, words: 'Antenna length' },
  { key: 'antTilt', group: 'head', min: -0.7, max: 0.7, step: 0.01, def: 0.25, words: 'Antenna lean (radians; + leans back, or out for twin)' },
  { key: 'antTip', group: 'head', min: 0.01, max: 0.035, step: 0.001, def: 0.018, words: 'Antenna tip ball radius' },
  // Brand geometry (phase 2): every part is off by default, so A–E and D-final are unchanged.
  { key: 'headHex', group: 'head', min: 0, max: 1, step: 0.01, def: 0, words: 'Blend the head toward a front-facing hexagonal prism, point up (0 = off)' },
  { key: 'crown', group: 'head', type: 'select', options: ['none', 'cloud puffs'], def: 0, words: 'Puffs round the top of the head, so its outline reads as a cloud' },
  { key: 'crownN', group: 'head', min: 3, max: 9, step: 1, def: 5, words: 'Number of crown puffs' },
  { key: 'crownR', group: 'head', min: 0.015, max: 0.06, step: 0.0025, def: 0.03, words: 'Crown puff radius' },
  { key: 'crownArc', group: 'head', min: 0.4, max: 2.4, step: 0.01, def: 1.6, words: 'How far round the head the puffs reach (radians each side of the top)' },
  { key: 'crownOut', group: 'head', min: -0.8, max: 0.6, step: 0.01, def: 0.3, words: 'How far each crown puff sits out from the head surface (share of its radius; below 0 = low lobes)' },
  { key: 'crownK', group: 'head', min: 0.004, max: 0.06, step: 0.001, def: 0.012, words: 'Crown blend radius: small = separate puffs, large = one smooth cloud' },
  { key: 'crownZ', group: 'head', min: -0.7, max: 0.5, step: 0.01, def: -0.15, words: 'Crown puffs front (+) or back (-) (share of the head half-depth)' },
  { key: 'skirt', group: 'head', type: 'select', options: ['none', 'stub legs', 'tentacles', 'ghost hem'], def: 0, words: 'Under the head: stubby legs, curled tentacles, or a scalloped ghost hem' },
  { key: 'skirtN', group: 'head', min: 2, max: 8, step: 1, def: 4, words: 'Number of legs, tentacles or hem scallops' },
  { key: 'skirtL', group: 'head', min: 0.01, max: 0.09, step: 0.0025, def: 0.03, words: 'Leg or tentacle length' },
  { key: 'skirtR', group: 'head', min: 0.008, max: 0.045, step: 0.001, def: 0.015, words: 'Leg or tentacle thickness (radius), or scallop radius' },
  { key: 'skirtSpread', group: 'head', min: 0.2, max: 1, step: 0.01, def: 0.7, words: 'How far out the legs, tentacles or scallops sit (share of the head half-size)' },
  { key: 'skirtZ', group: 'head', min: -0.8, max: 0.9, step: 0.01, def: 0.1, words: 'Legs front (+) or back (-) (share of the head half-depth)' },
  { key: 'skirtCurl', group: 'head', min: 0, max: 1, step: 0.01, def: 0.5, words: 'Tentacle curl outward at the tip' },
  { key: 'skirtWave', group: 'head', min: 0, max: 0.02, step: 0.0005, def: 0, words: 'Hem or tentacle wobble, in time with the bob (world units)' },
  { key: 'snout', group: 'head', type: 'select', options: ['off', 'on'], def: 0, words: 'A long tapered snout out of the lower face' },
  { key: 'snoutL', group: 'head', min: 0.02, max: 0.14, step: 0.0025, def: 0.07, words: 'Snout length' },
  { key: 'snoutR', group: 'head', min: 0.01, max: 0.045, step: 0.001, def: 0.022, words: 'Snout root radius (the tip is half of it)' },
  { key: 'snoutY', group: 'head', min: -0.8, max: 0.3, step: 0.01, def: -0.35, words: 'Snout root height (share of the head half-height)' },
  { key: 'snoutDrop', group: 'head', min: -0.3, max: 0.9, step: 0.01, def: 0.3, words: 'Snout droop (rise per unit forward)' },
  { key: 'size', group: 'head', min: 0.7, max: 1.5, step: 0.01, def: 1, words: 'Overall scale of the drone (smoke drift stays in world units)' },
  // Face: the dark screen and its V2 eyes.
  { key: 'screenW', group: 'face', min: 0.25, max: 2.6, step: 0.01, def: 0.72, words: 'Screen half-width (tan of its half-angle round the head; above 1 wraps round the sides like a visor band)' },
  { key: 'screenH', group: 'face', min: 0.2, max: 0.95, step: 0.01, def: 0.6, words: 'Screen half-height (tan of its half-angle)' },
  { key: 'screenY', group: 'face', min: -0.5, max: 0.6, step: 0.01, def: 0, words: 'Screen centre height on the face' },
  { key: 'screenRound', group: 'face', min: 2, max: 10, step: 0.1, def: 4.5, words: 'Screen corners: 2 = an ellipse (a porthole), 10 = a sharp rectangle' },
  { key: 'bezel', group: 'face', min: 0, max: 0.6, step: 0.01, def: 0.2, words: 'Trim bezel round the screen (0 = none)' },
  { key: 'eyes', group: 'face', type: 'select', options: [...EYES, ...DRONE_EYES], def: 0, words: 'Eye design (glows teal): the 10 V2 designs, then two drone-only ones' },
  { key: 'eyeScale', group: 'face', min: 0.5, max: 1.5, step: 0.01, def: 1, words: 'Eye size' },
  { key: 'gaze', group: 'face', min: -5, max: 5, step: 0.1, def: 0, words: 'Resting eye height on the screen, in eye-box pixels (+ up; a shy drone looks down)' },
  { key: 'glance', group: 'face', min: 0, max: 8, step: 0.1, def: 4.5, words: 'How far the eyes glance side to side when looking around (eye-box pixels)' },
  { key: 'glyphRate', group: 'face', min: 1, max: 10, step: 0.5, def: 4, words: 'Working face: glyph flips per second in each cell (typing speed)' },
  { key: 'screenFlat', group: 'face', type: 'select', options: ['off', 'on'], def: 0, words: 'A flat (planar) screen with straight edges, for flat-fronted heads; off = wrapped round the head' },
  { key: 'screenSplit', group: 'face', type: 'select', options: ['off', 'on'], def: 0, words: "Split the screen: below splitY it takes the screen's second tone" },
  { key: 'splitY', group: 'face', min: -0.9, max: 0.9, step: 0.01, def: 0, words: 'Screen split height (screen coordinates, -1 bottom to 1 top)' },
  { key: 'glyphSet', group: 'face', type: 'select', options: ['all', 'asterisk spinner', 'review marks (scanning)', 'prompt'], def: 0, words: 'Working face glyphs: the full set, a spinner of asterisks, diff marks read row by row, or prompt characters' },
  { key: 'glyphPx', group: 'face', min: 0.8, max: 2.5, step: 0.05, def: 1.4, words: 'Working face: size of one glyph pixel, in eye-box px (bigger = fewer, chunkier glyphs)' },
  // Thrusters and smoke.
  { key: 'thrusters', group: 'thrusters', type: 'select', options: THRUSTERS, def: 0, words: 'Thruster layout' },
  { key: 'thrR', group: 'thrusters', min: 0.015, max: 0.07, step: 0.0025, def: 0.035, words: 'Nozzle radius' },
  { key: 'thrL', group: 'thrusters', min: 0.015, max: 0.09, step: 0.0025, def: 0.045, words: 'Nozzle length' },
  { key: 'thrFlare', group: 'thrusters', min: 0.6, max: 1.5, step: 0.01, def: 1.1, words: 'Mouth radius / root radius (above 1 = a bell, below 1 = a cone)' },
  { key: 'thrSpread', group: 'thrusters', min: 0.2, max: 0.9, step: 0.01, def: 0.5, words: 'How far apart the nozzles sit (share of the head half-width)' },
  { key: 'smoke', group: 'thrusters', type: 'select', options: SMOKE, def: 0, words: 'Smoke style: chunky round puffs, wispy trails, or small sputter dots' },
  { key: 'puffSize', group: 'thrusters', min: 0.5, max: 1.8, step: 0.01, def: 1, words: 'Smoke particle size' },
  { key: 'puffRate', group: 'thrusters', min: 0.1, max: 1, step: 0.01, def: 0.6, words: 'How busily the thrusters sputter (more when it accelerates or tilts)' },
  { key: 'sparkles', group: 'thrusters', min: 0, max: 6, step: 1, def: 0, words: 'Pixel + sparkles twinkling in the smoke' },
  // Motion and personality.
  { key: 'bobAmp', group: 'motion', min: 0, max: 0.05, step: 0.001, def: 0.018, words: 'Hover bob height (four bobs per 12 s)' },
  { key: 'drift', group: 'motion', min: 0, max: 0.3, step: 0.005, def: 0.16, words: 'Motion loop: how far it drifts side to side (a figure 8 per 12 s)' },
  { key: 'bank', group: 'motion', min: 0, max: 0.6, step: 0.01, def: 0.28, words: 'How hard it banks into its drift (radians at top speed)' },
  { key: 'lookYaw', group: 'motion', min: 0, max: 0.6, step: 0.01, def: 0.3, words: 'How far the head turns with a glance (radians)' },
  { key: 'workNod', group: 'motion', min: 0, max: 0.4, step: 0.01, def: 0, words: 'How far the head dips while working (radians; a reviewer reading)' },
  // Accent.
  { key: 'accent', group: 'accent', type: 'select', options: ['none', 'band', 'panel', 'stripe', 'top facet'], def: 0, words: 'Brand accent: a band round the head, a panel, a stripe over the top, or the top face above accentY' },
  { key: 'accentY', group: 'accent', min: -1, max: 1, step: 0.01, def: -0.75, words: 'Band / panel height (share of the head half-height)' },
  { key: 'accentW', group: 'accent', min: 0.03, max: 0.4, step: 0.005, def: 0.1, words: 'Band / stripe / panel size' },
];

export const DEFAULTS = Object.fromEntries(PARAMS.map((p) => [p.key, p.def]));
export const PARAM_BY_KEY = Object.fromEntries(PARAMS.map((p) => [p.key, p]));

/** A parameter's value in words, for tables. */
export function showValue(key, v) {
  const p = PARAM_BY_KEY[key];
  if (p.type === 'select') return p.options[v];
  return String(Math.round(v * 1000) / 1000);
}
