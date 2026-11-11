// The render checks (suite.ts) on the stand-in view (#31 AC 1-6). The stand-in is what the negative
// tests break, so this proves the harness on a scene that isn't the product; view.spec.ts runs the
// same checks on the real view (AC 8).
import { standin } from './harness.js';
import { LATER, renderSuite } from './suite.js';

renderSuite('standin', standin, [
  { frame: 0, reducedMotion: false },
  { frame: LATER, reducedMotion: false },
  { frame: LATER, reducedMotion: true },
]);
