#!/bin/zsh
# Screen capture of the REAL Push 3: start Live from the same APFS clone run.sh uses, with
# helper-tap/ (Live's own helper + usbtap's pass-through libusb) in place of Live's helper.
# The real Push works as usual; every frame it is sent is also copied to $USBTAP_DIR
# (frame.bin, rec.log/rec.bin, jit.net port 7474). See usbtap/usbtap.c and usbtap/snap.py.
# No bridge, no midihide: the helper binds the real Push's MIDI ports.
# Stop with Ctrl-C: Live is asked to quit.
set -u
HERE=${0:a:h}
LIVE_APP="/Applications/Ableton Live 12 Suite.app"
TAP_APP="$HERE/helper-tap/Push3.app"
export USBTAP_DIR=${USBTAP_DIR:-${TMPDIR:-/tmp}/push-tap}
COPY_DIR=${VPUSH_LIVE_COPY_DIR:-${TMPDIR:-/tmp}/virtual-push-live}   # outside any cloud-synced folder
LIVE_COPY="$COPY_DIR/${LIVE_APP:t}"
mkdir -p "$USBTAP_DIR"

cleanup() {
  osascript -e 'with timeout of 20 seconds' -e 'tell application "Ableton Live 12 Suite" to quit' -e 'end timeout' >/dev/null 2>&1
  echo "tap stopped (captures in $USBTAP_DIR)"
}
trap cleanup EXIT INT TERM

if pgrep -f "MacOS/Live" >/dev/null; then echo "Live is already running; quit it first." >&2; exit 1; fi
[[ -d $TAP_APP ]] || { echo "build helper-tap first (README, 'Screen capture of the real Push')" >&2; exit 1; }

ver() { /usr/libexec/PlistBuddy -c "Print CFBundleVersion" "$1/Contents/Info.plist" 2>/dev/null }
if [[ ! -d $LIVE_COPY || $(ver "$LIVE_APP") != $(ver "$LIVE_COPY") ]]; then
  echo "cloning Live into $COPY_DIR..."
  rm -rf "$LIVE_COPY"; mkdir -p "$COPY_DIR"; touch "$COPY_DIR/.metadata_never_index"
  cp -cR "$LIVE_APP" "$COPY_DIR/" || { echo "clone failed" >&2; exit 1; }
fi
rm -rf "$LIVE_COPY/Contents/Helpers/Push3.app"
cp -cR "$TAP_APP" "$LIVE_COPY/Contents/Helpers/"

"$LIVE_COPY/Contents/MacOS/Live" "$@" > "$USBTAP_DIR/live_stdout.txt" 2>&1 & LP=$!
echo "tap running: Live pid $LP; latest frame in $USBTAP_DIR/frame.bin (usbtap/snap.py makes a PNG). Ctrl-C to stop."
wait $LP
