// visual-proof (R4): the text a PR carries, since Qodo can't see the images: per shot what changed in
// pixels, where, and the scene's own measures before and after; both commits and the exact command.
import { describe, expect, it } from 'vitest';
import { privacyHits } from '../../.claude/skills/visual-proof/scripts/privacy.js';
import { summaryText, type RunSummary } from '../../.claude/skills/visual-proof/scripts/summary.js';

const run: RunSummary = {
  scene: { name: 'panel-labels', summary: "a selected drone's label and a focused planet's note, each with its panel open" },
  before: { sha: '8cf028c0d5b5e2c5f0f7c4b8e7d1a2b3c4d5e6f7', subject: 'test(view): the drone panel hands focus back', bundle: 'assets/index-AAAA1111.js' },
  after: { sha: '4f3fe571e9a72d0f47c75045e690d1576b6d948a', subject: 'fix(view): note and drone labels move out from under the open panels (#169)', bundle: 'assets/index-BBBB2222.js' },
  data: { repoAt: '8cf028c0d5b5e2c5f0f7c4b8e7d1a2b3c4d5e6f7', sessions: 0, drones: 1, reducedMotion: true, viewport: '1280x720' },
  frames: 48,
  determinism: { takes: 4, framesCompared: 96, differing: 0 },
  privacy: { texts: 37, responses: 22, files: 4, hits: 0 },
  shots: [
    { name: 'drone selected', k: 20, px: 2456, total: 921600, box: { x0: 92, y0: 560, x1: 330, y1: 618 },
      where: [{ name: '#drone-panel', px: 1232 }, { name: '#panel', px: 0 }, { name: 'the 3D view and labels', px: 1224 }],
      probes: [{ name: 'label px drawn under #drone-panel', before: 1232, after: 0 }] },
    { name: 'note open', k: 47, px: 1424, total: 921600, box: { x0: 404, y0: 300, x1: 758, y1: 312 },
      where: [{ name: '#panel', px: 798 }, { name: 'the 3D view and labels', px: 626 }],
      probes: [{ name: 'label px drawn under #panel', before: 798, after: 0 }] },
  ],
  images: [{ file: 'panel-labels.gif', bytes: 2_345_678, note: 'before → after' }, { file: 'shot-1-pair.png', bytes: 123_456, note: 'drone selected, before | after' }],
  command: '.claude/skills/visual-proof/scripts/vp.sh run --base 8cf028c --head 4f3fe57 --scene panel-labels',
};

describe('summaryText', () => {
  const text = summaryText(run);
  it('names both commits, their bundles and the exact command', () => {
    for (const s of ['`8cf028c`', '`4f3fe57`', 'test(view): the drone panel hands focus back', 'move out from under the open panels (#169)',
      'assets/index-AAAA1111.js', 'assets/index-BBBB2222.js', run.command]) expect(text).toContain(s);
  });
  it('gives each shot its changed pixels, box, regions and measures before → after', () => {
    expect(text).toContain('Shot 1: drone selected (take frame 20)');
    expect(text).toContain('2456 of 921600 px changed (0.26%), box x 92-330, y 560-618');
    expect(text).toContain('#drone-panel 1232, #panel 0, the 3D view and labels 1224');
    expect(text).toContain('label px drawn under #drone-panel: 1232 before, 0 after');
    expect(text).toContain('Shot 2: note open (take frame 47)');
    expect(text).toContain('label px drawn under #panel: 798 before, 0 after');
  });
  it('says how the data, determinism and privacy were checked', () => {
    expect(text).toContain('0 of 96 frames differ');
    expect(text).toContain('`--no-ingest`');
    expect(text).toContain('1 scripted drone');
    expect(text).toContain('37 page texts, 22 API responses and 4 state files');
    expect(text).toContain('0 hits');
    expect(text).toContain('panel-labels.gif (2.2 MB, before → after)');
  });
  it('holds no absolute path or token, and is the same text every time', () => {
    expect(privacyHits([{ where: 'summary', text }], { literals: [] })).toEqual([]);
    expect(summaryText(structuredClone(run))).toBe(text);
  });
  it('says when nothing changed in a shot', () => {
    const same = summaryText({ ...run, shots: [{ ...run.shots[0]!, px: 0, box: null, where: [] }] });
    expect(same).toContain('no pixel changed');
  });
});
