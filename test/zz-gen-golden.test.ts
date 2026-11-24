// #201 (U3): the mastery rule on its own (src/core/mastery.ts), shared by `commet chart status` and the
// view's planet panel. (The file name is a leftover of the #201 agent run, whose sandbox could neither
// delete nor rename it; rename it to test/mastery.test.ts freely.)
import { describe, expect, it } from 'vitest';
import { masteryPercent } from '../src/core/mastery.js';

describe('masteryPercent (#201: cleared files over all files, by count)', () => {
  it('is the whole percent of files clear, rounded down, so it never says 100% while a file is not clear (Rule 1)', () => {
    expect(masteryPercent(0, 7)).toBe(0);
    expect(masteryPercent(1, 3)).toBe(33);
    expect(masteryPercent(2, 3)).toBe(66);
    expect(masteryPercent(199, 200)).toBe(99);
    expect(masteryPercent(999, 1000)).toBe(99);
    expect(masteryPercent(4, 4)).toBe(100);
  });

  it('is 0 for a body with no files, never a division by zero', () => {
    expect(masteryPercent(0, 0)).toBe(0);
  });
});
