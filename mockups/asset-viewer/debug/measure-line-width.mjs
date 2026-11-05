// Probe: width of lava fissures and ice crevasses, and the area mix, at 180p (studio view,
// depth off). Pixels are classified by the planet shader's regions debug view (ground blue,
// crack red, open plate green: lava pools / ice water), so open plates never count as lines.
// On layered lava (the default) a crack is the gap between two crust plates, so this measures the gap.
// Width at a crack pixel = min(horizontal run, vertical run) through it; reports the median,
// the share of isolated pixels (no 4-neighbour on the line), and the shares of the classified
// surface (pixels not covered by ash or haze) that are ground, crack and open.
// dist moves the camera along the studio direction (default: the studio framing, distance 7), so the
// planet's projected radius sweeps with size x distance (radiusPx in the result).
// Usage: node debug/measure-line-width.mjs
import { openViewer } from './repro-hollow-clouds.mjs';

export const LINE_SET = [['lava', 11, 1.0], ['lava', 12, 0.7], ['lava', 58, 1.3], ['ice', 8, 0.7], ['ice', 19, 1.0], ['ice', 77, 1.3]];

export async function measureLines(page, biome, seed, size, { time = 3, dist = null } = {}) {
  return page.evaluate(({ biome, seed, size, time, dist }) => {
    const { cameraAt, planets, VIEWS } = window.__dbg;
    window.viewer.set({ view: 'studio', biome, seed, size, time, ringMode: 'off', moons: false, depth: false, pixelH: 180, palette: 'final', spin: true, ui: false, artefacts: false, lavaMode: 'layered', lavaTime: null, regions: true, camera: dist ? cameraAt('studio', dist) : VIEWS.studio });
    const src = document.getElementById('view');
    const W = src.width, H = src.height;
    const radiusPx = window.__dbg.radiusPx(planets[0].group); // group: unit sphere at the planet's scale
    const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    window.viewer.set({ regions: false });
    const d = x.getImageData(0, 0, W, H).data;
    const hex = (i) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    const line = new Uint8Array(W * H);
    let ground = 0, open = 0;
    for (let i = 0; i < W * H; i++) {
      const k = hex(i * 4);
      if (k === 0xff0000) line[i] = 1;
      else if (k === 0x00ff00) open++;
      else if (k === 0x0000ff) ground++;
    }
    const widths = [];
    let isolated = 0, n = 0;
    for (let y = 0; y < H; y++) for (let x0 = 0; x0 < W; x0++) {
      const i = y * W + x0;
      if (!line[i]) continue;
      n++;
      let l = x0, r = x0, u = y, b = y;
      while (l > 0 && line[y * W + l - 1]) l--;
      while (r < W - 1 && line[y * W + r + 1]) r++;
      while (u > 0 && line[(u - 1) * W + x0]) u--;
      while (b < H - 1 && line[(b + 1) * W + x0]) b++;
      widths.push(Math.min(r - l + 1, b - u + 1));
      if (r === l && b === u) isolated++;
    }
    widths.sort((a, b) => a - b);
    const surf = Math.max(1, ground + open + n);
    const share = (v) => +(v / surf).toFixed(3);
    return { biome, seed, size, radiusPx, linePx: n, median: widths.length ? widths[widths.length >> 1] : 0, p75: widths.length ? widths[Math.floor(widths.length * 0.75)] : 0, isolated: +(isolated / Math.max(1, n)).toFixed(3), ground: share(ground), crack: share(n), open: share(open) };
  }, { biome, seed, size, time, dist });
}

if (process.argv[1]?.endsWith('measure-line-width.mjs')) {
  const { browser, page } = await openViewer();
  const rows = [];
  for (const [biome, seed, size] of LINE_SET) rows.push(await measureLines(page, biome, seed, size));
  console.table(rows);
  await browser.close();
}
