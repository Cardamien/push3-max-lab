#!/bin/zsh
# Start the virtual Push 3: pushbridge (the Push's MIDI ports + UDP link to Max), the Max face, and Live
# started from a copy whose Push helper is ours (fake USB display), so Live runs that helper as its own.
# Stop with Ctrl-C: everything started here is stopped, Live is asked to quit.
#
# Requires: bridge/pushbridge and helper-fake/ built (see README), Max
# installed. Works with or without a real Push 3 attached.
set -u
HERE=${0:a:h}
LIVE_APP="/Applications/Ableton Live 12 Suite.app"
HFAKE_APP="$HERE/helper-fake/Contents/Helpers/Push3.app"
RUN=${USBFAKE_DIR:-${TMPDIR:-/tmp}/virtual-push}
# The Live copy is an APFS clone (no extra disk space). Keep it out of folders synced by a cloud drive:
# the drive would upload the 8 GB bundle and its staging hard links break Live's library paths.
COPY_DIR=${VPUSH_LIVE_COPY_DIR:-${TMPDIR:-/tmp}/virtual-push-live}
LIVE_COPY="$COPY_DIR/${LIVE_APP:t}"
mkdir -p "$RUN"
export USBFAKE_DIR=$RUN   # inherited by the helper Live starts

cleanup() {
  [[ -n ${FP:-} ]] && kill $FP 2>/dev/null
  osascript -e 'with timeout of 20 seconds' -e 'tell application "Ableton Live 12 Suite" to quit' -e 'end timeout' >/dev/null 2>&1
  "$HERE/midihide/midihide" model-restore >/dev/null     # give a real Push its model property back
  echo "virtual push stopped (logs in $RUN)"
}
trap cleanup EXIT INT TERM

if pgrep -f "MacOS/Live" >/dev/null; then echo "Live is already running; quit it first." >&2; exit 1; fi

# (re)make the Live copy when it is missing or Live was updated, then put our helper in place of Live's
ver() { /usr/libexec/PlistBuddy -c "Print CFBundleVersion" "$1/Contents/Info.plist" 2>/dev/null }
if [[ ! -d $LIVE_COPY || $(ver "$LIVE_APP") != $(ver "$LIVE_COPY") ]]; then
  echo "cloning Live into $COPY_DIR..."
  rm -rf "$LIVE_COPY"; mkdir -p "$COPY_DIR"; touch "$COPY_DIR/.metadata_never_index"
  cp -cR "$LIVE_APP" "$COPY_DIR/" || { echo "clone failed" >&2; exit 1; }
fi
rm -rf "$LIVE_COPY/Contents/Helpers/Push3.app"
cp -cR "$HFAKE_APP" "$LIVE_COPY/Contents/Helpers/"

# a real Push 3 that is attached would win the helper's port search (it keys on the MIDI model property):
# give its ports another model for the session; names stay, so Live still detects the device
"$HERE/midihide/midihide" model >/dev/null
"$HERE/bridge/pushbridge" "$RUN/pushbridge.log" & FP=$!
open -g -a Max "$HERE/face/VirtualPush.maxpat"

"$LIVE_COPY/Contents/MacOS/Live" > "$RUN/live_stdout.txt" 2>&1 & LP=$!
echo "virtual push running: Live pid $LP (it starts the helper itself); face in Max (face/VirtualPush.maxpat). Ctrl-C to stop."
wait $LP
