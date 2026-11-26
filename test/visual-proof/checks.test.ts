// visual-proof (PR #199 be6e0044): no take that wasn't privacy-scanned survives a stop. The takes are
// scanned before they are compared, so a run whose takes differ and also hold something private stops
// for privacy (and its scratch dir goes); a take that failed left nothing to scan, so its dir goes, and
// the takes before it are still scanned.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkTakes, settleScratch, type TakeDone } from '../../.claude/skills/visual-proof/scripts/checks.js';
import { solid } from '../../.claude/skills/visual-proof/scripts/frames.js';
import { libraryRuns } from '../../.claude/skills/visual-proof/scripts/prepare.js';
import { Stop } from '../../.claude/skills/visual-proof/scripts/rules.js';
import type { TakeLog } from '../../.claude/skills/visual-proof/scripts/scene.js';
import { encodePng } from '../render/png.js';
import { tempDir } from '../fixtures/tmp.js';

const ctx = { literals: [] };

/** A take in `scratch/takes/<name>`: two 6x4 frames (one pixel changed when `odd`), and a page text. */
function take(scratch: string, name: string, text: string, odd = false): TakeDone {
  const dir = join(scratch, 'takes', name);
  mkdirSync(join(dir, 'raw'), { recursive: true });
  for (let k = 0; k < 2; k++) {
    const img = solid(6, 4, [13, 11, 22]);
    if (odd && k === 1) img.rgba.set([255, 0, 0, 255], 0);
    writeFileSync(join(dir, 'raw', `000${k}.png`), encodePng(6, 4, img.rgba));
  }
  const log: TakeLog = { scene: 's', width: 6, height: 4, reducedMotion: false, frames: [0, 1].map((k) => ({ k, ts: 1000 + 50 * k, frame: 0, boxes: {}, probes: {}, heading: null })),
    stills: [{ name: 'end', k: 1 }], texts: [[text, 0]], served: [], events: '', notes: [], errors: [], ticks: [] };
  writeFileSync(join(dir, 'log.json'), JSON.stringify(log));
  return { name, dir, log };
}
const pairs = [['before', 'before-1', 'before-2']] as const;

describe('checkTakes', () => {
  it("keeps the token-like rule for three's WebGL names in page text and API responses: the library exemption is the bundle scan's alone (Qodo 648df95e)", async () => {
    const scratch = tempDir('commet-vp-checks-');
    const name = 'COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR';
    const library = libraryRuns(resolve(import.meta.dirname, '../..'));
    expect(library.has(name)).toBe(true);
    const a = take(scratch, 'before-1', `ext ${name}`), b = take(scratch, 'before-2', 'web/src/view.ts');
    b.log.served.push({ path: '/api/layout', status: 200, body: JSON.stringify({ note: name }) });
    // Even a caller that hands checkTakes the library gets every hit
    const withLibrary = { literals: [], library };
    const got = await checkTakes({ done: [a, b], pairs, items: [], ctx: withLibrary });
    expect((got.stop as Stop).code).toBe('privacy');
    expect(got.hits.map((h) => `${h.rule} @ ${h.where}`).sort()).toEqual(['token-like string @ GET /api/layout', 'token-like string @ take before-1 page text from frame 0']);
  });

  it('two takes that differ, one holding a private path: a privacy stop, and the scratch dir goes', async () => {
    const scratch = tempDir('commet-vp-checks-');
    const done = [take(scratch, 'before-1', 'web/src/view.ts'), take(scratch, 'before-2', 'note: /Users/somebody/plan.txt', true)];
    const got = await checkTakes({ done, pairs, items: [], ctx });
    expect(got.stop).toBeInstanceOf(Stop);
    expect((got.stop as Stop).code).toBe('privacy');
    expect(got.hits.map((h) => `${h.rule} @ ${h.where}`)).toEqual(['absolute path @ take before-2 page text from frame 0']);
    expect(settleScratch(got.stop as Stop, false, scratch)).toBe(false);
    expect(existsSync(scratch)).toBe(false);
  });

  it('a later take that crashed: its dir goes (it left nothing to scan), and a private path in an earlier take still makes it a privacy stop', async () => {
    const scratch = tempDir('commet-vp-checks-');
    const done = [take(scratch, 'before-1', 'note: /home/eve/keys')];
    const crashed = join(scratch, 'takes', 'before-2');
    mkdirSync(join(crashed, 'raw'), { recursive: true });
    writeFileSync(join(crashed, 'raw', '0000.png'), 'a frame nobody scanned');
    const got = await checkTakes({ done, failed: { name: 'before-2', dir: crashed, error: new Error('take before-2 crashed (exit 1) without a STOP') }, pairs: [], items: [], ctx });
    expect(got.removed).toEqual(['before-2']);
    expect(existsSync(crashed)).toBe(false);
    expect((got.stop as Stop).code).toBe('privacy');
    settleScratch(got.stop as Stop, true, scratch);
    expect(existsSync(scratch), 'a privacy stop removes the scratch dir even with --keep').toBe(false);
  });

  it('a later take that crashed after clean ones: the crash is the stop, its dir goes, the scanned takes stay for a look', async () => {
    const scratch = tempDir('commet-vp-checks-');
    const done = [take(scratch, 'before-1', 'web/src/view.ts')];
    const crashed = join(scratch, 'takes', 'before-2');
    mkdirSync(crashed, { recursive: true });
    const error = new Stop('scene-unreachable', 'scene s: the click opened nothing');
    const got = await checkTakes({ done, failed: { name: 'before-2', dir: crashed, error }, pairs: [], items: [], ctx });
    expect(got.stop).toBe(error);
    expect(existsSync(crashed)).toBe(false);
    expect(settleScratch(error, false, scratch)).toBe(true);
    expect(existsSync(done[0]!.dir)).toBe(true);
  });

  it('clean takes that differ stop as takes-differ and keep the scratch dir; clean equal takes go on', async () => {
    const scratch = tempDir('commet-vp-checks-');
    const differ = await checkTakes({ done: [take(scratch, 'before-1', 'a'), take(scratch, 'before-2', 'a', true)], pairs, items: [], ctx });
    expect((differ.stop as Stop).code).toBe('takes-differ');
    expect(differ.hits).toEqual([]);
    const scratch2 = tempDir('commet-vp-checks-');
    const same = await checkTakes({ done: [take(scratch2, 'before-1', 'a'), take(scratch2, 'before-2', 'a')], pairs, items: [{ where: 'the base commit subject', text: 'fix: x' }], ctx });
    expect(same.stop).toBeNull();
    expect(same.compared.map((x) => x.c.differing.length)).toEqual([0]);
  });
});
