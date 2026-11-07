# Face hand test with the mouse, 2026-10-30

The Max face (`face/VirtualPush.maxpat`, v8ui `face/vpush.js`) driven by a real mouse and keyboard, against Live 12.4.15 started by `run.sh`. Evidence: the face's console panel, the Push screen in the face, and `pushbridge`'s log, which records every message the face sends as `OUT Live Port`.

## First pass (16:20-16:31): mouse presses never reached the face

| Finding | Cause | Fix |
|---|---|---|
| No click, hold, drag or shift-click sent anything (0 events across all steps and 63 buttons) | v8ui delivers the press to `onclick` (eventType `pointerdown`) and only moves and the release to `ondrag`. The face had no `onclick`, so `held` stayed empty and every move and release was ignored. Confirmed by tracing both handlers | `onclick` and `ondrag` share one `pointerDown()`, guarded against a double press |
| A freshly opened patch showed only the top-left half of the Push | the drawing scale was set only in `onresize`, which does not fire when the patch opens | scale read from `box.rect` at load and before each paint |
| Hover touch, encoder scroll and the MPE toggle worked | | |

## Second pass (16:34-16:52), after the fixes

| Step | Expected (README) | Observed | OK |
|---|---|---|---|
| 1 Note, Session, Note | press/release, view change | CC 50/51 press and release; Session shows clip pads, Note the pad layout; buttons light | yes |
| 1 Play x2, Metronome x2 | toggle | CC 85, CC 9; Play LED and metronome LED follow | yes |
| 1 Shift, Shift-click Shift, Shift | latch, unlatch | "shift latched" holds CC 49 at 127 until the next click | yes |
| 2 encoder hover | touch ring | touch note sent, ring drawn | yes |
| 2 encoder drag on the rim | relative steps | first try: nothing (press on the drawn rim was outside the hit circle); centre press then upward drag barely turned (switched to angle mode after a few pixels) | no, fixed |
| 2 encoder drag after the fix | | rim drag clockwise +1 per step, anticlockwise -1; centre drag up +13; Live's Clip zoom follows | yes |
| 2 encoder scroll | relative steps | one step per wheel event | yes |
| 3 Volume centre click | press | CC 111; Live cycles Main Output, Headphone Output, Main Volume, Preview and Cue | yes |
| 3 Tempo centre click, press and turn | press, press+turn | CC 15 then CC 14 turns; Live cycles Tempo, Swing Amount, Global Groove Amount | yes |
| 3 touch after a press | released when the pointer leaves | stayed on (Tempo overlay stuck on screen) | no, fixed |
| 4 jog drag, centre, left and right arrows | turn, press, nudge | CC 70 turn, CC 94 press, CC 93 and 95 nudges | yes |
| 5 d-pad up, down, left, right, centre | arrows | CC 46, 47, 44, 45, 91; left and right change track | yes |
| 6 touch strip | touch plus position, springs back | touch note 12 and bend; lit span follows; back to centre on release | yes |
| 7 pads, MPE off | velocity by height, slide, bend, pressure | velocity 22 bottom, 122 top on channel 1; arrow keys gave no pressure; slide and bend were sent on channel 1 | no, fixed |
| 7 arrow keys after the fix | pressure up and down | Up raises, Down lowers channel pressure (Max reports the arrows as key codes -9 and -10, not 30/31/38/40 as the handler expected) | yes |
| 7 chord | | impossible with one pointer | limit |
| 8 MPE on, same gestures | per-pad channels | channels 8 and 9, velocity 24 and 106, slide, bend left -0.88 st, pressure | yes |
| 9 hold Layout | menu on the lower display | Loop Selector, 16 Velocities, 16 Pitches, Macro Variations, XYZ, Rhythm Generator, 64 Pads | yes |
| 9 tap Layout | cycle with notification | "Drums: 64 Pads", "Drums: Loop Selector", ... "Drums: Rhythm Generator" | yes |
| 9 Rhythm Generator sliders, MPE on | slider values | slide on the held pad changes "Rhythm Length" (16 at the top, 5 back down) | yes |
| 9 sliders, MPE off | slider values | before the fix: slide went out as CC 74 on channel 1 = encoder 4, which moved the clip's Start Offset; after the fix: nothing visible | no, fixed (limit remains) |
| 9 sequencer step pad | step | pad note sent; the step pad lights | yes |
| 10 XYZ | X/Y/Z values | no values on screen with MPE off or on; with MPE on, bend changed Macro 1 (127 in Device view) | partly |
| Buttons | each sends its CC | 25 buttons clicked twice or once: every one sent its own CC the expected number of times; 66 button centres and all encoder rims pass the hit test offline | yes |
| Keyboard Shift alone, arrows without a held pad | (none in the README) | nothing | as designed |

## Fixes in this pass

- `vpush.js`: `onclick` plus shared `pointerDown()`; scale from `box.rect`; encoder turn mode fixed at the press (rim: angle, centre: vertical, centre of Volume/Tempo: angle once outside the centre); a press touch is handed to the hover tracker so it is released when the pointer leaves; arrow keys -9/-10; slide and per-pad bend only with MPE on; MPE flag starts off like the patch toggle.
- `draw.js`: encoder hit circle 1.24 times the knob box, so a drag can start on the rim.

## Set changes made by the test (set not saved)

- Global Groove Amount: turned to 80 %, back to 0 %. Live's window showed 62 % in a frame that may predate the test, so the original may have been 62 %.
- Tempo 113 BPM: changed to 97, restored to 113.
- Clip Start Offset: moved to 2.1.1 and -6.1.1 by the channel-1 CC 74 bug, restored to 1.1.1.
- Rhythm Generator length: set to 5 steps; original unknown.
- Drum Rack Macro 1: 127 after the XYZ drag; original unknown.
- Encoder 1 changed the clip view zoom (view only).
