import { readFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import { expect, it } from 'vitest';

const root = new URL('..', import.meta.url).pathname;
const eslint = new ESLint({ cwd: root });
const errors = async (code: string, filePath: string) =>
  (await eslint.lintText(code, { filePath }))[0]!.messages.map((m) => m.ruleId);

it('bans clocks and unseeded randomness in pipeline code', async () => {
  expect(await errors('export const r = Math.random();\n', 'src/core/x.ts')).toContain('no-restricted-properties');
  expect(await errors('export const t = Date.now();\n', 'src/core/x.ts')).toContain('no-restricted-properties');
  expect(await errors('export const t = Date.now();\n', 'src/attrib/x.ts')).toContain('no-restricted-properties');
  expect(await errors('export const d = new Date();\n', 'src/scan/x.ts')).toContain('no-restricted-syntax');
  expect(await errors("export const s = ['b', 'a'].sort((a, b) => a.localeCompare(b));\n", 'src/core/x.ts')).toContain('no-restricted-syntax');
});

it('keeps src/core isomorphic', async () => {
  expect(await errors("import { readFileSync } from 'node:fs';\nexport const f = readFileSync;\n", 'src/core/x.ts')).toContain('no-restricted-imports');
  expect(await errors("import { scan } from '../scan/index.js';\nexport const s = scan;\n", 'src/core/x.ts')).toContain('no-restricted-imports');
});

it('allows clocks outside the pipeline (CLI)', async () => {
  expect(await errors('export const t = Date.now();\n', 'src/cli/x.ts')).toEqual([]);
});

it('bans clocks and unseeded randomness in the web view (#30)', async () => {
  expect(await errors('export const r = Math.random();\n', 'web/src/render/x.ts')).toContain('no-restricted-properties');
  expect(await errors('export const t = performance.now();\n', 'web/src/view.ts')).toContain('no-restricted-properties');
  expect(await errors("import * as THREE from 'three';\nexport const c = new THREE.Clock();\n", 'web/src/render/x.ts')).toContain('no-restricted-syntax');
});

it('lets only web/src/loop.ts read display time (#30)', async () => {
  const raf = 'export const h = requestAnimationFrame(() => {});\n';
  expect(await errors(raf, 'web/src/view.ts')).toContain('no-restricted-globals');
  expect(await errors('export const h = window.requestAnimationFrame(() => {});\n', 'web/src/view.ts')).toContain('no-restricted-properties');
  expect(await errors(raf, 'web/src/loop.ts')).toEqual([]);
  expect(await errors('export const r = Math.random();\n', 'web/src/loop.ts')).toContain('no-restricted-properties');
});

it('bans U+0001 framing of git output in the scanner and attribution (AGENTS.md Rule 7, #24)', async () => {
  // The planted literals: the old windowCommits format and split, then each other way to write U+0001.
  const planted = [
    "export const f = ['log', '--numstat', '-z', '--format=%x01%H'];\n",
    "export const s = (out: string) => out.split('\\x01');\n",
    "export const s = '\\u0001';\n",
    "export const s = '\\u{1}';\n",
    "export const s = 'a\u0001b';\n",
    'export const f = (h: string) => `--format=%x01${h}`;\n',
    'export const s = `\\x01`;\n',
    'export const r = /\\x01/;\n',
    'export const r = /[\\u0001]/;\n',
    'export const r = /\\cA/;\n',
  ];
  for (const code of planted) {
    for (const file of ['src/scan/x.ts', 'src/attrib/x.ts', 'src/attrib/parsers/x.ts']) expect(await errors(code, file), `${file}: ${code}`).toContain('no-restricted-syntax');
  }
  // NUL framing passes, and the determinism selectors still apply alongside.
  expect(await errors("export const f = ['log', '-z', '--format=%x00%H'];\nexport const s = (o: string) => o.split('\\0');\n", 'src/scan/x.ts')).toEqual([]);
  expect(await errors("export const s = ['b', 'a'].sort((a, b) => a.localeCompare(b));\n", 'src/attrib/x.ts')).toContain('no-restricted-syntax');
  // Outside the scanner and attribution code, U+0001 is not a git framing byte.
  expect(await errors("export const s = '\\x01';\n", 'src/cli/x.ts')).toEqual([]);
});

it('makes tests take temp dirs from tempDir(), which removes them (#53)', async () => {
  for (const code of ["import { mkdtempSync } from 'node:fs';\nexport const d = mkdtempSync('x');\n",
    "import { mkdtemp } from 'fs/promises';\nexport const d = mkdtemp('x');\n"]) {
    for (const file of ['test/x.test.ts', 'test/fixtures/x.ts', 'test/factory/x.ts']) expect(await errors(code, file), `${file}: ${code}`).toContain('no-restricted-imports');
  }
  expect(await errors("import { mkdtempSync } from 'node:fs';\nexport const d = mkdtempSync('x');\n", 'test/fixtures/tmp.ts')).toEqual([]);
  expect(await errors("import { mkdirSync } from 'node:fs';\nexport const d = mkdirSync('x');\n", 'test/x.test.ts')).toEqual([]);
});

it('passes the fixed windowCommits (#24)', async () => {
  const file = 'src/scan/repo.ts';
  expect(await errors(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), file)).toEqual([]);
  const results = await eslint.lintFiles(['src/scan/**/*.ts', 'src/attrib/**/*.ts']);
  expect(results.length).toBeGreaterThan(0);
  expect(results.flatMap((r) => r.messages.map((m) => `${r.filePath.slice(root.length)}: ${m.ruleId}`))).toEqual([]);
});
