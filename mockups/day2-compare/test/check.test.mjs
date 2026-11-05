// Checker tests: synthetic images with known answers, blank/empty rejection, PNG decoding,
// and the committed out/checker.txt against a fresh run on the committed renders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkImage, checkFiles, loadPalette, FADE_TOL } from '../check.mjs';
import { decodePng } from '../png.mjs';
import { V2_PLANET_RAMPS, ACCENTS } from '../../asset-viewer/planet-ramps.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'out');
const pal = await loadPalette();
const scene = JSON.parse(await readFile(path.join(HERE, '..', 'scene-palette.json'), 'utf8'));
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

// An image from [colour, pixel count] runs, as the decoder returns it.
function image(runs) {
  const total = runs.reduce((n, [, k]) => n + k, 0);
  const rgba = new Uint8Array(total * 4);
  let o = 0;
  for (const [c, k] of runs) for (let i = 0; i < k; i++, o += 4) rgba.set([...c, 255], o);
  return { width: total, height: 1, rgba };
}
// Minimal PNG encoder (RGB, filter 0 or 1 per row) for decoder round trips.
function encodePng(width, height, rgb3, filter = 0) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = rgb3.subarray(y * width * 3, (y + 1) * width * 3);
    const out = Buffer.alloc(row.length + 1);
    out[0] = filter;
    for (let i = 0; i < row.length; i++) out[i + 1] = filter === 1 ? (row[i] - (i >= 3 ? row[i - 3] : 0)) & 255 : row[i];
    rows.push(out);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

test('scene palette holds the art-direction v2 space, stars and depth tints', () => {
  assert.equal(scene.space, '#0d0b16');
  assert.deepEqual(scene.stars, ['#3b3866', '#9a90e0', '#fff8ff']);
  assert.deepEqual(scene.depth, [['#1b1f4a', 0], ['#1b1f4a', 0.38], ['#1b1f4a', 0.72], ['#17172f', 0.88]]);
});

test('palette, depth fade and off-palette shares on a synthetic image', () => {
  const ocean = rgb(V2_PLANET_RAMPS.ocean[2]);
  const r = checkImage(image([
    [rgb(scene.space), 50], [ocean, 25],
    [mix(ocean, rgb('#1b1f4a'), 0.38), 10], // a depth-faded ocean pixel
    [mix(ocean, mix(rgb('#1b1f4a'), rgb('#17172f'), 0.5), 0.8), 5], // the smooth fade's last segment
    [[255, 0, 255], 10], // magenta: nowhere in the palette or its fade
  ]), pal);
  assert.deepEqual([r.unique, r.onPalette, r.fade, r.offPalette, r.black, r.teal], [5, 75, 15, 10, 0, 0]);
});

test('a colour just outside the fade tolerance is off palette', () => {
  const ocean = rgb(V2_PLANET_RAMPS.ocean[2]);
  const faded = mix(ocean, rgb('#1b1f4a'), 0.38);
  const r = checkImage(image([[rgb(scene.space), 50], [[faded[0], faded[1], faded[2] + Math.ceil(FADE_TOL) + 2], 50]]), pal);
  assert.equal(r.offPalette, 50);
});

test('pure black is never on palette; teal and near black are counted', () => {
  const r = checkImage(image([[[0, 0, 0], 40], [[3, 2, 4], 10], [rgb(ACCENTS.reveal[2]), 10], [rgb(V2_PLANET_RAMPS.land[2]), 40]]), pal);
  assert.deepEqual([r.black, r.nearBlack, r.teal, r.onPalette], [40, 50, 10, 50]);
});

test('blank and empty images fail', () => {
  assert.throws(() => checkImage(image([[rgb(scene.space), 1000]]), pal), /blank image/);
  assert.throws(() => checkImage(image([[rgb(scene.space), 999], [rgb(V2_PLANET_RAMPS.land[2]), 1]]), pal), /blank image/); // 0.1% scene
  assert.throws(() => checkImage({ width: 0, height: 0, rgba: new Uint8Array(0) }, pal), /empty image/);
});

test('PNG decoder round-trips RGB images with and without row filters', () => {
  const w = 7, h = 3, px = new Uint8Array(w * h * 3).map((_, i) => (i * 37 + 11) & 255);
  for (const filter of [0, 1]) {
    const { width, height, rgba } = decodePng(encodePng(w, h, px, filter));
    assert.deepEqual([width, height], [w, h]);
    for (let i = 0; i < w * h; i++) assert.deepEqual([...rgba.subarray(i * 4, i * 4 + 4)], [...px.subarray(i * 3, i * 3 + 3), 255]);
  }
  assert.throws(() => decodePng(Buffer.from('not a png')), /not a PNG/);
});

test('checkFiles fails on a blank PNG file and names it', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'day2-check-'));
  try {
    const f = path.join(dir, 'blank.png');
    await writeFile(f, encodePng(4, 4, new Uint8Array(48).fill(13)));
    await assert.rejects(checkFiles([f], pal), /blank\.png: blank image/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('out/checker.txt matches a fresh check of the committed renders', async () => {
  const files = ['defaults.png', 'house.png'].map((f) => path.join(OUT, f));
  const a = await checkFiles(files, pal); // vs the line written by an earlier run: same input, same line
  const committed = (await readFile(path.join(OUT, 'checker.txt'), 'utf8')).trim().split('\n');
  assert.deepEqual(committed.slice(0, 2), a);
  assert.match(a[1], /off palette 0\.00%, pure black 0\.00%/, 'the house render stays on palette');
});
