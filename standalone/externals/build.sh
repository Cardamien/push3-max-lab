#!/bin/zsh
# Build the externals for macOS (universal .mxo), Windows x64 (.mxe64) and Push 3 standalone (Linux x86-64
# .mxl_x86_64), then copy them next to the devices in device/ so a freeze packs all three.
# Usage: ./build.sh [mac|win|linux|all] [external ...]   (defaults: all, every external). Outputs land in build/.
# Needs: Xcode command line tools (mac), zig (win, linux; vendor/zig or PATH), vendor/max-sdk-base (see README).
set -euo pipefail

HERE=${0:A:h}
VERSION=0.2.0
SDK=$HERE/vendor/max-sdk-base/c74support
OUT=$HERE/build
DEVICE=$HERE/device
# Push 3 runs glibc 2.35 (AbletonOS 2025). Target 2.28 for headroom across AbletonOS versions.
GLIBC=2.28
# Keep the build machine's folder names out of the binaries (they are frozen into published devices).
PRIVACY=(-g0 -ffile-prefix-map=$HERE=.)
ZIG=$HERE/vendor/zig/zig
[[ -x $ZIG ]] || ZIG=zig
mkdir -p $OUT

# Per external: sources, include folders, extra compiler flags, bundle id.
typeset -A SOURCES INCLUDES FLAGS BUNDLE
SOURCES[cornerclip~]="source/cornerclip~.cpp"
INCLUDES[cornerclip~]=""
FLAGS[cornerclip~]="-fno-exceptions -fno-rtti"
BUNDLE[cornerclip~]=com.cardamien.cornerclip
# kPlate140 compiles Airwindows' files unchanged; its setParameter uses `throw;`, so exceptions stay on, and -w
# silences the plugin's own warnings.
SOURCES[kplate140~]="source/kplate140~/kplate140~.cpp source/kplate140~/kplate140_bridge.cpp \
source/airwindows/kPlate140/kPlate140.cpp source/airwindows/kPlate140/kPlate140Proc.cpp"
INCLUDES[kplate140~]="source/kplate140~ source/airwindows/kPlate140 source/airwindows/shim"
FLAGS[kplate140~]="-w"
BUNDLE[kplate140~]=com.cardamien.kplate140

srcs() { local f; for f in ${=SOURCES[$1]}; do print -r -- "$HERE/$f"; done; }
incs() { local d; print -r -- -I$SDK/max-includes -I$SDK/msp-includes; for d in ${=INCLUDES[$1]}; do print -r -- -I$HERE/$d; done; }

build_mac() {
	local name=$1 bundle=$OUT/$1.mxo
	rm -rf $bundle
	mkdir -p $bundle/Contents/MacOS
	clang++ -std=c++17 -O2 $PRIVACY -arch arm64 -arch x86_64 -mmacosx-version-min=11.0 ${=FLAGS[$name]} \
		$(incs $name) -bundle $(cat $SDK/max-includes/c74_linker_flags.txt) \
		-F$SDK/msp-includes -framework MaxAudioAPI \
		-o "$bundle/Contents/MacOS/$name" $(srcs $name)
	cat > $bundle/Contents/Info.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>$name</string>
<key>CFBundleIdentifier</key><string>${BUNDLE[$name]}</string>
<key>CFBundleName</key><string>$name</string>
<key>CFBundlePackageType</key><string>iLaX</string>
<key>CFBundleVersion</key><string>$VERSION</string>
<key>CFBundleShortVersionString</key><string>$VERSION</string>
</dict></plist>
EOF
	printf 'iLaX????' > $bundle/Contents/PkgInfo
	codesign --force --sign - $bundle 2>/dev/null
	rm -rf "$DEVICE/$name.mxo" && cp -R $bundle $DEVICE/
	echo "mac:   $bundle"
}

build_win() {
	local name=$1
	# Links against the SDK's import libraries; the C++ runtime is linked statically by zig (mingw + libc++).
	$ZIG c++ -target x86_64-windows-gnu -std=c++17 -O2 $PRIVACY -s -shared ${=FLAGS[$name]} $(incs $name) \
		-o "$OUT/$name.mxe64" $(srcs $name) $SDK/max-includes/x64/MaxAPI.lib $SDK/msp-includes/x64/MaxAudio.lib
	rm -f "$OUT/$name.pdb" "$OUT/$name.lib"
	cp "$OUT/$name.mxe64" $DEVICE/
	echo "win:   $OUT/$name.mxe64"
}

build_linux() {
	local name=$1 stubdir=$OUT/linux-stub
	mkdir -p $stubdir
	# Placeholder for Max's MSP library. It only satisfies the linker and records the
	# DT_NEEDED entry MaxAudioAPI.so; the Push loads the real one.
	cat > $stubdir/maxaudio_stub.c <<'EOF'
void z_dsp_setup(void) {}
void z_dsp_free(void) {}
void class_dspinit(void) {}
void sys_getsr(void) {}
EOF
	$ZIG cc -target x86_64-linux-gnu.$GLIBC -shared -fPIC -Wl,-soname,MaxAudioAPI.so \
		-o $stubdir/MaxAudioAPI.so $stubdir/maxaudio_stub.c
	# Export ext_main only: a statically linked C++ runtime would otherwise export operator new/delete.
	print '{ global: ext_main; local: *; };' > $stubdir/exports.map
	# Max core symbols stay undefined and resolve from Max at load time.
	$ZIG c++ -target x86_64-linux-gnu.$GLIBC -std=c++17 -O2 $PRIVACY -s -shared -fPIC -fvisibility=hidden ${=FLAGS[$name]} \
		$(incs $name) -Wl,--allow-shlib-undefined -Wl,-z,undefs -Wl,--version-script=$stubdir/exports.map \
		-o "$OUT/$name.mxl_x86_64" $(srcs $name) $stubdir/MaxAudioAPI.so
	cp "$OUT/$name.mxl_x86_64" $DEVICE/
	echo "linux: $OUT/$name.mxl_x86_64"
}

target=${1:-all}
(( $# )) && shift
names=(${@:-${(k)SOURCES}})
for n in $names; do
	[[ -n ${SOURCES[$n]:-} ]] || { echo "unknown external: $n" >&2; exit 2; }
	case $target in
		mac) build_mac $n ;;
		win) build_win $n ;;
		linux) build_linux $n ;;
		all) build_mac $n; build_win $n; build_linux $n ;;
		*) echo "usage: $0 [mac|win|linux|all] [external ...]" >&2; exit 2 ;;
	esac
done
