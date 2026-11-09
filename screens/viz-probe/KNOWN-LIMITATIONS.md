# Known limitations

- **Max version (2026-11-09):** all results were measured on a Push 3 tethered, Live 12.4.15 and Max 9.2 (standalone 9.2.0 chosen in Live's Preferences, Max). Not verified on Live's bundled Max 9.1.5, a standalone Push 3 or other Live versions.

- Cannot be verified outside Live with a Push: `live.push` is a silent no-op elsewhere. Verified on a tethered Push 3 (2026-10-29): the picture appears at native size from the top-left of the 960x160 screen, under Live's controls and over its header; 15 and 30 fps run steadily; it survives bank paging, two instances and a Drum Rack pad chain. Not verified: the standalone Push 3 (CPU and frame rate there), navigating to another pad's device.
- The `jit_matrix <name>` message to `live.push` is undocumented (found by static disassembly, then confirmed on hardware, tethered only). Behaviour may differ between Live/Push versions.
- Black is invisible (light on black); the picture shows visible banding, probably the display's 16-bit colour (inferred). The last frame stays on screen after sending stops, so the script sends one transparent frame when Send goes off.
- Silent drops: if Live asks for a different size, `live.push` crops or zero-pads with no console message; a wrong plane count or type is likewise silent. Each message gives at most one frame; frames sent while Live is not pulling are lost.
- `live.push` has no rate limit: the script throttles with a Task (1 to 30 fps). Tethered, 30 fps at 960x160 gave Live CPU 1% on the Mac; the standalone Push's own CPU is untested.
- The preview shows the sent bytes, so it looks colour-scrambled for any Order other than ARGB.
- A Send state restored as on while the device loads is switched back off by the script (500 ms guard, via a `set 0` to the toggle); not tested inside Live.
- The device references `push-viz-probe.js` by name; keep it beside the .amxd or freeze the device before moving it.
- Matrix name is `probe<random>` per instance, not plain `probe`.
