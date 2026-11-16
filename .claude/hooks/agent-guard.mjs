// PreToolUse guard for the project agents (`hooks:` in .claude/agents/*.md; Qodo on #150).
// Usage: node agent-guard.mjs <feature|debugger|readonly>, with Claude Code's hook JSON on stdin.
// Exit 2 blocks the tool call (the reason goes to the agent on stderr); exit 0 lets it through.
//   feature   no `git push`, `gh pr merge|create|close|reopen`, `gh release` writes, `gh api` writes, npm publish.
//   readonly  (scout, bar-raiser) only read-only git and gh, and shell writes only into a temp dir.
//   debugger  Edit/Write and shell writes only under the repo's test/ (probes in test/probes/) or a temp dir.
// It reads the command line, so it can't see what a program it starts does (node, python, npx, a
// script), or a command name built at run time ($VAR). Those residuals stay prompt-enforced.
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import process from 'node:process';

const DYNAMIC = '\0'; // stands in for text only known at run time: $(…), `…`
const TMP = process.env.TMPDIR || tmpdir();
const TMP_ROOTS = [...new Set([TMP, tmpdir(), '/tmp'].map((p) => { try { return realpathSync(p); } catch { return null; } }).filter(Boolean))];

// ---- Shell parsing: simple commands (word lists) and redirect targets, quotes removed.

function closing(src, k) {
  let depth = 1;
  for (let j = k; j < src.length; j++) {
    const c = src[j];
    if (c === "'") { const e = src.indexOf("'", j + 1); if (e < 0) return src.length; j = e; continue; }
    if (c === '\\') { j++; continue; }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return j;
  }
  return src.length;
}

function backtick(src, k) {
  for (let j = k; j < src.length; j++) {
    if (src[j] === '\\') j++;
    else if (src[j] === '`') return j;
  }
  return src.length;
}

function dquote(src, i, out) {
  let text = '';
  while (i < src.length && src[i] !== '"') {
    const c = src[i];
    if (c === '\\' && '"\\$`\n'.includes(src[i + 1] ?? '')) { if (src[i + 1] !== '\n') text += src[i + 1]; i += 2; continue; }
    if (c === '$' && src[i + 1] === '(') { const j = closing(src, i + 2); parse(src.slice(i + 2, j), out); text += DYNAMIC; i = j + 1; continue; }
    if (c === '`') { const j = backtick(src, i + 1); parse(src.slice(i + 1, j), out); text += DYNAMIC; i = j + 1; continue; }
    text += c;
    i++;
  }
  return { text, end: i + 1 };
}

function skipHeredocs(src, i, delims) {
  for (const delim of delims) {
    while (i < src.length) {
      const nl = src.indexOf('\n', i);
      const line = src.slice(i, nl < 0 ? src.length : nl);
      i = nl < 0 ? src.length : nl + 1;
      if (line.replace(/^\t+/, '') === delim) break;
    }
  }
  return i;
}

function parse(src, out = { cmds: [], writes: [] }) {
  let words = [];
  let word = null;
  let pending = null; // the next word is a redirect target: 'out' | 'dup' | 'in' | 'heredoc'
  const heredocs = [];
  const add = (s) => { word = (word ?? '') + s; };
  const endWord = () => {
    if (word === null) return;
    if (pending === 'out' || (pending === 'dup' && !/^(\d+|-)$/.test(word))) out.writes.push(word);
    else if (pending === 'heredoc') heredocs.push(word);
    else if (pending === null) words.push(word);
    pending = null;
    word = null;
  };
  const endCmd = () => {
    endWord();
    if (pending === 'out' || pending === 'dup') out.writes.push(DYNAMIC); // a target we couldn't read
    pending = null;
    if (words.length > 0) out.cmds.push(words);
    words = [];
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { if (src[i + 1] !== '\n') add(src[i + 1] ?? ''); i += 2; continue; }
    if (c === "'") { const e = src.indexOf("'", i + 1); const end = e < 0 ? src.length : e; add(src.slice(i + 1, end)); i = end + 1; continue; }
    if (c === '"') { const q = dquote(src, i + 1, out); add(q.text); i = q.end; continue; }
    if (c === '$' && src[i + 1] === '(') { const j = closing(src, i + 2); parse(src.slice(i + 2, j), out); add(DYNAMIC); i = j + 1; continue; }
    if (c === '`') { const j = backtick(src, i + 1); parse(src.slice(i + 1, j), out); add(DYNAMIC); i = j + 1; continue; }
    if (c === ' ' || c === '\t') { endWord(); i++; continue; }
    if (c === '\n') { endCmd(); i++; if (heredocs.length > 0) i = skipHeredocs(src, i, heredocs.splice(0)); continue; }
    if (c === '#' && word === null) { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl; continue; }
    if (c === ';' || c === '|' || c === '(' || c === ')') { endCmd(); i++; continue; }
    if (c === '&') {
      if (src[i + 1] === '>') { endWord(); pending = 'out'; i += src[i + 2] === '>' ? 3 : 2; continue; }
      endCmd(); i++; continue;
    }
    if (c === '>' || c === '<') {
      if (word !== null && /^\d+$/.test(word)) word = null; // an fd number, as in 2>
      else endWord();
      if (c === '<') {
        if (src.startsWith('<<<', i)) { pending = 'in'; i += 3; }
        else if (src.startsWith('<<', i)) { pending = 'heredoc'; i += src[i + 2] === '-' ? 3 : 2; }
        else if (src[i + 1] === '>') { pending = 'out'; i += 2; }
        else { pending = 'in'; i += src[i + 1] === '&' ? 2 : 1; }
        continue;
      }
      if (src[i + 1] === '&') { pending = 'dup'; i += 2; continue; }
      pending = 'out';
      i += src[i + 1] === '>' || src[i + 1] === '|' ? 2 : 1;
      continue;
    }
    add(c);
    i++;
  }
  endCmd();
  if (heredocs.length > 0) skipHeredocs(src, i, heredocs);
  return out;
}

// ---- Where a command name can stand in a simple command.

const base = (w) => w.slice(w.lastIndexOf('/') + 1);
const positionals = (args) => args.filter((a) => !a.startsWith('-'));
const has = (args, ...flags) => args.some((a) => flags.some((f) => a === f || (f.startsWith('--') && a.startsWith(`${f}=`))));
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
// Words that run the command after them: [flags that take a value, leading operands to skip].
const WRAPPERS = {
  env: [['-u', '--unset', '-C', '--chdir']], command: [[]], exec: [['-a']], nohup: [[]], time: [['-o']], builtin: [[]],
  nice: [['-n']], sudo: [['-u', '-g', '-h', '-p', '-C', '-D', '-R', '-T', '-U']], stdbuf: [[]], caffeinate: [['-t', '-w']],
  xargs: [['-I', '-J', '-L', '-n', '-P', '-s', '-d', '-E', '-a', '-R', '-S']], watch: [['-n', '--interval']],
  timeout: [['-s', '-k', '--signal', '--kill-after'], 1], lockf: [['-t'], 1], flock: [['-w', '-E'], 1], npx: [['-p', '--package']],
  if: [[]], then: [[]], else: [[]], elif: [[]], do: [[]], while: [[]], until: [[]], '!': [[]], '{': [[]],
};
const FIND_EXEC = new Set(['-exec', '-execdir', '-ok', '-okdir']);

function commandStarts(words) {
  const starts = new Set();
  const from = (k) => {
    while (k < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[k])) k++;
    if (k >= words.length || starts.has(k)) return;
    starts.add(k);
    const wrapper = WRAPPERS[base(words[k])];
    if (!wrapper) return;
    const [valued, skip = 0] = wrapper;
    let j = k + 1;
    while (j < words.length && words[j].startsWith('-') && words[j] !== '-') j += valued.includes(words[j]) ? 2 : 1;
    from(j + skip);
  };
  from(0);
  words.forEach((w, i) => { if (FIND_EXEC.has(w)) from(i + 1); });
  return starts;
}

// ---- Writes: where a shell redirect, a file command or Edit/Write may go.

/** The real path of `p`, resolving symlinks in the part that exists; null if that part can't be resolved. */
function real(p) {
  let head = p;
  const tail = [];
  for (;;) {
    try { lstatSync(head); break; } catch { /* not there yet */ }
    const up = dirname(head);
    if (up === head) return null;
    tail.unshift(basename(head));
    head = up;
  }
  try { return join(realpathSync(head), ...tail); } catch { return null; }
}

function repoRoot(p) {
  for (let d = p; ; d = dirname(d)) {
    if (existsSync(join(d, '.git'))) return d;
    if (dirname(d) === d) return null;
  }
}

const within = (p, dir) => p === dir || p.startsWith(dir.endsWith(sep) ? dir : dir + sep);

function writeOk(target, cwd, role) {
  if (/^\/dev\/(null|stdout|stderr|tty|fd\/\d+)$/.test(target)) return true;
  const p = target.replace(/^(\$TMPDIR|\$\{TMPDIR\})(?=\/|$)/, TMP).replace(/^~(?=\/|$)/, homedir());
  if (p.includes(DYNAMIC) || p.includes('$') || p.includes('`')) return false; // can't tell where it goes
  const abs = real(resolve(cwd, p));
  if (abs === null) return false;
  const repo = repoRoot(abs);
  if (repo !== null) return role === 'debugger' && within(abs, join(repo, 'test'));
  return TMP_ROOTS.some((t) => within(abs, t));
}

const writeMsg = (role, target) => role === 'debugger'
  ? `the debugger writes only under test/ (probes in test/probes/) or a temp dir outside the repo, not ${target}`
  : `scout and bar-raiser are read-only: write to an absolute temp path (/tmp/…), not ${target}`;

// Commands that write the files they name: which operands.
const WRITERS = { tee: 'all', touch: 'all', rm: 'all', rmdir: 'all', mkdir: 'all', truncate: 'all', mv: 'all', cp: 'last', ln: 'last', install: 'last', rsync: 'last', sed: 'inplace', perl: 'inplace', dd: 'dd' };

function writerTargets(name, args) {
  const kind = WRITERS[name];
  const p = positionals(args);
  if (kind === 'all') return p;
  if (kind === 'last') return p.slice(-1);
  if (kind === 'inplace') return args.some((a) => /^-[A-Za-z]*i/.test(a) || a.startsWith('--in-place')) ? p.slice(-1) : [];
  if (kind === 'dd') return args.filter((a) => a.startsWith('of=')).map((a) => a.slice(3));
  return [];
}

// ---- git, gh and npm.

const READ_GIT = new Set(['status', 'diff', 'log', 'show', 'blame', 'annotate', 'grep', 'rev-parse', 'rev-list', 'ls-files', 'ls-tree', 'ls-remote',
  'cat-file', 'merge-base', 'describe', 'shortlog', 'for-each-ref', 'show-ref', 'name-rev', 'cherry', 'range-diff', 'whatchanged', 'count-objects',
  'check-ignore', 'check-attr', 'check-ref-format', 'var', 'version', 'help', 'diff-tree', 'diff-files', 'diff-index', 'show-branch', 'verify-commit', 'verify-tag']);
const MUTATING_GIT = new Set(['add', 'am', 'apply', 'bisect', 'checkout', 'cherry-pick', 'clean', 'commit', 'filter-branch', 'gc', 'init', 'merge', 'mv',
  'pull', 'push', 'rebase', 'replace', 'reset', 'restore', 'revert', 'rm', 'switch', 'update-ref', 'update-index', 'read-tree', 'checkout-index',
  'prune', 'repack', 'maintenance', 'format-patch', 'clone']);
// Commands that read or write by their arguments: true when this call only reads.
const DUAL_GIT = {
  branch: (a) => !has(a, '-d', '-D', '-m', '-M', '-c', '-C', '-f', '-u', '-t', '--delete', '--move', '--copy', '--force', '--set-upstream-to',
    '--unset-upstream', '--edit-description', '--track', '--no-track', '--create-reflog')
    && (positionals(a).length === 0 || has(a, '-l', '--list', '-a', '--all', '-r', '--remotes', '--contains', '--no-contains', '--merged',
      '--no-merged', '--points-at', '--sort', '--format', '-v', '-vv', '--verbose', '--show-current')),
  tag: (a) => !has(a, '-d', '--delete', '-a', '--annotate', '-s', '--sign', '-u', '--local-user', '-f', '--force', '-m', '--message', '-F', '--file', '-e', '--edit')
    && (positionals(a).length === 0 || has(a, '-l', '--list', '-n', '--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--sort', '--format', '-v', '--verify')),
  stash: (a) => ['list', 'show'].includes(a[0]),
  worktree: (a) => a[0] === 'list',
  remote: (a) => a.length === 0 || ['-v', '--verbose', 'show', 'get-url'].includes(a[0]),
  config: (a) => {
    const p = positionals(a);
    if (has(a, '--unset', '--unset-all', '--add', '--replace-all', '--rename-section', '--remove-section', '-e', '--edit')) return false;
    if (['set', 'unset', 'rename-section', 'remove-section', 'edit'].includes(p[0])) return false;
    return ['get', 'list'].includes(p[0]) || has(a, '--get', '--get-all', '--get-regexp', '--get-urlmatch', '-l', '--list') || p.length <= 1;
  },
  notes: (a) => a.length === 0 || ['list', 'show'].includes(positionals(a)[0]),
  reflog: (a) => !['expire', 'delete'].includes(positionals(a)[0]),
  'symbolic-ref': (a) => !has(a, '-d', '--delete') && positionals(a).length <= 1,
  fetch: (a) => positionals(a).slice(1).every((r) => !r.includes(':')), // a dst:src refspec writes a local ref
  submodule: (a) => a.length === 0 || ['status', 'summary'].includes(positionals(a)[0]),
  'sparse-checkout': (a) => a[0] === 'list',
};
const GIT_VALUED = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix', '--attr-source']);

function gitVerb(args) {
  const conf = [];
  for (let j = 0; j < args.length; j++) {
    const a = args[j];
    if (GIT_VALUED.has(a)) { if (a === '-c' || a === '--config-env') conf.push(args[j + 1] ?? ''); j++; continue; }
    if (a.startsWith('--config-env=')) conf.push(a.slice(13));
    if (a.startsWith('-')) continue;
    return { verb: a, rest: args.slice(j + 1), conf };
  }
  return { verb: null, rest: [], conf };
}

function gitAlias(verb, cwd) {
  if (!/^\w[\w.-]*$/.test(verb)) return null;
  const r = spawnSync('git', ['config', '--get', `alias.${verb}`], { cwd: existsSync(cwd) ? cwd : undefined, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

const quote = (a) => `'${a.replaceAll("'", "'\\''")}'`;
const featureMsg = (what) => `feature-agent never pushes, merges or publishes (${what}): the team lead does that (AGENTS.md).`;
const readonlyMsg = (what) => `scout and bar-raiser are read-only: \`${what}\` can change the checkout or GitHub.`;

function checkGit(args, strict, ctx) {
  const { verb, rest, conf } = gitVerb(args);
  if (conf.some((c) => /^alias\./i.test(c))) return '`git -c alias.…` can run any command: call the git verb itself.';
  if (verb === null) return null;
  if (ctx.role === 'feature') {
    if (verb === 'push') return featureMsg('git push');
    if (READ_GIT.has(verb) || MUTATING_GIT.has(verb) || verb in DUAL_GIT) return null;
  } else {
    if (READ_GIT.has(verb)) return null;
    if (verb === 'clone') {
      const p = positionals(rest);
      return p.length >= 2 && writeOk(p[p.length - 1], ctx.cwd, ctx.role) ? null : readonlyMsg('git clone (clone into /tmp/<name>)');
    }
    if (verb in DUAL_GIT) return DUAL_GIT[verb](rest) ? null : readonlyMsg(`git ${verb} ${rest.join(' ')}`.trim());
    if (MUTATING_GIT.has(verb)) return readonlyMsg(`git ${verb}`);
  }
  const alias = gitAlias(verb, ctx.cwd);
  if (alias !== null) {
    const expanded = alias.startsWith('!') ? alias.slice(1) : `git ${alias}`;
    return checkCommand([expanded, ...rest.map(quote)].join(' '), { ...ctx, depth: ctx.depth + 1 });
  }
  return strict && ctx.role === 'readonly' ? readonlyMsg(`git ${verb}`) + ' It is not a known read-only git command.' : null;
}

const READ_GH = {
  pr: ['view', 'list', 'diff', 'checks', 'status'], issue: ['view', 'list', 'status'], run: ['view', 'list', 'watch'], repo: ['view'],
  release: ['view', 'list'], workflow: ['view', 'list'], label: ['list'], gist: ['view', 'list'], cache: ['list'], auth: ['status'],
};
const FEATURE_GH = { pr: ['merge', 'create', 'close', 'reopen'], release: ['create', 'upload', 'edit', 'delete'] };
const GH_API_VALUED = new Set(['-H', '--header', '-q', '--jq', '-t', '--template', '--cache', '--hostname', '-p', '--preview']);

function apiWrites(args) {
  let method = null;
  let fields = false;
  let endpoint = null;
  for (let j = 0; j < args.length; j++) {
    const a = args[j];
    if (a === '-X' || a === '--method') { method = args[++j] ?? ''; continue; }
    if (a.startsWith('--method=')) { method = a.slice(9); continue; }
    if (/^-X./.test(a)) { method = a.slice(2); continue; }
    if (['-f', '-F', '--field', '--raw-field', '--input'].includes(a)) { fields = true; j++; continue; }
    if (/^(-[fF].|--(field|raw-field|input)=)/.test(a)) { fields = true; continue; }
    if (GH_API_VALUED.has(a)) { j++; continue; }
    if (!a.startsWith('-') && endpoint === null) endpoint = a;
  }
  if (endpoint === 'graphql') return true; // always a POST, and mutations look like queries
  return method !== null ? method.toUpperCase() !== 'GET' : fields; // fields without a method make gh POST
}

function checkGh(args, strict, ctx) {
  let g = -1;
  for (let j = 0; j < args.length; j++) {
    if (args[j] === '-R' || args[j] === '--repo') { j++; continue; }
    if (!args[j].startsWith('-')) { g = j; break; }
  }
  if (g < 0) return null;
  const group = args[g];
  const verb = args.slice(g + 1).find((a) => !a.startsWith('-'));
  if (group === 'api') return apiWrites(args.slice(g + 1)) ? (ctx.role === 'feature' ? featureMsg('a gh api write') : readonlyMsg('gh api (write)')) : null;
  if (ctx.role === 'feature') return FEATURE_GH[group]?.includes(verb) ? featureMsg(`gh ${group} ${verb}`) : null;
  if (READ_GH[group]) return verb === undefined || READ_GH[group].includes(verb) ? null : readonlyMsg(`gh ${group} ${verb}`);
  if (['search', 'status', 'version', 'help'].includes(group)) return null;
  return strict ? readonlyMsg(`gh ${group}`) : null;
}

// ---- One command line.

function checkWords(words, ctx) {
  const starts = commandStarts(words);
  for (const k of starts) {
    const name = base(words[k]);
    const rest = words.slice(k + 1);
    if (SHELLS.has(name)) {
      const m = rest.findIndex((w) => /^-[A-Za-z]*c[A-Za-z]*$/.test(w));
      if (m >= 0 && rest[m + 1] !== undefined) { const r = checkCommand(rest[m + 1], { ...ctx, depth: ctx.depth + 1 }); if (r) return r; }
    }
    if (name === 'eval') { const r = checkCommand(rest.join(' '), { ...ctx, depth: ctx.depth + 1 }); if (r) return r; }
    if (ctx.role !== 'feature') {
      for (const t of writerTargets(name, rest)) if (!writeOk(t, ctx.cwd, ctx.role)) return writeMsg(ctx.role, t);
    }
  }
  if (ctx.role === 'debugger') return null;
  // A command name can hide behind a wrapper we don't know (xargs-like): check git/gh/npm at every word.
  for (let i = 0; i < words.length; i++) {
    const name = base(words[i]);
    const rest = words.slice(i + 1);
    const strict = starts.has(i);
    let r = null;
    if (name === 'git') r = checkGit(rest, strict, ctx);
    else if (name === 'gh') r = checkGh(rest, strict, ctx);
    else if (ctx.role === 'feature' && ['npm', 'pnpm', 'yarn'].includes(name) && rest.some((a) => a === 'publish' || a === 'unpublish')) r = featureMsg(`${name} publish`);
    if (r) return r;
  }
  return null;
}

function checkCommand(src, ctx) {
  if (ctx.depth > 8) return 'the command nests too deeply to check.';
  const { cmds, writes } = parse(src);
  if (ctx.role !== 'feature') {
    for (const t of writes) if (!writeOk(t, ctx.cwd, ctx.role)) return writeMsg(ctx.role, t);
  }
  for (const words of cmds) {
    const r = checkWords(words, ctx);
    if (r) return r;
  }
  return null;
}

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

function check(role, call) {
  const cwd = typeof call.cwd === 'string' ? call.cwd : process.cwd();
  const input = call.tool_input ?? {};
  if (call.tool_name === 'Bash') {
    if (typeof input.command !== 'string') return 'the Bash call has no command.';
    return checkCommand(input.command, { role, cwd, depth: 0 });
  }
  if (role === 'debugger' && FILE_TOOLS.has(call.tool_name)) {
    const path = input.file_path ?? input.notebook_path;
    if (typeof path !== 'string') return 'the call has no file path.';
    return writeOk(path, cwd, role) ? null : writeMsg(role, path);
  }
  return null;
}

let reason;
try {
  const role = process.argv[2];
  if (!['feature', 'debugger', 'readonly'].includes(role)) throw new Error(`unknown role ${role}`);
  reason = check(role, JSON.parse(readFileSync(0, 'utf8')));
} catch (e) {
  reason = `agent-guard could not check this call (${e instanceof Error ? e.message : String(e)}), so it is blocked.`;
}
if (reason) {
  process.stderr.write(`Blocked by .claude/hooks/agent-guard.mjs: ${reason}\n`);
  process.exitCode = 2;
}
