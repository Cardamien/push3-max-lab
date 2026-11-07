// push-viz-probe.js - Push 3 device-screen probe. One v8 script owns everything.
//
// Wiring (the whole patch):
//   Send / Rate / Size / Pattern / Order / Alpha  -> v8 inlets 0..5 (each live.* sends its value)
//   v8 outlet 0 -> [live.push] and [jit.pwindow]   ("jit_matrix <name>")
//   v8 outlet 1 -> Send toggle ("set 0": undoes a Send restored as on at load)
//
// The script draws into a Uint8Array, copies it into a 4-plane char JitterMatrix with copyarraytomatrix, and
// sends "jit_matrix <name>" at the chosen rate. Plane order inside the matrix follows the Order menu:
// ARGB is Jitter's own order; the other three just reorder the four bytes of each pixel.

inlets = 6;
outlets = 2;
autowatch = 1;

const SIZES = [[960, 160], [480, 80], [1920, 320], [960, 320], [800, 120]];
const ORDERS = ["ARGB", "ABGR", "BGRA", "RGBA"];
// plane index of [A, R, G, B] for each order
const ORDER_MAP = [[0, 1, 2, 3], [0, 3, 2, 1], [3, 2, 1, 0], [3, 0, 1, 2]];
const PATTERNS = ["red", "green", "blue", "gradient", "grid", "corners", "bar", "counter"];
const LOAD_GUARD_MS = 500;

// 5x7 digit font: seven rows of five bits each.
const FONT = [
    ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
    ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
];

// state (defaults match the live.* initial values)
const state = { send: 0, rate: 5, size: 0, pattern: 0, order: 0, alpha: 255 };
const loadTime = Date.now();
const matrixName = `probe${Math.floor(Math.random() * 1e6)}`; // one name per instance so two devices do not share a matrix
let matrix = null;
let px = null;       // Uint8Array, w*h*4, plane order per Order menu
let width = 0;
let height = 0;
let frame = 0;
let dirty = true;    // static patterns redraw only when a setting changed
let sent = 0;

const task = new Task(() => tick());
task.interval = 1000 / state.rate;

function checkApi() {
    const t = new JitterMatrix(4, "char", 2, 2);
    const ok = typeof t.copyarraytomatrix === "function";
    post(`push-viz-probe: copyarraytomatrix ${ok ? "available" : "MISSING"}\n`);
    t.freepeer?.();
    return ok;
}
const apiOk = checkApi();

function ensureMatrix() {
    const [w, h] = SIZES[state.size];
    if (matrix === null) {
        matrix = new JitterMatrix(matrixName, 4, "char", w, h);
        post(`push-viz-probe: matrix ${matrix.name} ${w}x${h}\n`);
    } else if (w !== width || h !== height) {
        matrix.dim = [w, h];
    }
    if (w !== width || h !== height || px === null) {
        width = w;
        height = h;
        px = new Uint8Array(w * h * 4);
        dirty = true;
    }
}

// ---- drawing helpers (colour components are given as R,G,B; the Order menu decides the byte slots) ----

function fillAll(r, g, b) {
    const [ia, ir, ig, ib] = ORDER_MAP[state.order];
    const a = state.alpha;
    for (let i = 0; i < px.length; i += 4) {
        px[i + ia] = a;
        px[i + ir] = r;
        px[i + ig] = g;
        px[i + ib] = b;
    }
}

function setPx(x, y, r, g, b) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const [ia, ir, ig, ib] = ORDER_MAP[state.order];
    const i = (y * width + x) * 4;
    px[i + ia] = state.alpha;
    px[i + ir] = r;
    px[i + ig] = g;
    px[i + ib] = b;
}

function rect(x0, y0, w, h, r, g, b) {
    const x1 = Math.min(width, x0 + w);
    const y1 = Math.min(height, y0 + h);
    for (let y = Math.max(0, y0); y < y1; y++) {
        for (let x = Math.max(0, x0); x < x1; x++) setPx(x, y, r, g, b);
    }
}

function drawGradient() {
    const [ia, ir, ig, ib] = ORDER_MAP[state.order];
    const a = state.alpha;
    for (let x = 0; x < width; x++) {
        const v = Math.round((x / (width - 1)) * 255);
        for (let y = 0; y < height; y++) {
            const i = (y * width + x) * 4;
            px[i + ia] = a;
            px[i + ir] = v;
            px[i + ig] = v;
            px[i + ib] = v;
        }
    }
}

function drawGrid() {
    fillAll(16, 16, 16);
    for (let x = 0; x < width; x += 80) rect(x, 0, 1, height, 64, 64, 64);
    for (let y = 0; y < height; y += 80) rect(0, y, width, 1, 64, 64, 64);
    for (let x = 0; x < width; x += 80) {       // ticks on the top and bottom edges
        rect(x, 0, 1, 10, 255, 255, 255);
        rect(x, height - 10, 1, 10, 255, 255, 255);
    }
    for (let y = 0; y < height; y += 80) {      // ticks on the left and right edges
        rect(0, y, 10, 1, 255, 255, 255);
        rect(width - 10, y, 10, 1, 255, 255, 255);
    }
    rect(0, 0, width, 1, 255, 255, 255);        // 1 px border
    rect(0, height - 1, width, 1, 255, 255, 255);
    rect(0, 0, 1, height, 255, 255, 255);
    rect(width - 1, 0, 1, height, 255, 255, 255);
}

function drawCorners() {
    fillAll(0, 0, 0);
    rect(0, 0, 20, 20, 255, 0, 0);
    rect(width - 20, 0, 20, 20, 0, 255, 0);
    rect(0, height - 20, 20, 20, 0, 0, 255);
    rect(width - 20, height - 20, 20, 20, 255, 255, 255);
}

function drawBar() {
    fillAll(0, 0, 0);
    const barW = 8;
    const x = (frame * 16) % width;
    rect(x, 0, barW, height, 255, 255, 255);
}

function drawCounter() {
    fillAll(0, 0, 0);
    const scale = Math.max(1, Math.min(8, Math.floor((height - 8) / 7)));
    const text = String(frame);
    const pad = Math.max(2, Math.floor(scale));
    let x0 = pad * 2;
    const y0 = pad * 2;
    for (const ch of text) {
        const glyph = FONT[ch.charCodeAt(0) - 48];
        for (let row = 0; row < 7; row++) {
            for (let col = 0; col < 5; col++) {
                if (glyph[row][col] === "1") rect(x0 + col * scale, y0 + row * scale, scale, scale, 255, 255, 255);
            }
        }
        x0 += 6 * scale;
    }
}

function render() {
    switch (state.pattern) {
        case 0: if (dirty) fillAll(255, 0, 0); break;
        case 1: if (dirty) fillAll(0, 255, 0); break;
        case 2: if (dirty) fillAll(0, 0, 255); break;
        case 3: if (dirty) drawGradient(); break;
        case 4: if (dirty) drawGrid(); break;
        case 5: if (dirty) drawCorners(); break;
        case 6: drawBar(); break;
        case 7: drawCounter(); break;
    }
    dirty = false;
}

// ---- frame clock ----

function tick() {
    if (!state.send || !apiOk) return;
    ensureMatrix();
    render();
    matrix.copyarraytomatrix(px);
    outlet(0, "jit_matrix", matrix.name);
    frame++;
    sent++;
}

function startClock() {
    task.cancel();
    task.interval = 1000 / state.rate;
    task.repeat();
}

function setSend(v) {
    const on = v ? 1 : 0;
    if (on && Date.now() - loadTime < LOAD_GUARD_MS) {
        // a Send restored as on while the device loads: switch it back off, send nothing
        outlet(1, "set", 0);
        return;
    }
    state.send = on;
    if (on) {
        frame = 0;
        dirty = true;
        startClock();
    } else {
        task.cancel();
        clearFrame();
    }
}

// one fully transparent frame, so the last picture does not stay on the Push screen
function clearFrame() {
    if (!apiOk) return;
    ensureMatrix();
    px.fill(0);
    matrix.copyarraytomatrix(px);
    outlet(0, "jit_matrix", matrix.name);
    dirty = true;
}

// ---- inlet dispatch: inlet number picks the setting ----

function apply(v) {
    switch (inlet) {
        case 0: setSend(v); break;
        case 1:
            state.rate = Math.max(1, Math.min(30, Math.round(v)));
            if (state.send) startClock();
            break;
        case 2:
            state.size = Math.max(0, Math.min(SIZES.length - 1, Math.round(v)));
            dirty = true;
            break;
        case 3:
            state.pattern = Math.max(0, Math.min(PATTERNS.length - 1, Math.round(v)));
            dirty = true;
            break;
        case 4:
            state.order = Math.max(0, Math.min(ORDERS.length - 1, Math.round(v)));
            dirty = true;
            break;
        case 5:
            state.alpha = Math.max(0, Math.min(255, Math.round(v)));
            dirty = true;
            break;
    }
}

function msg_int(v) { apply(v); }
function msg_float(v) { apply(v); }

function status() {
    const [w, h] = SIZES[state.size];
    post(`push-viz-probe: send ${state.send} rate ${state.rate} size ${w}x${h} pattern ${PATTERNS[state.pattern]} order ${ORDERS[state.order]} alpha ${state.alpha} frames ${sent}\n`);
}

function notifydeleted() {
    task.cancel();
    task.freepeer?.();
    matrix?.freepeer?.();
}
