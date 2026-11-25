// The ship as a three.js object: one raymarched SDF hull (ship-glsl.js) on a proxy box, lit like the
// crew (one key light, four quantised bands, self-shadowing and contact occlusion, astronaut.js /
// viewer.js ASTRO_FRAG), plus the asset viewer's own astronauts riding in its seats. Windows and glass
// are see-through: the hull writes the depth of the far wall there, so an astronaut inside wins the
// depth test wherever a window or dome shows it and loses it everywhere else.
import * as THREE from 'three';
import { makeAstronaut } from '../asset-viewer/viewer.js';
import { eyesFor } from '../asset-viewer/faces.js';
import { LIGHT_DIR } from '../drone-lab/drone.js';
import { shipGlsl, shipBounds, MAX_FLAMES, MAX_LIGHTS, MAX_PUFFS, MAX_LICKS, PUFF_J, PAINT_WINDOW, PAINT_LIGHT } from './ship-glsl.js';
import { SHIP_SCALE, CAP, HELMET_Y, idleAt, flameAt, flameLive, lightOn } from './ship-spec.js';
import { CAP_PALETTE } from './palette.js';

const VERT = /* glsl */ `
  out vec3 vPosW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// The flame's colour at p (j: the flame, or a puff past PUFF_J). The idle flame: hottest at the nozzle
// and along its middle as seen. The lively flame (live): the same kind of heat with a shorter white
// core, its bands shifted each step (alternating) and jumping per segment along its length; a puff is
// one flat step of the ramp, cooling as it ages.
const flameColour = (live) => live ? /* glsl */ `, its bands shifting each step, and its puffs
      if (j >= ${PUFF_J}) c = uFlame[int(uPuffBand[j - ${PUFF_J}] + 0.5)];
      else {
        vec3 A = FLAME_A[j], T = flameTip(j), ax = T - A;
        float len = length(ax);
        vec3 ad = ax / len;
        float u = clamp(dot(p - A, ad) / len, 0.0, 1.0);
        float lat = abs(dot(p - (A + ad * u * len), normalize(cross(rd, ad))));
        int seg = j * ${MAX_LICKS} + min(int(u * ${MAX_LICKS}.0), ${MAX_LICKS - 1});
        float heat = 0.86 - 1.0 * u - 0.7 * clamp(lat / mix(FLAME_R[j], 0.035, u), 0.0, 1.0) + uFlameHeat[j] + uFlameLick[seg]; // a shorter white core than the idle flame's: all four steps show
        c = uFlame[heat > 0.5 ? 3 : heat > 0.26 ? 2 : heat > 0.04 ? 1 : 0];
      }` : /* glsl */ `, hottest at the nozzle and along its middle as seen
      vec3 A = FLAME_A[j], T = flameTip(j), ax = T - A;
      float len = length(ax);
      vec3 ad = ax / len;
      float u = clamp(dot(p - A, ad) / len, 0.0, 1.0);
      float lat = abs(dot(p - (A + ad * u * len), normalize(cross(rd, ad))));
      float heat = 1.0 - 0.9 * u - 0.6 * clamp(lat / mix(FLAME_R[j], 0.035, u), 0.0, 1.0);
      c = uFlame[heat > 0.5 ? 3 : heat > 0.26 ? 2 : heat > 0.04 ? 1 : 0];`;

const frag = (spec, live = false) => /* glsl */ `
  uniform mat4 uInvModel;
  uniform mat4 uModel;
  uniform mat4 uProj;
  uniform vec3 uLightLocal;
  uniform vec3 uShell[4];
  uniform vec3 uTrim[4];
  uniform vec3 uMetal[4];
  uniform vec3 uRing[4];
  uniform vec3 uGold[4];
  uniform vec3 uGlass[3];
  uniform vec3 uInterior; // a window's inside (round 1: the visor's near-black; round 2: a lighter indigo, so visors read)
  uniform vec3 uGlint[2];
  uniform vec3 uFlame[4];
  uniform vec3 uLights[2];
  uniform int uFlameOn;
  in vec3 vPosW;
  ${shipGlsl(spec, { live })}

  float scene(vec3 p) {
    int j, g;
    float d = hull(p);
    if (uFlameOn == 1) d = min(d, flameField(p, j));
    return min(d, glassField(p, g));
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
  vec3 ramp(int slot, int b) {
    if (slot == 1) return uTrim[b];
    if (slot == 2) return uMetal[b];
    if (slot == 3) return uRing[b];
    if (slot == 4) return uGold[b];
    return uShell[b];
  }
  // The hull at p, hit from direction rd: its colour, and the point whose depth it writes (a window
  // writes the far wall of the inside, so the crew behind it shows).
  vec3 shadeHull(vec3 p, vec3 rd, out vec3 pd) {
    pd = p;
    vec3 n = calcNormal(p);
    int win, light;
    int r = paint(p, partOf(p), win, light);
    if (r == ${PAINT_LIGHT}) return uLights[uLightOn[light] > 0.5 ? 1 : 0]; // nav lights are unlit
    if (r == ${PAINT_WINDOW}) {
      // the hit can stop just short of the surface (the march's epsilon grows with distance), so
      // first step in, then march the inside to the far wall
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
    return ramp(r, b);
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
    int j, g;
    float dh = hull(p), df = uFlameOn == 1 ? flameField(p, j) : 1e9, dg = glassField(p, g);
    if (df < dh && df < dg) {
      // the thruster flame: unlit${flameColour(live)}
    } else if (dg < dh) {
      // glass: a glint and a lit-limb sliver on the front; elsewhere see-through to what's inside,
      // or to the dome's dark far wall (two-toned like the crew's visors)
      vec3 gc = GLASS[g].xyz;
      float gr = GLASS[g].w;
      vec3 n = normalize(p - gc), L = normalize(uLightLocal);
      // the shine is placed in view space, like a cartoon glass highlight: one arc on the upper left,
      // a short second dash beside it, and a sliver on the lit limb
      vec3 fw = -rd, rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw)), up = cross(fw, rt);
      vec3 nv = vec3(dot(n, rt), dot(n, up), dot(n, fw));
      float az = atan(nv.y, nv.x);
      bool ring = nv.z > 0.5 && nv.z < 0.66;
      if (ring && az > 1.95 && az < 2.7) c = uGlint[0];
      else if ((ring && az > 2.85 && az < 3.0) || (nv.z < 0.14 && az > 1.75 && az < 2.8 && dot(n, L) > 0.2)) c = uGlint[1];
      else {
        float b = dot(p - gc, rd), cc = dot(p - gc, p - gc) - gr * gr;
        float tExit = -b + sqrt(max(b * b - cc, 0.0));
        float tt = 0.004;
        bool inner = false;
        for (int i = 0; i < 96; i++) {
          float h = hull(p + rd * tt);
          if (h < 0.0015) { inner = true; break; }
          tt += max(h * 0.9, 0.004);
          if (tt > tExit) break;
        }
        if (inner) c = shadeHull(p + rd * tt, rd, pd);
        else { pd = p + rd * tExit; c = reflect(rd, n).y > 0.3 ? uGlass[1] : uGlass[0]; } // two-toned by the front's reflection, like the crew's visors
      }
    } else {
      c = shadeHull(p, rd, pd);
    }
    gl_FragColor = vec4(c, 1.0);
    vec4 clip = uProj * viewMatrix * (uModel * vec4(pd, 1.0));
    gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
  }
`;

const colors = (hexes) => hexes.map((h) => new THREE.Color(h));
const geometries = new Map();

function proxyFor(spec) {
  const { lo, hi } = shipBounds(spec);
  const key = [...lo, ...hi].join(',');
  if (!geometries.has(key)) geometries.set(key, new THREE.BoxGeometry(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]).translate((hi[0] + lo[0]) / 2, (hi[1] + lo[1]) / 2, (hi[2] + lo[2]) / 2));
  return geometries.get(key);
}

/**
 * One raymarched SDF object from a spec (a hull, or the captain's cap): its mesh, its palette, and
 * sync(t, camera), which sets the per-frame uniforms from the mesh's current world matrix. Each has
 * its own material; three.js compiles each distinct source once and shares the program. live: the
 * lively flame (flameLive), with its puffs.
 */
function sdfObject(spec, palette, { live = false } = {}) {
  const mesh = new THREE.Mesh(proxyFor(spec), new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: frag(spec, live), side: THREE.BackSide,
    uniforms: {
      uInvModel: { value: new THREE.Matrix4() }, uModel: { value: new THREE.Matrix4() }, uProj: { value: null }, uLightLocal: { value: new THREE.Vector3() },
      uShell: { value: [] }, uTrim: { value: [] }, uMetal: { value: [] }, uRing: { value: [] }, uGold: { value: [] }, uGlass: { value: [] }, uInterior: { value: new THREE.Color() }, uGlint: { value: [] }, uFlame: { value: [] }, uLights: { value: [] },
      uFlameL: { value: new Array(MAX_FLAMES).fill(0) }, uFlameW: { value: Array.from({ length: MAX_FLAMES }, () => new THREE.Vector2()) },
      uLightOn: { value: new Array(MAX_LIGHTS).fill(0) }, uFlameOn: { value: 1 },
      ...(live ? {
        uPuff: { value: Array.from({ length: MAX_PUFFS * MAX_FLAMES }, () => new THREE.Vector4()) }, uPuffBand: { value: new Array(MAX_PUFFS * MAX_FLAMES).fill(0) },
        uFlameHeat: { value: new Array(MAX_FLAMES).fill(0) }, uFlameLick: { value: new Array(MAX_LICKS * MAX_FLAMES).fill(0) },
      } : {}),
    },
  }));
  mesh.frustumCulled = false;
  const U = mesh.material.uniforms;
  const q = new THREE.Quaternion();
  function setPalette(pal) {
    U.uInterior.value = new THREE.Color((pal.interior ?? pal.glass)[0]);
    for (const [u, k] of [['uShell', 'shell'], ['uTrim', 'trim'], ['uMetal', 'metal'], ['uRing', 'ring'], ['uGold', 'gold'], ['uGlass', 'glass'], ['uGlint', 'glint'], ['uFlame', 'flame'], ['uLights', 'lights']]) U[u].value = colors(pal[k] ?? pal.trim);
  }
  function sync(t, camera, flameOn = true) {
    U.uModel.value.copy(mesh.matrixWorld);
    U.uInvModel.value.copy(mesh.matrixWorld).invert();
    U.uProj.value = camera.projectionMatrix;
    mesh.matrixWorld.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    U.uLightLocal.value.copy(LIGHT_DIR).applyQuaternion(q.invert());
    if (live) spec.flames.forEach((fl, j) => {
      const a = flameLive(t, j, fl.len);
      U.uFlameL.value[j] = fl.len * a.len;
      U.uFlameW.value[j].set(a.dx, a.dz);
      U.uFlameHeat.value[j] = a.shift;
      a.licks.forEach((x, i) => { U.uFlameLick.value[j * MAX_LICKS + i] = x; });
      a.puffs.forEach((q, i) => { U.uPuff.value[j * MAX_PUFFS + i].set(...q.c, q.r); U.uPuffBand.value[j * MAX_PUFFS + i] = q.band; });
    });
    else spec.flames.forEach((fl, j) => { const a = flameAt(t, j); U.uFlameL.value[j] = fl.len * a.len; U.uFlameW.value[j].set(a.dx, a.dz); });
    spec.lights.forEach((l, i) => { U.uLightOn.value[i] = lightOn(l, i, t) ? 1 : 0; });
    U.uFlameOn.value = flameOn ? 1 : 0;
  }
  setPalette(palette);
  return { mesh, setPalette, sync, dispose: () => mesh.material.dispose() };
}

// Sample crew, in person-id order: seat 0 is the repo owner (the captain), then the teammates. The
// handles pick the eyes (as the viewer does), and the three contributor ramps cycle.
export const CREW_KEYS = ['coral', 'mint', 'lilac'];
export const crewHandle = (i) => (i === 0 ? '@captain' : `@crew${i + 1}`);

/** The astronaut's inner body group (root -> lift -> body: the one that bobs and sways), read-only. */
function bodyOf(a) {
  const body = a.group.children[0]?.children[0];
  if (!body?.children.some((m) => m.material === a.material)) throw new Error('makeAstronaut changed shape: no body group holding its proxy');
  return body;
}

/**
 * A ship of one direction: build(n) -> spec (ship-spec.js BUILDERS), its crew pool, and update(t).
 * root (placement, view yaw) -> idle (bob, roll, pitch) -> scaled (SHIP_SCALE) -> hull proxy + crew.
 * Seat 0's astronaut, the captain, wears the cap (CAP), attached inside its body so it rides the bob.
 * live: the lively flame (the fly-by's). setUpright(up, { sink }): each update turns every rider about
 * its own line of sight so its head points to `up` (a world direction: the screen's up) however the
 * hull rolls, sinking it back as it turns; setUpright(null), the default: the seats as built.
 */
export function makeShip(build, palette, { live = false } = {}) {
  const root = new THREE.Group();
  const idle = new THREE.Group();
  const scaled = new THREE.Group();
  scaled.scale.setScalar(SHIP_SCALE);
  root.add(idle);
  idle.add(scaled);
  const crew = [];
  let hull = null, spec = null, pal = palette, flameOn = true, capOn = true, upright = null, sink = 0;
  const cap = sdfObject(CAP, CAP_PALETTE);
  cap.mesh.rotation.x = CAP.tilt;

  function setPalette(p) {
    pal = p;
    hull?.setPalette(pal);
  }
  /** Rebuilds the hull and seats for a crew of n (seat 0: the captain). */
  function setCrew(n) {
    spec = build(n);
    if (hull) { scaled.remove(hull.mesh); hull.dispose(); }
    hull = sdfObject(spec, pal, { live });
    scaled.add(hull.mesh);
    while (crew.length < spec.crew.length) {
      const i = crew.length;
      const a = makeAstronaut(CREW_KEYS[i % CREW_KEYS.length]);
      a.setFace(eyesFor(crewHandle(i)));
      a.group.userData.phase = i * 1.7; // staggered, as the viewer's crew: whole cycles either way
      if (i === 0) bodyOf(a).add(cap.mesh);
      scaled.add(a.group);
      crew.push(a);
    }
    crew.forEach((a, i) => {
      const s = spec.crew[i];
      a.group.visible = !!s;
      if (s) { a.group.position.set(...s.p); a.group.rotation.set(0, s.yaw, 0); }
    });
    return spec;
  }
  /** The seats as built (setCrew's placement). */
  function seatCrew() {
    crew.forEach((a, i) => { const s = spec.crew[i]; if (s) { a.group.position.set(...s.p); a.group.rotation.set(0, s.yaw, 0); } });
  }
  /**
   * Upright riders: the hull's roll on screen is undone for each rider by a turn psi about its own line
   * of sight, the axis along its seat's facing through its pivot (the seat's `pivot`, its window's line
   * of sight at the helmet's depth; else the helmet's centre). A turn about the window's own axis keeps
   * the helmet where it was in the opening; the captain's drop for the cap turns with it, so the cap
   * stays above the helmet on screen. psi takes the ship's +y to `up`, in the ship's own frame. Turned
   * on its side a rider's body runs round the hull's curve instead of down its length, so it also sinks
   * straight back from the ship's front (-z, the way the camera looks when the front faces it) by
   * sink |sin psi| (design units), to keep its boots inside the hull: seen from the front, its face
   * stays where it was in the window, only deeper (sink: one for all, or per seat, the last repeating).
   */
  const tmpQ = new THREE.Quaternion(), yawQ = new THREE.Quaternion(), turnQ = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0), up = new THREE.Vector3(), axis = new THREE.Vector3(), off = new THREE.Vector3(), pv = new THREE.Vector3();
  function uprightCrew(upWorld, sink) {
    up.fromArray(upWorld);
    scaled.matrixWorld.decompose(pv, tmpQ, off);
    up.applyQuaternion(tmpQ.invert());
    const psi = Math.atan2(-up.x, up.y);
    crew.forEach((a, i) => {
      const s = spec.crew[i];
      if (!s) return;
      pv.fromArray(s.pivot ?? [s.p[0], s.p[1] + HELMET_Y, s.p[2]]);
      axis.set(Math.sin(s.yaw), 0, Math.cos(s.yaw));
      turnQ.setFromAxisAngle(axis, psi);
      off.fromArray(s.p).sub(pv).applyQuaternion(turnQ);
      const back = Array.isArray(sink) ? sink[Math.min(i, sink.length - 1)] : sink;
      a.group.position.copy(pv).add(off);
      a.group.position.z -= back * Math.abs(Math.sin(psi));
      a.group.quaternion.copy(turnQ).multiply(yawQ.setFromAxisAngle(Y, s.yaw));
    });
    return psi;
  }
  let psi = 0;
  /** Poses the ship and its crew at time t (s); camera: the one about to render. */
  function update(t, camera) {
    const m = idleAt(t);
    idle.position.y = m.bob * SHIP_SCALE;
    idle.rotation.set(m.pitch, 0, m.roll);
    root.updateMatrixWorld(true);
    if (upright) psi = uprightCrew(upright, sink);
    hull.sync(t, camera, flameOn);
    for (const a of crew) if (a.group.visible) a.update(t); // updates each figure's matrices, the cap's too
    cap.mesh.visible = capOn;
    cap.sync(t, camera);
  }
  return {
    group: root, crew, setCrew, setPalette, update,
    setFlame(on) { flameOn = on; },
    setCap(on) { capOn = on; },
    setUpright(upWorld, opts = {}) { if (upright && !upWorld) seatCrew(); upright = upWorld ?? null; sink = opts.sink ?? 0; psi = 0; },
    get psi() { return psi; }, // the riders' last upright turn (rad)
    get spec() { return spec; }, get mesh() { return hull.mesh; }, get cap() { return cap.mesh; },
  };
}
