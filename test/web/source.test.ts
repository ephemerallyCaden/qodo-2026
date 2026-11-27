// Mechanical checks on the web view's source and built bundle (#30): no stock lit materials,
// filtering or anti-aliasing (Rule 4), and a dist/web that suits the server's CSP and carries no dev
// fixtures. Colour literals in web/ are test/palette.test.ts's job (Rule 5); clocks are ESLint's (Rule 3).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../..');
const WEB = join(ROOT, 'web');
const DIST = join(ROOT, 'dist/web');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
}
const sources = files(WEB).filter((f) => /\.(ts|css|html|glsl)$/.test(f));
const read = (f: string) => readFileSync(f, 'utf8');
const hits = (re: RegExp) => sources.flatMap((f) => read(f).split('\n').flatMap((line, i) => (re.test(line) ? [`${relative(ROOT, f)}:${i + 1}: ${line.trim()}`] : [])));

describe('web source', () => {
  it('exists', () => {
    expect(sources.length).toBeGreaterThan(10); // guards against a vacuous pass
  });

  it('uses no stock lit materials, shadow maps, smoothing filters, mipmaps or anti-aliasing (Rule 4)', () => {
    expect(hits(/Mesh(Standard|Physical|Phong|Lambert|Toon|Basic)Material|shadowMap|LinearFilter|LinearMipmap|generateMipmaps: true|antialias: true|EffectComposer/)).toEqual([]);
  });

  it('reaches src/core only through modules with no package imports, as the render stand-ins serve src/core unbundled (#79 PR #165 CI)', () => {
    // The fog-events and stand-in pages mount web/src and src/core as plain ES modules, so a package
    // import anywhere in the core files the view uses (e.g. the fog core's @noble/hashes) stops the page.
    const seen = new Set<string>();
    const bare: string[] = [];
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const m of read(file).matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+'([^']+)'|^\s*import\s+'([^']+)'/gm)) {
        const spec = (m[1] ?? m[2])!;
        if (!spec.startsWith('.')) { if (file.startsWith(join(ROOT, 'src/core'))) bare.push(`${relative(ROOT, file)}: ${spec}`); continue; }
        const target = resolve(dirname(file), spec).replace(/\.js$/, '.ts');
        if (target.startsWith(join(ROOT, 'src/core')) && existsSync(target)) visit(target);
      }
    };
    for (const f of sources.filter((x) => x.endsWith('.ts') && x.startsWith(join(WEB, 'src')))) visit(f);
    expect([...seen].some((f) => f.startsWith(join(ROOT, 'src/core')))).toBe(true); // not vacuous
    expect(bare).toEqual([]);
  });

});

describe.skipIf(!existsSync(join(DIST, 'index.html')))('built bundle (dist/web, after npm run build)', () => {
  const html = existsSync(join(DIST, 'index.html')) ? read(join(DIST, 'index.html')) : '';
  const assets = existsSync(join(DIST, 'assets')) ? files(join(DIST, 'assets')) : [];

  it('loads only its own files, so the server CSP needs no inline or remote source', () => {
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]!);
    expect(refs.length).toBeGreaterThan(0);
    for (const r of refs) expect(r).toMatch(/^\.\/assets\/[\w.-]+\.(js|css)$/);
    expect(html).not.toMatch(/<script>|<script [^>]*>[^<]|<style|style="/);
  });

  it('carries no dev fixture data', () => {
    for (const f of assets) expect(read(f)).not.toMatch(/r_000000000001|f_00000000000a|feature\/web-ui/);
  });
});
