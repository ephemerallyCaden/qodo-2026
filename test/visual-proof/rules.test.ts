// visual-proof (R2, R7, R11, R12): the conditions that stop a run and hand the question to the user.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareTakes, dataPathsTouched, missingTools, noViewChange, privacyStop, Stop, takesStop } from '../../.claude/skills/visual-proof/scripts/rules.js';
import { solid } from '../../.claude/skills/visual-proof/scripts/frames.js';
import { encodePng } from '../render/png.js';
import { tempDir } from '../fixtures/tmp.js';

describe('R11: no view change, no capture', () => {
  const bundle = (digest: string) => ({ digest, files: ['assets/index-Bkdrk8Tp.js', 'assets/index-Cq1.css', 'index.html'] });
  it('stops when base and head build the same view bundle, naming it', () => {
    const stop = noViewChange(bundle('ab'.repeat(32)), bundle('ab'.repeat(32)));
    expect(stop).toBeInstanceOf(Stop);
    expect(stop!.code).toBe('no-view-change');
    expect(stop!.message).toContain('assets/index-Bkdrk8Tp.js');
  });
  it('goes on when the bundles differ', () => {
    expect(noViewChange(bundle('ab'.repeat(32)), bundle('cd'.repeat(32)))).toBeNull();
  });
});

describe('R12: a change to what the data is made of stops and asks', () => {
  it('names the scanner, attribution, layout, snapshot and contract paths a diff touches, and nothing else', () => {
    expect(dataPathsTouched([
      'web/src/view.ts', 'src/server/server.ts', 'docs/contracts/phase2.md', 'test/render/review.spec.ts',
      'src/scan/git.ts', 'src/attrib/parsers/claude.ts', 'src/core/layout/index.ts', 'src/core/contract/api.ts', 'src/core/snapshot/types.ts',
    ])).toEqual(['src/scan/git.ts', 'src/attrib/parsers/claude.ts', 'src/core/layout/index.ts', 'src/core/contract/api.ts', 'src/core/snapshot/types.ts']);
    expect(dataPathsTouched(['web/src/drones/panel.ts', 'src/core/scan-ish.ts', 'src/scanner.ts'])).toEqual([]);
  });
});

/** A take folder: `frames` frames of 6x4 space, the given pixels painted, and its log. */
function take(dir: string, frames: number, paint: Record<number, [number, number]> = {}, texts: [string, number][] = [['page', 0]]): string {
  mkdirSync(join(dir, 'raw'), { recursive: true });
  for (let k = 0; k < frames; k++) {
    const img = solid(6, 4, [13, 11, 22]);
    const p = paint[k];
    if (p) img.rgba.set([255, 0, 0, 255], (p[1] * 6 + p[0]) * 4);
    writeFileSync(join(dir, 'raw', `${String(k).padStart(4, '0')}.png`), encodePng(6, 4, img.rgba));
  }
  writeFileSync(join(dir, 'log.json'), JSON.stringify({ frames: Array.from({ length: frames }, (_, k) => ({ k, probes: { 'labels #panel new': 0 } })), stills: [{ name: 'end', k: frames - 1 }], texts }));
  return dir;
}

describe('R2: each capture is taken twice and the takes must match', () => {
  it('two equal takes: 0 px differ in every frame, and the run goes on', async () => {
    const root = tempDir('commet-vp-takes-');
    const c = await compareTakes(take(join(root, 'a'), 3), take(join(root, 'b'), 3));
    expect(c).toMatchObject({ frames: 3, differing: [], logDiffers: [] });
    expect(takesStop('before', c)).toBeNull();
  });

  it('one pixel in one frame differs: the run stops, naming the frame, the count and where', async () => {
    const root = tempDir('commet-vp-takes-');
    const c = await compareTakes(take(join(root, 'a'), 3), take(join(root, 'b'), 3, { 1: [4, 2] }));
    expect(c.differing).toEqual([{ k: 1, px: 1, box: { x0: 4, y0: 2, x1: 4, y1: 2 } }]);
    const stop = takesStop('after', c);
    expect(stop?.code).toBe('takes-differ');
    expect(stop?.message).toMatch(/after.*1 of 3 frames.*frame 1: 1 px/);
  });

  it('a different frame count or page text also stops', async () => {
    const root = tempDir('commet-vp-takes-');
    expect(takesStop('before', await compareTakes(take(join(root, 'a'), 3), take(join(root, 'b'), 2)))?.code).toBe('takes-differ');
    const t = await compareTakes(take(join(root, 'c'), 2), take(join(root, 'd'), 2, {}, [['page', 0], ['status: saved', 1]]));
    expect(t.logDiffers).toEqual(['page texts']);
    expect(takesStop('before', t)?.code).toBe('takes-differ');
  });
});

describe('R5 and R7: a privacy hit, or a missing tool, stops', () => {
  it('any privacy hit stops, listing rule and place only', () => {
    expect(privacyStop([])).toBeNull();
    const stop = privacyStop([{ rule: 'absolute path', where: 'frame 12 page text', excerpt: '/Users… (24 chars)' }]);
    expect(stop?.code).toBe('privacy');
    expect(stop?.detail).toEqual(['absolute path in frame 12 page text: /Users… (24 chars)']);
  });
  it('a missing tool stops and says what to install', () => {
    expect(missingTools({ git: true, chromium: true })).toBeNull();
    const stop = missingTools({ git: true, chromium: false });
    expect(stop?.code).toBe('tool-missing');
    expect(stop?.message).toContain('chromium');
  });
});
