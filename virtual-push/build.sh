#!/bin/zsh
# Build the virtual Push on your Mac, from your own copy of Live. Nothing of Ableton's is stored in this repository,
# and the installed Live is never changed: the helper is copied into helper-fake/ (gitignored) and modified there.
#
# Usage: ./build.sh            tools + helper-fake/ (what run.sh needs)
#        ./build.sh tap        also helper-tap/ (screen capture of a real Push, for tap.sh)
# Needs: Xcode command line tools, Live 12 Suite in /Applications (set LIVE_APP to use another path).
set -euo pipefail

HERE=${0:A:h}
LIVE_APP=${LIVE_APP:-"/Applications/Ableton Live 12 Suite.app"}
LIVE_HELPER="$LIVE_APP/Contents/Helpers/Push3.app"
[[ -d $LIVE_HELPER ]] || { echo "Live's Push helper not found: $LIVE_HELPER (set LIVE_APP)" >&2; exit 1; }
cd $HERE

echo "tools"
swiftc -O bridge/pushbridge.swift -o bridge/pushbridge
swiftc -O midihide/midihide.swift -o midihide/midihide
( cd usbfake && clang -arch arm64 -arch x86_64 -dynamiclib -O2 -o libusb-1.0.dylib \
    -install_name @rpath/libusb-1.0.dylib -framework CoreMIDI -framework CoreFoundation usbfake.c ../midispy/midispy.c )

echo "helper-fake/ from $LIVE_HELPER"
rm -rf helper-fake
mkdir -p helper-fake/Contents/Helpers
cp -R "$LIVE_HELPER" helper-fake/Contents/Helpers/
cp usbfake/libusb-1.0.dylib helper-fake/Contents/Helpers/Push3.app/Contents/Frameworks/libusb-1.0.dylib
ln -s "$LIVE_APP/Contents/App-Resources" helper-fake/Contents/App-Resources   # the helper looks for ../../../../App-Resources
codesign --force --deep -s - helper-fake/Contents/Helpers/Push3.app

if [[ ${1:-} == tap ]]; then
  echo "helper-tap/ from $LIVE_HELPER"
  ( cd usbtap && clang -arch arm64 -arch x86_64 -dynamiclib -O2 -o libusb-1.0.dylib \
      -install_name @rpath/libusb-1.0.dylib usbtap.c )
  rm -rf helper-tap
  mkdir -p helper-tap
  cp -R "$LIVE_HELPER" helper-tap/
  F=helper-tap/Push3.app/Contents/Frameworks
  mv $F/libusb-1.0.dylib $F/libusb-1.0.real.dylib
  cp usbtap/libusb-1.0.dylib $F/libusb-1.0.dylib
  codesign --force --deep -s - helper-tap/Push3.app
fi

echo "done. Rebuild after every Live update."
