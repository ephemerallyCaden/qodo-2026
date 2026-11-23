// visual-proof: the before → after GIF. Its palette keeps every colour exactly when there are at most
// 256 and the most common ones exactly when there are more; frames are stored as the rectangle that
// changed, undithered; decodeGif reads it back, so the skill can check the file it wrote.
import { describe, expect, it } from 'vitest';
import { buildPalette, decodeGif, GifWriter, quantise } from '../../.claude/skills/visual-proof/scripts/gif.js';
import { solid, type Image } from '../../.claude/skills/visual-proof/scripts/frames.js';

const px = (img: Image, x: number, y: number) => [...img.rgba.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3)];
const fill = (w: number, h: number, f: (x: number, y: number) => [number, number, number]): Image => {
  const img = solid(w, h, [0, 0, 0]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img.rgba.set([...f(x, y), 255], (y * w + x) * 4);
  return img;
};

describe('buildPalette', () => {
  it('keeps every colour exactly when a run has at most 256', () => {
    const a = fill(16, 8, (x, y) => [x * 16, y * 32, 7]);
    const b = fill(16, 8, (x) => [x * 16, 255, 7]);
    const pal = buildPalette([a, b]);
    expect(pal.length / 3).toBe(16 * 8 + 16);
    const q = quantise(a, pal);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) expect([...pal.subarray(q[y * 16 + x]! * 3, q[y * 16 + x]! * 3 + 3)]).toEqual(px(a, x, y));
  });

  it('over 256 colours: 256 entries, the most common colours exact, the rest nearest', () => {
    // 4 large flat colours plus 600 one-pixel shades
    const img = fill(100, 40, (x, y) => (y < 34 ? ([[13, 11, 22], [0, 188, 156], [200, 60, 40], [240, 240, 220]][Math.floor(x / 25)] as [number, number, number]) : [(x * 2) & 0xff, y * 4, (x * y) & 0xff]));
    const pal = buildPalette([img]);
    expect(pal.length).toBe(256 * 3);
    const entries = new Set(Array.from({ length: 256 }, (_, i) => [...pal.subarray(i * 3, i * 3 + 3)].join()));
    for (const c of ['13,11,22', '0,188,156', '200,60,40', '240,240,220']) expect(entries.has(c)).toBe(true);
    const q = quantise(img, pal);
    const back = [...pal.subarray(q[39 * 100 + 50]! * 3, q[39 * 100 + 50]! * 3 + 3)];
    const want = px(img, 50, 39);
    expect(Math.abs(back[0]! - want[0]!) + Math.abs(back[1]! - want[1]!) + Math.abs(back[2]! - want[2]!)).toBeLessThan(60);
  });

  it('is deterministic: the same frames give the same palette', () => {
    const img = fill(50, 50, (x, y) => [(x * 37) & 0xff, (y * 53) & 0xff, (x ^ y) & 0xff]);
    expect(Buffer.from(buildPalette([img])).equals(Buffer.from(buildPalette([img])))).toBe(true);
  });
});

describe('GifWriter and decodeGif', () => {
  it('round-trips frames that change in part, merges a repeated frame into the one before, and loops', () => {
    const w = 40, h = 30;
    // 64 colours and white: under 256, so the round trip is exact
    const base = (x: number, y: number): [number, number, number] => [(x % 8) * 30, (y % 8) * 30, 100];
    const f0 = fill(w, h, base);
    const f1 = fill(w, h, (x, y) => (x > 10 && x < 20 && y > 5 && y < 9 ? [255, 255, 255] : base(x, y)));
    const pal = buildPalette([f0, f1]);
    const g = new GifWriter(w, h, pal);
    g.add(quantise(f0, pal), 5);
    g.add(quantise(f1, pal), 5);
    g.add(quantise(f1, pal), 10); // no change: lengthens the frame before
    g.add(quantise(f0, pal), 5);
    const out = g.finish();
    expect(out.subarray(0, 6).toString('latin1')).toBe('GIF89a');
    expect(out.includes(Buffer.from('NETSCAPE2.0'))).toBe(true);
    const d = decodeGif(out);
    expect([d.width, d.height, d.frames.length]).toEqual([w, h, 3]);
    expect(d.frames.map((f) => f.delayCs)).toEqual([5, 15, 5]);
    expect(d.frames.map((f) => f.rect)).toEqual([{ x: 0, y: 0, w, h }, { x: 11, y: 6, w: 9, h: 3 }, { x: 11, y: 6, w: 9, h: 3 }]);
    for (const [i, src] of [[0, f0], [1, f1], [2, f0]] as const) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) expect(px(d.frames[i]!.image, x, y)).toEqual(px(src, x, y));
    }
  });

  it('keeps codes right past the 4096-entry table (a clear code mid-frame)', () => {
    const w = 200, h = 150;
    let s = 12345;
    const noise = fill(w, h, () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; const v = s >>> 24; return [v & 0xf0, (v << 4) & 0xf0, 64]; });
    const pal = buildPalette([noise]);
    const g = new GifWriter(w, h, pal);
    g.add(quantise(noise, pal), 4);
    const d = decodeGif(g.finish());
    for (let y = 0; y < h; y += 7) for (let x = 0; x < w; x += 3) expect(px(d.frames[0]!.image, x, y)).toEqual(px(noise, x, y));
  });

  it('refuses a palette over 256 colours and indices of the wrong size', () => {
    expect(() => new GifWriter(2, 2, new Uint8Array(257 * 3))).toThrow(/256/);
    expect(() => new GifWriter(2, 2, new Uint8Array(3)).add(new Uint8Array(3), 1)).toThrow(/4/);
  });
});
