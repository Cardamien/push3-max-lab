# Changelog

## 0.5.0 - 2026-10-31
- Added `swap/map/`: a screen map of where Live paints on the Push 3 screen, by layout (focused or not, 0-8 dials, 0-7 buttons, 1-8 banks) and by layer (above or below the device's picture), measured from the frames the virtual Push receives. Test-only layout hook in `push-page-swap.js`.
- Found: an empty encoder slot is free from y 23 to 140 even under an opaque picture; the top and bottom rows lie under the picture except the unfocused track tab; changing the bank count on screen moves or freezes the Push.

## 0.4.0 - 2026-10-31
- Added momentary buttons Bank A / Bank B (`live.text` mode 0). The one for the current page sits in Push button slot 1, so its name on the Push changes with each press; Page stays the state parameter. The device swaps on each change to 1 and resets the button to 0, because the Push toggles momentary buttons. 5 of 5 presses, 6 of 6 encoder turns on the right page (virtual Push).

## 0.3.0 - 2026-10-31
- Page moved to `live.banks` button slot 1 (`@buttons - Page`): it now shows on the Push as the second top-row button when the device is focused, and pressing it swaps the encoders and the picture (5 of 5 encoder turns on the chosen page, virtual Push).
- The bank keeps a fixed name ("Pages"); renaming it on each swap sent the Push to Live's empty extra bank. `SELF_TEST` off.

## 0.2.0 - 2026-10-31
- Added `swap/PushPageSwap.amxd`: one Push bank rewritten by the device when its Page parameter changes, with a `live.push` picture per page. On the virtual Push the Push followed every swap without input and encoder 3 moved the chosen page's dial 4 of 4 times.

## 0.1.1 - 2026-10-30
- Checked the LOM reference: no bank getter on Device, MaxDevice or ControlSurface.
- Tried `store_chosen_bank(6, 2)` from the device to set the Push page: Live crashed (SIGSEGV). The call is kept in the script but no longer made.

## 0.1.0 - 2026-10-30
- First build: 20 Probe dials in three `live.banks` banks (rebuilt at load), four readout lines, one v8 script. Info View text on every control.
- Probe: device, view, song and track views, app view, control surfaces, all 177 Push 3 controls (49 observed), all parameters.
- Result on the virtual Push: no readable bank page; the page is inferred from encoder turns (6 of 6 correct); encoder touch and device selection are observable.
