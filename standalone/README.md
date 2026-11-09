# Push 3 standalone from Max for Live

> **Compatibility (2026-11-09):** this is verified only with a **Push 3 tethered** to the Mac, **Live 12.4.15** and **Max 9.2** (standalone 9.2.0, selected in Live's Preferences, Max). It is **not verified** on the Max 9.1.5 bundled with Live 12.4, on a standalone Push 3, or on other Live versions. See the Compatibility section of the main `README.md`.

What runs on Push 3 standalone, without SSH and without installing anything on the Push beyond normal Max for Live devices.

| Topic | Where |
|---|---|
| Compiled Max externals (C, C++) on the Push | `externals/` |
| Custom pictures on the Push screen with `live.push` | `../screens/` |
| The Push's local web service: pairing, logs, CPU readout, transfer speed | `web-service.md` |

## The machine

Push 3 standalone is an x86-64 Linux computer, not ARM: an Intel Core i3-1115G4 (4 threads, 3.0 GHz) with about 7.7 GB of usable memory, running Live and Max. Live's audio runs at 44.1 kHz with 128-sample buffers. Read advice written for Apple silicon (NEON) as applying to Mac builds only; on the Push, x86 instructions (SSE, AVX) apply.

## Planning a device for standalone

- **Parameters on `live.*` controls.** On the Push, encoders and banks are the user's surface. Put every parameter on a `live.*` control and arrange the Push banks with `live.banks`; build the banks at load (`live.thisdevice`), because `live.banks` only works inside Live.
- **Don't rely on `v8ui` for the Push.** A `v8ui` did not render on Push 3 standalone in our tests. The device's face in Live is for the laptop; on the Push, use banks and a `live.push` picture.
- **Freeze before sending.** Scripts, gen~ files and compiled externals then travel inside the `.amxd`.
- **CPU budget.** The Push is slower than a recent laptop. Read real load from the web service's `launcher.log` (`web-service.md`).
- **Audio outputs.** Check the Push's own output routing before sending signal anywhere but the main outputs.
- **No MIDI ports by name.** There is no macOS-style MIDI port list on the Push; devices get MIDI through Live's tracks.
