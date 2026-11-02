---
name: unstick
description: When Claude is looping, failing repeatedly, or burning tokens without progress. Meta-debugging for agent behavior.
---

# Unstick

Use when you notice Claude is stuck: repeating the same fix, looping on an error, or spinning without progress.

## Step 1: Stop and capture

Do not retry. Instead, write down:
- What was the original goal?
- What was the last tool call sequence? (the last 3-5 tool calls)
- What error or symptom keeps repeating?
- How many times has this been attempted?

## Step 2: Diagnose the pattern

Match against these common failure modes:

| Pattern | Signal | Recovery |
|---------|--------|----------|
| **Loop** | Same edit/error 3+ times | Stop. The approach is wrong, not the execution. |
| **Context overflow** | Responses getting shorter, losing earlier instructions | `/compact` now. Write current plan to a file first. |
| **Wrong hypothesis** | Fix doesn't change the error at all | Re-read the error. The root cause is not where you think. |
| **Stale state** | Code looks right but tests fail | `git stash && git stash pop`. Rebuild from clean. Check if you are editing the right file. |
| **Dependency issue** | Import errors, module not found | Check package.json/requirements.txt. Did you forget to install? |
| **API mismatch** | Code matches docs but gets 400/422 | Docs may be stale. Probe the real API with curl first. |

## Step 3: Smallest safe recovery

Pick ONE action based on the pattern:

1. **Loop**: `/clear` and restate the goal with what you learned. Do not paste the old conversation.
2. **Context overflow**: Write plan to `PLAN.md`, run `/compact`, then read `PLAN.md` back.
3. **Wrong hypothesis**: Read the ACTUAL error message character by character. Grep the codebase for the error string. Find where it is thrown.
4. **Stale state**: `rm -rf node_modules && npm install` or equivalent clean rebuild.
5. **Dependency**: Check the real installed version, not what you assume.
6. **API mismatch**: `curl` the endpoint directly with minimal payload. Compare response to what your code expects.

## Step 4: One check, then retry

Run exactly ONE verification command to confirm the world state matches your assumption. Only then retry the original task.

Do NOT retry the exact same approach. Change one thing based on what you learned.
