# Known limitations

Updated 2026-10-30 (evening).

- Hand-tested with the mouse on 2026-10-30 (report `tests/face-hand-test-2026-10-30.md`): every gesture class reaches Live. Buttons that can change the set (Delete, Duplicate, Convert, Double Loop, New, Capture, Record, Quantize, Fixed Length, Automate, Undo, Save, Stop, the eight scene buttons and upper display buttons 1 to 7) were checked by hit test only, not clicked. Gesture limits are listed in `face/README.md`.
- MPE: the helper passes pressure, slide and per-note pitch bend to Live unchanged on any channel (tested channels 1 to 5, see `tests/shift-select-mpe-layouts-2026-10-30.md`). Whether an MPE instrument in Live plays them as on the hardware is untested (only Analog, which has no MPE, was loaded).
- The pitch bend across pads uses one semitone per pad width; the per-layout interval Live sends the pads has not been identified yet (Live's init sysex `26`, `28`, `33` are candidates).
- No MIDI clock reaches the Push ports, so blinking and pulsing run at 120 bpm regardless of Live's tempo.
- `midihide model` changes a CoreMIDI property of the real Push's endpoints for the session; `run.sh` restores it on exit. If a run is killed, `midihide/midihide model-restore` puts it back (Live would otherwise not see the real Push's ports as a Push).
- The face redraws fully on every screen frame (up to 25 a second) and every light change; CPU cost in Max not yet measured.
- Live must be started by `run.sh`, which runs it from a clone in `$TMPDIR/virtual-push-live/` holding our helper. A Live started from the Dock runs Ableton's helper, which binds the song. macOS may clear `$TMPDIR` after a restart; `run.sh` then makes the clone again (about 20 s, no extra disk space). Never put the clone inside a cloud-synced folder.
- Allow about a minute after Live starts before the first presses: presses at 40 s were ignored, at 60 s they worked (cause not identified).
- `run.sh` quits Live with an AppleEvent; if Live asks "This action will stop audio. Proceed?", the quit waits for that dialog.
- `helper-fake/` is a copy of Live 12.4.15's helper, re-signed ad hoc, and the Live clone carries it unsigned by Ableton (fine for a local launch, not for Gatekeeper). A Live update changes the helper and the recorded USB replies (firmware versions are those of a Push 3 on package 1.5.4; serial and uptime are dummy values); rebuild the copy after an update.
- Frame pacing is a fixed 20 ms sleep in `usbfake`, so the screen runs at about 40 to 48 fps like the hardware; `jit.net.recv` serves one client, so no other `jit.net.send` may target port 7474 while the viewer is open.
- `max/ScreenViewer.maxpat` writes a PNG of the current frame (`vpush_snapshot.png`) when its snapshot message is clicked.
- The helper's Python traceback `version_info ... ValueError (expected 3, got 2)` is present with real hardware too and is not caused by the fake.
- The pad mirror covers palette colours with Live's blink and pulse channels, free RGB colours (sysex `3B`: XYZ glow, Rhythm Generator sliders), the touch strip LEDs (`19`), LED and display brightness (`06`, `08`); checked on 5 melodic and 7 drum layouts on 2026-10-30. A face that reopens gets the RGB, strip and brightness states back only from a bridge built after that date (the bridge started by an older run replays palette notes and CCs only).
