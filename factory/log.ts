import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export const iso = (ms: number) => new Date(ms).toISOString();

/** `20261109T203000Z`: sortable and safe in a file name. */
export const stamp = (ms: number) => iso(ms).replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

// Token shapes that must never reach a log or a GitHub comment: GitHub tokens, AWS key ids,
// bearer headers and secret-looking assignments.
const SECRETS: [RegExp, string][] = [
  [/\bgh[opsur]_[A-Za-z0-9]{20,}/g, 'gh*_<redacted>'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, 'github_pat_<redacted>'],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '<aws-key-id>'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g, 'Bearer <redacted>'],
  [/\b(aws_secret_access_key|aws_session_token|token|secret|password|cookie)(["']?\s*[:=]\s*["']?)[^\s"',}]{8,}/gi, '$1$2<redacted>'],
];

/** Removes secrets and replaces machine paths, so text is safe to log or post. */
export function redact(text: string, paths: readonly [string, string][] = []): string {
  let out = text;
  for (const [re, sub] of SECRETS) out = out.replace(re, sub);
  // Longest path first, so the repo path wins over the HOME that contains it.
  for (const [path, sub] of [...paths].sort((a, b) => b[0].length - a[0].length)) {
    if (path.length > 1) out = out.split(path).join(sub);
  }
  return out;
}

/**
 * Timestamped JSONL log (R9, task AC6). `file` is null for dry runs, which only print.
 * Every line goes through `redact`, so a stray token or absolute path never lands on disk.
 */
export class RunLog {
  /** This tick's lines so far, for `to`; a run log doesn't keep them. */
  private lines: string[] | null = [];

  constructor(
    private file: string | null,
    private clock: Clock,
    private print: (line: string) => void,
    private paths: readonly [string, string][] = [],
  ) {
    if (file) mkdirSync(dirname(file), { recursive: true });
  }

  /** Continues in a new file that starts with every line logged so far (a run's own log). */
  to(file: string): RunLog {
    const next = new RunLog(file, this.clock, this.print, this.paths);
    next.lines = null;
    appendFileSync(file, (this.lines ?? []).map((l) => l + '\n').join(''));
    return next;
  }

  event(name: string, data: Record<string, unknown> = {}): void {
    const ts = iso(this.clock.now());
    const line = redact(JSON.stringify({ ts, event: name, ...data }), this.paths);
    this.lines?.push(line);
    if (this.file) appendFileSync(this.file, line + '\n');
    const detail = redact(Object.entries(data).map(([k, v]) => `${k}=${short(v)}`).join(' '), this.paths);
    this.print(`${ts} ${name}${detail ? ' ' + detail : ''}\n`);
  }
}

function short(v: unknown): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s === undefined ? 'undefined' : s.length > 300 ? s.slice(0, 300) + '…' : s;
}
