// Hand-written Phase 2 contract fixtures (#29). The renderer (#30) and render tests (#31) load the
// JSON twins next to this file; test/contract.test.ts keeps them byte-equal to these values.
// Three planets: src (healthy, no partner), web (toxic, partner src, moon overflow), docs
// (ash, debt partly unknown, surface overflow). Root files and an unmatched test are moonlets.
import type { FogView } from '../../../src/core/contract/fog.js';
import type { Health, LayoutV1 } from '../../../src/core/contract/layout.js';

const HEAD = '1111111111111111111111111111111111111111';
const healthy: Health = { band: 'healthy', markersPerKlocMilli: 0, debtUnknownFiles: 0, qodoOpen: null, qodoUnknown: true };
const toxic: Health = { band: 'toxic', markersPerKlocMilli: 9000, debtUnknownFiles: 0, qodoOpen: null, qodoUnknown: true };
const ash: Health = { band: 'ash', markersPerKlocMilli: 3000, debtUnknownFiles: 1, qodoOpen: null, qodoUnknown: true };

export const miniLayout: LayoutV1 = {
  schemaVersion: 'layout.1',
  source: { repoId: 'r_000000000001', head: HEAD },
  constants: { slotSpacingMilli: 24000, maxPlanetRadiusMilli: 12000, moonCap: 24 },
  star: {
    repoId: 'r_000000000001',
    moonlets: [
      { fileId: 'f_000000000001', kind: 'root-file', slot: 0 },
      { fileId: 'f_000000000002', kind: 'root-file', slot: 1 },
      { fileId: 'f_000000000003', kind: 'unmatched-test', slot: 2 },
    ],
    moonletOverflow: 0,
    testData: 2,
  },
  planets: [
    {
      dirId: 'd_00000000000a', path: 'src', bornSeq: 1, partner: null,
      slot: { index: 0, radiusMilli: 30000, phaseMilliturn: 0 },
      radiusMilli: 10000, loc: 1200, biomeSeed: 1234567, health: healthy,
      surface: {
        grid: { kind: 'fibonacci', cells: 64 },
        continents: [
          { dirId: 'd_00000000000a', parent: null, seedCell: 0 },
          { dirId: 'd_00000000000b', parent: 'd_00000000000a', seedCell: 21 },
        ],
        settlements: [
          { fileId: 'f_00000000000a', dirId: 'd_00000000000a', cell: 0, loc: 600, size: 4, health: healthy },
          { fileId: 'f_00000000000b', dirId: 'd_00000000000a', cell: 13, loc: 300, size: 3, health: healthy },
          { fileId: 'f_00000000000c', dirId: 'd_00000000000b', cell: 21, loc: 300, size: 3, health: healthy },
        ],
        overflow: 0,
      },
      moons: [{ fileId: 'f_0000000000a1', testOf: 'f_00000000000a', slot: 0 }],
      moonOverflow: 0,
    },
    {
      dirId: 'd_00000000000c', path: 'web', bornSeq: 4, partner: 'd_00000000000a',
      slot: { index: 1, radiusMilli: 54000, phaseMilliturn: 250 },
      radiusMilli: 7000, loc: 400, biomeSeed: 7654321, health: toxic,
      surface: {
        grid: { kind: 'fibonacci', cells: 64 },
        continents: [{ dirId: 'd_00000000000c', parent: null, seedCell: 0 }],
        settlements: [{ fileId: 'f_00000000000d', dirId: 'd_00000000000c', cell: 0, loc: 400, size: 3, health: toxic }],
        overflow: 0,
      },
      moons: Array.from({ length: 24 }, (_, i) => ({ fileId: `f_0000000000${(0xb0 + i).toString(16)}` as const, testOf: 'f_00000000000d' as const, slot: i })),
      moonOverflow: 2,
    },
    {
      dirId: 'd_00000000000d', path: 'docs', bornSeq: 2, partner: null,
      slot: { index: 2, radiusMilli: 78000, phaseMilliturn: 600 },
      radiusMilli: 5000, loc: 200, biomeSeed: 42, health: ash,
      surface: {
        grid: { kind: 'fibonacci', cells: 2 },
        continents: [{ dirId: 'd_00000000000d', parent: null, seedCell: 0 }],
        settlements: [
          { fileId: 'f_00000000000e', dirId: 'd_00000000000d', cell: 0, loc: 120, size: 2, health: ash },
          { fileId: 'f_00000000000f', dirId: 'd_00000000000d', cell: 1, loc: 80, size: 2, health: ash },
        ],
        overflow: 1,
      },
      moons: [], moonOverflow: 0,
    },
  ],
};

const fileIds = [
  ...miniLayout.star.moonlets.map((m) => m.fileId),
  ...miniLayout.planets.flatMap((p) => [...p.surface.settlements.map((s) => s.fileId), ...p.moons.map((m) => m.fileId)]),
  'f_000000000010', // docs' surface overflow: in the snapshot and the fog, but has no cell
  'f_000000000011', // test data (#23): counted on the star, in the fog, never drawn
  'f_000000000012',
].sort();
const FOGGED: Record<string, FogView['files'][number]> = {
  f_00000000000d: { fileId: 'f_00000000000d', state: 'fogged', reasons: ['agent', 'self-committed-agent-written'], since: '2222222222222222222222222222222222222222' },
  f_000000000003: { fileId: 'f_000000000003', state: 'fogged', reasons: ['unknown'], since: '3333333333333333333333333333333333333333' },
  f_00000000000a: { fileId: 'f_00000000000a', state: 'charted', reasons: [], since: null },
};

export const miniFog: FogView = {
  schemaVersion: 'fog.1',
  head: HEAD,
  baseline: null,
  files: fileIds.map((id) => FOGGED[id] ?? { fileId: id as `f_${string}`, state: 'clear', reasons: [], since: null }),
  planets: [
    { dirId: 'd_00000000000a', total: 4, fogged: 0 },
    { dirId: 'd_00000000000c', total: 25, fogged: 1 },
    { dirId: 'd_00000000000d', total: 3, fogged: 0 },
  ],
  star: { total: 5, fogged: 1 },
};
