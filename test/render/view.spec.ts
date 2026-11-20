// The render checks (suite.ts) on the real system view (#31 AC 8): the web/ bundle built into
// dist/web (global-setup.ts), on the contract's `mini` fixture with the view's own start pose, at
// frame 0 and a later frame, with reduced motion on and off.
import { systemView } from './harness.js';
import { LATER, renderSuite } from './suite.js';

renderSuite('view', systemView, [
  { frame: 0, reducedMotion: false },
  { frame: 0, reducedMotion: true },
  { frame: LATER, reducedMotion: false },
  { frame: LATER, reducedMotion: true },
]);
