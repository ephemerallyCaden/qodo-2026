// Scene start-focus: the generic one, with motion. The system from its start pose for two seconds of
// loop time (planets turning, orbits moving), then `]` focuses the first planet and the camera glides
// to it. Good for any change to how the system or a focused planet is drawn.
import type { Scene } from '../scripts/scene.js';

export const startFocus: Scene = {
  name: 'start-focus',
  summary: "This repo's own system from the start pose, then the first planet focused with `]` as the camera glides in",
  async run(s) {
    await s.dismissOffer();
    await s.record(40);
    s.still('start pose, two seconds in');
    await s.page.focus('#view');
    await s.press(']');
    await s.record(40);
    s.still(`first planet focused (${(await s.heading()) ?? 'none'})`);
  },
};
