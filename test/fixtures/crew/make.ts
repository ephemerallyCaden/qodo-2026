// Builds the crew fixture repo outside the tests (the renderer's manual checks, the Day 18 film):
//   npx vite-node test/fixtures/crew/make.ts -- <empty or new folder>
import { resolve } from 'node:path';
import { buildCrewRepo } from './repo.js';

const target = process.argv.slice(2).filter((a) => a !== '--')[0];
if (target === undefined) {
  process.stderr.write('usage: npx vite-node test/fixtures/crew/make.ts -- <empty or new folder>\n');
  process.exit(2);
}
const repo = await buildCrewRepo(resolve(target));
process.stdout.write(`crew repo built: ${repo.shas.length} commits, head ${repo.head}\n`);
