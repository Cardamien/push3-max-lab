// CornerClip Push bank. live.thisdevice bangs this at load; it asks live.banks how many banks the device
// already has (a saved device keeps the bank) and then edits bank 0 or creates it. Kept in JS because the
// parameter names contain spaces, which a typed message box would split.
// Encoders 1-4: the clipper; encoder 8: Dry/Wet, where Ableton's effects put it.
inlets = 1;
outlets = 1;

const BANK = ['Clip', 'Input', 'Pos Thr', 'Neg Thr', 'Voicing', '-', '-', '-', 'Dry/Wet'];

function bang() {
	outlet(0, 'getcount');
}

// live.banks answers getcount with "count <n>"
function count(n) {
	outlet(0, [n > 0 ? 'edit' : 'new', 0, ...BANK]);
}
