// The public demo (live-demo L3–L5, L8): the built site in dist/demo (global-setup.ts builds it), opened at
// its Pages base path from an in-memory origin, as an anonymous visitor would. Every request is answered
// from dist/demo by interception; one to any other origin is refused and fails the test. It opens on the
// title screen, frozen; Play starts the real view, which draws a frame that isn't blank and moves; focusing
// a planet shows its name and file count (the Checkly check's journey, L7).
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { inflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import type { DiffView, UnseenFile, UnseenList } from '../../src/core/contract/api.js';
import type { FogCounts, FogView } from '../../src/core/contract/fog.js';
import type { LayoutV1 } from '../../src/core/contract/layout.js';
import { DEFAULT_BASE, DEMO_DIST, ROOT, siteHits } from '../../web/demo/site.js';
import { coverage, type Frame } from './frame.js';
import { BLANK, OVERVIEW } from './thresholds.js';

const ORIGIN = 'http://demo.commet.test';
const SITE = join(ROOT, DEMO_DIST);
const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

/** A route's baked answer, as the site serves it, or null when the dataset doesn't have it. */
function baked<T>(route: string): T | null {
  const manifest = JSON.parse(readFileSync(join(SITE, 'data/manifest.json'), 'utf8')) as { routes: Record<string, string> };
  const file = manifest.routes[route];
  return file === undefined ? null : JSON.parse(readFileSync(join(SITE, 'data', file), 'utf8')) as T;
}
/** The dataset's layout: what the info panel must say about a planet. */
const bakedLayout = () => baked<LayoutV1>('/api/layout')!;

/** The first planet the dataset can be reviewed on: a fogged file in its unseen list with a whole text diff (opening it charts it). */
function reviewable(): { index: number; path: string; dirId: string; file: UnseenFile; counts: FogCounts } | null {
  const layout = bakedLayout(), fog = baked<FogView>('/api/fog')!;
  for (const [index, p] of layout.planets.entries()) {
    const list = baked<UnseenList>(`/api/unseen?home=${p.dirId}`);
    const file = list?.files[0];
    const diff = file ? baked<DiffView>(`/api/diff?fileId=${file.fileId}`) : null;
    const counts = fog.planets.find((c) => c.dirId === p.dirId);
    if (file && diff && counts && !diff.truncated && diff.sections.length > 0 && diff.sections.every((x) => !x.binary && x.hunks.length > 0)) {
      return { index, path: p.path, dirId: p.dirId, file, counts };
    }
  }
  return null;
}

interface Visit { page: Page; offsite: string[]; requests: { method: string; path: string }[]; errors: string[] }

/** Opens the site at its base path. Records every request, refuses any off the site's own origin, and collects page and console errors (a CSP refusal is one). */
async function visit(page: Page): Promise<Visit> {
  const v: Visit = { page, offsite: [], requests: [], errors: [] };
  page.on('pageerror', (e) => v.errors.push(`page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') v.errors.push(`console.error: ${m.text()}`); });
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin !== ORIGIN) { v.offsite.push(url.origin); return route.abort('blockedbyclient'); }
    v.requests.push({ method: req.method(), path: url.pathname });
    if (!url.pathname.startsWith(DEFAULT_BASE)) return route.fulfill({ status: 404, body: 'not found' });
    const rel = decodeURIComponent(url.pathname.slice(DEFAULT_BASE.length)) || 'index.html';
    const file = resolve(SITE, rel);
    if (!file.startsWith(SITE + sep) || !existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ contentType: MIME[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
  });
  await page.goto(`${ORIGIN}${DEFAULT_BASE}`);
  return v;
}

/**
 * A browser screenshot as RGBA: 8-bit RGB or RGBA, non-interlaced, any row filter (png.ts reads only the
 * unfiltered RGBA PNGs the goldens are written as).
 */
function screenshotPixels(png: Buffer): Frame {
  const chunks: Buffer[] = [];
  let ihdr: Buffer | null = null;
  for (let at = 8; at + 8 <= png.length;) {
    const len = png.readUInt32BE(at), type = png.toString('latin1', at + 4, at + 8), data = png.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') chunks.push(data);
    at += 12 + len;
  }
  if (!ihdr) throw new Error('screenshot PNG has no IHDR');
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4), depth = ihdr[8], kind = ihdr[9], interlace = ihdr[12];
  const bpp = kind === 6 ? 4 : kind === 2 ? 3 : 0;
  if (depth !== 8 || bpp === 0 || interlace !== 0) throw new Error(`screenshot PNG is not 8-bit RGB(A) non-interlaced (depth ${depth}, colour type ${kind})`);
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * bpp;
  const cur = new Uint8Array(stride), prev = new Uint8Array(stride), rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1), filter = raw[row]!;
    for (let x = 0; x < stride; x++) {
      const v = raw[row + 1 + x]!, a = x >= bpp ? cur[x - bpp]! : 0, b = prev[x]!, c = x >= bpp ? prev[x - bpp]! : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      cur[x] = (v + pred) & 255;
    }
    for (let x = 0; x < width; x++) {
      for (let k = 0; k < 3; k++) rgba[(y * width + x) * 4 + k] = cur[x * bpp + k]!;
      rgba[(y * width + x) * 4 + 3] = bpp === 4 ? cur[x * bpp + 3]! : 255;
    }
    prev.set(cur);
  }
  return { width, height, rgba };
}

/** The view canvas as the visitor sees it, with what's laid over it. */
async function shot(page: Page): Promise<Frame> {
  return screenshotPixels(await page.locator('#view').screenshot({ animations: 'disabled' }));
}
/** A whole system from its start pose isn't blank: the overview floor (system-design §10; the 5% one is for the golden fixtures), and 12 colours. */
const notBlank = (f: Frame) => {
  const { colours, nonSpace } = coverage(f);
  expect(colours, 'unique colours in the view').toBeGreaterThanOrEqual(BLANK.minColours);
  expect(nonSpace / (f.width * f.height), 'share of the view off the space colour').toBeGreaterThanOrEqual(OVERVIEW.minNonSpaceFraction);
};
const same = (a: Frame, b: Frame) => a.width === b.width && a.height === b.height && Buffer.from(a.rgba).equals(Buffer.from(b.rgba));

/** Presses Play and waits until the live view has drawn its system (the summary says what it shows). */
async function play(v: Visit): Promise<void> {
  await v.page.getByRole('button', { name: 'Play' }).click();
  await expect(v.page.locator('#demo-title')).toBeHidden();
  await expect(v.page.locator('#summary')).toContainText('planets:', { timeout: 60_000 }); // SwiftShader compiles every shader first
}

test.describe('demo site', () => {
  test('is a static site that passes the privacy scan, with a strict CSP and nothing inline', () => {
    expect(existsSync(join(SITE, 'index.html')), 'global-setup builds dist/demo').toBe(true);
    expect(existsSync(join(SITE, '.nojekyll'))).toBe(true);
    expect(siteHits(SITE)).toEqual([]);
    const html = readFileSync(join(SITE, 'index.html'), 'utf8');
    const head = html.slice(0, html.indexOf('</head>'));
    const csp = head.indexOf('http-equiv="Content-Security-Policy"');
    expect(csp, 'a CSP meta').toBeGreaterThan(0);
    expect(csp, 'the CSP comes before any script or stylesheet').toBeLessThan(head.search(/<script|<link/));
    expect(head).toMatch(/content="default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self';/);
    for (const r of [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]!)) {
      expect(r).toMatch(new RegExp(`^(?:${DEFAULT_BASE}assets/[\\w.-]+\\.(?:js|css)|\\./favicon\\.svg|https://github\\.com/ephemerallyCaden/qodo-2026)$`));
    }
    expect(html).not.toMatch(/<script>|<script [^>]*>[^<]|<style|\sstyle="|\son[a-z]+="/);
  });

  test('opens on the title screen, frozen, with the DEMO label and Play', async ({ page }) => {
    const v = await visit(page);
    await expect(page.locator('#demo-title')).toBeVisible();
    await expect(page.locator('#demo-label')).toHaveText('DEMO: invented data');
    await expect(page.getByRole('button', { name: 'Play' })).toBeFocused();
    await expect(page.locator('#demo-badge')).toBeHidden();
    // The still behind the card is drawn, and nothing moves until Play.
    await page.waitForFunction(() => (document.querySelector('#view') as HTMLCanvasElement | null)?.width !== 300);
    const a = await shot(page);
    await page.waitForTimeout(800);
    const b = await shot(page);
    expect(same(a, b), 'the title screen holds still').toBe(true);
    await page.evaluate(() => { document.getElementById('demo-title')!.style.visibility = 'hidden'; });
    notBlank(await shot(page));
    expect(v.offsite).toEqual([]);
    expect(v.errors).toEqual([]);
  });

  test('Play starts the real view: a frame that is not blank and moves, the badge and the legend', async ({ page }) => {
    const v = await visit(page);
    await play(v);
    await expect(page.locator('#demo-badge')).toBeVisible();
    await expect(page.locator('#demo-badge')).toContainText('Demo: invented data');
    const legend = page.locator('#demo-legend');
    await expect(legend).toBeVisible();
    await expect(legend).toContainText('fog of war');
    await page.keyboard.press('Escape');
    await expect(legend).toBeHidden();
    await expect(page.locator('#view')).toBeFocused();
    const a = await shot(page);
    notBlank(a);
    await page.waitForTimeout(1000);
    expect(same(a, await shot(page)), 'the system animates after Play').toBe(false);
    // Only the site's own files, all read with GET: no server route, no write leaves the page.
    expect(v.offsite).toEqual([]);
    expect(v.requests.filter((r) => r.method !== 'GET')).toEqual([]);
    expect(v.requests.filter((r) => !r.path.startsWith(DEFAULT_BASE))).toEqual([]);
    expect(v.errors).toEqual([]);
  });

  test('focusing a planet shows its name and file count (the monitor\'s journey)', async ({ page }) => {
    const v = await visit(page);
    await play(v);
    await page.keyboard.press('Escape'); // the legend
    await page.locator('#view').press(']');
    const p = bakedLayout().planets[0]!;
    const n = p.surface.settlements.length;
    await expect(page.locator('#summary')).toContainText(`${p.path}.`);
    await expect(page.locator('#summary')).toContainText(`${n} ${n === 1 ? 'file' : 'files'} on the surface`);
    await expect(page.locator('#status')).toContainText(`focused ${p.path}`);
    expect(v.offsite).toEqual([]);
    expect(v.errors).toEqual([]);
  });

  test('reviewing a file charts it: the fog over its planet thins, and a note becomes a beacon, all in the page', async ({ page }) => {
    const r = reviewable();
    test.skip(r === null, 'the dataset has no planet with an unseen file and its diff');
    const v = await visit(page);
    await play(v);
    await page.keyboard.press('Escape'); // the legend
    const files = (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`;
    const fogLine = (fogged: number, haze: number) => `uncharted: ${fogged} of ${files(r!.counts.total)}; ${haze} misted (read)`;
    for (let i = 0; i <= r!.index; i++) await page.locator('#view').press(']');
    await expect(page.locator('#status')).toContainText(`focused ${r!.path}`);
    await expect(page.locator('#summary')).toContainText(fogLine(r!.counts.fogged, r!.counts.haze));
    // the review panel lists the planet's unseen files; opening one shows its diff and marks it read
    const panel = page.locator('#panel');
    await panel.locator(`button[data-key="file:${r!.file.fileId}"]`).click();
    await expect(panel.locator('pre.diff')).toBeVisible();
    await expect(page.locator('#summary')).toContainText(fogLine(r!.counts.fogged - 1, r!.counts.haze + 1));
    // Chart with a captain's log note: the note is left as a beacon
    await panel.locator('input[data-key="note"]').fill('the entry point');
    await panel.locator('button[data-key="chart"]').click();
    await expect(page.locator('#status')).toContainText(`left a beacon: the entry point`);
    await expect(panel.locator(`button[data-key="file:${r!.file.fileId}"]`)).toHaveCount(0);
    // Nothing was sent: every request was a GET of the site's own files
    expect(v.requests.filter((q) => q.method !== 'GET' || !q.path.startsWith(DEFAULT_BASE))).toEqual([]);
    expect(v.offsite).toEqual([]);
    expect(v.errors).toEqual([]);
    // and a reload starts from the dataset again
    await page.reload();
    await play(v);
    await page.keyboard.press('Escape');
    for (let i = 0; i <= r!.index; i++) await page.locator('#view').press(']');
    await expect(page.locator('#summary')).toContainText(fogLine(r!.counts.fogged, r!.counts.haze));
  });
});
