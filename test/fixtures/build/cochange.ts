// A scripted repo for #211's co-change scan (fixed identity and dates, so its SHAs are the same every run):
// a fog core that changes with its view model and its test, a rename the pair survives, a pair that only
// shares one commit, a 201-file bulk commit, ten quiet commits that age it all past the flag window (the
// last 10 commits), and a latest change that leaves the view model out.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gitIn, SELF } from './basic.js';
import { realTempDir } from '../tmp.js';

/** `shas` in commit order: k0..k6, q1..q10, k7 (the head, `head`). */
export interface CoChangeRepo { dir: string; shas: string[]; head: string }

export async function buildCoChangeRepo(): Promise<CoChangeRepo> {
  const dir = realTempDir('commet-cochange-');
  const git = gitIn(dir);
  await git(['init', '-q', '-b', 'main']);
  for (const [k, v] of [['user.name', SELF.name], ['user.email', SELF.email], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) await git(['config', k!, v!]);
  const lines = new Map<string, number>();
  /** Appends a line to each file (a content change), so every commit's files are exactly these. */
  const touch = (...paths: string[]) => {
    for (const p of paths) {
      const n = (lines.get(p) ?? 0) + 1;
      lines.set(p, n);
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), Array.from({ length: n }, (_, i) => `export const line${i} = ${i};`).join('\n') + '\n');
    }
  };
  const shas: string[] = [];
  const commit = async (subject: string) => {
    const date = `2026-10-${String(shas.length + 1).padStart(2, '0')}T10:00:00Z`;
    await git(['add', '-A']);
    await git(['commit', '-q', '-m', subject], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
    shas.push(await git(['rev-parse', 'HEAD']));
  };
  touch('src/core/fog.ts', 'web/model/fog.ts', 'test/fog.test.ts', 'src/scan/window.ts', 'README.md', 'docs/fog.md');
  await commit('k0: start');
  touch('src/core/fog.ts', 'web/model/fog.ts', 'test/fog.test.ts');
  await commit('k1: fog, its view model and its test');
  touch('src/core/fog.ts', 'web/model/fog.ts');
  await commit('k2: fog and its view model');
  touch('src/scan/window.ts', 'README.md');
  await commit('k3: the window and the readme');
  // k4: the view model is renamed with an edit, beside the fog core: the pair follows it to its new name.
  await git(['mv', 'web/model/fog.ts', 'web/model/fog-model.ts']);
  lines.set('web/model/fog-model.ts', lines.get('web/model/fog.ts')!);
  touch('web/model/fog-model.ts', 'src/core/fog.ts');
  await commit('k4: rename the view model');
  touch('src/core/fog.ts', 'docs/fog.md');
  await commit('k5: fog and its doc');
  // k6: a bulk commit (201 generated files and the readme): left out of the counting, counted.
  touch(...Array.from({ length: 201 }, (_, i) => `gen/g${String(i).padStart(3, '0')}.ts`), 'README.md');
  await commit('k6: generated files');
  // q1..q10: a changelog alone, so everything above is older than the last 10 commits (#211's flag window).
  for (let q = 1; q <= 10; q++) {
    touch('docs/log.md');
    await commit(`q${q}: changelog`);
  }
  // k7, the latest: the fog core and its test, but not the view model.
  touch('src/core/fog.ts', 'test/fog.test.ts');
  await commit('k7: fog and its test only');
  return { dir, shas, head: shas.at(-1)! };
}
