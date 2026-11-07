# Changelog

## 0.1.2 - 2026-10-29
- The script sends one fully transparent frame when Send is turned off, so the last picture no longer stays on the Push screen (confirmed on hardware).
- First hardware results recorded in README and KNOWN-LIMITATIONS (tethered Push 3).

## 0.1.1 - 2026-10-29
- Added three unconnected spare parameters (Spare 1, 2, 3; int 0-127, default 0, Info View text) so the device has 9 parameters and Live splits it into two banks of 8 on Push. Placed bottom right in presentation; device size and existing controls unchanged. Not tested on Push.

## 0.1.0 - 2026-10-29
- First build: one v8 script (`push-viz-probe.js`) drives a 4-plane char JitterMatrix and sends `jit_matrix <name>` to `live.push` and a `jit.pwindow` preview.
- Controls: Send, Rate (1-30), Size (5), Pattern (8), Order (4), Alpha (0-255), all with Info View text.
- Checked in Max: script loads, `copyarraytomatrix` available, frames at the set rate, console clean. Not tested on Push.
