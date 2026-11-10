// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Determinism (CONSTITUTION principle 3, design §6.3): pipeline code may not read
// clocks or unseeded randomness, and must sort by codepoint, not locale.
const determinism = {
  'no-restricted-properties': ['error',
    { object: 'Math', property: 'random', message: 'Use the seeded PRNG (determinism).' },
    { object: 'Date', property: 'now', message: 'No wall-clock time in the pipeline (determinism).' },
    { object: 'performance', property: 'now', message: 'No wall-clock time in the pipeline (determinism).' },
    { object: 'crypto', property: 'randomUUID', message: 'No unseeded randomness (determinism).' },
  ],
  'no-restricted-syntax': ['error',
    { selector: 'NewExpression[callee.name="Date"][arguments.length=0]', message: 'new Date() reads the wall clock (determinism).' },
    { selector: 'CallExpression[callee.property.name="localeCompare"]', message: 'Sort by codepoint (byCodepoint), not locale.' },
  ],
};

export default tseslint.config(
  // .sandboxes/ holds agent and feature worktrees: each is its own checkout, linted there.
  { ignores: ['dist/', 'factory/dist/', 'node_modules/', 'coverage/', '.sandboxes/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // The render stand-in (#31) is render code: a frame must be a pure function of (input, frame).
  { files: ['src/core/**', 'src/scan/**', 'src/attrib/**', 'test/render/standin/**'], rules: determinism },
  {
    // src/core is pure and isomorphic: no Node built-ins, nothing outside core (design §3).
    files: ['src/core/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['node:*', 'fs', 'path', 'os', 'child_process', 'crypto'], message: 'src/core must stay isomorphic (no Node built-ins).' },
        { group: ['**/scan/**', '**/attrib/**', '**/state/**', '**/cli', '**/cli.js', '**/server/**'], message: 'src/core imports nothing outside core.' },
      ] }],
    },
  },
);
