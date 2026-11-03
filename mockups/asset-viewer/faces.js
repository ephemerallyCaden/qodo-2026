// Visor faces: the ApprenticeHack Avatar V2 eye designs (eyes only), read from
// js/avatar-v2.js (EYES, "lit shapes in the eye light on the dark visor") and the
// registry in js/avatar-parts-v2.js. Shapes and proportions follow the source:
// s is the screen box and e = min(s.h, s.w * 0.5) * 1.12. Every shape is rasterised
// by testing texel centres against the exact geometry, so edges are pixel-clean
// with no anti-aliasing. Pupils cut back to the visor colour (mask 0).

export const EYE_DESIGNS = [
  { key: 'dots', name: 'Dots' },
  { key: 'cyclops', name: 'Cyclops' },
  { key: 'visor', name: 'Visor slit' },
  { key: 'binocular', name: 'Binocular' },
  { key: 'three', name: 'Three eyes' },
  { key: 'happy', name: 'Happy' },
  { key: 'led', name: 'LED bar' },
  { key: 'heartbeat', name: 'Heartbeat' },
  { key: 'slant', name: 'Slant' },
  { key: 'x', name: 'X eyes' },
];

// Face texture: the 4:3 visor screen. ~1 texel per internal pixel in the crew close-up.
export const FACE_W = 32;
export const FACE_H = 24;

/** Same string hash as ApprenticeHack (hashStr). */
export function hashStr(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Eye design index for a contributor handle. */
export const eyesFor = (handle) => hashStr(handle + 'e') % EYE_DESIGNS.length;

// ---------------------------------------------------------------- geometry
const segDist = (px, py, [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
};
const inPoly = (px, py, pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inRoundRect = (px, py, x, y, w, h, r) => {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.max(x + r, Math.min(x + w - r, px));
  const cy = Math.max(y + r, Math.min(y + h - r, py));
  return Math.hypot(px - cx, py - cy) <= r;
};

// Each design returns shapes { lit, test(px, py) }; later shapes paint over earlier ones.
const circle = (cx, cy, r, lit = true) => ({ lit, test: (x, y) => Math.hypot(x - cx, y - cy) <= r });
// Polyline with round caps and joins, as the source's stroke-linecap="round".
const stroke = (pts, w) => ({ lit: true, test: (x, y) => pts.slice(1).some((p, i) => segDist(x, y, pts[i], p) <= w / 2) });
const rrect = (x0, y0, w, h, r) => ({ lit: true, test: (x, y) => inRoundRect(x, y, x0, y0, w, h, r) });

const DESIGNS = {
  dots: (s, e) => [-1, 1].map((k) => circle(s.cx + k * s.w * 0.22, s.cy, e * 0.2)),
  cyclops: (s, e) => [circle(s.cx, s.cy, e * 0.36), circle(s.cx, s.cy, e * 0.36 * 0.45, false)],
  visor: (s, e) => {
    const h = e * 0.24, w = s.w * 0.68;
    return [rrect(s.cx - w / 2, s.cy - h / 2, w, h, h / 2)];
  },
  binocular: (s, e) => [-1, 1].flatMap((k) => {
    const cx = s.cx + k * s.w * 0.21, r = e * 0.27;
    return [circle(cx, s.cy, r), circle(cx, s.cy, r * 0.45, false)];
  }),
  three: (s, e) => [-1, 0, 1].map((k) => circle(s.cx + k * s.w * 0.26, s.cy, e * 0.15)),
  happy: (s, e) => {
    // Source: max(e * 0.13, 2.6). That reads as a chunky 'A' on a 32 px screen, so thinner here.
    const w = e * 0.11, dy = e * 0.13, hw = s.w * 0.1;
    return [-1, 1].map((k) => {
      const cx = s.cx + k * s.w * 0.22;
      return stroke([[cx - hw, s.cy + dy], [cx, s.cy - dy], [cx + hw, s.cy + dy]], w);
    });
  },
  led: (s, e) => {
    const h = e * 0.22, w = s.w * 0.7, n = 4, gap = w * 0.08, cw = (w - gap * (n - 1)) / n;
    return Array.from({ length: n }, (_, i) => rrect(s.cx - w / 2 + i * (cw + gap), s.cy - h / 2, cw, h, 0.8));
  },
  heartbeat: (s, e) => {
    const w = s.w * 0.36, a = e * 0.24;
    return [stroke([[s.cx - w, s.cy], [s.cx - w * 0.3, s.cy], [s.cx - w * 0.1, s.cy - a], [s.cx + w * 0.15, s.cy + a], [s.cx + w * 0.35, s.cy], [s.cx + w, s.cy]], 2.2)];
  },
  slant: (s, e) => {
    const t = Math.max(e * 0.17, 2.4);
    return [-1, 1].map((k) => {
      const o = s.cx + k * s.w * 0.36, i = s.cx + k * s.w * 0.07;
      const pts = [[o, s.cy - t], [i, s.cy - t * 0.1], [i, s.cy + t], [o, s.cy + t]];
      return { lit: true, test: (x, y) => inPoly(x, y, pts) };
    });
  },
  x: (s, e) => {
    const a = Math.max(e * 0.15, 2.6), w = Math.max(e * 0.1, 2.2);
    return [-1, 1].flatMap((k) => {
      const cx = s.cx + k * s.w * 0.22;
      return [stroke([[cx - a, s.cy - a], [cx + a, s.cy + a]], w), stroke([[cx - a, s.cy + a], [cx + a, s.cy - a]], w)];
    });
  },
};

/**
 * Rasterise eye design `idx` into a FACE_W x FACE_H RGBA buffer (white = lit,
 * row 0 = top), centred on the screen. `squash` < 1 flattens the eyes about the
 * centre line, for a blink.
 */
export function faceBitmap(idx, squash = 1) {
  const s = { cx: FACE_W / 2, cy: FACE_H / 2, w: FACE_W, h: FACE_H };
  const e = Math.min(s.h, s.w * 0.5) * 1.12;
  const shapes = DESIGNS[EYE_DESIGNS[idx].key](s, e);
  const data = new Uint8Array(FACE_W * FACE_H * 4);
  for (let y = 0; y < FACE_H; y++) {
    for (let x = 0; x < FACE_W; x++) {
      const px = x + 0.5;
      const py = s.cy + (y + 0.5 - s.cy) / Math.max(squash, 0.05);
      let lit = false;
      for (const sh of shapes) if (sh.test(px, py)) lit = sh.lit;
      if (lit) data.fill(255, (y * FACE_W + x) * 4, (y * FACE_W + x) * 4 + 4);
    }
  }
  return data;
}
