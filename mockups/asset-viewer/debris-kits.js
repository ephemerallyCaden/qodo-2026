// Debris kits: what one piece is made of, per stale-work class (space-debris.md D1). Pure data, no
// three.js, so the shapes are testable in Node; debris.js turns parts into meshes.
//
// A part is { shape, pos, frag, tag?, detail?, paint?, panel? } plus its size:
//   box:   size [x, y, z]
//   cyl:   r (at -x), r2 (at +x, default r), len; the axis is x (a cone when r2 != r), or y with axis: 'y'
//   light: a point at pos (a blinking nav light, A3)
// A `panel` box (thin in z) draws a solar cell grid on its big faces, with `grid` [cells along x,
// cells along y, line width along x, along y] set by the kit; with no room for a 2 px cell between
// 2 px lines it's a plain metal plate. Parts are in kit units; a piece's world size is kit units x
// `scale`. `frag` groups parts into the fragments a broken piece (D2) or a swept piece (D6) falls
// apart into. `cell` is the scorch/rust patch size in kit units: decided per cell of a grid in the
// piece's own frame, so patches stick to the piece as it tumbles, never under 2 px at hero range.
// A `detail` part is dropped from pieces too small to draw it at least 2 px thick at hero range,
// like small planets showing fewer cracks: small junk is plainer, not noisier.
//
// The viewer's kit is A3 `outlined` (the human's pick). The debris lab registers its exploration kits
// (directions A-E, A2) into KITS with the helpers exported here, so one factory draws them all.

export const CLASSES = ['pr', 'branch', 'merged', 'agent'];
export const MIN_FEATURE_PX = 2;
export const CLASS_LABEL = { pr: 'stale PR', branch: 'abandoned branch', merged: 'merged, not deleted', agent: 'orphaned agent branch' };

// World units per internal pixel at the viewer's hero framing (distance ~7.05, fov 35, 180 px tall).
export const HERO_PX = (2 * 7.05 * Math.tan((17.5 * Math.PI) / 180)) / 180;
export const lerp = (a, b, t) => a + (b - a) * t;

/** 0..1 from a diff size in changed lines: log scale, 1 line -> 0, 10k+ lines -> 1. */
export const sizeNorm = (diff) => Math.min(1, Math.max(0, Math.log10(Math.max(1, diff)) / 4));

/** A part with a body (box or cyl); a `light` part is a point: a blinking nav light (A3). */
export const isSolid = (p) => p.shape !== 'light';

/** Extent [min, max] per axis of a part list's solid parts, in kit units. */
export function extent(parts) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of parts.filter(isSolid)) {
    const rr = Math.max(p.r ?? 0, p.r2 ?? p.r ?? 0);
    const half = p.shape === 'box' ? p.size.map((s) => s / 2) : p.axis === 'y' ? [rr, p.len / 2, rr] : [p.len / 2, rr, rr];
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], p.pos[i] - half[i]);
      hi[i] = Math.max(hi[i], p.pos[i] + half[i]);
    }
  }
  return { lo, hi, size: hi.map((h, i) => h - lo[i]) };
}

/** The thinnest part dimension of a part list, in kit units. */
export function thinnest(parts) {
  return Math.min(...parts.filter(isSolid).map((p) => (p.shape === 'box' ? Math.min(...p.size) : Math.min(p.len, 2 * Math.min(p.r, p.r2 ?? p.r)))));
}

/** Drops detail parts thinner than 2 internal px at hero range for this scale. */
export const legible = (parts, scale) => parts.filter((p) => !p.detail || thinnest([p]) * scale >= MIN_FEATURE_PX * HERO_PX);

/** Centres a part list on its bounding box (to whole units for blocks, so each block stays one rust cell). */
export function centred(parts, whole = false) {
  const { lo, hi } = extent(parts);
  const c = lo.map((l, i) => (whole ? Math.round : Number)((l + hi[i]) / 2));
  return parts.map((p) => ({ ...p, pos: p.pos.map((x, i) => x - c[i]) }));
}

const GRID = { line: 2, cell: 2 }; // px at hero range: grid lines and the smallest cell

/** A panel's cell grid at this scale: as many >= 2 px cells as fit between >= 2 px lines (0: no cells, a plain metal plate). */
export function panelGrid(p, scale) {
  const along = (len) => {
    const px = (len * scale) / HERO_PX;
    return [Math.max(0, Math.floor((px - GRID.line) / (GRID.cell + GRID.line))), GRID.line / px];
  };
  const [nx, lx] = along(p.size[0]), [ny, ly] = along(p.size[1]);
  return [nx, ny, lx, ly];
}

// Every kit's build(cls, diff) returns { parts, scale, cell, spread, age? }: `spread` is how far broken
// fragments part, in kit units; `age` 'outline' (A3) means age shows as the outline dimming, dead
// nav lights and scorch instead of rust ('paint' is the lab's A2).
/** A kit whose pieces are one part table per class, scaled by the diff. */
export const scaledKit = (partsOf, [s0, s1]) => ({
  build(cls, diff) {
    const scale = lerp(s0, s1, sizeNorm(diff));
    return { parts: centred(legible(partsOf(cls), scale)), scale, cell: Math.max(0.34, (MIN_FEATURE_PX * 1.1 * HERO_PX) / scale), spread: 1 };
  },
});
/** The same, with every panel's cell grid laid out for its scale. */
export const panelledKit = (partsOf, range, age) => ({
  build(cls, diff) {
    const b = scaledKit(partsOf, range).build(cls, diff);
    return { ...b, parts: b.parts.map((p) => (p.panel ? { ...p, grid: panelGrid(p, b.scale) } : p)), age };
  },
});

export const SATELLITE_SCALE = [0.22, 0.36]; // 11.5-19 px across at hero range

// --------------------------------------------------------------- A3 `outlined` (the product look)
// Grey satellite parts, red only as a 1 px outline and two blinking nav lights per piece:
//   stale PR             a comms satellite: a bus and dish between two solar wings (a request sent, no reply)
//   abandoned branch     a snapped radio-mast boom (a limb that never connected)
//   merged, not deleted  a spent stage with a nose and a nozzle bell (the job was done; never jettisoned)
//   orphaned agent       a detached 2x2 solar array on a boom with a torn mount (power for work that
//                        went nowhere: an agent's part, left behind)
// Joined so the outline hull shows no seams: same-section parts overlap or meet inside a collar, a
// cone's wide end stays narrower than the body it sits on, the satellite's bus is taller than its
// wings and the array's gap stays open around the outline.
const OUTLINED = {
  pr: [
    { shape: 'box', size: [0.36, 0.44, 0.34], pos: [0, 0, 0], frag: 0 },
    { shape: 'box', size: [0.6, 0.3, 0.05], pos: [-0.46, 0, 0], frag: 1, panel: true },
    { shape: 'box', size: [0.6, 0.3, 0.05], pos: [0.46, 0, 0], frag: 2, panel: true },
    { shape: 'cyl', axis: 'y', r: 0.07, r2: 0.26, len: 0.12, pos: [0, 0.26, 0], frag: 0 },
    { shape: 'light', pos: [-0.77, 0.13, 0.03], frag: 1 },
    { shape: 'light', pos: [0.77, 0.13, 0.03], frag: 2 },
  ],
  branch: [
    { shape: 'box', size: [0.14, 0.3, 0.3], pos: [-0.74, 0, 0], frag: 0 },
    { shape: 'box', size: [0.84, 0.23, 0.23], pos: [-0.27, 0, 0], frag: 0 },
    { shape: 'box', size: [0.1, 0.31, 0.31], pos: [0.15, 0, 0], frag: 0 },
    { shape: 'box', size: [0.56, 0.23, 0.23], pos: [0.45, 0, 0], frag: 1 },
    { shape: 'light', pos: [-0.83, 0, 0], frag: 0 },
    { shape: 'light', pos: [0.75, 0.05, 0], frag: 1 },
  ],
  merged: [
    { shape: 'cyl', r: 0.21, len: 0.46, pos: [-0.04, 0, 0], frag: 0 },
    { shape: 'cyl', r: 0.11, r2: 0.25, len: 0.2, pos: [0.29, 0, 0], frag: 1 },
    { shape: 'cyl', r: 0.08, r2: 0.18, len: 0.12, pos: [-0.33, 0, 0], frag: 2 },
    { shape: 'light', pos: [-0.41, 0, 0], frag: 2 },
    { shape: 'light', pos: [0.4, 0.22, 0], frag: 1 },
  ],
  agent: [
    { shape: 'box', size: [1.36, 0.24, 0.12], pos: [-0.02, 0, 0], frag: 0 },
    { shape: 'box', size: [0.18, 0.34, 0.26], pos: [-0.75, 0, 0], frag: 0 },
    { shape: 'box', size: [0.4, 0.42, 0.06], pos: [-0.44, 0.33, 0], frag: 0, panel: true },
    { shape: 'box', size: [0.4, 0.42, 0.06], pos: [0.44, 0.33, 0], frag: 1, panel: true },
    { shape: 'box', size: [0.4, 0.42, 0.06], pos: [-0.44, -0.33, 0], frag: 2, panel: true },
    { shape: 'box', size: [0.4, 0.42, 0.06], pos: [0.44, -0.33, 0], frag: 3, panel: true },
    { shape: 'light', pos: [-0.86, 0.12, 0], frag: 0 },
    { shape: 'light', pos: [0.66, -0.56, 0.03], frag: 3 },
  ],
};

/** The kit registry (the lab adds its explorations). */
export const KITS = {
  outlined: panelledKit((cls) => OUTLINED[cls], SATELLITE_SCALE, 'outline'),
};

/** Fragment ids of a built piece, in order. */
export const fragIds = (parts) => [...new Set(parts.map((p) => p.frag))].sort((a, b) => a - b);

/** Centroid of one fragment's solid parts (kit units). */
export function fragCentre(parts, frag) {
  const own = parts.filter((p) => p.frag === frag && isSolid(p));
  return [0, 1, 2].map((i) => own.reduce((s, p) => s + p.pos[i], 0) / own.length);
}
