// visual-proof (.claude/skills/visual-proof): its PNG reader takes what Chromium's screenshots are,
// 8-bit RGB or RGBA with any of the five row filters, which test/render/png.ts (goldens only) refuses.
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readPng } from '../../.claude/skills/visual-proof/scripts/png.js';
import { chunk, encodePng } from '../render/png.js';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** A PNG of `raw` pixels (`channels` 3 or 4 bytes each), row y filtered with `filters[y % filters.length]`, as an encoder would. */
function filteredPng(width: number, height: number, channels: 3 | 4, raw: Uint8Array, filters: number[], ihdrTail = [0, 0, 0]): Buffer {
  const stride = width * channels;
  const out = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const f = filters[y % filters.length]!;
    out[y * (stride + 1)] = f;
    for (let x = 0; x < stride; x++) {
      const cur = raw[y * stride + x]!;
      const a = x >= channels ? raw[y * stride + x - channels]! : 0;
      const b = y > 0 ? raw[(y - 1) * stride + x]! : 0;
      const c = x >= channels && y > 0 ? raw[(y - 1) * stride + x - channels]! : 0;
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
      out[y * (stride + 1) + 1 + x] = (cur - pred) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, channels === 3 ? 2 : 6, ...ihdrTail], 8);
  // Two IDAT chunks: a decoder must join them.
  const z = deflateSync(out);
  const cut = z.length >> 1;
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', z.subarray(0, cut)), chunk('IDAT', z.subarray(cut)), chunk('IEND', Buffer.alloc(0))]);
}

/** Bytes that make every filter's arithmetic wrap somewhere. */
const noise = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 97 + ((i * i) >> 3)) & 0xff);

describe('readPng', () => {
  it('reads RGB rows under each of the five filters, as RGBA with alpha 255', () => {
    const w = 7, h = 10, rgb = noise(w * h * 3);
    const img = readPng(filteredPng(w, h, 3, rgb, [0, 1, 2, 3, 4]));
    expect([img.width, img.height]).toEqual([w, h]);
    for (let p = 0; p < w * h; p++) {
      expect([...img.rgba.subarray(p * 4, p * 4 + 4)]).toEqual([rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2], 255]);
    }
  });

  it('reads RGBA rows under each filter, alpha kept', () => {
    const w = 5, h = 6, rgba = noise(w * h * 4);
    expect([...readPng(filteredPng(w, h, 4, rgba, [4, 3, 2, 1, 0])).rgba]).toEqual([...rgba]);
  });

  it("reads the goldens' own format (test/render/png.ts encodePng)", () => {
    const rgba = noise(3 * 2 * 4);
    expect([...readPng(encodePng(3, 2, rgba)).rgba]).toEqual([...rgba]);
  });

  it('refuses what it would half-read: interlaced, palette, 16-bit, a bad filter byte, a bad CRC, a cut-off file', () => {
    const good = filteredPng(2, 2, 3, noise(12), [1]);
    expect(() => readPng(filteredPng(2, 2, 3, noise(12), [1], [0, 0, 1]))).toThrow(/interlaced/);
    const palette = Buffer.from(good); palette[8 + 8 + 9] = 3; // IHDR colour type
    expect(() => readPng(palette)).toThrow(/CRC|colour type/);
    expect(() => readPng(filteredPng(2, 2, 3, noise(12), [5]))).toThrow(/filter 5/);
    const crc = Buffer.from(good); crc[crc.length - 13] = crc[crc.length - 13]! ^ 1; // the second IDAT's CRC
    expect(() => readPng(crc)).toThrow(/CRC|ends|bytes/);
    expect(() => readPng(good.subarray(0, good.length - 12))).toThrow(/IEND/);
    expect(() => readPng(Buffer.from('not a png at all'))).toThrow(/not a PNG/);
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr.set([16, 2, 0, 0, 0], 8);
    expect(() => readPng(Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.alloc(7))), chunk('IEND', Buffer.alloc(0))]))).toThrow(/8-bit/);
  });
});
