// A nested run for test/temp-cleanup.test.ts (#53): the suite's own global setup and setup file, on
// a case file that fails after making temp dirs.
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';
import suite from '../../../vitest.config.js';

export default defineConfig({ test: { ...suite.test, root: join(import.meta.dirname, '../../..'), include: ['test/fixtures/temp/fails.case.ts'] } });
