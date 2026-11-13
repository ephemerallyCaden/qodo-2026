// One drone: the generic look (the lab's D-final) or the Claude look (D-final plus four stubby legs),
// ported from the drone lab (mockups/drone-lab/drone.js at 968bc0c). A drone is a single mesh, a proxy
// box whose fragment shader raymarches the body, so it costs one draw call. Everything here is a pure
// function of (look, seed, time t in seconds): bob, drift, banking, looking around, blinking, the working
// face and the smoke all run on the lab's 12 s motion loop, which divides the scene's 24 s loop twice
// (AGENTS.md Rule 4). The seed (from the snapshot, never a hash of a session id) only picks details.
import * as THREE from 'three';
import { palette } from '../../../src/core/palette.js';
import { mulberry32 } from '../model/prng.js';
import { FPS, LOOP_FRAMES } from '../model/motion.js';
import { ramp, SHARED } from './materials.js';
import { BMAX, BMIN, DRONE_FRAG, DRONE_VERT, MAX_LEGS, MAX_PUFFS, MAX_SPARKS } from './drone-shader.js';

export type DroneLook = 'claude' | 'generic';

/** The lab's motion loop (s). */
const MOTION_LOOP = 12;
const PUFF_PERIOD = 1.5;
const TAU = Math.PI * 2;
const W12 = TAU / MOTION_LOOP;
/** Whole cycles per motion loop: bob, sway, drift (puffs fire MOTION_LOOP / PUFF_PERIOD times). */
const CYCLES = { bob: 4, sway: 2, drift: 1 };

/** The lab's D-final, with the lab's defaults for what it doesn't name. */
const GENERIC = {
  size: 1.36, headW: 0.1275, headH: 0.095, headD: 0.125, headRound: 0.83, headCorner: 0.1, headTaper: 0.99, headFlat: 0.4,
  rimY: -0.45, rimT: 0.019, antL: 0.045, antTilt: 0.15,
  screenW: 1.17, screenH: 0.77, screenY: 0.18, screenRound: 3, bezel: 0.18, eyes: 3, eyeScale: 1, gaze: 0, glance: 4.5,
  glyphRate: 4, glyphPx: 1.4, glyphSet: 0,
  thrR: 0.0525, thrL: 0.015, thrFlare: 0.85, puffSize: 0.95, puffRate: 0.32, sparkles: 3,
  bobAmp: 0.043, drift: 0.165, bank: 0.32, lookYaw: 0.5,
  skirtN: 0, skirtL: 0.03, skirtR: 0.015, skirtSpread: 0.7, skirtZ: 0.1,
};
type Params = typeof GENERIC;
/** Claude: the generic shape in orange, Clawd's four stubby legs, dot eyes, an asterisk spinner, no sparkles. */
const CLAUDE: Params = { ...GENERIC, eyes: 0, glyphSet: 1, sparkles: 0, skirtN: 4, skirtL: 0.05, skirtR: 0.019, skirtSpread: 0.7, skirtZ: 0.55 };

/** The tool string's look: Claude Code has its own drone, any other tool the generic one. */
export const lookOf = (tool: string): DroneLook => (tool === 'claude-code' ? 'claude' : 'generic');

/** Per-session variety, from the snapshot's seed only (principle 4): details inside one look, never the silhouette. */
export function sessionParams(look: DroneLook, seed: number): { P: Params; time: number; trim: number } {
  const r = mulberry32(seed);
  const P = { ...(look === 'claude' ? CLAUDE : GENERIC) };
  const time = Math.floor(r() * LOOP_FRAMES) / FPS; // a whole number of frames, so idle phases differ and the loop still closes
  const trim = Math.floor(r() * 3);
  P.puffRate += (r() - 0.5) * 0.16;
  P.gaze += (r() - 0.5) * 2;
  P.glance += (r() - 0.5) * 2;
  P.lookYaw += (r() - 0.5) * 0.12;
  const leg = r();
  if (look === 'claude') P.skirtL = 0.044 + 0.012 * leg;
  return { P, time, trim };
}

// ---------------------------------------------------------------- the head field, in JS
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const smin = (a: number, b: number, k: number) => { const h = clamp01(0.5 + (0.5 * (b - a)) / k); return mix(b, a, h) - k * h * (1 - h); };
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);
const roundBox = (p: THREE.Vector3, b: THREE.Vector3, r: number) => {
  const qx = Math.abs(p.x) - b.x + r, qy = Math.abs(p.y) - b.y + r, qz = Math.abs(p.z) - b.z + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
};
const ellipsoid = (p: THREE.Vector3, r: THREE.Vector3) => {
  const k0 = Math.hypot(p.x / r.x, p.y / r.y, p.z / r.z), k1 = Math.hypot(p.x / (r.x * r.x), p.y / (r.y * r.y), p.z / (r.z * r.z));
  return (k0 * (k0 - 1)) / k1;
};
type Field = (p: THREE.Vector3) => number;
/** The head's distance field (sdShape in the shader). k = [corner, round, taper, flat]. */
function shapeField(b: THREE.Vector3, k: [number, number, number, number]): Field {
  return (p) => {
    const t = clamp01((p.y + b.y) / (2 * b.y));
    const s = 1 / mix(k[2], 1, t);
    const q = V(p.x * s, p.y, p.z * s);
    let d = mix(roundBox(q, b, k[0]), ellipsoid(q, b), k[1]) * Math.min(1, 1 / s);
    if (k[3] > 0.001) d = smax(d, -b.y * (1 - k[3]) - p.y, 0.02);
    return d;
  };
}
/** Where a ray from inside a field leaves it (bisection). */
function exitAlong(field: Field, from: THREE.Vector3, dir: THREE.Vector3, maxT = 0.8): number {
  let lo = 0, hi = maxT;
  if (field(from) > 0) return 0;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (field(from.clone().addScaledVector(dir, m)) < 0) lo = m; else hi = m;
  }
  return lo;
}

interface Layout {
  head: { b: THREE.Vector3; k: [number, number, number, number] };
  rim: { c: THREE.Vector3; r: [number, number] };
  ant: { a: THREE.Vector3; b: THREE.Vector3 };
  thr: { a: THREE.Vector3; b: THREE.Vector3; axis: THREE.Vector3 };
  legs: { a: THREE.Vector3; b: THREE.Vector3 }[];
}

/** The rest layout of a parameter set: every part's size and place, in lab units. */
function layout(P: Params): Layout {
  const b = V(P.headW, P.headH, P.headD);
  const k: [number, number, number, number] = [P.headCorner * Math.min(P.headW, P.headH, P.headD), P.headRound, P.headTaper, P.headFlat];
  const headF = shapeField(b, k);
  const O = V(), down = V(0, -1, 0);
  const rimY = P.rimY * P.headH, rimC = V(0, rimY, 0);
  const rim = { c: rimC, r: [exitAlong(headF, rimC, V(1, 0, 0)) + 0.35 * P.rimT, exitAlong(headF, rimC, V(0, 0, 1)) + 0.35 * P.rimT] as [number, number] };
  const baseDir = V(0, P.headH, -0.12 * P.headD).normalize();
  const base = baseDir.clone().multiplyScalar(exitAlong(headF, O, baseDir)).multiplyScalar(0.97);
  const lean = V(0, Math.cos(P.antTilt), -Math.sin(P.antTilt)).normalize();
  const ant = { a: base, b: base.clone().addScaledVector(lean, P.antL) };
  // The single under-jet.
  const axis = V(0, -1, -0.25).normalize();
  const dir = V(0, -P.headH, -0.08 * P.headD).normalize();
  const at = dir.clone().multiplyScalar(exitAlong(headF, O, dir, 1));
  const thr = { a: at.clone().addScaledVector(axis, -0.5 * P.thrL), b: at.clone().addScaledVector(axis, P.thrL), axis };
  // Legs in two pairs (a centre gap for the jet).
  const legs: Layout['legs'] = [];
  if (P.skirtN > 0) {
    const side = Math.max(1, Math.floor(P.skirtN / 2));
    const xs: number[] = [];
    for (let j = 0; j < side; j++) xs.push(side === 1 ? 1 : 0.4 + (0.6 * j) / (side - 1));
    for (const x of [...xs.map((v) => -v), ...xs].concat(P.skirtN % 2 ? [0] : []).slice(0, MAX_LEGS)) {
      const from = V(x * P.skirtSpread * P.headW, 0, P.skirtZ * P.headD);
      const a = from.clone().addScaledVector(down, exitAlong(headF, from, down, 1) - 0.4 * P.skirtR);
      legs.push({ a, b: a.clone().addScaledVector(down, P.skirtL) });
    }
  }
  return { head: { b, k }, rim, ant, thr, legs };
}

// ---------------------------------------------------------------- motion
const hash = (...n: number[]) => { const x = Math.sin(n.reduce((a, v, i) => a + v * [12.9898, 78.233, 37.719, 4.581][i % 4]!, 0) + 4.1414) * 43758.5453; return x - Math.floor(x); };
const pmod = (a: number, m: number) => ((a % m) + m) % m;

/** The look-around and work schedule over the 12 s loop. glance: -1..1; work: 0..1; blink: 1 open .. 0.12. */
function behaviour(t: number) {
  const blinkAt = (k: number, at: number) => { const d = k - at; return d > 0 && d < 0.18 ? 1 - Math.sin((d / 0.18) * Math.PI) * 0.88 : 1; };
  const k = pmod(t, MOTION_LOOP);
  const ss = (a: number, b: number) => smoothstep(a, b, k);
  const glance = -ss(1.6, 2.0) + 2 * ss(3.0, 3.35) - ss(4.4, 4.8) + 0.6 * ss(10.9, 11.2) - 0.6 * ss(11.6, 11.95);
  const work = ss(5.6, 6.0) * (1 - ss(10.2, 10.6));
  return { glance, work, workT: Math.max(0, k - 5.8), blink: Math.min(blinkAt(k, 1.0), blinkAt(k, 5.2), blinkAt(k, 10.7)) };
}
/** The face: eyes, or the working glyphs, never both (blink shut, glyphs fill in; and back). */
function faceAt(work: number) {
  const T = 0.35;
  const glyphs = clamp01((work - T) / (1 - T));
  return { glyphs, eyes: glyphs <= 0, eyeOpen: work > 0 ? clamp01(1 - work / T) : 1 };
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
/** The body's place and attitude at time t in the root frame (drift, bob, banking, head turn), and its thrust effort. */
function bodyAt(P: Params, t: number): { m: THREE.Matrix4; effort: number } {
  const x = P.drift * Math.sin(W12 * t * CYCLES.drift), z = 0.45 * P.drift * Math.sin(2 * W12 * t * CYCLES.drift);
  const vx = Math.cos(W12 * t), vz = Math.cos(2 * W12 * t);
  const ax = Math.sin(W12 * t), az = Math.sin(2 * W12 * t);
  const bob = P.bobAmp * Math.sin(W12 * t * CYCLES.bob);
  const sway = Math.sin(W12 * t * CYCLES.sway);
  const roll = -P.bank * vx + 0.05 * sway;
  const pitch = 0.6 * P.bank * vz + 0.04 * Math.sin(W12 * t * CYCLES.sway + 1.3);
  const yaw = P.lookYaw * behaviour(t).glance;
  const m = new THREE.Matrix4().compose(V(x, bob, z), _q.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ')), _s.set(P.size, P.size, P.size));
  const effort = 0.55 * Math.hypot(ax, 0.6 * az) + 0.3 * Math.abs(vx) * (P.bank / 0.3) + 0.5 * Math.max(0, Math.cos(W12 * t * CYCLES.bob));
  return { m, effort };
}

/** Smoke particles and sparkles at time t, in the drone's body frame. Pure and loop-locked. */
function smokeAt(Lay: Layout, P: Params, t: number) {
  const cyclesPerLoop = MOTION_LOOP / PUFF_PERIOD;
  const now = bodyAt(P, t).m.clone().invert();
  const n = Lay.thr;
  const puffs: { c: THREE.Vector3; r: number; u: number }[] = [];
  for (let k = 0; k < MAX_PUFFS; k++) {
    const phase = ((k + 0.7 * hash(0, k, 1)) / MAX_PUFFS) * PUFF_PERIOD;
    const cycle = Math.floor((t - phase) / PUFF_PERIOD);
    const born = phase + cycle * PUFF_PERIOD;
    const age = t - born;
    const cm = pmod(cycle, cyclesPerLoop);
    const life = PUFF_PERIOD * (0.5 + 0.42 * hash(0, k, cm, 2));
    const at = bodyAt(P, born);
    const busy = clamp01(P.puffRate * (0.35 + 0.75 * at.effort));
    if (age >= life || hash(0, k, cm, 3) > busy) continue;
    const u = age / life;
    const mouth = n.b.clone().applyMatrix4(at.m);
    const axis = n.axis.clone().transformDirection(at.m);
    const v0 = 0.3 * (0.7 + 0.6 * hash(0, k, cm, 4));
    const tau = 0.22;
    const out = v0 * tau * (1 - Math.exp(-age / tau));
    const pos = mouth.addScaledVector(axis, out + 0.6 * P.thrR)
      .add(V((hash(0, k, cm, 5) - 0.5) * 0.08 * age, 0.05 * age * age - 0.01 * age, (hash(0, k, cm, 6) - 0.5) * 0.08 * age));
    const grow = smoothstep(0, 0.12, u) * (1 - smoothstep(0.6, 1, u));
    const r = 0.028 * P.puffSize * (0.75 + 0.5 * hash(0, k, cm, 7)) * (0.7 + 0.7 * u) * grow;
    puffs.push({ c: pos.applyMatrix4(now), r, u });
  }
  const sparks: { c: THREE.Vector3; s: number }[] = [];
  for (let i = 0; i < Math.min(P.sparkles, MAX_SPARKS); i++) {
    const phase = ((i + 0.6 * hash(i, 11)) / Math.max(1, P.sparkles)) * PUFF_PERIOD;
    const cycle = Math.floor((t - phase) / PUFF_PERIOD);
    const born = phase + cycle * PUFF_PERIOD;
    const cm = pmod(cycle, cyclesPerLoop);
    const age = t - born, life = 0.75;
    if (age >= life || hash(i, cm, 12) > 0.85) { sparks.push({ c: V(), s: 0 }); continue; }
    const at = bodyAt(P, born).m;
    const axis = n.axis.clone().transformDirection(at);
    const side = V(hash(i, cm, 14) - 0.5, 0.3 + 0.4 * hash(i, cm, 15), hash(i, cm, 16) - 0.5).multiplyScalar(0.16);
    const pos = n.b.clone().applyMatrix4(at).addScaledVector(axis, 0.03 + 0.12 * Math.sqrt(age)).addScaledVector(side, age);
    const u = age / life;
    sparks.push({ c: pos.applyMatrix4(now), s: u < 0.2 || u > 0.7 ? 1 : 2 });
  }
  return { puffs, sparks };
}

const PROXY_GEO = new THREE.BoxGeometry(BMAX[0] - BMIN[0], BMAX[1] - BMIN[1], BMAX[2] - BMIN[2])
  .translate((BMAX[0] + BMIN[0]) / 2, (BMAX[1] + BMIN[1]) / 2, (BMAX[2] + BMIN[2]) / 2);

const vecs = (n: number) => Array.from({ length: n }, () => V());
const pad = <T,>(xs: T[], n: number, fill: () => T): T[] => Array.from({ length: n }, (_, i) => xs[i] ?? fill());

/** Colours by role for a look; the Claude trim is one of three, picked by the seed. */
function colours(look: DroneLook, trim: number) {
  const d: Record<string, readonly string[]> = palette.drone[look];
  const trims = look === 'claude' ? [d['trim']!, d['trimB']!, d['trimC']!] : [d['trim']!];
  return {
    shell: ramp(d['shell']!, 4), trim: ramp(trims[trim % trims.length]!, 4), acc: ramp(d['accent']!, 4),
    glow: ramp(palette.accent.teal, 4), scr: ramp([...palette.crew.visor, palette.crew.glint], 3), smoke: ramp(d['smoke']!, 3),
  };
}

/** A drone: its mesh, and `update`, which poses it for a time and the root's world transform. */
export class Drone {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly proxy: THREE.Mesh;
  private readonly P: Params;
  private readonly lay: Layout;
  private readonly time: number;
  private readonly U: Record<string, THREE.IUniform>;
  private readonly material: THREE.ShaderMaterial;

  constructor(readonly look: DroneLook, seed: number) {
    const { P, time, trim } = sessionParams(look, seed);
    this.P = P;
    this.time = time;
    const lay = (this.lay = layout(P));
    const c = colours(look, trim);
    const U: Record<string, THREE.IUniform> = {
      uInvModel: { value: new THREE.Matrix4() }, uModel: { value: new THREE.Matrix4() }, uViewProj: { value: new THREE.Matrix4() },
      uLightLocal: { value: V() }, uPixK: { value: 0.0035 },
      uShell: { value: c.shell }, uTrim: { value: c.trim }, uAcc: { value: c.acc }, uGlow: { value: c.glow }, uScr: { value: c.scr }, uSmoke: { value: c.smoke },
      uHeadB: { value: lay.head.b }, uHeadK: { value: new THREE.Vector4(...lay.head.k) },
      uRimC: { value: lay.rim.c }, uRimR: { value: new THREE.Vector2(...lay.rim.r) }, uRimT: { value: P.rimT },
      uScreen: { value: new THREE.Vector4(P.screenW, P.screenH, P.screenY, P.screenRound) }, uBezel: { value: P.bezel },
      uEyePhys: { value: new THREE.Vector2(
        Math.min(P.headW * mix(P.screenW, Math.sin(Math.atan(P.screenW)), P.headRound), P.headW * 0.95),
        P.headH * mix(P.screenH, Math.sin(Math.atan(P.screenH)), P.headRound)) },
      uEyeXf: { value: new THREE.Vector4(0, 0, P.eyeScale, 1) }, uGlyph: { value: new THREE.Vector4() },
      uEyesOn: { value: 1 }, uGlyphSet: { value: P.glyphSet }, uEyes: { value: P.eyes }, uBlink: { value: 1 },
      uAntA: { value: lay.ant.a }, uAntB: { value: lay.ant.b }, uAntR: { value: 0.0105 }, uAntTip: { value: 0.018 },
      uThrA: { value: lay.thr.a }, uThrB: { value: lay.thr.b }, uThrR: { value: new THREE.Vector2(P.thrR, P.thrR * P.thrFlare) },
      uSkirtN: { value: lay.legs.length }, uSkA: { value: pad(lay.legs.map((l) => l.a), MAX_LEGS, V) }, uSkB: { value: pad(lay.legs.map((l) => l.b), MAX_LEGS, V) }, uSkR: { value: P.skirtR },
      uPuffN: { value: 0 }, uPuffC: { value: vecs(MAX_PUFFS) }, uPuffR: { value: new Array<number>(MAX_PUFFS).fill(0) }, uPuffA: { value: new Array<number>(MAX_PUFFS).fill(0) },
      uSparkN: { value: 0 }, uSparkC: { value: vecs(MAX_SPARKS) }, uSparkS: { value: new Array<number>(MAX_SPARKS).fill(0) },
    };
    this.U = U;
    this.material = new THREE.ShaderMaterial({ vertexShader: DRONE_VERT, fragmentShader: DRONE_FRAG, uniforms: U, side: THREE.BackSide });
    this.proxy = new THREE.Mesh(PROXY_GEO, this.material);
    this.proxy.onBeforeRender = (_r, _s, camera) => { (U['uViewProj']!.value as THREE.Matrix4).multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); };
    this.body.add(this.proxy);
    this.root.add(this.body);
  }

  /**
   * Poses the drone at loop time `seconds` (it adds its own seeded offset). The caller has placed `root`
   * (position, facing, scale); `pixK` is one pixel's size per unit of depth, 2 tan(fov / 2) / height.
   */
  update(seconds: number, pixK: number): void {
    const { P, U } = this;
    const t = seconds + this.time;
    const B = bodyAt(P, t);
    B.m.decompose(this.body.position, this.body.quaternion, this.body.scale);
    const beh = behaviour(t);
    const face = faceAt(beh.work);
    const blink = Math.min(beh.blink, face.eyeOpen);
    (U['uBlink'] as THREE.IUniform).value = blink;
    (U['uEyesOn'] as THREE.IUniform).value = face.eyes ? 1 : 0;
    (U['uEyeXf']!.value as THREE.Vector4).set(P.glance * beh.glance, P.gaze, P.eyeScale, blink);
    (U['uGlyph']!.value as THREE.Vector4).set(face.glyphs, beh.workT, P.glyphRate, P.glyphPx);
    const { puffs, sparks } = smokeAt(this.lay, P, t);
    U['uPuffN']!.value = puffs.length;
    puffs.forEach((p, i) => {
      (U['uPuffC']!.value as THREE.Vector3[])[i]!.copy(p.c);
      (U['uPuffR']!.value as number[])[i] = p.r;
      (U['uPuffA']!.value as number[])[i] = p.u;
    });
    U['uSparkN']!.value = sparks.length;
    sparks.forEach((s, i) => { (U['uSparkC']!.value as THREE.Vector3[])[i]!.copy(s.c); (U['uSparkS']!.value as number[])[i] = s.s; });
    U['uPixK']!.value = pixK;
    this.root.updateMatrixWorld(true);
    const mw = this.proxy.matrixWorld;
    (U['uModel']!.value as THREE.Matrix4).copy(mw);
    (U['uInvModel']!.value as THREE.Matrix4).copy(mw).invert();
    mw.decompose(_p, _q, _s);
    (U['uLightLocal']!.value as THREE.Vector3).copy(SHARED.uLight.value).applyQuaternion(_q.invert());
  }

  dispose(): void { this.material.dispose(); }
}
const _p = new THREE.Vector3();
