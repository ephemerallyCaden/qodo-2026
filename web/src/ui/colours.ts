// The UI's colour roles, named once and taken from the palette (AGENTS.md Rule 5). The page CSS
// (web/vite.config.ts), the labels and the HUD all read this table.
import { palette } from '../../../src/core/palette.js';

export const UI_COLOURS = {
  /** Page and label backing: space itself. */
  space: palette.world.space,
  /** Label and HUD text. */
  ink: palette.world.cloud[3],
  /** Secondary text (help, error detail). */
  dim: palette.world.stars[1],
  /** HUD marks (the focused planet, keyboard focus, controls): the [OIII] teal. */
  accent: palette.accent.teal[3],
} as const;
