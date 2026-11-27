// visual-proof: reads the PNGs Chromium's screenshots are, 8-bit RGB or RGBA, not interlaced, with any
// of the five row filters (test/render/png.ts takes only the goldens' own RGBA, filter 0). Anything else
// throws rather than being half-read. Writing goes through test/render/png.ts encodePng.
import { crc32, inflateSync } from 'node:zlib';

export interface Image { width: number; height: number; rgba: Uint8Array }

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

export function readPng(png: Buffer): Image {
  if (png.length < 8 || !png.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let at = 8;
  let ihdr: Buffer | undefined;
  const idat: Buffer[] = [];
  for (;;) {
    if (at + 12 > png.length) throw new Error('PNG ends before IEND');
    const len = png.readUInt32BE(at);
    if (at + 12 + len > png.length) throw new Error('PNG ends inside a chunk, before IEND');
    const type = png.toString('latin1', at + 4, at + 8);
    if (crc32(png.subarray(at + 4, at + 8 + len)) !== png.readUInt32BE(at + 8 + len)) throw new Error(`PNG ${type} chunk has a bad CRC`);
    const data = png.subarray(at + 8, at + 8 + len);
    at += 12 + len;
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  if (!ihdr || ihdr.length !== 13) throw new Error('PNG has no IHDR');
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4);
  const [depth, colour, compression, filter, interlace] = [ihdr[8], ihdr[9], ihdr[10], ihdr[11], ihdr[12]];
  if (depth !== 8) throw new Error(`only 8-bit PNGs are read, not ${depth}-bit`);
  if (colour !== 2 && colour !== 6) throw new Error(`only RGB (colour type 2) and RGBA (6) PNGs are read, not colour type ${colour}`);
  if (compression !== 0 || filter !== 0) throw new Error('PNG uses an unknown compression or filter method');
  if (interlace !== 0) throw new Error('interlaced PNGs are not read');
  const bpp = colour === 2 ? 3 : 4;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== (stride + 1) * height) throw new Error(`PNG image data is ${raw.length} bytes, expected ${(stride + 1) * height}`);
  const cur = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1, row = y * stride, up = row - stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[src + x]!;
      const a = x >= bpp ? cur[row + x - bpp]! : 0;
      const b = y > 0 ? cur[up + x]! : 0;
      let pred: number;
      if (f === 0) pred = 0;
      else if (f === 1) pred = a;
      else if (f === 2) pred = b;
      else if (f === 3) pred = (a + b) >> 1;
      else if (f === 4) pred = paeth(a, b, x >= bpp && y > 0 ? cur[up + x - bpp]! : 0);
      else throw new Error(`PNG row ${y} uses filter ${f}; only 0-4 exist`);
      cur[row + x] = (v + pred) & 0xff;
    }
  }
  if (bpp === 4) return { width, height, rgba: cur };
  const rgba = new Uint8Array(width * height * 4);
  for (let p = 0, q = 0; p < width * height; p++, q += 3) {
    rgba[p * 4] = cur[q]!;
    rgba[p * 4 + 1] = cur[q + 1]!;
    rgba[p * 4 + 2] = cur[q + 2]!;
    rgba[p * 4 + 3] = 255;
  }
  return { width, height, rgba };
}
