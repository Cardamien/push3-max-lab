# Compiled Max externals on Push 3 standalone

> **Compatibility (2026-11-09):** this is verified only with a **Push 3 tethered** to the Mac, **Live 12.4.15** and **Max 9.2** (standalone 9.2.0, selected in Live's Preferences, Max). It is **not verified** on the Max 9.1.5 bundled with Live 12.4, on a standalone Push 3, or on other Live versions. See the Compatibility section of the main `README.md`.

Question: can a third-party compiled Max external (C or C++) run on Push 3 standalone? Yes. Two devices built this way run on Push 3 standalone, in Live on the Mac, and in Max:

- **CornerClip**: a clipper around `cornerclip~`, a C++ external wrapping Airwindows OneCornerClip, with a stock-Ableton-look face (laid out after Live's Tape device) and a display that draws the clipped wave.
- **kPlate140**: Airwindows kPlate140 (an EMT 140 style plate reverb) as `kplate140~`, with a display that draws the plate on its springs.

Each `.amxd` carries three builds of its external, and Max picks the one for its platform: `.mxo` (macOS, universal), `.mxe64` (Windows) and `.mxl_x86_64` (Push 3 standalone).

## How it works

Push 3 standalone is a small x86-64 Linux computer (an Intel Core i3-1115G4) running Live and Max. Max loads externals there just as on a Mac, but it looks for a Linux build named `<name>.mxl_x86_64`. Ableton's Max for Live production guidelines say the same: externals not included with Max "need to be compiled separately for Mac, PC and Push 3 Linux platforms by their developers".

Think of the external as a sentence translated three times: once for macOS, once for Windows, once for the Push. The frozen device carries all three translations, and each machine reads its own. The trick is that all three are produced on one Mac, with Zig, a compiler that can build for other systems.

## Build

```
git clone --depth 1 https://github.com/Cycling74/max-sdk-base.git vendor/max-sdk-base
# Zig 0.15.2 from ziglang.org, unpacked to vendor/zig (or any zig on PATH)
./build.sh            # every external: .mxo (universal, ad-hoc signed), .mxe64, .mxl_x86_64, copied to device/
./build.sh linux kplate140~   # one platform, one external
```

Then freeze each device from the Max for Live editor opened in Live (right-click the device title, Edit, snowflake, save). Max alone shows no freeze button. After freezing, the `.amxd` must contain all three builds; move or share only the frozen file.

Recipe for the Push build (`build_linux` in `build.sh`):

- Target an old glibc (`x86_64-linux-gnu.2.28`) so the external loads on current and older AbletonOS (Push 3 runs glibc 2.35).
- Link the C++ runtime statically (Zig's libc++), so there is no `libstdc++` dependency.
- Leave Max's own functions undefined; they resolve from Max at load. Link against a stub `MaxAudioAPI.so` that only satisfies the linker; the Push loads the real one.
- Export only `ext_main` with a version script (`{ global: ext_main; local: *; };`), so the static runtime doesn't export its own symbols.
- Keep exceptions on when the source uses `throw;` (Airwindows plugins do); `-fno-exceptions` is fine for hand-written externals.
- For Windows builds, define `_USE_MATH_DEFINES` before the math headers, or `M_PI` is missing.
- Builds use `-g0`, `-ffile-prefix-map` and `-s`, so the build machine's folder names don't end up in published binaries.

Airwindows plugins compile unchanged against a small stand-in for the VST 2 base class (`source/airwindows/shim/audioeffectx.h`); a bridge file (`source/kplate140~/kplate140_bridge.cpp`) drives the plugin and keeps its headers apart from Max's.

## Results

| Step | CornerClip | kPlate140 |
|---|---|---|
| Push 3 standalone | runs (2026-10-26) | runs (2026-10-26) |
| Live 12 on the Mac | loads, defaults correct, face and display checked | loads, face checked (`screens/kplate140-live.jpg`) |
| Linux build | 23 kB, needs only `GLIBC_2.2.5` symbols, no `libstdc++` | 1.6 MB, glibc 2.16 symbols at most |
| Windows build | built, not run on Windows | built, not run on Windows |
| DSP check in Max | 100 Hz sine at 1.0: threshold 0 dB gives 1.0, -6 dB gives 0.501; Dry/Wet 50 % gives 0.751 | impulse: tail about 2.5 s at Regen 0.2, 5-6 s at 0.9; full Predelay delays the tail by about 0.7 s |
| Push bank | `Input, Pos Thr, Neg Thr, Voicing, -, -, -, Dry/Wet` | `Regen, DeRez, Predelay, Input, -, -, -, Wetness` |

The Push banks are built at load by `*_banks.js` into `live.banks` (`live.banks` does nothing outside Live, so they can't be checked in Max alone).

CPU, estimated from Mac measurements (not yet read on the Push's own CPU meter): about 0.3 % of the Push CPU per `cornerclip~` and about 4 % per `kplate140~`.

## When to use this route

Use a compiled external when the DSP exists as C or C++ and may live in a binary: the original code runs unchanged, with no translation errors and no gen~ compile time at load. The costs are one binary per platform rebuilt on every change, a toolchain, and a frozen device that hides the DSP. Check the source licence allows distributing binaries.

## Files

| Path | What |
|---|---|
| `build.sh` | builds every external for macOS, Windows and Push, and copies them next to the devices |
| `source/cornerclip~.cpp` | the CornerClip external |
| `source/kplate140~/` | the kPlate140 external and its bridge |
| `source/airwindows/` | Airwindows kPlate140, unchanged, and the stand-in VST 2 header |
| `device/` | the two frozen devices, their bank scripts and display scripts |

## Licences

The Airwindows code (OneCornerClip, inside `cornerclip~.cpp`, and kPlate140) is Copyright (c) airwindows, MIT licence: https://github.com/airwindows/airwindows. The Max wrappers, bridge and stand-in header are MIT (`LICENSE` at the repository root). The Max SDK is not included; `build.sh` expects it in `vendor/`.
