// kPlate140 Push bank. live.thisdevice bangs this at load; it asks live.banks how many banks the device already
// has (a saved device keeps the bank) and then edits bank 0 or creates it.
// Encoders 1-3: the dials (Regen, DeRez, Predelay), 4: Input; encoder 8: Wetness, where Ableton's effects put
// the mix.
inlets = 1;
outlets = 1;

const BANK = ['Plate', 'Regen', 'DeRez', 'Predelay', 'Input', '-', '-', '-', 'Wetness'];

function bang() {
	outlet(0, 'getcount');
}

// live.banks answers getcount with "count <n>"
function count(n) {
	outlet(0, [n > 0 ? 'edit' : 'new', 0, ...BANK]);
}
