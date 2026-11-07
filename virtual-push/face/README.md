# Virtual Push 3 face

A Push 3 drawn in Max, wired to Live as if it were the real controller. Everything you see is what Live sends to a Push: the screen, the pad colours, the button lights, the blinking and pulsing. Everything you do on it reaches Live as the Push's own MIDI messages. No hardware needs to be connected.

Think of it as a glass copy of the instrument: same layout, same prints, same lights, operated with a mouse or trackpad instead of fingers.

## Reading the face

- Pads look like the Push 3's cream silicone, raised above the chassis. An unlit pad is plain cream; a lit pad glows from below in Live's colour, brightest in the middle, and a dim colour (Live's greys for empty steps or empty drum pads) gives only a faint lift, never a darker pad. Live's global LED brightness (sysex `06`) dims every light. Some layouts paint pads with free RGB colours instead of palette colours (sysex `3B`): the XYZ surface draws a glow that follows the finger and grows with pressure, repainted 8 to 17 times a second; the face shows those too.
- Display buttons (above and below the screen) show a coloured LED bar.
- Every other button has its printed name or symbol, and that print is what lights up: white, or a colour for Play, Record, Automate, Mute, Solo, Stop Clip and the scene buttons. Live's blinking and pulsing are reproduced at Live's tempo.
- Pressing a button lights its print bright white for as long as you hold it, then Live's own light state takes over. Buttons never move, as on the hardware: a latching function (Metronome, Automate, Note, Scale...) stays lit after you let go because Live keeps it lit; a momentary one (Shift, Delete, Undo...) goes dark when you release it.
- The small dark panel top right is a console: the last five things that happened (pressed, released, touched, turned, nudged, pad velocity, slide, bend, pressure), newest at the bottom and brightest.
- The screen in the middle is Live's real Push screen, 960 x 160, dimmed by Live's display brightness (sysex `08`).
- The touch strip shows Live's own 31 strip LEDs (sysex `19`), plus the face's position dot while you touch it.

## Gestures

| Control | Do this | What the Push sends |
|---|---|---|
| Button | click | press and release |
| Pad | click; height of the click sets velocity (bottom soft, top hard) | note on its own MPE channel |
| Pad, while held | drag up or down | slide (per-note CC 74), shown by a marker line; sent only with MPE on |
| Pad, while held | drag sideways, across neighbouring pads | pitch bend, an arrow grows from the pad centre in the bend direction; the console shows semitones |
| Pad, while held | press the up or down arrow key | pressure rises or falls (per-note pressure), the spot grows or shrinks; works together with slide and bend |
| Encoder | rest the pointer on it for a moment | touch (a thin ring appears); moving away releases the touch |
| Encoder | press on the rim and drag around it, press in the middle and drag up or down, or scroll | relative steps; an arc with an arrowhead shows the direction, the dents rotate. The turn mode is chosen at the press |
| Volume, Tempo | click the centre | press; the knob and its down-arrow print light. In Live each press moves to the knob's next page (Volume: Main Output, Headphone Output, Main Volume, Preview and Cue; Tempo: Tempo, Swing Amount, Global Groove Amount) |
| Volume, Tempo | hold the centre and drag around | press and turn, both shown at once |
| Jog wheel | drag around it or scroll | turn; arc, arrowhead and rotating dents |
| Jog wheel | click the centre | press; the wheel and the down-arrow print light |
| Jog wheel | hold the centre and drag around | press and turn |
| Jog wheel | click the small arrow left or right of it | nudge; the arrow lights up large |
| Session D-pad | click an arrow or the centre | the arrow lights; the centre square lights |
| Touch strip | press and drag | touch plus position; the lit span shows the offset from the centre; springs back to the centre on release (pitch-bend mode) |

## What it does not do yet

- The pitch bend across pads uses one semitone per pad width until the layout information Live sends to the pads has been captured; scale layouts with larger steps will bend too little.
- Pressure comes from the keyboard, since a mouse cannot measure force. Trackpad force sensing is not used.
- Slide and per-pad bend are sent only with MPE on. With MPE off, channel 1 is the Push's control channel (CC 74 there is encoder 4, pitch bend is the touch strip), so the face sends no per-pad expression. The Rhythm Generator sliders and the XYZ pad react to slide and bend, so they need MPE on; with it off they show nothing (whether the real Push sends pad position without MPE is unknown).
- Dragging from one pad onto the next keeps the first pad held and turns the motion into slide and bend; it never presses the pad under the pointer. One pointer means one pad at a time, so chords cannot be played.
- The mouse wheel over the face turns encoders one step per wheel event and also scrolls the Max window when the patcher has scrollbars, which shifts the face under the pointer.
- The face is one size, about 1000 pixels wide; it can be shown at half size but the console text becomes small.

## Files

`face/layout.js` (every control: position, print, MIDI identity), `face/draw.js` (the renderer shared with the HTML preview), `face/icons.js` (the icon glyphs, Lucide, ISC licence), `data/push3-palette.json` (the LED colour palette read from a Push 3). Private development tool; not for distribution.
