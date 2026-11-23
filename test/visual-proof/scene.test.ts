// visual-proof: a scene is one run or a list of parts, never both or neither; a one-run scene is its own single part.
import { describe, expect, it } from 'vitest';
import { partsOf, type Scene } from '../../.claude/skills/visual-proof/scripts/scene.js';

const run = async () => {};

describe('partsOf', () => {
  it("makes a scene with a run its own one part, with the scene's viewport, motion and drones", () => {
    const drones = () => ({ view: { schemaVersion: 'drones.1' as const, head: 'h', sessions: [], total: 0, placed: 0, needsRescan: false } });
    const [p, ...rest] = partsOf({ name: 's', summary: 's', viewport: { width: 1920, height: 1080 }, reducedMotion: true, drones, run } as Scene);
    expect(rest).toEqual([]);
    expect(p).toMatchObject({ name: '', viewport: { width: 1920, height: 1080 }, reducedMotion: true, drones, run });
  });
  it('gives a scene its parts in order', () => {
    const parts = [{ name: 'A', run }, { name: 'B', gif: false, run }];
    expect(partsOf({ name: 's', summary: 's', parts }).map((p) => p.name)).toEqual(['A', 'B']);
  });
  it('refuses a scene with both, or neither', () => {
    expect(() => partsOf({ name: 's', summary: 's', run, parts: [{ name: 'A', run }] })).toThrow(/both/);
    expect(() => partsOf({ name: 's', summary: 's' })).toThrow(/neither/);
  });
});
