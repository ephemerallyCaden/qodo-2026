// Minimal PNG for render goldens: 8-bit RGBA, not interlaced, filter 0 on every row. The encoder
// writes only that, and the decoder accepts only that, so a golden re-saved by another tool fails
// loudly instead of being half-read. Pixels are what's compared, never the PNG bytes.
import { crc32, deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  if (rgba.length !== width * height * 4) throw new Error(`rgba has ${rgba.length} bytes, expected ${width * height * 4}`);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // bit depth 8, colour type 6 (RGBA), deflate, filter method 0, no interlace
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

export function decodePng(png: Buffer): { width: number; height: number; rgba: Uint8Array } {
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let at = 8;
  let ihdr: Buffer | undefined;
  const idat: Buffer[] = [];
  for (;;) {
    if (at + 12 > png.length) throw new Error('PNG ends before IEND');
    const len = png.readUInt32BE(at);
    const type = png.toString('latin1', at + 4, at + 8);
    const data = png.subarray(at + 8, at + 8 + len);
    if (crc32(png.subarray(at + 4, at + 8 + len)) !== png.readUInt32BE(at + 8 + len)) throw new Error(`PNG ${type} chunk has a bad CRC`);
    at += 12 + len;
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  if (!ihdr) throw new Error('PNG has no IHDR');
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4);
  if (!ihdr.subarray(8).equals(Buffer.from([8, 6, 0, 0, 0]))) throw new Error('only 8-bit RGBA, non-interlaced PNGs are supported');
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  if (raw.length !== (stride + 1) * height) throw new Error(`PNG image data is ${raw.length} bytes, expected ${(stride + 1) * height}`);
  const rgba = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    if (raw[row] !== 0) throw new Error(`PNG row ${y} uses filter ${raw[row]}; only filter 0 is supported`);
    rgba.set(raw.subarray(row + 1, row + 1 + stride), y * stride);
  }
  return { width, height, rgba };
}
