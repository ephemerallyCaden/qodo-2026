// Every knob of the parameterised drone, with its range and a plain-words meaning.
// Lengths are world units, the same as the crew's (a K astronaut is 0.95 tall), so a drone
// built from these numbers can be compared with an astronaut directly. The drone's origin is
// its head centre; the head is the swappable "face module" a brand reskin reshapes.
// type 'range' is a slider; 'select' is a part or shape choice (values are indices).

// Eye glyphs: the ten ApprenticeHack V2 designs (../asset-viewer/faces.js, read-only), then
// three drone-only glyphs drawn in drone.js.
export const EYES = ['dots', 'cyclops', 'visor slit', 'binocular', 'three', 'happy', 'LED bar', 'heartbeat', 'slant', 'X', 'pills', 'blocks', 'prompt >_'];

export const PROPS = ['rotors', 'ring thruster', 'anti-grav', 'jet'];

export const PARAMS = [
  // Head: the face module. One shape family covers capsule, dome, box and pebble heads.
  { key: 'headW', group: 'head', min: 0.1, max: 0.3, step: 0.0025, def: 0.2, words: 'Head half-width' },
  { key: 'headH', group: 'head', min: 0.08, max: 0.28, step: 0.0025, def: 0.165, words: 'Head half-height' },
  { key: 'headD', group: 'head', min: 0.08, max: 0.28, step: 0.0025, def: 0.17, words: 'Head half-depth (front to back)' },
  { key: 'headRound', group: 'head', min: 0, max: 1, step: 0.01, def: 0.5, words: 'Blend from a rounded box (0) to an ellipsoid (1)' },
  { key: 'headCorner', group: 'head', min: 0.1, max: 1, step: 0.01, def: 0.6, words: "Box corner radius / the head's smallest half-size" },
  { key: 'headTaper', group: 'head', min: 0.6, max: 1.4, step: 0.01, def: 1, words: 'Bottom width / top width (below 1 = narrows downward, above 1 = a bell)' },
  { key: 'headFlat', group: 'head', min: 0, max: 1, step: 0.01, def: 0, words: 'Cuts the bottom flat (1 = a half dome)' },
  { key: 'ears', group: 'head', type: 'select', options: ['none', 'pods', 'fins'], def: 0, words: 'Side parts on the head: round ear pods (headphones) or swept fins' },
  { key: 'earR', group: 'head', min: 0.03, max: 0.13, step: 0.0025, def: 0.07, words: 'Ear pod radius / fin height' },
  { key: 'earT', group: 'head', min: 0.01, max: 0.06, step: 0.0025, def: 0.025, words: 'Ear pod or fin thickness' },
  { key: 'earY', group: 'head', min: -0.6, max: 0.6, step: 0.01, def: 0, words: 'Ear height, as a share of the head half-height' },
  { key: 'topper', group: 'head', type: 'select', options: ['none', 'goggles', 'crest'], def: 0, words: 'On top of the head: pilot goggles or a fin crest (accent colour)' },
  { key: 'gogW', group: 'head', min: 0.03, max: 0.11, step: 0.0025, def: 0.07, words: 'Goggle lens half-width' },
  { key: 'gogH', group: 'head', min: 0.02, max: 0.08, step: 0.0025, def: 0.045, words: 'Goggle lens half-height' },
  { key: 'gogX', group: 'head', min: 0.2, max: 0.7, step: 0.01, def: 0.46, words: 'Goggle lens centre, out from the middle (share of the head half-width)' },
  { key: 'gogY', group: 'head', min: 0.2, max: 0.9, step: 0.01, def: 0.62, words: 'Goggle height on the head (share of the half-height)' },
  // Face: the screen and its eyes.
  { key: 'screenW', group: 'face', min: 0.3, max: 0.98, step: 0.01, def: 0.74, words: "Screen half-width, as a share of the head's" },
  { key: 'screenH', group: 'face', min: 0.25, max: 0.95, step: 0.01, def: 0.6, words: "Screen half-height, as a share of the head's" },
  { key: 'screenY', group: 'face', min: -0.5, max: 0.5, step: 0.01, def: -0.04, words: 'Screen centre height on the face (share of the half-height)' },
  { key: 'screenRound', group: 'face', min: 2, max: 10, step: 0.1, def: 4.5, words: 'Screen corner shape: 2 = an ellipse, 10 = a sharp rectangle' },
  { key: 'bezel', group: 'face', min: 0, max: 0.6, step: 0.01, def: 0.22, words: 'Trim-coloured bezel round the screen (0 = none)' },
  { key: 'eyes', group: 'face', type: 'select', options: EYES, def: 0, words: 'Eye glyph on the screen (glows in the glow colour)' },
  { key: 'eyeScale', group: 'face', min: 0.6, max: 1.6, step: 0.01, def: 1, words: 'Eye glyph size' },
  // Body: an optional pod under the head.
  { key: 'body', group: 'body', type: 'select', options: ['off', 'on'], def: 1, words: 'A body pod under the head (off = the head is the whole drone)' },
  { key: 'bodyW', group: 'body', min: 0.05, max: 0.22, step: 0.0025, def: 0.12, words: 'Body half-width' },
  { key: 'bodyH', group: 'body', min: 0.04, max: 0.2, step: 0.0025, def: 0.08, words: 'Body half-height' },
  { key: 'bodyD', group: 'body', min: 0.05, max: 0.22, step: 0.0025, def: 0.11, words: 'Body half-depth' },
  { key: 'bodyRound', group: 'body', min: 0, max: 1, step: 0.01, def: 0.8, words: 'Blend from a rounded box (0) to an ellipsoid (1)' },
  { key: 'bodyCorner', group: 'body', min: 0.1, max: 1, step: 0.01, def: 0.6, words: 'Box corner radius / smallest half-size' },
  { key: 'bodyTaper', group: 'body', min: 0.4, max: 1.4, step: 0.01, def: 0.8, words: 'Bottom width / top width' },
  { key: 'bodySink', group: 'body', min: 0, max: 0.12, step: 0.0025, def: 0.04, words: 'How far the body tucks up into the head' },
  { key: 'neckBlend', group: 'body', min: 0.004, max: 0.08, step: 0.001, def: 0.03, words: 'Smooth-union radius where the body meets the head' },
  // Hover propulsion. Every option hovers and bobs on the loop.
  { key: 'prop', group: 'hover', type: 'select', options: PROPS, def: 2, words: 'How it hovers: rotors, a ring thruster, an anti-grav lens with floating halos, or a jet' },
  { key: 'rotorN', group: 'hover', type: 'select', options: ['top', 'twin', 'quad'], def: 1, words: 'Rotors: one on top (a beanie), two on side arms, or four (a quadcopter)' },
  { key: 'rotorR', group: 'hover', min: 0.04, max: 0.16, step: 0.0025, def: 0.09, words: 'Rotor disc radius' },
  { key: 'rotorArm', group: 'hover', min: 0.02, max: 0.25, step: 0.0025, def: 0.1, words: 'Rotor arm length, from the shell to the hub' },
  { key: 'rotorY', group: 'hover', min: -1, max: 1, step: 0.01, def: 0.2, words: 'Rotor arm height on the shell (share of its half-height)' },
  { key: 'ringR', group: 'hover', min: 0.06, max: 0.28, step: 0.0025, def: 0.12, words: 'Ring thruster radius' },
  { key: 'ringT', group: 'hover', min: 0.012, max: 0.05, step: 0.001, def: 0.026, words: 'Ring thruster tube thickness' },
  { key: 'glowR', group: 'hover', min: 0.03, max: 0.16, step: 0.0025, def: 0.07, words: 'Anti-grav lens / jet nozzle radius' },
  { key: 'halos', group: 'hover', min: 0, max: 2, step: 1, def: 2, words: 'Anti-grav: floating glow halos under the lens (separate parts)' },
  { key: 'plumeL', group: 'hover', min: 0.04, max: 0.25, step: 0.0025, def: 0.11, words: 'Jet plume length' },
  { key: 'bobAmp', group: 'hover', min: 0, max: 0.06, step: 0.001, def: 0.022, words: 'Hover bob height (two bobs per 6 s)' },
  // Extras: antenna, arms and the brand accent.
  { key: 'antenna', group: 'extras', type: 'select', options: ['none', 'stalk', 'twin'], def: 1, words: 'Antenna on top: one stalk, or two in a V; the tip glows' },
  { key: 'antL', group: 'extras', min: 0.03, max: 0.2, step: 0.0025, def: 0.09, words: 'Antenna length' },
  { key: 'antTilt', group: 'extras', min: -0.7, max: 0.7, step: 0.01, def: 0.25, words: 'Antenna lean (radians; + leans back, or out for twin)' },
  { key: 'antTip', group: 'extras', min: 0.012, max: 0.05, step: 0.001, def: 0.026, words: 'Antenna tip ball radius' },
  { key: 'arms', group: 'extras', type: 'select', options: ['none', 'nubs', 'claws'], def: 1, words: 'Little manipulator arms: round nubs or two-prong claws' },
  { key: 'armLen', group: 'extras', min: 0.03, max: 0.18, step: 0.0025, def: 0.07, words: 'Arm length' },
  { key: 'armR', group: 'extras', min: 0.014, max: 0.045, step: 0.001, def: 0.026, words: 'Arm tube radius' },
  { key: 'armY', group: 'extras', min: -1, max: 1, step: 0.01, def: 0, words: 'Arm height on the shell (share of its half-height)' },
  { key: 'armSplay', group: 'extras', min: 0.2, max: 1.5, step: 0.01, def: 0.7, words: 'How far the arms hang out from the body (radians from straight down)' },
  { key: 'accent', group: 'extras', type: 'select', options: ['none', 'band', 'panel', 'stripe'], def: 1, words: 'Brand accent: a band round the shell, a front panel, or a stripe over the top' },
  { key: 'accentY', group: 'extras', min: -1, max: 1, step: 0.01, def: -0.78, words: 'Band height (share of the half-height of the part it is on)' },
  { key: 'accentW', group: 'extras', min: 0.03, max: 0.4, step: 0.005, def: 0.12, words: 'Band / stripe / panel size' },
  { key: 'accentOn', group: 'extras', type: 'select', options: ['head', 'body'], def: 0, words: 'Which part carries the accent' },
];

export const DEFAULTS = Object.fromEntries(PARAMS.map((p) => [p.key, p.def]));
export const PARAM_BY_KEY = Object.fromEntries(PARAMS.map((p) => [p.key, p]));

/** A parameter's value in words, for tables. */
export function showValue(key, v) {
  const p = PARAM_BY_KEY[key];
  if (p.type === 'select') return p.options[v];
  return String(Math.round(v * 1000) / 1000);
}
