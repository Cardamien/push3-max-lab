# Button test, 2026-10-30

Every control of the face was sent through `pushbridge` (the same path as a click on the face) to Live 12.4.15, with Live running our helper from the Live clone (`run.sh`). For each one the test recorded the LED replies on the control's own number, the other LED changes, and how much of the Push screen changed. Set: empty Untitled set, one MIDI track, scale D Hirajoshi; part of the run repeated after loading Analog on the track through the Push browser.

Result: every control reaches Live and does what the Push 3 manual describes, once it is in the right context. Two mapping errors in the face were found and fixed.

## Fixed in the face

| Control | Was | Now | Source |
|---|---|---|---|
| New | CC 87 | CC 92 | Live's helper script (`elements`: 92 on Push 3, 87 on Push 2); CC 87 has no effect |
| D-pad centre press | touch note 13 only | CC 91 press plus touch note 13; the centre dot lights from LED CC 91 | helper `nav_select_button` = 91, also in federico-pepe's Push 3 map |

## Results

| Group | Controls | Result |
|---|---|---|
| Transport | Play 85, Record 86, Metronome 9, Stop clips 29, Tap 3 | Play, Record and Metronome toggle with their LED; Stop changes the clip LEDs; one Tap press does nothing visible (expected) |
| Track | Mute 60, Solo 61, Main 28, Lock 83 | Mute and Solo toggle; Main selects the Main track; Lock held lights Mute, Solo and Stop as modifiers |
| Views | Note 50, Session pads 51, Clip 113, Mix 112, Session screen 34, Device 110 | Each lights and changes the screen or the pad layout |
| Overlays | Sets 80, Setup 30, Learn 81, Add 32, Swap 33, User 59, Scale 58, Layout 31 | Each opens its page; a second press closes it (screen back to the start) |
| Note-mode keys | Repeat 56, Accent 57, Octave up 55, Octave down 54, Page 62/63, Fixed length 90, Automate 89 | Repeat blinks and turns the scene keys into rates; Accent toggles; Octave shows "Play D2 to Ab5"; Page moves; Fixed length and Automate toggle. They need a MIDI track selected, octave and page also an instrument |
| Edit | Undo 119, New 92, Duplicate 88, Convert 35, Delete 118, Double loop 117, Quantize 116, Capture 65, Select 48, Shift 49 | Undo, New, Duplicate, Convert act on the screen; Shift shows its alternate lights; the others are modifiers or need clips, no visible change in an empty set |
| Save 82 | | Opens Live's Save dialog on the Mac in an untitled set (as with the hardware) |
| Display buttons | upper 102-109, lower 20-27 | Act where a track or device sits behind them (tracks in Mix, devices in Device view); empty slots do nothing |
| Scenes | 36-43 | Each launches its scene (LED flash) |
| D-pad | up 46, down 47, left 44, right 45, centre 91 | Left and right select tracks; up and down move the session selection and scroll browser lists; centre has no visible effect in the views tested |
| Encoders | turn 71-78, touch notes 0-7 | Turn the shown parameters (Mix volumes, Analog's filter); touch shows a highlight while held |
| Volume | turn 79, press 111, touch 8 | Touch shows the volume overlay; the press (main or cue) has no visible effect without a touch |
| Swing and Tempo | turn 14, press 15, touch 10 | Press switches between Swing and Tempo; turn changes the selected one (Global Groove Amount went 0 to 50%); touch shows the overlay |
| Jog wheel | turn 70, press 94, nudge 93/95, touch 11 | In the browser, turn moves the selection and press opens or loads (Analog loaded, no "Loading..." hang); nudge only moves the cursor in text entry, so nothing in the browser (as the manual says) |
| Touch strip, d-pad touch | notes 12, 13 | No visible change (expected in pitch-bend mode) |

## Not covered

- Clicks on the face itself (v8ui gestures): this test drives the bridge directly. The face sends the same messages.
- Shift and Select combinations, Delete and Duplicate held with another control, Learn's help texts, User mode's own port.
- Volume press with touch held, d-pad centre in lists, nudges in text entry.
- Encoder resolution: three ticks barely move a fine parameter; the Push needs several ticks per step.
