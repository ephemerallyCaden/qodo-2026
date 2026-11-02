---
name: secure
description: Pre-demo security checklist. Run before going live. Catches hardcoded keys, exposed endpoints, and common hackathon security mistakes.
---

# Pre-Demo Security Check

5-minute scan before deploying. Catches the things that embarrass you in front of judges.

## Process

1. **Secrets scan** -- grep the entire codebase for leaked credentials:
```bash
grep -rn "sk-\|sk_live\|AKIA\|ghp_\|password.*=.*['\"]" --include="*.ts" --include="*.js" --include="*.py" --include="*.env" --include="*.json" . 2>/dev/null | grep -v node_modules | grep -v .git
```
Also check: `.env` files not in `.gitignore`, API keys in frontend code, hardcoded localhost URLs.

2. **Debug code** -- find leftover development artifacts:
```bash
grep -rn "console\.log\|debugger\|TODO REMOVE\|HACK\|FIXME" --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" . 2>/dev/null | grep -v node_modules
```
```bash
grep -rn "print(\|breakpoint()\|import pdb" --include="*.py" . 2>/dev/null | grep -v __pycache__
```

3. **Exposed endpoints** -- check for:
   - API routes with no auth that should have auth
   - Admin/debug routes still accessible
   - CORS set to `*` (acceptable for hackathon demo, flag it anyway)

4. **Environment** -- verify:
   - `.env` is in `.gitignore`
   - `.env.example` exists without real values
   - No secrets in git history: `git log --all -p | grep -i "api_key\|secret\|password" | head -20`

5. **Sponsor API specific**:
   - API key only in `.env`, never in source
   - Usage within plan limits
   - No user data or likeness (voice, face) used without consent

## Report

```
SECURITY CHECK
  Secrets in code:     CLEAN / [count] found
  Debug code:          CLEAN / [count] found
  Exposed endpoints:   CLEAN / [list]
  Environment:         CLEAN / [issues]
  Sponsor API:         CLEAN / [issues]

  Safe to deploy: YES/NO
```

Fix any findings before deploying. This takes 5 minutes now and prevents disaster during the demo.
