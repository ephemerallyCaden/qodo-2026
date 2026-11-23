// visual-proof (R8): the run's record, like fix-proof's. Created before the first step with
// `Status: running`, each step appended the moment it ends, so a run that stops or dies midway still
// shows every step it did; finish() writes the final status. Never overwrites a record: uniqueName picks
// the next free `-2`, `-3`. Paths are written as names ($SCRATCH, $MAIN, ~), never as absolute paths.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Literal { name: string; value: string }

/** Replaces each literal's value with its name, longest value first (so $MAIN wins over the HOME it sits in). */
export function redact(text: string, literals: readonly Literal[]): string {
  let out = text;
  for (const l of [...literals].filter((x) => x.value).sort((a, b) => b.value.length - a.value.length)) out = out.split(l.value).join(l.name);
  return out;
}

/** `base`, or `base-2`, `base-3`…: the first name for which no `<dir>/<name><suffix>` exists, for every suffix. */
export function uniqueName(dir: string, base: string, suffixes: readonly string[]): string {
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base}-${n}`;
    if (suffixes.every((s) => !existsSync(join(dir, `${name}${s}`)))) return name;
  }
}

export class RunRecord {
  private steps = 0;
  private constructor(readonly path: string, private readonly literals: readonly Literal[]) {}

  /** Writes the title, `Status: running` and the start lines; throws if `path` exists (never overwrites). */
  static create(path: string, title: string, start: readonly string[], literals: readonly Literal[] = []): RunRecord {
    if (existsSync(path)) throw new Error(`record ${path} exists; pick another name (uniqueName)`);
    const r = new RunRecord(path, literals);
    writeFileSync(path, redact([`# ${title}`, '', 'Status: running', '', ...start, ''].join('\n'), literals), { flag: 'wx' });
    return r;
  }

  /** Appends `## <n>. <title>` and its lines now. Returns the step's number. */
  step(title: string, lines: readonly string[]): number {
    this.steps++;
    appendFileSync(this.path, redact(['', `## ${this.steps}. ${title}`, ...lines, ''].join('\n'), this.literals));
    return this.steps;
  }

  get stepCount(): number { return this.steps; }

  /** Replaces the running status with `status` and ends the record with it. */
  finish(status: string): void {
    const text = readFileSync(this.path, 'utf8').replace(/^Status: running$/m, redact(`Status: ${status}`, this.literals));
    writeFileSync(this.path, `${text.trimEnd()}\n\n${redact(`Final status: ${status}`, this.literals)}\n`);
  }
}
