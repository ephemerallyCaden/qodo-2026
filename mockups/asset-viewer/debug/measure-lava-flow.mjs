// Probe: animated lava modes (LAVA_MODES) on the lava hero (planet view, seed 11, 180p).
// Per mode: glow-pixel shares (rim / orange / yellow, depth off, studio S/M/L x 4 phases), the
// share of glow pixels with no 4-neighbour of the same colour (1 px shimmer), the loop seam
// (last frame -> first vs the median consecutive-frame diff at 15 fps) and the frame cost.
// Usage: node debug/measure-lava-flow.mjs
import { openViewer } from './repro-hollow-clouds.mjs';

export const LAVA_GLOW = ['#c9361a', '#ff761a', '#ffc93c'];
const HERO = { view: 'planet', biome: 'lava', seed: 11, size: 1, ringMode: 'off', moons: true, depth: true, pixelH: 180, palette: 'final', spin: true, ui: false, artefacts: false, cover: null, period: 24, surfaceTurns: 2, cloudTurns: 3 };

export async function measureLava(page, lavaMode, { seamFrames = 12 } = {}) {
  return page.evaluate(({ lavaMode, HERO, LAVA_GLOW, seamFrames }) => {
    const glow = LAVA_GLOW.map((h) => parseInt(h.slice(1), 16));
    const read = () => {
      const src = document.getElementById('view');
      const c = Object.assign(document.createElement('canvas'), { width: src.width, height: src.height });
      const x = c.getContext('2d');
      x.drawImage(src, 0, 0);
      return { W: src.width, H: src.height, d: x.getImageData(0, 0, src.width, src.height).data };
    };
    const tot = [0, 0, 0];
    let iso = 0;
    for (const [seed, size] of [[11, 1], [12, 0.7], [58, 1.3]]) for (const time of [0, 3, 6, 9]) {
      window.viewer.set({ ...HERO, view: 'studio', seed, size, time, moons: false, depth: false, lavaMode });
      const { W, H, d } = read();
      const k = (i) => (d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2];
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x, j = glow.indexOf(k(i));
        if (j < 0) continue;
        tot[j]++;
        if (k(i - 1) !== k(i) && k(i + 1) !== k(i) && k(i - W) !== k(i) && k(i + W) !== k(i)) iso++;
      }
    }
    const g = tot.reduce((a, b) => a + b);
    // seam: consecutive 15 fps frames across the wrap, plus a run elsewhere for the typical diff
    const fps = 15, dt = 1 / fps, P = HERO.period;
    const frame = (t) => { window.viewer.set({ ...HERO, time: t, lavaMode }); return read().d; };
    const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++; return n; };
    const steps = [];
    for (let s = 0; s < seamFrames; s++) { const t = 6 + s * 1.7; steps.push(diff(frame(t), frame(t + dt))); }
    steps.sort((a, b) => a - b);
    const seam = diff(frame(P - dt), frame(0));
    // cost: ms per rendered frame (set pins the time and renders twice; readback forces completion)
    const t0 = performance.now();
    for (let s = 0; s < 10; s++) { window.viewer.set({ ...HERO, time: 2 + s * 0.13, lavaMode }); read(); }
    const ms = (performance.now() - t0) / 10;
    return { lavaMode, glowPx: g, rim: +(tot[0] / g).toFixed(3), orange: +(tot[1] / g).toFixed(3), yellow: +(tot[2] / g).toFixed(3), isolated: +(iso / g).toFixed(4), seam, medianStep: steps[steps.length >> 1], msPerSet: +ms.toFixed(1) };
  }, { lavaMode, HERO, LAVA_GLOW, seamFrames });
}

if (process.argv[1]?.endsWith('measure-lava-flow.mjs')) {
  const { browser, page } = await openViewer();
  const rows = [];
  for (const m of ['static', 'flow', 'full-warp']) rows.push(await measureLava(page, m));
  console.table(rows);
  await browser.close();
}
