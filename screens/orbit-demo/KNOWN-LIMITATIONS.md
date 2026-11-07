# Known limitations (Push Orbit Demo 0.1.0)

- Run on a tethered Push 3 (2026-10-29: orbit on the left, four dials on the right, as intended) and on the virtual Push (both banks keep the picture). First built and checked in Max: script loads, frames at the chosen rate, per-frame cost, status post, clear frame, console clean.
- Banks cannot be checked in plain Max. The bank messages are sent (edit/new for 2 banks, delete extras) but four empty leading slots (`-`) worked on the tethered Push. Fallback if they ever stop working: put the four dials in slots 1 to 4 via `BANKS` in the script.
- The static `parameterbanks` stored in the device file is an empty bank copied from the blueprint; the real banks are built at load by the script (needs the parameter hub, so only in Live or Push 3 standalone).
- Standalone Push 3: frame rate and CPU not measured there.
- `live.push` / `jit_matrix` is undocumented and may change.
- The accent colour is read from Live's theme with `max.getcolor`; on Push it shows as the theme's value at load, not recoloured live when the theme changes.
- Frame time uses `Date.now()` (1 ms resolution), so the average over 100 frames is accurate to roughly 0.1 ms, single frames are not.
- The PNG `dump` shows transparent pixels as white; black on the real Push screen is invisible.
- Parameter values are saved with the set; Run restored as on starts the animation 500 ms after load.
