// Minimal PNG decoder for the checker: 8-bit RGB or RGBA, non-interlaced (what Chromium's
// canvas and screenshots write). Anything else is rejected rather than guessed at.
import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 2: 3, 6: 4 }; // colour type -> bytes per pixel at bit depth 8

/** PNG bytes -> { width, height, rgba: Uint8Array } (alpha is 255 for RGB input). */
export function decodePng(buf) {
  if (buf.length < SIGNATURE.length || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let off = 8, ihdr = null;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (data.length !== len) throw new Error(`truncated ${type} chunk`);
    if (type === 'IHDR') ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], colour: data[9], interlace: data[12] };
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (!ihdr) throw new Error('missing IHDR');
  const { width, height, depth, colour, interlace } = ihdr;
  const bpp = CHANNELS[colour];
  if (depth !== 8 || !bpp || interlace !== 0) throw new Error(`unsupported PNG (bit depth ${depth}, colour type ${colour}, interlace ${interlace})`);
  if (!width || !height) return { width, height, rgba: new Uint8Array(0) };
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  if (raw.length < height * (stride + 1)) throw new Error('truncated image data');
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[row + i - bpp] : 0;
      const b = y ? px[row - stride + i] : 0;
      const c = i >= bpp && y ? px[row - stride + i - bpp] : 0;
      let v = src[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`bad filter ${filter} on row ${y}`);
      px[row + i] = v & 255;
    }
  }
  if (bpp === 4) return { width, height, rgba: px };
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < px.length; i += 3, j += 4) { rgba[j] = px[i]; rgba[j + 1] = px[i + 1]; rgba[j + 2] = px[i + 2]; rgba[j + 3] = 255; }
  return { width, height, rgba };
}
