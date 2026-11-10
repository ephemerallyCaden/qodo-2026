#!/bin/sh
# Repro (Bug B): does `git log -p -U0` print a NUL inside a text patch? Two cases:
#  late  — a text file whose first NUL is past git's 8000-byte binary sniff;
#  attr  — a file forced to text by a .gitattributes `diff` attribute.
# Run: sh test/probes/repro-nul-patch.sh. Prints NUL counts per commit's patch; Commet's addedLines frames records on NUL (%x00%H).
set -eu
D=$(mktemp -d "${TMPDIR:-/tmp}/repro-nul.XXXX")
cd "$D"
git init -q -b main
git config user.email self@example.com; git config user.name Self; git config commit.gpgsign false
node -e 'process.stdout.write("x".repeat(8100) + "\0tail\n")' > late.txt
git add late.txt; git commit -q -m late
printf '*.dat diff\n' > .gitattributes
node -e 'process.stdout.write("head\0tail\n")' > early.dat
git add .gitattributes early.dat; git commit -q -m attr
for c in $(git rev-list --reverse HEAD); do
  n=$(git log -p -U0 --no-ext-diff --no-textconv --format='%x00%H' -1 "$c" | tr -cd '\000' | wc -c | tr -d ' ')
  printf '%s %s NULs in patch output (1 = framing only)\n' "$(git log -1 --format=%s "$c")" "$n"
done
printf 'late: %s "Binary files differ" lines (0 = diffed as text)\n' "$(git log -p -U0 --no-textconv --format= -1 HEAD~1 | grep -c '^Binary files' || true)"
rm -rf "$D"
