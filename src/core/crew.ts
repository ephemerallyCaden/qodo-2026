// Crew (#207, understanding mode U8): one astronaut per human author in the scan window, from local git only.
// Pure. The scan gives crewOf() the window's (mailmapped) authors and your emails and gets the snapshot's
// people, each commit's person and selfPersonIds; the server gives crewView() the snapshot and crewDetail()
// the fog's base, whose per-file touches already follow renames to the file at HEAD. No email is ever kept:
// a person is the hash of one (Rule 2). Nothing here ranks, sorts or totals people by activity (Rule 6).
import { byCodepoint } from './canonical-json.js';
import type { CrewDetail, CrewDetailFile, CrewHome, CrewView } from './contract/crew.js';
import { byFolderThenName } from './drones.js';
import type { FogBase } from './fog/index.js';
import { personId, u32 } from './hash.js';
import type { Person, PersonId, SnapshotV02 } from './snapshot/types.js';

/**
 * Agent author emails with neither `[bot]` nor a no-reply local part: every git-only agent identity in
 * docs/research/agent-providers.md (the git-ai seed table and the provider table, as author or co-author),
 * compared lowercased. Claude Code (`noreply@anthropic.com`), Codex (`noreply@openai.com`), Antigravity
 * (`noreply@google.com`), Continue (`noreply@continue.dev`) and GitHub's own `noreply@github.com` are
 * no-reply addresses, caught by that rule. A new agent identity in that doc gets a row here and in
 * test/crew.test.ts.
 */
const AGENT_EMAILS: ReadonlySet<string> = new Set([
  'cursoragent@cursor.com', // Cursor cloud agent and IDE trailer
  'roomote@roocode.com', // Roo Code's background agent
  'agent@replit.com', // Replit Agent
  'traecli@bytedance.com', // TRAE CLI
  'copilot@github.com', // Copilot in VS Code
  'amp@ampcode.com', // Amp (orbs author and trailer)
  'agent@warp.dev', // Warp (cloud identity and trailer)
  'openhands@all-hands.dev', // OpenHands cloud author
  'junie@jetbrains.com', // Junie trailer
  'aider@aider.chat', // Aider trailer
  'qwen-coder@alibabacloud.com', // Qwen Code trailer
  'crush@charm.land', // Crush trailer
  'vibe@mistral.ai', // Mistral Vibe trailer
]);

/**
 * Agent logins with a plain GitHub noreply address (`[<id>+]<login>@users.noreply.github.com`) and no `[bot]`:
 * Copilot (cloud and CLI), Kiro's cloud agent, OpenHands and Junie's GitHub Action.
 */
const AGENT_LOGINS: ReadonlySet<string> = new Set(['copilot', 'kiro-agent', 'openhands-agent', 'junie-agent']);
const GITHUB_NOREPLY = /^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/;
/** A local part no person answers to (`noreply@`, `no-reply@`, `donotreply@`, …): a CI system or an agent. */
const NO_REPLY = /^(?:no[-_.]?reply|do[-_.]?not[-_.]?reply)$/;

/**
 * A bot or agent author: a `[bot]` account (its email's local part or its name), a no-reply address, a known
 * agent's email, or an agent's GitHub noreply login. A person's own GitHub noreply address
 * (`<id>+<login>@users.noreply.github.com`) is not a bot.
 */
export function isBotAuthor(name: string, email: string): boolean {
  const e = email.toLowerCase();
  const at = e.lastIndexOf('@');
  const local = at < 0 ? e : e.slice(0, at);
  if (local.includes('[bot]') || NO_REPLY.test(local) || AGENT_EMAILS.has(e)) return true;
  const login = GITHUB_NOREPLY.exec(e)?.[1];
  if (login !== undefined && AGENT_LOGINS.has(login)) return true;
  return /\[bot\]$/i.test(name.trim());
}

/** One commit's author as `git log --use-mailmap` gives it: `%aN`, and `%aE` lowercased. */
export interface Author { name: string; email: string }

export interface Crew {
  /** The person each author email in the window belongs to. */
  personOf: ReadonlyMap<string, PersonId>;
  /** Sorted by id. `displayName` is as git gave it: the caller redacts it. */
  people: Person[];
  /** Your person, from your primary email (whether or not it authored a window commit), or none. */
  selfPersonIds: PersonId[];
}

/**
 * The window's people (#207 C1, C9, C10). `authors` are in commit order, oldest first; `selfEmails` are yours,
 * canonicalised as commit authors are (mailmapped, lowercased), the primary first. Aliases merge in three
 * ways: `.mailmap` (git already applied it), every email of yours into one person (the captain), and emails
 * whose commits share an exact, non-empty author name (the human accepted that two people of one name merge,
 * 2026-11-25). Bot and agent emails are never merged by name, each its own person with `isBot`; an email of
 * yours is never a bot. A person's id is the hash of your primary email for you, else of the group's first
 * email by codepoint, so it doesn't move with the window; its name is the one on its first window commit.
 */
export function crewOf(authors: readonly Author[], selfEmails: readonly string[]): Crew {
  const self = new Set(selfEmails);
  const primary = selfEmails[0];
  /** Emails in order of their first commit, with every name they committed under and the first one. */
  const names = new Map<string, { all: Set<string>; first: string }>();
  for (const a of authors) {
    const had = names.get(a.email);
    if (had) had.all.add(a.name);
    else names.set(a.email, { all: new Set([a.name]), first: a.name });
  }
  const emails = [...names.keys()];
  const bots = new Set(emails.filter((e) => !self.has(e) && [...names.get(e)!.all].some((n) => isBotAuthor(n, e))));

  const parent = new Map<string, string>();
  const find = (e: string): string => {
    let root = e;
    while (parent.get(root) !== root) root = parent.get(root)!;
    for (let cur = e; cur !== root;) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const [ra, rb] = [find(a), find(b)];
    if (ra !== rb) parent.set(rb, ra);
  };
  const humans = emails.filter((e) => !bots.has(e));
  for (const e of humans) parent.set(e, e);
  const mine = humans.filter((e) => self.has(e));
  for (const e of mine) union(mine[0]!, e);
  const byName = new Map<string, string>();
  for (const e of humans) {
    for (const n of names.get(e)!.all) {
      if (n === '') continue;
      const other = byName.get(n);
      if (other === undefined) byName.set(n, e);
      else union(other, e);
    }
  }

  const groups = new Map<string, string[]>();
  for (const e of humans) {
    const root = find(e);
    const list = groups.get(root);
    if (list) list.push(e);
    else groups.set(root, [e]);
  }
  const personOf = new Map<string, PersonId>();
  const people: Person[] = [];
  for (const members of groups.values()) {
    const isSelf = members.some((e) => self.has(e));
    const id = isSelf ? personId(primary!) : personId([...members].sort(byCodepoint)[0]!);
    for (const e of members) personOf.set(e, id);
    people.push({ id, displayName: names.get(members[0]!)!.first, isSelf, isBot: false });
  }
  for (const e of bots) {
    const id = personId(e);
    personOf.set(e, id);
    people.push({ id, displayName: names.get(e)!.first, isSelf: false, isBot: true });
  }
  people.sort((a, b) => byCodepoint(a.id, b.id));
  return { personOf, people, selfPersonIds: primary === undefined ? [] : [personId(primary)] };
}

const PERSON_ID = /^p_[0-9a-f]{12,64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/**
 * Why a stored snapshot's people, and the author dates the panel reads, can't be served, or null: every
 * person an object with a well-formed id (once), a name, `isSelf`, and `isBot` on all of them or none (a
 * snapshot is from before #207 or after it, never half). Never quotes the record.
 */
export function crewProblem(s: Pick<SnapshotV02, 'people' | 'commits'>): string | null {
  if (!Array.isArray(s.people)) return 'people are missing';
  const ids = new Set<string>();
  let flagged = 0;
  for (const p of s.people as unknown[]) {
    if (typeof p !== 'object' || p === null) return 'a person is damaged';
    const { id, displayName, isSelf, isBot } = p as Record<string, unknown>;
    if (typeof id !== 'string' || !PERSON_ID.test(id) || typeof displayName !== 'string' || typeof isSelf !== 'boolean'
      || (isBot !== undefined && typeof isBot !== 'boolean')) return 'a person is damaged';
    if (ids.has(id)) return 'a person is listed twice';
    ids.add(id);
    if (isBot !== undefined) flagged++;
  }
  if (flagged !== 0 && flagged !== s.people.length) return 'people are from two commet versions';
  if (!s.commits.every((c) => typeof c.authorDate === 'string' && ISO_UTC.test(c.authorDate))) return 'a commit date is damaged';
  return null;
}

const fromBefore207 = (people: readonly Person[]) => people.some((p) => p.isBot === undefined);

/**
 * GET /api/crew (#207 C1, C6, C9): every human author in the window, by person id, with no count of any kind
 * (Rule 6). The stored people must have passed crewProblem.
 */
export function crewView(s: Pick<SnapshotV02, 'repo' | 'people'>): CrewView {
  const needsRescan = fromBefore207(s.people);
  const self = new Set(s.repo.selfPersonIds);
  const members = needsRescan ? [] : s.people.filter((p) => !p.isBot).sort((a, b) => byCodepoint(a.id, b.id))
    .map((p) => ({ person: p.id, displayName: p.displayName, seed: u32(p.id), captain: self.has(p.id) }));
  return { schemaVersion: 'crew.1', head: s.repo.head, members, total: members.length, bots: needsRescan ? 0 : s.people.length - members.length, needsRescan };
}

/**
 * GET /api/crew-detail (#207 C5, AGENTS.md Rule 6's astronaut-panel exception): what one person touched in the
 * window. A touch is one of their commits changing a file's content (the fog's touches, renames followed to
 * the file at HEAD); each file and each body counts the distinct commits. Paths their commits changed that
 * lead to no file at HEAD are counted in `otherFiles`, never named. Null for a person the snapshot lacks and
 * for a bot. `damaged` for a person no window commit is by. The stored people must have passed crewProblem.
 */
export function crewDetail(base: FogBase, person: PersonId): CrewDetail | 'damaged' | null {
  const s = base.snapshot;
  const p = s.people.find((x) => x.id === person);
  if (!p || p.isBot) return null;
  const head = { ok: true, schemaVersion: 'crew-detail.1', head: s.repo.head, person, displayName: p.displayName,
    captain: s.repo.selfPersonIds.includes(person) } as const;
  if (fromBefore207(s.people)) return { ...head, lastActive: null, planets: [], files: [], otherFiles: 0, needsRescan: true };
  const mine = s.commits.filter((c) => c.author === person);
  if (mine.length === 0) return 'damaged';
  const seqs = new Set(mine.map((c) => c.seq));
  let lastActive = mine[0]!.authorDate;
  for (const c of mine) if (byCodepoint(c.authorDate, lastActive) > 0) lastActive = c.authorDate;

  const files: CrewDetailFile[] = [];
  const bodies = new Map<CrewHome, Set<number>>();
  base.files.forEach((f, i) => {
    const touched = new Set(base.touches[i]!.filter((t) => t.content && seqs.has(t.seq)).map((t) => t.seq));
    if (touched.size === 0) return;
    const home = base.home.get(f.id) ?? 'star';
    files.push({ fileId: f.id, path: f.path, home, touches: touched.size });
    const body = bodies.get(home) ?? new Set<number>();
    for (const seq of touched) body.add(seq);
    bodies.set(home, body);
  });
  files.sort((a, b) => byFolderThenName(a.path, b.path));

  // A row leads to a file at HEAD when one of the fog's names has its path at its commit (the same test the
  // fog's touches pass); any other content change is a path counted, never named (Rule 1).
  const named = new Map<string, { from: number; to: number }[]>();
  for (const list of base.names.values()) {
    for (const n of list) {
      const spans = named.get(n.path);
      if (spans) spans.push(n);
      else named.set(n.path, [n]);
    }
  }
  const other = new Set<string>();
  for (const c of mine) {
    for (const [path, added, removed] of c.files) {
      if (added + removed === 0) continue;
      if (!(named.get(path) ?? []).some((n) => n.from <= c.seq && c.seq <= n.to)) other.add(path);
    }
  }
  const planets = [...bodies].sort((a, b) => byCodepoint(a[0], b[0])).map(([home, set]) => ({ home, touches: set.size }));
  return { ...head, lastActive, planets, files, otherFiles: other.size, needsRescan: false };
}
