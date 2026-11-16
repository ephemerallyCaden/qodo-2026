// The PreToolUse guard behind the project agents' bans (.claude/hooks/agent-guard.mjs, Qodo on #150):
// feature-agent never pushes, merges or publishes; debugger writes only tests and probes; scout and
// bar-raiser never change the checkout. Each case pipes a tool call into the script, as Claude
// Code does, and checks the exit code: 2 blocks the call, 0 lets it through.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { realTempDir } from './fixtures/tmp.js';

const ROOT = resolve(import.meta.dirname, '..');
const GUARD = join(ROOT, '.claude/hooks/agent-guard.mjs');
// The guard's temp dir: its own, so a fixture repo made with tempDir() counts as an ordinary checkout.
const SCRATCH = realTempDir('commet-guard-scratch-');
// No global or system git config: a user alias must not change what a case means.
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', TMPDIR: SCRATCH };

type Call = { tool_name: string; tool_input: Record<string, unknown>; cwd?: string };
const run = (argv: string[], call: Call | string, opts: { shell?: string; cwd?: string } = {}) => {
  const input = typeof call === 'string' ? call : JSON.stringify({ hook_event_name: 'PreToolUse', cwd: opts.cwd ?? ROOT, ...call });
  const r = opts.shell
    ? spawnSync('/bin/sh', ['-c', opts.shell], { input, encoding: 'utf8', env: { ...ENV, CLAUDE_PROJECT_DIR: ROOT } })
    : spawnSync(process.execPath, [GUARD, ...argv], { input, encoding: 'utf8', env: ENV });
  return { status: r.status, stderr: r.stderr };
};
const bash = (role: string, command: string, cwd = ROOT) => run([role], { tool_name: 'Bash', tool_input: { command }, cwd }, { cwd });
const write = (role: string, file_path: string, cwd = ROOT, tool_name = 'Write') => run([role], { tool_name, tool_input: { file_path }, cwd }, { cwd });

// Every mismatch at once, so a failing run lists each command that got the wrong answer.
const expectBlocked = (role: string, commands: string[], cwd?: string) => {
  expect(commands.map((command) => ({ command, status: bash(role, command, cwd).status }))).toEqual(commands.map((command) => ({ command, status: 2 })));
};
const expectAllowed = (role: string, commands: string[], cwd?: string) => {
  const got = commands.map((command) => { const r = bash(role, command, cwd); return { command, status: r.status, stderr: r.stderr }; });
  expect(got).toEqual(commands.map((command) => ({ command, status: 0, stderr: '' })));
};

describe('feature role: no push, PR merge/create/close or publish', () => {
  it('blocks git push however it is spelled or chained', () => {
    expectBlocked('feature', [
      'git push',
      'git push --dry-run origin HEAD',
      'git -C ../other push',
      'git -C ../a -c core.pager=cat --no-pager push origin',
      '/usr/bin/git push',
      '"git" push',
      'g\\it push',
      'GIT_TRACE=1 FOO="a b" git push',
      'env -i PATH=/usr/bin git push',
      'npm test && git push',
      'npm test; git push',
      'false || git push',
      'npm run lint\ngit push',
      'echo y | git push',
      '(cd .. && git push)',
      'echo $(git push)',
      'echo "$(git push)"',
      'echo `git push`',
      "sh -c 'git push'",
      'bash -lc "cd /tmp && git push origin HEAD"',
      'eval "git push"',
      'xargs git push < /dev/null',
      'git -c alias.p=push p',
    ]);
  });

  it('blocks gh PR merge/create/close, API writes and npm publish', () => {
    expectBlocked('feature', [
      'gh pr merge 150',
      'gh pr merge --help',
      'gh -R owner/repo pr create --fill',
      'gh --repo=owner/repo pr close 3',
      'gh pr reopen 3',
      'gh api -X PUT repos/o/r/pulls/150/merge',
      'gh api --method=POST repos/o/r/pulls -f title=x',
      'gh api repos/o/r/pulls -f title=x -f head=b',
      'gh api graphql -f query=mutation{x}',
      'npm publish',
      'npm --workspace x publish --dry-run',
      'npm unpublish commet',
    ]);
  });

  it('resolves a repo-local git alias before deciding', () => {
    const repo = realTempDir('commet-guard-alias-');
    spawnSync('git', ['init', '-q', repo], { env: ENV });
    spawnSync('git', ['-C', repo, 'config', 'alias.pu', 'push'], { env: ENV });
    spawnSync('git', ['-C', repo, 'config', 'alias.sh-pu', '!git push origin'], { env: ENV });
    expectBlocked('feature', ['git pu', 'git sh-pu'], repo);
  });

  it('lets ordinary work through, including text that only mentions a push', () => {
    expectAllowed('feature', [
      'git status',
      'git add test/agent-guard.test.ts && git commit -m "fix: never git push from a sandbox"',
      'git stash push -m wip',
      'git log --grep push',
      'git merge-base HEAD origin/main',
      'grep -n "git push" AGENTS.md',
      'npx vitest run test/agent-guard.test.ts > /tmp/out.txt 2>&1',
      'npm run typecheck && npm run lint',
      'gh pr view 150 --json title',
      'gh api repos/o/r/pulls/150/comments',
      'gh api -X GET search/issues -f q=x',
      'cat <<EOF > /tmp/note\ngit push\nEOF',
    ]);
  });
});

// Qodo round 3 on #150: each of these got past the denylist guard on fe69af7.
const R3 = [
  "curl -s -o /dev/null -w '%output{src/file}%{http_code}' https://example.com",
  "tar -tf /tmp/a.tar --checkpoint=1 --checkpoint-action='exec=touch src/file'",
  "sed --in 's/x/y/' src/cli.ts",
  'sort --o=src/cli.ts test/input',
];

describe('readonly role (scout, bar-raiser): never changes the checkout', () => {
  it('blocks mutating git verbs, aliases and unknown verbs', () => {
    expectBlocked('readonly', [
      'git checkout main',
      'git switch -c x',
      'git merge origin/main',
      'git rebase -i HEAD~2',
      'git reset --hard',
      'git commit -m x',
      'git push',
      'git stash',
      'git stash pop',
      'git restore src/cli.ts',
      'git clean -fd',
      'git cherry-pick abc',
      'git branch -D old',
      'git branch newbranch',
      'git tag v1',
      'git tag -d v1',
      'git worktree add ../x',
      'git config user.name x',
      'git fetch origin main:main',
      'git co main',
      'git clone https://github.com/o/r',
      `git clone https://github.com/o/r ${join(SCRATCH, 'r')}`,
      'git fetch origin',
      'git fetch',
      'git reflog drop --all',
      'git reflog expire --all',
      'git reflog delete HEAD@{1}',
      'cd .. && git checkout main',
      'git -C ../x reset --hard',
      'git status; git checkout -- src',
      "bash -c 'git switch main'",
    ]);
  });

  it('blocks gh writes', () => {
    expectBlocked('readonly', [
      'gh pr checkout 150',
      'gh pr comment 150 -b x',
      'gh pr review 150 --approve',
      'gh pr merge 150',
      'gh issue create -t x',
      'gh issue close 3',
      'gh issue comment 3 -b x',
      'gh api -X DELETE repos/o/r/issues/comments/1',
      'gh api repos/o/r/issues -f title=x',
      'gh run rerun 1',
    ]);
  });

  it('blocks shell writes outside a temp dir', () => {
    expectBlocked('readonly', [
      'echo x > src/a.ts',
      'cat a >> notes.md',
      'echo x &> out.log',
      'echo x >| out.log',
      'echo x > "$OUT"',
      'echo x | tee out.txt',
      'rm -rf src',
      'mv a.ts b.ts',
      'cp src/a.ts src/b.ts',
      'touch new.ts',
      "sed -i '' s/a/b/ src/a.ts",
      'echo x > /tmp/../' + ROOT.slice(1) + '/x.ts',
    ]);
  });

  it('lets reading, temp-dir output and fd redirection through', () => {
    expectAllowed('readonly', [
      'git status',
      'git diff origin/main...HEAD -- src',
      'git log --oneline -5',
      'git show HEAD:src/cli.ts',
      'git blame -L 1,20 src/cli.ts',
      'git branch',
      'git branch -a --contains abc',
      'git stash list',
      'git tag -l',
      'git worktree list',
      'git config --get user.name',
      'git remote -v',
      'git reflog',
      'git reflog show -5',
      'git -C ../x log',
      'gh pr view 150 --comments',
      'gh pr diff 150',
      'gh pr checks 150',
      'gh issue list',
      'gh run view 1 --log-failed',
      'gh api repos/o/r/pulls/150/comments',
      'npx vitest run test/x.test.ts > /tmp/out.log 2>&1',
      'ls 2>/dev/null',
      'npm test 2>&1 | tail -5',
      'echo x > "$TMPDIR/x"',
      `echo x > ${join(SCRATCH, 'x')}`,
      'grep -rn "git checkout" .claude/agents',
      "sed -n '1,20p' src/cli.ts",
      'sort -u a.txt',
      'curl -s https://example.com',
      "find . -name '*.ts'",
      'git log --oneline --orderfile=x',
    ]);
  });

  it('runs no file-writing command, even into a temp dir (a redirect is the one way out)', () => {
    expectBlocked('readonly', [
      'cp src/a.ts /tmp/a.ts',
      'tee /tmp/x',
      'mkdir -p /tmp/x',
      'touch /tmp/x',
      'rm /tmp/x',
      'ln -s a /tmp/b',
      'dd if=a of=/tmp/b',
      'rsync -a src/ /tmp/b',
      'install a /tmp/b',
      "sed -i '' s/a/b/ /tmp/x",
      'perl -pi -e s/a/b/ /tmp/x',
      'sort -o /tmp/x a',
      'curl -o /tmp/x https://example.com',
      'curl -sO https://example.com/x',
      'wget https://example.com',
      'find . -name x -delete',
      'tar -xf a.tar',
      'patch -p1 < /tmp/a.diff',
    ]);
  });

  it('rejects git options and settings that write a file or run a program', () => {
    expectBlocked('readonly', [
      'git show --output=src/cli.ts HEAD',
      'git diff --output src/cli.ts',
      'git log -p --output=/tmp/x',
      'git grep -Ocat x',
      'git grep --open-files-in-pager=vim x',
      'git -c core.pager=cat log',
      "git -c 'core.pager=tee src/x' log",
      "PAGER='rm -rf src' git log",
      "GIT_CONFIG_PARAMETERS=\"'core.pager=cat'\" git log",
    ]);
    expectBlocked('feature', [
      "git -c core.pager='git push' log",
      "GIT_CONFIG_PARAMETERS=\"'alias.p=push'\" git p",
      'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.p GIT_CONFIG_VALUE_0=push git p',
    ]);
  });

  it('runs only listed programs and options (Qodo r3)', () => {
    expectBlocked('readonly', R3);
  });

  it('redirects into a temp clone', () => {
    const clone = join(SCRATCH, 'clone');
    mkdirSync(join(clone, '.git'), { recursive: true });
    expectAllowed('readonly', [`git -C ${clone} log > ${join(clone, 'log.txt')}`]);
  });
});

describe('debugger role: writes only under test/ (probes in test/probes/) or a temp dir', () => {
  // Inside the guard's own temp dir on purpose: a checkout in a temp dir is still a checkout, on
  // Linux (/tmp) as on macOS (/var/folders). CI on Linux failed when only macOS put it outside.
  const repo = join(SCRATCH, 'repo');
  mkdirSync(join(repo, '.git'), { recursive: true });
  mkdirSync(join(repo, 'test/probes'), { recursive: true });
  mkdirSync(join(repo, 'src'));
  symlinkSync(join(repo, 'src'), join(repo, 'test/srclink'));
  const outside = SCRATCH;

  it('blocks Edit/Write to app code, by any path', () => {
    for (const path of [
      join(repo, 'src/cli.ts'),
      join(repo, 'test/../src/cli.ts'),
      join(repo, 'test/srclink/cli.ts'),
      join(repo, 'web/src/view.ts'),
      join(repo, '.claude/agents/debugger.md'),
      join(repo, 'testing.ts'),
      'src/cli.ts',
      '/etc/commet-guard-probe',
    ]) {
      for (const tool of ['Write', 'Edit']) expect({ path, tool, status: write('debugger', path, repo, tool).status }).toEqual({ path, tool, status: 2 });
    }
  });

  it('lets tests, probes and temp files through', () => {
    for (const path of [join(repo, 'test/x.test.ts'), join(repo, 'test/probes/p.mjs'), 'test/y.test.ts', join(outside, 'probe.mjs')]) {
      for (const tool of ['Write', 'Edit']) expect({ path, tool, status: write('debugger', path, repo, tool).status }).toEqual({ path, tool, status: 0 });
    }
  });

  it('runs only listed programs and options (Qodo r3)', () => {
    expectBlocked('debugger', R3, repo);
  });

  it('applies the same rule to shell writes, but leaves git and test runs alone', () => {
    expectBlocked('debugger', ['echo x > src/cli.ts', 'cp /tmp/a src/a.ts', "sed -i '' s/a/b/ src/cli.ts"], repo);
  });

  it('checks every path a writer touches', () => {
    expectBlocked('debugger', [
      "sed -i 's/a/b/' src/cli.ts /tmp/safe",
      "sed -i '' s/a/b/ test/x.ts src/cli.ts",
      'sed -i.bak -e s/a/b/ test/x.ts src/cli.ts',
      'sed --in-place -e s/a/b/ src/cli.ts test/x.ts',
      'perl -pi -e s/a/b/ test/x.ts src/cli.ts',
      'cp -t src /tmp/x',
      'cp --target-directory=src /tmp/x',
      'cp --target-directory src /tmp/x',
      'cp -rt src /tmp/x',
      'ln -t src /tmp/x',
      'mv -t src test/a',
      'install -d test/x src/y',
      'rsync -a /tmp/x/ test/x/',
      'tar -xf /tmp/a.tar',
      'patch -p1 < /tmp/a.diff',
    ], repo);
    expectAllowed('debugger', [
      "sed -i '' s/a/b/ test/x.ts",
      'sed -i.bak -e s/a/b/ test/x.ts test/y.ts',
      'perl -pi -e s/a/b/ test/x.ts',
      'cp src/cli.ts test/fixtures/cli.ts',
      'cp -t test/probes /tmp/x src/cli.ts',
      'mkdir -p test/probes/x /tmp/y',
    ], repo);
    expectAllowed('debugger', [
      'cat > test/probes/p.mjs <<EOF\nconsole.log(1)\nEOF',
      'git checkout abc123',
      'git add test/x.test.ts && git commit -m "test: repro"',
      'lockf -k /tmp/commet-fullsuite.lock npm test > /tmp/full.log 2>&1',
    ], repo);
  });
});

describe('the guard fails closed', () => {
  it('blocks on unreadable input or an unknown role', () => {
    expect(run(['feature'], 'not json').status).toBe(2);
    expect(bash('nobody', 'git status').status).toBe(2);
  });

  it('ignores tools it does not guard', () => {
    expect(run(['feature'], { tool_name: 'Read', tool_input: { file_path: '/etc/hosts' } }).status).toBe(0);
  });
});

// The wiring: each definition's PreToolUse hook commands, run the way Claude Code runs them
// (`sh -c`, CLAUDE_PROJECT_DIR set, the call on stdin).
const hooksOf = (agent: string) => {
  const text = readFileSync(join(ROOT, '.claude/agents', `${agent}.md`), 'utf8');
  const front = text.split(/^---$/m)[1] ?? '';
  const hooks: { matcher: string; command: string }[] = [];
  let matcher = '';
  for (const line of front.split('\n')) {
    const m = /^\s*- matcher: "(.+)"$/.exec(line);
    if (m?.[1]) matcher = m[1];
    const c = /^\s*command: '(.+)'$/.exec(line);
    if (c?.[1]) hooks.push({ matcher, command: c[1] });
  }
  return hooks;
};
const hookStatus = (agent: string, tool: string, tool_input: Record<string, unknown>) => {
  const hits = hooksOf(agent).filter((h) => new RegExp(`^(${h.matcher})$`).test(tool));
  if (hits.length === 0) return 0;
  return Math.max(...hits.map((h) => run([], { tool_name: tool, tool_input }, { shell: h.command }).status ?? 1));
};

describe('agent definitions wire the guard', () => {
  it('feature-agent blocks push, PR merge and publish', () => {
    expect(hookStatus('feature-agent', 'Bash', { command: 'git push --dry-run' })).toBe(2);
    expect(hookStatus('feature-agent', 'Bash', { command: 'gh pr merge --help' })).toBe(2);
    expect(hookStatus('feature-agent', 'Bash', { command: 'npm publish' })).toBe(2);
    expect(hookStatus('feature-agent', 'Bash', { command: 'git status' })).toBe(0);
  });

  it('debugger blocks app-code writes', () => {
    for (const tool of ['Write', 'Edit']) {
      expect(hookStatus('debugger', tool, { file_path: join(ROOT, 'src/cli.ts') })).toBe(2);
      expect(hookStatus('debugger', tool, { file_path: join(ROOT, 'test/probes/p.mjs') })).toBe(0);
    }
    expect(hookStatus('debugger', 'Bash', { command: 'echo x > src/cli.ts' })).toBe(2);
  });

  it('scout and bar-raiser block checkout changes', () => {
    for (const agent of ['scout', 'bar-raiser']) {
      expect(hookStatus(agent, 'Bash', { command: 'git checkout main' })).toBe(2);
      expect(hookStatus(agent, 'Bash', { command: 'echo x > src/cli.ts' })).toBe(2);
      expect(hookStatus(agent, 'Bash', { command: 'git log -1' })).toBe(0);
    }
  });

  it('a missing guard script blocks instead of letting the call through', () => {
    const [hook] = hooksOf('feature-agent');
    expect(hook).toBeDefined();
    const r = spawnSync('/bin/sh', ['-c', hook?.command ?? 'exit 0'], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status' } }),
      encoding: 'utf8',
      env: { ...ENV, CLAUDE_PROJECT_DIR: join(tmpdir(), 'commet-no-such-project') },
    });
    expect(r.status).toBe(2);
  });

  it('debugger allows the locked full run AGENTS.md "Testing" allows for a reproduction', () => {
    const text = readFileSync(join(ROOT, '.claude/agents/debugger.md'), 'utf8');
    expect(readFileSync(join(ROOT, 'AGENTS.md'), 'utf8')).toContain('lockf -k /tmp/commet-fullsuite.lock npm test');
    expect(text).toContain('lockf -k /tmp/commet-fullsuite.lock npm test');
    expect(text).not.toMatch(/no full suite/i);
  });
});
