// Probe: measures cloud cover as the share of the hero planet's visible disc that the
// weather (clouds, ash, spores) hides, as Planetarium was measured (~25-30%). Each frame
// renders two flat ID passes: the surface alone (the disc) and surface + puffs (what the
// weather covers). Puffs that bulge past the silhouette are counted separately.
// Usage: node debug/measure-cloud-cover.mjs [biome ...]   (default: lush ocean toxic lava)
import { openViewer } from './repro-hollow-clouds.mjs';

const BIOMES = process.argv.slice(2).length ? process.argv.slice(2) : ['lush', 'ocean', 'toxic', 'lava'];
const SEEDS = [7, 42, 311, 5, 23, 13, 11, 58];
const TIMES = [0, 1.5, 3, 4.5, 6, 7.5, 9, 10.5]; // 8 phases of the 12 s loop
const BASE = { view: 'studio', size: 1, ringMode: 'off', moons: false, halo: false, depth: false, pixelH: 360, palette: 'final', spin: true, ui: false, period: 12 };

export async function measureCover(page, opts) {
  return page.evaluate((o) => {
    const { THREE, planets, puffsOf, renderer, scene, camera } = window.__dbg;
    window.viewer.set(o);
    const p = planets[0];
    const puffs = puffsOf(p);
    const surface = puffs.parent.children.find((c) => c !== puffs);
    const hidden = [];
    p.group.traverse((c) => { if ((c.isMesh || c.isPoints) && c !== surface && c !== puffs && c.visible) { hidden.push(c); c.visible = false; } });
    const sky = scene.children.filter((c) => c !== p.group && c.visible);
    sky.forEach((c) => (c.visible = false));
    const [sm, pm] = [surface.material, puffs.material];
    surface.material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    puffs.material = new THREE.MeshBasicMaterial({ color: 0xff00ff });
    renderer.setClearColor(0x000000);
    const grab = () => {
      renderer.render(scene, camera);
      const src = renderer.domElement;
      const c = Object.assign(document.createElement('canvas'), { width: src.width, height: src.height });
      const x = c.getContext('2d');
      x.drawImage(src, 0, 0);
      return x.getImageData(0, 0, c.width, c.height).data;
    };
    const pv = puffs.visible;
    puffs.visible = false;
    const disc = grab();
    puffs.visible = pv;
    const both = grab();
    let d = 0, covered = 0, bulge = 0;
    for (let i = 0; i < disc.length; i += 4) {
      const inDisc = disc[i + 1] === 255 && disc[i] === 0;
      const cloud = both[i] === 255 && both[i + 2] === 255;
      if (inDisc) { d++; if (cloud) covered++; } else if (cloud) bulge++;
    }
    surface.material = sm;
    puffs.material = pm;
    hidden.forEach((c) => (c.visible = true));
    sky.forEach((c) => (c.visible = true));
    window.viewer.set({}); // restore the clear colour and redraw
    return { cover: covered / Math.max(1, d), bulge: bulge / Math.max(1, d), puffs: puffs.count };
  }, { ...BASE, ...opts });
}

if (process.argv[1]?.endsWith('measure-cloud-cover.mjs')) {
  const { browser, page } = await openViewer();
  const rows = [];
  for (const biome of BIOMES) {
    const per = [];
    for (const seed of SEEDS) {
      let cover = 0, bulge = 0, puffs = 0;
      for (const time of TIMES) {
        const r = await measureCover(page, { biome, seed, time });
        cover += r.cover / TIMES.length; bulge += r.bulge / TIMES.length; puffs = r.puffs;
      }
      per.push({ seed, cover, bulge, puffs });
    }
    const covers = per.map((r) => r.cover);
    rows.push({
      biome,
      meanCover: `${(covers.reduce((a, b) => a + b, 0) / covers.length * 100).toFixed(1)}%`,
      min: `${(Math.min(...covers) * 100).toFixed(1)}%`,
      max: `${(Math.max(...covers) * 100).toFixed(1)}%`,
      bulge: `${(per.reduce((a, r) => a + r.bulge, 0) / per.length * 100).toFixed(1)}%`,
      puffs: Math.round(per.reduce((a, r) => a + r.puffs, 0) / per.length),
      perSeed: per.map((r) => `${r.seed}:${(r.cover * 100).toFixed(0)}`).join(' '),
    });
  }
  console.table(rows);
  await browser.close();
}
