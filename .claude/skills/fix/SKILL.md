---
name: fix
description: Paste an error message or describe a bug. Traces the cause and fixes it.
---

# Fix

Fast bug squashing. Paste an error, stack trace, or describe what's wrong.

## Process

1. Parse the error. Identify the file and line number from the stack trace.
2. Read that file and its imports to understand the context.
3. Identify the root cause. Common hackathon bugs:
   - Missing import or wrong path
   - Undefined variable / typo in name
   - Wrong API response shape (check actual response vs what code expects)
   - Missing env variable (check .env.example)
   - Type mismatch between frontend and backend
   - Async/await missing
   - CORS / network error
4. Fix the root cause. Change the minimum number of lines.
5. Read CLAUDE.md for the build/test commands. Run them.
6. If build passes, report what was wrong and what you changed.
7. If build fails with a new error, repeat from step 1. Max 3 cycles.

If the error is in a dependency or environment issue (not our code), say so and suggest the manual fix.

Do NOT refactor surrounding code. Do NOT add error handling beyond what's needed. Do NOT touch files unrelated to the bug.
