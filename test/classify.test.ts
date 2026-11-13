// The commit class decision (design §5.2.7, Issue #5): an exhaustive decision-table test and a
// seeded property test for the constitution's "unknown, never human".
import { describe, expect, it } from 'vitest';
import { classify, type ClassifyInput } from '../src/core/classify.js';
import type { CommitClass } from '../src/core/snapshot/types.js';

/** Consistent (counted, shareMilli, matched) triples at every threshold edge. */
const BANDS: Pick<ClassifyInput, 'counted' | 'shareMilli' | 'matched'>[] = [
  { counted: 0, shareMilli: 0, matched: 0 },
  { counted: 2000, shareMilli: 0, matched: 0 },
  { counted: 2000, shareMilli: 0, matched: 1 }, // a trace that rounds down to 0‰
  { counted: 2000, shareMilli: 299, matched: 599 },
  { counted: 2000, shareMilli: 300, matched: 600 },
  { counted: 2000, shareMilli: 899, matched: 1799 },
  { counted: 2000, shareMilli: 900, matched: 1800 },
  { counted: 2000, shareMilli: 1000, matched: 2000 },
];
const FLAGS = ['ranCommit', 'isMerge', 'isSelf', 'covered', 'partial', 'patchIncomplete'] as const;

function* allInputs(): Generator<ClassifyInput> {
  for (const band of BANDS) {
    for (let bits = 0; bits < 1 << FLAGS.length; bits++) {
      const flags = Object.fromEntries(FLAGS.map((f, i) => [f, (bits & (1 << i)) !== 0])) as Record<typeof FLAGS[number], boolean>;
      yield { ...band, ...flags };
    }
  }
}

// The decision table, first matching row wins. `undefined` is a wildcard.
type Cond = { [K in keyof ClassifyInput]?: ClassifyInput[K] extends boolean ? boolean : (n: number) => boolean };
const TABLE: [Cond, CommitClass][] = [
  [{ isMerge: true }, 'unknown'],
  [{ counted: (n) => n === 0 }, 'unknown'],
  [{ shareMilli: (n) => n >= 900 }, 'agent'],
  [{ shareMilli: (n) => n >= 300 }, 'mixed'],
  [{ isSelf: true, covered: true, partial: false, ranCommit: false, patchIncomplete: false }, 'human'],
  [{}, 'unknown'],
];

const rowFor = (i: ClassifyInput) => TABLE.find(([cond]) => Object.entries(cond).every(([k, want]) => {
  const got = i[k as keyof ClassifyInput];
  return typeof want === 'function' ? want(got as number) : got === want;
}))!;

describe('classify', () => {
  it('agrees with the decision table on every combination', () => {
    const tally: Record<CommitClass, number> = { agent: 0, mixed: 0, human: 0, unknown: 0 };
    let n = 0;
    for (const i of allInputs()) {
      expect(classify(i), JSON.stringify(i)).toBe(rowFor(i)[1]);
      tally[classify(i)]++;
      n++;
    }
    // 8 bands × 64 flag sets. Human: the 3 countable bands under 300‰, each with one flag set.
    // Agent and mixed: 2 bands each × the 32 non-merge flag sets.
    expect(n).toBe(512);
    expect(tally).toEqual({ agent: 64, mixed: 64, human: 3, unknown: 381 });
  });

  it('encodes the Issue #5 decisions', () => {
    const base: ClassifyInput = { counted: 10, shareMilli: 0, matched: 0, ranCommit: false, isMerge: false,
      isSelf: true, covered: true, partial: false, patchIncomplete: false };
    expect(classify(base)).toBe('human');
    // Decision 1: a share under 300‰ with matched lines stays human (with traces).
    expect(classify({ ...base, shareMilli: 299, matched: 3 })).toBe('human');
    // Decision 2: an agent-run commit with share 0 is unknown (the matcher keeps its evidence).
    expect(classify({ ...base, ranCommit: true })).toBe('unknown');
    // Decision 3: merges are unknown, whatever their share.
    expect(classify({ ...base, isMerge: true })).toBe('unknown');
    expect(classify({ ...base, isMerge: true, shareMilli: 1000, matched: 10 })).toBe('unknown');
    // A partially parsed transcript, an uncovered or a teammate commit can't be human.
    expect(classify({ ...base, partial: true })).toBe('unknown');
    expect(classify({ ...base, covered: false })).toBe('unknown');
    expect(classify({ ...base, isSelf: false })).toBe('unknown');
    // #38: a patch that couldn't be read completely may be missing lines, so it can't be human;
    // the lines it did read are still agent evidence.
    expect(classify({ ...base, patchIncomplete: true })).toBe('unknown');
    expect(classify({ ...base, patchIncomplete: true, shareMilli: 900, matched: 9 })).toBe('agent');
    // Enough matched lines are agent evidence wherever they fall.
    expect(classify({ ...base, covered: false, isSelf: false, ranCommit: true, partial: true, patchIncomplete: true, shareMilli: 900, matched: 9 }))
      .toBe('agent');
  });

  it('property: human implies self, covered, fully parsed, patch fully read, not a merge, not agent-run, countable and under 300‰', () => {
    // mulberry32: a seeded PRNG keeps the property run reproducible (determinism rule).
    let seed = 0x5eed;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (max: number) => Math.floor(rand() * (max + 1));
    let humans = 0;
    for (let k = 0; k < 20_000; k++) {
      // Inputs are deliberately not always consistent (matched > counted, share without matches).
      const i: ClassifyInput = { counted: int(3) === 0 ? 0 : int(5000), shareMilli: int(1000), matched: int(5000),
        ranCommit: rand() < 0.5, isMerge: rand() < 0.5, isSelf: rand() < 0.5, covered: rand() < 0.5, partial: rand() < 0.5,
        patchIncomplete: rand() < 0.5 };
      const cls = classify(i);
      if (cls !== 'human') continue;
      humans++;
      expect(i.isSelf && i.covered && !i.partial && !i.patchIncomplete && !i.isMerge && !i.ranCommit && i.counted > 0 && i.shareMilli < 300,
        JSON.stringify(i)).toBe(true);
    }
    expect(humans).toBeGreaterThan(50); // guards against a vacuous pass
  });
});
