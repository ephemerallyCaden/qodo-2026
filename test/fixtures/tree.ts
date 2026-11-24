// The directory view's file list (#209) for the mini contract fixture: a path for every file of
// miniFog, by the body mini's layout puts it on, and the folders they're in.
import type { DirId, FileId } from '../../src/core/snapshot/types.js';
import type { TreeSource } from '../../web/src/tree/model.js';
import { miniLayout } from './contract/mini.js';

const f = (id: string, path: string) => ({ id: `f_${id}` as FileId, path });
const d = (id: string, path: string) => ({ id: `d_${id}` as DirId, path });

export const miniTree: TreeSource = {
  head: miniLayout.source.head,
  dirs: [d('00000000000a', 'src'), d('00000000000b', 'src/core'), d('00000000000c', 'web'), d('00000000000d', 'docs'),
    d('0000000000e1', 'test'), d('0000000000e2', 'test/fixtures'), d('0000000000e3', 'test/web')],
  files: [
    f('000000000001', 'README.md'), // root files and an unmatched test: moonlets
    f('000000000002', 'package.json'),
    f('000000000003', 'test/misc.test.ts'),
    f('00000000000a', 'src/a.ts'), // src: settlements at cells 0, 13 and (in the src/core continent) 21
    f('00000000000b', 'src/b.ts'),
    f('00000000000c', 'src/core/c.ts'),
    f('0000000000a1', 'test/a.test.ts'), // src's test moon
    f('00000000000d', 'web/main.ts'), // web: one settlement and 24 test moons
    ...Array.from({ length: 24 }, (_, i) => f(`0000000000${(0xb0 + i).toString(16)}`, `test/web/m${String(i).padStart(2, '0')}.test.ts`)),
    f('00000000000e', 'docs/x.md'), // docs: two settlements and one file its full surface can't place
    f('00000000000f', 'docs/y.md'),
    f('000000000010', 'docs/z.md'),
    f('000000000011', 'test/fixtures/a.json'), // test data: counted on the star, never drawn
    f('000000000012', 'test/fixtures/b.json'),
  ],
};
