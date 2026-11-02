---
name: verify
description: Run full verification loop before merging. Build, types, lint, tests, diff review.
---

# Verify

Run before every merge. Catches breaks before they compound.

## Process

1. Read CLAUDE.md for build/test/lint commands.

2. Run each check in order. Stop and fix on first failure:

   a. **Build** — run the build command. Must exit 0.
   b. **Types** — run typecheck if available (tsc, mypy, pyright). Must exit 0.
   c. **Lint** — run the lint command. Must exit 0.
   d. **Tests** — run the test command. Must pass.

3. **Diff review** — run `git diff --stat` and `git diff` on changed files. For each changed file, verify:
   - The change relates to the current feature (no accidental edits)
   - No debug code left behind (console.log, print, debugger, TODO REMOVE)
   - No hardcoded secrets or localhost URLs that should be env vars
   - No commented-out code blocks

4. Report:

```
VERIFY RESULTS
  Build:  PASS/FAIL
  Types:  PASS/FAIL/SKIP (no typecheck configured)
  Lint:   PASS/FAIL/SKIP (no linter configured)
  Tests:  PASS/FAIL/SKIP (no tests configured)
  Diff:   CLEAN / [list issues]

  Ready to merge: YES/NO
```

5. If any check fails, fix the issue and re-run that check. Do not skip failures.
