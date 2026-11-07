// Virtual Push 3 face: geometry and MIDI identity of every control.
// Frame: 2000 x 1668 units, traced from Ableton's own emulator drawing
// (Push3.app/Contents/Resources/assets/Images/PushEmulator2x.png) and checked
// against a photo of the hardware. The renderer scales this frame to the box.
//
// kind: pad | disp | scene | btn | enc | jog | strip | dpad
// led : rgb | white | none      (which palette component lights the print)
// midi: {cc} or {note}, channel 0; encoders are relative CC, touch is a note.
// print: {text} and/or {icon} (name in icons.js or a primitive: play, record,
//        capture, metronome, square, dash, plus, tri-up/down/left/right, dot, M, S).

const LAYOUT = (() => {
  const W = 2000, H = 1668;
  const c = [];
  const add = (o) => { c.push(o); return o; };
  const PX = i => 390 + i * 153.3;          // 8 columns of the centre block
  const PADW = 147, PADH = 108, ROWP = 115.3;   // pads nearly touch on the hardware: 6 x 7 unit gaps (measured on a photo)

  // encoders above the screen, touch notes 0..7, relative CC 71..78
  for (let i = 0; i < 8; i++) add({ id: `enc${i + 1}`, kind: 'enc', x: PX(i) + 32, y: 78, w: 73, h: 73, led: 'none', midi: { cc: 71 + i, touch: i }, print: {} });
  // display buttons, RGB bars
  for (let i = 0; i < 8; i++) add({ id: `up${i + 1}`, kind: 'disp', x: PX(i), y: 192, w: 137, h: 66, led: 'rgb', midi: { cc: 102 + i }, print: {}, bar: 'bottom' });
  for (let i = 0; i < 8; i++) add({ id: `low${i + 1}`, kind: 'disp', x: PX(i), y: 592, w: 137, h: 64, led: 'rgb', midi: { cc: 20 + i }, print: {}, bar: 'top' });
  // the screen slot (not a control)
  const screen = { x: 388, y: 322, w: 1216, h: 202 };
  // 64 pads, note 36 bottom-left, +1 per column, +8 per row upward
  for (let r = 0; r < 8; r++) for (let col = 0; col < 8; col++)
    add({ id: `pad${92 - 8 * r + col}`, kind: 'pad', x: PX(col), y: 695 + r * ROWP, w: PADW, h: PADH, led: 'rgb', midi: { note: 92 - 8 * r + col }, print: {} });
  // scene / note repeat buttons, CC 43 (top) .. 36 (bottom)
  const rates = ['1/32t', '1/32', '1/16t', '1/16', '1/8t', '1/8', '1/4t', '1/4'];
  for (let r = 0; r < 8; r++) add({ id: `scene${r + 1}`, kind: 'scene', x: 1652, y: 710 + r * ROWP, w: 68, h: 70, led: 'rgb', midi: { cc: 43 - r }, print: { text: rates[r], icon: 'play-small' } });

  // left column
  add({ id: 'sets',  kind: 'btn', x: 40,  y: 192, w: 74, h: 66, led: 'white', midi: { cc: 80 }, print: { icon: 'file' } });
  add({ id: 'setup', kind: 'btn', x: 114, y: 192, w: 74, h: 66, led: 'white', midi: { cc: 30 }, print: { icon: 'settings' } });
  add({ id: 'learn', kind: 'btn', x: 188, y: 192, w: 74, h: 66, led: 'white', midi: { cc: 81 }, print: { icon: 'lightbulb' } });
  add({ id: 'user',  kind: 'btn', x: 262, y: 192, w: 74, h: 66, led: 'white', midi: { cc: 59 }, print: { icon: 'lock-open' } });
  add({ id: 'volume', kind: 'enc', x: 47, y: 358, w: 130, h: 130, led: 'none', midi: { cc: 79, touch: 8, press: 111 }, print: {} });
  add({ id: 'undo', kind: 'btn', x: 270, y: 318, w: 68, h: 62, led: 'white', midi: { cc: 119 }, print: { text: 'Undo' } });
  add({ id: 'save', kind: 'btn', x: 270, y: 470, w: 68, h: 64, led: 'white', midi: { cc: 82 }, print: { text: 'Save' } });
  add({ id: 'lock', kind: 'btn', x: 40,  y: 592, w: 74, h: 64, led: 'white', midi: { cc: 83 }, print: { icon: 'lock' } });
  add({ id: 'stop', kind: 'btn', x: 114, y: 592, w: 74, h: 64, led: 'rgb',   midi: { cc: 29 }, print: { icon: 'square' } });
  add({ id: 'mute', kind: 'btn', x: 188, y: 592, w: 74, h: 64, led: 'rgb',   midi: { cc: 60 }, print: { text: 'M' } });
  add({ id: 'solo', kind: 'btn', x: 262, y: 592, w: 74, h: 64, led: 'rgb',   midi: { cc: 61 }, print: { text: 'S' } });
  add({ id: 'tempo', kind: 'enc', x: 65, y: 683, w: 90, h: 90, led: 'none', midi: { cc: 14, touch: 10, press: 15 }, print: {} });
  add({ id: 'tap', kind: 'btn', x: 40, y: 817, w: 142, h: 90, led: 'white', midi: { cc: 3 }, print: { text: 'Tap\nTempo' }, align: 'left' });
  add({ id: 'metronome', kind: 'btn', x: 40, y: 912, w: 142, h: 55, led: 'white', midi: { cc: 9 }, print: { icon: 'metronome' }, align: 'left' });
  add({ id: 'quantize', kind: 'btn', x: 40, y: 972, w: 142, h: 50, led: 'white', midi: { cc: 116 }, print: { text: 'Quantize' }, align: 'left' });
  add({ id: 'fixed', kind: 'btn', x: 40, y: 1093, w: 142, h: 56, led: 'white', midi: { cc: 90 }, print: { text: 'Fixed Length' }, align: 'left' });
  add({ id: 'automate', kind: 'btn', x: 40, y: 1150, w: 142, h: 56, led: 'rgb', midi: { cc: 89 }, print: { text: 'Automate' }, align: 'left' });
  add({ id: 'new', kind: 'btn', x: 40, y: 1270, w: 142, h: 60, led: 'white', midi: { cc: 92 }, print: { text: 'New' }, align: 'left' });
  add({ id: 'capture', kind: 'btn', x: 40, y: 1333, w: 142, h: 75, led: 'white', midi: { cc: 65 }, print: { icon: 'capture' }, align: 'left' });
  add({ id: 'record', kind: 'btn', x: 40, y: 1410, w: 142, h: 78, led: 'rgb', midi: { cc: 86 }, print: { icon: 'record' }, align: 'left' });
  add({ id: 'play', kind: 'btn', x: 40, y: 1500, w: 142, h: 100, led: 'rgb', midi: { cc: 85 }, print: { icon: 'play' }, align: 'left' });
  add({ id: 'strip', kind: 'strip', x: 230, y: 695, w: 106, h: 903, led: 'none', midi: { touch: 12 }, print: {} });

  // right column
  add({ id: 'clip',    kind: 'btn', x: 1652, y: 192, w: 74, h: 66, led: 'white', midi: { cc: 113 }, print: { icon: 'repeat' } });
  add({ id: 'mix',     kind: 'btn', x: 1726, y: 192, w: 74, h: 66, led: 'white', midi: { cc: 112 }, print: { icon: 'bars' } });
  add({ id: 'session', kind: 'btn', x: 1800, y: 192, w: 74, h: 66, led: 'white', midi: { cc: 34 },  print: { icon: 'monitor-play' } });
  add({ id: 'device',  kind: 'btn', x: 1874, y: 192, w: 74, h: 66, led: 'white', midi: { cc: 110 }, print: { icon: 'align-justify' } });
  add({ id: 'add',  kind: 'btn', x: 1652, y: 318, w: 68, h: 62, led: 'white', midi: { cc: 32 }, print: { icon: 'plus' } });
  add({ id: 'swap', kind: 'btn', x: 1652, y: 470, w: 68, h: 64, led: 'white', midi: { cc: 33 }, print: { icon: 'refresh-cw' } });
  add({ id: 'jog', kind: 'jog', x: 1758, y: 323, w: 200, h: 200, led: 'none', midi: { cc: 70, press: 94, left: 93, right: 95, touch: 11 }, print: {} });
  add({ id: 'master', kind: 'btn', x: 1652, y: 592, w: 68, h: 64, led: 'white', midi: { cc: 28 }, print: { icon: 'dash' } });
  add({ id: 'dpad', kind: 'dpad', x: 1757, y: 592, w: 203, h: 203, led: 'white', midi: { up: 46, down: 47, left: 44, right: 45, center: 91, touch: 13 }, print: {} });
  add({ id: 'note',    kind: 'btn', x: 1757, y: 817, w: 100, h: 83, led: 'white', midi: { cc: 50 }, print: { icon: 'grid-3x3' } });
  add({ id: 'sessionpad', kind: 'btn', x: 1858, y: 817, w: 100, h: 83, led: 'white', midi: { cc: 51 }, print: { icon: 'bars3' } });
  add({ id: 'scale',  kind: 'btn', x: 1757, y: 900, w: 100, h: 70, led: 'white', midi: { cc: 58 }, print: { text: 'Scale' } });
  add({ id: 'layout', kind: 'btn', x: 1858, y: 900, w: 100, h: 70, led: 'white', midi: { cc: 31 }, print: { text: 'Layout' } });
  add({ id: 'repeat', kind: 'btn', x: 1757, y: 1040, w: 100, h: 100, led: 'white', midi: { cc: 56 }, print: { text: 'Repeat' } });
  add({ id: 'accent', kind: 'btn', x: 1858, y: 1040, w: 100, h: 100, led: 'white', midi: { cc: 57 }, print: { text: 'Accent' } });
  add({ id: 'dloop', kind: 'btn', x: 1757, y: 1155, w: 100, h: 78, led: 'white', midi: { cc: 117 }, print: { text: 'Double\nLoop' } });
  add({ id: 'dup',   kind: 'btn', x: 1858, y: 1155, w: 100, h: 78, led: 'white', midi: { cc: 88 },  print: { text: 'Duplicate' } });
  add({ id: 'convert', kind: 'btn', x: 1757, y: 1233, w: 100, h: 78, led: 'white', midi: { cc: 35 },  print: { text: 'Convert' } });
  add({ id: 'delete',  kind: 'btn', x: 1858, y: 1233, w: 100, h: 78, led: 'white', midi: { cc: 118 }, print: { text: 'Delete' } });
  add({ id: 'octup',   kind: 'btn', x: 1810, y: 1345, w: 100, h: 60, led: 'white', midi: { cc: 55 }, print: { text: 'Octave', icon: 'tri-up' } });
  add({ id: 'pageleft',  kind: 'btn', x: 1757, y: 1410, w: 70, h: 50, led: 'white', midi: { cc: 62 }, print: { text: 'Page', icon: 'tri-left' } });
  add({ id: 'pageright', kind: 'btn', x: 1890, y: 1410, w: 70, h: 50, led: 'white', midi: { cc: 63 }, print: { text: 'Page', icon: 'tri-right' } });
  add({ id: 'octdown', kind: 'btn', x: 1810, y: 1460, w: 100, h: 60, led: 'white', midi: { cc: 54 }, print: { text: 'Octave', icon: 'tri-down' } });
  add({ id: 'shift',  kind: 'btn', x: 1757, y: 1550, w: 100, h: 50, led: 'white', midi: { cc: 49 }, print: { text: 'Shift' } });
  add({ id: 'select', kind: 'btn', x: 1858, y: 1550, w: 100, h: 50, led: 'white', midi: { cc: 48 }, print: { text: 'Select' } });

  // group plates drawn behind button clusters (the dark rounded blocks of the chassis)
  // plates: the dark blocks of the chassis that hold several buttons, with their printed divider lines
  const plates = [
    { x: 40, y: 192, w: 296, h: 66, v: [114, 188, 262] }, { x: 1652, y: 192, w: 296, h: 66, v: [1726, 1800, 1874] },
    { x: 40, y: 592, w: 296, h: 64, v: [114, 188, 262] },
    { x: 40, y: 817, w: 142, h: 205, h2: [907, 967] }, { x: 40, y: 1093, w: 142, h: 113, h2: [1149] }, { x: 40, y: 1270, w: 142, h: 218, h2: [1330, 1408] }, { x: 40, y: 1500, w: 142, h: 100 },
    { x: 1757, y: 817, w: 201, h: 153, v: [1857], h2: [900] }, { x: 1757, y: 1040, w: 201, h: 100, v: [1857] }, { x: 1757, y: 1155, w: 201, h: 156, v: [1857], h2: [1233] },
    { x: 1757, y: 1330, w: 201, h: 200 }, { x: 1757, y: 1550, w: 201, h: 50, v: [1857] },
    { x: 1757, y: 592, w: 203, h: 203 },
  ];
  // buttons that sit on a plate are drawn flat (the plate is the key); the rest are separate keys
  const onPlate = new Set(['sets', 'setup', 'learn', 'user', 'clip', 'mix', 'session', 'device', 'lock', 'stop', 'mute', 'solo',
    'tap', 'metronome', 'quantize', 'fixed', 'automate', 'new', 'capture', 'record', 'play', 'note', 'sessionpad', 'scale', 'layout',
    'repeat', 'accent', 'dloop', 'dup', 'convert', 'delete', 'octup', 'pageleft', 'pageright', 'octdown', 'shift', 'select']);
  for (const o of c) if (onPlate.has(o.id)) o.flat = true;
  const byMidi = {};
  for (const o of c) {
    if (o.midi.cc !== undefined) byMidi[`cc${o.midi.cc}`] = o;
    if (o.midi.note !== undefined) byMidi[`note${o.midi.note}`] = o;
  }
  if (true) { for (const k of ['up', 'down', 'left', 'right', 'center']) byMidi[`cc${c.find(o => o.id === 'dpad').midi[k]}`] = c.find(o => o.id === 'dpad'); }
  const console_ = { x: 1652, y: 62, w: 306, h: 110 };
  return { W, H, controls: c, screen, plates, byMidi, console: console_ };
})();
if (typeof exports !== 'undefined') exports.LAYOUT = LAYOUT;
