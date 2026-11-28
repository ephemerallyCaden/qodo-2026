# Debris fixture repo (R13)

A scripted repo with backdated branches, a bare remote and four worktrees, for the debris scan tests and the debris renderer's manual checks. Identities and dates are fixed, so the SHAs, ids and classes come out the same on every machine. No real person's name or address is in it.

Build it:
- in a test: `await buildDebrisRepo(realTempDir('commet-debris-'))` from `repo.ts`;
- by hand: `npx vite-node test/fixtures/debris/make.ts -- <empty or new folder>`.

The repo is `<folder>/repo`, its remote `<folder>/origin.git` and its worktrees `<folder>/wt/…`. Run `commet scan --no-ingest --no-root` inside the repo: `engine/`, `ui/` and `docs/` are the planets, and `README.md` sits on the star. HEAD is `session/s1` at 2026-10-31 12:00 UTC; every age counts back from it. The repo's config sets `user.email` (Nova, you) and `init.defaultBranch`, and `origin/HEAD` points at `origin/main`.

## Debris (15 items)

| Item | Class | Case |
|---|---|---|
| `ancient` | branch | unmerged, 244 days: broken (decay step 2) |
| `old-feature` | branch | unmerged, 91 days: weathered; one file not at HEAD (`filesOutside`) |
| `deps/bump` | branch | Dependabot's: a bot, not an agent; a root file, so it orbits the star |
| `-x;touch${IFS}pwned;…` | branch | a hostile name (leading `-`, `;`, `$(…)`, a quote, backticks): its commands stay one argument |
| `rtl` U+202E `evil` | branch | a right-to-left override in the name: no command at all |
| `half-rebased` | branch | upstream gone, one of its two commits picked onto main: `git cherry` finds it not merged |
| `origin/stale-remote` | branch | unmerged, only on the remote: inspect only, no delete |
| `locked-old` | branch | checked out in a locked worktree (the lock reason holds a path that must never be output) |
| `rebased` | merged | upstream gone, its commit picked onto main: `git cherry` marks it all `-` (`rebased`) |
| `shipped` | merged | merged with `--no-ff`, pushed with an upstream; its tip adds a path holding U+0001, a newline and a tab (Rule 7) |
| `origin/old-release` | merged | merged, only on the remote |
| `agent/claude-fix` | agent | authored by `Claude <noreply@anthropic.com>`, idle 10 days |
| `wt-agent` | agent | authored by Cursor's agent, idle 15 days, in a live worktree (`wt-agent-dir`) |
| `gone-wt` | agent | a prunable worktree (its folder deleted) on a 2-day-old branch that isn't debris itself |
| (detached) | agent | a prunable detached worktree with a commit on no branch: inspect only, no prune |

## Never debris

| Ref | Why |
|---|---|
| `session/s1` | HEAD's branch |
| `origin/session/s1` | HEAD's upstream (merged, past the grace) |
| `main`, `origin/main` | the default branch (`origin/HEAD`) |
| `origin/HEAD` | a symbolic ref |
| `fresh` | its tip is HEAD's commit |
| `just-merged` | merged a day before HEAD: within the 3-day grace |
| `young` | unmerged, 20 days: not 30 yet |
| `agent/recent` | an agent's, idle 3 days: not 7 yet |
