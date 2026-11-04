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
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['src/core/**', 'src/scan/**', 'src/attrib/**'], rules: determinism },
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
