// Rebuilds the committed showcase data (live demo L1): `npm run fixture:showcase`. Builds in a temp dir,
// then replaces test/fixtures/showcase/data/ with the result. Same code, same bytes (test/showcase.test.ts).
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { realTempDir, removeTempDirs } from '../tmp.js';
import { buildShowcase } from './build.js';
import { SHOWCASE_DATA_DIR } from './manifest.js';

const target = join(import.meta.dirname, SHOWCASE_DATA_DIR);
try {
  const { files } = await buildShowcase(realTempDir('commet-showcase-'));
  mkdirSync(target, { recursive: true });
  for (const name of readdirSync(target)) if (name.endsWith('.json')) rmSync(join(target, name));
  for (const [name, text] of files) writeFileSync(join(target, name), text);
  process.stdout.write(`showcase data written: ${files.size} files in test/fixtures/showcase/${SHOWCASE_DATA_DIR}/\n`);
} finally {
  removeTempDirs();
}
