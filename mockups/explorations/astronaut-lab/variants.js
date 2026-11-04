// The lineup: each variant is a parameter set for the one astronaut in astronaut.js.
// Anything not listed keeps its default (params.js), which reproduces A, the current spec.
// Joint selects: shoulder/hip 0 blend, 1 ring, 2 ball; elbow/knee 0 bend, 1 ball, 2 accordion.
export const VARIANTS = [
  {
    id: 'A', name: 'Current spec',
    leaning: 'The approved chibi as it ships: 57% helmet, one smooth bent tube per limb. The reference.',
    params: {},
  },
  {
    id: 'B', name: 'Soft vinyl toy',
    leaning: 'Pudgier and rounder: egg torso, fat even limbs and very wide blends, so every joint melts in.',
    params: {
      headFrac: 0.56, torsoW: 0.16, torsoD: 0.13, torsoCorner: 1, torsoEgg: 0.35, hipX: 0.092,
      armLen: 0.18, armR: 0.072, armTaper: 1, elbowBend: 0.5, legR: 0.084, legTaper: 1, kneeBend: 0.9,
      mittR: 0.07, bootW: 0.072, bootH: 0.046, bootL: 0.08,
      bodyBlend: 0.065, bendBlend: 0.06, neckBlend: 0.06, packW: 0.17, packD: 0.08, packRound: 1,
    },
  },
  {
    id: 'C', name: 'Hard-suit engineer',
    leaning: 'Crisp: ring collars at shoulders and hips, accordion elbows and knees, cuffs, neck seal, boxy torso and pack.',
    params: {
      helmetSink: 0.05, torsoW: 0.16, torsoCorner: 0.3, hipX: 0.09, armR: 0.058, legR: 0.07,
      shoulder: 1, hip: 1, elbow: 2, knee: 2, collar: 1, gloveCuff: 1, bootCuff: 1, band: 1,
      bodyBlend: 0.012, bendBlend: 0.012, neckBlend: 0.012, ringT: 0.018, ribs: 2, ribDepth: 0.22,
      bootH: 0.045, bootL: 0.09, packW: 0.19, packH: 0.15, packD: 0.095, packRound: 0.25,
    },
  },
  {
    id: 'D', name: 'Lanky cadet',
    leaning: 'Taller chibi: 45% helmet on a neck seal, longer gently tapered limbs, slim torso and pack.',
    params: {
      headFrac: 0.45, helmetSink: 0.04, legShare: 0.53, torsoW: 0.14, torsoD: 0.11, torsoTaper: 0.9, torsoCorner: 0.5,
      armLen: 0.27, armR: 0.052, armTaper: 0.85, armSplay: 0.5, elbowBend: 0.7, legR: 0.064, legTaper: 0.85, kneeBend: 1,
      mittR: 0.056, bootL: 0.08, collar: 1, packW: 0.15, packH: 0.13, packD: 0.06,
    },
  },
  {
    id: 'E', name: 'Pocket nub',
    leaning: 'Ultra-chibi: 63% helmet over a little egg body, with tiny straight nubs for arms and legs.',
    params: {
      headFrac: 0.63, helmetSink: 0.03, legShare: 0.42, torsoW: 0.16, torsoCorner: 1, torsoEgg: 0.2,
      armLen: 0.13, armR: 0.064, armTaper: 1, armSplay: 0.7, elbowBend: 0.1, legR: 0.08, legTaper: 1, kneeBend: 0.25,
      mittR: 0.07, bootH: 0.035, bootL: 0.07, bodyBlend: 0.04, packW: 0.15, packH: 0.1, packD: 0.06, packRound: 0.8, hipX: 0.09,
    },
  },
  {
    id: 'F', name: 'Heroic taper',
    leaning: 'A broad wedge chest, limbs thick at the root tapering to small mitts and boots.',
    params: {
      headFrac: 0.52, legShare: 0.52, torsoW: 0.17, torsoTaper: 0.75, torsoCorner: 0.5, hipX: 0.07,
      armLen: 0.22, armR: 0.08, armTaper: 0.58, mittR: 0.048, legR: 0.088, legTaper: 0.62,
      bootW: 0.055, bootH: 0.036, bootL: 0.07, bodyBlend: 0.03, packW: 0.19, packH: 0.14, packD: 0.07,
    },
  },
  {
    id: 'G', name: 'Ball-joint doll',
    leaning: 'Articulated figure: slender tubes between small gear-tone spheres at the shoulders, elbows and knees; hips stay blended.',
    params: {
      headFrac: 0.53, legShare: 0.55, torsoW: 0.145, torsoCorner: 0.4, hipX: 0.072,
      armLen: 0.22, armR: 0.044, armTaper: 0.9, legR: 0.054, legTaper: 0.9, kneeBend: 1, mittR: 0.055,
      shoulder: 2, hip: 0, elbow: 1, knee: 1, ballScale: 1.3, bodyBlend: 0.01, bendBlend: 0.01, packRound: 0.4,
    },
  },
  {
    id: 'H', name: 'Pear bean',
    leaning: 'Bottom-heavy: pear torso, slightly squashed dome, short splayed legs in big cuffed boots.',
    params: {
      headFrac: 0.55, headSquash: 0.9, legShare: 0.42, torsoW: 0.13, torsoD: 0.13, torsoTaper: 1.3, torsoCorner: 1, torsoEgg: 0.7,
      armLen: 0.17, armR: 0.06, mittR: 0.066, legR: 0.08, hipX: 0.095, kneeBend: 0.8,
      bootW: 0.075, bootH: 0.048, bootL: 0.09, gloveCuff: 1, bootCuff: 1, cuffScale: 1.25, bodyBlend: 0.06,
      packW: 0.15, packH: 0.12, packD: 0.08, packRound: 0.9,
    },
  },
  {
    id: 'I', name: 'Retro diver',
    leaning: 'A wide squashed dome on a thick collar, boxy torso, chunky square pack, ring shoulders and cuffs.',
    params: {
      headFrac: 0.55, headSquash: 0.86, helmetSink: 0.06, torsoW: 0.17, torsoD: 0.13, torsoCorner: 0.25,
      armR: 0.064, legR: 0.078, shoulder: 1, band: 1, collar: 1, gloveCuff: 1, ringT: 0.022, bodyBlend: 0.02,
      bootW: 0.072, bootH: 0.05, bootL: 0.09, packW: 0.2, packH: 0.16, packD: 0.1, packRound: 0.2,
    },
  },
  {
    id: 'J', name: 'Sleek racer',
    leaning: 'Streamlined: egg torso on a neck seal, slim smoothly tapered limbs, thin cuffs, slim rounded pack.',
    params: {
      headFrac: 0.52, helmetSink: 0.04, legShare: 0.55, torsoW: 0.14, torsoD: 0.11, torsoTaper: 0.85, torsoEgg: 0.8,
      armLen: 0.23, armR: 0.05, armTaper: 0.75, mittR: 0.052, legR: 0.06, legTaper: 0.75, bootH: 0.038, bootL: 0.08,
      elbow: 0, knee: 0, bendBlend: 0.03, bodyBlend: 0.03, collar: 1, gloveCuff: 1, bootCuff: 1,
      cuffScale: 1.12, ringT: 0.012, packW: 0.13, packH: 0.14, packD: 0.055, packRound: 0.9,
    },
  },
  {
    id: 'K', name: 'Final: C + A pack, smooth white',
    // C's grey (gear) detailing kept; every white-on-white detail back to A: elbow/knee
    // accordion -> smooth bend, torsoCorner 0.3 -> 0.65 (no bevelled box edges), body/bend/
    // neck blends 0.012 -> A's (no crisp white creases), backpack -> A's. Proportions stay C's.
    leaning: "The pick: C's grey hard-suit parts (ring collars, cuffs, neck seal) on smooth white tubes and torso, with A's backpack.",
    params: {
      helmetSink: 0.05, torsoW: 0.16, hipX: 0.09, armR: 0.058, legR: 0.07,
      shoulder: 1, hip: 1, collar: 1, gloveCuff: 1, bootCuff: 1, band: 1, ringT: 0.018,
      bootH: 0.045, bootL: 0.09,
    },
  },
];
