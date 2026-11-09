# Push bank probe

> **Compatibility (2026-11-09):** this is verified only with a **Push 3 tethered** to the Mac, **Live 12.4.15** and **Max 9.2** (standalone 9.2.0, selected in Live's Preferences, Max). It is **not verified** on the Max 9.1.5 bundled with Live 12.4, on a standalone Push 3, or on other Live versions. See the Compatibility section of the main `README.md`.

Question: can a Max for Live device learn, from inside Live, (a) which bank page the Push 3 currently shows for the selected device, (b) whether its own device is the one shown, (c) anything else about encoder touch or the Push's view? Wanted for an overlay drawn on top of Live's Push frame that paints custom widgets over specific encoder cells, while every parameter stays a normal automatable `live.*` parameter in `live.banks`.

Status: finished on the virtual Push (2026-10-30). One short check on the real Push is still open (see the end). Follow-up (2026-10-31): a device that owns its page instead of reading it, `swap/` (section "One bank, swapped by the device"), paged from its own Push button; screen map of where a device can draw (section "Where a device can draw").

Files: `PushBankProbe.amxd`, `push-bank-probe.js` (all the logic, one v8 script), `KNOWN-LIMITATIONS.md`, `CHANGELOG.md`. `evidence/` holds the probe logs of each run and the screen captures used as ground truth. The scripts that drove the virtual Push during these runs will be published with `virtual-push/`.

## How it works

The device carries 20 dials named Probe 1 to 20, grouped by `live.banks` into Bank A (Probe 1-8), Bank B (Probe 9-16) and Bank C (Probe 17-20), rebuilt at every load. The script asks Live's object model everything it will answer: the device, its view, the song and track views, every control surface and the Push's controls. It puts an observer on every property it finds and on all 20 parameters, and writes each change to the Max console, to `probe-log.txt` beside the device and to four readout lines on the device.

Think of the Push as a reader turning pages in a book the device wrote. Live never tells the device which page is open. But the device can watch the reader's fingers (which knob is touched or turned) and which word on its pages changes. If knob 3 turns and Probe 11 moves, the open page must be the one with Probe 11 in slot 3: Bank B.

## Results

Vantage: the virtual Push (`virtual-push/` at the repository root, Live 12.4.15's own Push 3 script running in Live's Mac helper, driven through the face's bridge port), not the real Push hardware. Every row is evidence about Live's Push script; rows marked "virtual only" still need the real-Push check below.

| Question | Readable? | How | Evidence |
|---|---|---|---|
| Bank page shown on the Push | No, not directly | No property, child or function of the device, its view, the song or track view, the app view or the Push 3 control surface changes when the page changes. 19 observers stayed silent over 12 page changes in both directions (two runs). The LOM reference (Device, MaxDevice, ControlSurface pages, read 2026-10-30) lists no bank getter either. `Device.store_chosen_bank(script_index, bank_index)` (Live 12.3 and later) only writes, and calling it from the device crashed Live (next row). |
| Setting the page with `store_chosen_bank` | No: crashed Live | `this_device` `call store_chosen_bank 6 2` (6 = the Push's control-surface slot, 2 = Bank C), 4 s after load: Live 12.4.15 quit with SIGSEGV (null pointer at 0x38) on its main thread, inside `mfl_device_api_dohandlemessage` and Live's Python binding. One attempt, not repeated; the call is left in the script, unused. | `Live-2026-10-30-232058.ips` (macOS crash log), `evidence/probe-log-run10-chosen.txt` | `evidence/probe-log-run7.txt` and later runs; screens `evidence/v3-*.png` |
| Bank page, inferred | Yes, on every encoder turn (virtual only) | Observe `Track_Control_0..7` of the Push 3 control surface (`get_control_by_name`, property `value`, no grab) and the `value` of each own parameter. Encoder k and parameter p change within a few ms of each other, in either order; the bank whose slot k holds p (from `get_bank_parameters`) is the page on screen. 6 of 6 correct over B, C, A, C, B, A, each confirmed on the screen. | `evidence/v3-*.png`, `evidence/probe-log-run9-verify3.txt` lines `INFER` |
| Encoder touch | Yes (virtual only) | `Track_Control_Touch_0..7` give 127 on touch and 0 on release; `Track_Control_Touches` gives a 4-value list. Touch alone does not tell the page (no parameter moves). | `evidence/probe-log-run6.txt` |
| Our device is the one on the Push | Yes | `live_set view selected_track view` observer `selected_device` equals the device's own id (`this_device`). The Push shows Live's selected device. A takeover device on another track can pull the selection away within 20 ms. | `evidence/probe-log-run3.txt`, `evidence/probe-log-run5.txt` |
| Bank names and slots | Yes | `this_device` functions `get_bank_count`, `get_bank_name(i)`, `get_bank_parameters(i)` (parameter indices, -1 for empty slots). Live adds an empty fourth bank "Bank 4" by itself. | probe log `bank 0..3` lines |
| Parameter order | Yes | `Device.parameters` is index 0 = Device On, then the parameters sorted by name (Probe 1, Probe 10, Probe 11, ..., Probe 2, Probe 20, Probe 3, ...), so bank slots must be looked up by index, not assumed in creation order. | `get_bank_parameters` against the screen |
| Push view and mode | Partly | Push 3 control surface properties: `pad_layout` (for example `note.melodic.64_notes`), `type_name`, `control_names` (177). No property for the screen mode (device, mixer, clip), the open bank list or the selected bank. Upper and lower display buttons (`Track_State_Button0..7`, `Track_Select_Button0..7`) and `Page_Left_Button` / `Page_Right_Button`, `Device_Mode_Button` are observable as controls, so a device could follow the bank list by hand, which is fragile and was not tested. | `evidence/probe-log-run7.txt` |

Does Live hide a device's `live.push` picture on other banks? No (virtual Push, 2026-10-30): PushOrbitDemo, switched between bank 1 "Orbit" (slots 1-4 empty) and bank 2 "Run" three times each way, kept drawing and moving its orbit on both banks; on bank 2 Live draws Run and Rate over the orbit (`evidence/demo-bank1-orbit.png`, `evidence/demo-bank2-run.png`). The picture is the same on every page, so the device itself must know the page to place per-cell widgets. Agrees with the tethered note of 2026-10-29 (picture stays on both pages of PushVizProbe).

Paging on Push 3: the Page buttons (CC 62 / 63) do not change device banks. The bank list opens with the upper display button above the selected device; a lower display button picks the bank; the same upper button closes the list.

## What this means for the overlay

The overlay cannot know the page before the user touches anything. It learns the page at the first encoder turn that moves one of its own parameters, and keeps it until a page or selection change might have happened. Practical recipe: assume Bank A when the device becomes selected, correct on every encoder turn, and treat a press of the upper display button over the device (the bank list) as "page unknown until the next turn".

Fallbacks, with their cost:
1. Put every custom-drawn cell on one fixed page (Bank A, the page Push opens first). Cheap and reliable; limits custom widgets to 8 cells.
2. Add an own "Page" parameter that the overlay follows and that the user changes instead of Push's bank list. Reliable, but it adds a parameter and changes the user's workflow.
3. Read the page from inside a remote script (Push Hack's remote script approach). It would see the bank directly, but it means installing a script on the Push; excluded here and not installed.

## One bank, swapped by the device

The other way round: instead of asking which page the Push shows, the device decides it. `swap/PushPageSwap.amxd` has one Push bank and a Page button (A / B). When Page changes, the script rewrites that bank with `live.banks` (`edit 0 "Page B" 0 B1 1 B2 ... 7 B8`) and redraws its `live.push` picture for that page: page A draws a bar along the bottom of each cell, page B a bar at the left of each cell, each as long as the dial's value. Everything runs from LiveAPI observers on the device's own parameters, with no patch cords to the dials.

Think of a shop window with one frame: rather than guessing which poster a passer-by is looking at, the shopkeeper swaps the poster and the lighting together, so the light always fits the poster.

Result on the virtual Push, 2026-10-31 (`swap/evidence/`): the device's self-test set Page through the LOM four times (B, A, B, A), as a click on the device would. Each time, without any Push input, the Push showed the new page's names and values and the matching picture within a second (`swap-1-B.png`, `swap-2-A.png`), and encoder 3 then moved the dial of the page the device had chosen: B3, A3, B3, A3, 4 of 4 (`swap-log-run1.txt`, `swap-3-B-turned.png`). The device never has to guess the page.

Paging from the Push itself (2026-10-31, `swap/evidence/btn*`): `live.banks` has two lists per bank, encoders and buttons. The buttons appear in the Push's top row only while the device is focused (press the display button above the device), and button slot 0 is never shown because the device name sits there, so Page goes in button slot 1 (`new 0 Pages A1 ... A8 @buttons - Page`, then `edit 0 Pages 0 A1 ... @buttons 0 - 1 Page`). The first try used slot 0, which is why no button appeared. With the device focused the top row reads "< PushPageSwap | Page" (`btn-1-focused-page-slot1.png`); each press of the Page button swapped the encoders and the picture, and the square lights on page B (`btn4-2-B.png`). Encoder 3 then moved A3, B3, A3, B3, A3, 5 of 5 (`swap-log-run2-button.txt`).

One trap: the bank must keep the same name. When each swap renamed it ("Page A" to "Page B"), every press sent the Push to Live's empty extra bank ("Bank 2", "No parameters mapped", `btn-2-rename-jumps-to-bank2.png`). Keeping the name and re-sending the buttons on each swap works.

What it costs:
- Live still lists its empty extra bank; picking it on the Push hides the dials and the Page button.
- The Push's bank list is no longer the way to page; the device's own Page button is.

A button whose name follows the page (2026-10-31, `swap/evidence/mom-*`, `swap-log-run3-momentary.txt`): two momentary `live.text` buttons, "Bank A" and "Bank B", and the device puts the one for the current page in button slot 1 on each swap, so the Push's top row reads "Bank A" on page A and "Bank B" after a press (`mom-1-B.png`, `mom-2-A.png`). Page stays as the state parameter, off the Push. 5 presses gave 5 swaps; encoder 3 moved A3, B3, A3, B3, A3, B3, 6 of 6.

The Push does not press and release a momentary button: it toggles it, 1 on one press and 0 on the next, and draws it as a toggle square. Swapping on the press left the old button at 1 when it left the Push, so the next press on it sent 0 and was missed (every third press). The device now swaps on every change to 1 and sets the button back to 0 itself (deferred with a `Task`, since LiveAPI refuses a set inside an observer callback); the 0 it gets back, like a mouse release in Live, is ignored.

## Where a device can draw: the screen map

Question (2026-10-31): which parts of the 960 x 160 Push 3 screen does Live paint, in which layout, and does Live paint above or below the device's `live.push` picture? Answer measured on the virtual Push from the exact frames the Push receives (`swap/map/`): a capture script sets each layout through a test-only hook in `push-page-swap.js` (a command file read every 250 ms: dials, buttons, banks, picture; off by default, `LAYOUT_HOOK`), saves the frame; `map-analyze.py` lists the painted rows and per-cell boxes; `map-render.py` colours each pixel by owner (`map-*.png`). "Above" was found by sending an opaque grey picture and keeping what still shows.

Think of a stencil with two layers: Live's top and bottom rows are painted under our picture, so we can paint over them; the parameter names, values and dials are painted on top, so they always show.

All coordinates are screen pixels, x 0..959 from the left, y 0..159 from the top. Cell k (0..7) of a layout starts at about x = 121·k (Live's elements move 1 px right per cell: the first dial is at x 14-57, the eighth at x 861-904).

| Element | Where (cell k) | Layer | When |
|---|---|---|---|
| Device tabs (top row) | y 1-18 | below picture | device not focused: the track's devices, one per cell |
| Device name "< Name" | cell 0, x 15-122, y 5-17 | below picture | device focused |
| Button labels | x 16+121k to ~72+121k (text length), y 5-14 | below picture | device focused, one per `@buttons` slot 1..7 |
| Parameter name | x 14+121k, about 15-25 px wide, y 25-34 | above | slot has a parameter |
| Name fade | x 100-109 +121k, y 23-38 | above (only seen over a picture) | slot has a parameter |
| Value | x 16+121k to ~76+121k (text length), y 45-64 | above | slot has a parameter |
| Dial | x 14-57 +121k, y 75-115 | above | slot has a parameter |
| "No parameters mapped" | x 16-293, y 99-123 | above | bank with no parameter at all |
| Bank tabs (bottom row) | x 4-109 +121k, y 141-158 | below picture | device focused, one per bank |
| Track tab "1-MIDI" | cell 0, x 4-109, y 141-158 | **above** | device not focused |

Free in every layout (nothing of Live, above or below): y 0-4 when focused (y 0 when not), y 19-22, y 39-44, y 65-74, y 116-140 (a 25 px strip across the whole screen), y 159; and in each cell with a parameter, the strip right of the dial, x 58-120 +121k from y 65 to 115. An empty encoder slot is free over its whole column from y 23 to 140, even under an opaque picture (no fade, no dial track). The top and bottom rows are free wherever no tab or button sits, and coverable anywhere by an opaque picture (the labels then vanish, the buttons still work).

So the number of dials, buttons and banks shapes the canvas, as expected: three dials leave cells 4-8 free from y 23 to 140 (`map-3dials-focused.png`); one bank leaves the focused bottom row free except the first tab; no buttons leave the focused top row free except the device name. Keep at least one parameter in the bank, or Live writes "No parameters mapped" across cells 1-3 on top of the picture.

Bank count changes while the device is on screen (seen during the map runs): creating banks makes the Push jump to the newest one, and deleting the bank the Push shows freezes the Push on it (the deleted bank and its dials stay drawn, later edits do not reach the screen) until another bank is picked (`frames/c-f-d8-b0-k3.png`). Change the bank count only when the device is not shown. The extra empty "Bank 2" of the first swap runs was a real bank: `delete 1` removed it, and with one bank `getcount` answers 1.

Text: `live.push` takes pixels only, so text is drawn into the picture by the script (a bitmap font, or Max's own text rendering into the matrix); it must be lighter than black, which shows as Live's background. Not tried yet.

## Real-Push check still open

Tethered Push 3 in Control Mode, the probe device on a track and selected: open the bank list, pick Bank B, close the list, turn encoder 1; then Bank C with encoder 3, Bank A with encoder 8. The readout's fourth line must name each bank. Five minutes.
