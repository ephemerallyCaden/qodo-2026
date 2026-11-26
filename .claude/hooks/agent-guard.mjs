// PreToolUse guard for the project agents (`hooks:` in .claude/agents/*.md; Qodo on #150).
// Usage: node agent-guard.mjs <feature|debugger|readonly>, with Claude Code's hook JSON on stdin.
// Exit 2 blocks the tool call (the reason goes to the agent on stderr); exit 0 lets it through.
//   feature   a ban list against accidents, not against an agent set on getting round it: no `git push` or
//             send-pack, no git alias, no moving or deleting a branch (update-ref, branch -f|-m|-d, fetch x:main, …),
//             gh only from scout's read-only list, no npm publish however abbreviated, and no text handed on to
//             git/gh/npm at run time (`git -c alias.…`, `bash -c 'git "$@"' _ push`, `xargs git`).
//   readonly  (scout, bar-raiser) an allowlist: Bash runs only the programs, subcommands and options in READ;
//             anything else, an abbreviated option too, is blocked. The one write is a shell redirect into a temp
//             dir outside any checkout.
//   debugger  READ plus DEBUG (vitest, typecheck, lint, the locked full run, node test/probes/*, git add and
//             commit of test paths). Edit/Write and redirects go only under a checkout's test/ or into a temp
//             dir outside any checkout.
// It reads the command line, so it can't see what an allowed program does by its own code or config: a test
// or probe the debugger wrote, git hooks and config (pager, diff driver), a shell alias or function.
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import process from 'node:process';

// Markers for text the shell only knows at run time. Any of them in a word makes the word unknown.
const DYNAMIC = '\0'; // $(…), `…`
const VAR = '\u0003'; // $X, ${X}, $'…'
const GLOB = '\u0004'; // a glob or brace at the start of a word: it can expand to `--some-option`
const unknown = (s) => [DYNAMIC, VAR, GLOB].some((m) => s.includes(m));
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

const EXPANDS = /[\w{@*#?$!-]/; // what may follow a `$` that the shell expands

/** Double-quoted text from `i` up to `stop` (null: to the end, as in a heredoc body). */
function dquote(src, i, out, stop = '"') {
  let text = '';
  while (i < src.length && src[i] !== stop) {
    const c = src[i];
    if (c === '\\' && '"\\$`\n'.includes(src[i + 1] ?? '')) { if (src[i + 1] !== '\n') text += src[i + 1]; i += 2; continue; }
    if (c === '$' && src[i + 1] === '(') { const j = closing(src, i + 2); parse(src.slice(i + 2, j), out); text += DYNAMIC; i = j + 1; continue; }
    if (c === '$' && EXPANDS.test(src[i + 1] ?? '')) { text += VAR; i++; continue; }
    if (c === '`') { const j = backtick(src, i + 1); parse(src.slice(i + 1, j), out); text += DYNAMIC; i = j + 1; continue; }
    text += c;
    i++;
  }
  return { text, end: i + 1 };
}

/** Skips heredoc bodies; an unquoted delimiter's body is expanded like double-quoted text. */
function skipHeredocs(src, i, docs, out) {
  for (const { delim, quoted } of docs) {
    const start = i;
    let end = src.length;
    while (i < src.length) {
      const nl = src.indexOf('\n', i);
      const line = src.slice(i, nl < 0 ? src.length : nl);
      if (line.replace(/^\t+/, '') === delim) { end = i; i = nl < 0 ? src.length : nl + 1; break; }
      i = nl < 0 ? src.length : nl + 1;
    }
    if (!quoted && unknown(dquote(src.slice(start, end), 0, out, null).text)) out.expands = true;
  }
  return i;
}

// `fed`: something in the line feeds a command's stdin (a pipe, <, <<, <<<), so a shell there may read its script.
function parse(src, out = { cmds: [], writes: [], expands: false, fed: false }) {
  let words = [];
  let word = null;
  let quoted = false; // the word so far had a quote or backslash (a heredoc delimiter like 'EOF')
  let pending = null; // the next word is a redirect target: 'out' | 'dup' | 'in' | 'heredoc'
  const heredocs = [];
  const add = (s) => { word = (word ?? '') + s; };
  const endWord = () => {
    if (word === null) return;
    if (pending === 'out' || (pending === 'dup' && !/^(\d+|-)$/.test(word))) out.writes.push(word);
    else if (pending === 'heredoc') heredocs.push({ delim: word, quoted });
    else if (pending === null) words.push(word);
    pending = null;
    word = null;
    quoted = false;
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
    if (c === '\\') { quoted = true; if (src[i + 1] !== '\n') add(src[i + 1] ?? ''); i += 2; continue; }
    if (c === "'") { quoted = true; const e = src.indexOf("'", i + 1); const end = e < 0 ? src.length : e; add(src.slice(i + 1, end)); i = end + 1; continue; }
    if (c === '"') { quoted = true; const q = dquote(src, i + 1, out); add(q.text); i = q.end; continue; }
    if (c === '$' && src[i + 1] === '(') { const j = closing(src, i + 2); parse(src.slice(i + 2, j), out); add(DYNAMIC); i = j + 1; continue; }
    if (c === '$' && (EXPANDS.test(src[i + 1] ?? '') || `'"`.includes(src[i + 1] ?? 'x'))) { add(VAR); i++; continue; }
    if (c === '`') { const j = backtick(src, i + 1); parse(src.slice(i + 1, j), out); add(DYNAMIC); i = j + 1; continue; }
    if (c === ' ' || c === '\t') { endWord(); i++; continue; }
    if (c === '\n') { endCmd(); i++; if (heredocs.length > 0) i = skipHeredocs(src, i, heredocs.splice(0), out); continue; }
    if (c === '#' && word === null) { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl; continue; }
    if (c === '|' && src[i + 1] === '|') { endCmd(); i += 2; continue; }
    if (c === '|') out.fed = true;
    if (c === ';' || c === '|' || c === '(' || c === ')') { endCmd(); i++; continue; }
    if (c === '&') {
      if (src[i + 1] === '>') { endWord(); pending = 'out'; i += src[i + 2] === '>' ? 3 : 2; continue; }
      endCmd(); i++; continue;
    }
    if (c === '>' || c === '<') {
      if (word !== null && /^\d+$/.test(word)) word = null; // an fd number, as in 2>
      else endWord();
      if (c === '<') {
        out.fed = true;
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
    // `*x`, `?x`, `[x]`, `{a,b}` (also after an empty `""`) can expand to a word that starts with `-`.
    if ((word ?? '') === '' && ('*?['.includes(c) || (c === '{' && !/^[\s;]?$/.test(src[i + 1] ?? '')))) add(GLOB);
    add(c);
    i++;
  }
  endCmd();
  if (heredocs.length > 0) skipHeredocs(src, i, heredocs, out);
  return out;
}

// ---- Paths: where a redirect, Edit/Write or a debugger's git add may go.

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

/** A word with a leading $TMPDIR filled in; null if it still holds run-time text. */
function known(w) {
  const x = w.replace(new RegExp(`^${VAR}(TMPDIR|\\{TMPDIR\\})(?=/|$)`), TMP);
  return unknown(x) ? null : x;
}

/** The real absolute path a word names, or null when the guard can't be sure of it. */
function pathOf(w, ctx) {
  const p = known(w)?.replace(/^~(?=\/|$)/, homedir());
  if (p == null || p.includes('$') || p.includes('`')) return null;
  if (!isAbsolute(p) && !ctx.relOk) return null; // after a `cd`, a relative path means something else
  return real(resolve(ctx.cwd, p));
}

/** Under `sub` of the checkout that holds it. */
function inCheckout(w, ctx, sub) {
  const abs = pathOf(w, ctx);
  const repo = abs === null ? null : repoRoot(abs);
  return repo !== null && within(abs, join(repo, sub));
}

/** A checkout is a checkout wherever it lives (a temp dir too): only the debugger, and only its test/. */
function writeOk(target, ctx) {
  if (/^\/dev\/(null|stdout|stderr|tty|fd\/\d+)$/.test(target)) return true;
  const abs = pathOf(target, ctx);
  if (abs === null) return false;
  const repo = repoRoot(abs);
  if (repo !== null) return ctx.role === 'debugger' && within(abs, join(repo, 'test'));
  return TMP_ROOTS.some((t) => within(abs, t));
}

const show = (w) => w.replaceAll(DYNAMIC, '$(…)').replaceAll(VAR, '$').replaceAll(GLOB, '');
const writeMsg = (role, target) => role === 'debugger'
  ? `the debugger writes only under a checkout's test/ (probes in test/probes/) or a temp dir outside any checkout, not ${show(target)}`
  : `scout and bar-raiser are read-only: redirect only into a temp dir outside any checkout (> /tmp/…), not ${show(target)}`;

// ---- Options: an exact list per command. A word that isn't on it, an abbreviation included, is refused.

/** 'flags' like '-n -A= --color? --arg==': '' a flag, '=' takes a value, '?' an attached value only, '==' two values. */
function spec(s) {
  const m = new Map();
  for (const t of s.split(/\s+/).filter(Boolean)) {
    const kind = /(==|=|\?)$/.exec(t)?.[1] ?? '';
    m.set(t.slice(0, t.length - kind.length), kind);
  }
  return m;
}

/** Operands and option values of `args` by `opts`; `bad` is the first word it couldn't place. */
function readArgs(args, opts, numbers = false) {
  const ops = [];
  const vals = new Map();
  const put = (f, v) => { vals.set(f, [...(vals.get(f) ?? []), v]); };
  for (let j = 0; j < args.length; j++) {
    const a = args[j];
    if (a === '--') { ops.push(...args.slice(j + 1)); break; }
    if (a === '-' || !a.startsWith('-')) { ops.push(a); continue; }
    if (numbers && /^-\d+$/.test(a)) continue; // head -20, git log -5
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = eq > 0 ? a.slice(0, eq) : a;
      const kind = opts.get(name);
      if (kind === undefined || (eq > 0 && (kind === '' || kind === '=='))) return { bad: a };
      if (eq > 0 || kind === '' || kind === '?') { put(name, eq > 0 ? a.slice(eq + 1) : ''); continue; }
      if (j + kind.length >= args.length) return { bad: a };
      put(name, args[j + 1]);
      j += kind.length;
      continue;
    }
    for (let c = 1; c < a.length; c++) { // a cluster: -rn, -n5, -A 3
      const f = `-${a[c]}`;
      const kind = opts.get(f);
      if (kind === undefined || kind === '==') return { bad: a };
      if (kind === '') { put(f, ''); continue; }
      const rest = a.slice(c + 1);
      if (rest === '' && kind === '=') { if (j + 1 >= args.length) return { bad: a }; put(f, args[++j]); } else put(f, rest);
      break;
    }
  }
  return { ops, vals, get: (...fs) => fs.flatMap((f) => vals.get(f) ?? []), has: (...fs) => fs.some((f) => vals.has(f)) };
}

const optionMsg = (cmd, a) => `\`${cmd} ${show(a)}\` is not on the list: only listed options run, spelled in full (AGENTS.md "Agent bans are hooks").`;

/** A rule from an option list and an optional check on the parsed result. */
const opts = (s, check = () => null, numbers = false) => {
  const o = spec(s);
  return (args, ctx, cmd) => { const r = readArgs(args, o, numbers); return r.bad !== undefined ? optionMsg(cmd, r.bad) : check(r, ctx, cmd); };
};
const anyArgs = () => null;

// ---- READ: what scout, bar-raiser and the debugger may run. Output goes to stdout; a redirect is the only write.

const DIFF = '-p -u -s -U= -z -M? -C? -B? -D -R -a -b -w -W -l= -S= -G= -O= -I= --patch --no-patch --unified= --raw --patch-with-raw '
  + '--stat? --numstat --shortstat --dirstat? --summary --patch-with-stat --name-only --name-status --check --full-index --binary '
  + '--abbrev? --find-renames? --find-copies? --find-copies-harder --no-renames --diff-filter= --pickaxe-all --pickaxe-regex '
  + '--orderfile= --relative? --no-relative --text --ignore-space-at-eol --ignore-space-change --ignore-all-space --ignore-blank-lines '
  + '--ignore-cr-at-eol --ignore-matching-lines= --inter-hunk-context= --function-context --exit-code --quiet --no-ext-diff --no-textconv '
  + '--ignore-submodules? --src-prefix= --dst-prefix= --no-prefix --default-prefix --color? --no-color --color-moved? --no-color-moved '
  + '--color-words? --word-diff? --word-diff-regex= --minimal --patience --histogram --diff-algorithm= --compact-summary --stat-width= '
  + '--stat-name-width= --stat-count= --merge-base --cached --staged --no-index -m -c --cc --remerge-diff --diff-merges= --no-diff-merges';
const LOG = '-n= -i -E -F -P -g -t -r --max-count= --skip= --since= --after= --until= --before= --author= --committer= --grep= --all-match '
  + '--invert-grep --regexp-ignore-case --extended-regexp --fixed-strings --merges --no-merges --first-parent --not --all --branches? '
  + '--tags? --remotes? --glob= --exclude= --reflog --cherry-mark --cherry-pick --left-only --right-only --cherry --walk-reflogs --boundary '
  + '--simplify-by-decoration --full-history --ancestry-path? --date-order --author-date-order --topo-order --reverse --no-walk? --pretty? '
  + '--format= --abbrev-commit --no-abbrev-commit --oneline --notes? --no-notes --relative-date --date= --parents --children --left-right '
  + '--graph --decorate? --no-decorate --source --mailmap --use-mailmap --full-diff -L= --follow --root';
const JSON_OUT = '--json= -q= --jq= -t= --template= -R= --repo=';

const GIT_READ = {
  log: opts(`${LOG} ${DIFF}`, undefined, true),
  show: opts(`${LOG} ${DIFF}`),
  diff: opts(DIFF),
  status: opts('-s -b -v -z --short --branch --long --porcelain? --show-stash --ahead-behind --no-ahead-behind -u? --untracked-files? --ignored? --no-renames --verbose'),
  blame: opts('-b -c -l -t -s -e -f -n -p -w -M? -C? -L= -S= --root --show-stats --show-name --show-number --show-email --porcelain --line-porcelain --incremental --abbrev= --date= --color-lines --color-by-age --minimal --contents= --reverse= --first-parent --ignore-rev= --ignore-revs-file='),
  grep: opts('-a -c -E -F -G -h -H -i -I -l -L -n -o -p -P -q -r -v -w -W -z -e= -f= -A= -B= -C= -m= --cached --untracked --no-index --exclude-standard --no-exclude-standard --recurse-submodules --text --ignore-case --word-regexp --invert-match --full-name --extended-regexp --basic-regexp --perl-regexp --fixed-strings --line-number --column --files-with-matches --name-only --files-without-match --null --only-matching --count --color? --no-color --break --heading --show-function --function-context --context= --after-context= --before-context= --threads= --and --or --not --all-match --quiet --max-depth= --max-count= --recursive --no-recursive', undefined, true),
  'rev-parse': opts('-q --show-toplevel --git-dir --git-common-dir --absolute-git-dir --path-format= --abbrev-ref? --short? --verify --quiet --symbolic --symbolic-full-name --is-inside-work-tree --is-inside-git-dir --is-bare-repository --is-shallow-repository --show-prefix --show-cdup --show-superproject-working-tree --git-path= --all --branches? --tags? --remotes? --glob= --default= --revs-only --no-revs --flags --no-flags --sq --not --since= --until= --after= --before= --show-object-format? --disambiguate= --exclude='),
  'ls-files': opts('-c -d -m -o -i -s -u -k -z -t -v -f -x= -X= --cached --deleted --modified --others --ignored --stage --unmerged --killed --directory --no-empty-directory --eol --deduplicate --exclude= --exclude-from= --exclude-per-directory= --exclude-standard --error-unmatch --with-tree= --full-name --recurse-submodules --abbrev? --sparse --format='),
  'cat-file': opts('-t -s -e -p -Z -z --batch? --batch-check? --batch-all-objects --buffer --unordered --follow-symlinks --allow-unknown-type --use-mailmap --no-use-mailmap'),
  'merge-base': opts('-a --all --octopus --independent --is-ancestor --fork-point'),
  // A name without --list creates a branch.
  branch: opts('-l -a -r -v -i --list --all --remotes --verbose --contains= --no-contains= --merged= --no-merged= --points-at= --sort= --format= --show-current --color? --no-color --column? --no-column --abbrev= --no-abbrev --ignore-case --omit-empty',
    (r) => (r.ops.length > 0 && !r.has('-l', '--list') ? '`git branch <name>` creates a branch: list with `git branch --list <pattern>`.' : null)),
  worktree: (args, ctx, cmd) => (args[0] === 'list' ? opts('-v -z --porcelain --verbose --expire=')(args.slice(1), ctx, `${cmd} list`) : `only \`${cmd} list\` runs.`),
};

/** git: -C, --no-pager and --no-optional-locks before the verb (no -c, --git-dir, --exec-path, …), then GIT_READ or DEBUG_GIT. */
function git(args, ctx) {
  let j = 0;
  const globals = [];
  while (j < args.length && args[j].startsWith('-')) {
    const a = args[j];
    if (a === '-C' && j + 1 < args.length) { globals.push(a); j += 2; continue; }
    if (['--no-pager', '-P', '--no-optional-locks'].includes(a)) { globals.push(a); j++; continue; }
    return `\`git ${show(a)}\` is not on the list: before the verb only -C <dir>, --no-pager and --no-optional-locks run (a git setting can run any program).`;
  }
  const verb = args[j];
  if (verb === undefined) return '`git` needs a verb.';
  const rest = args.slice(j + 1);
  if (ctx.role === 'debugger' && Object.hasOwn(DEBUG_GIT, verb)) {
    return globals.length > 0 ? `the debugger runs \`git ${verb}\` without options before the verb.` : DEBUG_GIT[verb](rest, ctx, `git ${verb}`);
  }
  if (!Object.hasOwn(GIT_READ, verb)) return `\`git ${verb}\` is not on the read-only git list (log, show, diff, status, blame, grep, rev-parse, ls-files, cat-file, merge-base, branch --list, worktree list).`;
  return GIT_READ[verb](rest, ctx, `git ${verb}`);
}

const GH_READ = {
  'pr view': `-c --comments ${JSON_OUT}`,
  'pr list': `-s= --state= -L= --limit= -B= --base= -H= --head= -l= --label= -A= --author= -a= --assignee= -S= --search= -d --draft --app= ${JSON_OUT}`,
  'pr checks': `--watch -i= --interval= --required --fail-fast ${JSON_OUT}`,
  'pr diff': '--name-only --patch --color= -R= --repo=',
  'issue view': `-c --comments ${JSON_OUT}`,
  'issue list': `-s= --state= -L= --limit= -l= --label= -A= --author= -a= --assignee= -S= --search= -m= --milestone= --mention= --app= ${JSON_OUT}`,
  'run view': `--log --log-failed -j= --job= -a= --attempt= --exit-status -v --verbose ${JSON_OUT}`,
  'run list': `-L= --limit= -b= --branch= -w= --workflow= -s= --status= -e= --event= -c= --commit= -u= --user= --created= -a --all ${JSON_OUT}`,
};
const GH_API = '-X= --method= -H= --header= -q= --jq= -t= --template= --paginate --slurp -i --include --silent --verbose --hostname= --cache= -p= --preview= -f= --raw-field= -F= --field=';

/** gh api: GET only, no fields; graphql only with an inline query that names no mutation. */
const ghApi = opts(GH_API, (r) => {
  if (r.ops.length !== 1) return '`gh api` takes one endpoint.';
  // A header such as X-HTTP-Method-Override could turn a GET into a write.
  if (r.get('-H', '--header').some((h) => !/^(accept|x-github-api-version)\s*:/i.test(h))) return '`gh api` sends only Accept and X-GitHub-Api-Version headers.';
  const methods = r.get('-X', '--method');
  const fields = r.get('-f', '--raw-field', '-F', '--field');
  if (r.ops[0] === 'graphql') {
    if (methods.length > 0) return '`gh api graphql` takes no -X.';
    if (r.get('-F', '--field').some((f) => f.slice(f.indexOf('=') + 1).startsWith('@'))) return '`gh api graphql` reads no field from a file (-F x=@file): put the query inline.';
    return fields.some((f) => /mutation/i.test(f)) ? '`gh api graphql` runs queries only, never a mutation.' : null;
  }
  if (methods.some((m) => m.toUpperCase() !== 'GET')) return '`gh api` runs GET only.';
  return fields.length > 0 ? '`gh api` takes no -f/-F fields (they make gh POST): put parameters in the endpoint (search/issues?q=…).' : null;
});

/** `args` with -R/--repo moved from before the command (`gh -R o/r pr view`, `gh pr --repo o/r view`) to after it. */
function ghCommandFirst(args) {
  const head = [];
  const repo = [];
  let j = 0;
  while (j < args.length && head.length < (head[0] === 'api' ? 1 : 2)) {
    const a = args[j];
    if ((a === '-R' || a === '--repo') && j + 1 < args.length) { repo.push(a, args[j + 1]); j += 2; continue; }
    if (/^(-R.|--repo=)/.test(a)) repo.push(a);
    else head.push(a);
    j++;
  }
  return [...head, ...repo, ...args.slice(j)];
}

function gh(args, ctx) {
  const words = ghCommandFirst(args);
  if (words[0] === 'api') return ghApi(words.slice(1), ctx, 'gh api');
  const cmd = words.slice(0, 2).join(' ');
  if (!Object.hasOwn(GH_READ, cmd)) return `\`gh ${show(cmd)}\` is not on the read-only gh list (pr view|list|checks|diff, issue view|list, run view|list, api GET).`;
  return opts(GH_READ[cmd])(words.slice(2), ctx, `gh ${cmd}`);
}

const SED_PRINT = /^(\d+|\$)(,(\d+|\$))?p(;(\d+|\$)(,(\d+|\$))?p)*$/;

const READ = {
  git,
  gh,
  qodo: (args) => (args[0] === 'read' || (args[0] === 'review' && args[1] === 'status')
    ? (args[0] === 'review' ? opts('--extended --json')(args.slice(2), null, 'qodo review status') : null)
    : 'only `qodo read …` and `qodo review status` run.'),
  cat: opts('-n -b -s -v -e -t -A -E -T -u --number --number-nonblank --squeeze-blank --show-all --show-ends --show-tabs --show-nonprinting'),
  head: opts('-n= -c= -q -v --lines= --bytes= --quiet --silent --verbose', undefined, true),
  tail: opts('-n= -c= -q -v -f -F -r --lines= --bytes= --quiet --silent --verbose --follow? --retry', undefined, true),
  wc: opts('-l -w -c -m -L --lines --words --bytes --chars --max-line-length'),
  ls: opts('-1 -a -A -b -B -c -C -d -F -g -G -h -H -i -k -l -L -m -n -o -p -q -r -R -s -S -t -T -u -U -v -x -@ -e -O --all --almost-all --human-readable --recursive --sort= --time= --full-time --group-directories-first --classify --color? --directory --reverse --size --inode'),
  grep: opts('-a -b -c -E -F -G -h -H -i -I -l -L -n -o -P -q -r -R -s -T -U -v -w -x -z -Z -A= -B= -C= -e= -f= -m= -d= -D= --include= --exclude= --exclude-dir= --color? --colour? --line-number --recursive --dereference-recursive --ignore-case --no-ignore-case --files-with-matches --files-without-match --count --word-regexp --line-regexp --fixed-strings --extended-regexp --basic-regexp --perl-regexp --only-matching --no-filename --with-filename --max-count= --context= --after-context= --before-context= --invert-match --quiet --silent --null --null-data --binary-files= --text --regexp= --file= --no-messages --byte-offset --initial-tab', undefined, true),
  // No --pre, --pre-glob, -z/--search-zip or --hostname-bin: each runs a program.
  rg: opts('-i -S -s -w -v -F -x -n -N -l -c -o -u -U -L -H -I -a -q -0 -e= -g= -t= -T= -A= -B= -C= -m= -M= -r= -f= -j= -d= --files --hidden --no-ignore --no-ignore-vcs --glob= --iglob= --type= --type-not= --type-list --json --count --count-matches --files-with-matches --files-without-match --line-number --no-line-number --heading --no-heading --ignore-case --smart-case --case-sensitive --fixed-strings --word-regexp --line-regexp --invert-match --max-count= --context= --after-context= --before-context= --only-matching --replace= --sort= --sortr= --max-depth= --multiline --multiline-dotall --pcre2 --no-filename --with-filename --color= --vimgrep --stats --follow --trim --max-columns= --no-messages --quiet --null --column --no-config --regexp= --file= --threads= --unrestricted --text'),
  // Line ranges only: a sed script can also write (w, s///w) or run (e) a program.
  sed: (args) => (args[0] === '-n' && SED_PRINT.test(args[1] ?? '') && args.slice(2).every((f) => !f.startsWith('-'))
    ? null : "`sed` runs only as `sed -n '<from>,<to>p' [files]`, e.g. sed -n '1,40p' src/cli.ts."),
  jq: opts('-r -j -a -c -n -e -s -S -C -M -R --tab --raw-output --join-output --ascii-output --compact-output --null-input --exit-status --slurp --sort-keys --color-output --monochrome-output --raw-input --seq --stream --indent= -f= --from-file= --arg== --argjson== --slurpfile== --rawfile== --args --jsonargs'),
  // No -o/--output, -T/--temporary-directory or --compress-program.
  sort: opts('-b -d -f -g -h -i -M -n -R -r -V -s -u -c -C -z -k= -t= --ignore-leading-blanks --dictionary-order --ignore-case --general-numeric-sort --human-numeric-sort --month-sort --numeric-sort --random-sort --reverse --version-sort --stable --unique --check? --zero-terminated --key= --field-separator='),
  // A second operand is uniq's output file.
  uniq: opts('-c -d -D -u -i -z -f= -s= -w= --count --repeated --unique --ignore-case --skip-fields= --skip-chars= --check-chars=',
    (r) => (r.ops.length > 1 ? '`uniq in out` writes `out`: read one file and redirect into a temp dir.' : null)),
  cut: opts('-s -n -z -d= -f= -c= -b= --complement --only-delimited --zero-terminated --delimiter= --fields= --characters= --bytes= --output-delimiter='),
  tr: opts('-c -C -d -s --complement --delete --squeeze-repeats'),
  // No -l/--paginate: it runs pr.
  diff: opts('-u -q -r -N -w -b -B -i -a -s -y -t -T -p -E -Z -d -U= -C= -x= -X= -W= --unified? --context? --brief --recursive --new-file --unidirectional-new-file --ignore-all-space --ignore-space-change --ignore-blank-lines --ignore-case --ignore-tab-expansion --ignore-trailing-space --text --report-identical-files --color? --side-by-side --exclude= --exclude-from= --strip-trailing-cr --minimal --suppress-common-lines --label= --width= --show-c-function --normal --expand-tabs --initial-tab --no-dereference'),
  echo: anyArgs,
  printf: anyArgs,
  true: anyArgs,
  pwd: opts('-L -P'),
  // Relative paths after a cd mean something the guard can't see, so they are refused (relOk).
  cd: opts('-L -P', (r) => (r.ops.length > 1 ? '`cd` takes one directory.' : null)),
};

// ---- DEBUG: what the debugger may run on top of READ.

const DEBUG_GIT = {
  add: opts('-v --verbose', (r, ctx) => {
    if (r.ops.length === 0) return '`git add` needs the test paths to stage.';
    const off = r.ops.find((p) => p.startsWith(':') || !inCheckout(p, ctx, 'test'));
    return off === undefined ? null : `the debugger stages only paths under test/, not ${off}.`;
  }),
  commit: opts('-m= --message= -q --quiet -s --signoff', (r, ctx) => {
    if (r.ops.length > 0) return '`git commit` takes no paths here: stage test paths with `git add`, then `git commit -m …`.';
    if (!r.has('-m', '--message')) return '`git commit` needs -m (no editor).';
    if (!ctx.relOk) return '`git commit` runs from the sandbox, without a `cd`.';
    const staged = spawnSync('git', ['diff', '--cached', '--name-only', '--no-renames', '-z'], { cwd: ctx.cwd, encoding: 'utf8' });
    if (staged.status !== 0) return 'agent-guard could not list the staged paths, so the commit is blocked.';
    const off = staged.stdout.split('\0').find((p) => p !== '' && !p.startsWith('test/'));
    return off === undefined ? null : `the debugger commits only test/ paths, and ${off} is staged.`;
  }),
};

const VITEST = '-t= --testNamePattern= --reporter= --silent --bail= --retry= --no-file-parallelism --passWithNoTests --hideSkippedTests --no-color --color';
const DEBUG = {
  npx: (args, ctx) => (args[0] === 'vitest' && args[1] === 'run'
    ? opts(VITEST)(args.slice(2), ctx, 'npx vitest run') : 'the debugger runs vitest as `npx vitest run <files> [-t <name>]`.'),
  npm: (args) => (args.length === 2 && args[0] === 'run' && ['typecheck', 'lint'].includes(args[1] ?? '')
    ? null : 'the debugger runs only `npm run typecheck` and `npm run lint` (the full run: `lockf -k /tmp/commet-fullsuite.lock npm test`).'),
  lockf: (args) => (args.join(' ') === '-k /tmp/commet-fullsuite.lock npm test' ? null : 'the debugger runs lockf only as `lockf -k /tmp/commet-fullsuite.lock npm test`.'),
  node: (args, ctx) => (args[0] !== undefined && !args[0].startsWith('-') && inCheckout(args[0], ctx, 'test/probes')
    ? null : 'the debugger runs node only on a probe: `node test/probes/<file> [args]`.'),
};

function checkAllowed(src, ctx) {
  const { cmds, writes, expands } = parse(src);
  const c = { ...ctx, relOk: !cmds.some((w) => w[0] === 'cd') };
  if (expands) return "an unquoted heredoc expands $… and $(…): quote the delimiter (<<'EOF').";
  for (const t of writes) if (!writeOk(t, c)) return writeMsg(c.role, t);
  const who = c.role === 'debugger'
    ? 'the debugger runs only the read-only list plus `npx vitest run`, `npm run typecheck|lint`, the locked full run, `node test/probes/*` and `git add|commit` of test paths'
    : 'scout and bar-raiser run only the read-only list in .claude/hooks/agent-guard.mjs (READ)';
  for (const words of cmds) {
    const ws = words.map(known);
    const i = ws.indexOf(null);
    if (i >= 0) return `\`${show(words[i] ?? '')}\` is only known at run time ($VAR, $(…), a leading glob or brace) and could turn into an option: spell it out, or quote a glob.`;
    const [name = '', ...args] = /** @type {string[]} */ (ws);
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(name)) return `${who}, with no VAR=value settings (\`${name}\`).`;
    const rule = (c.role === 'debugger' && Object.hasOwn(DEBUG, name) && DEBUG[name]) || (Object.hasOwn(READ, name) && READ[name]);
    if (!rule) return `${who}; \`${name}\` is not on it.`;
    const r = rule(args, c, name);
    if (r) return r;
  }
  return null;
}

// ---- feature: a denylist. Push, merge and publish, wherever a command name can stand.

const base = (w) => w.slice(w.lastIndexOf('/') + 1);
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
    const name = base(words[k]);
    if (!Object.hasOwn(WRAPPERS, name)) return;
    const [valued, skip = 0] = WRAPPERS[name];
    let j = k + 1;
    while (j < words.length && words[j].startsWith('-') && words[j] !== '-') j += valued.includes(words[j]) ? 2 : 1;
    from(j + skip);
  };
  from(0);
  words.forEach((w, i) => { if (FIND_EXEC.has(w)) from(i + 1); });
  return starts;
}

const GIT_VALUED = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix', '--attr-source']);

function gitVerb(args) {
  const conf = [];
  let configEnv = false;
  for (let j = 0; j < args.length; j++) {
    const a = args[j];
    if (a === '--config-env' || a.startsWith('--config-env=')) { configEnv = true; if (a === '--config-env') j++; continue; }
    if (GIT_VALUED.has(a)) { if (a === '-c') conf.push(args[j + 1] ?? ''); j++; continue; }
    if (/^-c./.test(a)) { conf.push(a.slice(2)); continue; } // -ckey=value, as some git versions take it
    if (a.startsWith('-')) continue;
    return { verb: a, rest: args.slice(j + 1), conf, configEnv };
  }
  return { verb: null, rest: [], conf, configEnv };
}

/** git's own commands: built-ins and the git-* programs on PATH. Any other verb is an alias, from whichever config git reads. */
function gitCommands() {
  const r = spawnSync('git', ['--list-cmds=main,others'], { encoding: 'utf8' });
  return r.status === 0 ? new Set(r.stdout.split('\n')) : null;
}

/** `args` (up to `--`) hold a short option from `shorts`, alone or in a cluster (-fv), or one of `longs`, abbreviated as git allows (--forc). */
function hasOption(args, shorts, longs) {
  const own = args.includes('--') ? args.slice(0, args.indexOf('--')) : args;
  return own.some((a) => {
    if (/^-[^-]/.test(a)) return [...a.slice(1)].some((c) => shorts.includes(c));
    const name = a.split('=')[0] ?? '';
    return a.startsWith('--') && name.length > 2 && longs.some((l) => l.startsWith(name));
  });
}

// Verbs that update another repository.
const GIT_PUSH = new Set(['push', 'send-pack', 'http-push']);
// A fetch refspec with a destination (main:main, . HEAD:main) writes that local branch; a URL isn't one.
const refspecDest = (rest) => rest.some((a) => !a.startsWith('-') && /^\+?[^:@]*:/.test(a) && !a.includes('://'));
// Branches live in the shared .git, so a branch moved here moves it for the human and every sandbox (main too).
const GIT_REF_WRITES = {
  'update-ref': () => true,
  'symbolic-ref': (rest) => rest.filter((a) => !a.startsWith('-')).length > 1 || hasOption(rest, 'd', ['--delete']),
  branch: (rest) => hasOption(rest, 'fmMcCdD', ['--force', '--move', '--copy', '--delete']),
  checkout: (rest) => hasOption(rest, 'B', []),
  // switch's own --force (--discard-changes) is not an abbreviated --force-create.
  switch: (rest) => hasOption(rest.filter((a) => a !== '--force'), 'C', ['--force-create']),
  worktree: (rest) => rest[0] === 'add' && hasOption(rest, 'B', []),
  fetch: refspecDest,
  pull: refspecDest,
};

const featureMsg = (what) => `feature-agent never pushes, merges or publishes (${what}): the team lead does that (AGENTS.md).`;
const refMsg = (what) => `feature-agent never moves, overwrites or deletes a branch (${what}): branches live in the shared .git, so the team lead does that (AGENTS.md).`;

/** `run`: the word is a command name for sure. Elsewhere `git` may be a word for another program (grep -rn git src). */
function featureGit(args, ctx, run) {
  const { verb, rest, conf, configEnv } = gitVerb(args);
  if (configEnv) return '`git --config-env` sets git config from the environment, which can run any command.';
  if (conf.some((c) => /^alias\./i.test(c))) return '`git -c alias.…` can run any command: call the git verb itself.';
  for (const c of conf) { const r = checkFeature(c.slice(c.indexOf('=') + 1), { ...ctx, depth: ctx.depth + 1 }); if (r) return r; }
  if (verb === null) return null;
  if (unknown(verb)) return RUNTIME('a git verb');
  const commands = gitCommands();
  if (commands === null) return "agent-guard could not list git's commands, so the call is blocked.";
  if (!commands.has(verb)) return run ? `\`git ${verb}\` is not one of git's commands, so it runs an alias, which can hide a push: spell out the git command.` : null;
  if (GIT_PUSH.has(verb)) return featureMsg(`git ${verb}`);
  return Object.hasOwn(GIT_REF_WRITES, verb) && GIT_REF_WRITES[verb](rest) ? refMsg(`git ${verb}`) : null;
}

// gh's own commands (gh 2.92). Any other word after `gh` is an alias or an extension.
const GH_COMMANDS = new Set(('agent-task alias api attestation auth browse cache codespace completion config copilot extension gist gpg-key '
  + 'issue label licenses org pr preview project release repo ruleset run search secret skill ssh-key status variable workflow').split(' '));

/** feature-agent's gh is the read-only list, as scout's. Where `run` is false, `gh` counts only before one of gh's commands. */
function featureGh(args, ctx, run) {
  const [group = '', ...rest] = ghCommandFirst(args);
  if (!run && !GH_COMMANDS.has(group) && !unknown(group)) return null;
  if (group === 'api' && rest.some(unknown)) return RUNTIME('a gh api argument');
  return gh(args, ctx);
}

// npm runs any unique prefix of a command: `npm pub` publishes and `npm unp` unpublishes (`npm un` is uninstall).
const PUBLISH = (a) => (a.length >= 2 && 'publish'.startsWith(a)) || (a.length >= 3 && 'unpublish'.startsWith(a));
const GIT_CONFIG_ENV = /^GIT_CONFIG_(PARAMETERS|COUNT|KEY_\d+|VALUE_\d+)$/;
const RUNTIME = (what) => `${what} only known at run time ($VAR, $(…), a shell's "$@") could hide a push or publish: spell it out.`;
// Programs that hand text on to the command after them, and the commands they may not be handed to.
const RELAYS = new Set(['xargs', 'parallel']);
const RELAYED = new Set(['git', 'gh', 'npm', 'npx', 'pnpm', 'yarn', 'curl']);
const POSITIONAL = /\$\{?[@*0-9]/; // $@, $*, $0–$9, ${1}: a shell -c script's arguments
const STDIN_FLAG = /^-[A-Za-z]*[si][A-Za-z]*$/; // -s, -i: the script comes from stdin
const STDIN_FILE = /^(-|\/dev\/(stdin|fd\/\d+)|\/proc\/self\/fd\/\d+)$/;

/** Why a wrapper at `k` relays run-time text into git/gh/npm, or null. */
function relays(words, k) {
  const name = base(words[k]);
  const rest = words.slice(k + 1);
  if (RELAYS.has(name)) return rest.some((w) => RELAYED.has(base(w))) ? `\`${name}\` hands its input to ${rest.find((w) => RELAYED.has(base(w)))}: run the command itself.` : null;
  if (FIND_EXEC.has(words[k]) && RELAYED.has(base(words[k + 1] ?? ''))) return `\`find ${words[k]}\` runs ${words[k + 1]} on what it finds: run the command itself.`;
  if (name === 'env') {
    const i = rest.findIndex((w) => /^(-S|--split-string)/.test(w));
    if (i < 0) return null;
    const w = rest[i];
    const split = w === '-S' || w === '--split-string' ? rest[i + 1] ?? '' : w.replace(/^(-S|--split-string=)/, '');
    if (parse(split).cmds.flat().some((x) => RELAYED.has(base(x)))) return '`env -S` builds a git/gh/npm command from a string: run the command itself.';
  }
  return null;
}

function featureWords(words, ctx) {
  // VAR=value anywhere (a prefix, env, export): the value may be run as a command (PAGER, GIT_EDITOR, …).
  for (const w of words) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/.exec(w);
    if (!m) continue;
    if (GIT_CONFIG_ENV.test(m[1] ?? '')) return `${m[1]} sets git config like \`git -c\`, which can run any command.`;
    const r = checkFeature(m[2] ?? '', { ...ctx, depth: ctx.depth + 1 });
    if (r) return r;
  }
  for (let k = 0; k < words.length; k++) { const r = FIND_EXEC.has(words[k]) ? relays(words, k) : null; if (r) return r; }
  const starts = commandStarts(words);
  for (const k of starts) {
    const name = base(words[k]);
    const rest = words.slice(k + 1);
    if (unknown(words[k])) return RUNTIME('a command name');
    const relay = relays(words, k);
    if (relay) return relay;
    if (SHELLS.has(name)) {
      const m = rest.findIndex((w) => /^-[A-Za-z]*c[A-Za-z]*$/.test(w));
      const script = m >= 0 ? rest[m + 1] : undefined;
      // One rule: without -c, a shell on a fed line, with -s/-i/-//dev/stdin or with no operand reads its script from stdin.
      if (script === undefined && (ctx.fed || rest.some((w) => STDIN_FLAG.test(w) || STDIN_FILE.test(w)) || !rest.some((w) => !w.startsWith('-')))) {
        return `\`${name}\` could read its script from stdin (a pipe, <, <<, <<<, -s, - or no script file): run the command itself, or a script file on a line with no pipe or input redirect.`;
      }
      if (script !== undefined && POSITIONAL.test(script.replaceAll(VAR, '$'))) return `\`${name} -c\` with "$@", $* or $1 runs its arguments as code: put the command in the script.`;
      if (script !== undefined) { const r = checkFeature(script, { ...ctx, depth: ctx.depth + 1 }); if (r) return r; }
    }
    if ((name === 'source' || name === '.') && (ctx.fed || rest.some((w) => STDIN_FILE.test(w)))) return `\`${name}\` could read its script from stdin: run the command itself.`;
    if (name === 'eval') { const r = checkFeature(rest.join(' '), { ...ctx, depth: ctx.depth + 1 }); if (r) return r; }
  }
  // A command name can hide behind a wrapper we don't know (xargs-like): check git/gh/npm at every word.
  for (let i = 0; i < words.length; i++) {
    const name = base(words[i]);
    const rest = words.slice(i + 1);
    let r = null;
    if (name === 'git') r = featureGit(rest, ctx, starts.has(i));
    else if (name === 'gh') r = featureGh(rest, ctx, starts.has(i));
    else if (['npm', 'pnpm', 'yarn'].includes(name)) {
      const own = rest.includes('--') ? rest.slice(0, rest.indexOf('--')) : rest; // after --, the script's arguments
      if (own.some(unknown)) r = RUNTIME(`an argument to ${name}`);
      else if (rest.some(PUBLISH)) r = featureMsg(`${name} publish`);
    }
    if (r) return r;
  }
  return null;
}

function checkFeature(src, ctx) {
  if (ctx.depth > 8) return 'the command nests too deeply to check.';
  const { cmds, fed } = parse(src);
  for (const words of cmds) {
    const r = featureWords(words, { ...ctx, fed });
    if (r) return r;
  }
  return null;
}

// ---- The tool call.

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

function check(role, call) {
  const cwd = typeof call.cwd === 'string' ? call.cwd : process.cwd();
  const input = call.tool_input ?? {};
  if (call.tool_name === 'Bash') {
    if (typeof input.command !== 'string') return 'the Bash call has no command.';
    return role === 'feature' ? checkFeature(input.command, { role, cwd, depth: 0 }) : checkAllowed(input.command, { role, cwd });
  }
  if (role === 'debugger' && FILE_TOOLS.has(call.tool_name)) {
    const path = input.file_path ?? input.notebook_path;
    if (typeof path !== 'string') return 'the call has no file path.';
    return writeOk(path, { role, cwd, relOk: true }) ? null : writeMsg(role, path);
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
