// visual-proof (R3, R4): from the first take of each build, each still's before/after measures and
// images, and the before → after GIF: the before take, the after take, then each still flicking
// before/after, every frame captioned in the view's own font with its side and commit.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePng } from '../../../../test/render/png.js';
import { changeMask, diffByRegion, downscale, sideBySide, withCaption, type Image, type Region } from './frames.js';
import { decodeGif, GifWriter, PaletteBuilder, Quantiser } from './gif.js';
import { readPng } from './png.js';
import { Stop } from './rules.js';
import type { Shot } from './summary.js';
import { REGIONS, type TakeLog } from './scene.js';

/** GitHub's limit for an image attached to a PR or comment. */
export const GITHUB_IMAGE_LIMIT = 10 * 1024 * 1024;
const CAPTION_SCALE = 3;
const FLICKS = 3, FLICK_CS = 70, HOLD_CS = 100;

export interface SideIn { take: string; log: TakeLog; caption: string }
export interface Composed { shots: Shot[]; images: { file: string; bytes: number; note: string }[]; gif: { frames: number; colours: number; bytes: number; decoded: number } }

const frameFile = (take: string, k: number) => join(take, 'raw', `${String(k).padStart(4, '0')}.png`);
const load = (take: string, k: number): Image => readPng(readFileSync(frameFile(take, k)));

/** Regions at frame k: each DOM part's box in either take (a panel the change moved counts in both places). */
function regionsAt(a: TakeLog, b: TakeLog, k: number): Region[] {
  return REGIONS.map((id) => `#${id}`).flatMap((name) => {
    const rects = [a.frames[k]?.boxes[name], b.frames[k]?.boxes[name]].filter((r) => r !== undefined);
    return rects.length ? [{ name, rects }] : [];
  });
}

export function shotsOf(before: TakeLog, after: TakeLog, beforeDir: string, afterDir: string, report: readonly string[] | undefined): Shot[] {
  if (JSON.stringify(before.stills) !== JSON.stringify(after.stills)) {
    throw new Stop('scene-unreachable', `before and after reached different stills (${JSON.stringify(before.stills)} and ${JSON.stringify(after.stills)})`);
  }
  return before.stills.map(({ name, k }) => {
    const d = diffByRegion(load(beforeDir, k), load(afterDir, k), regionsAt(before, after, k), 'the 3D view and labels');
    const pb = before.frames[k]!.probes, pa = after.frames[k]!.probes;
    const names = [...new Set([...Object.keys(pb), ...Object.keys(pa)])].filter((n) => !report || report.includes(n));
    return { name, k, px: d.px, total: d.total, box: d.box, where: d.px ? d.where : [],
      probes: names.map((n) => ({ name: n, before: pb[n] ?? 'not measured (panel closed)', after: pa[n] ?? 'not measured (panel closed)' })) };
  });
}

/** Writes the stills, pairs, change masks and the GIF into `out`, named `<id>-…`. */
/**
 * The GIF's delay for each recorded frame: the loop time until the next one (a scene may step between
 * them); the last one, and the last of each part (where the next part's clock starts again), held.
 */
export function delaysCs(ts: readonly number[], holdCs: number): number[] {
  return ts.map((t, i) => (i + 1 < ts.length && ts[i + 1]! > t ? Math.max(2, Math.round((ts[i + 1]! - t) / 10)) : holdCs));
}

/** `inGif(part)`: whether that part's frames go into the GIF (a part at another viewport can't). */
export function compose(id: string, before: SideIn, after: SideIn, report: readonly string[] | undefined, out: string, gifScale = 1, inGif: (part: number) => boolean = () => true): Composed {
  const shots = shotsOf(before.log, after.log, before.take, after.take, report);
  const images: Composed['images'] = [];
  const write = (file: string, img: Image, note: string) => {
    const png = encodePng(img.width, img.height, img.rgba);
    writeFileSync(join(out, file), png);
    images.push({ file, bytes: png.length, note });
  };
  shots.forEach((s, i) => {
    const b = load(before.take, s.k), a = load(after.take, s.k);
    write(`${id}-shot${i + 1}-pair.png`, sideBySide(withCaption(b, before.caption, CAPTION_SCALE, s.name), withCaption(a, after.caption, CAPTION_SCALE, s.name), 16), `shot ${i + 1}, before | after`);
    write(`${id}-shot${i + 1}-before.png`, b, `shot ${i + 1} before`);
    write(`${id}-shot${i + 1}-after.png`, a, `shot ${i + 1} after`);
    write(`${id}-shot${i + 1}-changes.png`, changeMask(b, a), `shot ${i + 1}, changed pixels in teal`);
  });

  // The GIF's frames, in order: [take, k, caption, delay in centiseconds]
  const seq: [string, number, string, number][] = [];
  const gifFrame = (f: TakeLog['frames'][number]) => inGif(f.part ?? 0);
  const takeFrames = (side: SideIn) => {
    const frames = side.log.frames.filter(gifFrame);
    const d = delaysCs(frames.map((f) => f.ts), HOLD_CS);
    frames.forEach((f, i) => seq.push([side.take, f.k, side.caption, d[i]!]));
  };
  takeFrames(before);
  takeFrames(after);
  for (const s of shots) {
    if (!gifFrame(before.log.frames[s.k]!)) continue;
    for (let n = 0; n < FLICKS; n++) for (const side of [before, after]) seq.push([side.take, s.k, side.caption, FLICK_CS]);
  }
  if (!seq.length) throw new Error('no frame goes into the GIF');
  const still = (k: number) => shots.find((s) => s.k === k)?.name ?? '';
  const frame = ([take, k, caption]: [string, number, string, number]) => withCaption(downscale(load(take, k), gifScale), caption, gifScale > 1 ? 2 : CAPTION_SCALE, still(k));
  const pal = new PaletteBuilder();
  for (const f of seq) pal.add(frame(f));
  const palette = pal.palette();
  const q = new Quantiser(palette);
  const first = frame(seq[0]!);
  const gif = new GifWriter(first.width, first.height, palette);
  let last: Uint8Array | null = null;
  for (const f of seq) {
    const img = frame(f);
    if (img.width !== first.width || img.height !== first.height) throw new Error(`GIF frames differ in size (${img.width}x${img.height}, not ${first.width}x${first.height}): mark the part at another viewport gif: false`);
    last = q.map(img);
    gif.add(last, f[3]);
  }
  const bytes = gif.finish();
  // Read it back: it must decode, and its last frame must be the last frame meant
  const d = decodeGif(bytes);
  const end = d.frames.at(-1)!.image, want = last!;
  for (let p = 0; p < want.length; p++) {
    const e = want[p]! * 3;
    if (end.rgba[p * 4] !== palette[e] || end.rgba[p * 4 + 1] !== palette[e + 1] || end.rgba[p * 4 + 2] !== palette[e + 2]) throw new Error(`the GIF written doesn't decode to its last frame (pixel ${p})`);
  }
  const file = `${id}.gif`;
  writeFileSync(join(out, file), bytes);
  images.unshift({ file, bytes: bytes.length, note: `before → after${gifScale > 1 ? ` at 1/${gifScale} size` : ''}, ${seq.length} frames in loop time, then each still flicking` });
  return { shots, images, gif: { frames: d.frames.length, colours: palette.length / 3, bytes: bytes.length, decoded: d.frames.length } };
}
