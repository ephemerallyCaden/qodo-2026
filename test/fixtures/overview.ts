// Self-like layouts for the overview readability rule (#59): the shapes `commet scan` gave for
// Commet's own repo at 04f5ff1 (slots, planet radii, phases, moon counts), with made-up ids and
// paths. `selfLike` is the scan without content roots (6 outer planets on slots 0-5); `selfLikeRoots`
// is `--root src` (6 content planets on slots 0-5, 5 outer ones on slots 9-13, the widest overview).
// Every planet is healthy, as in the scan; the readability test swaps one planet's band itself.
import type { Health, LayoutV1, Planet, PlanetZone } from '../../src/core/contract/layout.js';

const HEAD = '4444444444444444444444444444444444444444';
const healthy: Health = { band: 'healthy', markersPerKlocMilli: 0, debtUnknownFiles: 0, qodoOpen: null, qodoUnknown: true };
const hex = (n: number, width = 12) => n.toString(16).padStart(width, '0');

/** [slot index, slot radiusMilli, phaseMilliturn, planet radiusMilli, loc, biomeSeed, moons] */
type Row = [number, number, number, number, number, number, number];

function planet(i: number, zone: PlanetZone, [index, orbit, phase, radius, loc, seed, moons]: Row): Planet {
  const dirId = `d_${hex(0x100 + i)}` as const, fileId = `f_${hex(0x100 + i)}` as const;
  return {
    dirId, path: `${zone === 'content' ? 'main/' : ''}folder-${i}`, zone, bornSeq: i + 1, partner: null,
    slot: { index, radiusMilli: orbit, phaseMilliturn: phase },
    radiusMilli: radius, loc, biomeSeed: seed, health: healthy,
    surface: {
      grid: { kind: 'fibonacci', cells: 16 },
      continents: [{ dirId, parent: null, seedCell: 0 }],
      settlements: [{ fileId, dirId, cell: 0, loc, size: 3, health: healthy }],
      overflow: 0,
    },
    moons: Array.from({ length: moons }, (_, m) => ({ fileId: `f_${hex(0x10000 + i * 0x100 + m)}` as const, testOf: fileId, slot: m })),
    moonOverflow: 0,
  };
}

function layout(roots: string[], content: Row[], outer: Row[]): LayoutV1 {
  return {
    schemaVersion: 'layout.1',
    source: { repoId: 'r_000000000044', head: HEAD, roots },
    constants: { slotSpacingMilli: 24000, maxPlanetRadiusMilli: 12000, moonCap: 24 },
    star: {
      repoId: 'r_000000000044',
      moonlets: Array.from({ length: 24 }, (_, m) => ({ fileId: `f_${hex(0x20000 + m)}` as const, kind: 'root-file' as const, slot: m })),
      moonletOverflow: 3,
      testData: 25,
    },
    planets: [...content.map((r) => ['content', r] as const), ...outer.map((r) => ['outer', r] as const)].map(([zone, r], i) => planet(i, zone, r)),
  };
}

/** The scan without content roots: six outer planets on slots 0-5. */
const OUTER: Row[] = [
  [0, 30000, 0, 6540, 421, 3077608355, 0],
  [1, 54000, 618, 8031, 1674, 284253756, 0],
  [2, 78000, 236, 9495, 6479, 3706913245, 23],
  [3, 102000, 854, 4740, 79, 3967404248, 6],
  [4, 126000, 472, 8232, 2015, 1448765494, 4],
  [5, 150000, 90, 8766, 3301, 2571284934, 6],
];
/** With `--root src`: the main folder's six subfolders on slots 0-5 ... */
const CONTENT: Row[] = [
  [0, 30000, 0, 8527, 2647, 59599577, 9],
  [1, 54000, 618, 7611, 1134, 709411223, 3],
  [2, 78000, 236, 7530, 1053, 38745571, 2],
  [3, 102000, 854, 6588, 440, 2382316556, 1],
  [4, 126000, 472, 6986, 636, 95462171, 5],
  [5, 150000, 90, 6844, 558, 3783767287, 3],
];
/** ... and the other top-level folders past the gap, on slots 9-13. */
const OUTER_PAST_ROOT: Row[] = [
  [9, 246000, 562, 6540, 421, 3077608355, 0],
  [10, 270000, 180, 8031, 1674, 284253756, 0],
  [11, 294000, 798, 4740, 79, 3967404248, 6],
  [12, 318000, 416, 8232, 2015, 1448765494, 4],
  [13, 342000, 34, 8766, 3301, 2571284934, 6],
];

/** No content roots: six outer planets on slots 0-5 (extent about 16.5 render units). */
export const selfLike: LayoutV1 = layout([], [], OUTER);

/** One content root: six content planets on slots 0-5, five outer ones on slots 9-13 (extent about 35.7). */
export const selfLikeRoots: LayoutV1 = layout(['main'], CONTENT, OUTER_PAST_ROOT);
