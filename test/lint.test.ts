import { ESLint } from 'eslint';
import { expect, it } from 'vitest';

const eslint = new ESLint({ cwd: new URL('..', import.meta.url).pathname });
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
