// The crew's ship in the scene (#207 C2–C4): one raymarched SDF hull (ship-glsl.ts) on a proxy box, the
// captain's cap (its own small SDF, riding the captain's body), and an astronaut (astronaut.ts) in each seat,
// ported from the ship lab (feature/ship-lab, mockups/ship-lab/ship.js at 35eff13). Each is one draw call:
// at most 1 hull + 16 astronauts + 1 cap. The hull is lit like the crew: one key light, four quantised bands,
// self-shadowing and contact occlusion, then the depth fade (art-direction §5). Windows are see-through: where
// one shows, the hull writes the depth of the far wall inside it, so an astronaut seated inside wins the depth
// test there and loses it everywhere else; nothing is transparent and nothing needs sorting. Every colour is a
// uniform from palette.ship and palette.crew (AGENTS.md Rule 5). Posed purely from (model, frame): the ship's
// place is crew/place.ts, its idle and the crew's are functions of the loop time (Rule 3).
import * as THREE from 'three';
import { palette, type Ramp } from '../../../src/core/palette.js';
import { placeShip } from '../crew/place.js';
import { FPS, LOOP_SECONDS, loopPhase } from '../model/motion.js';
import type { SystemModel } from '../model/system.js';
import type { Vec3 } from '../model/vec.js';
import { Astronaut, astronautLook } from './astronaut.js';
import { DRONE_VERT } from './drone-shader.js';
import { ramp, shaderMaterial, SHARED } from './materials.js';
import { MAX_FLAMES, MAX_LIGHTS, PAINT_LIGHT, PAINT_WINDOW, shipBounds, shipGlsl } from './ship-glsl.js';
import { buildShip, CAP, flameAt, idleAt, lightOn, SHIP_SCALE, type ShipSpec } from './ship-spec.js';
import { DEPTH } from './shaders.js';

const frag = (spec: ShipSpec) => /* glsl */ `
  uniform mat4 uInvModel;
  uniform mat4 uModel;
  uniform mat4 uViewProj;
  uniform vec3 uLightLocal;
  uniform vec3 uShell[4];
  uniform vec3 uTrim[4];
  uniform vec3 uMetal[4];
  uniform vec3 uGold[4];
  uniform vec3 uInterior; // a window's inside: a lighter indigo than the visors, so they read in it
  uniform vec3 uFlame[4];
  uniform vec3 uLights[2];
  uniform int uFlameOn;
  in vec3 vPosW;
  ${DEPTH}
  ${shipGlsl(spec)}

  float scene(vec3 p) {
    int j;
    float d = hull(p);
    if (uFlameOn == 1) d = min(d, flameField(p, j));
    return d;
  }
  vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.002;
    return normalize(k.xyy * hull(p + k.xyy * e) + k.yyx * hull(p + k.yyx * e) + k.yxy * hull(p + k.yxy * e) + k.xxx * hull(p + k.xxx * e));
  }
  float shadow(vec3 ro, vec3 rd) {
    float t = 0.03;
    for (int i = 0; i < 64; i++) {
      float h = hull(ro + rd * t);
      if (h < 0.003) return 0.0;
      t += max(h * 0.85, 0.012);
      if (t > 4.0) break;
    }
    return 1.0;
  }
  float occlusion(vec3 p, vec3 n) {
    float o = 0.0;
    for (int i = 1; i <= 4; i++) {
      float h = 0.045 * float(i);
      o += (h - hull(p + n * h)) / h;
    }
    return clamp(1.0 - o * 0.3, 0.0, 1.0);
  }
  vec3 slotRamp(int slot, int b) {
    if (slot == 1) return uTrim[b];
    if (slot == 2) return uMetal[b];
    if (slot == 3) return uGold[b];
    return uShell[b];
  }
  // The hull at p, hit from direction rd: its colour, and the point whose depth it writes (a window writes
  // the far wall of the inside, so the crew behind it shows).
  vec3 shadeHull(vec3 p, vec3 rd, out vec3 pd) {
    pd = p;
    vec3 n = calcNormal(p);
    int light;
    int r = paint(p, partOf(p), light);
    if (r == ${PAINT_LIGHT}) return uLights[uLightOn[light] > 0.5 ? 1 : 0]; // the beacon is unlit
    if (r == ${PAINT_WINDOW}) {
      // The hit can stop just short of the surface (the march's epsilon grows with distance), so first
      // step in, then march the inside to the far wall: a window that wrote the front's depth would hide
      // the crew (ship lab: test 1).
      vec3 q = p;
      bool inside = false;
      for (int i = 0; i < 128; i++) {
        float h = hull(q);
        if (!inside) { if (h < 0.0) inside = true; else { q += rd * max(h, 0.003); continue; } }
        if (h > 0.0005) break;
        q += rd * max(-h, 0.006);
      }
      pd = q;
      return uInterior;
    }
    vec3 L = normalize(uLightLocal);
    float lit = dot(n, L);
    if (shadow(p + n * 0.01, L) < 0.5) lit = min(lit, 0.1) - 0.3;
    lit -= (1.0 - occlusion(p, n)) * 0.6;
    int b = lit > 0.7 ? 3 : lit > 0.32 ? 2 : lit > -0.12 ? 1 : 0;
    return slotRamp(r, b);
  }

  void main() {
    vec3 ro = (uInvModel * vec4(cameraPosition, 1.0)).xyz;
    vec3 rd = normalize((uInvModel * vec4(vPosW, 1.0)).xyz - ro);
    vec3 t0 = (BMIN - ro) / rd, t1 = (BMAX - ro) / rd;
    vec3 tmin = min(t0, t1), tmax = max(t0, t1);
    float t = max(max(max(tmin.x, tmin.y), tmin.z), 0.0);
    float tf = min(min(tmax.x, tmax.y), tmax.z);
    bool hit = false;
    for (int i = 0; i < 200; i++) {
      float h = scene(ro + rd * t);
      if (h < 0.0015 * (1.0 + t)) { hit = true; break; }
      t += h * 0.85;
      if (t > tf) break;
    }
    if (!hit) discard;
    vec3 p = ro + rd * t, pd = p, c;
    int j;
    float dh = hull(p), df = uFlameOn == 1 ? flameField(p, j) : 1e9;
    if (df < dh) {
      // the thruster flame: unlit, hottest at the nozzle and along its middle as seen
      vec3 A = FLAME_A[j], T = flameTip(j), ax = T - A;
      float len = length(ax);
      vec3 ad = ax / len;
      float u = clamp(dot(p - A, ad) / len, 0.0, 1.0);
      float lat = abs(dot(p - (A + ad * u * len), normalize(cross(rd, ad))));
      float heat = 1.0 - 0.9 * u - 0.6 * clamp(lat / mix(FLAME_R[j], 0.035, u), 0.0, 1.0);
      c = uFlame[heat > 0.5 ? 3 : heat > 0.26 ? 2 : heat > 0.04 ? 1 : 0];
    } else {
      c = shadeHull(p, rd, pd);
    }
    gl_FragColor = vec4(depthFade(c, (uModel * vec4(p, 1.0)).xyz, 1.0), 1.0); // faded by the surface seen
    vec4 clip = uViewProj * (uModel * vec4(pd, 1.0));
    gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
  }
`;

/** The colours an SDF object draws, by slot, from one palette part. */
interface Paint { shell: Ramp; trim: Ramp; metal: Ramp; gold: Ramp; interior: Ramp; flame: Ramp; lights: Ramp }
const HULL_PAINT: Paint = palette.ship.hull;
/** The cap has only a navy shell and a gold crown; its other slots repeat the shell (never drawn). */
const CAP_PAINT: Paint = { ...palette.ship.cap, trim: palette.ship.cap.shell, metal: palette.ship.cap.shell, interior: palette.ship.cap.shell, flame: palette.ship.cap.shell, lights: palette.ship.cap.shell };

const proxyOf = (spec: ShipSpec): THREE.BoxGeometry => {
  const { lo, hi } = shipBounds(spec);
  return new THREE.BoxGeometry(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]).translate((hi[0] + lo[0]) / 2, (hi[1] + lo[1]) / 2, (hi[2] + lo[2]) / 2);
};

const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

/** One raymarched SDF object from a spec (the hull, or the captain's cap): its mesh, and `sync`, which sets its per-frame uniforms. */
class SdfObject {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BoxGeometry;

  constructor(readonly spec: ShipSpec, paint: Paint) {
    this.geometry = proxyOf(spec);
    this.material = shaderMaterial(frag(spec), {
      uInvModel: { value: new THREE.Matrix4() }, uModel: { value: new THREE.Matrix4() }, uViewProj: { value: new THREE.Matrix4() },
      uLightLocal: { value: new THREE.Vector3() },
      uShell: { value: ramp(paint.shell, 4) }, uTrim: { value: ramp(paint.trim, 4) }, uMetal: { value: ramp(paint.metal, 4) }, uGold: { value: ramp(paint.gold, 4) },
      uInterior: { value: ramp(paint.interior, 1)[0] }, uFlame: { value: ramp(paint.flame, 4) }, uLights: { value: ramp(paint.lights, 2) },
      uFlameL: { value: new Array<number>(MAX_FLAMES).fill(0) }, uFlameW: { value: Array.from({ length: MAX_FLAMES }, () => new THREE.Vector2()) },
      uLightOn: { value: new Array<number>(MAX_LIGHTS).fill(0) }, uFlameOn: { value: spec.flames.length > 0 ? 1 : 0 },
    }, { vertexShader: DRONE_VERT, side: THREE.BackSide });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.onBeforeRender = (_r, _sc, camera) => {
      (this.material.uniforms['uViewProj']!.value as THREE.Matrix4).multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    };
  }

  /** Sets the uniforms for time t from the mesh's current world matrix (keep it current first). */
  sync(t: number): void {
    const U = this.material.uniforms, mw = this.mesh.matrixWorld;
    (U['uModel']!.value as THREE.Matrix4).copy(mw);
    (U['uInvModel']!.value as THREE.Matrix4).copy(mw).invert();
    mw.decompose(_p, _q, _s);
    (U['uLightLocal']!.value as THREE.Vector3).copy(SHARED.uLight.value).applyQuaternion(_q.invert());
    this.spec.flames.forEach((fl, j) => {
      const a = flameAt(t, j);
      (U['uFlameL']!.value as number[])[j] = fl.len * a.len;
      (U['uFlameW']!.value as THREE.Vector2[])[j]!.set(a.dx, a.dz);
    });
    this.spec.lights.forEach((l, i) => { (U['uLightOn']!.value as number[])[i] = lightOn(l, t) ? 1 : 0; });
  }

  dispose(): void { this.material.dispose(); this.geometry.dispose(); }
}

/** Who rides in a seat: what the ship needs of a crew member. */
export interface Rider { person: string; seed: number; captain: boolean }

/**
 * The ship and its crew. `set(seats)` builds the hull for that many seats (seat 0 is the captain's, null when
 * the captain isn't in the crew: an empty porthole) and an astronaut per rider; `pose` places it all for a
 * frame. root (place, facing) → idle (bob, roll, pitch) → scaled (SHIP_SCALE) → hull proxy + crew.
 */
export class CrewShip {
  readonly group = new THREE.Group();
  private readonly idle = new THREE.Group();
  private readonly scaled = new THREE.Group();
  private hull: SdfObject | null = null;
  private readonly cap = new SdfObject(CAP, CAP_PAINT);
  private crew: { rider: Rider; seat: number; astronaut: Astronaut }[] = [];
  private shipSpec: ShipSpec | null = null;

  constructor() {
    this.scaled.scale.setScalar(SHIP_SCALE);
    this.group.add(this.idle);
    this.idle.add(this.scaled);
    this.cap.mesh.rotation.x = CAP.tilt;
    this.group.visible = false;
  }

  /** The hull drawn, or null when nobody is aboard. */
  get spec(): ShipSpec | null { return this.shipSpec; }
  /** The riders drawn, with their seats, in seat order. */
  get riders(): readonly { rider: Rider; seat: number }[] { return this.crew; }

  /** Replaces the ship and crew drawn: `seats[i]` rides in seat i (null: empty). No seats: no ship. */
  set(seats: readonly (Rider | null)[]): void {
    this.clear();
    if (seats.length === 0) return;
    const spec = (this.shipSpec = buildShip(seats.length));
    this.hull = new SdfObject(spec, HULL_PAINT);
    this.scaled.add(this.hull.mesh);
    seats.forEach((rider, seat) => {
      const s = spec.seats[seat];
      if (!rider || !s) return;
      const astronaut = new Astronaut(astronautLook(rider.seed));
      astronaut.root.position.set(...s.p);
      astronaut.root.rotation.set(0, s.yaw, 0);
      if (rider.captain && s.captain) astronaut.body.add(this.cap.mesh);
      this.scaled.add(astronaut.root);
      this.crew.push({ rider, seat, astronaut });
    });
    this.group.visible = true;
  }

  /** Poses the ship and crew for exactly this frame, relative to `origin`, the scene's floating origin. */
  pose(model: SystemModel, frame: number, origin: Vec3 = [0, 0, 0]): void {
    if (!this.hull) return;
    const at = placeShip(model, frame);
    const t = Math.round(loopPhase(frame) * LOOP_SECONDS * FPS) / FPS;
    this.group.position.set(at.centre[0] - origin[0], at.centre[1] - origin[1], at.centre[2] - origin[2]);
    this.group.rotation.set(0, at.yaw, 0);
    const m = idleAt(t);
    this.idle.position.y = m.bob * SHIP_SCALE;
    this.idle.rotation.set(m.pitch, 0, m.roll);
    this.group.updateMatrixWorld(true);
    this.hull.sync(t);
    for (const c of this.crew) c.astronaut.update(t); // updates each figure's matrices, the cap's too
    this.cap.sync(t);
  }

  private clear(): void {
    if (this.hull) { this.scaled.remove(this.hull.mesh); this.hull.dispose(); }
    for (const c of this.crew) { this.scaled.remove(c.astronaut.root); c.astronaut.dispose(); }
    this.cap.mesh.removeFromParent();
    this.hull = null;
    this.shipSpec = null;
    this.crew = [];
    this.group.visible = false;
  }

  dispose(): void { this.clear(); this.cap.dispose(); }
}
