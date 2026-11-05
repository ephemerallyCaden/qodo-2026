// Probe (bug report 2026-11-04): "on a lava planet, when I zoom in and out the actual rock
// formation changes". Renders the same planet (same seed, same time, same camera direction) at
// several camera distances and pixel heights in the shader's regions debug view (ground blue,
// crack red, open plate green), maps every pixel back to its point on the planet's own unit sphere
// (ray / sphere hit, then the surface mesh's inverse world matrix), and labels it with the CPU port
// of the crack network (snoise.js voronoiCells, parity-tested against the shader). That turns each
// render into zoom-independent facts about the rock, on a fixed surface cap that every framing sees:
//   crackEdges  the set of Voronoi edges (plate pairs) drawn as cracks
//   poolCells   the set of plates drawn open (lava pools / ice water)
//   plates      connected crust regions (ground pixels, 4-connected) in the cap, i.e. how many
//               separate plates the cracks and pools cut the crust into
//   ground / crack / open  area shares of the cap
//   crackWorld  median crack half-width in sphere units (should be constant if the rock is world-space)
//   openMiss    fixed surface samples > 2 px from a cell edge whose pool / not-pool differs from the CPU port
// and compares each framing to the most detailed one: edgeJaccard (edge sets), edgeMatch (the same,
// weighted by crack length, so sub-pixel edges at the cap boundary barely count), and per fixed
// surface sample openFlip / crackFlip. poolJaccard counts cells by pixel, so cells clipped by the cap
// boundary make it noisy; openMiss is the exact pool check. If the rock only got bigger or smaller,
// everything would match at every zoom (up to pixel quantisation).
// Findings (2026-11-04): pools exact at every zoom (openMiss 0); the crack edge set and crack width
// both change with the planet's screen radius (crackWidth's `small` and the dFdx-based gPx). PATCH=
// nosmall / world confirmed which term does what (in-memory patches of the pre-fix shader; see PATCHES at 9377adf).
// test/lava-zoom.test.mjs is the regression test.
// Fix (art-direction §6 Scale): the crack set and width are world-space, with a 1 px half-width
// screen floor where the planet is small on screen. predict() is the CPU model of that rule, so the
// test can tell the floor's legitimate thickening from the rock changing.
// Usage: node debug/repro-lava-zoom.mjs [lava|ice] [seed]
import { openViewer } from './repro-hollow-clouds.mjs';
import { voronoiCells, poolField, crackMask, crackShare } from '../snoise.js';

/** One framing: render the regions view and return, for pixels whose surface point lies inside the
 *  cap (capDeg around the planet-local point under the camera), the region code and local point. */
export async function renderCap(page, { biome, seed, size = 1, dist, pixelH = 180, time = 3, capDeg = 20 }) {
  return page.evaluate(({ biome, seed, size, dist, pixelH, time, capDeg }) => {
    const { THREE, camera, planets, CRACKS } = window.__dbg;
    window.viewer.set({ view: 'studio', biome, seed, size, time, pixelH, ringMode: 'off', moons: false, depth: false, palette: 'final', spin: true, ui: false, artefacts: false, lavaMode: 'layered', lavaTime: null, cover: 0, regions: true, camera: window.__dbg.cameraAt('studio', dist) });
    const { W, H, d } = window.__dbg.readView();
    window.viewer.set({ regions: false });
    let surf = null;
    planets[0].group.traverse((o) => { if (!surf && o.isMesh && o.material.uniforms?.uRegions && !o.material.uniforms.uToSurface) surf = o; });
    surf.updateMatrixWorld(true);
    const centre = new THREE.Vector3().setFromMatrixPosition(surf.matrixWorld);
    const R = new THREE.Vector3().setFromMatrixScale(surf.matrixWorld).x;
    const inv = surf.matrixWorld.clone().invert();
    const sub = camera.position.clone().applyMatrix4(inv).normalize(); // planet-local point under the camera
    const cosCap = Math.cos((capDeg * Math.PI) / 180);
    const hit = new THREE.Vector3(), ndc = new THREE.Vector2();
    const sphere = new THREE.Sphere(centre, R);
    const caster = new THREE.Raycaster();
    const local = (sx, sy) => { // planet-local surface point under screen position (sx, sy) in px, or null
      ndc.set((sx / W) * 2 - 1, 1 - (sy / H) * 2);
      caster.setFromCamera(ndc, camera);
      return caster.ray.intersectSphere(sphere, hit) ? hit.clone().applyMatrix4(inv).normalize() : null;
    };
    const u = surf.material.uniforms;
    const out = {
      W, H, pts: [], radiusPx: window.__dbg.radiusPx(surf), seedOff: u.uSeedOff.value.toArray(), poolCut: u.uPoolCut.value,
      size: R, lift: u.uCrackLift.value, cracks: { ...CRACKS[biome], HERO_PX: CRACKS.HERO_PX, FLOOR_PX: CRACKS.FLOOR_PX },
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = local(x + 0.5, y + 0.5);
      if (!p || p.dot(sub) < cosCap) continue;
      const i = (y * W + x) * 4, k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      const region = k === 0x0000ff ? 0 : k === 0xff0000 ? 1 : k === 0x00ff00 ? 2 : 3; // 3 = covered (ash, haze)
      out.pts.push([x, y, region, p.x, p.y, p.z]);
    }
    // fixed surface samples (Fibonacci points in the cap, the same list for every framing): the
    // region the render shows at each one's pixel, so framings compare point by point
    out.samples = [];
    out.samplePts = [];
    out.sampleGPx = []; // the shader's gPx there: sphere units per screen px along the more foreshortened axis
    const N = 40000, q = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const sy = 1 - ((i + 0.5) / N) * 2, r = Math.sqrt(1 - sy * sy), lon = i * 2.39996;
      q.set(Math.cos(lon) * r, sy, Math.sin(lon) * r);
      if (q.dot(sub) < cosCap) continue;
      out.samplePts.push([q.x, q.y, q.z]);
      const s = q.clone().applyMatrix4(surf.matrixWorld).project(camera);
      const fx = (s.x + 1) * 0.5 * W, fy = (1 - s.y) * 0.5 * H;
      const x = Math.floor(fx), y = Math.floor(fy);
      if (x < 0 || y < 0 || x >= W || y >= H) { out.samples.push(4); out.sampleGPx.push(Infinity); continue; } // off screen
      const ax = local(fx + 1, fy), ay = local(fx, fy + 1);
      out.sampleGPx.push(ax && ay ? Math.max(ax.distanceTo(q), ay.distanceTo(q)) : Infinity);
      const j = (y * W + x) * 4, k = (d[j] << 16) | (d[j + 1] << 8) | d[j + 2];
      out.samples.push(k === 0x0000ff ? 0 : k === 0xff0000 ? 1 : k === 0x00ff00 ? 2 : 3);
    }
    return out;
  }, { biome, seed, size, dist, pixelH, time, capDeg });
}

/** The CPU model of the shader's crack rule (PLANET_FRAG crackHero / crackPx, art-direction §6 Scale) at
 *  each fixed sample: crack[i] = drawn as a crack with the screen floor, world[i] = drawn as a crack
 *  by the world-space width alone (no floor). Open plates are never cracks. */
export function predict(frame, biome) {
  const { freq, cut, half, tip, pool, HERO_PX, FLOOR_PX } = frame.cracks;
  const [ox, oy, oz] = frame.seedOff;
  const off = biome === 'ice' ? [oy, oz, ox] : [ox, oy, oz];
  const crack = [], world = [];
  frame.samplePts.forEach(([px, py, pz], i) => {
    const { own, across, edge } = voronoiCells(px * freq + off[0], py * freq + off[1], pz * freq + off[2]);
    const open = (c) => poolField(...c, ...off, pool.scale) > frame.poolCut;
    const wHero = half * crackShare(crackMask(px, py, pz, freq, ...off), cut, frame.lift);
    const on = !open(own) && !open(across) && wHero >= tip;
    const wWorld = wHero / (HERO_PX * frame.size); // sphere units
    world.push(on && edge / freq < wWorld);
    crack.push(on && edge / freq < Math.max(wWorld, FLOOR_PX * frame.sampleGPx[i]));
  });
  return { crack, world };
}

/** What the floor alone should do to a framing vs the reference, over the samples both classify:
 *  ratio = predicted crack area (framing / reference), flip = predicted share of points that switch
 *  crack / crust, floorShare = the framing's predicted crack area that only the floor draws. */
export function floorEffect(a, b, pa, pb) {
  let n = 0, ca = 0, cb = 0, flip = 0, wa = 0;
  for (let i = 0; i < a.samples.length; i++) {
    if (a.samples[i] > 2 || b.samples[i] > 2) continue;
    n++;
    ca += pa.crack[i]; cb += pb.crack[i]; wa += pa.world[i];
    if (pa.crack[i] !== pb.crack[i]) flip++;
  }
  return { ratio: +(ca / Math.max(1, cb)).toFixed(2), flip: +(flip / Math.max(1, n)).toFixed(3), floorShare: +(1 - wa / Math.max(1, ca)).toFixed(2) };
}

const key = (c) => c.join(',');
const edgeKey = (a, b) => [key(a), key(b)].sort().join('|');

/** Zoom-independent facts about the rock in one framing (see the header). */
export function analyse(frame, biome) {
  const { freq, pool } = frame.cracks;
  const [ox, oy, oz] = frame.seedOff;
  const off = biome === 'ice' ? [oy, oz, ox] : [ox, oy, oz]; // ice passes uSeedOff.yzx
  const crackKeys = [], crackEdges = new Set(), poolCells = new Set(), halfW = new Map();
  const grid = new Map();
  const n = [0, 0, 0, 0];
  for (const [x, y, region, px, py, pz] of frame.pts) {
    n[region]++;
    grid.set(y * frame.W + x, region);
    const { own, across, edge } = voronoiCells(px * freq + off[0], py * freq + off[1], pz * freq + off[2]);
    if (region === 1) {
      const e = edgeKey(own, across);
      crackEdges.add(e);
      crackKeys.push(e);
      halfW.set(e, Math.max(halfW.get(e) ?? 0, edge / freq)); // widest point of this crack, sphere units
    } else if (region === 2) poolCells.add(key(own));
  }
  // crust plates: 4-connected ground components in the cap (>= 3 px, so pixel noise is not a plate)
  const seen = new Set();
  let plates = 0;
  for (const [i, r] of grid) {
    if (r !== 0 || seen.has(i)) continue;
    let size = 0;
    const stack = [i];
    seen.add(i);
    while (stack.length) {
      const j = stack.pop();
      size++;
      const x = j % frame.W;
      for (const k of [j - frame.W, j + frame.W, x > 0 ? j - 1 : -1, x < frame.W - 1 ? j + 1 : -1]) {
        if (k >= 0 && grid.get(k) === 0 && !seen.has(k)) { seen.add(k); stack.push(k); }
      }
    }
    if (size >= 3) plates++;
  }
  // pools against the CPU port: samples more than 2 px (at the cap centre's scale) from any cell
  // edge must be open exactly where poolField(own) > uPoolCut, at every zoom
  let openMiss = 0, far = 0;
  frame.samplePts.forEach(([px, py, pz], i) => {
    const r = frame.samples[i];
    if (r > 2) return;
    const { own, edge } = voronoiCells(px * freq + off[0], py * freq + off[1], pz * freq + off[2]);
    if ((edge / freq) * frame.radiusPx < 2) return;
    far++;
    if ((poolField(...own, ...off, pool.scale) > frame.poolCut) !== (r === 2)) openMiss++;
  });
  const tot = Math.max(1, n[0] + n[1] + n[2]);
  const hw = [...halfW.values()].sort((a, b) => a - b);
  return {
    radiusPx: frame.radiusPx, capPx: frame.pts.length,
    ground: +(n[0] / tot).toFixed(3), crack: +(n[1] / tot).toFixed(3), open: +(n[2] / tot).toFixed(3),
    crackEdges, crackKeys, poolCells, plates, crackWorld: hw.length ? +hw[hw.length >> 1].toFixed(4) : 0, samples: frame.samples, openMiss: `${openMiss}/${far}`,
  };
}

/** Point-by-point changes vs the reference framing, over the fixed surface samples both classify:
 *  openFlip = a point changes between open (pool) and not; crackFlip = between crack and ground. */
export function flips(a, b) {
  let n = 0, open = 0, crack = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] > 2 || b[i] > 2) continue;
    n++;
    if ((a[i] === 2) !== (b[i] === 2)) open++;
    else if (a[i] !== b[i]) crack++;
  }
  return { samples: n, openFlip: +(open / Math.max(1, n)).toFixed(3), crackFlip: +(crack / Math.max(1, n)).toFixed(3) };
}

/** Length-weighted crack-network match: the share of each framing's crack pixels that lie on an
 *  edge the other framing also draws as a crack (min of the two ways). Long cracks dominate, so a
 *  sub-pixel edge at the cap boundary barely counts; 1 = the same crack network. */
export function edgeMatch(a, b) {
  const share = (keys, set) => (keys.length ? keys.filter((k) => set.has(k)).length / keys.length : 1);
  return +Math.min(share(a.crackKeys, b.crackEdges), share(b.crackKeys, a.crackEdges)).toFixed(3);
}

export const jaccard = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; const u = a.size + b.size - i; return u ? +(i / u).toFixed(3) : 1; };

/** Sweep: distances (same pixel height) and pixel heights (same distance); rows vs the closest / tallest framing. */
export async function sweep(page, { biome = 'lava', seed = 11, size = 1, dists = [16, 12, 9, 7, 5, 4], pixelHs = [120, 180, 360, 480], capDeg = 28 } = {}) {
  const table = async (framings) => {
    const res = [];
    for (const f of framings) res.push({ ...f, ...analyse(await renderCap(page, { biome, seed, size, capDeg, ...f }), biome) });
    const ref = res[res.length - 1]; // the most detailed framing
    return res.map((r) => ({
      dist: r.dist, pixelH: r.pixelH, radiusPx: r.radiusPx, capPx: r.capPx, ground: r.ground, crack: r.crack, open: r.open,
      crackEdges: r.crackEdges.size, edgeJaccard: jaccard(r.crackEdges, ref.crackEdges), edgeMatch: edgeMatch(r, ref),
      poolCells: r.poolCells.size, poolJaccard: jaccard(r.poolCells, ref.poolCells), plates: r.plates, crackWorld: r.crackWorld, openMiss: r.openMiss,
      ...flips(r.samples, ref.samples),
    }));
  };
  return {
    zoom: await table(dists.map((dist) => ({ dist, pixelH: 180 }))),
    pixel: await table(pixelHs.map((pixelH) => ({ dist: 7, pixelH }))),
  };
}

if (process.argv[1]?.endsWith('repro-lava-zoom.mjs')) {
  const biome = process.argv[2] ?? 'lava', seed = +(process.argv[3] ?? 11);
  const { browser, page } = await openViewer();
  try {
    const { zoom, pixel } = await sweep(page, { biome, seed });
    console.log(`${biome} seed ${seed}: camera distance sweep at 180p (reference = closest)`);
    console.table(zoom);
    console.log(`${biome} seed ${seed}: pixel-height sweep at distance 7 (reference = 480p)`);
    console.table(pixel);
  } finally {
    await browser.close();
  }
}
