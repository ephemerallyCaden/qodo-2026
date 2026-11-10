// Pixel-pass sizing (art-direction §3), pure: the internal target is 16:9 at 120..480 px tall and
// is upscaled by the largest whole factor that fits.

export const PIXEL_HEIGHT = { min: 120, max: 480, default: 180 } as const;

/** Internal height clamped to the slider's range, as a whole number of pixels. */
export const clampPixelHeight = (h: number | undefined): number =>
  h !== undefined && Number.isFinite(h) ? Math.min(PIXEL_HEIGHT.max, Math.max(PIXEL_HEIGHT.min, Math.round(h))) : PIXEL_HEIGHT.default;
/** 16:9, floored so e.g. 240 tall → 426 wide still fits ×3 on 1280 (asset viewer frameWidth). */
export const frameWidth = (h: number): number => Math.floor((h * 16) / 9);
/** The largest whole upscale factor that fits the available device pixels (at least 1). */
export const upscaleFactor = (w: number, h: number, availW: number, availH: number): number =>
  Math.max(1, Math.floor(Math.min(availW / w, availH / h)));
