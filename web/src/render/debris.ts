// The debris in the scene (R13, art-direction §6 "Debris", space-debris.md A3): every piece of every body in three
// draw calls, whatever their number (debris-l1.md §3.2). One merged mesh holds every drawn fragment's faces, lit in
// four flat bands from the key light, darkened in its home's shadow, scorched per cell with age; the same geometry
// drawn again, back faces only and pushed out 1.2 px along its smoothed normals, is the 1 px red outline (the
// debris-only exception to "no outlines", the human's, 2026-11-10); one Points draws every 2 px nav light. Ported
// from the asset viewer's debris.js (feature/asset-library), which drew a mesh, a hull and a Points per fragment.
//
// Poses are worked out on the CPU each frame (debris/place.ts fragPoses, pure) and written into the shared vertex
// buffers relative to the scene's floating origin, so the GPU only draws: a frame is a function of (pieces,
// sweeps, frame) alone (Rule 3), and no texture is needed (Rule 4's nearest-only rule has nothing to hold). Every
// colour is a uniform from palette.debris and palette.accent.teal (Rule 5). Ordinary geometry in the z-buffer,
// faded per pixel by depthFade, so it sorts against planets, moons, fog, drones and the ship with no extra pass.
import * as THREE from 'three';
import { palette } from '../../../src/core/palette.js';
import { homeBase } from '../drones/place.js';
import { fragPoses, lightOn, orbitPoint, qmul, quat, sweepAt, SWEEP, type NavLight, type Piece } from '../debris/place.js';
import { FPS, loopPhase } from '../model/motion.js';
import type { SystemModel } from '../model/system.js';
import type { Sphere, Vec3 } from '../model/vec.js';
import { color, ramp, SHARED } from './materials.js';
import { DEPTH } from './shaders.js';
import type { SolidPart } from './debris-kits.js';

/** The outline's push past the silhouette, internal px: a touch over 1 so diagonal edges don't gap (the viewer's OUTLINE_PX). */
const OUTLINE_PX = 1.2;
/** Light bands: hard metal faces, a wide lit band (the viewer's BANDS). */
const BANDS = new THREE.Vector3(-0.12, 0.28, 0.64);
/** A selected piece's teal reaches the lit band only (the viewer's uFlash 0.2): an event, never at rest. */
export const SELECTED_FLASH = 0.2;

const BODY_VERT = /* glsl */ `
  in vec3 aNormalL;
  in vec3 aLocal;
  in vec4 aGrid;
  in vec4 aStyle;
  in vec4 aShadow;
  in vec2 aState;
  out vec3 vNormalW;
  out vec3 vNormalL;
  out vec3 vPosW;
  out vec3 vLocal;
  out vec2 vUv;
  flat out vec4 vGrid;
  flat out vec4 vStyle;
  flat out vec4 vShadow;
  flat out float vFlash;
  void main() {
    vNormalW = normal; // written in world space each frame (render/debris.ts)
    vNormalL = aNormalL;
    vUv = uv;
    vLocal = aLocal - aNormalL * 0.02; // just inside the surface, so a face never sits on a scorch-cell boundary
    vGrid = aGrid;
    vStyle = aStyle;
    vShadow = aShadow;
    vFlash = aState.x;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const BODY_FRAG = /* glsl */ `
  uniform vec3 uLight;
  uniform vec3 uBands;
  uniform vec3 uMetal[4];
  uniform vec3 uDark;
  uniform vec3 uTeal[4];
  ${DEPTH}
  in vec3 vNormalW;
  in vec3 vNormalL;
  in vec3 vPosW;
  in vec3 vLocal;
  in vec2 vUv;
  flat in vec4 vGrid;
  flat in vec4 vStyle;   // scorch share, cell size (kit units), cell hash offset, outline (1 bright, 2 dim)
  flat in vec4 vShadow;  // the home's centre and radius: a piece behind it, from the light, is in its shadow
  flat in float vFlash;
  // integer-cell hash (cells come from floor(), so the same panel scorches on every frame)
  float cellHash(vec3 c) {
    vec3 p = fract(c * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  // a solar panel's grid line along one face axis: n cells between lines lw wide (both in 0..1 of the face);
  // with no room for a cell (n = 0) the whole face is frame, so a small panel is a grey plate, not a hole in space
  bool onLine(float u, float n, float lw) {
    if (n < 0.5) return true;
    float g = u * n;
    return u < lw || u > 1.0 - lw || min(fract(g), 1.0 - fract(g)) / n < lw * 0.5;
  }
  void main() {
    float d = dot(normalize(vNormalW), uLight);
    int b = d > uBands.z ? 3 : d > uBands.y ? 2 : d > uBands.x ? 1 : 0;
    vec3 oc = vPosW - vShadow.xyz;
    float bq = dot(oc, uLight);
    if (bq < 0.0 && dot(oc, oc) - bq * bq < vShadow.w * vShadow.w) b = 0;
    vec3 cell = floor(vLocal / vStyle.y + 0.5) + vStyle.z;
    vec3 c = uMetal[b];
    if (vStyle.x > 0.0 && cellHash(cell + 17.0) < vStyle.x) c = uDark; // scorched metal
    if (vGrid.z > 0.0 && abs(vNormalL.z) > 0.5 && !onLine(vUv.x, vGrid.x, vGrid.z) && !onLine(vUv.y, vGrid.y, vGrid.w)) c = uDark; // solar cells; the frame and grid stay metal
    if (vFlash > 0.0 && float(b) >= 3.0 - vFlash * 3.0 - 0.01) c = uTeal[b]; // an event: teal fills down from the lit band
    gl_FragColor = vec4(depthFade(c, vPosW, 1.0), 1.0);
  }
`;
// The red outline: an inverted hull. Every vertex pushed out along its smoothed normal (view space) by uPx internal
// pixels at its own depth, back faces only, so the shell always sits behind the body and shows only past its
// silhouette, as a 1 px rim. A fragment without one (a broken piece's small ones, a swept piece) leaves the clip volume.
const OUTLINE_VERT = /* glsl */ `
  in vec3 aOutline;
  in vec4 aStyle;
  in vec2 aState;
  uniform float uPxH;
  uniform float uPx;
  out vec3 vPosW;
  flat out float vEdge;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec4 vp = viewMatrix * wp;
    vec3 n = normalize(mat3(viewMatrix) * aOutline);
    float worldPerPx = 2.0 * -vp.z / (projectionMatrix[1][1] * uPxH);
    vp.xyz += n * uPx * worldPerPx;
    vPosW = (inverse(viewMatrix) * vp).xyz;
    vEdge = aStyle.w;
    gl_Position = aState.y > 0.5 ? projectionMatrix * vp : vec4(2.0, 2.0, 2.0, 1.0);
  }
`;
const OUTLINE_FRAG = /* glsl */ `
  uniform vec3 uEdge[2]; // bright, dim
  ${DEPTH}
  in vec3 vPosW;
  flat in float vEdge;
  void main() {
    gl_FragColor = vec4(depthFade(vEdge < 1.5 ? uEdge[0] : uEdge[1], vPosW, 1.0), 1.0);
  }
`;
// Nav lights: 2 px points, lit or not as the CPU says (debris/place.ts lightOn: loop-locked blinks); an unlit one
// leaves the clip volume.
const LIGHT_VERT = /* glsl */ `
  in float aOn;
  out vec3 vPosW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = aOn > 0.5 ? projectionMatrix * viewMatrix * wp : vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 2.0;
  }
`;
const LIGHT_FRAG = /* glsl */ `
  uniform vec3 uColor;
  ${DEPTH}
  in vec3 vPosW;
  void main() {
    gl_FragColor = vec4(depthFade(uColor, vPosW, 1.0), 1.0);
  }
`;

/** A piece to draw, and the frame its sweep began (null: it's at rest). */
export interface DebrisEntry { piece: Piece; sweep: number | null }

/** One fragment's run of vertices in the merged mesh, and its shape in its own frame (kit units). */
interface Span { start: number; count: number; pos: Float32Array; nrm: Float32Array; out: Float32Array; edge: boolean }
interface Slot { entry: DebrisEntry; spans: Span[]; lights: { light: NavLight; frag: number; rel: Vec3; at: number }[] }

/** A part as indexed triangles in the piece's frame (kit units). */
function partGeometry(p: SolidPart): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  if (p.shape === 'box') g = new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]);
  else {
    g = new THREE.CylinderGeometry(p.r2 ?? p.r, p.r, p.len, 12, 1); // top (+y) is r2
    if (p.axis !== 'y') g.rotateZ(-Math.PI / 2); // +y → +x
  }
  g.translate(p.pos[0], p.pos[1], p.pos[2]);
  return g;
}

/** Each vertex's outline direction: the normals of every face meeting at its position, averaged, so the hull has no corner gaps. */
function smoothed(pos: readonly number[], nrm: readonly number[]): Float32Array {
  const key = (i: number) => `${pos[3 * i]!.toFixed(4)},${pos[3 * i + 1]!.toFixed(4)},${pos[3 * i + 2]!.toFixed(4)}`;
  const sum = new Map<string, Vec3>();
  const n = pos.length / 3;
  for (let i = 0; i < n; i++) {
    const v = sum.get(key(i)) ?? [0, 0, 0];
    sum.set(key(i), [v[0] + nrm[3 * i]!, v[1] + nrm[3 * i + 1]!, v[2] + nrm[3 * i + 2]!]);
  }
  const out = new Float32Array(pos.length);
  for (let i = 0; i < n; i++) {
    const [x, y, z] = sum.get(key(i))!, l = Math.hypot(x, y, z) || 1;
    out.set([x / l, y / l, z / l], 3 * i);
  }
  return out;
}

/** A dynamic attribute of `n` items of `k` floats. */
const dynamic = (n: number, k: number) => new THREE.BufferAttribute(new Float32Array(n * k), k).setUsage(THREE.DynamicDrawUsage);

/** A unit quaternion as a row-major 3×3 rotation. */
function matrix(q: readonly number[]): number[] {
  const [x, y, z, w] = q as [number, number, number, number];
  return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
}

export class DebrisField {
  readonly group = new THREE.Group();
  private slots: Slot[] = [];
  private readonly geometry = new THREE.BufferGeometry();
  private readonly lightGeometry = new THREE.BufferGeometry();
  private readonly bodyMat: THREE.ShaderMaterial;
  private readonly outlineMat: THREE.ShaderMaterial;
  private readonly lightMat: THREE.ShaderMaterial;

  constructor() {
    this.bodyMat = new THREE.ShaderMaterial({
      vertexShader: BODY_VERT, fragmentShader: BODY_FRAG,
      uniforms: {
        ...SHARED, uBands: { value: BANDS },
        uMetal: { value: ramp(palette.debris.metal, 4) }, uDark: { value: color(palette.debris.metal[0]) }, uTeal: { value: ramp(palette.accent.teal, 4) },
      },
    });
    this.outlineMat = new THREE.ShaderMaterial({
      vertexShader: OUTLINE_VERT, fragmentShader: OUTLINE_FRAG, side: THREE.BackSide,
      uniforms: { ...SHARED, uPxH: { value: 180 }, uPx: { value: OUTLINE_PX }, uEdge: { value: [color(palette.debris.outline.bright), color(palette.debris.outline.dim)] } },
    });
    this.lightMat = new THREE.ShaderMaterial({
      vertexShader: LIGHT_VERT, fragmentShader: LIGHT_FRAG,
      uniforms: { ...SHARED, uColor: { value: color(palette.debris.light) } },
    });
    const body = new THREE.Mesh(this.geometry, this.bodyMat);
    const outline = new THREE.Mesh(this.geometry, this.outlineMat);
    const lights = new THREE.Points(this.lightGeometry, this.lightMat);
    for (const o of [body, outline, lights]) { o.frustumCulled = false; o.matrixAutoUpdate = false; this.group.add(o); }
    this.set([]);
  }

  /** The pieces drawn, in draw order. */
  get entries(): readonly DebrisEntry[] { return this.slots.map((s) => s.entry); }

  /** Replaces the pieces drawn: their geometry is built once here; pose() only moves it. */
  set(entries: readonly DebrisEntry[]): void {
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [], local: number[] = [], grid: number[] = [], style: number[] = [], index: number[] = [];
    this.slots = entries.map((entry) => {
      const p = entry.piece;
      const spans = p.frags.map((f) => {
        const start = pos.length / 3;
        const fp: number[] = [], fn: number[] = [];
        for (const part of p.parts) {
          if (part.frag !== f.id) continue;
          const g = partGeometry(part);
          const gp = g.getAttribute('position'), gn = g.getAttribute('normal'), gu = g.getAttribute('uv'), base = pos.length / 3 + fp.length / 3;
          for (let i = 0; i < gp.count; i++) {
            fp.push(gp.getX(i), gp.getY(i), gp.getZ(i));
            fn.push(gn.getX(i), gn.getY(i), gn.getZ(i));
            uv.push(gu.getX(i), gu.getY(i));
            grid.push(...(part.shape === 'box' && part.grid ? part.grid : [0, 0, 0, 0]));
            style.push(p.scorch, p.cell, p.hashOff, p.outline === 'bright' ? 1 : 2);
          }
          const gi = g.getIndex()!;
          for (let i = 0; i < gi.count; i++) index.push(base + gi.getX(i));
          g.dispose();
        }
        const out = smoothed(fp, fn);
        local.push(...fp); // the piece's own frame: where its scorch cells are
        const own = new Float32Array(fp.length);
        for (let i = 0; i < fp.length; i += 3) for (let k = 0; k < 3; k++) own[i + k] = fp[i + k]! - f.centre[k]!;
        pos.push(...own);
        nrm.push(...fn);
        return { start, count: fp.length / 3, pos: own, nrm: Float32Array.from(fn), out, edge: p.outlineFrags.includes(f.id) };
      });
      return { entry, spans, lights: [] as Slot['lights'] };
    });
    let at = 0;
    for (const s of this.slots) {
      const p = s.entry.piece;
      s.lights = p.lights.map((l) => {
        const k = p.frags.findIndex((f) => f.id === l.frag), c = p.frags[k]!.centre;
        return { light: l, frag: k, rel: [l.pos[0] - c[0], l.pos[1] - c[1], l.pos[2] - c[2]] as Vec3, at: at++ };
      });
    }
    const n = pos.length / 3, g = this.geometry;
    for (const name of Object.keys(g.attributes)) g.deleteAttribute(name);
    g.setIndex(index);
    g.setAttribute('position', dynamic(n, 3));
    g.setAttribute('normal', dynamic(n, 3));
    g.setAttribute('aOutline', dynamic(n, 3));
    g.setAttribute('aShadow', dynamic(n, 4));
    g.setAttribute('aState', dynamic(n, 2));
    g.setAttribute('aNormalL', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aLocal', new THREE.Float32BufferAttribute(local, 3));
    g.setAttribute('aGrid', new THREE.Float32BufferAttribute(grid, 4));
    g.setAttribute('aStyle', new THREE.Float32BufferAttribute(style, 4));
    const lg = this.lightGeometry;
    for (const name of Object.keys(lg.attributes)) lg.deleteAttribute(name);
    lg.setAttribute('position', dynamic(at, 3));
    lg.setAttribute('aOn', dynamic(at, 1));
    this.group.visible = this.slots.length > 0;
  }

  /**
   * Poses every piece for exactly this frame, relative to `origin` (the scene's floating origin). `pixelHeight` sizes
   * the outline's 1.2 px; `selected` is a piece's id, drawn with a teal lit band. A sweeping piece flashes teal,
   * bursts and shrinks on its own clock from the frame it began (D6), and is gone at its end, with no trace.
   */
  pose(model: SystemModel, frame: number, pixelHeight: number, origin: Vec3, selected: string | null = null): void {
    this.group.visible = this.slots.length > 0;
    if (this.slots.length === 0) return;
    this.outlineMat.uniforms['uPxH']!.value = pixelHeight;
    const phase = loopPhase(frame);
    const g = this.geometry;
    const P = g.getAttribute('position').array as Float32Array, N = g.getAttribute('normal').array as Float32Array;
    const O = g.getAttribute('aOutline').array as Float32Array, S = g.getAttribute('aShadow').array as Float32Array, T = g.getAttribute('aState').array as Float32Array;
    const LP = this.lightGeometry.getAttribute('position').array as Float32Array, LO = this.lightGeometry.getAttribute('aOn').array as Float32Array;
    for (const slot of this.slots) {
      const { piece, sweep } = slot.entry;
      const home = homeBase(model, piece.home, frame);
      const sw = sweep === null ? null : sweepAt((frame - sweep) / FPS);
      if (!home || sw?.gone) { this.collapse(slot, P, S, T, LO); continue; }
      const hx = home.centre[0] - origin[0], hy = home.centre[1] - origin[1], hz = home.centre[2] - origin[2];
      const poses = fragPoses(piece, phase, sw);
      const flash = sw ? sw.flash : piece.id === selected ? SELECTED_FLASH : 0;
      const ms = poses.map((f) => matrix(qmul(quat(...f.tumble), quat(...f.spin))));
      slot.spans.forEach((span, k) => {
        const f = poses[k]!, m = ms[k]!, s = piece.scale * f.scale;
        const cx = hx + f.centre[0], cy = hy + f.centre[1], cz = hz + f.centre[2];
        const edge = !sw && span.edge ? 1 : 0;
        for (let i = 0; i < span.count; i++) {
          const j = 3 * (span.start + i), v = 3 * i;
          const x = span.pos[v]! * s, y = span.pos[v + 1]! * s, z = span.pos[v + 2]! * s;
          P[j] = cx + m[0]! * x + m[1]! * y + m[2]! * z;
          P[j + 1] = cy + m[3]! * x + m[4]! * y + m[5]! * z;
          P[j + 2] = cz + m[6]! * x + m[7]! * y + m[8]! * z;
          const a = span.nrm[v]!, b = span.nrm[v + 1]!, c = span.nrm[v + 2]!;
          N[j] = m[0]! * a + m[1]! * b + m[2]! * c; N[j + 1] = m[3]! * a + m[4]! * b + m[5]! * c; N[j + 2] = m[6]! * a + m[7]! * b + m[8]! * c;
          const oa = span.out[v]!, ob = span.out[v + 1]!, oc = span.out[v + 2]!;
          O[j] = m[0]! * oa + m[1]! * ob + m[2]! * oc; O[j + 1] = m[3]! * oa + m[4]! * ob + m[5]! * oc; O[j + 2] = m[6]! * oa + m[7]! * ob + m[8]! * oc;
          const q = 4 * (span.start + i);
          S[q] = hx; S[q + 1] = hy; S[q + 2] = hz; S[q + 3] = home.radius;
          const t = 2 * (span.start + i);
          T[t] = flash; T[t + 1] = edge;
        }
      });
      for (const l of slot.lights) {
        const f = poses[l.frag]!, m = ms[l.frag]!, s = piece.scale * f.scale, [x, y, z] = [l.rel[0] * s, l.rel[1] * s, l.rel[2] * s];
        LP[3 * l.at] = hx + f.centre[0] + m[0]! * x + m[1]! * y + m[2]! * z;
        LP[3 * l.at + 1] = hy + f.centre[1] + m[3]! * x + m[4]! * y + m[5]! * z;
        LP[3 * l.at + 2] = hz + f.centre[2] + m[6]! * x + m[7]! * y + m[8]! * z;
        LO[l.at] = !sw && lightOn(l.light, phase) ? 1 : 0; // a sweep kills the lights
      }
    }
    for (const name of ['position', 'normal', 'aOutline', 'aShadow', 'aState']) g.getAttribute(name).needsUpdate = true;
    this.lightGeometry.getAttribute('position').needsUpdate = true;
    this.lightGeometry.getAttribute('aOn').needsUpdate = true;
  }

  /** A piece that isn't drawn this frame (its sweep ended, or its home left the layout): every vertex on one point, no outline, no lights. */
  private collapse(slot: Slot, P: Float32Array, S: Float32Array, T: Float32Array, LO: Float32Array): void {
    for (const span of slot.spans) {
      for (let i = 0; i < span.count; i++) {
        P.fill(0, 3 * (span.start + i), 3 * (span.start + i) + 3);
        S.fill(0, 4 * (span.start + i), 4 * (span.start + i) + 4);
        T.fill(0, 2 * (span.start + i), 2 * (span.start + i) + 2);
      }
    }
    for (const l of slot.lights) LO[l.at] = 0;
  }

  /**
   * The pieces at rest as picking spheres at a frame, in `entries` order (world units): a sweeping piece, or one
   * whose home left the layout, is null.
   */
  spheres(model: SystemModel, frame: number): (Sphere | null)[] {
    const phase = loopPhase(frame);
    return this.slots.map(({ entry: { piece, sweep } }) => {
      const home = homeBase(model, piece.home, frame);
      if (!home || (sweep !== null && frame >= sweep)) return null;
      const o = orbitPoint(piece.orbit, phase);
      return { centre: [home.centre[0] + o[0], home.centre[1] + o[1], home.centre[2] + o[2]], radius: piece.bound };
    });
  }

  /** Whether any sweep is still running at `frame` (the view keeps drawing until it ends). */
  sweeping(frame: number): boolean {
    return this.slots.some((s) => s.entry.sweep !== null && frame < s.entry.sweep + Math.ceil(SWEEP.end * FPS));
  }

  dispose(): void {
    this.geometry.dispose();
    this.lightGeometry.dispose();
    this.bodyMat.dispose();
    this.outlineMat.dispose();
    this.lightMat.dispose();
  }
}
