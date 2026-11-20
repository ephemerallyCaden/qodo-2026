// `window.__commet` in test mode (docs/contracts/phase2.md, Render hook), for the stand-in and the harness.
import type { RenderHook } from '../../src/core/contract/api.js';

declare global {
  interface Window { __commet?: RenderHook }
}
