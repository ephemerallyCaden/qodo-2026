// Unit tests for the render harness's pure parts (#31), run by Vitest in `npm test` with no browser:
// PNG round trips, the empty-output check, the draw budget, text twins and the golden rules. The
// last block checks every committed golden against its twin, so the text Qodo reviews always
// describes the image that is actually committed.
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { RenderStats } from '../../src/core/contract/api.js';
import { palette } from '../../src/core/palette.js';
import { assertRendered, diffPixels, frameProblems, LOW_RES, statsProblems, type Frame } from './frame.js';
import { checkGolden, GOLDEN_DIR } from './golden.js';
import { chunk, decodePng, encodePng } from './png.js';
import { BUDGET } from './thresholds.js';
import { paletteProblems, twinRecord, twinText, type RenderEnv } from './twin.js';

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const SPACE = palette.world.space;

/** A w×h frame of `fill`, with `paint(x, y)` returning another colour where it wants one. */
function frame(w: number, h: number, fill: string = SPACE, paint: (x: number, y: number) => string | undefined = () => undefined): Frame {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgba.set([...rgb(paint(x, y) ?? fill), 255], (y * w + x) * 4);
  return { width: w, height: h, rgba };
}
const { width: W, height: H } = LOW_RES;
/** Twelve palette colours, one per column stripe of a planet. */
const TWELVE: string[] = [...palette.world.land, ...palette.world.toxic, palette.world.ash[2], palette.world.ash[3]];
/** A planet-ish square at (100, 50), side s, striped in the given colours. */
const planet = (s: number, colours = TWELVE) => (x: number, y: number) =>
  (x >= 100 && x < 100 + s && y >= 50 && y < 50 + s ? colours[(x - 100) % colours.length] : undefined);
/** One star every 7 px on every 5th row: 1656 single pixels. */
const stars = (x: number, y: number) => (y % 5 === 0 && x % 7 === 0 ? palette.world.stars[2] : undefined);
const STATS: RenderStats = { drawCalls: 7, triangles: 3282, width: W, height: H };
const ENV: RenderEnv = { playwright: '1.65.0', browser: '158.0.8127.18', platform: 'linux', arch: 'x64', webgl: 'ANGLE (SwiftShader)' };
const REC = { stats: STATS, env: ENV };

describe('png', () => {
  it('round-trips RGBA exactly', () => {
    const f = frame(5, 3, SPACE, (x, y) => (x === y ? palette.accent.teal[3] : undefined));
    f.rgba[3] = 7; // alpha survives too
    const back = decodePng(encodePng(f.width, f.height, f.rgba));
    expect(back).toEqual({ width: 5, height: 3, rgba: f.rgba });
  });

  it('rejects a corrupt chunk, a non-RGBA image and a filtered row instead of half-reading them', () => {
    const png = encodePng(2, 2, frame(2, 2).rgba);
    const corrupt = Buffer.from(png);
    corrupt.writeUInt8(corrupt.readUInt8(20) ^ 1, 20); // inside IHDR
    expect(() => decodePng(corrupt)).toThrow(/bad CRC/);
    expect(() => decodePng(Buffer.from('not a png at all'))).toThrow(/not a PNG/);
    expect(() => encodePng(2, 2, new Uint8Array(15))).toThrow(/expected 16/);
    // A valid PNG our encoder never writes: RGB (colour type 2), and RGBA with a Sub-filtered row.
    const png2 = (colourType: number, rows: number[][]) => Buffer.concat([png.subarray(0, 8),
      chunk('IHDR', Buffer.from([0, 0, 0, 1, 0, 0, 0, rows.length, 8, colourType, 0, 0, 0])),
      chunk('IDAT', deflateSync(Buffer.from(rows.flat()))), chunk('IEND', Buffer.alloc(0))]);
    expect(() => decodePng(png2(2, [[0, 1, 2, 3]]))).toThrow(/only 8-bit RGBA/);
    expect(() => decodePng(png2(6, [[1, 1, 2, 3, 4]]))).toThrow(/row 0 uses filter 1/);
    expect(decodePng(png2(6, [[0, 1, 2, 3, 4]])).rgba).toEqual(new Uint8Array([1, 2, 3, 4]));
  });
});

describe('empty-output check', () => {
  const NEED = "(need 2880)"; // 5% of 57600

  it('passes a frame with a planet on it', () => {
    expect(frameProblems(frame(W, H, SPACE, planet(54)), LOW_RES)).toEqual([]);
  });

  it('fails a frame of one colour, whatever the colour', () => {
    expect(frameProblems(frame(W, H))).toEqual(['blank frame: 1 colour (need 12)', `blank frame: 0 of 57600 px aren't space ${SPACE} ${NEED}`]);
    expect(frameProblems(frame(W, H, '#000000'))).toEqual(['blank frame: 1 colour (need 12)']);
  });

  it('fails a frame of stars alone, on space or on a wrong clear colour', () => {
    expect(frameProblems(frame(W, H, SPACE, stars))).toEqual(['blank frame: 2 colours (need 12)', `blank frame: 1656 of 57600 px aren't space ${SPACE} ${NEED}`]);
    expect(frameProblems(frame(W, H, '#000000', stars))).toEqual(['blank frame: 2 colours (need 12)']);
  });

  it('puts the thresholds at BLANK.minColours and BLANK.minNonSpaceFraction', () => {
    expect(frameProblems(frame(W, H, SPACE, planet(53)))).toEqual([`blank frame: 2809 of 57600 px aren't space ${SPACE} ${NEED}`]);
    expect(frameProblems(frame(W, H, SPACE, planet(54, TWELVE.slice(0, 10))))).toEqual(['blank frame: 11 colours (need 12)']);
    expect(frameProblems(frame(W, H, SPACE, planet(54, TWELVE.slice(0, 11))))).toEqual([]); // 11 + space
  });

  it('fails the wrong size, a short buffer and a missing frame', () => {
    expect(frameProblems(frame(W, H, SPACE, planet(54)), { width: 640, height: 360 })).toEqual(['frame is 320x180, expected the 640x360 low-res target']);
    expect(frameProblems({ width: W, height: H, rgba: new Uint8Array(10) })).toEqual(['rgba has 10 bytes, expected 230400 for 320x180']);
    expect(frameProblems({ width: 0, height: 0, rgba: new Uint8Array(0) })).toEqual(['no frame: size 0x0']);
  });
});

describe('draw budget', () => {
  it('passes a frame inside the budget', () => {
    expect(statsProblems(STATS, { width: W, height: H })).toEqual([]);
  });

  it('fails a frame that drew nothing or went over budget', () => {
    expect(statsProblems({ ...STATS, drawCalls: 0, triangles: 0 })).toEqual(['drawCalls is 0: nothing was drawn', 'triangles is 0: nothing was drawn']);
    expect(statsProblems({ ...STATS, drawCalls: BUDGET.maxDrawCalls + 1, triangles: BUDGET.maxTriangles + 1 })).toEqual([
      `drawCalls ${BUDGET.maxDrawCalls + 1} is over the budget of ${BUDGET.maxDrawCalls}`,
      `triangles ${BUDGET.maxTriangles + 1} is over the budget of ${BUDGET.maxTriangles}`,
    ]);
    expect(statsProblems({ ...STATS, drawCalls: 2.5 })).toEqual(['drawCalls is 2.5: nothing was drawn']);
    expect(statsProblems({ ...STATS, width: 640 }, { width: W, height: H })).toEqual(['stats report 640x180, pixels are 320x180']);
  });

  it('assertRendered reports every problem at once', () => {
    expect(() => assertRendered(frame(W, H), { ...STATS, drawCalls: 0 })).toThrow(/blank frame: 1 colour[\s\S]*drawCalls is 0/);
  });
});

describe('diffPixels', () => {
  it('counts pixels with any channel past the tolerance', () => {
    const a = frame(4, 4), b = frame(4, 4);
    b.rgba[0]! += 1;
    b.rgba[4 * 5 + 3] = 0;
    expect(diffPixels(a, a)).toBe(0);
    expect(diffPixels(a, b)).toBe(2);
    expect(diffPixels(a, b, 1)).toBe(1);
    expect(() => diffPixels(a, frame(4, 5))).toThrow(/can't diff 4x4 against 4x5/);
  });
});

describe('text twin', () => {
  it('counts pixels per palette entry, with bounding boxes, in palette order', () => {
    const f = frame(4, 2, SPACE, (x, y) => (y === 1 ? (x < 2 ? palette.world.cloud[1] : '#123456') : undefined));
    expect(twinText('tiny', f, REC)).toBe([
      "# Text twin of tiny.png, generated by test/render/twin.ts. Don't edit: regenerate with UPDATE_GOLDEN=1.",
      'name     tiny',
      'env      {"arch":"x64","browser":"158.0.8127.18","platform":"linux","playwright":"1.65.0","webgl":"ANGLE (SwiftShader)"}',
      'size     4x2 (8 px)',
      'rgba     sha256 50dc6040a9c7f05d879ab631a6d7a551a1a37a7ad45f108d9b5558e6814e067e',
      'stats    drawCalls 7, triangles 3282',
      'colours  3 (2 palette, 1 off-palette: 2 px)',
      '',
      '    px    share  colour   bbox x0,y0-x1,y1  palette entries',
      '     4   50.00%  #0d0b16  0,0-3,0          world.space',
      '     2   25.00%  #f2d8b8  0,1-1,1          world.cloud[1], world.cloud[2], world.ring[1], world.moonBody[3]',
      '     2   25.00%  #123456  2,1-3,1          (off-palette)',
      '',
    ].join('\n'));
    expect(twinRecord(twinText('tiny', f, REC))).toEqual({ stats: { drawCalls: 7, triangles: 3282 }, env: ENV });
  });

  it('fails one off-palette pixel (the depth-fade-off check), and passes a palette-only frame', () => {
    expect(paletteProblems(frame(W, H, SPACE, planet(54)))).toEqual([]);
    // One step off a palette colour (#0d0b16 → #0d0b17) is enough.
    expect(paletteProblems(frame(W, H, SPACE, (x, y) => planet(54)(x, y) ?? (x === 7 && y === 3 ? '#0d0b17' : undefined))))
      .toEqual(['1 px off-palette with the depth fade off, first #0d0b17 at 7,3']);
  });

  it('lists at most 32 off-palette colours, then sums the rest', () => {
    const f = frame(40, 1, SPACE, (x) => `#0100${x.toString(16).padStart(2, '0')}`);
    const lines = twinText('ramp', f, REC).trimEnd().split('\n');
    expect(lines.filter((l) => l.endsWith('(off-palette)'))).toHaveLength(32);
    expect(lines.at(-1)).toBe('… and 8 more off-palette colours, 8 px');
  });
});

describe('golden rules', () => {
  const dirs = () => ({ dir: mkdtempSync(join(tmpdir(), 'commet-golden-')), candidates: mkdtempSync(join(tmpdir(), 'commet-candidates-')) });
  const good = frame(W, H, SPACE, planet(54));

  it('writes with update, then matches in the same environment', () => {
    const d = dirs();
    expect(checkGolden('g', good, STATS, { env: ENV, update: true, ...d })).toEqual({ status: 'written' });
    expect(readdirSync(d.dir).sort()).toEqual(['g.png', 'g.txt']);
    expect(checkGolden('g', good, STATS, { env: ENV, ...d })).toEqual({ status: 'match' });
    expect(checkGolden('g', good, STATS, { env: ENV, ci: true, ...d })).toEqual({ status: 'match' });
    // Every run leaves what an update would have written, for the CI artifact.
    expect(readFileSync(join(d.candidates, 'g.txt'), 'utf8')).toBe(readFileSync(join(d.dir, 'g.txt'), 'utf8'));
  });

  it('fails a missing golden instead of passing it', () => {
    expect(() => checkGolden('nope', good, STATS, { env: ENV, ...dirs() })).toThrow(/missing golden nope\.png/);
  });

  it('fails one changed pixel, or changed draw stats, and shows the twin lines that moved', () => {
    const d = dirs();
    checkGolden('g', good, STATS, { env: ENV, update: true, ...d });
    const moved = frame(W, H, SPACE, (x, y) => planet(54)(x, y) ?? (x === 0 && y === 0 ? palette.world.land[0] : undefined));
    const message = (run: () => unknown) => { try { run(); } catch (e) { return (e as Error).message.split('\n'); } throw new Error('did not throw'); };
    const pixel = message(() => checkGolden('g', moved, STATS, { env: ENV, ...d }));
    expect(pixel[0]).toMatch(/^g: 1 px differ from the golden \(max 0\)\. New image: /);
    expect(pixel).toContain('-    270    0.46%  #123d33  100,50-148,103   world.land[0]');
    expect(pixel).toContain('+    271    0.47%  #123d33  0,0-148,103      world.land[0]');
    const stats = message(() => checkGolden('g', good, { ...STATS, drawCalls: 8 }, { env: ENV, ...d }));
    expect(stats[0]).toMatch(/^g: 0 px differ/);
    expect(stats).toContain('+ stats    drawCalls 8, triangles 3282');
  });

  it('in CI, fails goldens made in another environment; locally, reports them as informational', () => {
    const d = dirs();
    checkGolden('g', good, STATS, { env: ENV, update: true, ...d });
    const mac: RenderEnv = { ...ENV, platform: 'darwin', arch: 'arm64' };
    expect(() => checkGolden('g', good, STATS, { env: mac, ci: true, ...d })).toThrow(/authoritative only where they were made \(linux\/x64[\s\S]*this CI run is darwin\/arm64/);
    expect(checkGolden('g', good, STATS, { env: mac, ...d })).toEqual({ status: 'unpinned', diffPixels: 0, recorded: ENV });
  });

  it('never writes a blank frame, even with update', () => {
    const d = dirs();
    expect(() => checkGolden('blank', frame(W, H, SPACE, stars), STATS, { env: ENV, update: true, ...d })).toThrow(/blank frame/);
    expect([...readdirSync(d.dir), ...readdirSync(d.candidates)]).toEqual([]);
  });
});

describe('committed render goldens', () => {
  const pngs = existsSync(GOLDEN_DIR) ? readdirSync(GOLDEN_DIR).filter((f) => f.endsWith('.png')).sort() : [];

  it('exist, all made in one SwiftShader environment', () => {
    expect(pngs.length).toBeGreaterThanOrEqual(3);
    const envs = new Set(pngs.map((p) => JSON.stringify(twinRecord(readFileSync(join(GOLDEN_DIR, p.replace(/\.png$/, '.txt')), 'utf8')).env)));
    expect(envs.size).toBe(1);
    expect([...envs][0]).toContain('SwiftShader');
  });

  it('each have a text twin that describes exactly that image, and none is blank', () => {
    const txts = readdirSync(GOLDEN_DIR).filter((f) => f.endsWith('.txt')).sort();
    expect(txts).toEqual(pngs.map((p) => p.replace(/\.png$/, '.txt')));
    for (const p of pngs) {
      const name = p.replace(/\.png$/, '');
      const image = decodePng(readFileSync(join(GOLDEN_DIR, p)));
      const twin = readFileSync(join(GOLDEN_DIR, `${name}.txt`), 'utf8');
      expect(twinText(name, image, twinRecord(twin)), `${name}.txt`).toBe(twin);
      expect(frameProblems(image), name).toEqual([]);
    }
  });
});
