// visual-proof: a GIF89a writer and reader, so the skill needs no image tool. One 256-colour palette for
// the whole GIF: every colour when there are at most 256, else the 224 most common exactly (the view's
// palette colours and the panels' flat fills) and a median cut of the rest (anti-aliased panel text).
// Each pixel takes its nearest entry, undithered (AGENTS.md Rule 4's spirit: no dither on pixel art).
// A frame is stored as the rectangle that changed since the one before; a repeat lengthens the one before.
import type { Image } from './png.js';

const EXACT = 224;
const SIZE = 256;

/** Counts colours over any number of frames, then picks the palette. */
export class PaletteBuilder {
  private counts = new Uint32Array(1 << 24);
  private seen: number[] = [];
  add(img: Image): void {
    const { rgba } = img;
    for (let i = 0; i < rgba.length; i += 4) {
      const c = (rgba[i]! << 16) | (rgba[i + 1]! << 8) | rgba[i + 2]!;
      if (this.counts[c] === 0) this.seen.push(c);
      this.counts[c]!++;
    }
  }
  /** RGB triples, at most 256 entries; the same frames always give the same palette. */
  palette(): Uint8Array {
    const byCount = [...this.seen].sort((a, b) => this.counts[b]! - this.counts[a]! || a - b);
    const chosen = byCount.length <= SIZE ? byCount : [...byCount.slice(0, EXACT), ...medianCut(byCount.slice(EXACT), this.counts, SIZE - EXACT)];
    const unique = [...new Set(chosen)];
    const out = new Uint8Array(unique.length * 3);
    unique.forEach((c, i) => out.set([c >> 16, (c >> 8) & 0xff, c & 0xff], i * 3));
    return out;
  }
}

export function buildPalette(frames: readonly Image[]): Uint8Array {
  const b = new PaletteBuilder();
  for (const f of frames) b.add(f);
  return b.palette();
}

const channel = (c: number, k: number) => (c >> (16 - 8 * k)) & 0xff;

/** `n` colours for `colours` (count-weighted): split the box with the most pixels × widest range at its weighted median, then average each box. */
function medianCut(colours: number[], counts: Uint32Array, n: number): number[] {
  interface Bin { cs: number[]; px: number }
  const weight = (cs: number[]) => cs.reduce((s, c) => s + counts[c]!, 0);
  const range = (cs: number[]) => {
    let best = 0, k = 0;
    for (let ch = 0; ch < 3; ch++) {
      let lo = 255, hi = 0;
      for (const c of cs) { const v = channel(c, ch); if (v < lo) lo = v; if (v > hi) hi = v; }
      if (hi - lo > best) { best = hi - lo; k = ch; }
    }
    return { span: best, k };
  };
  const bins: Bin[] = [{ cs: colours, px: weight(colours) }];
  while (bins.length < n) {
    let pick = -1, score = 0;
    bins.forEach((b, i) => { if (b.cs.length < 2) return; const s = b.px * (range(b.cs).span + 1); if (s > score) { score = s; pick = i; } });
    if (pick < 0) break;
    const b = bins[pick]!;
    const { k } = range(b.cs);
    const cs = [...b.cs].sort((x, y) => channel(x, k) - channel(y, k) || x - y);
    let acc = 0, cut = 1;
    for (let i = 0; i < cs.length - 1; i++) { acc += counts[cs[i]!]!; if (acc * 2 >= b.px) { cut = i + 1; break; } cut = i + 1; }
    const lo = cs.slice(0, cut), hi = cs.slice(cut);
    bins.splice(pick, 1, { cs: lo, px: weight(lo) }, { cs: hi, px: weight(hi) });
  }
  return bins.map((b) => {
    const sum = [0, 0, 0];
    for (const c of b.cs) for (let ch = 0; ch < 3; ch++) sum[ch]! += channel(c, ch) * counts[c]!;
    const [r, g, bl] = sum.map((s) => Math.round(s / b.px)) as [number, number, number];
    return (r << 16) | (g << 8) | bl;
  });
}

/** Maps pixels to their nearest palette entry (squared RGB distance; the first of equals), with a cache per colour. */
export class Quantiser {
  private cache = new Int16Array(1 << 24).fill(-1);
  constructor(private readonly pal: Uint8Array) {
    if (pal.length === 0 || pal.length % 3 || pal.length > SIZE * 3) throw new Error(`a GIF palette has 1-256 colours, not ${pal.length / 3}`);
  }
  map(img: Image): Uint8Array {
    const out = new Uint8Array(img.width * img.height);
    const { rgba } = img, pal = this.pal;
    for (let p = 0, i = 0; p < out.length; p++, i += 4) {
      const c = (rgba[i]! << 16) | (rgba[i + 1]! << 8) | rgba[i + 2]!;
      let q = this.cache[c]!;
      if (q < 0) {
        let best = Infinity;
        for (let e = 0; e < pal.length / 3; e++) {
          const dr = pal[e * 3]! - rgba[i]!, dg = pal[e * 3 + 1]! - rgba[i + 1]!, db = pal[e * 3 + 2]! - rgba[i + 2]!;
          const d = dr * dr + dg * dg + db * db;
          if (d < best) { best = d; q = e; if (d === 0) break; }
        }
        this.cache[c] = q;
      }
      out[p] = q;
    }
    return out;
  }
}

export const quantise = (img: Image, pal: Uint8Array): Uint8Array => new Quantiser(pal).map(img);

/** The LZW table, (prefix code, byte) → code, shared by every frame: an entry counts only under the current generation. */
const codes = new Int32Array(4096 << 8), stamp = new Int32Array(4096 << 8);
let gen = 0;

/** GIF's LZW: codes LSB-first, 9 to 12 bits, a clear code when the table is full. */
function lzw(indices: Uint8Array, minSize: number): Uint8Array {
  const clear = 1 << minSize, eoi = clear + 1;
  let size = minSize + 1, next = eoi + 1;
  gen++;
  const bytes: number[] = [];
  let acc = 0, bits = 0;
  const emit = (code: number) => {
    acc |= code << bits;
    bits += size;
    while (bits >= 8) { bytes.push(acc & 0xff); acc >>>= 8; bits -= 8; }
  };
  emit(clear);
  let cur = indices[0]!;
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]!, key = (cur << 8) | k;
    if (stamp[key] === gen) { cur = codes[key]!; continue; }
    emit(cur);
    if (next === 4096) {
      emit(clear);
      gen++;
      next = eoi + 1;
      size = minSize + 1;
    } else {
      if (next >= 1 << size) size++;
      codes[key] = next++;
      stamp[key] = gen;
    }
    cur = k;
  }
  emit(cur);
  emit(eoi);
  if (bits > 0) bytes.push(acc & 0xff);
  return Uint8Array.from(bytes);
}

const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];

export interface GifRect { x: number; y: number; w: number; h: number }

/** Writes a looping GIF frame by frame; finish() returns the file. */
export class GifWriter {
  private parts: Uint8Array[] = [];
  private prev: Uint8Array | null = null;
  private pending: { rect: GifRect; data: Uint8Array; delay: number } | null = null;
  constructor(private readonly width: number, private readonly height: number, palette: Uint8Array) {
    if (palette.length === 0 || palette.length % 3 || palette.length > SIZE * 3) throw new Error(`a GIF palette has 1-256 colours, not ${palette.length / 3}`);
    const table = new Uint8Array(SIZE * 3);
    table.set(palette);
    this.parts.push(Buffer.from('GIF89a', 'latin1'), Uint8Array.from([...u16(width), ...u16(height), 0xf7, 0, 0]), table,
      // NETSCAPE2.0: loop forever
      Uint8Array.from([0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0', 'latin1'), 0x03, 0x01, 0x00, 0x00, 0x00]));
  }

  /** One frame of palette indices (width × height), shown for `delayCs` hundredths of a second. */
  add(indices: Uint8Array, delayCs: number): void {
    if (indices.length !== this.width * this.height) throw new Error(`a frame has ${this.width * this.height} indices, not ${indices.length}`);
    const rect = this.prev ? changed(this.prev, indices, this.width, this.height) : { x: 0, y: 0, w: this.width, h: this.height };
    if (!rect) { if (this.pending) this.pending.delay += delayCs; return; }
    this.flush();
    const data = new Uint8Array(rect.w * rect.h);
    for (let y = 0; y < rect.h; y++) data.set(indices.subarray((rect.y + y) * this.width + rect.x, (rect.y + y) * this.width + rect.x + rect.w), y * rect.w);
    this.pending = { rect, data, delay: delayCs };
    this.prev = Uint8Array.from(indices);
  }

  private flush(): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    // Graphic control: disposal 1 (keep the frame), no transparency, the delay.
    this.parts.push(Uint8Array.from([0x21, 0xf9, 0x04, 0x04, ...u16(Math.min(0xffff, p.delay)), 0, 0]));
    this.parts.push(Uint8Array.from([0x2c, ...u16(p.rect.x), ...u16(p.rect.y), ...u16(p.rect.w), ...u16(p.rect.h), 0, 8]));
    const z = lzw(p.data, 8);
    for (let i = 0; i < z.length; i += 255) {
      const block = z.subarray(i, i + 255);
      this.parts.push(Uint8Array.from([block.length]), block);
    }
    this.parts.push(Uint8Array.from([0]));
  }

  finish(): Buffer {
    this.flush();
    this.parts.push(Uint8Array.from([0x3b]));
    return Buffer.concat(this.parts);
  }
}

function changed(a: Uint8Array, b: Uint8Array, w: number, h: number): GifRect | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (a[y * w + x] === b[y * w + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export interface GifFrame { delayCs: number; rect: GifRect; image: Image }

/** Reads a GIF back, every frame composited (disposal "keep"), to check the file the skill wrote. */
export function decodeGif(buf: Buffer): { width: number; height: number; frames: GifFrame[] } {
  const sig = buf.toString('latin1', 0, 6);
  if (sig !== 'GIF89a' && sig !== 'GIF87a') throw new Error('not a GIF');
  const width = buf.readUInt16LE(6), height = buf.readUInt16LE(8), packed = buf[10]!;
  let at = 13;
  let global: Uint8Array | null = null;
  if (packed & 0x80) { const n = 3 << ((packed & 7) + 1); global = buf.subarray(at, at + n); at += n; }
  const canvas = new Uint8Array(width * height * 4);
  const frames: GifFrame[] = [];
  let delay = 0;
  const blocks = () => {
    const out: Buffer[] = [];
    for (;;) { const n = buf[at++]!; if (n === 0) return Buffer.concat(out); out.push(buf.subarray(at, at + n)); at += n; }
  };
  for (;;) {
    const b = buf[at++];
    if (b === undefined) throw new Error('GIF ends before its trailer');
    if (b === 0x3b) break;
    if (b === 0x21) {
      const label = buf[at++]!;
      const data = blocks();
      if (label === 0xf9) delay = data.readUInt16LE(1);
      continue;
    }
    if (b !== 0x2c) throw new Error(`unknown GIF block 0x${b.toString(16)}`);
    const rect = { x: buf.readUInt16LE(at), y: buf.readUInt16LE(at + 2), w: buf.readUInt16LE(at + 4), h: buf.readUInt16LE(at + 6) };
    const ip = buf[at + 8]!;
    at += 9;
    let table = global;
    if (ip & 0x80) { const n = 3 << ((ip & 7) + 1); table = buf.subarray(at, at + n); at += n; }
    if (!table) throw new Error('GIF frame has no colour table');
    if (ip & 0x40) throw new Error('interlaced GIF frames are not read');
    const minSize = buf[at++]!;
    const idx = unlzw(blocks(), minSize, rect.w * rect.h);
    for (let y = 0; y < rect.h; y++) {
      for (let x = 0; x < rect.w; x++) {
        const e = idx[y * rect.w + x]!, o = ((rect.y + y) * width + rect.x + x) * 4;
        canvas.set([table[e * 3]!, table[e * 3 + 1]!, table[e * 3 + 2]!, 255], o);
      }
    }
    frames.push({ delayCs: delay, rect, image: { width, height, rgba: Uint8Array.from(canvas) } });
    delay = 0;
  }
  return { width, height, frames };
}

function unlzw(data: Buffer, minSize: number, n: number): Uint8Array {
  const clear = 1 << minSize, eoi = clear + 1;
  const prefix = new Int32Array(4096), suffix = new Uint8Array(4096), len = new Int32Array(4096);
  for (let i = 0; i < clear; i++) { prefix[i] = -1; suffix[i] = i; len[i] = 1; }
  const out = new Uint8Array(n);
  let o = 0, size = minSize + 1, next = eoi + 1, prev = -1, acc = 0, bits = 0, at = 0;
  const first = (c: number) => { while (prefix[c]! >= 0) c = prefix[c]!; return suffix[c]!; };
  const write = (c: number) => {
    const l = len[c]!;
    for (let i = l - 1, x = c; i >= 0; i--, x = prefix[x]!) if (o + i < n) out[o + i] = suffix[x]!;
    o += l;
  };
  for (;;) {
    while (bits < size) {
      if (at >= data.length) throw new Error('GIF image data ends before its end code');
      acc |= data[at++]! << bits; bits += 8;
    }
    const code = acc & ((1 << size) - 1);
    acc >>>= size; bits -= size;
    if (code === clear) { size = minSize + 1; next = eoi + 1; prev = -1; continue; }
    if (code === eoi) break;
    if (prev < 0) { if (code >= clear) throw new Error('GIF code before any entry'); write(code); prev = code; continue; }
    if (code > next) throw new Error(`GIF code ${code} past the table (${next})`);
    const k = code < next ? first(code) : first(prev);
    if (next < 4096) {
      prefix[next] = prev; suffix[next] = k; len[next] = len[prev]! + 1; next++;
      if (next === 1 << size && size < 12) size++;
    }
    write(code);
    prev = code;
  }
  if (o !== n) throw new Error(`GIF frame has ${o} pixels, expected ${n}`);
  return out;
}
