// Invented debris views (R13) for the view's tests: `perBody` pieces round every planet of a layout and the star,
// classes, ages and sizes cycling, so a test can fill a busy system without a scanned repository. Ids and seeds
// are deterministic; nothing names a real branch. The contract's own mini fixture is test/fixtures/contract/mini.ts
// `miniDebris`.
import type { DebrisClass, DebrisId, DebrisPiece, DebrisView } from '../../src/core/contract/debris.js';
import type { LayoutV1 } from '../../src/core/contract/layout.js';

const CLASSES: readonly Exclude<DebrisClass, 'pr'>[] = ['branch', 'merged', 'agent'];
const LINES = [12, 60, 240, 900, 3000, 9000];

/** A debris view of `layout`'s head with `perBody` pieces round each planet and the star (`homes` picks fewer). */
export function debrisViewOf(layout: LayoutV1, perBody: number, homes: readonly string[] = [...layout.planets.map((p) => p.dirId), 'star']): DebrisView {
  const pieces: DebrisPiece[] = homes.flatMap((home, h) => Array.from({ length: perBody }, (_, i) => {
    const cls = CLASSES[(i + h) % CLASSES.length]!;
    return {
      id: `x_${(h * 4096 + i).toString(16).padStart(12, '0')}` as DebrisId, cls, home: home as DebrisPiece['home'],
      ageStep: ([0, 1, 2] as const)[(i + Math.floor(i / 3)) % 3]!, lines: cls === 'merged' ? 0 : LINES[(i * 7 + h) % LINES.length]!, seed: (i * 2654435761 + h * 40503 + 17) >>> 0,
    };
  }));
  pieces.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    schemaVersion: 'debris.1', head: layout.source.head, pieces, total: pieces.length, placed: pieces.length,
    mass: pieces.reduce((n, p) => n + p.lines, 0), unreadable: 0, prs: 'not-read', needsRescan: false,
  };
}
