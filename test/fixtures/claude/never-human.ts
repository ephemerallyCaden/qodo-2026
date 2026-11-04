// Synthetic Claude Code transcripts (v2.1.31x key names) for Issue #5's edge cases. Synthetic
// content only: no real transcript is read. Generated at test time because paths are absolute.
import { existsSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { FixtureRepo } from '../build/basic.js';
import { EDGE_CASES, EDGE_LINES, type EdgeCase } from '../build/never-human.js';

/** Over the parser's per-line cap (MAX_LINE) and the discovery head cap (HEAD_CAP), both 4 MiB. */
const OVER_CAP = (4 << 20) + 1024;

export interface NeverHumanClaude {
  claudeDir: string;
  /** A symlink to the repo, used as one session's cwd (case 4). */
  link: string;
  /** The repo path with its last segment upper-cased (case 4b); same directory on a case-insensitive FS. */
  caseVariant: string;
  caseInsensitiveFs: boolean;
  sessionIds: Record<string, string>;
}

const sid = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;

export function writeNeverHumanClaude(repo: FixtureRepo): NeverHumanClaude {
  const claudeDir = realpathSync(mkdtempSync(join(tmpdir(), 'commet-edge-claude-')));
  const link = join(realpathSync(mkdtempSync(join(tmpdir(), 'commet-edge-link-'))), 'repo-link');
  symlinkSync(repo.dir, link);
  const caseVariant = join(dirname(repo.dir), basename(repo.dir).toUpperCase());
  const caseInsensitiveFs = caseVariant !== repo.dir && existsSync(caseVariant);
  const sessionIds: Record<string, string> = {};

  const session = (name: string, n: number, cwd: string) => {
    const sessionId = sid(n);
    sessionIds[name] = sessionId;
    const base = { sessionId, cwd, gitBranch: 'main', version: '2.1.31', userType: 'external', isSidechain: false };
    return {
      user: (uuid: string, timestamp: string, content = 'synthetic prompt') => ({ ...base, type: 'user', uuid, timestamp, message: { role: 'user', content } }),
      call: (uuid: string, timestamp: string, name: string, input: object = {}) => ({ ...base, type: 'assistant', uuid, timestamp,
        message: { role: 'assistant', model: 'claude-opus-4-1', content: [{ type: 'tool_use', id: `t-${uuid}`, name, input }] } }),
      result: (uuid: string, parent: string, timestamp: string, toolUseResult: object) => ({ ...base, type: 'user', uuid,
        parentUuid: parent, sourceToolAssistantUUID: parent, timestamp, toolUseResult,
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `t-${parent}`, content: 'ok' }] } }),
    };
  };
  const t = (c: EdgeCase, hhmmss: string) => `${EDGE_CASES[c][0]}T${hhmmss}.000Z`;
  const create = (root: string, c: EdgeCase, lines: string[]) =>
    ({ type: 'create', filePath: join(root, EDGE_CASES[c][1]), content: lines.join('\n') + '\n', structuredPatch: [], originalFile: null });
  /** An idle session in the repo: it opens and closes around the commit and logs no edit. */
  const idle = (name: string, n: number, c: EdgeCase) => {
    const s = session(name, n, repo.dir);
    return [s.user('i1', t(c, '09:00:00')), s.user('i2', t(c, '10:30:00'))];
  };

  // Case 1: Bash heredoc (no bashEditDiff), then the agent's own `git commit`.
  const b = session('bash', 1, repo.dir);
  const bash = [
    b.user('u1', t('bash', '09:00:00')),
    b.call('a2', t('bash', '09:40:00'), 'Bash', { command: 'cat > src/bash-gen.ts <<EOF (synthetic)' }),
    b.result('u3', 'a2', t('bash', '09:40:01'), { stdout: '', stderr: '', interrupted: false }),
    b.call('a4', t('bash', '09:59:50'), 'Bash', { command: 'git commit -m "feat: generated via bash"' }),
    b.result('u5', 'a4', t('bash', '10:00:02'), { stdout: `[main ${repo.commits['bash']!.sha.slice(0, 7)}] feat: generated via bash\n 1 file changed, 2 insertions(+)`,
      stderr: '', interrupted: false }),
    b.user('u6', t('bash', '10:30:00')),
  ];

  // Case 2: an idle session open while self merges the teammate branch.
  const merge = idle('merge', 2, 'merge');

  // Case 3a: an Edit whose record exceeds the 4 MiB line cap because of a large synthetic
  // `originalFile` (any Edit of a file over ~2 MB). The added lines are tiny.
  const o = session('oversized', 3, repo.dir);
  const oversized = [
    o.user('u1', t('oversized', '09:00:00')),
    o.call('a2', t('oversized', '09:30:00'), 'Edit', { file_path: join(repo.dir, EDGE_CASES.oversized[1]) }),
    o.result('u3', 'a2', t('oversized', '09:30:01'), { filePath: join(repo.dir, EDGE_CASES.oversized[1]), oldString: 'x', newString: 'y',
      originalFile: 'x'.repeat(OVER_CAP), userModified: false, replaceAll: false,
      structuredPatch: [{ oldStart: 1, oldLines: 0, newStart: 1, newLines: 2, lines: EDGE_LINES.oversized.map((l) => `+${l}`) }] }),
    o.user('u4', t('oversized', '10:30:00')),
  ];

  // Case 3b: the Edit result is logged on a malformed (truncated) line, e.g. a crash mid-write.
  const m = session('malformed', 4, repo.dir);
  const malformedResult = JSON.stringify(m.result('u3', 'a2', t('malformed', '09:30:01'), { filePath: join(repo.dir, EDGE_CASES.malformed[1]),
    structuredPatch: [{ oldStart: 1, oldLines: 0, newStart: 1, newLines: 2, lines: EDGE_LINES.malformed.map((l) => `+${l}`) }] })).slice(0, -3);
  const malformed: (object | string)[] = [
    m.user('u1', t('malformed', '09:00:00')),
    m.call('a2', t('malformed', '09:30:00'), 'Edit', { file_path: join(repo.dir, EDGE_CASES.malformed[1]) }),
    malformedResult,
    m.user('u4', t('malformed', '10:30:00')),
  ];

  // Case 3c: a session whose first record is over the head cap (a huge pasted prompt), so
  // discovery finds no cwd; a concurrent idle session in the repo provides coverage.
  const noCwdIdle = idle('noCwdIdle', 5, 'noCwd');
  const nc = session('noCwd', 6, repo.dir);
  const noCwd = [
    nc.user('u1', t('noCwd', '09:00:00'), 'p'.repeat(OVER_CAP)),
    nc.call('a2', t('noCwd', '09:30:00'), 'Write', { file_path: join(repo.dir, EDGE_CASES.noCwd[1]) }),
    nc.result('u3', 'a2', t('noCwd', '09:30:01'), create(repo.dir, 'noCwd', EDGE_LINES.noCwd)),
    nc.user('u4', t('noCwd', '10:30:00')),
  ];

  // Case 4: the session's cwd is a symlink to the repo; edits use that path.
  const sl = session('symlinked', 7, link);
  const symlinked = [
    sl.user('u1', t('symlinked', '09:00:00')),
    sl.call('a2', t('symlinked', '09:30:00'), 'Write', { file_path: join(link, EDGE_CASES.symlinked[1]) }),
    sl.result('u3', 'a2', t('symlinked', '09:30:01'), create(link, 'symlinked', EDGE_LINES.symlinked)),
    sl.user('u4', t('symlinked', '10:30:00')),
  ];

  // Case 4b: the session's cwd differs from the repo path only in case; a concurrent idle
  // session in the repo provides coverage.
  const caseIdle = idle('caseIdle', 8, 'caseVariant');
  const cv = session('caseVariant', 9, caseVariant);
  const caseRows = [
    cv.user('u1', t('caseVariant', '09:00:00')),
    cv.call('a2', t('caseVariant', '09:30:00'), 'Write', { file_path: join(caseVariant, EDGE_CASES.caseVariant[1]) }),
    cv.result('u3', 'a2', t('caseVariant', '09:30:01'), create(caseVariant, 'caseVariant', EDGE_LINES.caseVariant)),
    cv.user('u4', t('caseVariant', '10:30:00')),
  ];

  // Positive control: idle session, human commit → human.
  const control = idle('control', 0, 'control');

  // Case 2b: the agent runs `git merge`; its output names no commit, so nothing links the merge.
  const am = session('agentMerge', 10, repo.dir);
  const agentMerge = [
    am.user('u1', t('agentMerge', '09:00:00')),
    am.call('a2', t('agentMerge', '09:59:50'), 'Bash', { command: 'git merge --no-ff teammate3' }),
    am.result('u3', 'a2', t('agentMerge', '10:00:02'), { stdout: "Merge made by the 'ort' strategy.\n lib/third.ts | 2 ++\n 1 file changed, 2 insertions(+)",
      stderr: '', interrupted: false }),
    am.user('u4', t('agentMerge', '10:30:00')),
  ];
  // Case 2c: an idle session open while self resolves a merge by hand.
  const resolvedMerge = idle('resolvedMerge', 11, 'resolvedMerge');

  // Case 3d: no record carries a cwd, so the transcript can't be placed; an idle session covers it.
  const cwdlessIdle = idle('cwdlessIdle', 12, 'cwdless');
  const cl = session('cwdless', 13, repo.dir);
  const noCwdKey = (r: object) => JSON.stringify(r, (k, v: unknown) => (k === 'cwd' ? undefined : v));
  const cwdless = [
    cl.user('u1', t('cwdless', '09:00:00')),
    cl.call('a2', t('cwdless', '09:30:00'), 'Write', { file_path: join(repo.dir, EDGE_CASES.cwdless[1]) }),
    cl.result('u3', 'a2', t('cwdless', '09:30:01'), create(repo.dir, 'cwdless', EDGE_LINES.cwdless)),
    cl.user('u4', t('cwdless', '10:30:00')),
  ].map(noCwdKey);
  // Case 3e: the Write result has no uuid, so it can't be keyed.
  const nu = session('noUuid', 14, repo.dir);
  const noUuidResult: Record<string, unknown> = nu.result('u3', 'a2', t('noUuid', '09:30:01'), create(repo.dir, 'noUuid', EDGE_LINES.noUuid));
  delete noUuidResult['uuid'];
  const noUuid = [
    nu.user('u1', t('noUuid', '09:00:00')),
    nu.call('a2', t('noUuid', '09:30:00'), 'Write', { file_path: join(repo.dir, EDGE_CASES.noUuid[1]) }),
    noUuidResult,
    nu.user('u4', t('noUuid', '10:30:00')),
  ];
  // Case 3f: the edit path is under the cwd but has a `..` segment, which relativise refuses.
  const dd = session('dotdot', 15, repo.dir);
  const dotdotPath = `${repo.dir}/src/../${EDGE_CASES.dotdot[1]}`; // not join(): it would normalise the `..`
  const dotdot = [
    dd.user('u1', t('dotdot', '09:00:00')),
    dd.call('a2', t('dotdot', '09:30:00'), 'Write', { file_path: dotdotPath }),
    dd.result('u3', 'a2', t('dotdot', '09:30:01'), { ...create(repo.dir, 'dotdot', EDGE_LINES.dotdot), filePath: dotdotPath }),
    dd.user('u4', t('dotdot', '10:30:00')),
  ];

  const jsonl = (rows: (object | string)[]) => rows.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n') + '\n';
  const files: [string, (object | string)[]][] = [
    ['bash', bash], ['merge', merge], ['oversized', oversized], ['malformed', malformed], ['noCwdIdle', noCwdIdle],
    ['noCwd', noCwd], ['symlinked', symlinked], ['caseIdle', caseIdle], ['caseVariant', caseRows], ['control', control],
    ['agentMerge', agentMerge], ['resolvedMerge', resolvedMerge], ['cwdlessIdle', cwdlessIdle], ['cwdless', cwdless],
    ['noUuid', noUuid], ['dotdot', dotdot],
  ];
  const dir = join(claudeDir, 'projects', '-edge-slug');
  mkdirSync(dir, { recursive: true });
  for (const [name, rows] of files) writeFileSync(join(dir, `${sessionIds[name]}.jsonl`), jsonl(rows));
  return { claudeDir, link, caseVariant, caseInsensitiveFs, sessionIds };
}
