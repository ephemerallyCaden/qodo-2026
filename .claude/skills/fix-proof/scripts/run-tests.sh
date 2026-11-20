#!/bin/sh
# fix-proof: runs one named test command for a phase and keeps what it said. Appends a header, the
# command's whole output and its own exit status to <logs>/<phase>.log (never truncating an earlier
# command's), prints the same, and exits with the command's status, not a pipe's.
# Usage: run-tests.sh <short> <fixed|removed|restored> <command> [args...]
# Logs go to /tmp/fix-proof-<short>/, or to $FIX_PROOF_LOGS when set.
if [ $# -lt 3 ]; then echo "usage: $0 <short> <fixed|removed|restored> <command> [args...]" >&2; exit 2; fi
short=$1; phase=$2; shift 2
case $phase in fixed|removed|restored) ;; *) echo "phase must be fixed, removed or restored, not '$phase'" >&2; exit 2;; esac
dir=${FIX_PROOF_LOGS:-/tmp/fix-proof-$short}
mkdir -p "$dir" || exit 2
log=$dir/$phase.log
out=$(mktemp "$dir/.run.XXXXXX") || exit 2
"$@" > "$out" 2>&1
code=$?
{ printf '### %s: %s\n' "$phase" "$*"; cat "$out"; printf 'exit=%s\n\n' "$code"; } | tee -a "$log"
rm -f "$out"
exit "$code"
