// The base-model variants: each is a parameter set for the one drone in drone.js. Anything
// not listed keeps its default (params.js). Every variant honours the human's brief: head-is-body,
// a thruster pack with smoke puffs, about half an astronaut tall, a BLK 36 shell, a dark screen
// with V2 eyes glowing teal, no arms, and the full idle loop (bob, look around, work, bank).
// Selects: rim/chin 0 off 1 on; ears 0 none 1 pods 2 fins; topper 0 none 1 goggles 2 crest;
// antenna 0 none 1 stalk 2 twin; thrusters 0 twin under 1 single under 2 quad 3 rear 4 twin rear;
// smoke 0 round puffs 1 wisps 2 sputter dots; accent 0 none 1 band 2 panel 3 stripe.
// Eyes (V2): 0 dots 1 cyclops 2 visor slit 3 binocular 4 three 5 happy 6 LED 7 heartbeat 8 slant 9 X.
export const VARIANTS = [
  {
    id: 'A', name: 'Monitor buddy',
    leaning: 'Eager: a rounded-cube terminal head, all screen, with twin antennae, four corner nozzles sputtering dots and sparkles.',
    params: {
      size: 1.15,
      headW: 0.165, headH: 0.14, headD: 0.135, headRound: 0.1, headCorner: 0.55,
      screenW: 0.82, screenH: 0.76, screenY: 0, screenRound: 7, bezel: 0.12, eyes: 5,
      antenna: 2, antTilt: 0.45, antL: 0.05,
      thrusters: 2, thrR: 0.024, thrL: 0.03, thrSpread: 0.62, thrFlare: 1.2,
      smoke: 2, puffSize: 1.2, puffRate: 0.85, sparkles: 4,
      bobAmp: 0.024, drift: 0.18, bank: 0.3, glance: 5.5, lookYaw: 0.35,
    },
  },
  {
    id: 'B', name: 'Shy bean',
    leaning: 'Shy: a tall teardrop with a small high porthole, little ear pods, eyes cast down, one soft under-jet of round puffs.',
    params: {
      size: 1.05,
      headW: 0.13, headH: 0.18, headD: 0.135, headRound: 1, headTaper: 1.3,
      screenW: 0.62, screenH: 0.45, screenY: 0.2, screenRound: 2, bezel: 0.34, eyes: 0, eyeScale: 1.05, gaze: -2.5, glance: 3,
      ears: 1, earR: 0.04, earT: 0.016, earY: 0.15, codeRows: 2,
      thrusters: 1, thrR: 0.034, thrL: 0.03, thrFlare: 1.15,
      smoke: 0, puffSize: 1.05, puffRate: 0.5,
      bobAmp: 0.012, drift: 0.1, bank: 0.2, lookYaw: 0.18,
    },
  },
  {
    id: 'C', name: 'Visor racer',
    leaning: 'Sleek: a long low capsule with a wraparound visor band and a dorsal crest, one rear jet laying wispy trails, banking hard.',
    params: {
      size: 1.3,
      headW: 0.16, headH: 0.16, headD: 0.25, headRound: 1, headTaper: 0.92,
      screenW: 2.2, screenH: 0.34, screenY: 0.08, screenRound: 6, bezel: 0.14, eyes: 8,
      topper: 2, crestH: 0.035,
      thrusters: 3, thrR: 0.04, thrL: 0.05, thrFlare: 1.15,
      smoke: 1, puffSize: 1.1, puffRate: 0.75,
      bobAmp: 0.012, drift: 0.22, bank: 0.34, lookYaw: 0.25, glance: 4,
      accent: 3, accentW: 0.22,
    },
  },
  {
    id: 'D', name: 'Saucer scout',
    leaning: 'Retro: a flattened saucer head with a trim brim, a wide oval screen, a stalk antenna, twin under-pods puffing clouds and sparkles.',
    params: {
      size: 1.25,
      headW: 0.235, headH: 0.13, headD: 0.22, headRound: 1, headFlat: 0.25,
      rim: 1, rimY: -0.32, rimT: 0.02,
      screenW: 0.7, screenH: 0.66, screenY: 0.18, screenRound: 3, bezel: 0.18, eyes: 3,
      antenna: 1, antL: 0.06, antTilt: 0.15,
      thrusters: 0, thrR: 0.03, thrL: 0.04, thrSpread: 0.5, thrFlare: 0.85,
      smoke: 0, puffSize: 0.95, puffRate: 0.6, sparkles: 2,
      drift: 0.15, bank: 0.25,
    },
  },
  {
    id: 'E', name: 'Chunky dumpling',
    leaning: 'Chunky: a squat dome with a big low face, a tiny chin pod carrying twin rear jets, a belly band and big lazy puffs.',
    params: {
      size: 1.2,
      headW: 0.205, headH: 0.18, headD: 0.19, headRound: 0.85, headFlat: 0.45, headCorner: 0.8,
      chin: 1, chinR: 0.08,
      screenW: 0.78, screenH: 0.48, screenY: -0.02, screenRound: 4, bezel: 0.16, eyes: 6,
      thrusters: 4, thrR: 0.04, thrL: 0.055, thrSpread: 0.5, thrFlare: 1.15,
      smoke: 0, puffSize: 1.35, puffRate: 0.65,
      bobAmp: 0.014, drift: 0.12, bank: 0.18, lookYaw: 0.2,
      accent: 1, accentY: -0.4, accentW: 0.08,
    },
  },
];

// The recommended base model (marked in the lineup).
export const RECOMMENDED = 'A';
