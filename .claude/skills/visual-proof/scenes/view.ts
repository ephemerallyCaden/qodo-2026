// The viewport every take uses: the render tests' context (playwright.config.ts), 1 CSS px = 1 frame px.
import { context } from '../../../../playwright.config.js';

export const VIEW = { width: context.viewport?.width ?? 1280, height: context.viewport?.height ?? 720 } as const;
