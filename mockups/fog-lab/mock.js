// The fog lab's planets, coverage, reasons, footprints, fog state over time and cell texture. They
// live in the asset viewer now (../asset-viewer/fog-layout.js: the demo planets, the territory rule
// and the events, which the viewer's D2d uses); the lab re-exports them under its old names.
export {
  FOOTPRINTS, REASONS, COVERAGES, mulberry32, hash01, chartedAt, neighbours, coverRadius, COVER_256, footprint,
  EVENT, stateAt, TEX_ROWS, cellData, shares, DEMO_PLANETS as PLANETS, demoPlanet as mockPlanet,
} from '../asset-viewer/fog-layout.js';
