---
name: ship
description: Build, test, commit, and push current changes. Use when a feature is done.
---

# Ship

Ship the current changes. Run in order, stop on failure:

1. Read CLAUDE.md to get the build and test commands
2. Run the build command. Fix any errors.
3. Run the test command (if one exists). Fix any failures.
4. Stage the files you changed by explicit path (never `git add -A` or `git add .`; other sessions write files in this checkout)
5. Write a clear one-line conventional commit message describing what changed
6. `git commit`
7. If the current branch is `main`, stop: pushing `main` needs the human's approval. Otherwise `git push -u origin <current-branch>`

If build or tests fail, fix the issue and retry. Do not push broken code.

After pushing, report: "Shipped: [commit message] on branch [branch name]"
