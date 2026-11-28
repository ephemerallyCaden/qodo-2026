#!/bin/sh
# The monitor's deploys (live-demo L7), with the Checkly key from the human's own file, never the repo:
#   sh scripts/checkly.sh env-check   check the key file, and name (never print) what it sets
#   sh scripts/checkly.sh deploy      deploy the hourly check and its email alert
#   sh scripts/checkly.sh drill       deploy them plus the temporary failing check (CHECKLY_FAIL_DRILL=1)
#   sh scripts/checkly.sh restore     a normal deploy again, which removes the drill check
# The file is ~/.config/commet/checkly.env (CHECKLY_ENV_FILE moves it). It must be a plain file of mode
# 0600, and is read as KEY=value lines for three keys only; it is never sourced or run, and no value is
# ever printed. Exit 2: refused (usage, or the file).
set -eu

KEYS='CHECKLY_API_KEY CHECKLY_ACCOUNT_ID CHECKLY_ALERT_EMAIL'
FILE=${CHECKLY_ENV_FILE:-"$HOME/.config/commet/checkly.env"}
refuse() { echo "checkly.sh: $*" >&2; exit 2; }

case ${1:-} in
  env-check|deploy|drill|restore) cmd=$1 ;;
  *) refuse "usage: sh scripts/checkly.sh env-check|deploy|drill|restore" ;;
esac

[ -L "$FILE" ] && refuse "the key file is a symlink; it must be a plain file"
[ -f "$FILE" ] || refuse "no key file at $FILE: create it (mode 0600) with $KEYS"
# GNU stat first: on Linux `stat -f` is the filesystem's status, which succeeds and says nothing of the
# file's mode; BSD stat (macOS) refuses `-c`, so it falls through to its own `-f %Lp`.
mode=$(stat -c %a "$FILE" 2>/dev/null || stat -f %Lp "$FILE" 2>/dev/null || true)
case $mode in
  [0-7][0-7][0-7]|[0-7][0-7][0-7][0-7]) ;;
  *) refuse "couldn't read the key file's mode" ;;
esac
[ "$mode" = 600 ] || refuse "the key file's mode is $mode; it must be 600 (chmod 600 \"$FILE\")"

# Each wanted key from its KEY=value line, quotes around the value dropped; anything else in the file is
# left alone. Read with sed, so nothing in the file is ever run.
value() {
  sed -n "s/^[[:space:]]*\(export[[:space:]]\{1,\}\)\{0,1\}$1[[:space:]]*=[[:space:]]*//p" "$FILE" | tail -n 1 |
    sed -e 's/[[:space:]]*$//' -e "s/^'\(.*\)'\$/\1/" -e 's/^"\(.*\)"$/\1/'
}
missing=''
for k in $KEYS; do
  v=$(value "$k")
  if [ -z "$v" ]; then missing="$missing $k"; continue; fi
  export "$k=$v"
done
[ -z "$missing" ] || refuse "the key file doesn't set:$missing"

cd "$(dirname "$0")/.."
case $cmd in
  env-check) echo "checkly.sh: $FILE is mode 600 and sets $KEYS" ;;
  deploy|restore) unset CHECKLY_FAIL_DRILL; exec npx checkly deploy --force ;;
  drill) CHECKLY_FAIL_DRILL=1 exec npx checkly deploy --force ;;
esac
