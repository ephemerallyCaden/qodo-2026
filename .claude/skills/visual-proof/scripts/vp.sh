#!/bin/sh
# visual-proof: compiles the skill's TypeScript tools with this checkout's own tsc into a fresh temp
# dir (removed on exit; nothing is written into the repo), then runs them: `vp.sh run …`, `try …` or
# `scenes`. The tools load @playwright/test from this checkout's node_modules, through a link in that dir.
# Its exit status is the run's, and its last line always says it (`vp.sh: exit <code> (…)`), so a caller
# that pipes the output still reads how the run ended.
set -u
finish() {
  case $1 in
    0) why='done: read the files named above in full' ;;
    2) why='usage: see above' ;;
    3) why='stopped: report the STOP block above to the user and ask' ;;
    *) why='internal error: report the record'"'"'s Internal error step' ;;
  esac
  echo "vp.sh: exit $1 ($why)"
  exit "$1"
}
skill=$(cd "$(dirname "$0")/.." && pwd)
top=$(git -C "$skill" rev-parse --show-toplevel) || finish 1
if [ ! -x "$top/node_modules/.bin/tsc" ] || [ ! -d "$top/node_modules/@playwright/test" ]; then
  echo "STOP tool-missing: node_modules: run npm ci in this checkout (the tools need its typescript and @playwright/test)"
  finish 3
fi
tools=$(mktemp -d "${TMPDIR:-/tmp}/visual-proof-tools.XXXXXX") || finish 1
trap 'rm -rf "$tools"' EXIT
trap 'rm -rf "$tools"; exit 130' INT TERM
if ! "$top/node_modules/.bin/tsc" -p "$skill/tsconfig.json" --outDir "$tools/out" > "$tools/tsc.log" 2>&1; then
  cat "$tools/tsc.log"
  echo "STOP build-failed: the skill's own tools don't compile (above)"
  finish 3
fi
ln -s "$top/node_modules" "$tools/node_modules"
printf '{ "type": "module" }\n' > "$tools/out/package.json"
cd "$top" || finish 1
node "$tools/out/.claude/skills/visual-proof/scripts/main.js" "$@"
finish $?
