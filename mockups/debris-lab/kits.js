// The lab's exploration kits (directions A-E, A2), registered into the viewer's kit registry
// (../asset-viewer/debris-kits.js, which holds the shared machinery and the product kit, A3
// `outlined`). Pure data, no three.js, so the shapes are testable in Node. See the viewer module for
// the part format.
import { KITS, scaledKit, panelledKit, centred, sizeNorm, lerp, SATELLITE_SCALE } from '../asset-viewer/debris-kits.js';

export * from '../asset-viewer/debris-kits.js';

// --------------------------------------------------------------- hardware (A, B, E)
// Recognisable spacecraft junk, one silhouette per class:
//   stale PR             a comms satellite: a small bus between two big flat panels (they flash edge-on as it turns)
//   abandoned branch     a girder: a long beam with an end plate and a joint plate (a stick)
//   merged, not deleted  a spent stage: a cylinder with a nose cone and a flared nozzle bell
//   orphaned agent       a cargo crate with a lid (a square)
const HARDWARE = {
  pr: [
    { shape: 'box', size: [0.26, 0.24, 0.24], pos: [0, 0, 0], frag: 0 },
    { shape: 'box', size: [0.46, 0.52, 0.07], pos: [-0.36, 0, 0], frag: 1 },
    { shape: 'box', size: [0.46, 0.52, 0.07], pos: [0.36, 0, 0], frag: 2 },
  ],
  branch: [
    { shape: 'box', size: [0.9, 0.24, 0.24], pos: [-0.35, 0, 0], frag: 0 },
    { shape: 'box', size: [0.68, 0.24, 0.24], pos: [0.45, 0, 0], frag: 1 },
    { shape: 'box', size: [0.16, 0.42, 0.42], pos: [-0.8, 0, 0], frag: 0, detail: true },
    { shape: 'box', size: [0.13, 0.36, 0.36], pos: [0.1, 0, 0], frag: 0, detail: true },
  ],
  merged: [
    { shape: 'cyl', r: 0.21, len: 0.42, pos: [-0.04, 0, 0], frag: 0 },
    { shape: 'cyl', r: 0.11, r2: 0.25, len: 0.2, pos: [0.27, 0, 0], frag: 1 },
    { shape: 'cyl', r: 0.08, r2: 0.21, len: 0.12, pos: [-0.31, 0, 0], frag: 2 },
  ],
  agent: [
    { shape: 'box', size: [0.37, 0.56, 0.58], pos: [-0.185, 0, 0], frag: 0 },
    { shape: 'box', size: [0.37, 0.56, 0.58], pos: [0.185, 0, 0], frag: 1 },
    { shape: 'box', size: [0.8, 0.14, 0.66], pos: [0, 0.33, 0], frag: 2, detail: true },
  ],
};
const HARDWARE_SCALE = [0.21, 0.4]; // world size of 1 kit unit, smallest .. biggest diff (8.5-16 px long at hero range)

// --------------------------------------------------------------- blocks (C)
// Scrap made of chunky cubes. The block count is the diff size (2 to 10 blocks), and each class
// grows its blocks in its own pattern, so the class shows from about 4 blocks up (broken: the blocks
// part into up to four chunks):
//   stale PR             a plus sign (a satellite's arms)
//   abandoned branch     a long rod that forks near its end
//   merged, not deleted  a 2-high slab growing in length (a spent stage)
//   orphaned agent       a 2x2x2 crate
const BLOCK_ORDER = {
  pr: [[0, 0, 0], [-1, 0, 0], [1, 0, 0], [0, 1, 0], [0, -1, 0], [-2, 0, 0], [2, 0, 0], [0, 2, 0], [0, -2, 0], [-3, 0, 0]],
  branch: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0], [4, 0, 0], [5, 0, 0], [4, 1, 0], [4, 2, 0], [6, 0, 0], [7, 0, 0]],
  merged: [[0, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 0], [2, 0, 0], [2, 1, 0], [3, 0, 0], [3, 1, 0], [4, 0, 0], [4, 1, 0]],
  agent: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1], [2, 0, 0], [2, 1, 0]],
};
const BLOCK_WORLD = 0.06; // one block: 2.4 internal px at hero range, 2 px at the lineup framing
const BLOCKS = [2, 10];

// --------------------------------------------------------------- canisters (D)
// Every class is the same canister; the class is the colour of its painted band (palette TAGS).
const CANISTER = [
  { shape: 'cyl', r: 0.21, len: 0.25, pos: [-0.255, 0, 0], frag: 0 },
  { shape: 'cyl', r: 0.21, len: 0.26, pos: [0, 0, 0], frag: 0, tag: true },
  { shape: 'cyl', r: 0.21, len: 0.25, pos: [0.255, 0, 0], frag: 1 },
  { shape: 'cyl', r: 0.25, len: 0.14, pos: [-0.45, 0, 0], frag: 0, detail: true },
  { shape: 'cyl', r: 0.25, len: 0.14, pos: [0.45, 0, 0], frag: 1, detail: true },
];
const CANISTER_SCALE = [0.22, 0.4];

/** The block count for a diff (kit C). */
export const blockCount = (diff) => Math.round(lerp(BLOCKS[0], BLOCKS[1], sizeNorm(diff)));

// --------------------------------------------------------------- satellites (A2)
// The human's pick (A) refined: grey metal with red paint, and pieces that read as satellite parts.
// Red is about a third of every piece, so debris shows at a glance (the human: "really be noticeable").
//   stale PR             a comms satellite: a red bus and dish between two solar wings (a request sent, no reply)
//   abandoned branch     a snapped radio-mast boom in red and grey bands (a limb that never connected)
//   merged, not deleted  a spent stage with a red band and nose (the job was done; never jettisoned)
//   orphaned agent       a detached 2x2 solar array on a red boom with a torn mount (power for work
//                        that went nowhere: an agent's part, left behind)
const SATELLITE = {
  pr: [
    { shape: 'box', size: [0.3, 0.3, 0.3], pos: [0, 0, 0], frag: 0, paint: true },
    { shape: 'box', size: [0.56, 0.38, 0.05], pos: [-0.44, 0, 0], frag: 1, panel: true },
    { shape: 'box', size: [0.56, 0.38, 0.05], pos: [0.44, 0, 0], frag: 2, panel: true },
    { shape: 'cyl', axis: 'y', r: 0.07, r2: 0.24, len: 0.1, pos: [0, 0.2, 0], frag: 0, paint: true },
  ],
  branch: [ // a radio-mast boom: red and grey bands, snapped in two
    { shape: 'box', size: [0.14, 0.3, 0.3], pos: [-0.74, 0, 0], frag: 0, paint: true },
    { shape: 'box', size: [0.3, 0.23, 0.23], pos: [-0.52, 0, 0], frag: 0 },
    { shape: 'box', size: [0.22, 0.23, 0.23], pos: [-0.26, 0, 0], frag: 0, paint: true },
    { shape: 'box', size: [0.3, 0.23, 0.23], pos: [0, 0, 0], frag: 0 },
    { shape: 'box', size: [0.22, 0.23, 0.23], pos: [0.26, 0, 0], frag: 1, paint: true },
    { shape: 'box', size: [0.34, 0.23, 0.23], pos: [0.54, 0, 0], frag: 1 },
  ],
  merged: [
    { shape: 'cyl', r: 0.21, len: 0.12, pos: [-0.22, 0, 0], frag: 0 },
    { shape: 'cyl', r: 0.21, len: 0.16, pos: [-0.08, 0, 0], frag: 0, paint: true },
    { shape: 'cyl', r: 0.21, len: 0.18, pos: [0.09, 0, 0], frag: 0 },
    { shape: 'cyl', r: 0.11, r2: 0.25, len: 0.2, pos: [0.28, 0, 0], frag: 1 },
    { shape: 'cyl', r: 0.08, r2: 0.21, len: 0.12, pos: [-0.34, 0, 0], frag: 2, paint: true },
  ],
  agent: [ // a 2x2 array on a red boom, with its torn red mount (a cross spar read as a first-aid sign)
    { shape: 'box', size: [1.08, 0.24, 0.12], pos: [0, 0, 0], frag: 0, paint: true },
    { shape: 'box', size: [0.18, 0.34, 0.26], pos: [-0.63, 0, 0], frag: 0, paint: true },
    { shape: 'box', size: [0.42, 0.42, 0.06], pos: [-0.33, 0.33, 0], frag: 0, panel: true },
    { shape: 'box', size: [0.42, 0.42, 0.06], pos: [0.33, 0.33, 0], frag: 1, panel: true },
    { shape: 'box', size: [0.42, 0.42, 0.06], pos: [-0.33, -0.33, 0], frag: 2, panel: true },
    { shape: 'box', size: [0.42, 0.42, 0.06], pos: [0.33, -0.33, 0], frag: 3, panel: true },
  ],
};

Object.assign(KITS, {
  hardware: scaledKit((cls) => HARDWARE[cls], HARDWARE_SCALE),
  blocks: {
    build(cls, diff) {
      const n = blockCount(diff);
      // a broken piece splits into up to four chunks: the quadrants of its own x-y plane
      const parts = centred(BLOCK_ORDER[cls].slice(0, n).map((pos) => ({ shape: 'box', size: [1, 1, 1], pos, frag: 0 })), true);
      return { parts: parts.map((p) => ({ ...p, frag: (p.pos[0] >= 0 ? 1 : 0) + (p.pos[1] >= 0 ? 0 : 2) })), scale: BLOCK_WORLD, cell: 1, spread: 2.4 };
    },
  },
  canister: scaledKit(() => CANISTER, CANISTER_SCALE),
  // age shows as chipped, dulled paint and scorch (palette PAINT, DULL, NAVY), not rust
  satellite: panelledKit((cls) => SATELLITE[cls], SATELLITE_SCALE, 'paint'),
});
