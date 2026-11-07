// push-orbit-demo.js - orbiting dots on the left half of the Push 3 screen. One v8 script owns everything.
//
// Wiring (the whole patch):
//   inlet 0 Run, 1 Rate, 2 Speed, 3 Density, 4 Spread, 5 Glow   <- the six live.* controls (each sends its value)
//   inlet 6 (bang from live.thisdevice, "count n" from live.banks, "status", "dump <path>")
//   outlet 0 -> [live.push]   ("jit_matrix <name>")
//   outlet 1 -> [live.banks]  (bank messages, built at load)
//
// Frame: 4-plane char JitterMatrix 960x160 (Jitter order A,R,G,B). Only x 0..479 is ever written; x 480..959 stays
// all zero so Live's dials show through on the right half of the Push screen. Black is invisible on Push, so the
// picture is light on black. Trails live in a Float32Array (480x160); each frame the buffer is multiplied by a decay
// of about 0.85 instead of cleared, dots are added with a soft round brush, and the result is converted to bytes with
// a light ordered 4x4 dither (Push shows 16-bit colour).

inlets = 7;
outlets = 2;
autowatch = 1;

const NAME = "push-orbit-demo";
const W = 960;                 // full Push 3 screen
const H = 160;
const AW = 480;                // animation area: left half
const CX = AW / 2;             // centre of the left area
const CY = H / 2;
const MARGIN = 6;              // thin margin around the animation
const ASPECT = 3.2;            // orbits are drawn as wide ellipses so they fill the 480x160 area
const R_MAX = (H / 2) - MARGIN - 6;   // largest orbit "radius" in y pixels (leaves room for the dot brush)
const R_MIN = 10;
const LOAD_GUARD_MS = 500;
const STAT_WINDOW = 100;
const BANK_COUNT = 2;
const BANKS = [
    ["Orbit", "-", "-", "-", "-", "Speed", "Density", "Spread", "Glow"],
    ["Run", "Run", "Rate", "-", "-", "-", "-", "-", "-"],
];

// state (defaults match the live.* initial values)
const state = { run: 0, rate: 20, speed: 0.5, density: 8, spread: 0.4, glow: 0.5 };

// ---- buffers, all allocated once ----
const matrixName = `orbit${Math.floor(Math.random() * 1e6)}`;   // one name per instance, so two devices never share a matrix
const matrix = new JitterMatrix(matrixName, 4, "char", W, H);
const px = new Uint8Array(W * H * 4);        // the frame; the right half is never touched and stays 0
const trail = new Float32Array(AW * H);      // intensity 0..1 per pixel of the left half

// ordered 4x4 (Bayer) threshold map, values in [0, 1)
const BAYER = new Float32Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16));
// Push keeps 5 bits red, 6 bits green, 5 bits blue: quantisation steps in 8-bit terms
const STEP_R = 8;
const STEP_G = 4;
const STEP_B = 8;

// accent colour: a single hue read from Live's theme (display foreground); fixed fallback if it is not available
let accent = [1.0, 0.68, 0.34];
try {
    const c = max.getcolor("live_lcd_control_fg");
    if (Array.isArray(c) && c.length >= 3 && c.every((v) => Number.isFinite(v))) accent = [c[0], c[1], c[2]];
} catch (e) { /* keep the fallback */ }
const AR = accent[0] * 255;
const AG = accent[1] * 255;
const AB = accent[2] * 255;

// ---- clock ----
const loadTime = Date.now();
let booted = false;
let phase = 0;                // orbit phase in turns
let lastTick = 0;
let frames = 0;
const costs = new Float64Array(STAT_WINDOW);    // ms per frame, ring buffer
const stamps = new Float64Array(STAT_WINDOW);   // frame start times, ring buffer
let costCount = 0;
let costPos = 0;

const clock = new Task(() => tick());
clock.interval = 1000 / state.rate;
const boot = new Task(() => {
    booted = true;
    if (state.run) start();
});
boot.schedule(LOAD_GUARD_MS);

// ---- drawing ----

// soft round brush, additive into the trail buffer: falloff (1 - d^2/r^2)^2
function dot(x, y, radius, amount) {
    const r2 = radius * radius;
    const x0 = Math.max(0, Math.floor(x - radius));
    const x1 = Math.min(AW - 1, Math.ceil(x + radius));
    const y0 = Math.max(0, Math.floor(y - radius));
    const y1 = Math.min(H - 1, Math.ceil(y + radius));
    for (let yy = y0; yy <= y1; yy++) {
        const dy = yy - y;
        const row = yy * AW;
        for (let xx = x0; xx <= x1; xx++) {
            const dx = xx - x;
            const q = 1 - (dx * dx + dy * dy) / r2;
            if (q > 0) trail[row + xx] += amount * q * q;
        }
    }
}

function addDots(dt) {
    const n = Math.max(1, Math.min(24, Math.round(state.density)));
    const glow = state.glow;
    const radius = 2 + 4 * glow;                            // 2 px at Glow 0, 6 px at Glow 100
    const turns = state.speed * dt;                         // turns advanced since the last frame
    const rBase = R_MAX * 0.6;                              // the single ring at Spread 0
    // smooth arcs: split the step into sub-positions so fast dots do not become separate blobs
    const arc = turns * 2 * Math.PI * R_MAX * ASPECT;       // longest path in pixels this frame
    const sub = Math.max(1, Math.min(8, Math.ceil(arc / (radius * 1.2))));
    for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) : 0.5;
        const rSpread = R_MIN + (R_MAX - R_MIN) * t;        // small ring to large ring across the dots
        const r = rBase + state.spread * (rSpread - rBase);
        const bright = 0.55 + 0.45 * (1 - t) * state.spread + 0.45 * (1 - state.spread) * (i % 2 ? 0.7 : 1);
        for (let s = 0; s < sub; s++) {
            const ph = phase - turns * (1 - (s + 1) / sub);                       // positions from the previous frame up to now
            const a = 2 * Math.PI * (ph + i / n);
            dot(CX + Math.cos(a) * r * ASPECT, CY + Math.sin(a) * r, radius, (0.9 * bright) / Math.sqrt(sub));
        }
    }
}

// trail -> bytes (with dither), then trail *= decay for the next frame, in one pass
function convert() {
    const decay = 0.75 + 0.2 * state.glow;                  // 0.85 at Glow 50, longer trails at 100
    for (let y = 0; y < H; y++) {
        const t = y * AW;
        let o = y * W * 4;
        const by = (y & 3) << 2;
        for (let x = 0; x < AW; x++, o += 4) {
            let v = trail[t + x];
            if (v === 0) continue;                          // already zero in trail and frame: nothing to write
            if (v < 0.003) {                                // below visibility: exact zero, no dither noise floor
                trail[t + x] = 0;
                px[o] = 0; px[o + 1] = 0; px[o + 2] = 0; px[o + 3] = 0;
                continue;
            }
            if (v > 1) v = 1;
            const th = BAYER[by + (x & 3)];
            let r = AR * v;
            let g = AG * v;
            let b = AB * v;
            r = r < 1 ? 0 : Math.min(255, (r + th * STEP_R) | 0);
            g = g < 1 ? 0 : Math.min(255, (g + th * STEP_G) | 0);
            b = b < 1 ? 0 : Math.min(255, (b + th * STEP_B) | 0);
            px[o] = (r | g | b) ? 255 : 0;                  // alpha 255 on drawn pixels
            px[o + 1] = r;
            px[o + 2] = g;
            px[o + 3] = b;
            trail[t + x] = v * decay;
        }
    }
}

// ---- frame clock ----

function tick() {
    const t0 = Date.now();
    let dt = lastTick ? (t0 - lastTick) / 1000 : 1 / state.rate;
    if (dt > 0.25) dt = 0.25;                               // after a stall, do not leap
    lastTick = t0;
    phase = (phase + state.speed * dt) % 1;
    addDots(dt);
    convert();
    matrix.copyarraytomatrix(px);
    outlet(0, "jit_matrix", matrix.name);
    frames++;
    const t1 = Date.now();
    costs[costPos] = t1 - t0;
    stamps[costPos] = t0;
    costPos = (costPos + 1) % STAT_WINDOW;
    if (costCount < STAT_WINDOW) costCount++;
}

function start() {
    clock.cancel();
    clock.interval = 1000 / state.rate;
    lastTick = 0;
    clock.repeat();
}

// one fully transparent frame so the picture does not stay on the Push screen
function clearFrame() {
    px.fill(0);
    trail.fill(0);
    matrix.copyarraytomatrix(px);
    outlet(0, "jit_matrix", matrix.name);
}

function setRun(v) {
    const on = v ? 1 : 0;
    state.run = on;
    if (!booted) return;                    // the boot task starts the clock about 500 ms after load
    if (on) start();
    else {
        clock.cancel();
        clearFrame();
    }
}

// ---- inlet dispatch: inlet number picks the setting ----

function apply(v) {
    switch (inlet) {
        case 0: setRun(v); break;
        case 1:
            state.rate = Math.max(5, Math.min(30, Math.round(v)));
            if (state.run && booted) start();
            break;
        case 2: state.speed = Math.max(0.05, Math.min(4, v)); break;
        case 3: state.density = Math.max(1, Math.min(24, Math.round(v))); break;
        case 4: state.spread = Math.max(0, Math.min(100, v)) / 100; break;
        case 5: state.glow = Math.max(0, Math.min(100, v)) / 100; break;
    }
}

function msg_int(v) { apply(v); }
function msg_float(v) { apply(v); }

// ---- Push banks, rebuilt every time the device loads (live.banks only works inside Live) ----

function bang() {                            // from live.thisdevice
    outlet(1, "getcount");
}

function count(n) {                          // live.banks answers getcount with "count <n>"
    for (let i = 0; i < BANK_COUNT; i++) outlet(1, [i < n ? "edit" : "new", i, ...BANKS[i]]);
    for (let i = n - 1; i >= BANK_COUNT; i--) outlet(1, "delete", i);
    post(`${NAME}: banks built (${n} existing)\n`);
}

// ---- diagnostics ----

function status() {
    let sum = 0;
    let max = 0;
    for (let i = 0; i < costCount; i++) {
        sum += costs[i];
        if (costs[i] > max) max = costs[i];
    }
    let fps = 0;
    if (costCount > 1) {
        const newest = stamps[(costPos - 1 + STAT_WINDOW) % STAT_WINDOW];
        const oldest = stamps[(costPos - costCount + STAT_WINDOW) % STAT_WINDOW];
        fps = newest > oldest ? ((costCount - 1) * 1000) / (newest - oldest) : 0;
    }
    const avg = costCount ? sum / costCount : 0;
    post(`${NAME}: run ${state.run} rate ${state.rate} speed ${state.speed.toFixed(2)} density ${state.density} spread ${Math.round(state.spread * 100)} glow ${Math.round(state.glow * 100)} frames ${frames} avg ${avg.toFixed(2)} ms/frame over last ${costCount} (max ${max} ms) measured ${fps.toFixed(1)} fps\n`);
}

// write the current frame as a PNG (for checking the picture in Max without Push)
function dump(path) {
    matrix.exportimage(path, "png");
    post(`${NAME}: dumped ${path}\n`);
}

function notifydeleted() {
    clock.cancel();
    boot.cancel();
    clock.freepeer?.();
    boot.freepeer?.();
    matrix.freepeer?.();
}
