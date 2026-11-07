# Virtual Push

Status: working (started 2026-10-30). Built and tested on one Mac with Live 12.4.15.

Question: can a fully working Push 3 (screen, 64 pads, buttons, encoders, their lights) be emulated on the Mac, inside a Max patcher with its own UI, so custom Push interactions and `live.push` visuals can be built and tested without the hardware connected?

## How it works

Think of Live and its Push as a theatre and a stage manager. Live doesn't drive the Push itself: a separate program shipped with Live, the Push helper, plays stage manager. It receives the song from Live, draws every frame of the Push screen and talks to the hardware. The virtual Push gives that stage manager a fake stage: a pretend USB screen that sends every frame to Max, and pretend MIDI ports that carry pads, buttons and lights to and from a Max patch. The helper can't tell the difference, so Live drives the patch exactly as it drives a real Push.

## Quick start

Requirements: a Mac, Live 12 Suite (tested with 12.4.15) and Max 9. A real Push 3 can stay connected.

1. `./build.sh` builds the tools and makes `helper-fake/`, a copy of Live's Push helper with the fake USB library, from your own Live. Run it again after every Live update.
2. Quit Live, then `./run.sh`. It starts the MIDI bridge, opens the face (`face/VirtualPush.maxpat`) and starts a clone of Live that uses the fake helper. Your installed Live is not changed.
3. Wait about a minute after Live opens, then play the face. `face/README.md` explains every gesture.
4. Stop with Ctrl-C in the terminal. `run.sh` quits Live and puts everything back.

While it runs, `run.sh` changes one property of a connected real Push's MIDI ports so the fake helper doesn't take the real device, and restores it on exit. If a run is killed, run `midihide/midihide model-restore`.

## What is known (Live 12.4.15, tethered Push 3 firmware 1.5.4)

- Live does not draw the Push 3 screen. A separate helper, `Ableton Live 12 Suite.app/Contents/Helpers/Push3.app`, does: it holds a copy of the set (Ableton's Flip document sync), renders every 960x160 frame and drives the hardware. It is the same program as Push 3 standalone.
- Live starts the helper about 19 s after launch, only when a Push 3 is attached, as `Push3 --parent-process-id=<Live pid> --log-level=info --dont-log-to-console --language=EN`. It logs to `~/Library/Preferences/Ableton/Live 12.4.15/Push3.log`.
- Live and the helper talk over three unix sockets in `$TMPDIR`: `push-flip-api-ipc-channel` (set sync), `live-to-push-midi-ipc-channel`, `push-to-live-midi-ipc-channel`. No TCP.
- The helper reaches the hardware two ways: pads, buttons, encoders and lights through CoreMIDI ports named `Ableton Push 3`; the screen only through its bundled `libusb`.

## Results so far (2026-10-30, no Push attached)

- Fake ports alone: Live lists them but does not start the helper. Live's trigger is probably the USB device itself (with real hardware it also opens Push 3's audio interface and its own internal `FromPush`/`ToPush` ports).
- Helper started by hand with the arguments above plus the fake ports running: it accepts them as a Push 3, loads the Push script, connects to Live, sends its greeting and drives the fake pads and buttons (201 MIDI messages: button CCs, pad notes, Ableton sysex). Only the screen is missing: it retries `Could not find Push II USB display device` every second.
- Two-way test (fake Play and pad presses): no reaction. The hand-started helper stops after its greeting: no 'Starting the main loop', no 'Received song'. With real hardware the helper first opens the USB display and queries system info (serial, uptime, firmware) before the main loop starts. So the fake USB device is the gate for everything, not only the screen: it must answer those queries too.

## Screen protocol (recorded from the real Push 3, firmware 1.5.4, with `usblog/`)

Same as the public Push 2 display protocol. USB device vid `2982` pid `1969`, interface 0, bulk OUT endpoint `01`, bulk IN endpoint `81`.

- Frame: a 16-byte header `ff cc aa 88 00 ...`, then 327680 bytes = 160 lines of 2048 bytes (960 pixels of 16-bit BGR565 little-endian, then 128 bytes of padding), the whole buffer XOR-ed with `e7 f3 e7 ff` repeating. The helper sends frames back to back, about 48 per second, whether or not anything changed.
- Startup, six commands of 16 bytes `f8 f8 13 13 <cmd> 00 00 00 <sub> 00 ...`, each answered by 40 bytes on the IN endpoint: `0a` system info (serial at bytes 16-19, uptime in seconds at 20-23, package version at 24-27), then `01` with sub `06 08 07 00 09` for the pmc, apc, xySensor, startupImage and imagery firmware versions. Nothing else crosses USB in a Live session; pads, buttons, encoders and lights are MIDI.
- The recorded replies are embedded in `usbfake/usbfake.c`.

## Status (2026-10-30, evening): the whole virtual Push works

`run.sh` starts everything; `face/VirtualPush.maxpat` is the instrument (see `face/README.md` for how to play it). Verified with Live 12.4.15 and a real Push 3 still attached: Live detects the fake Push, sends it the song and the screen, lights the face (Play green, Note-mode pad layout), and presses from the bridge reach Live (Play starts the transport). Since Live starts our helper itself (see the finding below), pads light in their pressed colour too.

## How the fake Push runs

1. Live must run our helper, not its own. `run.sh` makes an APFS clone of the Live app (no extra disk space) in `$TMPDIR/virtual-push-live/`, replaces `Contents/Helpers/Push3.app` in the clone with `helper-fake/`'s, and starts Live from the clone. Live then starts our helper itself, as its own child, the way it does with real hardware. The installed Live is untouched. The clone is re-made when Live is updated. Keep it out of folders synced by a cloud drive (Google Drive, iCloud, Dropbox): the drive would upload the 8 GB bundle, and its staging hard links make Live look for its libraries in the wrong place (`dyld: Library not loaded: @rpath/libonnxruntime_abl.dylib`).
2. `bridge/pushbridge` provides the three MIDI ports (model property "Ableton Push 3", Active Sensing every 270 ms like the hardware), answers the two questions Live's Push script needs answered before it drives the lights (Universal Device Inquiry, and the Push 3 sysex `42` firmware-versions query, both replies recorded from the real Push), forwards every message from the helper to Max as OSC on UDP 7476 (`/in <port> <bytes>`), sends what Max does on UDP 7475 (`/midi <bytes>`) to the Live Port, and replays the last state of every light on `/resend`.
   If a real Push 3 is attached, the helper would bind it first: its port search keys on the endpoint's MIDI model property containing "Push", not on names. `midihide/midihide model` sets that property to "Hardware" on the real endpoints for the session (names untouched, so Live still detects the real device, which it does by name; hiding, renaming or marking the ports offline makes Live tear its Push session down). `run.sh` restores it on exit.
3. `helper-fake/Contents/Helpers/Push3.app` is a copy of Live's helper with `usbfake/libusb-1.0.dylib` in place of libusb, re-signed ad hoc (`helper-fake/Contents/App-Resources` links to Live's because the helper looks for `../../../../App-Resources`; inside the Live clone the real one is in place). Live starts it as `Push3 --parent-process-id=<Live pid> --log-level=info --dont-log-to-console --language=EN`; it inherits `USBFAKE_DIR` from `run.sh`. It then logs `Received song` and `Push script initialized`, and streams Live's real Push screen. Allow about a minute after Live starts before the first presses.
4. Frames go to Max over TCP in `jit.net.send`'s wire format (port 7474) into a named `jit.matrix`; the face's v8ui draws that matrix in the screen slot (`Image.fromnamedmatrix`), at most 25 times a second. The latest frame is also written to `$USBFAKE_DIR/frame.bin` (960x160 BGR565). `max/ScreenViewer.maxpat` is the earlier screen-only viewer.

## Finding: why the pads stayed dark (fixed 2026-10-30)

The first version ran the installed Live under a sandbox rule that forbade starting its own helper, and started our helper by hand. Buttons worked, pads never lit, and after loading a device from the Push browser the screen stayed on "Loading <device>...".

- Pads did reach Live. A spy library injected into the helper (`midispy/`, see below) showed each pad press forwarded to Live already in scale (pad 36 sent as note 38 in D Hirajoshi), over `push-to-live-midi-ipc-channel`.
- Live never answered with note feedback, the echo of playing notes that lights a pressed pad. Only MIDI clock came back over `live-to-push-midi-ipc-channel`.
- Live did not accept the hand-started helper as its own. It kept trying to start its helper, at a growing rate (21, then 24, 27 and 30 failed starts a minute, `SubProcess: Start of process ... failed` in Live's `Log.txt`). It also re-created the set-sync socket (`push-flip-api-ipc-channel`) about every 20 s, and the helper had to reconnect each time. A helper that had run for a while stopped answering even buttons.

With Live started from a clone that holds our helper, Live supervises it normally: no failed starts, the set-sync socket stays put, and pads light like on the hardware (the pressed pad green, plus every other pad playing the same note in the layout).

`usbfake`'s libusb now carries the same spy: it logs to `$USBFAKE_DIR/midispy.log` while the file `$USBFAKE_DIR/midispy.on` exists, so it works with the helper Live starts. To use it on a hand-started helper instead, start it with `DYLD_INSERT_LIBRARIES=midispy/midispy.dylib MIDISPY_LOG=<file>`. Do not launch it through `nohup` or `env`: macOS strips `DYLD_*` variables when it starts system binaries. The log shows which CoreMIDI ports it connects to and its MIDI traffic with Live, framed as `01 00 00 00 00 00 00 00 <len> <bytes> <timestamp>`.

The helper's Python traceback `version_info ... ValueError: not enough values to unpack (expected 3, got 2)` also happens with the real Push; ignore it.

## Screen capture of the real Push (usbtap, 2026-10-31)

`tap.sh` starts Live from the same APFS clone, with `helper-tap/Push3.app` in place of Live's helper: Live's own helper with `usbtap/libusb-1.0.dylib` in front of the real libusb (renamed `libusb-1.0.real.dylib`), re-signed ad hoc. The real Push works as usual (no bridge, no midihide); every frame the helper sends it is also copied to `$USBTAP_DIR` (default `$TMPDIR/push-tap`): `frame.bin` (latest, at most 30 per second, plus the same frames to `jit.net.recv` on port 7474), and, while the file `rec.on` exists, `rec.log` (time and pixel hash of every frame) and with `rec.full` also `rec.bin` (every changed frame). `usbtap/snap.py` makes a PNG of the latest frame (`snap.py out.png`), PNGs of a recording (`--rec dir`) and the frame rates (`--rate`). Captures from the first session are in `tests/tap/`.

Build `helper-tap/` with `./build.sh tap`: it copies Live's helper into `helper-tap/`, renames its `Frameworks/libusb-1.0.dylib` to `libusb-1.0.real.dylib`, puts `usbtap/libusb-1.0.dylib` beside it and re-signs it ad hoc. After rebuilding the tap while Live runs, copy the bundle into the clone and quit the helper: Live restarts it within about 2 s.

Measured with it (tethered Push 3, Live 12.4.15):
- The helper sends the Push one frame every 20.7 ms (48.2 per second) whatever happens on screen. The 128 padding bytes after each line alternate between two values on a static screen (two buffers), so compare pixels only.
- A `live.push` picture changes at most about 30 times a second: PushStressTest Plasma at Rate 18 gave 18.0 distinct frames per second, at 30 / 39 / 60 / 120 it gave 29.5 / 29.9 / 29.6 / 28.9. The device itself reported 60 sent at Rate 60, 2.4 ms per frame in Live.
- The Map chart on bank 1 "Scene" (`tests/tap/map-bank1.png`): Live draws the parameter name in row 1, value in row 2, dial in rows 3 to 5 of columns 4 to 7, and the track tab over cells 0,7 (device not focused); everything else of the chart shows. Same as the virtual Push map.

## Files

- `run.sh`: start everything (it makes the Live clone; quit any other Live first).
- `tap.sh`, `usbtap/`: screen capture of the real Push (above).
- `face/`: `VirtualPush.maxpat` (generated by `build-patcher.py`), `vpush.js` (v8ui: drawing, gestures, MIDI), `draw.js` + `layout.js` + `icons.js` + `palette.js` (renderer shared with the HTML preview, `build-preview.py`), `README.md` (user guide).
- `bridge/pushbridge.swift`, `usbfake/usbfake.c`, `usblog/usblog.c`, `midispy/midispy.c` (logs a process's CoreMIDI connections and its socket traffic with Live), `midihide/midihide.swift` (+ `props.swift`, a property lister), `midiquery/`, `midisniff/`, `fakeports/` (superseded by the bridge).
- `docs/layouts-and-generators.md`: how Push layouts and generators work inside the helper's script, and three ways to add new ones (Max for Live, a patched helper script, or the Max face with its own screen overlays).
- `tests/shift-select-mpe-layouts-2026-10-30.md`: Shift and Select combinations, MPE pass-through, what each melodic layout does with the pads (XYZ, sequencers, expressive step editing).
- `tests/button-test-2026-10-30.md`: every control sent through the bridge, what Live does with it, two face mapping fixes (New is CC 92, d-pad centre CC 91).
- `data/push3-palette.json`: Live's LED palette and the hardware's settings, read from a Push 3.
- `helper-copy/`, `helper-fake/`, `reference/`: gitignored (Ableton's binaries and images).

Built by observing how Live talks to Push 3, for interoperability. No Ableton file is included: `run.sh` builds the modified helper on your Mac from your own copy of Live, and never changes the installed application.
