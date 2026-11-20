#!/bin/sh
# fix-proof: checks the worktree is back where the run started. Read-only; prints one line per check,
# then `restored: yes` or `restored: no`, and exits 0 or 1.
# Usage: check-restored.sh <start branch, or - for a detached start> <start HEAD sha> <scratch branch>
if [ $# -ne 3 ]; then echo "usage: $0 <start-branch|-> <start-head> <scratch-branch>" >&2; exit 2; fi
start_branch=$1; start_head=$2; scratch=$3; ok=yes
branch=$(git branch --show-current)
head=$(git rev-parse HEAD)
want=$(git rev-parse --verify --quiet "$start_head^{commit}") || { echo "start HEAD: $start_head is not a commit"; exit 2; }
if [ "$start_branch" = "-" ]; then
  [ -z "$branch" ] && echo "branch: detached, as at the start" || { echo "branch: on $branch, but the start was detached"; ok=no; }
else
  [ "$branch" = "$start_branch" ] && echo "branch: $branch" || { echo "branch: on '${branch:-detached}', want $start_branch"; ok=no; }
fi
[ "$head" = "$want" ] && echo "HEAD: $head" || { echo "HEAD: $head, want $want"; ok=no; }
dirty=$(git status --porcelain)
[ -z "$dirty" ] && echo "tree: clean" || { echo "tree: not clean:"; echo "$dirty"; ok=no; }
if git rev-parse --verify --quiet "refs/heads/$scratch" >/dev/null; then echo "scratch branch: $scratch still exists"; ok=no; else echo "scratch branch: $scratch absent"; fi
echo "restored: $ok"
[ "$ok" = yes ]
