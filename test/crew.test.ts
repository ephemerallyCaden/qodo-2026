// Crew (#207): who is a bot (C1), how aliases merge into one person (C1, C9, C10), the crew list's order and
// its lack of counts (C6, Rule 6), one person's panel (C5) and the damaged-record check. The scan of the shared
// fixture repo is test/crew-scan.test.ts.
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/core/canonical-json.js';
import { crewDetail, crewOf, crewProblem, crewView, isAgentAuthor, isBotAuthor, type Author } from '../src/core/crew.js';
import { fileIdOf, fogBase } from '../src/core/fog/index.js';
import { personId, u32 } from '../src/core/hash.js';
import type { Commit, CommitFile, Person, PersonId, SnapshotV02 } from '../src/core/snapshot/types.js';

describe('isBotAuthor (#207 C1: bots and agent authors are never crew)', () => {
  const bots: [string, string][] = [
    ['dependabot[bot]', '49699333+dependabot[bot]@users.noreply.github.com'],
    ['github-actions', '41898282+github-actions[bot]@users.noreply.github.com'],
    ['Devin AI', '158243242+devin-ai-integration[bot]@users.noreply.github.com'],
    ['Renovate Bot', 'renovate[bot]@example.com'],
    ['some-tool[bot]', 'tool@example.com'],
    ['Cursor Agent', 'cursoragent@cursor.com'],
    ['Claude', 'noreply@anthropic.com'],
    ['Codex', 'noreply@openai.com'],
    ['Antigravity', 'noreply@google.com'],
    ['GitHub', 'noreply@github.com'],
    ['CI', 'no-reply@ci.example.com'],
    ['Builds', 'DoNotReply@example.com'],
    ['Roo Code', 'roomote@roocode.com'],
    ['Replit Agent', 'agent@replit.com'],
    ['TRAE CLI', 'traecli@bytedance.com'],
    ['GitHub Copilot', 'copilot@github.com'],
    ['Copilot', '198982749+Copilot@users.noreply.github.com'],
    ['Kiro Agent', '244629292+kiro-agent@users.noreply.github.com'],
    // Qodo PR #226 02a7b621: every other git-only agent identity in docs/research/agent-providers.md.
    ['Amp', 'amp@ampcode.com'],
    ['Warp', 'agent@warp.dev'],
    ['openhands', 'openhands@all-hands.dev'],
    ['openhands-agent', '123456+openhands-agent@users.noreply.github.com'],
    ['Junie', 'junie@jetbrains.com'],
    ['junie-agent', '247260674+junie-agent@users.noreply.github.com'],
    ['aider (gpt-5)', 'aider@aider.chat'],
    ['Qwen-Coder', 'qwen-coder@alibabacloud.com'],
    ['Crush', 'crush@charm.land'],
    ['Mistral Vibe', 'vibe@mistral.ai'],
    ['Continue', 'noreply@continue.dev'],
  ];
  for (const [name, email] of bots) it(`${name} <${email}> is a bot`, () => expect(isBotAuthor(name, email)).toBe(true));

  const people: [string, string][] = [
    ['Esme Holt', '7700001+esme-holt@users.noreply.github.com'],
    ['Ada Quill', 'ada@crew.test'],
    ['Robert Botham', 'bot@example.com'],
    ['Nora Reply', 'noreply.nora@example.com'],
    ['Copilot Fan', 'copilot-fan@example.com'],
    ['Agent Smith', 'agent@example.com'],
  ];
  for (const [name, email] of people) it(`${name} <${email}> is a person`, () => expect(isBotAuthor(name, email)).toBe(false));

  // R13: an agent's branch is an orphaned agent branch; a bot's (Dependabot's) is only abandoned.
  const notAgents = new Set(['dependabot[bot]', 'github-actions', 'Renovate Bot', 'some-tool[bot]', 'GitHub', 'CI', 'Builds']);
  for (const [name, email] of bots) {
    const agent = !notAgents.has(name);
    it(`${name} <${email}> is ${agent ? 'an agent' : 'a bot, not an agent'} (isAgentAuthor, R13)`, () => expect(isAgentAuthor(name, email)).toBe(agent));
  }
  const agentApps: [string, string][] = [
    ['copilot-swe-agent[bot]', '198982749+Copilot@users.noreply.github.com'],
    ['claude[bot]', '41898282+claude[bot]@users.noreply.github.com'],
    ['Codex', '199175422+chatgpt-codex-connector[bot]@users.noreply.github.com'],
    ['google-labs-jules[bot]', '161369871+google-labs-jules[bot]@users.noreply.github.com'],
    ['opencode-agent[bot]', 'opencode-agent[bot]@users.noreply.github.com'],
    ['amazon-q-developer[bot]', '208079219+amazon-q-developer[bot]@users.noreply.github.com'],
    ['factory-droid[bot]', '138933559+factory-droid[bot]@users.noreply.github.com'],
    ['qodo-code-review[bot]', '151058649+qodo-code-review[bot]@users.noreply.github.com'],
    ['cursor[bot]', 'cursor@example.com'],
  ];
  for (const [name, email] of agentApps) {
    it(`${name} <${email}> is an agent app (R13)`, () => expect([isAgentAuthor(name, email), isBotAuthor(name, email)]).toEqual([true, true]));
  }
  for (const [name, email] of [...people, ['claude', '7700002+claude@users.noreply.github.com'], ['cursor', 'cursor@example.com']] as [string, string][]) {
    it(`${name} <${email}> is no agent (R13)`, () => expect(isAgentAuthor(name, email)).toBe(false));
  }
});

const a = (name: string, email: string): Author => ({ name, email });
const byEmail = (c: ReturnType<typeof crewOf>) => Object.fromEntries(c.personOf);

describe('crewOf (#207: aliases merge, bots stay apart, you are the captain)', () => {
  it('gives each email its own person when nothing links them', () => {
    const c = crewOf([a('Ada', 'ada@x.test'), a('Bram', 'bram@x.test')], []);
    expect(byEmail(c)).toEqual({ 'ada@x.test': personId('ada@x.test'), 'bram@x.test': personId('bram@x.test') });
    expect(c.people.map((p) => p.displayName).sort()).toEqual(['Ada', 'Bram']);
    expect(c.selfPersonIds).toEqual([]);
  });

  it('merges emails whose commits share an exact name, through chains of names, under the first email by codepoint (C10)', () => {
    // z@ and b@ share "Bram"; b@ also committed as "B. T.", which c@ shares: one person.
    const c = crewOf([a('Bram', 'z@x.test'), a('Bram', 'b@x.test'), a('B. T.', 'b@x.test'), a('B. T.', 'c@x.test')], []);
    const id = personId('b@x.test');
    expect(byEmail(c)).toEqual({ 'z@x.test': id, 'b@x.test': id, 'c@x.test': id });
    // The name is the one on the person's first commit.
    expect(c.people).toEqual([{ id, displayName: 'Bram', isSelf: false, isBot: false }]);
  });

  it('merges names exactly: case, spacing and an empty name never link', () => {
    const c = crewOf([a('Bram', 'a@x.test'), a('bram', 'b@x.test'), a('Bram ', 'c@x.test'), a('', 'd@x.test'), a('', 'e@x.test')], []);
    expect(new Set(c.personOf.values()).size).toBe(5);
  });

  it('merges every email of yours into one captain, whatever the names, under your primary email (C9)', () => {
    const c = crewOf([a('Nova R.', 'old@x.test'), a('Nova Reyes', 'nova@x.test'), a('Ada', 'ada@x.test')], ['nova@x.test', 'old@x.test']);
    const me = personId('nova@x.test');
    expect(byEmail(c)).toMatchObject({ 'old@x.test': me, 'nova@x.test': me });
    expect(c.selfPersonIds).toEqual([me]);
    expect(c.people.find((p) => p.id === me)).toEqual({ id: me, displayName: 'Nova R.', isSelf: true, isBot: false });
    expect(c.people.filter((p) => p.isSelf)).toHaveLength(1);
  });

  it('keys you by your primary email even when only another of yours committed', () => {
    const c = crewOf([a('Nova R.', 'old@x.test')], ['nova@x.test', 'old@x.test']);
    expect(c.personOf.get('old@x.test')).toBe(personId('nova@x.test'));
    expect(c.selfPersonIds).toEqual([personId('nova@x.test')]);
  });

  it('pulls a same-named email into you for the crew', () => {
    const c = crewOf([a('Nova Reyes', 'nova@x.test'), a('Nova Reyes', 'laptop@x.test')], ['nova@x.test']);
    expect(c.personOf.get('laptop@x.test')).toBe(personId('nova@x.test'));
  });

  it('flags bots and agents, one person per email, never merged by name with anyone', () => {
    const c = crewOf([a('Claude', 'claude@x.test'), a('Claude', 'noreply@anthropic.com'), a('dependabot[bot]', '1+dependabot[bot]@users.noreply.github.com'),
      a('dependabot[bot]', '2+dependabot[bot]@users.noreply.github.com')], []);
    expect(c.people.filter((p) => p.isBot)).toHaveLength(3);
    expect(c.people.find((p) => !p.isBot)).toEqual({ id: personId('claude@x.test'), displayName: 'Claude', isSelf: false, isBot: false });
    expect(new Set(c.personOf.values()).size).toBe(4);
  });

  it('never calls an email of yours a bot', () => {
    const c = crewOf([a('Me', 'noreply@me.test')], ['noreply@me.test']);
    expect(c.people).toEqual([{ id: personId('noreply@me.test'), displayName: 'Me', isSelf: true, isBot: false }]);
  });

  it('flags an email as a bot when any of its names is one', () => {
    const c = crewOf([a('Tool', 'tool@x.test'), a('tool[bot]', 'tool@x.test'), a('Tool', 'tool2@x.test')], []);
    expect(c.people.find((p) => p.id === personId('tool@x.test'))?.isBot).toBe(true);
    // The bot's name never pulls a person in.
    expect(c.personOf.get('tool2@x.test')).toBe(personId('tool2@x.test'));
  });

  it('sorts people by id and is the same for the same input', () => {
    const input = [a('E', 'e@x.test'), a('D', 'd@x.test'), a('C', 'c@x.test'), a('B', 'b@x.test')];
    const c = crewOf(input, []);
    expect(c.people.map((p) => p.id)).toEqual([...c.people.map((p) => p.id)].sort());
    expect(canonicalJson(crewOf(input, []).people)).toBe(canonicalJson(c.people));
  });
});

const HEAD = 'a'.repeat(40);
const sha = (n: number) => String(n).padStart(40, '0');
const P = (n: number) => `p_${String(n).padStart(12, '0')}` as PersonId;
const person = (n: number, over: Partial<Person> = {}): Person => ({ id: P(n), displayName: `Person ${n}`, isSelf: false, isBot: false, ...over });

describe('crewView (#207 C6, Rule 6: by person id, no counts)', () => {
  const people = [person(3), person(1, { isSelf: true }), person(9, { isBot: true }), person(2)];
  const view = crewView({ repo: { head: HEAD, selfPersonIds: [P(1)] } as SnapshotV02['repo'], people });

  it('lists the human authors by person id, you flagged as captain, and counts the bots it leaves out', () => {
    expect(view).toEqual({
      schemaVersion: 'crew.1', head: HEAD, total: 3, bots: 1, needsRescan: false,
      members: [
        { person: P(1), displayName: 'Person 1', seed: u32(P(1)), captain: true },
        { person: P(2), displayName: 'Person 2', seed: u32(P(2)), captain: false },
        { person: P(3), displayName: 'Person 3', seed: u32(P(3)), captain: false },
      ],
    });
  });

  it('carries no count of any kind per member: a name, an id, a seed and the captain flag only', () => {
    for (const m of view.members) expect(Object.keys(m).sort()).toEqual(['captain', 'displayName', 'person', 'seed']);
  });

  it('shows nobody for a snapshot from before #207, which cannot tell bots from people', () => {
    const old = [{ id: P(1), displayName: 'Person 1', isSelf: true }, { id: P(2), displayName: 'dependabot[bot]', isSelf: false }];
    expect(crewView({ repo: { head: HEAD, selfPersonIds: [P(1)] } as SnapshotV02['repo'], people: old }))
      .toEqual({ schemaVersion: 'crew.1', head: HEAD, members: [], total: 0, bots: 0, needsRescan: true });
  });
});

/** A snapshot whose window is `commits` (seq = index, rows by path), every file at HEAD a root file or in `src/` / `web/`. */
function snapshotOf(paths: string[], people: Person[], rows: [author: PersonId, files: CommitFile[], authorDate?: string][]): SnapshotV02 {
  const commits: Commit[] = rows.map(([author, files, authorDate], seq) => ({
    seq, sha: seq === rows.length - 1 ? HEAD : sha(seq + 1), date: `2026-10-${String(seq + 1).padStart(2, '0')}T10:00:00Z`,
    authorDate: authorDate ?? `2026-10-${String(seq + 1).padStart(2, '0')}T10:00:00Z`, author, subject: '', files,
    attribution: { class: 'unknown', agentLineShareMilli: 0, sessions: [], evidence: [], tier: 'none', selfCommittedAgentWritten: false },
  }));
  const dirs = ['src', 'web'].map((d) => ({ id: `d_${d.padStart(12, '0')}` as const, path: d, parent: null, depth: 1, bornSeq: 0, bornDate: '2026-10-01T10:00:00Z' }));
  return {
    repo: { repoId: 'r', head: HEAD, headDate: '2026-10-31T10:00:00Z', branch: 'main', selfPersonIds: [P(1)] },
    files: paths.map((path) => ({ id: fileIdOf(path), path, loc: 1, debt: null, isTest: false, testOf: null, qodo: null })),
    dirs, people, commits,
  } as unknown as SnapshotV02;
}

describe('crewDetail (#207 C5, Rule 6: one person, never sorted by count, no total)', () => {
  const people = [person(1, { isSelf: true }), person(2), person(9, { isBot: true })];
  const snap = snapshotOf(['README.md', 'src/a.ts', 'src/z.ts', 'web/b.ts'], people, [
    [P(2), [['src/z.ts', 1, 0, 0], ['src/a.ts', 1, 0, 0]]],
    [P(2), [['src/z.ts', 2, 0, 0], ['gone.ts', 3, 0, 0]], '2026-10-20T00:00:00Z'],
    [P(1), [['web/b.ts', 1, 0, 0], ['README.md', 1, 0, 0]]],
    [P(2), [['src/z.ts', 0, 0, 0], ['web/b.ts', 0, 1, 0]]],
    [P(9), [['src/a.ts', 5, 0, 0]]],
  ]);
  // No path history: renames can't be followed, but each touch still counts on its file at HEAD.
  const base = fogBase(snap, null);

  it("lists the person's files by folder then name and their bodies by id, each with its own count of commits", () => {
    expect(crewDetail(base, P(2))).toEqual({
      ok: true, schemaVersion: 'crew-detail.1', head: HEAD, person: P(2), displayName: 'Person 2', captain: false,
      // The latest author date, not the latest commit's: the second commit was authored after the fourth was committed.
      lastActive: '2026-10-20T00:00:00Z',
      planets: [{ home: 'd_000000000src', touches: 2 }, { home: 'd_000000000web', touches: 1 }],
      // src/z.ts (2 touches: c4 changed it by 0 lines, no touch) sorts after src/a.ts (1): by name, never by count.
      files: [
        { fileId: fileIdOf('src/a.ts'), path: 'src/a.ts', home: 'd_000000000src', touches: 1 },
        { fileId: fileIdOf('src/z.ts'), path: 'src/z.ts', home: 'd_000000000src', touches: 2 },
        { fileId: fileIdOf('web/b.ts'), path: 'web/b.ts', home: 'd_000000000web', touches: 1 },
      ],
      otherFiles: 1, needsRescan: false,
    });
  });

  it('puts root files on the star and marks the captain', () => {
    expect(crewDetail(base, P(1))).toMatchObject({ captain: true, planets: [{ home: 'd_000000000web', touches: 1 }, { home: 'star', touches: 1 }],
      files: [{ path: 'README.md', home: 'star', touches: 1 }, { path: 'web/b.ts', home: 'd_000000000web', touches: 1 }], otherFiles: 0 });
  });

  it('carries no total: the only numbers are per body, per file and the other paths', () => {
    const d = crewDetail(base, P(2));
    expect(Object.keys(d as object).sort()).toEqual(['captain', 'displayName', 'files', 'head', 'lastActive', 'needsRescan', 'ok', 'otherFiles', 'person', 'planets', 'schemaVersion']);
  });

  it('answers nothing for a bot or a person the snapshot lacks, and damaged for a person with no commit', () => {
    expect(crewDetail(base, P(9))).toBeNull();
    expect(crewDetail(base, P(5))).toBeNull();
    const lonely = fogBase(snapshotOf(['README.md'], [person(1), person(4)], [[P(1), [['README.md', 1, 0, 0]]]]), null);
    expect(crewDetail(lonely, P(4))).toBe('damaged');
  });

  it('says rescan for a snapshot from before #207', () => {
    const old = snapshotOf(['README.md'], [{ id: P(2), displayName: 'Person 2', isSelf: false }], [[P(2), [['README.md', 1, 0, 0]]]]);
    expect(crewDetail(fogBase(old, null), P(2))).toEqual({ ok: true, schemaVersion: 'crew-detail.1', head: HEAD, person: P(2), displayName: 'Person 2',
      captain: false, lastActive: null, planets: [], files: [], otherFiles: 0, needsRescan: true });
  });
});

describe('crewProblem (#207: damaged people are a state error, never guessed around)', () => {
  const ok = snapshotOf(['README.md'], [person(1), person(2)], [[P(1), [['README.md', 1, 0, 0]]]]);
  const cases: [string, unknown, string | null][] = [
    ['a scanner record', ok.people, null],
    ['a snapshot from before #207', [{ id: P(1), displayName: 'x', isSelf: true }], null],
    ['no people', undefined, 'people are missing'],
    ['a null entry', [null], 'a person is damaged'],
    ['a malformed id', [{ ...person(1), id: 'p_../x' }], 'a person is damaged'],
    ['a name that is not text', [{ ...person(1), displayName: 7 }], 'a person is damaged'],
    ['isBot that is not a boolean', [{ ...person(1), isBot: 'no' }], 'a person is damaged'],
    ['a repeated id', [person(1), person(1)], 'a person is listed twice'],
    ['isBot on some people only', [person(1), { id: P(2), displayName: 'x', isSelf: false }], 'people are from two commet versions'],
  ];
  for (const [name, people, want] of cases) {
    it(name, () => expect(crewProblem({ ...ok, people: people as Person[] })).toBe(want));
  }

  it('refuses an author date the panel cannot compare', () => {
    expect(crewProblem({ ...ok, commits: [{ ...ok.commits[0]!, authorDate: 'yesterday' }] })).toBe('a commit date is damaged');
  });
});
