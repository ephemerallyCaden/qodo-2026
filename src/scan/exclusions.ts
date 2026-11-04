import type { ExclusionRule } from '../core/snapshot/types.js';

// Built-in ruleset, recorded in the snapshot. check-attr rules arrive with T2.
export const RULESET_VERSION = 'builtin-0.1';

const LOCKFILES = [
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock',
  'Cargo.lock', 'Gemfile.lock', 'poetry.lock', 'composer.lock', 'go.sum', 'uv.lock',
];
const DIRS = ['node_modules', 'dist', 'vendor'];

export const RULES: ExclusionRule[] = [
  { id: 'lockfile', kind: 'glob', pattern: `**/{${LOCKFILES.join(',')}}` },
  ...DIRS.map((d): ExclusionRule => ({ id: d, kind: 'glob', pattern: `**/${d}/**` })),
  { id: 'minified', kind: 'glob', pattern: '**/*.min.{js,css}' },
  { id: 'binary', kind: 'binary', pattern: 'numstat:-' },
];

/** Returns the id of the first rule that excludes `path` (binary first), or null. */
export function exclusionOf(path: string, binary = false): string | null {
  if (binary) return 'binary';
  const segs = path.split('/');
  const base = segs[segs.length - 1] ?? '';
  if (LOCKFILES.includes(base)) return 'lockfile';
  for (const d of DIRS) if (segs.slice(0, -1).includes(d)) return d;
  if (/\.min\.(js|css)$/.test(base)) return 'minified';
  return null;
}
