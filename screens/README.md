# Custom pictures on the Push 3 screen from a Max for Live device

> **Compatibility (2026-11-09):** this is verified only with a **Push 3 tethered** to the Mac, **Live 12.4.15** and **Max 9.2** (standalone 9.2.0, selected in Live's Preferences, Max). It is **not verified** on the Max 9.1.5 bundled with Live 12.4, on a standalone Push 3, or on other Live versions. See the Compatibility section of the main `README.md`.

A Max for Live device can draw its own graphics on the Push 3 screen, in full colour, while Live keeps drawing its usual parameter names, values, dials and banks. It has been verified only tethered (standalone Push 3 is untested), inside a normal device: no Push hack, no modified Live files, no firmware change.

The route uses the stock `live.push` object with a message that is not in its reference page, so it is undocumented and could change in any Live or Push update. Measurements below were made on a Push 3 tethered to Live 12.4.15 on a Mac (firmware 1.5.4), unless a line says otherwise.

## How it works

Think of the Push screen as a shop window. Live already paints the labels on the glass. `live.push` has a slot behind that glass where a device can hang its own poster. The device paints a grid of coloured tiles (a Jitter matrix), hands the whole board to `live.push`, and repeats that several times a second. Live keeps its labels in front of the poster.

Recipe:

1. A Max for Live device (an audio effect is fine) containing a `[live.push]` object.
2. A `jit.matrix` with 4 planes of type `char`. 960 x 160 matches the screen. Plane order is ARGB (alpha first).
3. Fill it, then send `jit_matrix <matrix name>` to `live.push`. From a v8 script: `matrix.copyarraytomatrix(bytes)`, then `outlet(0, "jit_matrix", matrix.name)`.
4. Pace the frames yourself with a timer (`Task`). `live.push` has no rate limit; each message shows one frame.
5. When you stop, send one frame with every byte at zero (alpha 0), also when the device is deleted. Otherwise the last picture stays on the screen.

## What was verified

| Question | Result |
|---|---|
| Does the picture appear with banks and parameters? | Yes. Live's names, values and dials are always drawn on top of it. |
| Position and size | A 960 x 160 frame fills the screen from the top-left corner, pixel for pixel. A smaller frame keeps its size and sits in the top-left corner: no scaling, no centring. |
| Colours | ARGB in the matrix gives correct colours. Gradients show some banding (the display has 16-bit colour); light dithering helps. |
| Transparency | Alpha fades the whole picture. Pure black is invisible: the picture adds light over Live's background and cannot darken it. Design light on black. At alpha 255 the picture hides the labels that Live draws behind it (device name, bank tabs). |
| Frame rate | The screen shows at most about 30 new pictures a second, whatever the device sends. Measured by copying the frames sent to the real Push: 18 sent gave 18 shown; 30, 39, 60 or 120 sent gave 29 to 30 shown. Sending more than 30 only costs CPU. |
| Banks | The picture stays on every bank page. Live does not hide it per page, so a device that wants a different picture per page has to know the page itself (see `bank-probe/`). |
| Selection | Selecting another track or device and coming back restores the picture. |
| Several devices | Each instance shows only its own picture when selected. |
| Drum Rack | A device inside a pad chain shows its picture. |
| Stopping | The last frame stays until a transparent frame is sent; one transparent frame clears the screen. If a device just stops sending, the screen holds the last picture for a while and then blanks on its own. |

## Where to draw: the screen map

Live draws some things behind the picture and some in front of it. Measured from the exact frames sent to the Push (details and maps in `bank-probe/README.md`, "Where a device can draw"). Coordinates are screen pixels, x 0 to 959 from the left, y 0 to 159 from the top; the screen is 8 columns of about 121 pixels, one per encoder.

- **In front of the picture (always visible):** each parameter's name (y 25-34), value (y 45-64) and dial (y 75-115); "No parameters mapped" when the shown bank is empty; the track tab at the bottom left when the device is not focused; a small black tab at the top-right of each parameter column.
- **Behind the picture (an opaque picture covers them, the buttons still work):** the top row (device tabs, device name, button labels) and the bottom row (bank tabs).
- **Free everywhere:** the band y 116-140 across the whole screen, and every column whose encoder slot is empty, from y 23 to 140.

Practical rules:

- Put drawings where Live draws nothing in front: empty encoder columns, or a thin strip in y 116-140. Plan the bank so the columns you need are empty (in `live.banks`, write `-` for an empty slot).
- Keep at least one parameter in the shown bank, or Live writes "No parameters mapped" over the picture.
- Leave a few pixels of margin around Live's elements; long names and values take more width.
- There is no text message. Text is pixels your script draws into the matrix, lighter than black.
- A menu parameter (`live.menu`, an enum `live.numbox`) is drawn by the Push as a text list over its whole cell.

## Colours that match Live's

Live's own Push widgets use the track colour, and so should yours. Read the track's `color_index` (observe it; the user can change it on the Push) and redraw on change. The Push draws track colours from its own palette, which is brighter than the RGB Live reports through `color`: one track Live reports as 153 114 75 is drawn by the Push as about 169 115 33. A muted track is drawn grey on the Push whatever its colour.

## Banks and buttons

- A device cannot read which bank page the Push shows. Either infer it from encoder turns, or let the device own the page: one bank that the device rewrites itself (`live.banks edit 0 ...`) when its own Page button changes (`bank-probe/swap/`).
- Keep the bank name fixed when rewriting it: renaming the shown bank sends the Push to another bank.
- Don't change the bank count while the device is shown: creating a bank jumps the Push to it, deleting the shown bank freezes the Push on it.
- `live.banks` button slots appear in the Push top row only while the device is focused (press the display button above it). Slot 0 is never shown (the device name sits there): start at slot 1.
- The Push toggles a momentary `live.text` (1 on one press, 0 on the next) and draws it as a toggle square. React to each change to 1 and set the button back to 0 yourself, deferred with a `Task` (a LiveAPI `set` inside an observer callback is refused).
- Give every parameter a short name that is unique and readable on its own: the Push labels each encoder with it.
- Calling `Device.store_chosen_bank` from a device crashed Live 12.4.15. Don't.

## Icons instead of dials

The Push shows an icon per value, instead of a dial, for parameters with specific exact names. A Max device can use the generic ones: `LFO Waveform`, `Waveform`, `Filter Type`, `EQ Mode`, `Sync`, `LFO Sync`, `LFO Stereo Mode`, `Ext. In On`, `Adaptive Q`, `Side Listen`, `EQ On`. Tested on hardware with `Filter Type` and `Sync` (`icon-test/`); the others are read from Live's files, not tested. Live's icon images belong to Ableton and are not included here.

## The devices

| Folder | Device | What it does |
|---|---|---|
| `viz-probe/` | PushVizProbe | Test pictures (colour, gradient, grid, moving stripe, counter), sizes, alpha and colour order. Start here. |
| `orbit-demo/` | PushOrbitDemo | An animation of orbiting dots on the left half, four dials on the right. |
| `stress-test/` | PushStressTest | Frame-rate scenes from light to heavy, with a counter on screen. |
| `icon-test/` | PushIconTest | Parameters renamed to show Push icons instead of dials. |
| `bank-probe/` | PushBankProbe, PushPageSwap | What a device can learn about the Push's bank page, a device that owns its page, and the screen map. |

Each folder has a README with a plain-language "How it works" and a test procedure. Keep each `.js` file beside its `.amxd`, or freeze the device before moving it.
