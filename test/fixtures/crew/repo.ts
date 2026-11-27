// The crew fixture repo (#207 C11): a scripted repo with an invented crew, fixed identities and dates, so its
// SHAs, person ids and crew are the same on every machine. See README.md beside it for who is who and what each
// case covers. Shared by the crew scan tests, the crew renderer's tests and the Day 18 film.
import { execFile } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface Who { name: string; email: string }

/** You: the captain, `user.email` in the repo's config. */
export const NOVA: Who = { name: 'Nova Reyes', email: 'nova@crew.test' };
/** Your old laptop's identity: another name, merged into you only by `commet.selfEmail`. */
export const NOVA_OLD: Who = { name: 'Nova R.', email: 'nova@old-laptop.test' };
/** Ada's canonical identity, and the contractor address `.mailmap` maps to it. */
export const ADA: Who = { name: 'Ada Quill', email: 'ada@crew.test' };
export const ADA_CONTRACTOR: Who = { name: 'A. Quill', email: 'a.quill@contractor.test' };
/** One name on two emails, with no mailmap entry: merged by the exact name. */
export const BRAM: Who = { name: 'Bram Tiller', email: 'bram@crew.test' };
export const BRAM_HOME: Who = { name: 'Bram Tiller', email: 'bram.t@home.test' };
export const CLEO: Who = { name: 'Cleo Varga', email: 'cleo@crew.test' };
export const DAX: Who = { name: 'Dax Imura', email: 'dax@crew.test' };
/** A person's own GitHub noreply address: a human, not a bot. */
export const ESME: Who = { name: 'Esme Holt', email: '7700001+esme-holt@users.noreply.github.com' };
/** A bot account and an agent author: never crew. */
export const DEPENDABOT: Who = { name: 'dependabot[bot]', email: '49699333+dependabot[bot]@users.noreply.github.com' };
export const CURSOR_AGENT: Who = { name: 'Cursor Agent', email: 'cursoragent@cursor.com' };

/** Every identity that commits, for privacy checks (no email may reach any output). */
export const IDENTITIES: readonly Who[] = [NOVA, NOVA_OLD, ADA, ADA_CONTRACTOR, BRAM, BRAM_HOME, CLEO, DAX, ESME, DEPENDABOT, CURSOR_AGENT];

/** The crew's display names, one per person, in no particular order (the view orders by person id). */
export const CREW_NAMES = [NOVA.name, ADA.name, BRAM.name, CLEO.name, DAX.name, ESME.name] as const;

export const MAILMAP = `${ADA.name} <${ADA.email}> <${ADA_CONTRACTOR.email}>\n`;

export interface CrewRepo { dir: string; shas: string[]; head: string }

/**
 * Builds the crew repo in `dir`, which must be empty or absent; the scan tests pass a temp dir from
 * test/fixtures/tmp.ts. Run `commet scan --no-root` in it: with no content root, `engine/`, `ui/` and `docs/`
 * are the planets and the root files sit on the star.
 */
export async function buildCrewRepo(dir: string): Promise<CrewRepo> {
  mkdirSync(dir, { recursive: true });
  if (readdirSync(dir).length > 0) throw new Error('buildCrewRepo needs an empty folder');
  const git = async (args: string[], env: Record<string, string> = {}) =>
    (await run('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } })).stdout.trim();
  await git(['init', '-q', '-b', 'main']);
  for (const [k, v] of [['user.name', NOVA.name], ['user.email', NOVA.email], ['commet.selfEmail', NOVA_OLD.email],
    ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']] as const) await git(['config', k, v]);
  const lines = new Map<string, number>();
  /** Appends a line to each file, so every commit changes exactly these files' content. */
  const touch = (...paths: string[]) => {
    for (const p of paths) {
      const n = (lines.get(p) ?? 0) + 1;
      lines.set(p, n);
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), Array.from({ length: n }, (_, i) => `export const line${i} = ${i};`).join('\n') + '\n');
    }
  };
  const shas: string[] = [];
  const commit = async (who: Who, subject: string) => {
    const date = `2026-10-${String(shas.length + 1).padStart(2, '0')}T10:00:00Z`;
    await git(['add', '-A']);
    await git(['commit', '-q', '-m', subject], {
      GIT_AUTHOR_NAME: who.name, GIT_AUTHOR_EMAIL: who.email, GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_NAME: who.name, GIT_COMMITTER_EMAIL: who.email, GIT_COMMITTER_DATE: date,
    });
    shas.push(await git(['rev-parse', 'HEAD']));
  };

  writeFileSync(join(dir, '.mailmap'), MAILMAP);
  touch('README.md', 'engine/core.ts', 'ui/panel.ts');
  await commit(NOVA, 'c1: start the ship');
  touch('engine/core.ts', 'engine/physics.ts');
  await commit(ADA_CONTRACTOR, 'c2: physics, from the contractor address');
  touch('ui/panel.ts', 'ui/menu.ts');
  await commit(BRAM, 'c3: the menu');
  touch('ui/menu.ts');
  await commit(BRAM_HOME, 'c4: the menu, from home');
  touch('ui/menu.ts', 'docs/guide.md');
  await commit(CLEO, 'c5: menu copy and the guide');
  touch('package.json');
  await commit(DEPENDABOT, 'c6: bump a dependency');
  touch('engine/physics.ts');
  await commit(CURSOR_AGENT, 'c7: agent tweak to physics');
  touch('engine/legacy.ts', 'engine/core.ts');
  await commit(DAX, 'c8: a legacy shim');
  touch('docs/guide.md', 'README.md');
  await commit(ESME, 'c9: guide and readme');
  touch('ui/hud.ts');
  await commit(NOVA_OLD, 'c10: the hud, from the old laptop');
  // c11: a pure rename (no touch for anyone) and a deletion (a path no file at HEAD has).
  await git(['mv', 'ui/menu.ts', 'ui/nav.ts']);
  lines.set('ui/nav.ts', lines.get('ui/menu.ts')!);
  rmSync(join(dir, 'engine/legacy.ts'));
  await commit(NOVA, 'c11: rename the menu to nav, drop the shim');
  touch('engine/physics.ts', 'ui/hud.ts');
  await commit(ADA, 'c12: physics and the hud');
  touch('ui/nav.ts');
  await commit(CLEO, 'c13: nav copy');
  return { dir, shas, head: shas.at(-1)! };
}
