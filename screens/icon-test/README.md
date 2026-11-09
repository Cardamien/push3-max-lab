# PushIconTest

> **Compatibility (2026-11-09):** this is verified only with a **Push 3 tethered** to the Mac, **Live 12.4.15** and **Max 9.2** (standalone 9.2.0, selected in Live's Preferences, Max). It is **not verified** on the Max 9.1.5 bundled with Live 12.4, on a standalone Push 3, or on other Live versions. See the Compatibility section of the main `README.md`.

Test copy of `../viz-probe/PushVizProbe.amxd` (unchanged original) to check whether Push shows icons instead of dials for parameters with specific names.

## What changed (only these two controls)

| Control | Old name | New name (long and short) | Values | Expected Push icons |
|---|---|---|---|---|
| Order menu (live.menu, `OrderMenu`) | Order | `Filter Type` | ARGB, ABGR, BGRA, RGBA | filter_low_48, filter_high_48, filter_band_24, filter_notch_24 (by value index) |
| Send toggle (live.toggle, `SendToggle`) | Send | `Sync` | off, on | lfo_free, lfo_sync |

Annotation_name is set to the new names; the annotations say this is an icon-name test. Device size (480x169) and all other controls are unchanged. The device still loads `push-viz-probe.js` by that name.

## How to read the result on Push

1. Load PushIconTest on a Push 3 and open the device's parameter page.
2. Filter Type: a filter-shape icon that changes as you pick each of the four values means the name matched. A plain menu/dial means no match.
3. Sync: an LFO free/sync icon that toggles means the name matched. A plain toggle means no match.
4. Note which of the two matched, and whether the icon follows the value index as expected.

Console note: Max warns that `push-viz-probe.js` exists in two folders (this one and `../viz-probe/`). Harmless; Max uses the original's copy.
