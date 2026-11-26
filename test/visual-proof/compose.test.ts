// visual-proof (R3, R4): the GIF plays in loop time, and before and after must reach the same stills.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { delaysCs, shotsOf } from '../../.claude/skills/visual-proof/scripts/compose.js';
import { solid } from '../../.claude/skills/visual-proof/scripts/frames.js';
import type { TakeLog } from '../../.claude/skills/visual-proof/scripts/scene.js';
import { encodePng } from '../render/png.js';
import { tempDir } from '../fixtures/tmp.js';

describe('delaysCs', () => {
  it('shows each recorded frame until the next one in loop time, and holds the last', () => {
    // a scene recording every other tick: 100 ms apart, then one tick later, then the end
    expect(delaysCs([1000, 1100, 1200, 1250], 100)).toEqual([10, 10, 5, 100]);
    expect(delaysCs([1000], 70)).toEqual([70]);
  });
  it("holds the last frame of a part, where the next part's clock starts again", () => {
    expect(delaysCs([1000, 1100, 1000, 1050], 100)).toEqual([10, 100, 5, 100]);
  });
});

/** A take dir with frames of one colour, `stills` and per-frame probes. */
function take(dir: string, frames: number, colour: [number, number, number], stills: TakeLog['stills'], probes: Record<string, number> = {}): { dir: string; log: TakeLog } {
  mkdirSync(join(dir, 'raw'), { recursive: true });
  for (let k = 0; k < frames; k++) writeFileSync(join(dir, 'raw', `${String(k).padStart(4, '0')}.png`), encodePng(4, 3, solid(4, 3, colour).rgba));
  const log: TakeLog = { scene: 's', width: 4, height: 3, reducedMotion: false, frames: Array.from({ length: frames }, (_, k) => ({ k, ts: 1000 + 50 * k, frame: 0, boxes: {}, probes, heading: null })), stills, texts: [], served: [], assets: [], events: '', notes: [], errors: [], ticks: [] };
  return { dir, log };
}

describe('shotsOf', () => {
  it("measures each still before against after, with the scene's probes", () => {
    const root = tempDir('commet-vp-compose-');
    const b = take(join(root, 'b'), 2, [1, 2, 3], [{ name: 'end', k: 1 }], { 'drone px visible': 0 });
    const a = take(join(root, 'a'), 2, [9, 9, 9], [{ name: 'end', k: 1 }], { 'drone px visible': 2320 });
    expect(shotsOf(b.log, a.log, b.dir, a.dir, undefined)).toEqual([{ name: 'end', k: 1, px: 12, total: 12, box: { x0: 0, y0: 0, x1: 3, y1: 2 },
      where: [{ name: 'the 3D view and labels', px: 12 }], probes: [{ name: 'drone px visible', before: 0, after: 2320 }] }]);
  });
  it('stops when before and after reached different stills', () => {
    const root = tempDir('commet-vp-compose-');
    const b = take(join(root, 'b'), 2, [1, 2, 3], [{ name: 'end', k: 1 }]), a = take(join(root, 'a'), 2, [1, 2, 3], [{ name: 'end', k: 0 }]);
    expect(() => shotsOf(b.log, a.log, b.dir, a.dir, undefined)).toThrow(/different stills/);
  });
});
