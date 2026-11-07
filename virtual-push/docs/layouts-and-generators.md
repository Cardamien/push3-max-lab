# Push 3 layouts and generators: how they work, how to add one

Written 2026-10-30 from two sources: the virtual Push tests (`tests/shift-select-mpe-layouts-2026-10-30.md`) and a reading of the compiled Push script inside Live 12.4.15's helper (`Push3.app/Contents/Resources/python/Push2/*.pyc`, Python 3.11 bytecode). Claims marked (read) were seen in the bytecode, (tested) on the virtual Push, (inferred) are deductions. Ableton's code is only read here, never copied; any change to it stays in our private helper copy.

## The picture in one paragraph

Think of the Push as a stage and the helper's Python script as the stage manager. The pads only report where and how hard a finger is. The script decides what each pad means right now: a note, a step, a slider, a point on an XY surface. A "layout" is one of the stage manager's set changes: it hands rectangles of the 8 x 8 grid to different jobs. Notes leave for Live as MIDI; everything else (steps, sliders, XY, variations) is done by the script reaching into Live's set directly, so nothing travels as MIDI.

## How a layout is built (read)

- A layout is a mode, not a class. The script keeps one "modes" switchboard per track type (`MessengerModesComponent`); each layout is an entry added with `add_mode(name, mode, display_name, message, icon, default, alternative, ...)`.
- A mode is usually a component plus a layer: "give this component these pads", for example `matrix.submatrix[4:8, 4:8]` = the bottom-right 4 x 4.
- The lists are hard-coded in `push2.py`, per track type, gated by hardware type and licence:
  - drums and slicing: loop selector, 16 velocities, 16 pitches, macro variations, XYZ (Push 3 only), rhythm generator, 64 pads;
  - melodic: 64 notes, 64 notes + macro variations, sequencer, sequencer + 32 notes, XYZ (plus a piano layout);
  - audio tracks: macro variations, XYZ.
- The Layout button: a tap cycles the list (`cycle_mode`); holding it shows a menu on the lower display (up to 8 entries) and switches the alternative sub-layout; Shift + Layout locks it.
- The chosen layout is remembered per track with `track.set_data('push-selected-note-mode', ...)` (whether this is saved in the set is inferred).
- The script also publishes the current layout to Max for Live: `m4l_services.pad_layout`, with names like `note.drums.rhythm_generator`.

## What each layout reads and writes

| Layout | Input it uses | Output |
|---|---|---|
| 64 Notes, 32 Notes half, drum pads | note on, velocity, MPE pressure / slide / bend | MIDI to Live (tested), note translated to the layout's pitch |
| 16 Velocities | which pad | MIDI note at a fixed velocity (tested) |
| 16 Pitches | which pad | MIDI: the drum note plus a per-note pitch bend, computed by a native processor inside the helper (read, tested) |
| Sequencers, Loop Selector | step presses | clip edits through the set (no MIDI) (tested, read) |
| Expressive steps (Accent + slide) | slide on held steps | sets the velocity of the notes in those steps, `clip.apply_note_modifications` (read) |
| Macro Variations | which pad | `rack.recall_macro_variation(index)` (read) |
| XYZ | finger position and pressure over the area | writes the mapped parameters directly; axes per device in `XY_CONTROL_MAPPINGS`, per rack in the rack's view data, editable with "Edit XYZ" (read, tested) |
| Rhythm Generator | four sliders (finger position in each 4-pad column) | sets `song.rhythm_generator` properties (`steps`, `density`, `pattern_index`, `shift`), then on a pad press creates a clip if the slot is empty and calls `set_grid()`, which writes the pattern (read). The algorithm is not in Python: it is an object inside Live (inferred to be Live 12's Rhythm MIDI Generator; the layout only exists when the licence includes MIDI tools) |

Sliders and XY are not plain pad presses. The helper turns finger position into slider values with native (C++) pad processors (`xy_control`, `rhythm_generator`, `expressive_steps`, `note_to_pitch_bend`, `velocity_levels`), and it configures the hardware's pad groups by sysex for them. That is why only presses carrying slide and bend moved them on the virtual Push (tested).

## Adding a new layout or a new generator: three routes

| Route | What it takes | Works on | Limits |
|---|---|---|---|
| 1. Max for Live device | read `pad_layout`, grab the pads (the script supports grab and release of controls for M4L), light them, draw the screen with `live.push`; generate notes with the Live API (write into a clip) or as a Live 12 MIDI Generator | real Push and virtual Push, any Live install, shareable | lives beside Push's own layouts, not in the Layout menu; how `pad_layout` and pad grabbing are exposed to a device is still to be found (unknown) |
| 2. Patch the script in our helper copy | a new Python mode registered in the hard-coded lists, compiled for the helper's Python 3.11 | virtual Push, and the real tethered Push when Live runs our clone (`run.sh`) | private only; redone after every Live update; a generator that needs a new native pad processor or a new object inside Live cannot be added this way, a Python-only one can (it can write notes with the clip API, like the sequencers do) |
| 3. Inside our Max face (chosen, 2026-10-30) | our own pad logic in `vpush.js`, plus our own screen overlays drawn by the face on top of Live's screen image, in Ableton's style (see below) | virtual Push only | Live and the helper never know about it; good for prototyping how a layout should feel before building route 1 |

### Screen overlays the way Ableton does them (route 3)

What makes Push's layouts readable is what the screen does when they change (tested, see the snapshots in the test report):

- a notification: the current screen is dimmed and one line of large white text sits on it ("Drums: Rhythm Generator", "Rhythm Density: 16 of 16 Notes", "Session Overview: Locked"), with a row of small dots under it showing the position in the layout list; it clears after about a second;
- the hold-Layout menu: the lower display row is replaced by the layout names, the current one in a white box;
- mode marks on the parameters: XYZ adds X, Y and Z marks before the mapped parameter names.

The face already draws Live's screen into its screen slot (`Image.fromnamedmatrix` in `vpush.js`), so it can paint the same kinds of overlay on top of that image: dim layer, big text, dots, a menu row, marks next to parameter names. They would be visible on the face only; showing them on the real Push would need route 1 (`live.push` drawing the frame).

There is no plug-in point for layouts: no registry, no config file, no dynamic import (read). Live 12 MIDI Tools written in Max for Live (MIDI Generators and Transformations) appear in Push's browser as file types only; Push has no way to run them on a clip (read).

What a new generator would send, by route: route 1 writes notes into a clip through the Live API, or plays MIDI through its device, and draws its own screen; route 2 writes notes through the same clip calls the sequencers use (`apply_note_modifications` and friends) and shows its values with the script's messages; route 3 sends ordinary MIDI notes through the bridge.

## Open questions

- What `set_grid()` writes exactly: the selected drum pad only, replace or merge, over what length.
- How the hardware reports a press on pads grouped for the generator (the helper configures them with sysex `3B 00 <pad> <6 bytes>`); a plain note is taken as a drum pad. Resolved: the slider ranges (1-16 steps, 1-16 notes, 1-3002 variations, shift -8 to +8, sent as CC 4/5/7/8 scaled 0-120).
- Which Live API path gives a Max for Live device `pad_layout` and pad grabbing.
- The sysex that sets up the hardware's pad groups, needed if the virtual Push should emulate sliders the way the hardware does.
