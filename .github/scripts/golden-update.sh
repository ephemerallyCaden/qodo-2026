#!/bin/sh
# Every non-merge commit in <base>..<head> that changes test/golden/ must say why, in a
# `Golden-Update: <reason>` line (AGENTS.md Testing, system-design §10). Usage: golden-update.sh <base> <head>
set -eu
# Outside the loop, so an unreadable range fails the gate instead of checking nothing.
commits=$(git rev-list --no-merges "$1..$2" -- test/golden) || { echo "::error::can't list commits in $1..$2"; exit 2; }
bad=0
for c in $commits; do
  if ! git log -1 --format=%B "$c" | grep -Eq '^Golden-Update: *[^[:space:]]'; then
    echo "::error::$(git log -1 --format='%h %s' "$c") changes test/golden/ without a 'Golden-Update: <reason>' line"
    bad=1
  fi
done
exit "$bad"
