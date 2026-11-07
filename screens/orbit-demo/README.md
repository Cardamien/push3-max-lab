# Push Orbit Demo

A Max for Live audio-effect device (audio passes through untouched) that draws an animation of orbiting dots on the left half of the Push 3 screen and puts its four dials on the right half of the Push encoder row. It builds on the PushVizProbe findings (`../README.md`, `../viz-probe/`). It was later run on a tethered Push 3 and on the virtual Push (see `../bank-probe/README.md`); `KNOWN-LIMITATIONS.md` lists what is still open.

Files: `PushOrbitDemo.amxd` (device, 262 x 169), `push-orbit-demo.js` (all the logic, one v8 script), `KNOWN-LIMITATIONS.md`, `CHANGELOG.md`.

## What Push should show

- Left half of the screen (x 0 to 479): glowing dots in one warm accent colour circling a centre point along wide oval orbits, each leaving a fading trail.
- Right half (x 480 to 959): nothing drawn, so Live's own dial names and values show through there.
- Encoders, bank 1 "Orbit": encoders 1 to 4 empty, encoder 5 Speed, 6 Density, 7 Spread, 8 Glow (the right half of the row, under the empty right half of the picture).
- Encoders, bank 2 "Run": encoder 1 Run (on/off), encoder 2 Rate.

## How it works

Think of the Push screen as a shop window and this device as a lantern-keeper standing outside. Eight little lanterns walk in circles around a post. Behind each lantern the light lingers for a moment, like a sparkler written in the air, so you see glowing curves rather than single points. Four knobs change the show: Speed is how fast the lanterns walk, Density is how many there are, Spread decides whether they all walk on one road or on roads of different sizes, and Glow makes each lantern bigger and its afterglow longer. The keeper only decorates the left half of the window; the right half is left clear so you can still read Push's own knob labels. A "Run" switch sends the keeper home, and when he leaves he wipes the window clean. "Rate" is how many times per second he repaints the window: fewer times is easier on the computer, more times looks smoother.

## Controls

| Control | Range | Default | Notes |
|---|---|---|---|
| Speed | 0.05 to 4 turns per second (shown in Hz) | 0.5 | exponential dial (exponent 3), so the low end has fine control |
| Density | 1 to 24 dots (int) | 8 | |
| Spread | 0 to 100 percent | 40 | 0 = every dot on one ring; 100 = rings from small to large |
| Glow | 0 to 100 percent | 50 | dot radius 2 to 6 px and trail decay 0.75 to 0.95 per frame (0.85 at 50) |
| Run | off / on | on | off stops the clock and sends one all-zero frame |
| Rate | 5 to 30 frames per second (int) | 20 | |

Every control has Info View text (hover it in Live).

## Banks

The device keeps two Push banks, rebuilt every time it loads in Live: `live.thisdevice` bangs the script, the script asks `live.banks` for `getcount`, and on the `count` answer it sends `edit` (bank exists) or `new` (bank missing) for each bank: `Orbit - - - - Speed Density Spread Glow` and `Run Run Rate - - - - - -` (`-` is an empty slot). Banks cannot be checked in plain Max: outside Live, `live.banks` reports that it cannot get the device's parameter hub. If empty leading slots turn out not to work in Live, change the `BANKS` list at the top of the script (put the four dials in slots 1 to 4).

## Script facts

- Frame: 4-plane char `jit.matrix` 960 x 160 named `orbit<random>` per instance, sent as `jit_matrix <name>` to `live.push`. Only x 0 to 479 is written; the right half stays zero.
- Trails: a preallocated `Float32Array` (480 x 160); each frame it is multiplied by about 0.85 (not cleared). Dots are added with a soft round brush (falloff `(1 - d^2/r^2)^2`), additively. Fast dots are drawn as several sub-steps so they leave smooth arcs.
- Colour: one accent colour read from Live's theme (`live_lcd_control_fg`, fallback warm orange), brightness only varies. Light ordered 4x4 dither against 16-bit banding (steps 8/4/8 for red/green/blue); pixels under visibility are written as exact zero.
- Orbits are drawn as ovals (width 3.2 times height) so they use the 480 px wide area; change `ASPECT` for rounder orbits.
- Auto-start about 500 ms after load, only if Run is on. Clean-up on `notifydeleted`.
- Messages to the script: `status` posts the average milliseconds per frame over the last 100 frames and the measured frame rate; `dump <path.png>` writes the current frame as a PNG (for checking the picture in Max).

## Hardware test procedure

Load: Push 3 connected to Live 12, device on an audio track, selected.

1. After load, wait one second. Check: animation on the left half only, dials/names on the right half, header unaffected on the right.
2. Bank 1 "Orbit": encoders 1 to 4 empty, 5 to 8 are Speed, Density, Spread, Glow. Turn each and check the picture reacts (Speed faster/slower, Density more/fewer dots, Spread one ring to many rings, Glow bigger dots and longer trails). Note if the empty slots look as intended.
3. Bank 2 "Run": Run and Rate on encoders 1 and 2. Run off: picture disappears completely. Run on: it comes back.
4. Rate 5, 10, 20, 30: note smoothness, Live CPU and any Push lag.
5. Look for banding or odd colour steps in the trails (dither); note the colour.
6. Save the set, reload it: banks and values return, animation starts by itself with Run on.
7. Two instances on two tracks: each shows only its own picture.
8. Delete the device: the picture must disappear.
9. Tethered first, then standalone if possible.

Write down: where the picture sits, colour, empty slots work or not, CPU, banding, reload behaviour.

## Info View source note

No manual applies (original device). Info View texts are in our own words. Colour read from Live's theme name `live_lcd_control_fg` (see `aesthetics/stock-ableton/aesthetic.md`).
