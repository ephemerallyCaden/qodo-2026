// Visor faces: the ApprenticeHack Avatar V2 eye designs (eyes only), from
// js/avatar-v2.js (EYES, "lit shapes in the eye light on the dark visor") and the
// registry in js/avatar-parts-v2.js. The shapes are evaluated analytically per
// fragment in the astronaut shader (2D SDFs in visor-screen space), so they are
// resolution-independent: the normal internal-resolution render pixelates them
// exactly like the rest of the model.

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

// GLSL. Screen space: the 4:3 visor screen mapped to a 32 x 24 box (s.w x s.h), with
// s.cx = 16, s.cy = 12 and e = min(s.h, s.w * 0.5) * 1.12, as in the source. Same
// offsets, radii and round-cap strokes. uBlink squashes the eyes vertically (1 = open).
// One deviation: `happy` uses stroke e * 0.11 (the source's max(e * 0.13, 2.6) reads
// as a chunky 'A' at this size).
export const EYES_GLSL = /* glsl */ `
  uniform int uEyes;
  uniform float uBlink;
  float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
  float sdRRect(vec2 p, vec2 c, vec2 hs, float r) { vec2 q = abs(p - c) - hs + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  float ring(vec2 p, vec2 c, float r) { float d = length(p - c); return max(d - r, r * 0.45 - d); } // disc minus pupil
  float cross2(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }
  bool inQuad(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d) { // convex, either winding
    float s0 = cross2(b - a, p - a), s1 = cross2(c - b, p - b), s2 = cross2(d - c, p - c), s3 = cross2(a - d, p - d);
    return (s0 >= 0.0 && s1 >= 0.0 && s2 >= 0.0 && s3 >= 0.0) || (s0 <= 0.0 && s1 <= 0.0 && s2 <= 0.0 && s3 <= 0.0);
  }

  bool eyeLit(vec2 uv) {
    const float W = 32.0, CX = 16.0, CY = 12.0;
    const float e = 16.0 * 1.12; // min(24, 32 * 0.5) * 1.12
    vec2 P = uv * vec2(32.0, 24.0);
    P.y = CY + (P.y - CY) / max(uBlink, 0.05);
    float d = 1e9;
    if (uEyes == 0) { // dots
      for (int k = -1; k <= 1; k += 2) d = min(d, length(P - vec2(CX + float(k) * W * 0.22, CY)) - e * 0.2);
    } else if (uEyes == 1) { // cyclops
      d = ring(P, vec2(CX, CY), e * 0.36);
    } else if (uEyes == 2) { // visor slit (pill)
      float h = e * 0.24;
      d = sdRRect(P, vec2(CX, CY), vec2(W * 0.34, h * 0.5), h * 0.5);
    } else if (uEyes == 3) { // binocular
      for (int k = -1; k <= 1; k += 2) d = min(d, ring(P, vec2(CX + float(k) * W * 0.21, CY), e * 0.27));
    } else if (uEyes == 4) { // three
      for (int k = -1; k <= 1; k++) d = min(d, length(P - vec2(CX + float(k) * W * 0.26, CY)) - e * 0.15);
    } else if (uEyes == 5) { // happy ^ ^
      float dy = e * 0.13, hw = W * 0.1;
      for (int k = -1; k <= 1; k += 2) {
        float cx = CX + float(k) * W * 0.22;
        d = min(d, min(sdSeg(P, vec2(cx - hw, CY + dy), vec2(cx, CY - dy)), sdSeg(P, vec2(cx, CY - dy), vec2(cx + hw, CY + dy))) - e * 0.055);
      }
    } else if (uEyes == 6) { // LED bar: 4 cells with 8% gaps
      float h = e * 0.22, w = W * 0.7, gap = w * 0.08, cw = (w - gap * 3.0) / 4.0;
      for (int i = 0; i < 4; i++) d = min(d, sdRRect(P, vec2(CX - w * 0.5 + float(i) * (cw + gap) + cw * 0.5, CY), vec2(cw * 0.5, h * 0.5), 0.8));
    } else if (uEyes == 7) { // heartbeat ECG
      float w = W * 0.36, a = e * 0.24;
      vec2 q0 = vec2(CX - w, CY), q1 = vec2(CX - w * 0.3, CY), q2 = vec2(CX - w * 0.1, CY - a);
      vec2 q3 = vec2(CX + w * 0.15, CY + a), q4 = vec2(CX + w * 0.35, CY), q5 = vec2(CX + w, CY);
      d = min(min(min(sdSeg(P, q0, q1), sdSeg(P, q1, q2)), min(sdSeg(P, q2, q3), sdSeg(P, q3, q4))), sdSeg(P, q4, q5)) - 1.1;
    } else if (uEyes == 8) { // slant: angled trapezoids
      float t = max(e * 0.17, 2.4);
      for (int k = -1; k <= 1; k += 2) {
        float o = CX + float(k) * W * 0.36, i = CX + float(k) * W * 0.07;
        if (inQuad(P, vec2(o, CY - t), vec2(i, CY - t * 0.1), vec2(i, CY + t), vec2(o, CY + t))) return true;
      }
    } else { // X eyes
      float a = max(e * 0.15, 2.6), sw = max(e * 0.1, 2.2);
      for (int k = -1; k <= 1; k += 2) {
        float cx = CX + float(k) * W * 0.22;
        d = min(d, min(sdSeg(P, vec2(cx - a, CY - a), vec2(cx + a, CY + a)), sdSeg(P, vec2(cx - a, CY + a), vec2(cx + a, CY - a))) - sw * 0.5);
      }
    }
    return d < 0.0;
  }

  // Monitor-reflection glint: a small fixed L in the screen's top-left corner, clear of every design.
  bool glintLit(vec2 uv) {
    vec2 G = uv * vec2(32.0, 24.0);
    return (G.y >= 3.0 && G.y < 4.0 && G.x >= 4.0 && G.x < 6.0) || (G.y >= 4.0 && G.y < 5.0 && G.x >= 4.0 && G.x < 5.0);
  }
`;

// ---------------------------------------------------------------- CPU rasteriser (compat)
// The viewer no longer uses this: eyes are evaluated in the shader (EYES_GLSL).
// Kept with its original signature because other mockups (mockups/ascii-fx)
// import FACE_W, FACE_H and faceBitmap from this module.
export const FACE_W = 32;
export const FACE_H = 24;

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
