# Push 3 hardware: battery, LEDs, modes and SysEx

How a Push 3 talks over MIDI and USB, measured on one unit (firmware package 1.5.4, Live 12.4.15, macOS) from the outside: nothing installed on the Push, no SSH. The SysEx commands are Ableton's internal ones, not a public interface, so a firmware update can change them. Command names are the ones used in Live's Push script; the behaviour comes from MIDI captures on the hardware.

## Safety first

- Never send the power command (`0x39`): value `01` switches the Push off. The tools here refuse to send it.
- Don't change audio settings (`0x37`) or power state while Live is running: Live's script owns them and will fight the change.
- Everything below was tested on one Push 3. Try a command on your own unit before building on it.

## How it works

Think of the Push as a house with two front doors. Live's script uses the **Live Port**; everything else uses the **User Port**. In normal use, Live holds the keys: pads, buttons and lights go through the Live Port. Switch the Push to **User Mode** and Live steps back: the controls send on the User Port, and any program (or a Max for Live track listening to that port) can use them.

The Push also answers a few questions from anyone who asks: battery level and charging, sample rate, input clipping. Live asks those questions all the time (battery once a second, audio status about three times a second), which is why the Push seems to send SysEx constantly. Left alone, it only sends Active Sensing.

## MIDI ports on the Mac

The Push 3 shows three ports: `Ableton Push 3 Live Port`, `Ableton Push 3 User Port` and `Ableton Push 3 External Port` (the 5-pin MIDI jacks). Pick ports by their full names and check them with `midiinfo` in Max: other software can create look-alike ports with similar names, so never match on the bare word "Push 3". On Push 3 standalone there are no such ports: Max for Live devices get MIDI only through Live's tracks.

## SysEx

Every message has the form `F0 00 21 1D 01 01 <command> <data> F7`.

| Command | Name | Data, notes |
|---|---|---|
| `0x0A` | Mode switch | `00` Live, `01` User. The Push echoes it on both ports. |
| `0x3A` | Power state (query) | Send with no data. Reply: `<status> <level>`, see Battery. |
| `0x38` | Audio controls (query) | List the ids you want; the reply repeats `id lo hi` for each. An empty request gets no reply. |
| `0x37` | Set audio controls | `id lo hi` triples. Don't use while Live runs. |
| `0x3B` | RGB LED colour | `00 <led> r_lo r_hi g_lo g_hi b_lo b_hi`, see LEDs. |
| `0x39` | Power command | `01` power off, `02` / `05` clear a short / long power-button press. **Don't send.** |
| `0x20` / `0x43` | Pad velocity curve (set / get) | Sent in chunks of 16. |
| `0x26` | Pad parameter | `07 <pad> <value> 00`; Live's most frequent message. |
| `0x3E` | Host mode (query) | |
| `0x42` | Firmware update results (query) | `42 <n>` |

Push 2 commands that still work on Push 3: `0x03` palette entry, `0x06` LED brightness, `0x08` display brightness, `0x17` touch-strip configuration, `0x19` touch-strip LEDs, `0x1E` aftertouch mode (Push 3 adds value `02` for MPE).

Audio-control ids for `0x38`: `0x0D` sample rate, `0x18` / `0x19` input clip indicators (channels 1 and 2), `0x1E` master volume, `0x3A` external sample rate, `0x3B` external clock valid, `0x3C` external clock source.

## Battery

Send `F0 00 21 1D 01 01 3A F7` on the Live Port. The Push answers `F0 00 21 1D 01 01 3A <status> <level> F7` to any sender, with or without Live.

- `level`: battery from 0 to 100 %.
- `status`: bit `0x20` = power supply connected; bit `0x08` = short power-button press waiting, `0x10` = long press waiting.
- Seen: `22 64` (on mains, 100 %) and `21 55` (85 %). Which low-bit value means "charging" is not known yet.

Live warns at 7 % and 3 %. Because Live's own replies reach every listener too, filter on the command byte (`0x3A`), not on timing.

From Max beside Live, an untested sketch: `metro 1000` → `sxformat 240 0 33 29 1 1 58 247` → `midiout` on the Live Port; `sysexin` on the same port → `zl.group 64` closed by `sel 247` → `route 240` → `zl.slice 5` → `route 58` → `unpack 0 0`; `& 32` gives the supply flag, the second number the level.

## LEDs

- **RGB SysEx (`0x3B`)** lights a pad or button in any colour, from either port: `F0 00 21 1D 01 01 3B 00 <led> r_lo r_hi g_lo g_hi b_lo b_hi F7`. Each colour is 0 to 255, split into its low 7 bits and its high bit (for example 255 = `7F 01`).
- **Palette notes** (note on, velocity = palette colour) light a pad only when sent on the port the Push is listening to: the User Port in User Mode.
- Live sets LED brightness to the maximum (`06` with `7F`) and display brightness to 255 (`08` with `7F 01`). In mod-wheel mode it lights all 31 touch-strip LEDs; in pitch-bend mode it dims them.

## Controls in User Mode

With Live closed and the Push in User Mode, everything arrives on the User Port:

- Pads as MPE: one channel per finger, note 36-99 on and off, pitch bend, CC 74 slide, channel pressure.
- Encoders as CC 72-76, each with a touch note (notes 0-13).
- The touch strip as pitch bend on channel 1.
- Buttons as CC. Push 3 differs from Push 2 for two of them: New is CC 92 (87 on Push 2) and the d-pad centre press is CC 91.

## The screen without Live

With Live closed, a program can draw on the Push screen directly over USB (`tools/pushscreen.c`): claim interface 0 of the device (vendor `0x2982`, product `0x1969`) and send frames, with no start-up commands needed. Each frame is a 16-byte header (`ff cc aa 88` then zeros) followed by 160 lines of 2048 bytes (960 pixels in 16-bit BGR565, then 128 bytes of padding), the whole buffer XOR-ed with `e7 f3 e7 ff`, the same format as Push 2. 150 frames at 30 per second ran with no error; 5 per second already gives a steady picture. If you stop sending, the last picture stays for a while and then the screen blanks, so keep sending and finish with a black frame. With Live running, use `live.push` instead (`../screens/`).

## Tools

Build with `./build.sh` (needs the Xcode command line tools and libusb: `brew install libusb`). Both tools are for a tethered Push on a Mac.

- `build/pushmidi <seconds> [live|user "<hex bytes>"]...` sends messages to the Live Port or User Port and prints what both ports send back. It matches the exact hardware port names and only sends SysEx for mode, power-state query, RGB LED and palette read, so it can never switch the Push off. Example, switch to User Mode and listen for 10 s (quit Live first): `build/pushmidi 10 live "F0 00 21 1D 01 01 0A 01 F7"`. Send `0A 00` to go back.
- `build/pushscreen [--info] [--fps N] [--secs S] [--stop black|none]` draws test bars and a sweeping line on the screen with Live closed. `--info` first asks the Push for its system information.

`results/` holds the captures behind this page (serial number redacted).

## Not known yet

- Which power-status value means "charging".
- Whether the Push answers the battery query on the User Port.
- The white-only button LEDs, latency, and how long the screen holds a picture before blanking.
