// Every knob of the parameterised drone, with its range and a plain-words meaning.
// Lengths are world units, the same as the crew's (a K astronaut is 0.95 tall; a drone is
// about half that). The drone is head-is-body: one rounded head with a face screen, with an
// optional tiny chin pod, on a thruster pack. The head is the shape a brand reskin morphs.
// type 'range' is a slider; 'select' is a part or shape choice (values are indices).
import { EYE_DESIGNS } from '../asset-viewer/faces.js';

export const EYES = EYE_DESIGNS.map((d) => d.name); // the astronauts' V2 set, read-only
export const THRUSTERS = ['twin under-pods', 'single under-jet', 'quad corner nozzles', 'single rear jet', 'twin rear jets'];
export const SMOKE = ['round puffs', 'wispy trails', 'sputter dots'];

export const PARAMS = [
  // Head: the whole body. One shape family covers dome, capsule, cube, teardrop and saucer.
  { key: 'headW', group: 'head', min: 0.1, max: 0.28, step: 0.0025, def: 0.17, words: 'Head half-width' },
  { key: 'headH', group: 'head', min: 0.07, max: 0.24, step: 0.0025, def: 0.15, words: 'Head half-height' },
  { key: 'headD', group: 'head', min: 0.08, max: 0.3, step: 0.0025, def: 0.16, words: 'Head half-depth (front to back)' },
  { key: 'headRound', group: 'head', min: 0, max: 1, step: 0.01, def: 0.6, words: 'Blend from a rounded box (0) to an ellipsoid (1)' },
  { key: 'headCorner', group: 'head', min: 0.1, max: 1, step: 0.01, def: 0.6, words: "Box corner radius / the head's smallest half-size" },
  { key: 'headTaper', group: 'head', min: 0.55, max: 1.6, step: 0.01, def: 1, words: 'Bottom width / top width (above 1 = a teardrop or bell, below 1 = narrows downward)' },
  { key: 'headFlat', group: 'head', min: 0, max: 1, step: 0.01, def: 0, words: 'Cuts the bottom flat (1 = a half dome)' },
  { key: 'rim', group: 'head', type: 'select', options: ['off', 'on'], def: 0, words: 'A trim ring round the head (a saucer brim)' },
  { key: 'rimY', group: 'head', min: -0.8, max: 0.6, step: 0.01, def: -0.3, words: 'Rim height (share of the head half-height)' },
  { key: 'rimT', group: 'head', min: 0.01, max: 0.04, step: 0.001, def: 0.018, words: 'Rim tube thickness' },
  { key: 'chin', group: 'head', type: 'select', options: ['off', 'on'], def: 0, words: 'A tiny chin pod under the head (the thrusters mount on it)' },
  { key: 'chinR', group: 'head', min: 0.03, max: 0.12, step: 0.0025, def: 0.07, words: 'Chin pod radius' },
  { key: 'ears', group: 'head', type: 'select', options: ['none', 'pods', 'fins'], def: 0, words: 'Side parts: round ear pods or swept fins' },
  { key: 'earR', group: 'head', min: 0.025, max: 0.11, step: 0.0025, def: 0.055, words: 'Ear pod radius / fin height' },
  { key: 'earT', group: 'head', min: 0.008, max: 0.05, step: 0.001, def: 0.02, words: 'Ear pod or fin thickness' },
  { key: 'earY', group: 'head', min: -0.6, max: 0.7, step: 0.01, def: 0, words: 'Ear height (share of the head half-height)' },
  { key: 'earSweep', group: 'head', min: -0.8, max: 1.2, step: 0.01, def: 0.5, words: 'Fin sweep back (radians)' },
  { key: 'topper', group: 'head', type: 'select', options: ['none', 'goggles', 'crest'], def: 0, words: 'On top: pilot goggles, or a fin crest (accent colour)' },
  { key: 'gogW', group: 'head', min: 0.025, max: 0.1, step: 0.0025, def: 0.06, words: 'Goggle lens half-width' },
  { key: 'gogH', group: 'head', min: 0.015, max: 0.07, step: 0.0025, def: 0.04, words: 'Goggle lens half-height' },
  { key: 'gogX', group: 'head', min: 0.2, max: 0.7, step: 0.01, def: 0.42, words: 'Goggle lens centre, out from the middle (share of the head half-width)' },
  { key: 'gogY', group: 'head', min: 0.2, max: 0.9, step: 0.01, def: 0.55, words: 'Goggle height (share of the head half-height)' },
  { key: 'crestH', group: 'head', min: 0.02, max: 0.08, step: 0.0025, def: 0.04, words: 'Crest height' },
  { key: 'antenna', group: 'head', type: 'select', options: ['none', 'stalk', 'twin'], def: 0, words: 'Antenna: one stalk or two in a V; the tip glows' },
  { key: 'antL', group: 'head', min: 0.025, max: 0.14, step: 0.0025, def: 0.06, words: 'Antenna length' },
  { key: 'antTilt', group: 'head', min: -0.7, max: 0.7, step: 0.01, def: 0.25, words: 'Antenna lean (radians; + leans back, or out for twin)' },
  { key: 'antTip', group: 'head', min: 0.01, max: 0.035, step: 0.001, def: 0.018, words: 'Antenna tip ball radius' },
  { key: 'size', group: 'head', min: 0.7, max: 1.5, step: 0.01, def: 1, words: 'Overall scale of the drone (smoke drift stays in world units)' },
  // Face: the dark screen and its V2 eyes.
  { key: 'screenW', group: 'face', min: 0.25, max: 2.6, step: 0.01, def: 0.72, words: 'Screen half-width (tan of its half-angle round the head; above 1 wraps round the sides like a visor band)' },
  { key: 'screenH', group: 'face', min: 0.2, max: 0.95, step: 0.01, def: 0.6, words: 'Screen half-height (tan of its half-angle)' },
  { key: 'screenY', group: 'face', min: -0.5, max: 0.6, step: 0.01, def: 0, words: 'Screen centre height on the face' },
  { key: 'screenRound', group: 'face', min: 2, max: 10, step: 0.1, def: 4.5, words: 'Screen corners: 2 = an ellipse (a porthole), 10 = a sharp rectangle' },
  { key: 'bezel', group: 'face', min: 0, max: 0.6, step: 0.01, def: 0.2, words: 'Trim bezel round the screen (0 = none)' },
  { key: 'eyes', group: 'face', type: 'select', options: EYES, def: 0, words: 'V2 eye design (glows teal)' },
  { key: 'eyeScale', group: 'face', min: 0.5, max: 1.5, step: 0.01, def: 1, words: 'Eye size' },
  { key: 'gaze', group: 'face', min: -5, max: 5, step: 0.1, def: 0, words: 'Resting eye height on the screen, in eye-box pixels (+ up; a shy drone looks down)' },
  { key: 'glance', group: 'face', min: 0, max: 8, step: 0.1, def: 4.5, words: 'How far the eyes glance side to side when looking around (eye-box pixels)' },
  { key: 'codeRows', group: 'face', min: 2, max: 5, step: 1, def: 3, words: 'Working state: rows of code streaming up the screen' },
  { key: 'codeRate', group: 'face', min: 1, max: 6, step: 1, def: 3, words: 'Working state: lines typed per second' },
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
  // Accent.
  { key: 'accent', group: 'accent', type: 'select', options: ['none', 'band', 'panel', 'stripe'], def: 0, words: 'Brand accent: a band round the head, a panel, or a stripe over the top' },
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
