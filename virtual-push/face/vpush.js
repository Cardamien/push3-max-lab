// Virtual Push 3 face for Max (v8ui). Draws the face with draw.js on mgraphics,
// turns pointer gestures into the Push's MIDI (sent out of the outlet as
// "/midi <bytes>" for a [udpsend] to pushbridge), and lights what Live sends
// back (messages "/in <port> <bytes>" from a [udpreceive] into the inlet).
//
// Inlet messages:  /in p b1 b2 ...   /bpm f   /transport start|stop   mpe 0|1   reset
// Outlet 0:        /midi b1 b2 ...  (Live Port)      Outlet 1: console lines (symbol)
autowatch = 1;
inlets = 1; outlets = 2;
mgraphics.init(); mgraphics.relative_coords = 0; mgraphics.autofill = 0;

globalThis.ICONS = require('icons').ICONS;
const { LAYOUT: L } = require('layout');
const { drawFace, hitTest } = require('draw');

// --- palette: Live's LED colours as read from a Push 3; sysex 03 entries from Live replace them live
const palette = require('palette').PALETTE.map(e => [...e]);

// --- state shared with draw.js
const state = { leds: new Map(), pressed: new Set(), touched: new Set(), latched: new Set(), bpm: 120, clockStart: 0,
  strip: 0.5, jog: { angle: 0, arc: null, nudge: null, nudgeT: 0 }, enc: {}, padPress: {}, log: [] };
let mpe = 0;                                            // pads on their own channels (MPE) or all on channel 1; off matches the patch toggle's default
const now = () => Date.now();
const log = t => { state.log.push(t); if (state.log.length > 50) state.log.shift(); outlet(1, t); };

// --- MIDI out
const send = (...b) => outlet(0, '/midi', ...b);
const cc = (n, v, ch = 0) => send(0xB0 | ch, n, v);
const noteOn = (n, v, ch = 0) => send(0x90 | ch, n, v);
const noteOff = (n, ch = 0) => send(0x80 | ch, n, 0);
const bend = (v14, ch = 0) => send(0xE0 | ch, v14 & 127, (v14 >> 7) & 127);
const padChannel = n => mpe ? 1 + (n % 15) : 0;     // MPE lower zone: members on channels 2..16
const BEND_RANGE = 48;                                // MPE default, semitones

// --- scale between box pixels and layout units
// onresize does not fire when the patch opens, so the scale is also read from the box at load and before each paint
let scale = 1;
const syncScale = () => { try { const r = box.rect; if (r[2] > r[0]) scale = (r[2] - r[0]) / L.W; } catch (e) {} };
syncScale();
function onresize(w, h) { scale = w / L.W; mgraphics.redraw(); }
const toFrame = (x, y) => [x / scale, y / scale];

// --- mgraphics adapter for draw.js
class MG {
  save() { mgraphics.save(); } restore() { mgraphics.restore(); }
  translate(x, y) { mgraphics.translate(x, y); } scale(s) { mgraphics.scale(s, s); }
  begin() { mgraphics.new_path(); } moveTo(x, y) { mgraphics.move_to(x, y); } lineTo(x, y) { mgraphics.line_to(x, y); }
  curveTo(a, b, c, d, e, f) { mgraphics.curve_to(a, b, c, d, e, f); } close() { mgraphics.close_path(); }
  rect(x, y, w, h) { mgraphics.rectangle(x, y, w, h); }
  roundRect(x, y, w, h, r) { mgraphics.rectangle_rounded(x, y, w, h, r, r); }
  circle(cx, cy, r) { mgraphics.move_to(cx + r, cy); mgraphics.arc(cx, cy, r, 0, Math.PI * 2); }
  fill(k) { mgraphics.set_source_rgba(k[0], k[1], k[2], k[3]); mgraphics.fill(); }
  stroke(k, w) { mgraphics.set_source_rgba(k[0], k[1], k[2], k[3]); mgraphics.set_line_width(w); mgraphics.set_line_cap('round'); mgraphics.set_line_join('round'); mgraphics.stroke(); }
  text(s, x, y, size, align, weight, k) {
    mgraphics.select_font_face('Helvetica Neue', 'normal', weight === 'bold' ? 'bold' : 'normal'); mgraphics.set_font_size(size);
    const m = mgraphics.text_measure(s), tx = align === 'center' ? x - m[0] / 2 : align === 'right' ? x - m[0] : x;
    mgraphics.set_source_rgba(k[0], k[1], k[2], k[3]); mgraphics.move_to(tx, y + size * 0.36); mgraphics.show_text(s);
  }
}
const g = new MG();
// ask the bridge for the current state of every light (Live sends it only once, at connection)
const resendTask = new Task(() => outlet(0, '/resend'), this);   // kept in a variable: an unreferenced Task can be collected before it fires
resendTask.schedule(300);

// the screen: Live's frames arrive in the named jit.matrix 'vpush_screen' (jit.net.recv in the patcher) and are drawn in the slot
const screenImg = new Image();
let screenFrames = 0, lastScreenDraw = 0;
function drawScreen(gg, slot) {
  if (!screenFrames) return;
  try { screenImg.fromnamedmatrix('vpush_screen'); mgraphics.image_surface_draw(screenImg, [0, 0, 960, 160], [slot.x, slot.y, slot.w, slot.h]); } catch (e) {}
  const dim = 1 - (state.dispBright ?? 1);                                       // Live's display brightness (sysex 08)
  if (dim > 0.01) { gg.begin(); gg.rect(slot.x, slot.y, slot.w, slot.h); gg.fill([0, 0, 0, dim]); }
}
// each paint starts from a clean transform: a paint that throws leaves its save() open, and v8ui keeps that state across paints
function paint() {
  mgraphics.identity_matrix(); syncScale();
  try { drawFace(g, L, state, palette, now(), { scale, screen: drawScreen }); } catch (e) { post(`paint: ${e}\n`); }
}
function jit_matrix() { screenFrames++; const t = now(); if (t - lastScreenDraw > 40) { lastScreenDraw = t; mgraphics.redraw(); } }   // at most 25 screen redraws per second

// animation: 30 fps while anything moves (animated LEDs, arcs, nudges), otherwise only on events
const tick = new Task(() => { if (animating()) mgraphics.redraw(); }, this);
tick.interval = 33; tick.repeat();
function animating() {
  const t = now();
  for (const l of state.leds.values()) if (l.ch !== 0 && l.idx !== 0) return true;
  if (state.jog.arc && t - state.jog.arc.t < 600) return true;
  if (state.jog.nudge && t - state.jog.nudgeT < 300) return true;
  for (const e of Object.values(state.enc)) if (e.arc && t - e.arc.t < 600) return true;
  return false;
}

// --- what Live sends: LEDs, palette, clock
function anything() {
  const a = arrayfromargs(messagename, arguments);
  if (messagename === '/in') { midiIn(a.slice(2)); return; }
  if (messagename === '/bpm') { state.bpm = a[1] || 120; return; }
  if (messagename === '/transport') { if (a[1] === 'start' || a[1] === 'continue') state.clockStart = now(); return; }
  if (messagename === 'mpe') { mpe = a[1] ? 1 : 0; log(`mpe ${mpe ? 'on' : 'off'}`); return; }
  if (messagename === 'reset') { state.leds.clear(); state.pressed.clear(); state.latched.clear(); mgraphics.redraw(); return; }
  if (messagename === 'resend') { outlet(0, '/resend'); return; }
}
function midiIn(b) {
  const s = b[0] & 0xF0, ch = b[0] & 0x0F;
  if (b[0] === 0xF0) {
    if (b[6] === 0x03 && b.length >= 16) { const i = b[7]; palette[i] = [b[8] | (b[9] << 7), b[10] | (b[11] << 7), b[12] | (b[13] << 7), b[14] | (b[15] << 7)]; }
    // 3B: one LED set to any RGB (XYZ surface, Rhythm Generator sliders): 3B <0x00 note | 0x10 cc> <number> <r g b, 7L7M each>
    if (b[6] === 0x3B && b.length >= 16) {
      const rgb = [b[9] | (b[10] << 7), b[11] | (b[12] << 7), b[13] | (b[14] << 7)];
      state.leds.set(`${b[7] & 0x10 ? 'cc' : 'note'}${b[8]}`, { idx: 1, ch: 0, t0: now(), rgb });
    }
    // 19: touch strip LEDs, 31 levels 0-7, two per byte (low 3 bits first); 06: LED brightness 0-127; 08: display brightness 0-255 (7L1M)
    if (b[6] === 0x19 && b.length >= 24) state.stripLeds = Array.from({ length: 31 }, (_, i) => (b[7 + (i >> 1)] >> (i & 1 ? 3 : 0)) & 7);
    if (b[6] === 0x06 && b.length >= 9) state.ledBright = b[7] / 127;
    if (b[6] === 0x08 && b.length >= 10) state.dispBright = (b[7] | (b[8] << 7)) / 255;
    mgraphics.redraw(); return;
  }
  if (s === 0x90 || s === 0x80) state.leds.set(`note${b[1]}`, { idx: s === 0x80 ? 0 : b[2], ch, t0: now() });
  else if (s === 0xB0) state.leds.set(`cc${b[1]}`, { idx: b[2], ch, t0: now() });
  mgraphics.redraw();
}

// --- gestures
let held = null, heldSub = null, jogLast = 0, jogAcc = 0, encLast = 0, encAng = 0, encAccY = 0, encStartY = 0, encAround = false, padLogT = 0;
const DETENT = Math.PI / 12, ENC_DETENT = 8;
const keyOf = c => c.midi.cc !== undefined ? `cc${c.midi.cc}` : `note${c.midi.note}`;

function press(c, sub) {
  switch (c.kind) {
    case 'pad': { const vel = Math.round(1 + 126 * (1 - sub.v)), chn = padChannel(c.midi.note);
      noteOn(c.midi.note, vel, chn); state.padPress[c.id] = { p: 0, y: 1 - sub.v, bend: 0, ch: chn, slideV: -1, bendV: 0 };
      log(`pad ${c.midi.note} vel ${vel} ch ${chn + 1}`); break; }
    case 'dpad': { if (sub === 'center') noteOn(c.midi.touch, 127); cc(c.midi[sub], 127); log(`dpad ${sub} pressed`); break; }
    case 'disp': case 'scene': case 'btn': cc(c.midi.cc, 127); log(`${c.id} pressed`); break;
  }
}
function release(c, sub) {
  switch (c.kind) {
    case 'pad': { const P = state.padPress[c.id]; noteOff(c.midi.note, P?.ch ?? 0); if (mpe && P?.bendV) bend(8192, P.ch); delete state.padPress[c.id]; log(`pad ${c.midi.note} off`); break; }
    case 'dpad': { cc(c.midi[sub], 0); if (sub === 'center') noteOn(c.midi.touch, 0); log(`dpad ${sub} released`); break; }
    case 'disp': case 'scene': case 'btn': cc(c.midi.cc, 0); log(`${c.id} released`); break;
  }
}
function turn(c, steps) {
  const v = steps > 0 ? Math.min(63, steps) : 128 + Math.max(-64, steps);          // relative: 1..63 right, 127.. left
  cc(c.midi.cc, v);
  const dir = Math.sign(steps), t = now();
  if (c.kind === 'jog') { const J = state.jog; J.angle += steps * DETENT;
    if (J.arc && J.arc.dir === dir && t - J.arc.t < 500) J.arc.deg += Math.abs(steps) * 15; else J.arc = { dir, deg: Math.abs(steps) * 15, t }; J.arc.t = t;
    log(`jog ${state.pressed.has('jog:press') ? 'press+turn ' : ''}${steps > 0 ? '+' : ''}${steps}`);
  } else { const E = state.enc[c.id] ??= { angle: 0, arc: null }; E.angle += steps * Math.PI / 8;
    if (E.arc && E.arc.dir === dir && t - E.arc.t < 500) E.arc.deg += Math.abs(steps) * 22.5; else E.arc = { dir, deg: Math.abs(steps) * 22.5, t }; E.arc.t = t;
    log(`${c.id} ${state.pressed.has(`${c.id}:press`) ? 'press+turn ' : ''}${steps > 0 ? '+' : ''}${steps}`);
  }
}
function touch(c, on) {
  if (c.midi.touch === undefined) return;
  if (on) { if (state.touched.has(c.id)) return; state.touched.add(c.id); noteOn(c.midi.touch, 127); log(`${c.id} touched`); }
  else { if (!state.touched.has(c.id)) return; state.touched.delete(c.id); noteOn(c.midi.touch, 0); log(`${c.id} released`); }
}

// v8ui sends the press to onclick, then moves and the release to ondrag; both paths share pointerDown
let lastDownT = 0;
function onclick(x, y, pressedBtn, a3, a4, a5, a6, a7, ev) { pointerDown(x, y, ev); }
function pointerDown(x, y, ev) {
  if (now() - lastDownT < 30) return;                  // one press, even if both handlers report it
  lastDownT = now();
  const [fx, fy] = toFrame(x, y);
  {
    const h = hitTest(L, fx, fy); if (!h) return; const c = h.control; held = c; heldSub = h.sub;
    if (c.kind === 'jog' || c.kind === 'enc') { hoverId = c.id; dwell.cancel(); }   // a press also touches: let the hover tracker release it when the pointer leaves
    if (c.kind === 'jog') { touch(c, true); jogLast = h.angle; jogAcc = 0;
      if (h.sub === 'press') { state.pressed.add('jog:press'); cc(c.midi.press, 127); log('jog pressed'); }
      else if (h.sub === 'left' || h.sub === 'right') { const n = h.sub === 'left' ? c.midi.left : c.midi.right; cc(n, 127); state.jog.nudge = h.sub; state.jog.nudgeT = now(); log(`jog nudge ${h.sub}`); }
    } else if (c.kind === 'enc') { touch(c, true); encStartY = fy; encAccY = 0; encLast = Math.atan2(fy - (c.y + c.h / 2), fx - (c.x + c.w / 2)); encAng = 0;
      encAround = Math.hypot(fx - (c.x + c.w / 2), fy - (c.y + c.h / 2)) > c.w * 0.3 ? true : h.sub === 'press' ? null : false;
      // rim press: turn by angle; centre press: turn by dragging up and down; centre press on Volume/Tempo: angle once the pointer leaves the centre (press and turn)
      if (h.sub === 'press') { state.pressed.add(`${c.id}:press`); cc(c.midi.press, 127); log(`${c.id} pressed`); }
    } else if (c.kind === 'strip') { state.touched.add('strip'); noteOn(c.midi.touch, 127); stripTo(c, fy); }
    else if (c.id === 'shift' && (ev?.shiftKey || state.latched.has('shift'))) {      // Shift-click on Shift latches it
      if (state.latched.has('shift')) { state.latched.delete('shift'); state.pressed.delete('shift'); cc(49, 0); log('shift unlatched'); }
      else { state.latched.add('shift'); state.pressed.add('shift'); cc(49, 127); log('shift latched'); }
      held = null;
    } else { state.pressed.add(c.kind === 'dpad' ? `dpad:${h.sub}` : c.id); press(c, c.kind === 'pad' ? h : h.sub); }
    mgraphics.redraw();
  }
}
function ondrag(x, y, pressedBtn, a3, a4, a5, a6, a7, ev) {
  const [fx, fy] = toFrame(x, y), type = ev?.eventType;
  if (type === 'pointerdown') { pointerDown(x, y, ev); return; }
  if (!held) return;
  const c = held;
  if (type === 'pointermove') {
    if (c.kind === 'jog' && (heldSub === 'turn' || heldSub === 'press')) {
      const a = Math.atan2(fy - (c.y + c.h / 2), fx - (c.x + c.w / 2)); let d = a - jogLast; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; jogLast = a; jogAcc += d;
      const st = Math.trunc(jogAcc / DETENT); if (st) { jogAcc -= st * DETENT; turn(c, st); }
    } else if (c.kind === 'enc') {
      const ecx = c.x + c.w / 2, ecy = c.y + c.h / 2;
      if (encAround ?? Math.hypot(fx - ecx, fy - ecy) > c.w * 0.3) { const a = Math.atan2(fy - ecy, fx - ecx); let d = a - encLast; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; encLast = a; encAng += d;
        const st = Math.trunc(encAng / (Math.PI / 8)); if (st) { encAng -= st * Math.PI / 8; turn(c, st); } }
      else { encAccY += encStartY - fy; const st = Math.trunc(encAccY / ENC_DETENT); if (st) { encAccY -= st * ENC_DETENT; turn(c, st); } }
      encStartY = fy;
    } else if (c.kind === 'strip') stripTo(c, fy);
    else if (c.kind === 'pad') padMove(c, fx, fy);
    mgraphics.redraw(); return;
  }
  if (type === 'pointerup') {
    if (c.kind === 'jog') { if (heldSub === 'press') { state.pressed.delete('jog:press'); cc(c.midi.press, 0); log('jog released'); }
      else if (heldSub === 'left' || heldSub === 'right') cc(heldSub === 'left' ? c.midi.left : c.midi.right, 0); }
    else if (c.kind === 'enc') { if (state.pressed.has(`${c.id}:press`)) { state.pressed.delete(`${c.id}:press`); cc(c.midi.press, 0); log(`${c.id} released`); } }
    else if (c.kind === 'strip') { state.touched.delete('strip'); noteOn(c.midi.touch, 0); state.strip = 0.5; bend(8192); log('strip released'); }
    else if (c.id === 'shift' && state.latched.has('shift')) { /* stays latched */ }
    else { state.pressed.delete(c.kind === 'dpad' ? `dpad:${heldSub}` : c.id); release(c, heldSub); }
    held = null; mgraphics.redraw();
  }
}
function stripTo(c, fy) { state.strip = Math.min(1, Math.max(0, 1 - (fy - c.y) / c.h)); bend(Math.round(state.strip * 16383)); }
function padMove(c, fx, fy) {
  const P = state.padPress[c.id]; if (!P) return;
  P.y = Math.min(1, Math.max(0, 1 - (fy - c.y) / c.h));
  // slide and per-pad bend exist only in MPE: without it channel 1 is the Push's control channel, where CC 74 is encoder 4 and bend is the touch strip
  const sv = Math.round(P.y * 127); if (sv !== P.slideV) { P.slideV = sv; if (mpe) cc(74, sv, P.ch); }                          // MPE slide
  let b = (fx - (c.x + c.w / 2)) / 153.3; if (Math.abs(b) < 0.15) b = 0; P.bend = b;                                          // MPE pitch bend, one semitone per pad step for now
  const bv = Math.round(8192 + Math.max(-1, Math.min(1, b / BEND_RANGE)) * 8191); if (bv !== P.bendV) { P.bendV = bv; if (mpe) bend(bv, P.ch); }
  if (now() - padLogT > 150) { padLogT = now(); log(`pad ${c.midi.note} slide ${sv}${b ? ' bend ' + (b > 0 ? '+' : '') + b.toFixed(2) + ' st' : ''} pressure ${Math.round(P.p * 127)}`); }
}
// pressure (MPE Z): arrow keys while a pad is held (keys auto-repeat). Max reports up/down arrows as -9/-10 (second argument 30/31)
function onkeydown(keyCode, keyChar) {
  if (held?.kind !== 'pad') return; const P = state.padPress[held.id]; if (!P) return;
  const up = keyCode === -9 || keyChar === 30, down = keyCode === -10 || keyChar === 31;
  if (up || down) {
    P.p = Math.min(1, Math.max(0, P.p + (up ? 0.06 : -0.06)));
    send(0xD0 | P.ch, Math.round(P.p * 127)); log(`pad ${held.midi.note} pressure ${Math.round(P.p * 127)}`); mgraphics.redraw();
  }
}
// touch by dwell: the pointer resting over an encoder or the jog wheel for 150 ms
let hoverId = null; const dwell = new Task(() => { const c = L.controls.find(o => o.id === hoverId); if (c) { touch(c, true); mgraphics.redraw(); } }, this);
function onidle(x, y) {
  if (held) return; const [fx, fy] = toFrame(x, y); const h = hitTest(L, fx, fy);
  const id = h && (h.control.kind === 'enc' || h.control.kind === 'jog') ? h.control.id : null;
  if (id === hoverId) return;
  if (hoverId) { const c = L.controls.find(o => o.id === hoverId); if (c) touch(c, false); }
  dwell.cancel(); hoverId = id; if (id) dwell.schedule(150); mgraphics.redraw();
}
function onidleout() { if (hoverId) { const c = L.controls.find(o => o.id === hoverId); if (c) touch(c, false); } dwell.cancel(); hoverId = null; mgraphics.redraw(); }
function onwheel(x, y, dx, dy) {
  const [fx, fy] = toFrame(x, y); const h = hitTest(L, fx, fy); if (!h) return;
  if (h.control.kind === 'jog') turn(h.control, Math.sign(dy || dx)); else if (h.control.kind === 'enc') turn(h.control, -Math.sign(dy || dx));
  mgraphics.redraw();
}
