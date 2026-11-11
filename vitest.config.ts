import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    // A hard cap that load can't reach (#49): the hooks that build scripted fixture repos (dozens of
    // git calls; the structure fixture ~140) took ~70 s in a full run on a busy machine, past the old
    // 60 s. A real hang still fails its hook, after 5 minutes.
    hookTimeout: 300_000,
    // Every temp dir a test makes is removed after its file, and a run fails if one is left (#53).
    globalSetup: ['test/setup/temp-check.ts'],
    setupFiles: ['test/setup/temp-cleanup.ts'],
  },
});
