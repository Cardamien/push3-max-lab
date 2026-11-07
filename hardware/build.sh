#!/bin/sh
# Builds the tools into build/ (gitignored). Needs Xcode command line tools and libusb (brew install libusb).
set -e
cd "$(dirname "$0")"
mkdir -p build
swiftc -O tools/pushmidi.swift -o build/pushmidi
PREFIX="$(brew --prefix 2>/dev/null || echo /opt/homebrew)"
clang -O2 -Wall -Wextra -I"$PREFIX/include" tools/pushscreen.c -L"$PREFIX/lib" -lusb-1.0 -o build/pushscreen
echo built: build/pushmidi build/pushscreen
