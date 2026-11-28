// The demo journey (live-demo L7), shared by the monitor's check and the controlled-failure drill: open the
// public demo as an anonymous visitor, see the title screen and its DEMO label, press Play, see a drawn
// frame, focus a planet the way a visitor does (`]`), and read what the info panel says about it. The
// planet's path and file count come from the site's own baked data (its manifest and layout), never from
// numbers written here. Plain Playwright only, so Checkly's runtime and a local `playwright test` run the
// same code.
import { inflateSync } from 'node:zlib';
import { expect, type Page } from '@playwright/test';

/** The public demo on GitHub Pages; DEMO_URL points the same journey at a local build. */
export const DEMO_URL = process.env['DEMO_URL'] ?? 'https://ephemerallycaden.github.io/qodo-2026/';

/** The space colour (src/core/palette.ts `world.space`): what a blank canvas is all of. */
const SPACE = [0x0d, 0x0b, 0x16] as const;
/** A frame that drew something: at least this many colours and this share off space (test/render/thresholds.ts BLANK, OVERVIEW). */
const MIN_COLOURS = 12;
const MIN_NON_SPACE = 0.005;

/** A screenshot's pixels: 8-bit RGB or RGBA, non-interlaced, any row filter. */
function pixels(png: Buffer): { width: number; height: number; at: (i: number) => [number, number, number] } {
  const chunks: Buffer[] = [];
  let ihdr: Buffer | null = null;
  for (let at = 8; at + 8 <= png.length;) {
    const len = png.readUInt32BE(at), type = png.toString('latin1', at + 4, at + 8);
    if (type === 'IHDR') ihdr = png.subarray(at + 8, at + 8 + len);
    else if (type === 'IDAT') chunks.push(png.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  if (!ihdr) throw new Error('the screenshot is not a PNG');
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4), bpp = ihdr[9] === 6 ? 4 : ihdr[9] === 2 ? 3 : 0;
  if (ihdr[8] !== 8 || bpp === 0 || ihdr[12] !== 0) throw new Error('the screenshot is not an 8-bit RGB(A) PNG');
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * bpp, out = new Uint8Array(width * height * 3);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const cur = new Uint8Array(stride), row = y * (stride + 1), filter = raw[row]!;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp]! : 0, b = prev[x]!, c = x >= bpp ? prev[x - bpp]! : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      cur[x] = (raw[row + 1 + x]! + pred) & 255;
    }
    for (let x = 0; x < width; x++) for (let k = 0; k < 3; k++) out[(y * width + x) * 3 + k] = cur[x * bpp + k]!;
    prev = cur;
  }
  return { width, height, at: (i) => [out[i * 3]!, out[i * 3 + 1]!, out[i * 3 + 2]!] };
}

/**
 * The address of one of the site's own data files: a plain `.json` name in its `data/` folder, as the demo's
 * manifest names them, and never anything off the site (Qodo PR256 2c6b344c).
 */
export function dataUrl(file: string, site: string = DEMO_URL): string {
  const base = new URL('data/', site);
  const url = new URL(file, base);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(file) || url.origin !== base.origin || url.href !== `${base.href}${file}`) {
    throw new Error(`${JSON.stringify(file)} is not a plain .json file of the site's data`);
  }
  return url.href;
}

/** The planet a visitor reaches with one `]` from the start: the layout's first, its path and its surface file count. */
export async function firstPlanet(page: Page): Promise<{ path: string; files: number }> {
  const get = async (file: string) => {
    const res = await page.request.get(dataUrl(file));
    expect(res.status(), `data/${file}`).toBe(200);
    return res.json() as Promise<unknown>;
  };
  const manifest = await get('manifest.json') as { routes?: Record<string, string> };
  const layoutFile = manifest.routes?.['/api/layout'];
  expect(layoutFile, 'the manifest names the layout').toBeTruthy();
  const layout = await get(layoutFile!) as { planets?: { path: string; surface: { settlements: unknown[] } }[] };
  const p = layout.planets?.[0];
  expect(p, 'the layout has a planet').toBeTruthy();
  return { path: p!.path, files: p!.surface.settlements.length };
}

/** The drill's planet: no dataset has it, so its check can't pass. */
export const NO_SUCH_PLANET = { path: 'drill/no-such-planet', files: 404 } as const;

export interface Visit { offsite: string[]; errors: string[] }

/**
 * Opens the demo (`url`: the site), recording page errors and console errors. Every request the page makes
 * to another origin is stopped before it leaves the browser and recorded, so the check fails on it and
 * nothing was sent (Qodo PR256 2c6b344c); the site's own requests go on as they would.
 */
export async function open(page: Page, url: string = DEMO_URL): Promise<Visit> {
  const origin = new URL(url).origin;
  const v: Visit = { offsite: [], errors: [] };
  page.on('pageerror', (e) => v.errors.push(`page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') v.errors.push(`console.error: ${m.text()}`); });
  await page.route('**/*', async (r) => {
    const o = new URL(r.request().url()).origin;
    if (o === origin) return r.fallback();
    v.offsite.push(o);
    return r.abort('blockedbyclient');
  });
  const res = await page.goto(url);
  expect(res?.status(), 'the demo page').toBe(200);
  return v;
}

/**
 * The whole journey. `planet` is what the info panel must name after one `]`: the dataset's first planet
 * for the monitor, or one that doesn't exist for the drill, which must fail here.
 */
export async function journey(page: Page, planet: { path: string; files: number }, v: Visit): Promise<void> {
  // the title screen, frozen until Play
  await expect(page.locator('#demo-title')).toBeVisible();
  await expect(page.locator('#demo-label')).toHaveText('DEMO: invented data');
  // Play starts the real view: the summary says what the canvas shows once the system is drawn
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.locator('#demo-title')).toBeHidden();
  await expect(page.locator('#summary')).toContainText('planets:', { timeout: 60_000 });
  await expect(page.locator('#demo-badge')).toContainText('Demo: invented data');
  await page.keyboard.press('Escape'); // the legend, which opens with Play
  // a drawn frame, not a blank canvas
  const shot = pixels(await page.locator('#view').screenshot());
  const colours = new Set<number>();
  let nonSpace = 0;
  for (let i = 0; i < shot.width * shot.height; i++) {
    const [r, g, b] = shot.at(i);
    colours.add((r << 16) | (g << 8) | b);
    if (r !== SPACE[0] || g !== SPACE[1] || b !== SPACE[2]) nonSpace++;
  }
  expect(colours.size, 'colours in the view').toBeGreaterThanOrEqual(MIN_COLOURS);
  expect(nonSpace / (shot.width * shot.height), 'share of the view off the space colour').toBeGreaterThanOrEqual(MIN_NON_SPACE);
  // focus the first planet as a visitor does, and read the info panel's words for it
  await page.locator('#view').press(']');
  await expect(page.locator('#status')).toContainText(`focused ${planet.path}`);
  await expect(page.locator('#summary')).toContainText(`${planet.path}.`);
  await expect(page.locator('#summary')).toContainText(`${planet.files} ${planet.files === 1 ? 'file' : 'files'} on the surface`);
  expect(v.offsite, 'requests to any other origin').toEqual([]);
  expect(v.errors, 'page and console errors').toEqual([]);
}
