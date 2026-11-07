// push-page-swap.js - one Push bank whose contents the device swaps itself, so the device always knows what the
// Push shows, and a live.push picture that follows the device's own Page state. One v8 script owns the logic.
//
// Wiring (the whole patch):
//   inlet 0  <- [live.thisdevice] (bang at load), "count n" from [live.banks]
//   outlet 0 -> [live.push]    ("jit_matrix <name>")
//   outlet 1 -> [live.banks]   (bank messages)
//   outlet 2 -> [live.comment] (readout: "set <text>")
//
// Parameters are read through LiveAPI observers on this_device (no patch cords): Page (live.toggle, A / B), the dials
// A1..A8, B1..B8, and the momentary buttons Bank A / Bank B (Push button slot 1; a press flips Page). Page A puts
// A1..A8 on the encoders and draws a horizontal bar under each cell; Page B puts B1..B8 there and draws a vertical bar
// at the left of each cell. The bar length is the parameter's value.

inlets = 1;
outlets = 3;

const NAME = 'push-page-swap';
const W = 960;
const H = 160;
const CELL = W / 8;
const PAGES = [
  Array.from({ length: 8 }, (_, k) => `A${k + 1}`),
  Array.from({ length: 8 }, (_, k) => `B${k + 1}`),
];
// one fixed bank name: renaming the bank while the Push shows its bank list sends the Push to Live's empty extra bank
const BANK_NAME = 'Pages';

const matrixName = `swap${Math.floor(Math.random() * 1e6)}`;
const matrix = new JitterMatrix(matrixName, 4, 'char', W, H);
const px = new Uint8Array(W * H * 4);
const keep = [];                           // observers must stay referenced
const values = new Map();                  // parameter name -> 0..1
let page = 0;
let ready = false;
let swaps = 0;
let flipPage = () => {};

let accent = [1.0, 0.68, 0.34];
try {
  const c = max.getcolor('live_lcd_control_fg');
  if (Array.isArray(c) && c.length >= 3 && c.every((v) => Number.isFinite(v))) accent = c.slice(0, 3);
} catch (e) { /* keep the fallback */ }
const [AR, AG, AB] = accent.map((v) => Math.round(v * 255));

// test only: log to a file beside the device and, when SELF_TEST is on, switch Page from the LOM four times after load
// (what a click on the device's Page button does); the virtual-Push driver reads the log to time its screen grabs
const SELF_TEST = false;
// folder of this device: in Live, patcher.filepath is the device's folder (no file name); elsewhere it ends with the file
const FP = String(this.patcher?.filepath ?? '');
const HERE = !FP ? '' : /\.[^/]*$/.test(FP) ? FP.replace(/[^/]+$/, '') : FP.replace(/\/?$/, '/');
const LOG_PATH = HERE + 'swap-log.txt';
const log = (text) => {
  post(`${NAME}: ${text}\n`);
  try {
    const f = new File(LOG_PATH, 'readwrite', 'TEXT');
    if (!f.isopen) f.open();
    if (f.isopen) { f.position = f.eof; f.writeline(`${Date.now()} ${text}`); f.close(); }
  } catch (e) { /* no file logging in this host */ }
};

const api = (path, cb = null) => new LiveAPI(cb, path);
const byId = (id, cb = null) => { const o = api('live_app', cb); o.id = id; return o; };   // valid path first, then id
const ids = (l) => [].concat(l).flatMap((x, i, a) => (x === 'id' ? [Number(a[i + 1])] : []));

// ---- picture ----

function rect(x0, y0, w, h) {
  for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y += 1) {
    let o = (y * W + Math.max(0, x0)) * 4;
    for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x += 1, o += 4) {
      px[o] = 255; px[o + 1] = AR; px[o + 2] = AG; px[o + 3] = AB;
    }
  }
}

function draw() {
  px.fill(0);
  if (pictureMode !== 1) {                 // layout-map test: 0 blank (Live's pixels only), 2 opaque grey everywhere
    if (pictureMode === 2) for (let o = 0; o < px.length; o += 4) { px[o] = 255; px[o + 1] = px[o + 2] = px[o + 3] = 96; }
    matrix.copyarraytomatrix(px);
    outlet(0, 'jit_matrix', matrix.name);
    return;
  }
  PAGES[page].forEach((name, k) => {
    const v = values.get(name) ?? 0;
    const x = k * CELL;
    if (page === 0) rect(x + 8, 148, Math.max(2, Math.round(v * (CELL - 16))), 8);          // A: bar along the bottom
    else rect(x + 4, 150 - Math.max(2, Math.round(v * 120)), 8, Math.max(2, Math.round(v * 120)));  // B: bar at the left
  });
  matrix.copyarraytomatrix(px);
  outlet(0, 'jit_matrix', matrix.name);
}

// ---- the one bank ----

// Button slot 0 stays empty: on the Push that is where the device name sits in the top row (the buttons show when the
// device is focused). Slot 1 holds the momentary button named after the current page, "Bank A" or "Bank B", so its
// name on the Push changes with each press. The bank name stays fixed (see BANK_NAME).
const bankButton = () => `Bank ${'AB'[page]}`;
function bankMessage(verb) {
  const slots = PAGES[page];
  if (verb === 'new') return ['new', 0, BANK_NAME, ...slots, '@buttons', '-', bankButton()];
  return ['edit', 0, BANK_NAME, ...slots.flatMap((s, k) => [k, s]), '@buttons', 0, '-', 1, bankButton()];
}

function setPage(p) {
  const next = p ? 1 : 0;
  if (ready && next === page) return;
  page = next;
  swaps += 1;
  outlet(1, bankMessage('edit'));
  outlet(2, 'set', `page ${'AB'[page]} (swap ${swaps}), encoders: ${PAGES[page].join(' ')}`);
  log(`page ${'AB'[page]} swap ${swaps}`);
  draw();
}

// ---- load ----

function bang() {                          // from live.thisdevice
  outlet(1, 'getcount');
}

function count(n) {                        // live.banks answers getcount with "count <n>"
  if (ready) { log(`count ${n}`); return; }   // later getcount calls come from the layout-map hook
  outlet(1, bankMessage(n > 0 ? 'edit' : 'new'));
  for (let i = n - 1; i >= 1; i -= 1) outlet(1, 'delete', i);
  const me = api('this_device');
  const armedAt = Date.now();
  let pageId = 0;
  ids(me.get('parameters')).forEach((pid) => {
    const p = byId(pid);
    const name = String(p.get('name'));
    const lo = Number(p.get('min'));
    const hi = Number(p.get('max'));
    const norm = (v) => (hi > lo ? (Number(v) - lo) / (hi - lo) : 0);
    values.set(name, norm(p.get('value')));
    if (name === 'Page') pageId = pid;
    if (name !== 'Page' && !/^Bank [AB]$/.test(name) && !/^[AB][1-8]$/.test(name)) return;
    const o = byId(pid, (args) => {
      if (args[0] !== 'value' || Date.now() - armedAt < 200) return;     // skip the callback fired when armed
      values.set(name, norm(args[1]));
      if (name === 'Page') { setPage(Number(args[1])); return; }
      if (name.startsWith('Bank')) {        // the Push toggles a momentary button (1 on one press, 0 on the next), so:
        log(`button ${name} ${Number(args[1])}`);   // swap on every 0 -> 1, then reset to 0 (that 0 is ignored, as is a
        if (Number(args[1]) > 0) flipPage(pid);     // mouse release in Live)
        return;
      }
      log(`value ${name} ${Number(args[1]).toFixed(1)}`);
      if (PAGES[page].includes(name)) draw();
    });
    o.property = 'value';
    keep.push(o);
  });
  page = values.get('Page') ? 1 : 0;
  flipPage = (buttonId) => {               // a LiveAPI set inside an observer callback is refused: defer it
    const t = new Task(() => { byId(pageId).set('value', page ? 0 : 1); byId(buttonId).set('value', 0); });
    t.schedule(0);
    keep.push(t);
  };
  ready = true;
  outlet(1, bankMessage('edit'));
  outlet(2, 'set', `page ${'AB'[page]} at load, encoders: ${PAGES[page].join(' ')}`);
  log(`ready, ${n} bank(s) found, page ${'AB'[page]}`);
  draw();
  removeOlderInstances(me);
  if (SELF_TEST) selfTest(pageId);
  if (LAYOUT_HOOK) layoutHook();
}

// ---- test only: layout-map hook ----
// A driver writes "<seq> <dials> <buttons> <banks> <picture>" to layout-cmd.txt; the device applies each new seq:
// bank 0 gets A1..A<dials> on the encoders and <buttons> parameters in button slots 1.., banks 1..<banks>-1 get B1..B8,
// picture 0 blank, 1 normal, 2 opaque grey. Used by map/map-test.py to measure where Live paints on the Push screen.
const LAYOUT_HOOK = false;   // test hook for the screen-map driver; off by default
const LAYOUT_CMD = HERE + 'layout-cmd.txt';
const BUTTON_POOL = ['Page', 'Bank A', 'Bank B', 'B1', 'B2', 'B3', 'B4'];
let pictureMode = 1;
function layoutHook() {
  let lastSeq = '';
  const t = new Task(() => {
    let line = '';
    try {
      const f = new File(LAYOUT_CMD, 'read', 'TEXT');
      if (f.isopen) { line = String(f.readline() ?? ''); f.close(); }
    } catch (e) { return; }
    const [seq, ...nums] = line.trim().split(/\s+/);
    if (!seq || seq === lastSeq || nums.length < 4) return;
    lastSeq = seq;
    const [dials, buttons, banks, picture] = nums.map(Number);
    const enc = Array.from({ length: 8 }, (_, k) => [k, k < dials ? `A${k + 1}` : '-']).flat();
    const btn = Array.from({ length: 8 }, (_, k) => [k, k >= 1 && k <= buttons ? BUTTON_POOL[k - 1] : '-']).flat();
    outlet(1, ['edit', 0, BANK_NAME, ...enc, '@buttons', ...btn]);
    for (let i = 15; i >= Math.max(1, banks); i -= 1) outlet(1, 'delete', i);
    for (let i = 1; i < banks; i += 1) outlet(1, ['new', i, `Extra ${i}`, 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8']);
    pictureMode = picture;
    draw();
    outlet(1, 'getcount');
    log(`layout ${seq} dials ${dials} buttons ${buttons} banks ${banks} picture ${picture}`);
  });
  t.interval = 250;
  t.repeat();
  keep.push(t);
}

function removeOlderInstances(me) {        // test only: keep one PushPageSwap per track when the device is re-added
  const myId = Number(me.id);
  const track = api(String(me.path).replace(/"/g, '').replace(/ devices \d+$/, ''));
  const devs = ids(track.get('devices'));
  for (let i = devs.length - 1; i >= 0; i -= 1) {
    if (devs[i] !== myId && String(byId(devs[i]).get('name')) === 'PushPageSwap') {
      track.call('delete_device', i);
      log(`deleted older instance at index ${i}`);
    }
  }
}

function selfTest(pid) {                   // Page B, A, B, A, 6 s apart, starting 4 s after load
  [1, 0, 1, 0].forEach((v, i) => {
    const t = new Task(() => { log(`selftest set Page ${v}`); byId(pid).set('value', v); });
    t.schedule(4000 + i * 6000);
    keep.push(t);
  });
}

function notifydeleted() {
  px.fill(0);
  matrix.copyarraytomatrix(px);
  outlet(0, 'jit_matrix', matrix.name);
  matrix.freepeer?.();
}
