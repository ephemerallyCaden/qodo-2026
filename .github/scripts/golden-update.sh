#!/bin/sh
# Every non-merge commit in <base>..<head> that changes test/golden/ must say why, in a
# `Golden-Update: <reason>` line (AGENTS.md Testing, system-design §10). Usage: golden-update.sh <base> <head>
set -eu
bad=0
for c in $(git rev-list --no-merges "$1..$2" -- test/golden); do
  if ! git log -1 --format=%B "$c" | grep -Eq '^Golden-Update: *[^[:space:]]'; then
    echo "::error::$(git log -1 --format='%h %s' "$c") changes test/golden/ without a 'Golden-Update: <reason>' line"
    bad=1
  fi
done
exit "$bad"
