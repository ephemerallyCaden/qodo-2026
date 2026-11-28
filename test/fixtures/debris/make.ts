// Builds the debris fixture repo outside the tests (the renderer's manual checks):
//   npx vite-node test/fixtures/debris/make.ts -- <empty or new folder>
// The repo is <folder>/repo; scan it with `commet scan --no-root --no-ingest` there.
import { resolve } from 'node:path';
import { buildDebrisRepo } from './repo.js';

const target = process.argv.slice(2).filter((a) => a !== '--')[0];
if (target === undefined) {
  process.stderr.write('usage: npx vite-node test/fixtures/debris/make.ts -- <empty or new folder>\n');
  process.exit(2);
}
const repo = await buildDebrisRepo(resolve(target));
process.stdout.write(`debris repo built in ${repo.dir}: head ${repo.head}\n`);
