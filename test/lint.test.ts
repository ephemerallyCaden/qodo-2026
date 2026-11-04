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
