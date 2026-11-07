# Known limitations

- Tested only on the virtual Push (Live 12.4.15's Push 3 script in Live's Mac helper, driven through the virtual-push bridge). The real Push 3, tethered or standalone, is not tested.
- The bank page is inferred, never read: it is known only after an encoder turn moves one of this device's parameters. A touch alone, a turn on an empty slot, or a turn while another device is shown gives nothing.
- Pairing relies on the encoder event and the parameter change arriving within 300 ms of each other; on the virtual Push they arrived 4 to 9 ms apart, in either order. Under heavy load Live's observer queue may stretch that.
- A parameter at the end of its range does not change when turned further, so that turn gives no inference.
- The script observes 49 Push controls and all parameters; that is fine for a probe but too many for a shipping device (observe only `Track_Control_0..7` and the needed parameters).
- On load the script deletes any older PushBankProbe on the same track (to keep one probe per track during tests).
- Live adds an empty fourth bank ("Bank 4") to a device whose banks are built with `live.banks`.
- `Device.store_chosen_bank(6, 2)` called from the device crashed Live 12.4.15 once (SIGSEGV, main thread, Max device API path). Not repeated; whether other arguments (another script index, Live's own Push script slot numbering) work is unknown. Do not call it from a shipping device.

## PushPageSwap (swap/)

- Tested only on the virtual Push.
- The page button sits in `live.banks` button slot 1: button slot 0 is never shown (the device name sits there in the top row), and the buttons appear only while the device is focused on the Push.
- The bank keeps one fixed name ("Pages"). Renaming the bank on each swap made the Push jump to Live's empty extra bank ("Bank 2", "No parameters mapped") whenever the bank list was open.
- Live still lists that empty extra bank; picking it on the Push hides the dials and the Page button.
- The Page Info View text saved in the .amxd still says "first button of the device's button row"; to be corrected in the next build.
- `SELF_TEST` (off) switches Page four times by itself after load; the device always logs to `swap/swap-log.txt`.
- The Push toggles momentary buttons (1, then 0 on the next press) and draws them as a toggle square; the device resets Bank A / Bank B to 0 after each swap. A mouse click on Bank A / Bank B in Live also swaps (tested only from the Push).
- Page (the state) is no longer on the Push; Bank A / Bank B is. Page can still be clicked, mapped or automated in Live.
- On load it deletes any older PushPageSwap on the same track.
- The bars sit in the bottom strip, under Live's track name in cell 1.
- `LAYOUT_HOOK` (off by default) in `push-page-swap.js`: when on, the device reads `layout-cmd.txt` beside it every 250 ms and, when it holds a new line, rewrites its bank (dials, buttons, banks) and picture mode. Test only, for the screen-map capture.
- The log files are now written beside the device (`probe-log.txt`, `swap-log.txt`), found from the device's own path; this path handling was changed for publication and has not been re-run in Live.
- The screen map (README, "Where a device can draw") is measured on the virtual Push with short parameter names (A1, B1) and values like "10.0"; longer names and values take more width. The value box can grow towards the right edge of its cell.
- Changing the bank count while the device is shown makes the Push jump to the newest bank (creating) or freeze on a deleted bank (deleting).
