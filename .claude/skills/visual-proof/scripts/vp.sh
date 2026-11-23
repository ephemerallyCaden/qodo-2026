#!/bin/sh
# visual-proof: compiles the skill's TypeScript tools with this checkout's own tsc into a fresh temp
# dir (removed on exit; nothing is written into the repo), then runs them: `vp.sh run …` or `vp.sh scenes`.
# The tools load @playwright/test from this checkout's node_modules, through a link in that temp dir.
set -eu
skill=$(cd "$(dirname "$0")/.." && pwd)
top=$(git -C "$skill" rev-parse --show-toplevel)
if [ ! -x "$top/node_modules/.bin/tsc" ] || [ ! -d "$top/node_modules/@playwright/test" ]; then
  echo "STOP tool-missing: node_modules: run npm ci in this checkout (the tools need its typescript and @playwright/test)"
  exit 3
fi
tools=$(mktemp -d "${TMPDIR:-/tmp}/visual-proof-tools.XXXXXX")
trap 'rm -rf "$tools"' EXIT INT TERM
if ! "$top/node_modules/.bin/tsc" -p "$skill/tsconfig.json" --outDir "$tools/out" > "$tools/tsc.log" 2>&1; then
  cat "$tools/tsc.log"
  echo "STOP build-failed: the skill's own tools don't compile (above)"
  exit 3
fi
ln -s "$top/node_modules" "$tools/node_modules"
printf '{ "type": "module" }\n' > "$tools/out/package.json"
cd "$top"
set +e
node "$tools/out/.claude/skills/visual-proof/scripts/main.js" "$@"
code=$?
exit $code
