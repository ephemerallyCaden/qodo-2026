// Probe: animated lava modes (LAVA_MODES) on the lava hero (planet view, seed 11, 180p).
// Per mode: glow-pixel shares (rim / orange / yellow, depth off, studio S/M/L x 4 phases), the
// share of glow pixels with no 4-neighbour of the same colour (1 px shimmer), the loop seam
// (last frame -> first vs the median consecutive-frame diff at 15 fps) and the frame cost.
// lavaTime pins the molten field to a loop time (layered at lavaTime 0 is the still reference).
// measureLayers(): with the planet held still (spin off) and only the molten field running over the
// loop, how many crack-gap and pool pixels change colour, and how many plate pixels do (must be none).
// Usage: node debug/measure-lava-flow.mjs
import { openViewer } from './repro-hollow-clouds.mjs';

export const LAVA_GLOW = ['#c9361a', '#ff761a', '#ffc93c'];
const HERO = { view: 'planet', biome: 'lava', seed: 11, size: 1, ringMode: 'off', moons: true, depth: true, pixelH: 180, palette: 'final', spin: true, ui: false, artefacts: false, cover: null, period: 24, surfaceTurns: 2, cloudTurns: 3, regions: false, lavaTime: null };
// seamFrames: 0 = glow shares only (no seam or cost); cost: time 10 frames (the CLI; the test skips it).
export async function measureLava(page, lavaMode, { seamFrames = 12, lavaTime = null, cost = true } = {}) {
  return page.evaluate(({ lavaMode, lavaTime, HERO, LAVA_GLOW, seamFrames, cost }) => {
    const glow = LAVA_GLOW.map((h) => parseInt(h.slice(1), 16));
    const read = window.__dbg.readView;
    const tot = [0, 0, 0];
    let iso = 0;
    for (const [seed, size] of [[11, 1], [12, 0.7], [58, 1.3]]) for (const time of [0, 3, 6, 9]) {
      window.viewer.set({ ...HERO, view: 'studio', seed, size, time, moons: false, depth: false, lavaMode, lavaTime });
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
    const shares = { lavaMode, lavaTime, glowPx: g, rim: +(tot[0] / g).toFixed(3), orange: +(tot[1] / g).toFixed(3), yellow: +(tot[2] / g).toFixed(3), isolated: +(iso / g).toFixed(4) };
    if (!seamFrames) return shares; // shares only (e.g. the frozen reference)
    // seam: consecutive 15 fps frames across the wrap, plus a run elsewhere for the typical diff
    const fps = 15, dt = 1 / fps, P = HERO.period;
    const frame = (t) => { window.viewer.set({ ...HERO, time: t, lavaMode, lavaTime }); return read().d; };
    const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++; return n; };
    const steps = [];
    for (let s = 0; s < seamFrames; s++) { const t = 6 + s * 1.7; steps.push(diff(frame(t), frame(t + dt))); }
    steps.sort((a, b) => a - b);
    const seam = diff(frame(P - dt), frame(0));
    if (!cost) return { ...shares, seam, medianStep: steps[steps.length >> 1] };
    // cost: ms per rendered frame (set pins the time and renders twice; readback forces completion)
    const t0 = performance.now();
    for (let s = 0; s < 10; s++) { window.viewer.set({ ...HERO, time: 2 + s * 0.13, lavaMode, lavaTime }); read(); }
    const ms = (performance.now() - t0) / 10;
    return { ...shares, seam, medianStep: steps[steps.length >> 1], msPerSet: +ms.toFixed(1) };
  }, { lavaMode, lavaTime, HERO, LAVA_GLOW, seamFrames, cost });
}

// Layered lava with the planet still: the regions view classifies plate / gap / pool pixels once,
// then the molten field runs through `steps` loop times. Per class: the share of its pixels that
// change colour between any two of those frames. Plates (and the static lip) must not change.
export async function measureLayers(page, { seed = 11, size = 1, steps = 8 } = {}) {
  return page.evaluate(({ seed, size, steps, HERO }) => {
    const read = window.__dbg.readView;
    const base = { ...HERO, view: 'studio', seed, size, time: 3, spin: false, moons: false, depth: false, lavaMode: 'layered' };
    window.viewer.set({ ...base, regions: true, lavaTime: 0 });
    const { W, H, d: reg } = read();
    const cls = new Int8Array(W * H).fill(-1); // 0 plate, 1 gap, 2 pool (ash / haze / space: -1)
    for (let i = 0; i < W * H; i++) {
      const k = (reg[i * 4] << 16) | (reg[i * 4 + 1] << 8) | reg[i * 4 + 2];
      cls[i] = k === 0x0000ff ? 0 : k === 0xff0000 ? 1 : k === 0x00ff00 ? 2 : -1;
    }
    const frames = [];
    for (let s = 0; s < steps; s++) { window.viewer.set({ ...base, regions: false, lavaTime: (s * HERO.period) / steps }); frames.push(read().d); }
    const n = [0, 0, 0], moved = [0, 0, 0];
    for (let i = 0; i < W * H; i++) {
      if (cls[i] < 0) continue;
      n[cls[i]]++;
      const o = i * 4;
      if (frames.some((f) => f[o] !== frames[0][o] || f[o + 1] !== frames[0][o + 1] || f[o + 2] !== frames[0][o + 2])) moved[cls[i]]++;
    }
    const share = (c) => +(moved[c] / Math.max(1, n[c])).toFixed(3);
    return { seed, size, platePx: n[0], gapPx: n[1], poolPx: n[2], plateMoved: moved[0], gapMoved: share(1), poolMoved: share(2) };
  }, { seed, size, steps, HERO });
}

if (process.argv[1]?.endsWith('measure-lava-flow.mjs')) {
  const { browser, page } = await openViewer();
  const rows = [];
  rows.push(await measureLava(page, 'layered', { lavaTime: 0 }));
  for (const m of ['layered', 'static-painted', 'full-warp']) rows.push(await measureLava(page, m));
  console.table(rows);
  const layers = [];
  for (const [seed, size] of [[11, 1], [12, 0.7], [58, 1.3]]) layers.push(await measureLayers(page, { seed, size }));
  console.table(layers);
  await browser.close();
}
