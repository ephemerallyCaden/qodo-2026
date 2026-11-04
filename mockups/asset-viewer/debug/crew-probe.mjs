// Crew probe: renders one of the viewer's real astronauts (makeAstronaut) alone on flat space,
// in crops of the standard 320x180 crew close-up (same 35° camera and offset), so it can be
// checked pixel by pixel and compared with the astronaut lab's renders. Serves the viewer via
// Playwright interception (no socket); the hook is appended to viewer.js IN MEMORY ONLY.
import { openViewer } from './repro-hollow-clouds.mjs';

export const SPACE = '#0d0b16';
export const VIEWS = { front: 0, '3/4': -0.75, side: -Math.PI / 2 };
const EXPOSE = '\nwindow.__crew = { makeAstronaut };\n';

// In the page: render cells [{ yaw, t, color, eyes, zoom }] as w x h tiles; return RGBA per tile.
function probeInPage({ cells, w, h }) {
  const { THREE, renderer, camera } = window.__dbg;
  const { makeAstronaut } = window.__crew;
  const saved = { size: renderer.getSize(new THREE.Vector2()), fov: camera.fov, aspect: camera.aspect, pos: camera.position.clone(), quat: camera.quaternion.clone() };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(window.__probeSpace);
  window.__probeCrew ??= {};
  const out = [];
  renderer.setSize(w, h, false);
  for (const { yaw = 0, t = 0, color = 'mint', eyes = 0, zoom = 1 } of cells) {
    const a = (window.__probeCrew[color] ??= makeAstronaut(color));
    a.setFace(eyes);
    a.group.rotation.y = yaw;
    scene.add(a.group);
    a.update(t);
    // The viewer's figure stands LIFT above its origin, so its centre is 0.03 higher than the lab's.
    const target = new THREE.Vector3(0, 0.52, 0);
    camera.fov = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(17.5)) * (h / 180)) * 180) / Math.PI;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    camera.position.set(0, 0.43, 2.7).multiplyScalar(1 / zoom).add(target);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    renderer.render(scene, camera);
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const x = c.getContext('2d');
    x.drawImage(renderer.domElement, 0, 0);
    out.push(Array.from(x.getImageData(0, 0, w, h).data));
    scene.remove(a.group);
  }
  renderer.setSize(saved.size.x, saved.size.y, false);
  Object.assign(camera, { fov: saved.fov, aspect: saved.aspect });
  camera.position.copy(saved.pos);
  camera.quaternion.copy(saved.quat);
  camera.updateProjectionMatrix();
  return out;
}

/** Opens the viewer (palette 'final', 180p) with the probe; patch(src) may rewrite viewer.js. */
export async function openCrewProbe({ patch } = {}) {
  const { browser, page } = await openViewer({ patch: (src) => (patch ? patch(src) : src) + EXPOSE });
  await page.evaluate((space) => {
    window.__probeSpace = space;
    window.viewer.set({ palette: 'final', pixelH: 180, depth: true, depthMode: 'pixel-smooth', view: 'crew', ui: false });
  }, SPACE).catch(async (e) => { await browser.close(); throw e; }); // never leave a browser behind
  const probe = async (cells, w = 100, h = 128) => (await page.evaluate(probeInPage, { cells, w, h })).map((d) => Uint8ClampedArray.from(d));
  return { browser, page, probe };
}

const hex = (d, i) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
/** Silhouette stats of one tile: figure pixels, 8-connected pieces, colours, edge contact. */
export function tileStats(d, w, h, bg = parseInt(SPACE.slice(1), 16)) {
  const mask = new Uint8Array(w * h);
  const colours = new Map();
  let px = 0;
  for (let i = 0; i < w * h; i++) {
    const c = hex(d, i * 4);
    colours.set(c, (colours.get(c) ?? 0) + 1);
    if (c !== bg) { mask[i] = 1; px++; }
  }
  let pieces = 0;
  const seen = new Uint8Array(w * h), stack = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || seen[i]) continue;
    pieces++;
    seen[i] = 1;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop(), x = j % w, y = (j - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy, k = Y * w + X;
        if (X >= 0 && Y >= 0 && X < w && Y < h && mask[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
  }
  let clipped = false;
  for (let x = 0; x < w; x++) clipped ||= !!(mask[x] || mask[(h - 1) * w + x]);
  for (let y = 0; y < h; y++) clipped ||= !!(mask[y * w] || mask[y * w + w - 1]);
  return { px, pieces, clipped, colours };
}
