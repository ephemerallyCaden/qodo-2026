---
name: fix-proof
description: Proves a bug fix's tests really catch the bug. On a throwaway scratch branch it removes only the fix's product logic, runs the named tests and records which fail and with what message, then restores the tree and confirms they pass again. A test that still passes without the fix doesn't test the bug. Use after a fix commit and before its PR, when a review (Qodo or human) asks whether a test proves a fix, or when AGENTS.md's "a test that fails without the fix" needs evidence.
compatibility: Claude Code in a Commet worktree (git, Node 20+, npm, Vitest, Playwright with SwiftShader). Local only, no network.
metadata:
  project: commet
  version: "1"
---

# fix-proof: do the fix's tests fail without it?

AGENTS.md asks every bug fix for a test that fails without the fix, but nothing checks it. This skill
checks it mechanically, for one fix and the tests that should catch its bug.

**Never:** push, fetch, merge, rebase or reset; switch to, edit or delete any branch except the one
scratch branch this run creates; use `git stash` (its stack is shared by every worktree); edit a test
or product code to make a result come out; run the full `npm test` or `npm run test:render`.
**Always:** leave the worktree exactly as you found it, also when you stop early (see "Stopping").

## Inputs

`$ARGUMENTS` holds, in order:
1. **The fix**: a commit (SHA or ref), or the path of a diff file whose changes are already in HEAD.
2. **The tests that should catch the bug**: one or more test files, each optionally with a name
   filter: `<file>.test.ts -t "<name>"` (Vitest) or `<file>.spec.ts -g "<title grep>"` (Playwright).

Missing the fix or the tests, or unsure which is which: stop and ask (see "Stop and ask").

## Project context

- Read `CLAUDE.md` "Build & Test" and AGENTS.md "Testing". Run only the named tests:
  - Vitest: `npx vitest run <file> [-t "<name>"] --reporter=verbose`. It runs `src/` and `web/src`
    TypeScript directly, so there is nothing to build.
  - Playwright: `npx playwright test <spec> [-g "<grep>"] --reporter=list`. Its global setup rebuilds
    `dist/web` from the current sources on every run, so it always tests the tree you are on.
  - A test that spawns `dist/cli.js` (grep the test file for `dist/cli`) needs `npm run build` after
    every change of tree.
- **One browser at a time.** SwiftShader is CPU-bound and other agents share the machine: run
  Playwright commands one after another, never two at once and never in the background beside
  another, and keep the config's single worker.
- **Run every named test command through the runner**, never through a pipe of your own:
  `.claude/skills/fix-proof/scripts/run-tests.sh <SHORT> <fixed|removed|restored> <command> [args...]`.
  It appends the command's whole output and its real `exit=<status>` to
  `/tmp/fix-proof-<SHORT>/<phase>.log`, so a second command in a phase never overwrites the first
  one's messages. (A plain `| tee` reports tee's status, 0, even when the tests failed.) Judge each
  test by its own reporter line (`✓` or `✘`/`×`) and the command's `exit=`: a nonzero exit with no
  failed test line (a crash, a config error) is a failure to run, not a result.
- Shell variables don't survive between tool calls. Write the values from step 1 into the record
  as you go, and use them literally in later commands.

## Steps

### 1. Record the start state
```sh
git branch --show-current                     # START_BRANCH (empty: detached HEAD)
git rev-parse HEAD                            # START_HEAD
git status --porcelain                        # must print nothing
# the fix is a commit:
git rev-parse --verify '<fix>^{commit}'       # FIX (full SHA); SHORT = its first 7
git merge-base --is-ancestor <FIX> HEAD && echo fix-in-head
# the fix is a diff file (outside the worktree, so the tree stays clean):
git apply -R --check <diff file> && echo fix-in-head   # its changes are all in the tree
git hash-object <diff file>                   # SHORT = its first 7; FIX is the file's path
# either way:
git rev-parse --verify --quiet refs/heads/scratch/fix-proof-<SHORT> || echo scratch-name-free
git rev-parse --path-format=absolute --git-common-dir   # MAIN = the directory above it
mkdir -p /tmp/fix-proof-<SHORT>               # logs live here, never in the worktree
```
Stop and ask if the tree isn't clean, the fix isn't in HEAD, or the scratch branch name is taken.

**Create the record file now, before step 2** (path and sections in step 7): write its title, a
`Status: running` line and the start state. Then keep it current: right after each later step, and
before starting the next, append that step's commands and results to the file. Don't hold them back
to write at the end: if the run stops or dies partway, the file must already show every step done.

### 2. Read the fix and isolate its logic
```sh
git show --stat --format='%H%n%s%n%n%b' <FIX>     # a diff file: git apply --numstat <diff file>
git diff --name-status <FIX>^ <FIX>               # a diff file: read the file itself
```
- Split the changed files into **tests** (under `test/`, or named `*.test.ts` / `*.spec.ts`) and
  **product code** (everything else that ships: `src/`, `web/`, `factory/`). The tests stay as they
  are at HEAD. The removal is the product-code part of the fix only.
- Read every product hunk: `git diff <FIX>^ <FIX> -- <product paths>` (a diff file: its hunks for
  those paths). Each must be fix logic or its
  wiring. A hunk that renames, moves or reformats code, or changes something the bug doesn't need,
  is a refactor: stop and ask which hunks are the fix.
- Docs and comments in the fix are not logic; leave them out of the removal if they are in their own
  files.

### 3. Run the named tests on the fixed code (the baseline)
Run each named test command, one at a time, through the runner with phase `fixed`, for example:
```sh
.claude/skills/fix-proof/scripts/run-tests.sh <SHORT> fixed npx playwright test <spec> -g "<grep>" --reporter=list
```
Every named test must pass, with `exit=0`. If one fails on the fixed code, stop and ask: the proof
needs a green start.

### 4. Remove the fix's logic on a scratch branch
```sh
git switch -c scratch/fix-proof-<SHORT>       # from START_HEAD; no other branch is touched
git diff <FIX>^ <FIX> -- <product paths> | git apply -R --index
#   a diff file instead: git apply -R --index --include=<path> [--include=<path>...] <diff file>
git commit -q -m "scratch: remove <SHORT>'s fix logic (fix-proof; never pushed)"
git show --stat HEAD
git diff <START_HEAD> HEAD > /tmp/fix-proof-<SHORT>/removal.patch   # goes into the record
```
- If `git apply -R` doesn't apply cleanly (later commits changed those lines), don't fix it up by
  hand: that would touch product code beyond the fix. Restore and stop and ask.
- Check the removal: `git diff --stat <START_HEAD> HEAD` must list only the product paths from
  step 2, and no test file.

### 5. Run the named tests without the fix
Run the same commands, one at a time, through the runner with phase `removed`. For each named test
record **pass** or **fail** and, for a failure, its exact message: the assertion's own text and the
`Expected` / `Received` lines, copied from `removed.log`, not paraphrased.

Then judge each test:
- **fails on its assertion**: it catches the bug.
- **passes**: it doesn't test the bug. It needs rewriting; say so in the record. Don't rewrite it in
  this run.
- **fails to load** (an import, export or compile error, `is not a function`, `does not provide an
  export named`): the test uses a symbol the fix added, so this failure says nothing about the bug.
  Record the message. Then try a narrower removal on the same scratch branch: put the added symbols
  back (`git checkout <START_HEAD> -- <file>`) and take out only the lines that use them, so the
  behaviour goes but the names still exist; commit it as a second scratch commit, record its patch
  and re-run. If that needs product code the fix didn't have, restore and stop and ask.

### 6. Restore, confirm, delete the scratch branch
```sh
git switch <START_BRANCH>                     # detached start: git switch --detach <START_HEAD>
```
Run the named tests again through the runner with phase `restored`: all must pass, with `exit=0`. Then:
```sh
git branch -D scratch/fix-proof-<SHORT>       # only the branch this run created
.claude/skills/fix-proof/scripts/check-restored.sh <START_BRANCH or -> <START_HEAD> scratch/fix-proof-<SHORT>
```
The script must print `restored: yes`. If it doesn't, fix what it names before anything else.

### 7. The evidence record (created in step 1, finished here)
Path: `<MAIN>/.archive/docs/hackathon/evidence/fix-proof-<SHORT>.md` (gitignored; `<MAIN>` is the
main checkout from step 1). If it exists, use `fix-proof-<SHORT>-2.md` and so on; never overwrite.
Write repo-relative paths only, never absolute ones. By now steps 1 to 6 are in it; finish it by
setting `Status: complete` and writing the summary and verdict. It holds:

1. **Title and summary**: the fix (SHA, subject), the tests, and the verdict in one or two sentences.
2. **Start state**: branch, HEAD, clean tree; the scratch branch's name.
3. **The removal**: the product paths, and the patch from step 4 in a ```diff block (each patch,
   if there was a narrower one).
4. **Commands**: every command from steps 3 to 6, exactly as run.
5. **Results**, one row per named test:

   | Test | With the fix | Without the fix | Restored | In plain words |
   |---|---|---|---|---|
   | `<file>` › `<title>` | passed | failed: `<message>`, Expected: …, Received: … | passed | catches the bug |
   | `<file>` › `<title>` | passed | **passed** | passed | doesn't test the bug: needs rewriting |

6. **Restore check**: the output of `check-restored.sh`.

## Expected result

Every named test passes with the fix, fails on its assertion without it, and passes again after the
restore; the worktree is back on START_BRANCH at START_HEAD with a clean tree and no scratch branch.
Anything else is reported as it is: a test that passed without the fix is named as not proving it.

## Stop and ask

Stop, restore (below), and ask the user, saying what you found, when:
- no tests are named, or no fix is given (you may list the tests the fix commit added or changed as
  candidates, but don't pick for the user);
- the fix can't be isolated from a refactor in the same commit (step 2);
- a named test fails on the fixed code (step 3) or after the restore (step 6);
- the removal doesn't apply cleanly, or a removal would touch product code beyond the fix (steps 4, 5);
- the tree isn't clean, the fix isn't in HEAD, or the scratch branch name is taken (step 1).

## Stopping (early or not)

Before you end the run, whatever happened:
```sh
git switch <START_BRANCH>                     # or: git switch --detach <START_HEAD>
git branch -D scratch/fix-proof-<SHORT>       # if this run created it
.claude/skills/fix-proof/scripts/check-restored.sh <START_BRANCH or -> <START_HEAD> scratch/fix-proof-<SHORT>
```
If you stop with the removal applied but not yet committed, commit it on the scratch branch first
(step 4's commit), so the switch back is clean. The record already holds every step done; set
`Status: incomplete`, with the reason and the step you stopped at.
