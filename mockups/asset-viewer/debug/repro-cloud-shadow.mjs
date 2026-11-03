// Probe: "phantom" cloud shadows (shadow pixels with no cloud between them and the light).
// Ground truth is computed on the CPU, independently of SHADOW_VERT's maths:
//   1. render the hero planet with clouds hidden, shadow on and shadow off; every pixel
//      that differs is a shadow pixel (puffs hidden so they can't occlude it)
//   2. ray from the camera through the pixel centre onto the planet sphere -> surface point P
//   3. legit   = the ray P + L*s (towards the light, 0 < s <= REACH) enters some puff
//                (puff ellipsoid = sky.matrixWorld * instanceMatrix * unit sphere, inflated
//                by SLACK for icosphere facets / pixel quantisation)
//      phantom = not legit; `src` records whether the ray P - L*s (AWAY from the light,
//                through the planet) hits a puff, i.e. the shadow came from the far side
// Usage: node debug/repro-cloud-shadow.mjs        -> stats + marked-up frames in debug/
//        FIX=tpos node debug/repro-cloud-shadow.mjs -> same with the candidate fix (t > 0) in memory
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openViewer } from './repro-hollow-clouds.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)));
export const BASE = { view: 'planet', palette: 'final', seed: 7, size: 1, ringMode: 'thin', moons: false, period: 24, surfaceTurns: 2, cloudTurns: 3, depth: true, pixelH: 180, color: 'coral', spin: true, ui: false, halo: false, eyes: 'auto', cloudShadow: true, artefacts: false };

// Candidate fix, applied in memory only (control for the test): a vertex whose light ray
// hits the planet behind it (t <= 0: the cloud is on the far side from the light) casts nothing.
const T_LINE = 'float t = b - sqrt(disc);';
export const T_POSITIVE_FIX = (src) => {
  if (!src.includes(T_LINE)) throw new Error('SHADOW_VERT changed; update the control patch');
  return src.replace(T_LINE, `${T_LINE}\n    if (t <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }`);
};

// Runs in the page. Returns per-frame counts and, if mark, a PNG data URL of the frame with
// phantom pixels magenta and legit shadow pixels green.
export function classifyInPage({ o, mark = false, REACH = 0.12, SLACK = 1.2 }) {
  const { planets, renderer, scene, camera, THREE } = window.__dbg;
  window.viewer.set(o);
  const p = planets[0];
  const inst = [];
  p.group.traverse((m) => { if (m.isInstancedMesh) inst.push(m); });
  const shadow = inst.find((m) => m.material.vertexShader?.includes('uToSurface'));
  const puffs = inst.find((m) => m !== shadow && m.instanceMatrix === shadow.instanceMatrix);
  if (!shadow || !puffs) throw new Error('could not find the cloud / cloud-shadow meshes');
  const grab = () => {
    renderer.render(scene, camera);
    const src = document.getElementById('view');
    const c = Object.assign(document.createElement('canvas'), { width: src.width, height: src.height });
    const x = c.getContext('2d'); x.drawImage(src, 0, 0);
    return { c, x, d: x.getImageData(0, 0, c.width, c.height) };
  };
  const full = mark ? grab() : null; // the frame as the user sees it
  const puffsVis = puffs.visible;
  puffs.visible = false;
  shadow.material.visible = true;
  const on = grab();
  shadow.material.visible = false;
  const off = grab();
  shadow.material.visible = o.cloudShadow !== false;
  puffs.visible = puffsVis;
  renderer.render(scene, camera);

  const W = on.c.width, H = on.c.height;
  const L = shadow.material.uniforms.uLight.value.clone().normalize();
  const C = shadow.material.uniforms.uCenter.value.clone();
  const R = shadow.material.uniforms.uRadius.value;
  // puff inverse world matrices (unit sphere in local space)
  const inv = [], m = new THREE.Matrix4();
  puffs.parent.updateMatrixWorld(true);
  for (let i = 0; i < puffs.count; i++) { puffs.getMatrixAt(i, m); inv.push(m.clone().premultiply(puffs.parent.matrixWorld).invert()); }
  const ro = new THREE.Vector3(), rd = new THREE.Vector3();
  // first puff hit along P + dir*s for s in (0, maxS]; returns { i, s } or null
  const hitPuff = (P, dir, maxS) => {
    let best = null;
    for (let i = 0; i < inv.length; i++) {
      ro.copy(P).applyMatrix4(inv[i]);
      rd.copy(dir).transformDirection(inv[i]); // normalised; rescale s below
      const k = new THREE.Vector3().copy(dir).applyMatrix4(new THREE.Matrix4().copy(inv[i]).setPosition(0, 0, 0)).length();
      const bb = ro.dot(rd), cc = ro.dot(ro) - SLACK * SLACK, disc = bb * bb - cc;
      if (disc < 0) continue;
      const s0 = (-bb - Math.sqrt(disc)) / k, s1 = (-bb + Math.sqrt(disc)) / k; // world distance
      if (s1 <= 0) continue;
      const s = Math.max(s0, 0);
      if (s <= maxS && (!best || s < best.s)) best = { i, s };
    }
    return best;
  };
  const ndc = new THREE.Vector3(), dir = new THREE.Vector3(), P = new THREE.Vector3(), negL = L.clone().negate();
  let legit = 0, phantom = 0, phantomFromFar = 0;
  const legitPts = [], phantomPts = [];
  const a = on.d.data, b = off.d.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = (y * W + x) * 4;
    if (a[k] === b[k] && a[k + 1] === b[k + 1] && a[k + 2] === b[k + 2]) continue;
    ndc.set(((x + 0.5) / W) * 2 - 1, -(((y + 0.5) / H) * 2 - 1), 0.5).unproject(camera);
    dir.copy(ndc).sub(camera.position).normalize();
    const oc = camera.position.clone().sub(C), bq = oc.dot(dir), disc = bq * bq - (oc.dot(oc) - (R * 1.003) ** 2);
    if (disc < 0) continue; // not on the planet (ring/moon/limb haze changes): ignore
    P.copy(camera.position).addScaledVector(dir, -bq - Math.sqrt(disc));
    const h = hitPuff(P, L, REACH * R);
    if (h) { legit++; legitPts.push({ x, y, i: h.i }); continue; }
    phantom++;
    const src = hitPuff(P, negL, 3 * R);
    if (src) phantomFromFar++;
    phantomPts.push({ x, y, i: src ? src.i : -1 });
  }
  let png = null;
  if (mark) {
    const d = full.d.data;
    for (const q of legitPts) { const k = (q.y * W + q.x) * 4; d[k] = 0; d[k + 1] = 255; d[k + 2] = 0; }
    for (const q of phantomPts) { const k = (q.y * W + q.x) * 4; d[k] = 255; d[k + 1] = 0; d[k + 2] = 255; }
    full.x.putImageData(full.d, 0, 0);
    png = full.c.toDataURL('image/png');
  }
  // screen position of each puff centre, and whether it faces the camera (front-side clouds)
  const puffScr = [], cw = new THREE.Vector3(), camDir = camera.position.clone().sub(C).normalize();
  for (let i = 0; i < puffs.count; i++) {
    puffs.getMatrixAt(i, m); cw.setFromMatrixPosition(m).applyMatrix4(puffs.parent.matrixWorld);
    const front = cw.clone().sub(C).normalize().dot(camDir) > 0.3;
    cw.project(camera);
    puffScr.push([+(((cw.x + 1) / 2) * W).toFixed(2), +(((1 - cw.y) / 2) * H).toFixed(2), front ? 1 : 0]);
  }
  return { shadowPx: legit + phantom, legit, phantom, phantomFromFar, puffs: puffs.count, png, W, H, puffScr,
    legitPts: legitPts.map((q) => [q.x, q.y, q.i]), phantomPts: phantomPts.map((q) => [q.x, q.y, q.i]) };
}

// Screen-space motion of each class: for every puff whose shadow appears at both t and t+dt,
// the centroid shift of its shadow pixels. Clouds drift right -> left on the front face.
export function motion(r0, r1, dt) {
  const cent = (pts) => { const g = new Map(); for (const [x, y, i] of pts) { if (i < 0) continue; const e = g.get(i) ?? [0, 0, 0]; e[0] += x; e[1] += y; e[2]++; g.set(i, e); } return g; };
  const out = {};
  for (const key of ['legitPts', 'phantomPts']) {
    const a = cent(r0[key]), b = cent(r1[key]);
    let dx = 0, dy = 0, n = 0;
    for (const [i, e] of a) { const f = b.get(i); if (!f || e[2] < 3 || f[2] < 3) continue; dx += f[0] / f[2] - e[0] / e[2]; dy += f[1] / f[2] - e[1] / e[2]; n++; }
    out[key.replace('Pts', '')] = n ? { puffs: n, vx: +(dx / n / dt).toFixed(2), vy: +(dy / n / dt).toFixed(2) } : null; // px/s
  }
  // every shadow pixel (legit or not), grouped by its puff: share of groups moving rightwards
  const all0 = cent([...r0.legitPts, ...r0.phantomPts]), all1 = cent([...r1.legitPts, ...r1.phantomPts]);
  let groups = 0, right = 0, sx = 0, w = 0;
  for (const [i, e] of all0) { const f = all1.get(i); if (!f || e[2] < 3 || f[2] < 3) continue; const vx = (f[0] / f[2] - e[0] / e[2]) / dt; groups++; if (vx > 0) right++; sx += vx * e[2]; w += e[2]; }
  // the clouds themselves: mean screen vx of the front-facing puff centres
  let cx = 0, cn = 0;
  r0.puffScr.forEach((q, i) => { if (!q[2] || !r1.puffScr[i]?.[2]) return; cx += (r1.puffScr[i][0] - q[0]) / dt; cn++; });
  out.shadow = { groups, rightwardShare: groups ? +(right / groups).toFixed(3) : null, vx: w ? +(sx / w).toFixed(2) : null };
  out.clouds = { puffs: cn, vx: cn ? +(cx / cn).toFixed(2) : null };
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await mkdir(OUT, { recursive: true });
  const fix = process.env.FIX === 'tpos';
  const { browser, page } = await openViewer(fix ? { patch: T_POSITIVE_FIX } : {});
  const tag = fix ? 'fix-tpos' : 'prod';
  try {
    const rows = [];
    for (const biome of ['lush', 'ocean']) for (const time of [0, 3, 6, 9, 12, 15, 18, 21]) {
      const o = { ...BASE, biome, seed: biome === 'lush' ? 7 : 5, pixelH: 360, time };
      const r = await page.evaluate(classifyInPage, { o, mark: time === 3 || time === 15 });
      const r1 = await page.evaluate(classifyInPage, { o: { ...o, time: time + 0.25 } });
      const mo = motion(r, r1, 0.25);
      rows.push({ biome, time, shadowPx: r.shadowPx, legit: r.legit, phantom: r.phantom, phantomFromFarSide: r.phantomFromFar, legitVx: mo.legit?.vx, legitVy: mo.legit?.vy, phantomVx: mo.phantom?.vx, phantomVy: mo.phantom?.vy });
      if (r.png) await writeFile(path.join(OUT, `shadow-${tag}-${biome}-t${time}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
    }
    console.table(rows);
  } finally {
    await browser.close();
  }
}
