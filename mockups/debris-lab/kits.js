// Debris kits: what one piece is made of, per stale-work class (D1). Pure data, no three.js, so
// the shapes are testable in Node; debris.js turns parts into meshes.
//
// A part is { shape, pos, frag, tag?, detail? } plus its size:
//   box:  size [x, y, z]
//   cyl:  r (at -x), r2 (at +x, default r), len; the axis is x (a cone when r2 != r)
// Parts are in kit units; a piece's world size is kit units x `scale`. `frag` groups parts into
// the fragments a broken piece (D2) or a swept piece (D6) falls apart into. `cell` is the rust
// patch size in kit units: rust is decided per cell of a grid in the piece's own frame, so patches
// stick to the piece as it tumbles, and a cell is never smaller than 2 internal px at hero range.
// A `detail` part (a plate, a lid, a rim) is dropped from pieces too small to draw it at least 2 px
// thick at hero range, like small planets showing fewer cracks: small junk is plainer, not noisier.

export const CLASSES = ['pr', 'branch', 'merged', 'agent'];
export const MIN_FEATURE_PX = 2;
export const CLASS_LABEL = { pr: 'stale PR', branch: 'abandoned branch', merged: 'merged, not deleted', agent: 'orphaned agent branch' };

// World units per internal pixel at the viewer's hero framing (distance ~7.05, fov 35, 180 px tall).
export const HERO_PX = (2 * 7.05 * Math.tan((17.5 * Math.PI) / 180)) / 180;
const lerp = (a, b, t) => a + (b - a) * t;

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

/** 0..1 from a diff size in changed lines: log scale, 1 line -> 0, 10k+ lines -> 1. */
export const sizeNorm = (diff) => Math.min(1, Math.max(0, Math.log10(Math.max(1, diff)) / 4));

/** The block count for a diff (kit C). */
export const blockCount = (diff) => Math.round(lerp(BLOCKS[0], BLOCKS[1], sizeNorm(diff)));

/** Extent [min, max] per axis of a part list, in kit units. */
export function extent(parts) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const half = p.shape === 'box' ? p.size.map((s) => s / 2) : [p.len / 2, Math.max(p.r, p.r2 ?? p.r), Math.max(p.r, p.r2 ?? p.r)];
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], p.pos[i] - half[i]);
      hi[i] = Math.max(hi[i], p.pos[i] + half[i]);
    }
  }
  return { lo, hi, size: hi.map((h, i) => h - lo[i]) };
}

/** The thinnest part dimension of a part list, in kit units. */
export function thinnest(parts) {
  return Math.min(...parts.map((p) => (p.shape === 'box' ? Math.min(...p.size) : Math.min(p.len, 2 * Math.min(p.r, p.r2 ?? p.r)))));
}

/** Drops detail parts thinner than 2 internal px at hero range for this scale. */
const legible = (parts, scale) => parts.filter((p) => !p.detail || thinnest([p]) * scale >= MIN_FEATURE_PX * HERO_PX);

/** Centres a part list on its bounding box (to whole units for blocks, so each block stays one rust cell). */
function centred(parts, whole = false) {
  const { lo, hi } = extent(parts);
  const c = lo.map((l, i) => (whole ? Math.round : Number)((l + hi[i]) / 2));
  return parts.map((p) => ({ ...p, pos: p.pos.map((x, i) => x - c[i]) }));
}

// Every kit's build(cls, diff) returns { parts, scale, cell, spread }: `spread` is how far broken
// fragments part, in kit units (a piece's length for the scaled kits, a block for blocks).
/** A kit whose pieces are one part table per class, scaled by the diff. */
const scaledKit = (partsOf, [s0, s1]) => ({
  build(cls, diff) {
    const scale = lerp(s0, s1, sizeNorm(diff));
    return { parts: centred(legible(partsOf(cls), scale)), scale, cell: Math.max(0.34, (MIN_FEATURE_PX * 1.1 * HERO_PX) / scale), spread: 1 };
  },
});

export const KITS = {
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
};

/** Fragment ids of a built piece, in order. */
export const fragIds = (parts) => [...new Set(parts.map((p) => p.frag))].sort((a, b) => a - b);

/** Centroid of one fragment's parts (kit units). */
export function fragCentre(parts, frag) {
  const own = parts.filter((p) => p.frag === frag);
  return [0, 1, 2].map((i) => own.reduce((s, p) => s + p.pos[i], 0) / own.length);
}
