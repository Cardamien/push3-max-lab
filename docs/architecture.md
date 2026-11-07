# How Live and Push 3 talk to each other

What can be seen from the outside, with nothing installed on the Push and no SSH: a Push 3 (firmware package 1.5.4) attached to a Mac running Live 12.4.15, the Push's network services, and the files of the Push helper that ships inside Live. Facts that only SSH access shows come from Federico Pepe's [ableton-push-hack](https://github.com/federico-pepe/ableton-push-hack) and are marked as such.

## In one picture

Think of a theatre. Live is the company that owns the play (the song, the tracks, the devices). The Push helper is the stage manager: it receives a copy of the play from Live, decides what each pad, button and light means right now, draws every frame of the Push screen and talks to the hardware. The Push itself is the stage: pads, buttons, lights and a screen, with no idea what the play is about.

On a Mac, the stage manager is a separate program inside Live (`Live.app/Contents/Helpers/Push3.app`), started by Live when a Push 3 is connected. On Push 3 standalone, the same program runs on the Push's own computer next to its own copy of Live. It is the same program in both places, which is why a device that works with a tethered Push behaves the same on standalone, and why the virtual Push (`../virtual-push/`) can study the Push without SSH.

## The two programs

| | Tethered (Mac) | Standalone (on the Push) |
|---|---|---|
| Live | Live.app | a full Live engine without a window (upstream, SSH) |
| Push helper | `Helpers/Push3.app`, started by Live | the same program, started by a launcher |
| Push script | Python (CPython 3.11), package `Push2` | same |
| Screen | over USB, interface 0 | same code |
| MIDI | macOS CoreMIDI ports | ALSA inside the Push |
| Audio | the Push is a normal 16-in, 16-out interface | ALSA, 44.1 kHz, 128-sample buffers |

The Push 3 script is the Push 2 script with Push 3 additions (battery, audio setup, hardware settings); there is no separate Push 3 package. So Push 2 knowledge is the right starting point for Push 3.

On the Mac, a few system services of the standalone Push (its message bus and its updater) are replaced by stand-ins built into the helper; everything else, including the Push's web service, is compiled in.

## The line between Live and the helper

Live and the helper talk through three local channels (Unix sockets) with the same names on the Mac and on the Push:

- **The shared document.** Live and the helper each keep a copy of the song model (song, tracks, devices, plus services for the browser, MIDI, audio and Max for Live) and keep them in step by exchanging small changes. The protocol is Ohm Force's "flip", a collaborative-document library.
- **MIDI from the Push to Live** (pads, buttons, encoders), already translated by the script (for example a pad press arrives as a note in the current scale).
- **MIDI from Live to the Push.**

Heavy real-time data (waveforms, the playhead, pictures, the count-in) doesn't go through the document but through shared memory. A Max for Live device has no access to any of these channels: it reaches the Push only through the Live API (`live.push`, banks, control surfaces) and through MIDI on Live's tracks.

The helper watches Live: if Live quits, the helper shuts down; if the helper dies while a Push is connected, Live starts a new one within about 2 seconds.

## Start-up

From the helper's log (`~/Library/Preferences/Ableton/Live <version>/Push3.log` on the Mac), a tethered start takes about 2 to 3 seconds:

1. The helper finds the Push's MIDI ports and opens the screen over USB.
2. It asks the Push for its system information and firmware versions (six short USB commands).
3. The Push script loads, says hello to Live, and about half a second later receives the song.
4. It identifies the hardware over MIDI (firmware, board revision) and is ready.

On the Mac the helper never updates the Push's firmware ("not running standalone"); on standalone it can.

Live's Push settings (velocity curve, brightness, MPE, audio routing, pedal and CV) are kept in `PushPreferences.json` in the same folder.

## USB

The Push 3 appears on USB as a small hub with the Push device behind it (vendor `0x2982`, product `0x1969`). The device has seven interfaces:

| Interface | What |
|---|---|
| 0 | the screen (vendor-specific, used by the helper through libusb) |
| 1 | audio control (USB Audio 2) |
| 2, 3 | audio out and in |
| 4 | audio control belonging to the MIDI function |
| 5 | MIDI: Live Port, User Port, External Port |
| 6 | vendor-specific, purpose unknown |

The hub is a switch. When the Push goes from Control Mode to Standalone Mode, the hub and the device leave the computer and appear on the Push's own computer within about 3 seconds.

Screen frames use the Push 2 format (header, then 160 lines of 960 pixels in 16-bit colour, scrambled with a fixed XOR pattern), sent continuously at about 48 per second. Details: `../hardware/README.md`.

## MIDI and SysEx

Covered in `../hardware/README.md`: ports, User Mode, the SysEx command table, battery, LEDs. In short: idle hardware sends only Active Sensing; the SysEx traffic you see while Live runs is the Push answering Live's regular questions (battery once a second, audio status about three times a second).

## Network

The Push announces itself on the local network as `push.local` and runs a web service on port 80, which Live's browser uses to exchange files with it. Pairing works only in Standalone Mode. Details: `../standalone/web-service.md`. Note that the support bundle the service can produce contains your Push preferences, including the Wi-Fi hotspot password: don't share it as is.

## The machine inside

From the Push's own logs: an Intel NUC 11 compute element with a Core i3-1115G4 (4 threads, 3.0 GHz), 8 GB of memory, a real-time Linux 5.15 kernel. Live runs there with ALSA audio at 44.1 kHz, 128-sample buffers, about 8.7 ms total latency. A launcher writes one line per minute with temperatures and Live's and the helper's CPU use (idle: Live 3 to 8 %, helper about 3 %).

## Still open

- What interface 6 carries.
- Which power-status value means "charging".
- How the hub switch between the USB-C port and the Push's computer is controlled.
