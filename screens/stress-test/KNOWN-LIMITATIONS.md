# Known limitations (Push Stress Test 0.1.0)

- Run in Live on a tethered Push 3 (2026-10-31, frames read at the helper's USB, not by eye): the Push screen shows at most about 30 new pictures a second at any Rate above 30, so Rate 60 to 120 only measures the device's own clock. Tearing, dial lag and the standalone Push are not checked; the Max table in the README is Max only.
- Banks cannot be checked in plain Max (needs the parameter hub). Bank 1 "Scene" keeps four empty leading slots as in the demo (worked on hardware there); bank 2 "Run" puts Run, Rate, Scene, Readout in slots 1 to 4. Not tested in Live.
- Frame timing uses `Date.now()` (1 ms). Single frames are only accurate to 1 ms; averages over many frames are fine. The ms figure includes the copy into the matrix (about 4 ms floor in Max), not the transfer to Push.
- Dropped-frame count in Max mixes real overruns with main-thread stalls of the Task timer. Counts differ between runs and with other load on the Mac (Max was in the background and busy with unrelated windows).
- Max cannot hold 90 or 120 fps without drops on this Mac for any scene (measured 105 to 112 fps best case at a 120 setting); Push and Live may behave differently.
- The full-screen scenes (Plasma, Strips, Sweep) cover Live's dial names on the right half of the Push screen. Strips "black" is transparent, not black.
- The Readout is drawn over the scene (a 90 x 52 px block, bottom left) and hides what is under it. It shows the previous second, so it lags the eye by up to a second.
- The text is checked with the `ascii` message only; the PNG dump cannot show it (white on transparent).
- Plasma radial term is fixed in size; Density scales the other three terms only. Spread is unused outside Orbit.
- `live.push` / `jit_matrix` is undocumented and may change. The accent colour is read once at load.
- Changing Rate or Scene resets the counters and restarts the clock; changing Rate while running restarts the frame grid.
