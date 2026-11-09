# Push Stress Test

> **Compatibility (2026-11-09):** this is verified only with a **Push 3 tethered** to the Mac, **Live 12.4.15** and **Max 9.2** (standalone 9.2.0, selected in Live's Preferences, Max). It is **not verified** on the Max 9.1.5 bundled with Live 12.4, on a standalone Push 3, or on other Live versions. See the Compatibility section of the main `README.md`.

A Max for Live audio-effect device (audio passes through untouched, 330 x 169) to find out how fast the Push 3 screen can really be fed. It is the Push Orbit Demo (`../orbit-demo/`, proven on a tethered Push 3) with a rate up to 120 fps, five scenes (four of different weight plus a still calibration map), a drop-frame counter and an on-screen readout. Status 0.1.0: measured in Max, then run in Live on a tethered Push 3 (see the frame-rate results below and `KNOWN-LIMITATIONS.md`).

Files: `PushStressTest.amxd`, `push-stress-test.js` (all the logic, one v8 script), `KNOWN-LIMITATIONS.md`, `CHANGELOG.md`.

## How it works

Think of the Push screen as a shop window and the device as a window dresser who repaints the whole window many times a second. Rate is how many repaints per second he is asked for. He has a stopwatch: he plans every repaint on a fixed beat (at 60 per second, one every 16.7 ms). If a repaint takes too long and he arrives late, he does not rush through the missed ones, he just skips them and carries on with the next beat; each skipped beat is counted as a dropped frame. The four scenes are four jobs of different difficulty. Orbit is a light job (a few glowing dots). Plasma is the heavy job: every one of the 153,600 dots of the window is recomputed every time. Strips and Sweep are not hard to paint, they are test charts: eight bars that flash on different beats, and one bright bar that jumps exactly 12 dots per repaint. If the screen shows the bars flashing out of step, or a torn bar, the screen is not keeping up with the beat. The little block of numbers in the bottom-left corner (Readout) tells you how many repaints really went out in the last second, how long one repaint took to prepare, and how many were skipped, so you can compare the numbers with what your eye sees.

## Controls

| Control | Range | Default | Notes |
|---|---|---|---|
| Run | off / on | on | off stops the clock and sends one all-zero frame |
| Rate | 1 to 120 fps (int) | 60 | the clock tolerates intervals down to 8.3 ms; overruns skip ahead and count as dropped |
| Scene | Orbit, Plasma, Strips, Sweep, Map | Plasma | changing it clears the picture and resets the counters |
| Readout | off / on | on | forced off while Scene is Map; fps sent in the last second, ms per frame built, dropped count; drawn over the picture, bottom left, 5x7 font at double size |
| Speed | 0.05 to 4 | 0.5 | Orbit: turns per second. Plasma: pattern speed (half of it). Strips/Sweep/Map: unused |
| Density | 1 to 24 | 8 | Orbit: dot count. Plasma: pattern scale. Strips/Sweep/Map: unused |
| Spread | 0 to 100 % | 40 | Orbit only |
| Glow | 0 to 100 % | 50 | Orbit: dot size and trail length. Plasma: contrast. Strips/Sweep/Map: unused |

Every control has Info View text. Banks (built at load, as in the demo): bank 1 "Scene": encoders 1 to 4 empty, 5 to 8 Speed, Density, Spread, Glow. Bank 2 "Run": encoders 1 to 4 Run, Rate, Scene, Readout.

## Scenes

- Orbit: the demo animation, left half only (x 0 to 479). Now time-based, so trails and brightness look the same at any rate.
- Plasma: full 960 x 160. Four sine terms (x, y, x+y, distance from the centre) from a 1024-entry sine table, integer maths, a contrast ramp table per colour channel, ordered 4x4 dither for Push's 5/6/5-bit colour, one accent colour (Live theme `live_lcd_control_fg`) with intensity variation, written as one 32-bit value per pixel.
- Strips: eight strips of 120 px, full height. Strip k (1 to 8) flips between white and black every k frames: strip 1 every frame, strip 8 every 8 frames.
- Sweep: an 8 px white bar, full height, moving exactly 12 px per frame (not per second), wrapping at 960 px. At 60 fps it crosses in 1.33 s. If frames are dropped it slows down instead of jumping.

- Map: a still calibration chart over the whole 960 x 160 frame, alpha 255 everywhere. 8 columns x 8 rows of cells (120 x 20 px), chequered in the accent colour at 35 % and 65 % intensity (cell c,r is the brighter one when c+r is odd), 1 px bright lines at every column boundary (x = 120 c) and row boundary (y = 20 r), a 1 px bright frame around the whole screen, white 6 px ticks at the column centres (x = 60 + 120 k) at the very top and bottom, and a small white "c,r" label (column 0 to 7, row 0 to 7, 5x7 font at 1x) at the top left of every cell. Drawn once when the scene starts and then left alone (frames keep being sent so it stays up). The Readout is forced off here, whatever the toggle says.

Black is transparent on Push, so "black" in Strips is transparent (Live's own screen shows through). The full-screen scenes cover Live's dial names on the right half.

## Measured in Max (this Mac, Max in the background, 10 s per cell, Readout on)

Average ms to prepare one frame (draw, readout, copy into the matrix; sending it to `live.push` adds 0.1 ms in Max, where no Push is attached). About 4 ms of every figure is the fixed cost of copying the 614 KB frame into the matrix and the 1 ms clock steps, so Strips and Sweep show that floor:

| Scene | ms per frame at 60 fps (range over 30/60/90/120) | dropped in 10 s at 30 / 60 / 90 / 120 fps | measured fps at 30 / 60 / 90 / 120 |
|---|---|---|---|
| Orbit | 5.2 (4.7 to 5.2) | 0 / 6 / 27 / 147 | 30.0 / 59.4 / 87.4 / 105.3 |
| Plasma | 8.5 (7.5 to 9.1) | 0 / 46 / 108 / 304 | 30.0 / 55.4 / 79.2 / 89.8 |
| Strips | 4.1 (4.0 to 4.4) | 1 / 14 / 16 / 80 | 29.9 / 58.6 / 88.3 / 112.1 |
| Sweep | 4.6 (4.1 to 4.6) | 0 / 7 / 28 / 108 | 30.0 / 59.3 / 87.2 / 109.2 |

Reading: the highest rate with zero drops in 10 s was 30 fps for every scene (Strips lost 1 frame once). From 60 fps up, drops appear even for the cheap scenes whose build time is far below the frame interval, so the limit in Max is the main-thread timer (stalls of 25 to 170 ms in the worst frame), not the drawing cost. Plasma is the only scene where cost also matters: about 8 to 9 ms against 16.7 ms available at 60 fps, and about 8 ms against 8.3 ms at 120 fps. Counts vary from run to run (a rerun of Plasma at 60 fps gave 12 and 59 drops) and depend on what else Max and the Mac are doing. Run `status` (message to the script) to post the same numbers for the current scene and rate.

## Measured on a tethered Push 3 (2026-10-31)

Frames copied from Live's Push helper at its USB library (the screen tap of the virtual Push tools, `virtual-push/usbtap/` at the repository root), Plasma scene, Live 12.4.15:

| Rate | distinct frames per second on the Push |
|---|---|
| 18 | 18.0 |
| 30 | 29.5 |
| 39 | 29.9 |
| 60 | 29.6 (device readout: 60 sent, 2.4 ms per frame) |
| 120 | 28.9 |

The link to the Push runs at a fixed 48.2 frames a second; the picture inside it is refreshed at about 30. Map chart capture: `virtual-push/tests/tap/map-bank1.png`.

## Hardware test procedure

Load: Push 3 connected to Live 12, device on an audio track, selected. Start with Readout on, bank 2 "Run" (Scene, Rate, Readout on encoders 3, 4 and 2). Test each scene at 30, 60 and 120 fps, about 20 seconds each, and write down what you see. Tethered first, then standalone if possible.

For every scene and rate, note:
1. Smoothness: even motion, or stutter and hitches. Does it get worse after a while?
2. Readout against eye: the fps in the readout against how smooth it looks, the ms value, and whether the dropped count keeps rising (steady rise = Push or Live cannot keep up; jumps = occasional stalls). Compare the readout fps with the Rate you set.
3. Lag of the dials: turn an encoder (Speed or Glow, or Rate on bank 2) and watch how long the screen and the value take to follow. Does the lag grow at 120 fps? Do the encoder values update smoothly or in steps?
4. Live CPU meter and any Push heat or fan noise.

Scene specifics:
- Orbit: smooth circling, trails without steps; the lightest load, use it as the reference.
- Plasma: smooth slow morphing, no flicker in the dither; this is the heavy case, watch the ms and dropped values most.
- Strips: eight strips, strip 1 (left) should flash every frame and strip 8 every eighth. Watch for strips flashing together out of step (frames shown late or merged), horizontal tearing (a strip half white, half black), and whole screen flicker. At 30 fps strip 1 alternates 15 times a second.
- Sweep: a bright bar moving 12 px per frame. At 60 fps it crosses in 1.3 s, at 30 fps 2.7 s, at 120 fps 0.67 s. Watch for the bar splitting in two or showing a ghost (tearing), jumps (dropped or merged frames), and whether the crossing time matches the stopwatch.

- Map: photograph the Push screen with the device selected, twice. Bank 1 "Scene" (encoders 1 to 4 are the four empty slots, 5 to 8 are the four parameters Speed, Density, Spread, Glow) and bank 2 "Run" (the four parameters Run, Rate, Scene, Readout). To get the Map on screen, set Scene to Map first (bank 2, encoder 3). In each photo note which cells and grid lines stay visible, which are covered by parameter names, values, dials and the black tabs, and where the tick marks and the frame sit relative to Live's own drawing; the cell labels give coordinates (x = 120 c + 0 to 119, y = 20 r + 0 to 19).

Then: turn Readout off and look at the pure scene; stop (Run off) and check the picture disappears; reload the set and check banks, values and that it starts by itself with Run on. Write down the highest Rate each scene keeps smooth with the dropped count staying put.

## Script facts

- Frame: 4-plane char `jit.matrix` 960 x 160 named `stress<random>` per instance, sent as `jit_matrix <name>` to `live.push`. A `Uint32Array` view on the same bytes is used for single-write pixels; the byte order assumes a little-endian CPU (Mac and Push are).
- Clock: one-shot `Task` rescheduled on an ideal time grid. A tick that is a whole interval or more late skips the missed slots (counted) and never queues a backlog.
- Readout: text built once a second; per frame the block's pixels are saved, cleared and drawn white, and put back after the frame is sent, so the scene underneath is never disturbed.
- Messages to the script: `status` (scene, rate, frames, average build ms, send ms, dropped, measured fps since the last scene/rate/run change), `reset`, `ascii` (posts the readout block as text, to check the digits without a Push), `dump <path.png>` (the PNG shows transparent pixels as white, so the white readout text is invisible there).

## Info View source note

No manual applies (original device). Info View texts are in our own words. Colour read from Live's theme name `live_lcd_control_fg`.
