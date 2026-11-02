---
name: ship
description: Build, test, commit, and push current changes. Use when a feature is done.
---

# Ship

Ship the current changes. Run in order, stop on failure:

1. Read CLAUDE.md to get the build and test commands
2. Run the build command. Fix any errors.
3. Run the test command (if one exists). Fix any failures.
4. Run `git add -A`
5. Write a clear one-line commit message describing what changed
6. `git commit`
7. `git push`

If build or tests fail, fix the issue and retry. Do not push broken code.

After pushing, report: "Shipped: [commit message] on branch [branch name]"
