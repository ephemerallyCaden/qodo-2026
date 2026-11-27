// The astronauts' visor eyes (art-direction §8): the ApprenticeHack V2 designs, eyes only, ported from the
// asset viewer (feature/asset-library, mockups/asset-viewer/faces.js). All ten are evaluated analytically per
// fragment in the astronaut's shader, as 2D distance fields in visor-screen space, so they are
// resolution-independent and only the pixel pass pixelates them. Each crew member's design comes from their
// seed (CrewMember.seed, a hash of their person id), never from a name. Pure: strings and numbers only.
import { mulberry32 } from '../model/prng.js';

/** The ten V2 eye designs, in the shader's order (`uEyes`). */
export const EYE_DESIGNS = ['dots', 'cyclops', 'visor', 'binocular', 'three', 'happy', 'led', 'heartbeat', 'slant', 'x'] as const;
export type EyeDesign = (typeof EYE_DESIGNS)[number];

/**
 * A crew member's look from their seed alone (principle 4: seeded variety inside one meaning): the eye
 * design, the contributor colour (one of `palette.crew.contributors`, by index), and where in the 12 s idle
 * the figure starts, as a whole number of frames, so the crew doesn't bob in step and the loop still closes.
 */
export function crewLook(seed: number, contributors: number, cycleFrames: number): { eyes: number; colour: number; phaseFrames: number } {
  const r = mulberry32((seed ^ 0x2c1b3c6d) >>> 0);
  return { eyes: Math.floor(r() * EYE_DESIGNS.length), colour: Math.floor(r() * contributors), phaseFrames: Math.floor(r() * cycleFrames) };
}

// GLSL. Screen space: the 4:3 visor screen mapped to a 32 x 24 box, with its centre at (16, 12) and
// e = min(24, 32 * 0.5) * 1.12, as in the source: the same offsets, radii and round-cap strokes. uBlink
// squashes the eyes vertically (1 = open). One deviation, the viewer's: `happy` uses stroke e * 0.11 (the
// source's max(e * 0.13, 2.6) reads as a chunky 'A' at this size).
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
