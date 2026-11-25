// The per-tile checks, shared by lab.mjs and the tests. A tile's stats come from lab.js tileStats():
// renders with the depth fade off of the ship and crew alone, the bare ship, the bare ship without its
// flame, and one render per astronaut with that astronaut hidden. Every check fails on empty output.

// What each framing must show of every astronaut aboard: at least `px` pixels and a solid `block` x
// `block` patch (a 2 x 2 block is the art direction's smallest readable feature, §1).
export const CREW_MIN = {
  close: { px: 20, block: 3 },
  crew: { px: 200, block: 6 },
  near: { px: 12, block: 2 },
  system: null, // beside the star at 18.8: reported, not gated (the ship must read there; its crew shows from the near distance in)
};
// What the captain's cap must add (the captain reads differently from the teammates), per framing.
export const CAP_MIN = {
  close: { px: 6, block: 2 },
  crew: { px: 40, block: 4 },
  near: { px: 8, block: 2 },
  system: null, // reported
};

/**
 * Problems with one tile. opts.teal: the teal option tile (teal allowed). opts.crewGate: gate each
 * astronaut's visibility: in the front view (windows face the camera; turned views are reported only),
 * and for a two-deck ship (taller, so its crew is smaller in the whole-ship close-up) at the near distance.
 */
export function tileProblems(s, where, { teal = false, crewGate = s.cell.view === 'front' && (s.cell.n <= 8 || s.cell.framing === 'near') } = {}) {
  const out = [];
  const c = s.cell;
  if (s.shipPx < 40) out.push(`${where}: empty or tiny ship (${s.shipPx} px)`);
  if (s.strays.length) out.push(`${where}: colours outside the ship's BLK 36 palette and the crew's: ${JSON.stringify(s.strays)}`);
  if (s.shipStray) out.push(`${where}: ${s.shipStray} ship px outside the ship palette`);
  if (!teal && s.tealPx) out.push(`${where}: ${s.tealPx} teal px with no event`);
  if (teal && !s.tealPx) out.push(`${where}: the teal option shows no teal`);
  if (c.framing !== 'crew' && s.clipped) out.push(`${where}: the ship touches the tile edge (${s.clipped} px)`);
  if (s.hullPieces !== 1) out.push(`${where}: the hull is ${s.hullPieces} pieces, wanted one connected piece`);
  if (s.pieces !== 1) out.push(`${where}: ship and crew are ${s.pieces} pieces, wanted one (the crew rides aboard)`);
  if (c.framing !== 'crew' && s.flamePx < 1) out.push(`${where}: no thruster flame`); // the crew close-up crops to the crew
  const want = Math.min(c.n, 16);
  if (s.drawn !== want) out.push(`${where}: ${s.drawn} astronauts drawn, wanted ${want}`);
  const min = CREW_MIN[c.framing];
  const capMin = CAP_MIN[c.framing];
  if (capMin && crewGate && (s.cap.px < capMin.px || s.cap.block < capMin.block)) out.push(`${where}: the captain's cap shows ${s.cap.px} px (largest block ${s.cap.block}), wanted at least ${capMin.px} px and a ${capMin.block}x${capMin.block} block`);
  if (min && crewGate) s.crew.forEach((k, i) => {
    if (k.px < min.px || k.block < min.block) out.push(`${where}: astronaut ${i + 1} shows ${k.px} px (largest block ${k.block}), wanted at least ${min.px} px and a ${min.block}x${min.block} block`);
  });
  return out;
}

/** Pixel diff count between two RGBA buffers. */
export function diffCount(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++;
  return n;
}

/**
 * Loop-seam problems from lab.js loop(). The frame one cycle later must be frame 0 exactly; then the
 * last -> first step is one of the loop's own steps (the flame's hashed flicker makes some steps bigger
 * than others), so it only has to be no outlier: at most 1.5x the largest step inside the loop.
 */
export function seamProblems(l, where) {
  const out = [];
  if (l.same) out.push(`${where}: the frame one cycle later differs from frame 0 by ${l.same} px`);
  if (l.wrap > 1.5 * l.maxStep) out.push(`${where}: wrap diff ${l.wrap} px > 1.5x the largest step ${l.maxStep} px (a visible seam)`);
  if (!l.maxStep) out.push(`${where}: nothing moves (empty or frozen loop)`);
  return out;
}

export const decode = (b64) => new Uint8Array(Buffer.from(b64, 'base64'));
