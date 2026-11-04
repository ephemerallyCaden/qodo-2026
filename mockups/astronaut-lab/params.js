// Every knob of the parameterised astronaut, with its range and a plain-words meaning.
// Lengths are in figure heights: the figure is always exactly 1 tall (boot sole to helmet
// top) before the scene scale, so mixing parameters from different variants never
// changes the overall size, only the proportions.
// type 'range' is a slider; 'select' is a joint/shape choice (values are indices).

export const JOINTS_ROOT = ['blend', 'ring', 'ball']; // where a limb meets the body
export const JOINTS_MID = ['bend', 'ball', 'accordion']; // elbows and knees

export const PARAMS = [
  // Proportions
  { key: 'headFrac', group: 'proportions', min: 0.4, max: 0.66, step: 0.005, def: 0.57, words: 'Helmet height as a share of the whole figure' },
  { key: 'headSquash', group: 'proportions', min: 0.8, max: 1.05, step: 0.01, def: 1, words: 'Helmet height / width (below 1 = a squashed, wider dome)' },
  { key: 'helmetSink', group: 'proportions', min: 0, max: 0.09, step: 0.0025, def: 0.02, words: 'How far the helmet sits down into the torso' },
  { key: 'legShare', group: 'proportions', min: 0.3, max: 0.62, step: 0.005, def: 0.535, words: "Legs' share of the body below the helmet (the rest is torso)" },
  { key: 'torsoW', group: 'proportions', min: 0.09, max: 0.2, step: 0.0025, def: 0.153, words: 'Torso half-width at the chest' },
  { key: 'torsoD', group: 'proportions', min: 0.07, max: 0.17, step: 0.0025, def: 0.121, words: 'Torso half-depth (front to back)' },
  { key: 'torsoTaper', group: 'proportions', min: 0.7, max: 1.4, step: 0.01, def: 1, words: 'Hip width / chest width (above 1 = pear, below 1 = wedge)' },
  { key: 'torsoCorner', group: 'proportions', min: 0.15, max: 1, step: 0.01, def: 0.65, words: 'Torso corner radius / its smallest half-size (low = box)' },
  { key: 'torsoEgg', group: 'proportions', min: 0, max: 1, step: 0.01, def: 0, words: 'Blend of the torso toward a smooth egg (0 = rounded box)' },
  // Limbs
  { key: 'armLen', group: 'limbs', min: 0.09, max: 0.3, step: 0.005, def: 0.19, words: 'Arm length, shoulder to wrist' },
  { key: 'armR', group: 'limbs', min: 0.03, max: 0.085, step: 0.001, def: 0.061, words: 'Arm tube radius at the shoulder' },
  { key: 'armTaper', group: 'limbs', min: 0.55, max: 1.1, step: 0.01, def: 0.93, words: 'Wrist radius / shoulder radius' },
  { key: 'armSplay', group: 'limbs', min: 0.1, max: 1.3, step: 0.01, def: 0.785, words: 'How far the arms hang out from the body (radians)' },
  { key: 'elbowBend', group: 'limbs', min: 0, max: 1.4, step: 0.01, def: 0.6, words: 'How far the forearm swings forward at the elbow (radians); breathes with the bob' },
  { key: 'legR', group: 'limbs', min: 0.04, max: 0.1, step: 0.001, def: 0.076, words: 'Leg tube radius at the hip' },
  { key: 'legTaper', group: 'limbs', min: 0.6, max: 1.1, step: 0.01, def: 0.92, words: 'Ankle radius / hip radius' },
  { key: 'hipX', group: 'limbs', min: 0.04, max: 0.12, step: 0.0025, def: 0.079, words: 'Half the spacing between the hips' },
  { key: 'kneeBend', group: 'limbs', min: 0, max: 1.6, step: 0.01, def: 1.15, words: 'Resting knee bend (radians); breathes with the bob' },
  { key: 'mittR', group: 'limbs', min: 0.035, max: 0.09, step: 0.001, def: 0.063, words: 'Mitt (glove) radius' },
  { key: 'bootW', group: 'limbs', min: 0.04, max: 0.09, step: 0.001, def: 0.065, words: 'Boot half-width' },
  { key: 'bootH', group: 'limbs', min: 0.025, max: 0.06, step: 0.001, def: 0.042, words: 'Boot half-height' },
  { key: 'bootL', group: 'limbs', min: 0.05, max: 0.11, step: 0.001, def: 0.084, words: 'Boot half-length (heel to toe)' },
  // Joints
  { key: 'shoulder', group: 'joints', type: 'select', options: JOINTS_ROOT, def: 0, words: 'Shoulder joint: blended, a ring collar, or a ball' },
  { key: 'hip', group: 'joints', type: 'select', options: JOINTS_ROOT, def: 0, words: 'Hip joint: blended, a ring collar, or a ball' },
  { key: 'elbow', group: 'joints', type: 'select', options: JOINTS_MID, def: 0, words: 'Elbow: one smooth bent tube, a ball, or accordion ribs' },
  { key: 'knee', group: 'joints', type: 'select', options: JOINTS_MID, def: 0, words: 'Knee: one smooth bent tube, a ball, or accordion ribs' },
  { key: 'bodyBlend', group: 'joints', min: 0.004, max: 0.1, step: 0.001, def: 0.042, words: 'Smooth-union radius where limbs meet the body (big = soft toy, small = crisp crease)' },
  { key: 'bendBlend', group: 'joints', min: 0.004, max: 0.09, step: 0.001, def: 0.037, words: 'Smooth-union radius inside elbows and knees' },
  { key: 'neckBlend', group: 'joints', min: 0.004, max: 0.1, step: 0.001, def: 0.042, words: 'Smooth-union radius where the helmet meets the torso' },
  { key: 'ballScale', group: 'joints', min: 1, max: 1.7, step: 0.01, def: 1.3, words: 'Ball-joint radius / tube radius' },
  { key: 'ringT', group: 'joints', min: 0.008, max: 0.032, step: 0.001, def: 0.016, words: 'Thickness of rings, collar and cuffs' },
  { key: 'ribs', group: 'joints', min: 1, max: 4, step: 1, def: 2, words: 'Accordion ribs on each side of an elbow or knee' },
  { key: 'ribDepth', group: 'joints', min: 0.05, max: 0.4, step: 0.01, def: 0.2, words: 'Accordion rib height / tube radius' },
  { key: 'collar', group: 'joints', type: 'select', options: ['off', 'on'], def: 0, words: 'Neck seal: a ring where the helmet meets the torso' },
  { key: 'gloveCuff', group: 'joints', type: 'select', options: ['off', 'on'], def: 0, words: 'Glove cuff: a separate rim at each wrist' },
  { key: 'bootCuff', group: 'joints', type: 'select', options: ['off', 'on'], def: 0, words: 'Boot cuff: a separate rim at each ankle' },
  { key: 'cuffScale', group: 'joints', min: 1, max: 1.6, step: 0.01, def: 1.2, words: 'Cuff radius / the tube it sits on' },
  // Backpack and accents
  { key: 'packW', group: 'backpack', min: 0.1, max: 0.22, step: 0.0025, def: 0.184, words: 'Backpack half-width' },
  { key: 'packH', group: 'backpack', min: 0.07, max: 0.18, step: 0.0025, def: 0.137, words: 'Backpack half-height' },
  { key: 'packD', group: 'backpack', min: 0.035, max: 0.12, step: 0.0025, def: 0.079, words: 'Backpack half-depth (how far it sticks out)' },
  { key: 'packRound', group: 'backpack', min: 0.1, max: 1, step: 0.01, def: 0.53, words: 'Backpack corner radius / its smallest half-size' },
  { key: 'band', group: 'backpack', type: 'select', options: ['sleeve', 'shoulder ring'], def: 0, words: 'Where the contributor colour goes on the arm: a sleeve band, or the shoulder ring (ring shoulders only)' },
];

export const DEFAULTS = Object.fromEntries(PARAMS.map((p) => [p.key, p.def]));
export const PARAM_BY_KEY = Object.fromEntries(PARAMS.map((p) => [p.key, p]));

/** A parameter's value in words, for tables. */
export function showValue(key, v) {
  const p = PARAM_BY_KEY[key];
  if (p.type === 'select') return p.options[v];
  return String(Math.round(v * 1000) / 1000);
}
