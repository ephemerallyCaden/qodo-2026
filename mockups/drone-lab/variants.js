// The base-model directions: each is a parameter set for the one drone in drone.js. Anything
// not listed keeps its default (params.js). All directions wear the unbranded base palette, so
// the lineup compares shape only.
// Selects: ears 0 none 1 pods 2 fins; topper 0 none 1 goggles 2 crest; body 0 off 1 on;
// prop 0 rotors 1 ring 2 anti-grav 3 jet; rotorN 0 top 1 twin 2 quad; antenna 0 none 1 stalk 2 twin;
// arms 0 none 1 nubs 2 claws; accent 0 none 1 band 2 panel 3 stripe; accentOn 0 head 1 body.
// Eyes: 0 dots 1 cyclops 2 visor slit 3 binocular 4 three 5 happy 6 LED 7 heartbeat 8 slant 9 X 10 pills 11 blocks 12 prompt.
export const VARIANTS = [
  {
    id: 'A', name: 'Bubble buddy',
    leaning: 'One round pebble that is all face: a big screen, nub arms, a stalk antenna, an anti-grav lens over two floating halos.',
    params: {
      body: 0, headW: 0.205, headH: 0.19, headD: 0.18, headRound: 0.85, headTaper: 0.86,
      screenW: 0.7, screenH: 0.52, screenY: 0.08, screenRound: 4, bezel: 0.18,
      arms: 1, armY: -0.35, armLen: 0.065, armSplay: 0.75, prop: 2, glowR: 0.075,
      accent: 1, accentY: -0.8, accentW: 0.1,
    },
  },
  {
    id: 'B', name: 'Monitor bot',
    leaning: 'A boxy little terminal on a pill body: square screen in a thick bezel, twin antennae, a ring thruster.',
    params: {
      headW: 0.2, headH: 0.15, headD: 0.15, headRound: 0, headCorner: 0.42,
      screenW: 0.8, screenH: 0.72, screenY: 0, screenRound: 7, bezel: 0.12, eyes: 11,
      bodyW: 0.1, bodyH: 0.075, bodyD: 0.095, bodyRound: 0.6, bodyTaper: 0.85, bodySink: 0.03,
      antenna: 2, antTilt: 0.42, antL: 0.075, arms: 0, prop: 1, ringR: 0.12, ringT: 0.026,
      accent: 2, accentOn: 1, accentY: 0.1, accentW: 0.28,
    },
  },
  {
    id: 'C', name: 'Quad scout',
    leaning: 'The literal drone: a flat-bottomed dome with a wide visor face on a four-rotor X frame. No arms, all flight.',
    params: {
      body: 0, headW: 0.22, headH: 0.2, headD: 0.2, headRound: 0.8, headFlat: 0.35,
      screenW: 0.74, screenH: 0.46, screenY: 0.12, screenRound: 5, bezel: 0.2, eyes: 5,
      prop: 0, rotorN: 2, rotorR: 0.085, rotorArm: 0.095, rotorY: 0.05, antenna: 0, arms: 0,
      accent: 3, accentW: 0.24,
    },
  },
  {
    id: 'D', name: 'Capsule helper',
    leaning: 'An upright pill worker: round head on a tapered capsule body, little claw arms, a jet plume, a band on the belly.',
    params: {
      headW: 0.17, headH: 0.15, headD: 0.155, headRound: 0.8,
      screenW: 0.74, screenH: 0.6, screenY: 0.02, screenRound: 4, bezel: 0.18, eyes: 3,
      bodyW: 0.12, bodyH: 0.11, bodyD: 0.115, bodyRound: 0.9, bodyTaper: 0.72, bodySink: 0.05, neckBlend: 0.035,
      arms: 2, armY: 0.15, armLen: 0.1, armR: 0.022, armSplay: 0.85, prop: 3, glowR: 0.055, plumeL: 0.1,
      antTilt: 0.2, accent: 1, accentOn: 1, accentY: -0.15, accentW: 0.16,
    },
  },
  {
    id: 'E', name: 'Saucer dome',
    leaning: 'A tiny UFO: a wide half-dome head with swept fins and a crest, riding a broad ring thruster.',
    params: {
      body: 0, headW: 0.2, headH: 0.23, headD: 0.2, headRound: 1, headFlat: 0.5, headTaper: 1.15,
      screenW: 0.72, screenH: 0.42, screenY: 0.2, screenRound: 3.2, bezel: 0.2, eyes: 1,
      ears: 2, earR: 0.065, earT: 0.012, earY: 0.2, topper: 2, antenna: 0, arms: 0,
      prop: 1, ringR: 0.25, ringT: 0.032, accent: 0,
    },
  },
  {
    id: 'F', name: 'Beanie copter',
    leaning: 'A wide headphone head (ear pods) with a beanie rotor on top, a little body and nub arms: the most character.',
    params: {
      headW: 0.215, headH: 0.16, headD: 0.165, headRound: 0.55, headCorner: 0.8,
      screenW: 0.66, screenH: 0.6, screenY: -0.06, screenRound: 4.5, bezel: 0.18, eyes: 10,
      ears: 1, earR: 0.075, earT: 0.026, earY: -0.05,
      bodyW: 0.1, bodyH: 0.07, bodyD: 0.09, bodyRound: 0.85, bodyTaper: 0.8,
      prop: 0, rotorN: 0, rotorR: 0.12, rotorArm: 0.08, antenna: 0,
      arms: 1, armLen: 0.06, armY: 0.1, accent: 1, accentOn: 1, accentY: 0.1, accentW: 0.22,
    },
  },
];

// The recommended base model (marked in the lineup; used for the crew shot and turntable).
export const RECOMMENDED = 'F';
