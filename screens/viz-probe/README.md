# Push Viz Probe

> **Compatibility (2026-11-09):** this is verified only with a **Push 3 tethered** to the Mac, **Live 12.4.15** and **Max 9.2** (standalone 9.2.0, selected in Live's Preferences, Max). It is **not verified** on the Max 9.1.5 bundled with Live 12.4, on a standalone Push 3, or on other Live versions. See the Compatibility section of the main `README.md`.

A Max for Live audio-effect device (audio passes through untouched) that sends test pictures to the device-screen slot of Push 3, through `[live.push]` and its undocumented `jit_matrix <name>` message. Purpose: find out, on real hardware, what Push does with such a picture. Verified on a tethered Push 3 with Live 12.4.15 on 2026-10-29 (see `KNOWN-LIMITATIONS.md` for what is still open, and the guide in `../README.md` for the findings).

Files: `PushVizProbe.amxd` (device), `push-viz-probe.js` (all the logic, one v8 script), `KNOWN-LIMITATIONS.md`, `CHANGELOG.md`.

## How it works

Think of Push's screen as a shop window and this device as a sign painter standing outside. The painter does not use brushes; he fills a grid of tiny coloured tiles (a "matrix"), holds the finished board up to the window, and does it again several times a second. The device is the painter's toolbox: you pick which picture he paints (a red wall, a gradient, a ruler-like grid, a moving stripe, a frame counter), how big the board is, how many boards per second he shows, and in which order each tile's four colour values are written down (some windows read "red, green, blue", others "blue, green, red"; if the colours look wrong, the painter simply writes them in another order). The small preview in the device shows the board he is holding up. Whether the shop window actually shows it is exactly what this device is made to find out. The switch "Send" starts off, so the painter stays home until you ask him to work.

## Controls

| Control | Range | Default | Notes |
|---|---|---|---|
| Send | off / on | off | nothing is sent until switched on; frame counter restarts on each start |
| Rate | 1 to 30 frames per second | 5 | the script throttles; `live.push` has no rate limit |
| Size | 960x160, 480x80, 1920x320, 960x320, 800x120 | 960x160 | Live asks for one size; Push crops or zero-pads |
| Pattern | Red, Green, Blue, Gradient, Grid, Corners, Bar, Counter | Red | see below |
| Order | ARGB, ABGR, BGRA, RGBA | ARGB | order of the four bytes per pixel; ARGB is Jitter's own |
| Alpha | 0 to 255 | 255 | alpha byte of every pixel |
| Spare 1, 2, 3 | 0 to 127 (int) | 0 | unused and connected to nothing; they exist only so the device has 9 parameters and Live splits it into two banks of 8 on Push (bank 1: Send, Rate, Size, Pattern, Order, Alpha, Spare 1, Spare 2; bank 2: Spare 3). Shown in the free area at the bottom right of the device |

Patterns: solid red/green/blue; horizontal gradient black to white; grid (1 px white border, dim lines and white ticks every 80 px); corners (top-left red, top-right green, bottom-left blue, bottom-right white, 20x20 px each); bar (8 px white bar moving 16 px per frame); counter (frame number in a built-in 5x7 digit font).

## Hardware test procedure

Load: Push 3 connected to Live 12 (tethered first, then standalone). Put PushVizProbe on an audio track, select the device. Info View (hover a control) explains each one.

1. Pattern Red, Size 960x160, Order ARGB, Alpha 255, Rate 5. Switch Send on. Note: does anything appear on Push; where (slot position, size, which part of the screen); is the colour red.
2. Colour order: with Pattern Corners, try ARGB, ABGR, BGRA, RGBA. Note which order shows TL red, TR green, BL blue, BR white correctly.
3. Size and crop/pad: with Pattern Grid, try each Size. Note whether the picture is cropped, padded with black, or scaled; check that the border and the 80 px ticks fall where expected (this gives the real pixel size of the slot).
4. Gradient and Alpha: Gradient at Alpha 255, then 128, then 0. Note whether alpha changes anything.
5. Frame rate and CPU: Pattern Counter and Bar at Rate 5, 10, 20, 30. Note whether the counter keeps up (skipped numbers), Live CPU, and any Push lag. Repeat at Size 1920x320.
6. Banks: with Send on, check whether the parameter banks (the normal device parameter display) are still visible and usable.
7. Deselect and off: select another device or track; switch the track/device off; delete the device. Note whether the picture stays, disappears, or reverts to normal.
8. Drum pads: with the device in a drum-rack pad chain, select different pads. Note which selection shows the picture.
9. Two instances: add a second PushVizProbe on another track with a different Pattern; select each. Note which picture appears.
10. Tethered versus standalone: repeat steps 1 to 3 in each mode.

For each unknown, write down: slot position and size; colour order; crop/pad behaviour; frame rate and CPU; banks still visible; device-off/deselect behaviour; drum-pad selection; two instances; tethered vs standalone.

## Info View source note

Every control has Info View text written in our own words. Source: the `live.push` help patcher (Max.app `help/m4l/live.push.maxhelp`) has no screen documentation; the `jit_matrix` path is undocumented and was found by static disassembly of `live.push` (matrix needs 4 planes, char, 2 or more dimensions; Jitter ARGB is reversed to BGRA; alpha is byte 3).

## Notes for builders

- Patch: 6 `live.*` controls plus 3 unconnected spare `live.numbox` (Spare 1-3), 6 `live.comment` labels, one `v8 push-viz-probe.js`, `live.push`, `jit.pwindow`, a background panel, and `plugin~`/`plugout~`. Device 480 x 169.
- The matrix name is `probe` plus a random number per instance, so two devices do not write into the same matrix.
- The preview shows the bytes as sent; in orders other than ARGB its colours look scrambled, which is expected.
- Edit `push-viz-probe.js` and save: the v8 object reloads it (autowatch).
