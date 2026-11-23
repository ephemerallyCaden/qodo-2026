// visual-proof (R5): scans what a take saw (every frame's page text, every API response the view got,
// the state files behind them) for what AGENTS.md Rule 2 keeps out of any output: absolute paths,
// tokens and secrets, agent-log fields. Any hit stops the run. A hit says its rule and where it was, and
// shows only the first characters of what it matched, so the report never repeats the private text.

export interface Scanned { where: string; text: string }
export interface Hit { rule: string; where: string; excerpt: string }
/** This run's own private strings (the launch token, HOME, the scratch dir, the main checkout), found as they are. */
export interface PrivacyContext { literals: readonly { name: string; value: string }[] }

/** Characters that can't start an absolute path, so `src/tmp/x` is relative and `(/tmp/x` isn't. */
const PATH_START = String.raw`(?:^|(?<=[\s"'(=:,;<>\[{]))`;
const PATTERNS: readonly { rule: string; re: RegExp }[] = [
  { rule: 'absolute path', re: new RegExp(String.raw`${PATH_START}/(?:Users|home|private|tmp|var|Volumes|root|opt|etc|mnt|srv)(?:/[^\s"'<>]*)?`, 'g') },
  { rule: 'absolute path', re: new RegExp(String.raw`${PATH_START}~/[^\s"'<>]*`, 'g') },
  { rule: 'absolute path', re: /\bfile:\/\/[^\s"'<>]*/g },
  { rule: 'absolute path', re: /\b[A-Za-z]:\\[^\s"'<>]*/g },
  { rule: 'absolute path', re: /\\\\[A-Za-z0-9._$-]+\\[^\s"'<>]*/g },
  { rule: 'launch URL', re: /#t=[A-Za-z0-9_-]{6,}/g },
  { rule: 'secret prefix', re: /\b(?:sk-ant-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[abprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,})/g },
  { rule: 'secret prefix', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
];
/** A run of 32+ token characters with capitals, small letters and digits: a token's shape (a SHA or file id has no capitals). */
const RUN = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_-])/g;
const tokenLike = (s: string) => /[A-Z]/.test(s) && /[a-z]/.test(s) && /[0-9]/.test(s);
/**
 * Agent-log fields Rule 2 never reads (docs/research/agent-attribution.md): as a key in served JSON they
 * mean log data got through. Only names no Commet contract uses (`message` or `text` could be a real answer).
 */
const LOG_FIELDS = new Set(['originalFile', 'last-prompt', 'lastPrompt', 'toolUseResult', 'attachment', 'api-request', 'apiRequest', 'file-history', 'sessionHistory']);

const mask = (s: string) => `${[...s].slice(0, 6).join('')}… (${[...s].length} chars)`;

export function privacyHits(items: readonly Scanned[], ctx: PrivacyContext): Hit[] {
  const out: Hit[] = [];
  const seen = new Set<string>();
  const add = (h: Hit) => { const k = `${h.rule}\0${h.where}\0${h.excerpt}`; if (!seen.has(k)) { seen.add(k); out.push(h); } };
  for (const { where, text } of items) {
    for (const l of ctx.literals) if (l.value && text.includes(l.value)) add({ rule: l.name, where, excerpt: `(${l.name}, ${[...l.value].length} chars)` });
    for (const { rule, re } of PATTERNS) for (const m of text.matchAll(re)) add({ rule, where, excerpt: mask(m[0]) });
    for (const m of text.matchAll(RUN)) if (tokenLike(m[0])) add({ rule: 'token-like string', where, excerpt: mask(m[0]) });
    if (where.endsWith(' (keys)')) for (const key of text.split('\n')) if (LOG_FIELDS.has(key)) add({ rule: 'agent-log field', where: where.slice(0, -' (keys)'.length), excerpt: key });
  }
  return out;
}

/** What one served response holds, to scan: a JSON body's decoded strings and, apart, its keys; any other body as it is. */
export function servedTexts(r: { path: string; body: string }): Scanned[] {
  const where = `GET ${r.path}`;
  let value: unknown;
  try {
    value = JSON.parse(r.body);
  } catch {
    return [{ where, text: r.body }];
  }
  const strings: string[] = [], keys: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { keys.push(k); walk(x); }
  };
  walk(value);
  return [{ where, text: strings.join('\n') }, { where: `${where} (keys)`, text: keys.join('\n') }];
}

/** What one take saw, to scan: every distinct page text, every API response, the event stream and the scene's notes. */
export function takeTexts(name: string, log: { texts: readonly [string, number][]; served: readonly { path: string; body: string }[]; events: string; notes: readonly string[] }): Scanned[] {
  return [
    ...log.texts.map(([text, k]) => ({ where: `take ${name} page text from frame ${k}`, text })),
    ...log.served.flatMap((s) => servedTexts(s)),
    { where: `take ${name} event stream`, text: log.events },
    { where: `take ${name} notes`, text: log.notes.join('\n') },
  ];
}
