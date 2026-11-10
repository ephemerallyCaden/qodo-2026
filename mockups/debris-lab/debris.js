// The debris factory (space-debris.md D3): one modifier any viewer planet can carry. Pieces are
// live three.js meshes lit in four flat bands, darkened in the planet's shadow, rusted per cell,
// depth-tested against the planet, its clouds, moons and ring, and faded per pixel with the
// viewer's own depthFade(). Placement and motion come from layout.js (pure, loop-locked).
//
// The viewer is imported read-only in library mode. Its depth GLSL and the shared depth and
// light uniforms aren't exported, so they're borrowed from a probe planet's ring material (the
// uniform objects themselves, so applyDepth() drives debris exactly as it drives the planet).
// When the picked direction is ported into the viewer, these become direct references.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makePlanet, PALETTES } from '../asset-viewer/viewer.js';
import { plan, fragPoses, sweepAt } from './layout.js';
import { HULLS, RUST, TEAL, TAGS, PAINT, DULL, NAVY, paletteRole } from './palette.js';

const probe = makePlanet(); // never added to a scene
const ringMat = probe.ring.material;
const DEPTH_GLSL = ringMat.fragmentShader.match(/uniform int uDepthMode;[\s\S]*?return mix\(c, tint\.rgb, tint\.a \* k\);\s*\}/)?.[0];
if (!DEPTH_GLSL) throw new Error('debris: the viewer depthFade() GLSL was not found (viewer.js changed?)');
// every uniform the borrowed GLSL declares, except the per-material family, plus the key light
const SHARED_NAMES = [...[...DEPTH_GLSL.matchAll(/uniform \w+ (\w+)/g)].map((m) => m[1]).filter((k) => k !== 'uDepthFamily'), 'uLight'];
const SHARED = Object.fromEntries(SHARED_NAMES.map((k) => {
  if (!ringMat.uniforms[k]) throw new Error(`debris: viewer uniform ${k} missing`);
  return [k, ringMat.uniforms[k]];
}));
// The debris ramps as a palette role in every viewer palette, so setDepthLevel() can re-tint them
// in the object depth mode (resolve('debris.hull.gear') etc.).
for (const pal of Object.values(PALETTES)) pal.debris = paletteRole();

const VERT = /* glsl */ `
  in vec3 aLocal;
  in float aTag;
  in float aFrag;
  in float aPaint;
  in vec4 aGrid;
  out vec3 vNormalW;
  out vec3 vNormalL;
  out vec3 vPosW;
  out vec3 vLocal;
  out vec2 vUv;
  out float vTag;
  out float vFrag;
  out float vPaint;
  out vec4 vGrid;
  void main() {
    vFrag = aFrag;
    vPaint = aPaint;
    vGrid = aGrid;
    vUv = uv;
    vNormalL = normal;
    vLocal = aLocal - normal * 0.02; // just inside the surface, so a face never sits on a rust-cell boundary
    vTag = aTag;
    vNormalW = normalize(mat3(modelMatrix) * normal); // uniform scale only
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const FRAG = /* glsl */ `
  uniform vec3 uLight;
  uniform vec3 uBands;
  uniform vec3 uHull[4];
  uniform vec3 uRust[4];
  uniform vec3 uTeal[4];
  uniform vec3 uTag;
  uniform vec3 uPaint[4];
  uniform vec3 uDull[4];
  uniform vec3 uNavy[4];
  uniform float uDullShare;
  uniform float uScorchShare;
  uniform float uRustShare;
  uniform float uCell;
  uniform float uHashOff;
  uniform float uFlash;
  uniform vec3 uCenter;
  uniform float uRadius;
  uniform int uDebug;
  uniform vec3 uId;
  ${DEPTH_GLSL}
  in vec3 vNormalW;
  in vec3 vPosW;
  in vec3 vLocal;
  in float vTag;
  in float vFrag;
  in vec3 vNormalL;
  in vec2 vUv;
  in float vPaint;
  in vec4 vGrid;
  // integer-cell hash (cells come from floor(), so the same panel rusts on every frame)
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
    if (uDebug == 1) { gl_FragColor = vec4(uId.r, (vFrag + 1.0) / 255.0, uId.b, 1.0); return; } // ids: r piece + 1, g fragment + 1, b 254
    float d = dot(normalize(vNormalW), uLight);
    int b = d > uBands.z ? 3 : d > uBands.y ? 2 : d > uBands.x ? 1 : 0;
    vec3 oc = vPosW - uCenter;
    float bq = dot(oc, uLight);
    if (bq < 0.0 && dot(oc, oc) - bq * bq < uRadius * uRadius) b = 0; // in the planet's shadow
    vec3 cell = floor(vLocal / uCell + 0.5) + uHashOff;
    bool rust = cellHash(cell) < uRustShare;
    vec3 c = rust ? uRust[b] : uHull[b];
    if (uScorchShare > 0.0 && cellHash(cell + 17.0) < uScorchShare) c = uNavy[b]; // scorched metal (A2)
    if (vGrid.z > 0.0 && abs(vNormalL.z) > 0.5 && !onLine(vUv.x, vGrid.x, vGrid.z) && !onLine(vUv.y, vGrid.y, vGrid.w)) c = uNavy[b]; // solar cells; the frame and grid stay metal
    if (vPaint > 0.5) c = cellHash(cell + 41.0) < uDullShare ? uDull[b] : uPaint[b]; // red paint, chipping to dull mauve with age
    if (vTag > 0.5 && b > 0) c = uTag; // painted class band (kit D), dark on the night side
    if (uFlash > 0.0 && float(b) >= 3.0 - uFlash * 3.0 - 0.01) c = uTeal[b]; // event: teal fills down from the lit band
    gl_FragColor = vec4(depthFade(c, vPosW, 1.0), 1.0);
  }
`;
const BANDS = new THREE.Vector3(-0.12, 0.28, 0.64); // light bands: hard metal faces, a wide lit band
const col = (hexes) => hexes.map((h) => new THREE.Color(h));

/** One material per piece slot. Slots are reused across rebuilds, so the shared program is never released and recompiled. */
function slotMaterial(index) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      ...SHARED,
      uDepthFamily: { value: 0 }, // planet family tints (debris lives with the planets)
      uBands: { value: BANDS },
      uHull: { value: col(HULLS.gear) }, uRust: { value: col(RUST) }, uTeal: { value: col(TEAL) }, uTag: { value: new THREE.Color() },
      uPaint: { value: col(PAINT) }, uDull: { value: col(DULL) }, uNavy: { value: col(NAVY) },
      uRustShare: { value: 0 }, uDullShare: { value: 0 }, uScorchShare: { value: 0 }, uCell: { value: 1 }, uHashOff: { value: 0 },
      uFlash: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uRadius: { value: 1 },
      uDebug: { value: 0 }, uId: { value: new THREE.Vector3((index + 1) / 255, 0, 254 / 255) },
    },
  });
  return mat;
}
/** Points a slot's material at a piece: its rust, cells and ramps (re-tinted on the next setDepthLevel). */
function setPiece(mat, piece, hull) {
  const u = mat.uniforms;
  u.uHull.value.forEach((c, i) => c.set(HULLS[hull][i]));
  u.uTag.value.set(TAGS[piece.cls]);
  u.uRustShare.value = piece.rust;
  u.uDullShare.value = piece.dull;
  u.uScorchShare.value = piece.scorch;
  u.uCell.value = piece.cell;
  u.uHashOff.value = piece.hashOff;
  mat.userData.ramps = { uHull: `debris.hull.${hull}`, uRust: 'debris.rust', uTeal: 'debris.teal', uTag: `debris.tag.${piece.cls}`, uPaint: 'debris.paint', uDull: 'debris.dull', uNavy: 'debris.navy' };
}

function partGeometry(p) {
  let g;
  if (p.shape === 'box') g = new THREE.BoxGeometry(...p.size);
  else {
    g = new THREE.CylinderGeometry(p.r2 ?? p.r, p.r, p.len, 12, 1); // top (+y) is r2
    if (p.axis !== 'y') g.rotateZ(-Math.PI / 2); // +y -> +x
  }
  g.translate(...p.pos);
  const n = g.getAttribute('position').count;
  const fill = (v, k = 1) => new THREE.Float32BufferAttribute(Float32Array.from({ length: n * k }, (_, i) => v[i % k]), k);
  g.setAttribute('aLocal', g.getAttribute('position').clone());
  g.setAttribute('aTag', fill([p.tag ? 1 : 0]));
  g.setAttribute('aPaint', fill([p.paint ? 1 : 0]));
  g.setAttribute('aGrid', fill(p.grid ?? [0, 0, 0, 0], 4)); // a panel's cells and line widths (layout: kits.js panelGrid)
  return g;
}

/** One mesh per fragment, its geometry centred on the fragment (aLocal keeps the piece frame for rust). */
function fragMeshes(piece, mat) {
  return piece.frags.map((f) => {
    const g = mergeGeometries(piece.parts.filter((p) => p.frag === f.id).map(partGeometry));
    g.translate(...f.centre.map((x) => -x));
    g.setAttribute('aFrag', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(f.id), 1));
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false; // poses change every frame
    return mesh;
  });
}

const Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), V = new THREE.Vector3(), AX = new THREE.Vector3();

export function makeDebris() {
  const group = new THREE.Group();
  group.userData.depthFamily = 'planet';
  let built = '';
  let layout = { pieces: [], overflow: 0, mass: 0 };
  let slots = []; // [{ piece, mat, meshes }]
  const mats = []; // slot materials, kept for the factory's lifetime

  /** items: stale items (layout.js); variant: { kit, arrangement, cap }; radius: the planet's size. */
  function rebuild(items, variant, { seed = 1, radius = 1, hull = 'gear' } = {}) {
    const key = JSON.stringify([items, variant.kit, variant.arrangement, variant.cap, seed, radius, hull]);
    if (key === built) return layout;
    built = key;
    for (const s of slots) for (const m of s.meshes) { group.remove(m); m.geometry.dispose(); }
    layout = plan(items, variant, { seed, radius });
    slots = layout.pieces.map((piece, i) => {
      const mat = (mats[i] ??= slotMaterial(i));
      setPiece(mat, piece, hull);
      const meshes = fragMeshes(piece, mat);
      group.add(...meshes);
      return { piece, mat, meshes };
    });
    group.userData.depthLevel = -1; // new materials: re-tint on the next setDepthLevel
    return layout;
  }

  /**
   * Poses every piece at loop phase [0, 1). centre/radius: the planet's world centre and radius.
   * sweeps: { [item id]: seconds since its sweep began } (D6, outside the loop lock).
   * selected: an item id, drawn with a teal lit band (an event).
   */
  function update(phase, { centre = [0, 0, 0], radius = 1, sweeps = {}, selected = null } = {}) {
    group.position.set(...centre);
    group.updateMatrixWorld();
    for (const { piece, mat, meshes } of slots) {
      const sw = sweepAt(sweeps[piece.id]);
      const gone = !!sw?.gone;
      mat.uniforms.uFlash.value = sw && !gone ? sw.flash : piece.id === selected ? 0.2 : 0; // selected: the lit band only
      mat.uniforms.uCenter.value.set(...centre);
      mat.uniforms.uRadius.value = radius;
      const poses = gone ? [] : fragPoses(piece, phase, sw);
      meshes.forEach((m, k) => {
        m.visible = !gone && poses[k].scale > 0;
        if (!m.visible) return;
        const p = poses[k];
        Q.setFromAxisAngle(AX.set(...p.axis), p.angle);
        V.set(...p.local).applyQuaternion(Q).add(AX.set(...p.centre));
        m.position.copy(V);
        m.quaternion.copy(Q).multiply(Q2.setFromAxisAngle(AX.set(...p.extra[0]), p.extra[1]));
        m.scale.setScalar(piece.scale * p.scale);
      });
    }
  }

  /** 0: normal; 1: flat id colours (r = piece index + 1, g = fragment + 1, b = 254) for measurement. */
  function setDebug(mode) {
    for (const s of slots) s.mat.uniforms.uDebug.value = mode;
  }

  return { group, rebuild, update, setDebug, get layout() { return layout; } };
}
