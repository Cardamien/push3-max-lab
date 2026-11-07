# Changelog

## 0.2.0 - 2026-10-30
- New Scene item "Map" (index 4, after Sweep): static 960 x 160 calibration chart (8 x 8 chequered cells of 120 x 20 px in the accent colour at 35 % / 65 %, bright grid lines, bright screen frame, white 6 px ticks at x = 60 + 120 k top and bottom, white "c,r" cell labels in the 5x7 font at 1x), alpha 255, drawn once per scene start, frames keep being sent. Readout is forced off in this scene. Added "," to the font.
- Scene menu range and Info View text updated. README: Map scene and what to photograph (bank 1 "Scene", bank 2 "Run").
- Checked in Max: PNG dump of the frame decoded; frame, grid lines, ticks, chequer values and the labels 0,0 / 1,0 / 5,3 / 7,7 read back correct; no console errors or warnings. Not checked: Live, Push.

## 0.1.0 - 2026-10-30
- First build, from Push Orbit Demo: Rate 1 to 120 fps (default 60) with a skip-ahead clock that counts dropped frames, Scene menu (Orbit, Plasma default, Strips, Sweep), Readout toggle (fps sent, ms per frame, dropped, 5x7 font), banks "Scene" and "Run". Device width 330, height 169.
- Orbit made time-based (trail decay and dot energy scale with the frame time) so it looks the same at any rate.
- Checked in Max: zero drops in 10 s at 30 fps for all scenes; 60 fps and above drop 6 to 304 frames per 10 s; build cost 4 to 5 ms (Orbit, Strips, Sweep) and 7.5 to 9 ms (Plasma). No console errors or warnings from the device.
- Not checked: Live, Push, banks, lint agent pass.
