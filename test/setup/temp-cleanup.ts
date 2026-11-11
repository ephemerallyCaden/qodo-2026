// Setup file (#53): once a test file's tests and its own afterAll hooks are done, pass or fail,
// remove every temp dir it made through tempDir() (test/fixtures/tmp.ts). Vitest runs afterAll
// hooks last-registered first, so this one, registered before the file loads, runs last.
import { afterAll } from 'vitest';
import { removeTempDirs } from '../fixtures/tmp.js';

afterAll(removeTempDirs);
