// The debris factory (space-debris.md D3): stale work drifting near the planet it touches, a
// modifier any planet carries (makePlanet composes one; the debris lab drives its own). Pieces are
// live three.js meshes lit in four flat bands, darkened in the planet's shadow, depth-tested against
// the planet, its clouds, moons and ring, and faded per pixel with the viewer's own depthFade().
// Placement and motion come from debris-layout.js (pure, loop-locked); shapes from debris-kits.js.
//
// The product look is A3 (DEBRIS_STYLE): grey satellite parts, a 1 px red outline and blinking red
// nav lights. The outline is the one place outlines are allowed (art direction §3), and only debris
// gets it; the shader also carries the lab's exploration looks (rust, paint, class bands), which the
// viewer never sets.
//
// viewer.js builds the factory once with its depth GLSL, depth and light uniforms and drawing-buffer
// size (debrisFactory below), so debris fades and sizes exactly like everything else.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { plan, fragPoses, sweepAt, BLINK } from './debris-layout.js';
import { DEBRIS_COLOURS, TEAL } from './debris-palette.js';

/** The product debris: A3 (the human's pick, 2026-11-10). */
export const DEBRIS_STYLE = { kit: 'outlined', arrangement: 'orbits', cap: 12, hull: 'grey' };

/**
 * deps: { depthGlsl, depthUniforms(family), light (Vector3), viewSize ({ value: Vector2 }, the drawing
 * buffer) }. Returns { makeDebris }.
 */
export function debrisFactory({ depthGlsl: DEPTH_GLSL, depthUniforms, light, viewSize: VIEW }) {
  const { uDepthFamily, ...DEPTH_SHARED } = depthUniforms(0);
  const SHARED = { ...DEPTH_SHARED, uLight: { value: light } };

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
  // A3's red outline: an inverted hull. Each fragment is drawn again, back faces only, with every
  // vertex pushed out along its smoothed normal by OUTLINE_PX pixels at its depth, so a 1 px red rim shows
  // around the silhouette. It's ordinary geometry in the z-buffer, so it sorts against the planet,
  // clouds and moons like the piece (no post pass), and depth-fades per pixel. Debris only: outlines
  // are banned everywhere else (art direction §3), and this exception is the human's.
  const OUTLINE_PX = 1.2; // a touch over 1 px so diagonal edges don't gap: 84-98% of the silhouette's edge covered, at most 1 px anywhere 2 px thick (test/render.test.mjs)
  const OUTLINE_VERT = /* glsl */ `
    in vec3 aOutline;
    uniform vec2 uView;
    uniform float uPx;
    out vec3 vPosW;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vec4 vp = viewMatrix * wp;
      // a true 3D shell: push the vertex out along its smoothed normal (view space) by uPx pixels at its
      // own depth, so the shell's back faces always sit behind the body and show only past the silhouette
      vec3 n = normalize(mat3(viewMatrix) * normalize(mat3(modelMatrix) * aOutline));
      float worldPerPx = 2.0 * -vp.z / (projectionMatrix[1][1] * uView.y);
      vp.xyz += n * uPx * worldPerPx;
      vPosW = (inverse(viewMatrix) * vp).xyz;
      gl_Position = projectionMatrix * vp;
    }
  `;
  const FLAT_FRAG = /* glsl */ `
    uniform vec3 uColor;
    uniform int uDebug;
    uniform vec3 uId;
    ${DEPTH_GLSL}
    in vec3 vPosW;
    void main() {
      if (uDebug == 1) { gl_FragColor = vec4(uId.r, 1.0 / 255.0, uId.b, 1.0); return; }
      gl_FragColor = vec4(depthFade(uColor, vPosW, 1.0), 1.0);
    }
  `;
  // Nav lights: 2 px points, lit for BLINK.duty of each of BLINK.perLoop blinks per loop, staggered by
  // each light's seeded phase; a dead light (age) never lights. uBlink 0 holds them steady (close-ups).
  const LIGHT_VERT = /* glsl */ `
    in float aOff;
    in float aAlive;
    uniform float uPhase;
    uniform float uBlink;
    out vec3 vPosW;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vPosW = wp.xyz;
      float g = fract(uPhase * ${BLINK.perLoop.toFixed(1)} + aOff);
      bool on = aAlive > 0.5 && (uBlink < 0.5 || g < ${BLINK.duty});
      gl_Position = on ? projectionMatrix * viewMatrix * wp : vec4(2.0, 2.0, 2.0, 1.0); // off: outside the clip volume
      gl_PointSize = 2.0;
    }
  `;
  const BANDS = new THREE.Vector3(-0.12, 0.28, 0.64); // light bands: hard metal faces, a wide lit band
  const col = (hexes) => (typeof hexes === 'number' ? Array.from({ length: hexes }, () => new THREE.Color()) : hexes.map((h) => new THREE.Color(h)));

  /** One material per piece slot. Slots are reused across rebuilds, so the shared program is never released and recompiled. */
  function slotMaterial(index) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        ...SHARED,
        uDepthFamily: { value: 0 }, // planet family tints (debris lives with the planets)
        uBands: { value: BANDS },
        uHull: { value: col(4) }, uRust: { value: col(4) }, uTeal: { value: col(TEAL) }, uTag: { value: new THREE.Color() },
        uPaint: { value: col(4) }, uDull: { value: col(4) }, uNavy: { value: col(4) },
        uRustShare: { value: 0 }, uDullShare: { value: 0 }, uScorchShare: { value: 0 }, uCell: { value: 1 }, uHashOff: { value: 0 },
        uFlash: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uRadius: { value: 1 },
        uDebug: { value: 0 }, uId: { value: new THREE.Vector3((index + 1) / 255, 0, 254 / 255) },
      },
    });
    return mat;
  }
  /** A3's per-slot outline and light materials (only made for slots that ever hold an outlined piece). */
  function slotExtras(index) {
    const id = () => ({ value: new THREE.Vector3((index + 1) / 255, 0, 254 / 255) });
    const outline = new THREE.ShaderMaterial({
      vertexShader: OUTLINE_VERT, fragmentShader: FLAT_FRAG, side: THREE.BackSide,
      uniforms: { ...SHARED, uDepthFamily: { value: 0 }, uView: VIEW, uPx: { value: OUTLINE_PX }, uColor: { value: new THREE.Color(DEBRIS_COLOURS.roles.outline.bright) }, uDebug: { value: 0 }, uId: id() },
    });
    const light = new THREE.ShaderMaterial({
      vertexShader: LIGHT_VERT, fragmentShader: FLAT_FRAG,
      uniforms: { ...SHARED, uDepthFamily: { value: 0 }, uPhase: { value: 0 }, uBlink: { value: 1 }, uColor: { value: new THREE.Color(DEBRIS_COLOURS.roles.light) }, uDebug: { value: 0 }, uId: id() },
    });
    light.userData.ramps = { uColor: 'debris.light' };
    return { outline, light };
  }

  /** Points a slot's material at a piece: its hull, roles, rust/scorch cells and ramps (re-tinted on the next setDepthLevel). */
  function setPiece(mat, piece, hull) {
    const u = mat.uniforms, { hulls, roles } = DEBRIS_COLOURS;
    const ramp = (uniform, hexes) => uniform.value.forEach((c, i) => c.set(hexes[i]));
    ramp(u.uHull, hulls[hull]);
    const dark = piece.lights ? 'greyDark' : 'navy'; // the solar cells and scorch: A3's grey, the lab's navy
    ramp(u.uNavy, roles[dark]);
    if (roles.rust) ramp(u.uRust, roles.rust);
    if (roles.paint) ramp(u.uPaint, roles.paint);
    if (roles.dull) ramp(u.uDull, roles.dull);
    if (roles.tag) u.uTag.value.set(roles.tag[piece.cls]);
    u.uRustShare.value = piece.rust;
    u.uDullShare.value = piece.dull;
    u.uScorchShare.value = piece.scorch;
    u.uCell.value = piece.cell;
    u.uHashOff.value = piece.hashOff;
    // re-tint only the ramps the palette carries (the viewer has no rust, paint or class bands)
    const keys = { uHull: `debris.hull.${hull}`, uTeal: 'debris.teal', uNavy: `debris.${dark}`, uRust: 'debris.rust', uTag: `debris.tag.${piece.cls}`, uPaint: 'debris.paint', uDull: 'debris.dull' };
    const present = { uHull: true, uTeal: true, uNavy: true, uRust: !!roles.rust, uTag: !!roles.tag, uPaint: !!roles.paint, uDull: !!roles.dull };
    mat.userData.ramps = Object.fromEntries(Object.entries(keys).filter(([k]) => present[k]));
  }

  /** Each vertex's outline direction: the normals of every face meeting at its position, averaged, so the hull has no corner gaps. */
  function outlineNormals(g) {
    const pos = g.getAttribute('position'), nrm = g.getAttribute('normal');
    const key = (i) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    const sum = new Map();
    for (let i = 0; i < pos.count; i++) {
      const k = key(i), v = sum.get(k) ?? [0, 0, 0];
      sum.set(k, [v[0] + nrm.getX(i), v[1] + nrm.getY(i), v[2] + nrm.getZ(i)]);
    }
    const out = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const [x, y, z] = sum.get(key(i)), l = Math.hypot(x, y, z) || 1;
      out.set([x / l, y / l, z / l], i * 3);
    }
    g.setAttribute('aOutline', new THREE.Float32BufferAttribute(out, 3));
  }

  /** A3: the outline hull and nav-light points as children of each fragment mesh (they share its pose). */
  function addExtras(piece, meshes, extras) {
    piece.frags.forEach((f, k) => {
      const mesh = meshes[k];
      outlineNormals(mesh.geometry);
      const hull = new THREE.Mesh(mesh.geometry, extras.outline);
      hull.frustumCulled = false;
      hull.userData.outline = true;
      hull.visible = piece.outlineFrags.includes(f.id);
      mesh.add(hull);
      const own = piece.lights.filter((l) => l.frag === f.id);
      if (!own.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(own.flatMap((l) => l.pos.map((x, i) => x - f.centre[i])), 3));
      g.setAttribute('aOff', new THREE.Float32BufferAttribute(own.map((l) => l.off), 1));
      g.setAttribute('aAlive', new THREE.Float32BufferAttribute(own.map((l) => (l.alive ? 1 : 0)), 1));
      const pts = new THREE.Points(g, extras.light);
      pts.frustumCulled = false;
      pts.userData.lights = true;
      mesh.add(pts);
    });
    extras.outline.uniforms.uColor.value.set(DEBRIS_COLOURS.roles.outline[piece.outline]);
    extras.outline.userData.ramps = { uColor: `debris.outline.${piece.outline}` };
    extras.light.uniforms.uBlink.value = piece.motion.still ? 0 : 1;
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

  function makeDebris() {
    const group = new THREE.Group();
    group.userData.depthFamily = 'planet';
    group.userData.debris = true; // the outline material lives only under groups marked so (viewer test)
    let built = '';
    let layout = { pieces: [], overflow: 0, mass: 0 };
    let slots = []; // [{ piece, mat, meshes, extras }]
    const mats = []; // slot materials, kept for the factory's lifetime
    const extraMats = []; // A3's outline and light materials per slot

    /** items: stale items (layout.js); variant: { kit, arrangement, cap }; radius: the planet's size. */
    function rebuild(items, variant, { seed = 1, radius = 1, hull = 'gear' } = {}) {
      const key = JSON.stringify([items, variant.kit, variant.arrangement, variant.cap, seed, radius, hull]);
      if (key === built) return layout;
      built = key;
      for (const s of slots) for (const m of s.meshes) {
        group.remove(m);
        for (const c of m.children) if (c.userData.lights) c.geometry.dispose(); // outline hulls share the fragment's geometry
        m.geometry.dispose();
      }
      layout = plan(items, variant, { seed, radius });
      slots = layout.pieces.map((piece, i) => {
        const mat = (mats[i] ??= slotMaterial(i));
        setPiece(mat, piece, hull);
        const meshes = fragMeshes(piece, mat);
        const extras = piece.lights ? (extraMats[i] ??= slotExtras(i)) : null;
        if (extras) addExtras(piece, meshes, extras);
        group.add(...meshes);
        return { piece, mat, meshes, extras };
      });
      group.userData.depthLevel = -1; // new materials: re-tint on the next setDepthLevel
      return layout;
    }

    /**
     * Poses every piece at loop phase [0, 1). centre/radius: the planet's world centre and radius.
     * sweeps: { [item id]: seconds since its sweep began } (D6, outside the loop lock).
     * selected: an item id, drawn with a teal lit band (an event).
     * centre/radius also place the planet's shadow; local: the caller places the group.
     */
    function update(phase, { centre = [0, 0, 0], radius = 1, sweeps = {}, selected = null, local = false } = {}) {
      if (!local) { // local: the group rides inside a planet's group (makePlanet), which places it
        group.position.set(...centre);
        group.updateMatrixWorld();
      }
      for (const { piece, mat, meshes, extras } of slots) {
        const sw = sweepAt(sweeps[piece.id]);
        if (extras) {
          extras.light.uniforms.uPhase.value = phase;
          // a sweep breaks the outline and kills the lights; broken pieces keep the outline on one fragment
          meshes.forEach((m, k) => { for (const c of m.children) c.visible = !sw && (c.userData.lights || piece.outlineFrags.includes(piece.frags[k].id)); });
        }
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
      for (const s of slots) {
        s.mat.uniforms.uDebug.value = mode;
        if (s.extras) s.extras.outline.uniforms.uDebug.value = s.extras.light.uniforms.uDebug.value = mode;
      }
    }

    return { group, rebuild, update, setDebug, get layout() { return layout; } };
  }

  return { makeDebris };
}
