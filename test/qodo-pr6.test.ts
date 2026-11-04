// Qodo PR #6 findings on the Issue #5 fix. Each case scans a tiny repo twice: a control without
// the triggering record (must be human or agent as stated) and the case itself.
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runsGitCommit } from '../src/attrib/parsers/claude.js';
import { createResult, miniClaude, miniRepo, scanMini, session, type Row } from './fixtures/mini.js';

const SID = '12121212-1212-4121-8121-121212121212';
const IDLE = '34343434-3434-4343-8343-343434343434';
const DAY = '2026-10-10';
const at = (hhmmss: string) => `${DAY}T${hhmmss}.000Z`;
const LINES = ['export const reviewedLineOne = 4101;', 'export const reviewedLineTwo = reviewedLineOne + 1;'];
const PATH = 'src/reviewed.ts';

/** One self commit of LINES at 10:00 inside an idle session's coverage, plus an earlier root commit. */
const repoWith = (setup?: (dir: string) => void) => miniRepo([
  { id: 'root', at: `${DAY}T08:00:00Z`, path: 'README.md', lines: ['# Mini fixture', 'A root commit before the logs.'] },
  { id: 'target', at: `${DAY}T10:00:00Z`, path: PATH, lines: LINES },
], setup);
/** An idle session in `cwd` covering the target commit; it logs no edit. */
const idle = (cwd: string): Row[] => { const s = session(IDLE, cwd); return [s.user('i1', at('09:00:00')), s.user('i2', at('10:30:00'))]; };
/** Scans the control (without `trigger`) and the case (with it) against fresh copies of one repo. */
async function controlAndCase(build: (dir: string, withTrigger: boolean) => Record<string, Row[]>, setup?: (dir: string) => void) {
  const [a, b] = [repoWith(setup), repoWith(setup)];
  return { control: await scanMini(a, miniClaude(build(a.dir, false))), withCase: await scanMini(b, miniClaude(build(b.dir, true))) };
}

describe('Qodo PR6 #5: one dropped record counts once', () => {
  it('a bashEditDiff record with two unplaceable files gives dropped = 1', async () => {
    const repo = repoWith();
    const s = session(SID, repo.dir);
    const bad = (name: string) => ({ filePath: `${repo.dir}/src/../${name}`, created: true,
      hunks: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 2, lines: LINES.map((l) => `+${l}`) }] });
    const rows = [s.user('u1', at('09:00:00')), s.call('a2', at('09:30:00'), 'Bash', { command: 'synthetic edit' }),
      s.result('u3', 'a2', at('09:30:01'), { stdout: '', bashEditDiff: { files: [bad('one.ts'), bad('two.ts')] } }), s.user('u4', at('10:30:00'))];
    const { logs, attr } = await scanMini(repo, miniClaude({ [SID]: rows }));
    expect(logs.dropped).toBe(1);
    expect(attr('target').class).toBe('unknown');
  });
});

describe('Qodo PR6 #1: a drop outside the datable records still widens the partial span', () => {
  // The dropped Write result is malformed, so it has no usable timestamp of its own.
  const malformedWrite = (dir: string) => JSON.stringify(session(SID, dir).result('u0', 'a0', at('09:30:01'),
    createResult(join(dir, PATH), LINES))).slice(0, -3);

  it('a dropped record at the very start of a transcript keeps a commit covered by another transcript from being human', async () => {
    const { control, withCase } = await controlAndCase((dir, trigger) => {
      const s = session(SID, dir);
      return { [IDLE]: idle(dir), [SID]: [...(trigger ? [malformedWrite(dir)] : []), s.user('u1', at('11:00:00')), s.user('u2', at('11:30:00'))] };
    });
    expect(control.attr('target')).toMatchObject({ class: 'human' });
    expect(withCase.logs.dropped).toBe(1);
    expect(withCase.attr('target')).toMatchObject({ class: 'unknown', tier: 'none' });
  });

  it('a dropped record at the very end of a transcript keeps a later covered commit from being human', async () => {
    const { control, withCase } = await controlAndCase((dir, trigger) => {
      const s = session(SID, dir);
      return { [IDLE]: idle(dir), [SID]: [s.user('u1', at('08:30:00')), s.user('u2', at('08:40:00')), ...(trigger ? [malformedWrite(dir)] : [])] };
    });
    expect(control.attr('target')).toMatchObject({ class: 'human' });
    expect(withCase.attr('target')).toMatchObject({ class: 'unknown', tier: 'none' });
  });
});

describe('Qodo PR6 #3: an edit call that can\'t be linked to its result is a drop', () => {
  it('a Write call with no uuid, whose result lands after the commit, keeps the commit from being human', async () => {
    // The commit happens while the Write is in flight; only the call's time puts the edit before it.
    const { control, withCase } = await controlAndCase((dir, trigger) => {
      const s = session(SID, dir);
      const callId = trigger ? undefined : 'a2';
      return { [SID]: [s.user('u1', at('09:00:00')), s.call(callId, at('09:59:50'), 'Write', { file_path: join(dir, PATH) }),
        s.result('u3', callId, at('10:00:05'), createResult(join(dir, PATH), LINES)), s.user('u4', at('10:30:00'))] };
    });
    expect(control.attr('target')).toMatchObject({ class: 'agent', agentLineShareMilli: 1000 });
    expect(withCase.logs.dropped).toBe(1);
    expect(withCase.attr('target')).toMatchObject({ class: 'unknown', tier: 'none' });
  });
});

describe('Qodo PR6 #4: edits above a symlinked cwd', () => {
  const withDocs = (dir: string) => {
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs/keep.md'), '# Docs\nKept so the docs dir exists.\n');
  };
  /** A Write session in `cwd` (a subdirectory) that creates `file`. */
  const writer = (cwd: string, file: string): Row[] => {
    const s = session(SID, cwd);
    return [s.user('u1', at('09:00:00')), s.call('a2', at('09:30:00'), 'Write', { file_path: file }),
      s.result('u3', 'a2', at('09:30:01'), createResult(file, LINES)), s.user('u4', at('10:30:00'))];
  };

  it('a session whose cwd is a subdirectory reached through a symlinked repo root matches edits above the cwd (agent)', async () => {
    const { control, withCase } = await controlAndCase((dir, trigger) => {
      const root = trigger ? join(realpathSync(mkdtempSync(join(tmpdir(), 'commet-alias-'))), 'repo-link') : dir;
      if (trigger) symlinkSync(dir, root);
      return { [SID]: writer(join(root, 'docs'), join(root, PATH)) };
    }, withDocs);
    expect(control.attr('target')).toMatchObject({ class: 'agent', agentLineShareMilli: 1000 });
    expect(withCase.attr('target')).toMatchObject({ class: 'agent', agentLineShareMilli: 1000 });
    expect(withCase.logs.dropped).toBe(0);
  });

  it('an absolute in-repo edit path outside the cwd that does not relativise is a drop', async () => {
    const { control, withCase } = await controlAndCase((dir, trigger) => ({ [IDLE]: idle(dir),
      [SID]: writer(join(dir, 'docs'), trigger ? `${dir}/src/../${PATH}` : join(dir, 'docs/other.md')) }), withDocs);
    expect(control.attr('target')).toMatchObject({ class: 'human' });
    expect(withCase.logs.dropped).toBe(1);
    expect(withCase.attr('target')).toMatchObject({ class: 'unknown', tier: 'none' });
  });

  it('an edit clearly outside the repo (a home dotfile, another repo) stays ignored', async () => {
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'commet-elsewhere-')));
    const { withCase } = await controlAndCase((dir) => ({ [IDLE]: idle(dir), [SID]: writer(join(dir, 'docs'), join(elsewhere, '.zshrc')) }), withDocs);
    expect(withCase.logs.dropped).toBe(0);
    expect(withCase.attr('target')).toMatchObject({ class: 'human' });
  });
});

describe('Qodo PR6 #2: an agent git command marks the commits made while it ran', () => {
  it('recognises commit-creating git commands, including -C, -c, chains and bash -c', () => {
    const yes = ['git commit -q -m x', 'cd sub && git commit -qm "wip"', 'git -C ../other commit --amend --no-edit',
      'git -C "dir with space" merge --no-ff topic', 'git -c user.name=x -c commit.gpgsign=false commit -m y',
      'git --no-pager cherry-pick abc1234', 'git revert --no-edit HEAD', 'git am < series.mbox', 'bash -c "git pull --rebase"',
      'git rebase main', '/usr/bin/git commit -m x', 'npm test; git commit -am wip', 'make && git merge -q topic | tail -1'];
    const no = ['git status', 'git log --grep commit', 'git commit-tree HEAD^{tree}', 'git merge-base a b', 'git show HEAD:commit.txt',
      'legit commit', 'gh pr merge 6', 'git diff --stat', 'echo committed'];
    expect(yes.filter((c) => !runsGitCommit(c))).toEqual([]);
    expect(no.filter((c) => runsGitCommit(c))).toEqual([]);
  });

  it('recognises attached and `=` option forms (Qodo PR6 #6)', () => {
    const yes = ['git -C/path/to/repo commit -q', 'git -C"/a b" commit -q', "git -C'/a b' merge topic", 'git -ckey=val commit -m x',
      'git -cuser.name=x commit -m x', 'git -c "user.name=A B" commit -m x', 'git --git-dir=/x/.git --work-tree=/x commit -m y',
      'git --git-dir /x/.git commit -q', 'git --work-tree "/a b" merge topic', 'git --no-pager commit -m z',
      'git --namespace=n --bare cherry-pick abc1234', 'git -P revert HEAD'];
    expect(yes.filter((c) => !runsGitCommit(c))).toEqual([]);
    expect(['git -C/path status', 'git --git-dir=/x/.git log', 'git -ckey=val show commit'].filter((c) => runsGitCommit(c))).toEqual([]);
    // Each token has one parse, so a pathological option run stays fast.
    const t0 = performance.now();
    runsGitCommit(`git ${'-C -C '.repeat(20_000)}x`);
    runsGitCommit(`git ${'--git-dir -C -c --work-tree '.repeat(10_000)}x`);
    runsGitCommit(`git ${'-C/x -ck=v --no-pager '.repeat(10_000)}x`);
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  const heredoc = `cat > ${PATH} <<'EOF'\n${LINES.join('\n')}\nEOF`;
  it('an agent `git commit -q` of heredoc-written files (share 0) is unknown, never human', async () => {
    const { control, withCase } = await controlAndCase((dir, trigger) => {
      const s = session(SID, dir);
      const command = trigger ? `${heredoc} && git add -A && git commit -q -m "feat: reviewed"` : heredoc;
      return { [SID]: [s.user('u1', at('09:00:00')), s.call('a2', at('09:59:50'), 'Bash', { command }),
        s.result('u3', 'a2', at('10:00:02'), { stdout: '', stderr: '', interrupted: false }), s.user('u4', at('10:30:00'))] };
    });
    expect(control.attr('target')).toMatchObject({ class: 'human' });
    expect(withCase.attr('target')).toMatchObject({ class: 'unknown', tier: 'none', agentLineShareMilli: 0,
      evidence: [{ kind: 'agent_ran_commit', detail: 'git_command' }] });
    // The session is linked to the commit and emitted, so the reference resolves.
    const key = withCase.attr('target').sessions[0]!.sessionKey;
    expect(withCase.snapshot.sessions.find((x) => x.key === key)?.commits).toHaveLength(1);
    // A commit outside the command's window is untouched.
    expect(withCase.attr('root').evidence).toEqual([]);
  });

  it('a git command with no logged result marks commits until the file was last written', async () => {
    const { control, withCase } = await controlAndCase((dir, trigger) => {
      const s = session(SID, dir);
      return { [IDLE]: idle(dir), [SID]: [s.user('u1', at('09:00:00')),
        s.call('a2', at('09:59:50'), 'Bash', { command: trigger ? 'git -C . commit -q -m x' : 'git status' })] };
    });
    expect(control.attr('target')).toMatchObject({ class: 'human' });
    expect(withCase.attr('target')).toMatchObject({ class: 'unknown', evidence: [{ kind: 'agent_ran_commit', detail: 'git_command' }] });
  });
});

describe('Qodo PR6 #7: parallel tool uses in one assistant record', () => {
  it('an Edit result arriving first does not close a parallel quiet git commit\'s window', async () => {
    const { control, withCase } = await controlAndCase((dir, trigger) => {
      const s = session(SID, dir);
      return { [SID]: [s.user('u1', at('09:00:00')),
        s.calls('a2', at('09:59:50'), [{ id: 'e1', name: 'Edit', input: { file_path: join(dir, 'docs/scratch.md') } },
          { id: 'g1', name: 'Bash', input: { command: trigger ? 'git commit -q -m "feat: reviewed"' : 'ls -la' } }]),
        s.resultFor('u3', 'e1', { source: 'a2' }, at('09:59:55'), createResult(join(dir, 'docs/scratch.md'), ['A scratch note the agent wrote.'])),
        s.resultFor('u4', 'g1', { source: 'a2' }, at('10:00:02'), { stdout: '', stderr: '', interrupted: false }),
        s.user('u5', at('10:30:00'))] };
    });
    expect(control.attr('target')).toMatchObject({ class: 'human' });
    expect(withCase.attr('target')).toMatchObject({ class: 'unknown', tier: 'none', evidence: [{ kind: 'agent_ran_commit', detail: 'git_command' }] });
  });

  it('an edit result linked only through a sibling result (parentUuid) is timed by its own tool use', async () => {
    // The Write's result is logged after the commit; only the call's time puts the edit before it.
    const { control, withCase } = await controlAndCase((dir, trigger) => {
      const s = session(SID, dir);
      return { [SID]: [s.user('u1', at('09:00:00')),
        s.calls('a2', at('09:59:50'), [{ id: 'w1', name: 'Write', input: { file_path: join(dir, PATH) } }, { id: 'b1', name: 'Bash', input: { command: 'ls' } }]),
        s.resultFor('u3', 'b1', { source: 'a2' }, at('09:59:52'), { stdout: '', stderr: '', interrupted: false }),
        s.resultFor('u4', 'w1', trigger ? { parent: 'u3' } : { source: 'a2' }, at('10:00:05'), createResult(join(dir, PATH), LINES)),
        s.user('u5', at('10:30:00'))] };
    });
    expect(control.attr('target')).toMatchObject({ class: 'agent', agentLineShareMilli: 1000 });
    expect(withCase.attr('target')).toMatchObject({ class: 'agent', agentLineShareMilli: 1000 });
  });
});

describe('Qodo PR8 #6: a failed agent git commit closes its window', () => {
  it('a git commit whose result is a plain error string does not mark a later human commit as agent-run', async () => {
    const { control, withCase } = await controlAndCase((dir, trigger) => {
      const s = session(SID, dir);
      const failed = [s.call('a2', at('09:00:00'), 'Bash', { command: 'git commit -m "feat: reviewed"' }),
        { ...s.result('u3', 'a2', at('09:00:01'), {}), toolUseResult: 'Error: permission denied' }];
      return { [SID]: [s.user('u1', at('08:55:00')), ...(trigger ? failed : []), s.user('u4', at('09:30:00')), s.user('u5', at('10:30:00'))] };
    });
    expect(control.attr('target')).toMatchObject({ class: 'human', evidence: [] });
    expect(withCase.attr('target')).toMatchObject({ class: 'human', evidence: [] });
  });
});

describe('Qodo PR8 #2: a transcript that can\'t be read is a blind span', () => {
  const writer = (dir: string): Row[] => {
    const s = session(SID, dir);
    return [s.user('u1', at('09:00:00')), s.call('a2', at('09:30:00'), 'Write', { file_path: join(dir, PATH) }),
      s.result('u3', 'a2', at('09:30:01'), createResult(join(dir, PATH), LINES)), s.user('u4', at('10:30:00'))];
  };

  it('a symlinked transcript keeps a commit covered by another transcript from being human', async () => {
    const { control, withCase } = await controlAndCase((dir, trigger) => {
      const rows = { [IDLE]: idle(dir) };
      if (!trigger) return rows;
      // Planted after the projects dir exists: a transcript reached through a symlink is never read.
      const real = join(realpathSync(mkdtempSync(join(tmpdir(), 'commet-linked-log-'))), 'real.jsonl');
      writeFileSync(real, writer(dir).map((r) => JSON.stringify(r)).join('\n') + '\n');
      return { ...rows, [`link:${real}`]: [] };
    });
    expect(control.attr('target')).toMatchObject({ class: 'human' });
    expect(withCase.logs.unavailable).toBe(1);
    expect(withCase.attr('target')).toMatchObject({ class: 'unknown', tier: 'none' });
  });

  it.skipIf(process.getuid?.() === 0)('a transcript that fails to read is counted as unavailable', async () => {
    const { withCase } = await controlAndCase((dir) => ({ [IDLE]: idle(dir), [`mode000:${SID}`]: writer(dir) }));
    expect(withCase.logs.unavailable).toBe(1);
  });
});

describe('Qodo PR8 #7: sessions started outside the repo', () => {
  const writer = (cwd: string, file: string, extra: Row[] = []): Row[] => {
    const s = session(SID, cwd);
    return [s.user('u1', at('09:00:00')), s.call('a2', at('09:30:00'), 'Write', { file_path: file }),
      s.result('u3', 'a2', at('09:30:01'), createResult(file, LINES)), ...extra, s.user('u4', at('10:30:00'))];
  };

  it('a session in a parent directory that edits this repo by absolute path and commits matches as agent', async () => {
    const { control, withCase } = await controlAndCase((dir, trigger) => {
      const s = session(SID, dirname(dir));
      // A sibling edit under the parent cwd, outside this repo: not ours, so not a drop either.
      const sibling = join(dirname(dir), 'commet-sibling-project', 'notes.md');
      const commit = [s.call('a7', at('09:40:00'), 'Write', { file_path: sibling }), s.result('u8', 'a7', at('09:40:01'), createResult(sibling, ['Sibling notes.'])),
        s.call('a5', at('09:59:50'), 'Bash', { command: `git -C ${dir} commit -q -m reviewed` }),
        s.result('u6', 'a5', at('10:00:02'), { stdout: '', stderr: '', interrupted: false })];
      return trigger ? { [SID]: writer(dirname(dir), join(dir, PATH), commit) } : {};
    });
    expect(control.attr('target').class).toBe('unknown');
    expect(withCase.attr('target')).toMatchObject({ class: 'agent', agentLineShareMilli: 1000,
      evidence: [{ kind: 'transcript_match', detail: 'verbatim' }, { kind: 'agent_ran_commit', detail: 'git_command' }] });
    expect(withCase.logs).toMatchObject({ dropped: 0, unattributed: 0 });
  });

  it('a session in an unrelated repo editing an identically named file stays ignored', async () => {
    const other = repoWith();
    const { withCase } = await controlAndCase((dir) => ({ [IDLE]: idle(dir), [SID]: writer(other.dir, join(other.dir, PATH)) }));
    expect(withCase.attr('target')).toMatchObject({ class: 'human', agentLineShareMilli: 0 });
    expect(withCase.logs).toMatchObject({ transcripts: 1, dropped: 0, unattributed: 0 });
  });

  it('an outside session whose result naming this repo cannot be parsed is an unattributed blind span', async () => {
    const { control, withCase } = await controlAndCase((dir, trigger) => {
      const s = session(SID, dirname(dir));
      const bad = JSON.stringify(s.result('u3', 'a2', at('09:30:01'), createResult(join(dir, PATH), LINES))).slice(0, -3);
      return { [IDLE]: idle(dir), [SID]: [s.user('u1', at('09:00:00')), ...(trigger ? [bad] : []), s.user('u4', at('10:30:00'))] };
    });
    expect(control.attr('target')).toMatchObject({ class: 'human' });
    expect(withCase.logs.unattributed).toBe(1);
    expect(withCase.attr('target')).toMatchObject({ class: 'unknown', tier: 'none' });
  });
});
