// `commet beacon` (#79, R10): the captain's log from the terminal, the CLI side of `POST /api/beacon`.
// A note is one plain line of at most 120 characters; it's refused, never rewritten, when it isn't.
// State lives in `.git/commet/beacons.json` through src/state/beacons.ts, the module the server uses.
import { beaconTextProblem, cleanBeaconText } from '../core/beacons.js';
import { CommetError, EXIT } from '../core/errors.js';
import { clearBeacons, currentBeacons, writeBeacon } from '../state/beacons.js';
import { openFogSource, type FogSource } from '../state/chart.js';
import { label, short, snapshotFile } from './chart.js';
import type { Io } from './main.js';

export const BEACON_USAGE = '       commet beacon [list] | commet beacon [--] <file> <note> | commet beacon --remove [--] <file>\n';

type Job = { kind: 'list' } | { kind: 'set'; arg: string; text: string } | { kind: 'remove'; arg: string };

const FOLDER_HINT = 'leave a beacon on one of its files';

function parse(args: string[]): Job | string {
  if (args.length === 0 || (args.length === 1 && args[0] === 'list')) return { kind: 'list' };
  if (args[0] === '--remove') {
    const files = args[1] === '--' ? args.slice(2) : args.slice(1);
    if (args[1] !== '--' && files[0]?.startsWith('-')) return `unknown option ${JSON.stringify(files[0])}`;
    return files.length === 1 && files[0] !== '' ? { kind: 'remove', arg: files[0]! } : '--remove takes one file';
  }
  if (args[0] !== '--' && args[0]!.startsWith('-')) return `unknown option ${JSON.stringify(args[0])}`;
  const rest = args[0] === '--' ? args.slice(1) : args;
  if (rest.length !== 2 || rest[0] === '') return 'beacon takes one file and one note (quote the note)';
  const text = cleanBeaconText(rest[1]!);
  const problem = beaconTextProblem(text);
  return problem ?? { kind: 'set', arg: rest[0]!, text };
}

/** A body's name for the terminal: its folder, or the star. */
const bodyName = (src: FogSource, home: string) =>
  home === 'star' ? 'star' : label(src.base.snapshot.dirs.find((d) => d.id === home)?.path ?? home);

async function list(src: FogSource, io: Io): Promise<number> {
  const v = await currentBeacons(src);
  io.stdout(v.beacons.length === 0 ? `no beacons at ${short(v.head)}\n` : `${v.beacons.length} ${v.beacons.length === 1 ? 'beacon' : 'beacons'} at ${short(v.head)}, oldest first:\n`);
  for (const b of v.beacons) io.stdout(`${bodyName(src, b.home)}  ${label(b.path)}  ${b.text}\n`);
  if (v.unplaced > 0) {
    io.stdout(`${v.unplaced} more can't be placed at ${short(v.head)}: their file was deleted, or they were left on another branch or before the scan's window\n`);
  }
  return 0;
}

async function set(src: FogSource, io: Io, arg: string, text: string): Promise<number> {
  const file = await snapshotFile(src, io, arg, FOLDER_HINT);
  if (!file) return EXIT.usage;
  // The CLI has no older view: it acts at the head of the snapshot it just read (#58).
  const r = await writeBeacon(src, { fileId: file.id, at: src.base.snapshot.repo.head, text });
  if (!r.ok && r.head !== undefined) throw new CommetError(`the snapshot changed meanwhile (now at ${short(r.head)}); nothing was written, run the command again`, EXIT.state);
  if (!r.ok) {
    io.stderr(`commet: ${r.error}\n`);
    return EXIT.state;
  }
  const b = r.beacons.beacons.find((x) => x.fileId === file.id);
  io.stdout(`Beacon left on ${label(file.path)}${b ? ` (${bodyName(src, b.home)})` : ''} at ${short(src.base.snapshot.repo.head)}: ${text}\n`);
  return 0;
}

async function remove(src: FogSource, io: Io, arg: string): Promise<number> {
  const file = await snapshotFile(src, io, arg, FOLDER_HINT);
  if (!file) return EXIT.usage;
  const n = await clearBeacons(src, file.id);
  io.stdout(n === 0 ? `No beacon on ${label(file.path)}; nothing changed\n` : `Removed the beacon on ${label(file.path)}\n`);
  return 0;
}

/** Runs `commet beacon …` and returns the exit code. */
export async function beaconCommand(args: string[], io: Io): Promise<number> {
  const job = parse(args);
  if (typeof job === 'string') {
    io.stderr(`commet: ${job}\n${BEACON_USAGE.replace(/^ {7}/, 'usage: ')}`);
    return EXIT.usage;
  }
  try {
    const src = await openFogSource(io.cwd);
    return job.kind === 'list' ? await list(src, io) : job.kind === 'set' ? await set(src, io, job.arg, job.text) : await remove(src, io, job.arg);
  } catch (e) {
    if (e instanceof CommetError) {
      io.stderr(`commet: ${e.message}\n`);
      return e.exitCode;
    }
    // Error text can carry absolute paths (git stderr, fs errors), so it's shown only on request.
    io.stderr(`commet: internal error${io.env['COMMET_DEBUG'] ? `\n${(e as Error).stack}` : ' (set COMMET_DEBUG=1 for details)'}\n`);
    return EXIT.internal;
  }
}
