// Every scene /visual-proof can run, by name. To add one: a module beside this one exporting a Scene
// (../scripts/scene.ts says what it may do), listed here. `vp.sh scenes` prints this list.
import type { Scene } from '../scripts/scene.js';
import { dronePanel } from './drone-panel.js';
import { fogLevels } from './fog-levels.js';
import { panelLabels } from './panel-labels.js';
import { startFocus } from './start-focus.js';

export const SCENES: Readonly<Record<string, Scene>> = Object.fromEntries([panelLabels, dronePanel, startFocus, fogLevels].map((s) => [s.name, s]));
