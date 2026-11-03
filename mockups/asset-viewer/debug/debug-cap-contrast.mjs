// Probe: measures colour contrast across cloud edges. Renders each orbit frame twice
// (prod colours, then an ID pass: clouds green, cap magenta, other surface untouched)
// and, for every cloud pixel 4-adjacent to a non-cloud planet pixel, records the
// luminance difference to that neighbour, split by whether the neighbour is cap or not.
import { openViewer } from './repro-hollow-clouds.mjs';
const D = Math.hypot(1.3, 0.75, 3.9);
const pos = (az, el, d = D) => { const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180; return [d * Math.cos(e) * Math.sin(a), d * Math.sin(e), d * Math.cos(e) * Math.cos(a)]; };
export const FRAMES = { 'az90-el45': pos(90, 45), 'az18-el80': pos(18, 80), 'az40-el55-close': pos(40, 55, 2.2), 'az18-el10': pos(18, 10) };
export async function measure(page, camera) {
  return page.evaluate((camera) => {
    const { scene, renderer, planets } = window.__dbg;
    const hero = planets[0], surface = hero.group.children[0];
    const puffs = hero.group.children.find((c) => c.children?.[0]?.isInstancedMesh).children[0];
    const grab = () => {
      const src = document.getElementById('view');
      const c = Object.assign(document.createElement('canvas'), { width: src.width, height: src.height });
      const x = c.getContext('2d'); x.drawImage(src, 0, 0);
      return { w: c.width, h: c.height, d: x.getImageData(0, 0, c.width, c.height).data };
    };
    const opts = { view: 'planet', seed: 7, biome: 'lush', ringMode: 'off', pixelH: 180, depth: false, spin: true, time: 3, ui: false, palette: 'final', camera };
    window.viewer.set(opts);
    const prod = grab();
    // ID pass
    const capSave = surface.material.uniforms.uC.value.map((c) => c.clone());
    const cloudSave = puffs.material.uniforms.uRamp.value.map((c) => c.clone());
    surface.material.uniforms.uC.value.forEach((c) => c.setRGB(1, 0, 1));
    puffs.material.uniforms.uRamp.value.forEach((c) => c.setRGB(0, 1, 0));
    renderer.render(scene, window.__dbg.camera);
    const id = grab();
    capSave.forEach((c, i) => surface.material.uniforms.uC.value[i].copy(c));
    cloudSave.forEach((c, i) => puffs.material.uniforms.uRamp.value[i].copy(c));
    renderer.render(scene, window.__dbg.camera);
    const at = (img, i) => [img.d[i], img.d[i + 1], img.d[i + 2]];
    const isCloud = (i) => id.d[i] === 0 && id.d[i + 1] === 255 && id.d[i + 2] === 0;
    const isCap = (i) => id.d[i] > 60 && id.d[i + 1] === 0 && id.d[i] === id.d[i + 2]; // magenta, possibly scaled
    const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const out = { cap: [], other: [] };
    const { w, h } = prod;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      if (!isCloud(i)) continue;
      for (const j of [i - 4, i + 4, i - w * 4, i + w * 4]) {
        if (isCloud(j)) continue;
        const pc = at(prod, i), pn = at(prod, j);
        if (pn[0] + pn[1] + pn[2] < 40) continue; // space
        (isCap(j) ? out.cap : out.other).push({ dL: Math.abs(lum(pc) - lum(pn)), dRGB: dist(pc, pn) });
      }
    }
    const summ = (a) => {
      if (!a.length) return { n: 0 };
      const s = a.map((v) => v.dRGB).sort((p, q) => p - q);
      return { n: a.length, medianDRGB: Math.round(s[s.length >> 1]), lowContrastFrac: +(a.filter((v) => v.dRGB < 60).length / a.length).toFixed(3) };
    };
    return { cap: summ(out.cap), other: summ(out.other) };
  }, camera);
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { browser, page } = await openViewer();
  for (const [name, p] of Object.entries(FRAMES)) console.log(name, JSON.stringify(await measure(page, { pos: p, target: [0, 0, 0] })));
  await browser.close();
}
