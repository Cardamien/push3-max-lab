# Shift and Select, MPE, layouts: test, 2026-10-30

Driven through `pushbridge` against Live 12.4.15 running our helper from the Live clone. Set: one MIDI track with Analog (loaded from the Push browser), a recorded clip with notes, scale D Hirajoshi with In Key off. The Push screen was read from the frames the helper sends; what the helper forwards to Live was read with `midispy` (built into usbfake's libusb, on while `$USBFAKE_DIR/midispy.on` exists). Combinations come from the Push 3 manual's Control Reference and the Push Standalone 2.2 to 2.3.5 release notes.

## Shift and Select

| Combination | Context | Result on the virtual Push |
|---|---|---|
| Shift held alone | any | no screen change; the helper dims the buttons that have no Shift function |
| Undo, then Shift + Undo | Clip view | "Undo: Reverted last action", then "Redo: Re-performed last undone action" |
| Swing/Tempo encoder turn, then Shift + turn | encoder set to Swing | 5% per tick, then 1% per tick ("Global Groove Amount" overlay) |
| Volume encoder touch, Shift + turn | any | "Main Output: -38.0 dB" overlay, fine steps with Shift (this is the Push's own audio output) |
| Select + clip pad | Session pad mode | "Clip Selected: <name>", the clip does not launch, the playing clip keeps playing |
| Shift + hold a clip pad | Session pad mode | clip options page: Rename, Bounce Clip |
| Shift + Stop | clip playing | stops all clips (the pad goes from pulsing to its static colour) |
| Shift + lower display button | any | track options page: Rename, Group, Ungroup, Freeze, Bounce |
| Shift + Layout | Session pad mode | "Session Overview: Locked" |
| Select + touch strip | Note mode, MIDI track | "Touchstrip Mode: Modwheel" and back to "Pitchbend" |
| Shift + Record | Control mode | toggles Arrangement recording (Record LED changes), toggled back |
| Shift + Duplicate, Shift + d-pad centre, Shift + Automate | Session screen | messages reach the helper (LED changes); no screen message to confirm the effect |
| Shift + upper display button | Device view | no options page appeared |

Not tested: Drum Rack combinations (Select + pad, Shift + pad colour, Delete + pad, Duplicate + pad), Shift + octave or touch strip in the Melodic Sequencer, Delete + touch an encoder, Shift + encoder in Clip view.

## MPE

The Push's Setup > Expression tab, as the helper reports it: Expression Mode MPE, Note Pitch Bend Automatic, In Tune Location Finger, In Tune Width 10 mm, Slide Height 13 mm.

A held pad sent as the Push 3 does in MPE mode (note on a member channel, then channel pressure `Dn`, slide `Bn 4A` and pitch bend `En` on the same channel) reaches Live unchanged, on the same channel, with only the note number translated to the layout's pitch. Checked on channels 1 to 5, each dimension alone and all three together:

```
pad 60 ch 2: 91 35 64 | D1 00 | B1 4A 00 | E1 00 40 | D1 20 | B1 4A 20 | E1 00 48 | ... | 81 35 00
```

So pressure, slide and per-note pitch bend are passed through by the helper; turning them into sound is the instrument's job in Live (Analog has no MPE; Drift or Wavetable do). Note-mode pads also play on channel 1, which is why the face works with its MPE toggle off.

## Layouts (melodic track, Analog)

Holding Layout shows the layout menu on the lower display; pressing Layout steps through: 64 Notes, 64 Notes + Macro Variations, Sequencer, Sequencer + 32 Notes, XYZ, then back. (Pressing a lower display button while Layout is held did not select one in this test.)

| Layout | Pads | What the pads send to Live |
|---|---|---|
| 64 Notes | all 64 play notes. With In Key off: chromatic, +1 semitone per pad to the right, +5 (a fourth) per row up; bottom-left = root (D2, MIDI 38). Colours: root, in scale, out of scale (dark) | the note, translated to the layout's pitch, with MPE data |
| 64 Notes + Macro Variations | top row: the rack's macro variations (dark with a plain instrument); rows 2 to 8: notes as above | notes; the top row sends nothing to Live (the helper recalls the variation itself) |
| Sequencer | 8 x 8 = 8 steps (columns) x 8 pitches (rows); in-scale rows lit, out-of-scale rows dark, steps holding notes brighter. Press a step to add or remove a note; hold it to see Nudge, Length, Fine, Velocity, Vel Range, Chance | nothing: the helper edits the clip through the Live API |
| Sequencer + 32 Notes | top 4 rows: 32 steps; bottom 4 rows: 32 notes (fourths). Playing a note picks the pitch the steps add | bottom half: notes; top half: nothing (clip edits) |
| XYZ | top 4 rows: an XY surface for the two parameters the rack maps to X and Y ("XYZ - F1 Freq X - F1 Resonance Y" with Analog); Z is pressure. Bottom 4 rows: notes. The touched pad lights as a cursor | XY half: nothing. The helper sets the parameters directly. A plain press (no MPE data) changed nothing; with slide and bend it did: top-left pad with centred bend and half slide gave 43 Hz / 50%, full slide and bend 22.0 kHz / 100%, a press on the top-right pad 14.6 kHz / 87% |

Expressive step editing: in a sequencer layout, hold Accent and slide a finger on a step (MPE slide) to set its velocity; the screen shows "Adjust Velocity of steps". Sliding across several steps at an angle draws a ramp (release notes 2.3; needs Expression Mode MPE).

## Layouts (Drum Rack track)

A second MIDI track with the kit "01. 606 Standard ... From Mars", loaded from the Push browser (Add, MIDI Track, Drums). Holding Layout lists: Loop Selector, 16 Velocities, 16 Pitches, Macro Variations, XYZ, Rhythm Generator, 64 Pads.

Every drum layout except 64 Pads keeps the same frame: top 4 rows = 32 sequencer steps for the selected drum pad (a press adds or removes a step, nothing is sent to Live); bottom-left 4 x 4 = the drum pads (pad 36 sends note 36, +1 to the right, +4 per row up; a press also selects that drum pad). Only the bottom-right 4 x 4 changes:

| Layout | Bottom-right 4 x 4 | Sent to Live |
|---|---|---|
| Loop Selector | the clip's pages (current page and playing page lit) | nothing |
| 16 Velocities | the selected drum at 16 fixed velocities (7 at bottom-left of the block up to 127) | the selected drum's note at that velocity |
| 16 Pitches | the selected drum at 16 pitches in the set's scale | the same drum note preceded by a per-note pitch bend (`E0 00 40` = root, `E0 00 44` = a few semitones up); the drum's instrument must accept MPE pitch bend |
| Macro Variations | the rack's macro variations (dark: this kit has none stored) | nothing |
| XYZ | an XY surface for the rack's macros: X = Macro 1, Y = Macro 2, Z (pressure) = Macro 3 | nothing; with slide and bend the helper set Macro 1 to 127 and Macro 2 to 96. Needs the rack itself selected in Device view, otherwise "XYZ - No device on this track" (a drum pad chain was selected) |
| Rhythm Generator | four vertical sliders (Live's Rhythm MIDI Tool): Rhythm Length, Rhythm Density, Pattern Variation, Rhythm Shift | nothing. A press with slide shows the value ("Rhythm Length: 16 Steps", "Rhythm Density: 16 of 16 Notes", "Rhythm Shift: +2 Steps"); plain presses did nothing. No generated notes appeared in the step pads or the clip during this test, and a slider press also changed the selected drum pad: generation not confirmed |
| 64 Pads (whole grid) | all 64 pads are drums, in four 4 x 4 blocks: bottom-left 36-51, top-left 52-67, bottom-right 68-83, top-right 84-99 (each block 4 notes per row, like the Drum Rack's 16-pad pages) | each pad's drum note |

### Rhythm Generator, following the manual (second pass)

Manual workflow: select a drum pad, move the four sliders, the generated notes appear in the top-half sequencer for that pad. With the kick selected and the transport stopped:

- The sliders work when sent the way the hardware sends them, as CCs on channel 1 (from the helper's script: Steps CC 4, Density CC 5, Pattern CC 7, Shift CC 8; value scale 0-120): CC 4 = 120 "Rhythm Length: 16 Steps", CC 5 = 48 "Rhythm Density: 6 of 16 Notes", CC 7 = 64 "Pattern Variation: 1601 of 3002", CC 8 = 60 "Rhythm Shift: 0 Steps". Ranges: 1-16 steps, 1-16 notes, 1-3002 variations, shift -8 to +8.
- Writing the pattern is not reproduced. The script writes it when a generator pad is pressed (`_on_pad_pressed` then `set_grid()`). A plain note from a generator pad (note 40) was taken as a drum pad instead (it selected drum note 40, "SD 606") and nothing was written. On entering the layout the helper sends a per-pad configuration sysex `3B 00 <pad> <6 bytes>` for exactly the generator pads, so the hardware is set to report those pads differently; that format is not emulated yet.
- Third pass, from the helper's code. Entering the layout, the helper sends, for each of the 16 generator pads, a sensitivity profile (`28 <row> <col> 00`) and expression on (`33 <row> <col> 01`); the hardware still sends notes. A native processor inside the helper takes those pads' notes when they carry MPE slide and turns them into the slider values: a press with slide on a generator pad moved Density ("Rhythm Density: 12 of 16 Notes"). Without slide the note falls through and is handled as the drum pad with that number (any channel), which also changes the selected drum.
- With an empty clip slot selected (Session, Select + pad), a press with slide on two generator pads created a new 2-bar clip in that slot and launched it, matching the script's `create_clip_in_selected_slot`. The clip stayed empty (Live's clip view: 0 notes). Likely reason, not proven: the same presses also changed the selected drum to notes 64 and 65, which have no sound in this kit, so the pattern was written for an empty pad or not at all. Pressing Record while the generator was set printed nothing either.
- Fourth pass, the kit being already a Drum Rack preset (606 Standard, sounds on 36-51): sliders set by CC only (no drum selection side effect: Length 16, Density 12, Pattern low, Shift 0), then a press with slide on generator pad 40, whose number is a real sound (SD 606 Standard Vinyl 02). The snare lane was selected in Live; the clip still had 0 notes. So the selected drum is not the reason; the write step itself is not triggered by what the virtual Push sends.
- All 16 slider pads, one by one, slide up then down (MPE slide 0 to 127 to 0 within the pad): every pad of a column drives that column's full range on its own. Column 5 Length 16 / 1 steps, column 6 Density 16 of 16 / 1 of 16 notes (capped by Length: with Length 1 it reads 1 of 1), column 7 Pattern Variation 1364 of 1364 / 1 of 1364 (the count depends on Length and Density: 3002 at density 6, 1364 at 12), column 8 Shift +8 / -8 steps. The slider pads never lit to show a level, and each press also changed the selected drum. On the hardware the four pads of a column are probably one long slider (the helper sends a column grouping, `26 07 ...`), which the virtual Push does not reproduce.
- Drum step sequencer (top half): a step press wrote a note into the clip, but at the step pad's own note number (pads 92 and 96 wrote G#5 and C6) instead of the selected drum, the same mix-up as the generator pads.
- Still open: how the real Push keeps a slider press from also selecting a drum, and what `set_grid()` writes. Recording a slider press on the real Push (MIDI sniffer) would settle both.

Not tested: Macro Variations with a rack that has stored variations, Shift + Layout locks (loop length controls), Select + drum pad, Mute/Solo/Delete/Duplicate + drum pad.

## What it means for the face

- The face's pads already carry what these layouts need: vertical drag = slide, horizontal drag = pitch bend, arrow keys = pressure. XYZ and expressive step editing depend on slide and bend, so they work from the face, not from plain clicks.
- The Push reports MPE mode. The face's MPE toggle (member channels 2 to 16) matches the hardware; with it off, pads still play because the helper also accepts channel 1.
