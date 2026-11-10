// A stand-in art archive for the tests (R11): a temp folder of small generated PNGs, so no test
// depends on the real archive (<main-checkout>/.archive/art-iteration/, local only) and no
// binary goes into git.
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** A w x h PNG filled with one colour (rgb: [r, g, b]). */
export function png(w, h, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.from([0, ...Array.from({ length: w }, () => [r, g, b]).flat()]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** A fresh temp folder; files: { 'rel/path.png': Buffer | string }. Returns its absolute path. */
export async function makeArchive(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'commet-archive-'));
  for (const [rel, body] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await writeFile(path.join(root, rel), body);
  }
  return root;
}
