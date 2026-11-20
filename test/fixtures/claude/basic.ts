// Synthetic Claude Code transcripts in the v2.1.31x shape (probed key names only), planted with
// privacy canaries. Generated at test time because `cwd` and file paths must be absolute.
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { AGENT_FILE, CONTROL, CORE_AGENT, HELPER, LATE, NOTES, SPACED, SPACED_LINES, type FixtureRepo } from '../build/basic.js';
import { realTempDir } from '../tmp.js';

export const CANARIES = {
  prompt: 'CANARY_PROMPT_7f3a',
  originalFile: 'CANARY_ORIGINAL_9b1c',
  lastPrompt: 'CANARY_LASTPROMPT_51d2',
  attachment: 'CANARY_ATTACHMENT_c3e8',
  apiRequest: 'CANARY_APIREQ_6d0f',
  history: 'CANARY_HISTORY_2e7b',
  description: 'CANARY_DESC_44aa',
  // Bash commands are only tested against the git-commit regex, never stored (Qodo PR6 #2).
  command: 'CANARY_COMMAND_8c4e',
  home: '/Users/canary-home',
  // An in-repo file the session edited that is not in the snapshot: counted, never named (#80).
  editedFile: 'CANARY_EDITED_FILE_5a1e',
  code: 'const CANARY_CODE = 1;',
  // Path-shaped metadata (Qodo #3): each must be dropped, never output.
  metaModel: 'canary-model',
  metaBranch: 'canary-branch',
  metaVersion: 'canary-version',
  metaAgentType: 'canary-agent',
};

export const MAIN_SESSION = '11111111-1111-4111-8111-111111111111';
export const SUBAGENT_ID = 'a1b2c3d4';
const OTHER_SESSION = '22222222-2222-4222-8222-222222222222';

export interface ClaudeFixture { claudeDir: string; transcripts: string[] }

export function writeClaudeFixture(repo: FixtureRepo, o: { fileSymlink?: boolean } = {}): ClaudeFixture {
  const claudeDir = realTempDir('commet-claude-');
  const at = (p: string) => join(repo.dir, p);
  const base = { sessionId: MAIN_SESSION, cwd: repo.dir, gitBranch: 'main', version: '2.1.31', userType: 'external', isSidechain: false };
  const call = (uuid: string, timestamp: string, name: string, input: object) => ({ ...base, type: 'assistant', uuid, timestamp,
    message: { role: 'assistant', model: 'claude-opus-4-1', content: [{ type: 'tool_use', id: `t-${uuid}`, name, input }] } });
  const result = (uuid: string, parent: string, timestamp: string, toolUseResult: object) => ({ ...base, type: 'user', uuid,
    parentUuid: parent, sourceToolAssistantUUID: parent, timestamp, toolUseResult,
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `t-${parent}`, content: 'ok' }] } });
  const writeResult = { type: 'create', filePath: at('src/agent.ts'), content: AGENT_FILE.join('\n') + '\n', structuredPatch: [], originalFile: null };

  const main = [
    { type: 'last-prompt', lastPrompt: `${CANARIES.lastPrompt} write the module`, sessionId: MAIN_SESSION },
    { ...base, type: 'user', uuid: 'u1', timestamp: '2026-10-02T09:00:00.000Z', message: { role: 'user', content: `${CANARIES.prompt} please write the agent module` } },
    call('a2', '2026-10-02T09:59:00.000Z', 'Write', { file_path: at('src/agent.ts'), content: AGENT_FILE.join('\n') }),
    result('u3', 'a2', '2026-10-02T09:59:01.000Z', writeResult),
    // The commit's own Bash result is logged after the commit date: the edit is timed by the call.
    call('a4', '2026-10-02T09:59:50.000Z', 'Bash', { command: `git commit -m "feat: agent writes the agent module" # ${CANARIES.command}` }),
    result('u5', 'a4', '2026-10-02T10:00:02.000Z', { stdout: `[main ${repo.commits['c1']!.sha.slice(0, 7)}] feat: agent writes the agent module\n 3 files changed`, stderr: '', interrupted: false }),
    call('a6', '2026-10-03T09:30:00.000Z', 'Edit', { file_path: at('src/core.ts'), old_string: '}', new_string: '}\n...' }),
    result('u7', 'a6', '2026-10-03T09:30:01.000Z', { filePath: at('src/core.ts'), oldString: CANARIES.originalFile, newString: 'x',
      originalFile: `${CANARIES.originalFile}\n${CANARIES.code}`, userModified: false, replaceAll: false,
      structuredPatch: [{ oldStart: 3, oldLines: 1, newStart: 3, newLines: 3, lines: [' }', ...CORE_AGENT.map((l) => `+${l}`)] }] }),
    // Denylisted records carry edits that would make c3 look agent-written if they were parsed.
    { ...base, type: 'attachment', uuid: 'att', timestamp: '2026-10-04T09:00:00.000Z', attachment: { content: CANARIES.attachment },
      toolUseResult: { type: 'create', filePath: at('docs/notes.md'), content: NOTES.join('\n') } },
    { ...base, type: 'api-request', uuid: 'api', timestamp: '2026-10-04T09:00:01.000Z', body: CANARIES.apiRequest,
      toolUseResult: { type: 'create', filePath: at('docs/notes.md'), content: NOTES.join('\n') } },
    result('u8', 'a6', '2026-10-03T09:40:00.000Z', { type: 'create', filePath: at(`src/${CANARIES.editedFile}.ts`), content: 'export const e = 1;',
      structuredPatch: [] }),
    // An edit outside the repo is dropped.
    result('u9', 'a6', '2026-10-04T09:10:00.000Z', { type: 'create', filePath: `${CANARIES.home}/secret.ts`, content: CANARIES.code }),
    // Written after c6 was committed (but before its later author date): must not count.
    call('a10', '2026-10-08T09:00:00.000Z', 'Write', { file_path: at('docs/late.md') }),
    result('u11', 'a10', '2026-10-08T09:00:01.000Z', { type: 'create', filePath: at('docs/late.md'), content: LATE.join('\n'), structuredPatch: [] }),
    call('a12', '2026-10-08T09:30:00.000Z', 'Write', { file_path: at('src/ctrl.ts') }),
    result('u13', 'a12', '2026-10-08T09:30:01.000Z', { type: 'create', filePath: at('src/ctrl.ts'), content: CONTROL.join('\n'), structuredPatch: [] }),
    call('a14', '2026-10-09T09:30:00.000Z', 'Bash', { command: 'write awkward paths' }),
    result('u15', 'a14', '2026-10-09T09:30:01.000Z', { stdout: '', bashEditDiff: { files: [SPACED.plain, SPACED.quoted].map((p) => ({
      filePath: at(p), created: true, hunks: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 2, lines: SPACED_LINES.map((l) => `+${l}`) }] })) } }),
  ];
  // A resumed session keeps its sessionId and repeats an earlier record: same key, no double count.
  const resumed = [result('u3', 'a2', '2026-10-07T08:00:00.000Z', writeResult)];
  const subBase = { ...base, cwd: at('src'), agentId: SUBAGENT_ID, isSidechain: true };
  const sub = [
    { ...subBase, type: 'user', uuid: 's1', timestamp: '2026-10-06T09:00:00.000Z', message: { role: 'user', content: `${CANARIES.prompt} subagent task` } },
    { ...subBase, type: 'assistant', uuid: 's2', timestamp: '2026-10-06T09:59:58.000Z',
      message: { role: 'assistant', model: 'claude-sonnet-4-5', content: [{ type: 'tool_use', id: 't-s2', name: 'Bash', input: { command: 'cat > helper.ts' } }] } },
    { ...subBase, type: 'user', uuid: 's3', parentUuid: 's2', sourceToolAssistantUUID: 's2', timestamp: '2026-10-06T10:00:03.000Z',
      toolUseResult: { stdout: '', stderr: '', bashEditDiff: { files: [{ filePath: at('src/sub/helper.ts'), created: true,
        hunks: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 3, lines: HELPER.map((l) => `+${l}`) }] }] } } },
  ];
  // Another repo's session (its slug looks like ours on purpose): discovery must go by cwd.
  const other = [{ type: 'user', sessionId: OTHER_SESSION, cwd: `${CANARIES.home}/elsewhere`, uuid: 'o1', timestamp: '2026-10-02T09:00:00.000Z',
    toolUseResult: { type: 'create', filePath: `${CANARIES.home}/elsewhere/src/agent.ts`, content: AGENT_FILE.join('\n') } }];

  // A transcript-shaped file under the denied file-history/: symlinks must not make it readable.
  const denied = [{ type: 'user', sessionId: '44444444-4444-4444-8444-444444444444', cwd: repo.dir, uuid: 'd1',
    timestamp: '2026-10-04T09:00:00.000Z', toolUseResult: { type: 'create', filePath: at('docs/notes.md'), content: NOTES.join('\n'), structuredPatch: [] } }];
  // A session whose metadata fields carry paths; its edit is real, so the session is emitted.
  const metaBase = { ...base, sessionId: '66666666-6666-4666-8666-666666666666', gitBranch: `~/${CANARIES.metaBranch}`,
    version: `1.0/../${CANARIES.metaVersion}` };
  const meta = [
    { ...metaBase, type: 'assistant', uuid: 'm1', timestamp: '2026-10-05T09:00:00.000Z',
      message: { role: 'assistant', model: `m${homedir()}/${CANARIES.metaModel}`, content: [{ type: 'tool_use', id: 't-m1', name: 'Write', input: {} }] } },
    { ...metaBase, type: 'user', uuid: 'm2', parentUuid: 'm1', timestamp: '2026-10-05T09:00:01.000Z',
      toolUseResult: { type: 'create', filePath: at('scratch/meta.txt'), content: 'scratch file written by the agent', structuredPatch: [] } },
  ];
  const metaSub = [{ ...metaBase, agentId: 'f00d', isSidechain: true, type: 'user', uuid: 'm3', timestamp: '2026-10-05T09:10:00.000Z',
    toolUseResult: { type: 'create', filePath: at('scratch/sub.txt'), content: 'scratch file written by a subagent', structuredPatch: [] } }];
  // A later session: its interval starts after c9, leaving c9 in a gap between transcripts.
  const late = [{ ...base, sessionId: '77777777-7777-4777-8777-777777777777', type: 'user', uuid: 'l1', timestamp: '2026-10-25T09:00:00.000Z',
    toolUseResult: { type: 'create', filePath: at('scratch/late.txt'), content: 'a later scratch file from the agent', structuredPatch: [] } }];
  const jsonl = (rows: object[]) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
  const files: [string, string][] = [
    [`projects/-unrelated-slug/${MAIN_SESSION}.jsonl`, jsonl(main)],
    ['projects/-unrelated-slug/33333333-3333-4333-8333-333333333333.jsonl', jsonl(resumed)],
    [`projects/-unrelated-slug/${MAIN_SESSION}/subagents/agent-${SUBAGENT_ID}.jsonl`, jsonl(sub)],
    [`projects/-unrelated-slug/${MAIN_SESSION}/subagents/agent-${SUBAGENT_ID}.meta.json`,
      JSON.stringify({ agentType: 'general-purpose', description: CANARIES.description, toolUseId: 't-sub', spawnDepth: 1 })],
    [`projects/-fixture-repo/${OTHER_SESSION}.jsonl`, jsonl(other)],
    ['projects/-unrelated-slug/66666666-6666-4666-8666-666666666666.jsonl', jsonl(meta)],
    ['projects/-unrelated-slug/77777777-7777-4777-8777-777777777777.jsonl', jsonl(late)],
    ['projects/-unrelated-slug/66666666-6666-4666-8666-666666666666/subagents/agent-f00d.jsonl', jsonl(metaSub)],
    ['projects/-unrelated-slug/66666666-6666-4666-8666-666666666666/subagents/agent-f00d.meta.json',
      JSON.stringify({ agentType: `C:/${CANARIES.metaAgentType}` })],
    ['history.jsonl', jsonl([{ display: CANARIES.history, project: repo.dir }])],
    ['file-history/x/backup', `${CANARIES.history}\n${CANARIES.code}\n`],
    ['file-history/x/linked.jsonl', jsonl(denied)],
  ];
  for (const [rel, text] of files) {
    mkdirSync(join(claudeDir, rel, '..'), { recursive: true });
    writeFileSync(join(claudeDir, rel), text);
  }
  // A transcript symlinked to a denied file is never read, but it is blind for all time (Qodo
  // PR10 #6), which would swallow every commit; only the privacy test plants it.
  if (o.fileSymlink) symlinkSync(join(claudeDir, 'file-history/x/linked.jsonl'), join(claudeDir, 'projects/-unrelated-slug/55555555-5555-4555-8555-555555555555.jsonl'));
  symlinkSync(join(claudeDir, 'file-history/x'), join(claudeDir, 'projects/-linked-slug'));
  return { claudeDir, transcripts: files.map(([rel]) => join(claudeDir, rel)) };
}
