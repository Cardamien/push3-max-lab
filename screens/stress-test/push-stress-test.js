// push-stress-test.js - stress test for the Push 3 screen feed. One v8 script owns everything.
//
// Wiring (the whole patch):
//   inlet 0 Run, 1 Rate, 2 Speed, 3 Density, 4 Spread, 5 Glow, 6 Scene, 7 Readout   <- the live.* controls
//   inlet 8 (bang from live.thisdevice, "count n" from live.banks, "status", "reset", "dump <path>")
//   outlet 0 -> [live.push]   ("jit_matrix <name>")
//   outlet 1 -> [live.banks]  (bank messages, built at load)
//
// Frame: 4-plane char JitterMatrix 960x160 (Jitter order A,R,G,B), one Uint8Array plus a Uint32Array view on the same
// bytes (little-endian: A | R<<8 | G<<16 | B<<24). Black is transparent on Push (alpha 0).
// Scenes: 0 Orbit (demo animation, left half only), 1 Plasma (full screen, per pixel), 2 Strips (frame pacing),
// 3 Sweep (12 px per frame bar), 4 Map (static calibration chart, readout forced off). Everything is preallocated; nothing is allocated per frame except the once-a-second
// readout text.
// Pacing: one-shot Task rescheduled on an ideal time grid. A tick that arrives a whole interval or more late skips
// ahead (no backlog) and the skipped slots are counted as dropped frames.

inlets = 9;
outlets = 2;
autowatch = 1;

const NAME = "push-stress-test";
const W = 960;                 // full Push 3 screen
const H = 160;
const AW = 480;                // Orbit area: left half
const CX = AW / 2;
const CY = H / 2;
const MARGIN = 6;
const ASPECT = 3.2;
const R_MAX = (H / 2) - MARGIN - 6;
const R_MIN = 10;
const LOAD_GUARD_MS = 500;
const BANK_COUNT = 2;
const BANKS = [
    ["Scene", "-", "-", "-", "-", "Speed", "Density", "Spread", "Glow"],
    ["Run", "Run", "Rate", "Scene", "Readout", "-", "-", "-", "-"],
];
const SCENE_NAMES = ["Orbit", "Plasma", "Strips", "Sweep", "Map"];
const SWEEP_STEP = 12;         // px per frame
const SWEEP_BAR = 8;           // px wide
const STRIPS = 8;
const STRIP_W = W / STRIPS;

const state = { run: 0, rate: 60, speed: 0.5, density: 8, spread: 0.4, glow: 0.5, scene: 1, readout: 1 };

// ---- buffers, all allocated once ----
const matrixName = `stress${Math.floor(Math.random() * 1e6)}`;
const matrix = new JitterMatrix(matrixName, 4, "char", W, H);
const px = new Uint8Array(W * H * 4);
const px32 = new Uint32Array(px.buffer);
const trail = new Float32Array(AW * H);                // Orbit intensity 0..1

const BAYER = new Float32Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16));
const BAYERI = new Int32Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
const STEP_R = 8;              // Push keeps 5/6/5 bits: step sizes in 8-bit terms
const STEP_G = 4;
const STEP_B = 8;

// accent colour from Live's theme (fixed fallback)
let accent = [1.0, 0.68, 0.34];
try {
    const c = max.getcolor("live_lcd_control_fg");
    if (Array.isArray(c) && c.length >= 3 && c.every((v) => Number.isFinite(v))) accent = [c[0], c[1], c[2]];
} catch (e) { /* keep the fallback */ }
const AR = accent[0] * 255;
const AG = accent[1] * 255;
const AB = accent[2] * 255;

// ---- Plasma tables ----
const SIN = new Int16Array(1024);                      // amplitude +-127
for (let i = 0; i < 1024; i++) SIN[i] = Math.round(127 * Math.sin((i / 1024) * 2 * Math.PI));
const DIST = new Uint16Array(W * H);                   // radial phase index per pixel (centre of screen)
for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
        const dx = (x - W / 2) * 0.5;
        const dy = y - H / 2;
        DIST[y * W + x] = Math.round(Math.sqrt(dx * dx + dy * dy) * 8) & 1023;
    }
}
const colA = new Int16Array(W);                        // per frame: terms that depend on x, y, or x+y only
const rowB = new Int16Array(H);
const diagC = new Int16Array(W + H);
const TR = new Int32Array(1024);                       // sum of four terms (+512) -> channel value in 1/16 units
const TG = new Int32Array(1024);
const TB = new Int32Array(1024);
let rampGlow = -1;
let tPh = 0;

function buildRamp() {
    const g = 1 + 3 * state.glow;                      // contrast gain
    for (let i = 0; i < 1024; i++) {
        let u = (i - 512) / 1016 + 0.5;                // 0..1
        u = 0.5 + (u - 0.5) * g;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        u = u * u * (3 - 2 * u);                       // smoothstep: soft bands
        TR[i] = Math.round(AR * u * 16);
        TG[i] = Math.round(AG * u * 16);
        TB[i] = Math.round(AB * u * 16);
    }
    rampGlow = state.glow;
}
buildRamp();

// ---- 5x7 font, rows as 5-bit values (bit 4 = left pixel) ----
const FONT = {
    "0": [0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E],
    "1": [0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E],
    "2": [0x0E, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1F],
    "3": [0x1E, 0x01, 0x01, 0x0E, 0x01, 0x01, 0x1E],
    "4": [0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02],
    "5": [0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E],
    "6": [0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E],
    "7": [0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
    "8": [0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E],
    "9": [0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C],
    ".": [0, 0, 0, 0, 0, 0x0C, 0x0C],
    "F": [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10],
    "P": [0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10],
    "S": [0x0F, 0x10, 0x10, 0x0E, 0x01, 0x01, 0x1E],
    "M": [0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11],
    ",": [0, 0, 0, 0, 0x0C, 0x04, 0x08],
    "D": [0x1E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1E],
};
const FS = 2;                                          // font scale: each font pixel is 2x2
const CHAR_ADV = 6 * FS;
const LINE_ADV = 8 * FS;
const RO_PAD = 3;
const RO_CHARS = 7;
const RO_X = 4;
const RO_W = RO_CHARS * CHAR_ADV + RO_PAD * 2 - FS;
const RO_H = 3 * LINE_ADV + RO_PAD * 2 - FS;
const RO_Y = H - 4 - RO_H;
const roIdx = new Int32Array(RO_CHARS * 3 * 35 * FS * FS);   // pixel offsets (in px32) lit white
let roCount = 0;
const roSaved = new Uint32Array(RO_W * RO_H);
let roDrawn = false;
let shownFps = 0;
let shownMs = 0;
let shownDrop = 0;

function addText(str, line) {
    const y0 = RO_Y + RO_PAD + line * LINE_ADV;
    const n = Math.min(str.length, RO_CHARS);
    for (let c = 0; c < n; c++) {
        const g = FONT[str.charAt(c)];
        if (!g) continue;
        const x0 = RO_X + RO_PAD + c * CHAR_ADV;
        for (let r = 0; r < 7; r++) {
            for (let b = 0; b < 5; b++) {
                if (!((g[r] >> (4 - b)) & 1)) continue;
                for (let dy = 0; dy < FS; dy++) {
                    for (let dx = 0; dx < FS; dx++) roIdx[roCount++] = (y0 + r * FS + dy) * W + x0 + b * FS + dx;
                }
            }
        }
    }
}

function buildReadout() {                              // once a second
    roCount = 0;
    addText(`${shownFps} FPS`, 0);
    addText(`${shownMs.toFixed(1)} MS`, 1);
    addText(`D ${shownDrop}`, 2);
}

function overlayOn() {
    let k = 0;
    for (let y = 0; y < RO_H; y++) {
        const o = (RO_Y + y) * W + RO_X;
        for (let x = 0; x < RO_W; x++) {
            roSaved[k++] = px32[o + x];
            px32[o + x] = 0;
        }
    }
    for (let i = 0; i < roCount; i++) px32[roIdx[i]] = 0xFFFFFFFF;
    roDrawn = true;
}

function overlayOff() {                                // put the pixels back after the frame is sent
    if (!roDrawn) return;
    let k = 0;
    for (let y = 0; y < RO_H; y++) {
        const o = (RO_Y + y) * W + RO_X;
        for (let x = 0; x < RO_W; x++) px32[o + x] = roSaved[k++];
    }
    roDrawn = false;
}

// ---- clock and statistics ----
const boot = new Task(() => {
    booted = true;
    if (state.run) start();
});
const clock = new Task(() => tick());
let booted = false;
let running = false;
let nextDue = 0;
let lastTick = 0;
let frameNo = 0;                                       // frames sent since scene/rate/run change (drives Strips, Sweep)
let phase = 0;
let dropped = 0;
let statFrames = 0;
let statBuild = 0;
let statSend = 0;
let statMax = 0;
let statStart = 0;
let statLast = 0;
let secStart = 0;
let secFrames = 0;
let secCost = 0;
boot.schedule(LOAD_GUARD_MS);

function resetStats() {
    dropped = 0;
    statFrames = 0;
    statBuild = 0;
    statSend = 0;
    statMax = 0;
    statStart = 0;
    statLast = 0;
    secStart = 0;
    secFrames = 0;
    secCost = 0;
    shownFps = 0;
    shownMs = 0;
    shownDrop = 0;
    buildReadout();
}

// ---- Orbit (the demo animation, time-based so trails look the same at any rate) ----

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

function addDots(dt, amountScale) {
    const n = Math.max(1, Math.min(24, Math.round(state.density)));
    const glow = state.glow;
    const radius = 2 + 4 * glow;
    const turns = state.speed * dt;
    const rBase = R_MAX * 0.6;
    const arc = turns * 2 * Math.PI * R_MAX * ASPECT;
    const sub = Math.max(1, Math.min(8, Math.ceil(arc / (radius * 1.2))));
    for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) : 0.5;
        const rSpread = R_MIN + (R_MAX - R_MIN) * t;
        const r = rBase + state.spread * (rSpread - rBase);
        const bright = 0.55 + 0.45 * (1 - t) * state.spread + 0.45 * (1 - state.spread) * (i % 2 ? 0.7 : 1);
        for (let s = 0; s < sub; s++) {
            const ph = phase - turns * (1 - (s + 1) / sub);
            const a = 2 * Math.PI * (ph + i / n);
            dot(CX + Math.cos(a) * r * ASPECT, CY + Math.sin(a) * r, radius, (0.9 * bright * amountScale) / Math.sqrt(sub));
        }
    }
}

function convertOrbit(decay) {
    for (let y = 0; y < H; y++) {
        const t = y * AW;
        let o = y * W;
        const by = (y & 3) << 2;
        for (let x = 0; x < AW; x++, o++) {
            let v = trail[t + x];
            if (v === 0) continue;
            if (v < 0.003) {
                trail[t + x] = 0;
                px32[o] = 0;
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
            px32[o] = ((r | g | b) ? 255 : 0) | (r << 8) | (g << 16) | (b << 24);
            trail[t + x] = v * decay;
        }
    }
}

function sceneOrbit(dt) {
    phase = (phase + state.speed * dt) % 1;
    const d20 = 0.75 + 0.2 * state.glow;               // the demo's decay per frame at 20 fps
    const dpf = Math.pow(d20, Math.min(dt, 0.25) * 20);
    addDots(dt, (1 - dpf) / (1 - d20));
    convertOrbit(dpf);
}

// ---- Plasma: four sine terms (x, y, x+y, radius), table lookups, integer maths, one pass with dither ----

function scenePlasma(dt) {
    if (rampGlow !== state.glow) buildRamp();
    tPh = (tPh + state.speed * 0.5 * dt) % 1;
    const t = (tPh * 1024) | 0;
    const kx = 6 * state.density;                       // 1/16 phase units per pixel
    const ky = 19 * state.density;
    const kd = 3 * state.density;
    const t1 = t;
    const t2 = (2 * t) & 1023;
    const t3 = (1024 - t) & 1023;
    const t4 = (3 * t) & 1023;
    for (let x = 0; x < W; x++) colA[x] = SIN[(((x * kx) >> 4) + t1) & 1023];
    for (let y = 0; y < H; y++) rowB[y] = SIN[(((y * ky) >> 4) + t2) & 1023];
    for (let i = 0; i < W + H; i++) diagC[i] = SIN[(((i * kd) >> 4) + t3) & 1023];
    let o = 0;
    for (let y = 0; y < H; y++) {
        const by = (y & 3) << 2;
        const rb = rowB[y] + 512;
        for (let x = 0; x < W; x++, o++) {
            const i = rb + colA[x] + diagC[x + y] + SIN[(DIST[o] + t4) & 1023];
            const bi = BAYERI[by + (x & 3)];
            let r = (TR[i] + bi * STEP_R + 4) >> 4;
            let g = (TG[i] + bi * STEP_G + 2) >> 4;
            let b = (TB[i] + bi * STEP_B + 4) >> 4;
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (b > 255) b = 255;
            px32[o] = ((r | g | b) ? 255 : 0) | (r << 8) | (g << 16) | (b << 24);
        }
    }
}

// ---- Strips: strip k (0..7) flips between white and black every k+1 frames ----

function sceneStrips() {
    for (let k = 0; k < STRIPS; k++) {
        const white = Math.floor(frameNo / (k + 1)) & 1;
        px32.fill(white ? 0xFFFFFFFF : 0, k * STRIP_W, (k + 1) * STRIP_W);
    }
    for (let y = 1; y < H; y++) px32.copyWithin(y * W, 0, W);
}

// ---- Sweep: 8 px white bar, exactly 12 px per frame, wraps at 960 ----

let sweepX = 0;                                         // left edge of the bar in the last frame (-1 = none drawn)

function drawBar(x, value) {
    const end = x + SWEEP_BAR;
    for (let y = 0; y < H; y++) {
        const o = y * W;
        if (end <= W) px32.fill(value, o + x, o + end);
        else {
            px32.fill(value, o + x, o + W);
            px32.fill(value, o, o + end - W);
        }
    }
}

function sceneSweep() {
    if (sweepX >= 0) drawBar(sweepX, 0);
    sweepX = (frameNo * SWEEP_STEP) % W;
    drawBar(sweepX, 0xFFFFFFFF);
}

// ---- Map: static calibration chart, 8 x 8 cells of 120 x 20 px, drawn once per scene start ----
// Chequered accent fills (35 % / 65 %), bright grid lines, a "c,r" label in each cell (5x7 font at 1x, white), a bright
// frame around the screen and 6 px ticks at the column centres (x = 60 + 120 k) at the very top and bottom.

const MAP_COLS = 8;
const MAP_ROWS = 8;
const MAP_CW = W / MAP_COLS;                            // 120
const MAP_CH = H / MAP_ROWS;                            // 20
const MAP_TICK = 6;
let mapDrawn = false;

function packRGB(r, g, b) {
    return (255 | (Math.round(r) << 8) | (Math.round(g) << 16) | (Math.round(b) << 24)) >>> 0;
}

function mapLabel(x0, y0, str) {
    for (let c = 0; c < str.length; c++) {
        const g = FONT[str.charAt(c)];
        if (!g) continue;
        for (let r = 0; r < 7; r++) {
            for (let b = 0; b < 5; b++) {
                if ((g[r] >> (4 - b)) & 1) px32[(y0 + r) * W + x0 + c * 6 + b] = 0xFFFFFFFF;
            }
        }
    }
}

function drawMap() {
    const dim = packRGB(AR * 0.35, AG * 0.35, AB * 0.35);
    const mid = packRGB(AR * 0.65, AG * 0.65, AB * 0.65);
    const bright = packRGB(AR, AG, AB);
    for (let r = 0; r < MAP_ROWS; r++) {
        for (let c = 0; c < MAP_COLS; c++) {
            const v = (c + r) & 1 ? mid : dim;
            for (let y = r * MAP_CH; y < (r + 1) * MAP_CH; y++) px32.fill(v, y * W + c * MAP_CW, y * W + (c + 1) * MAP_CW);
        }
    }
    for (let c = 0; c < MAP_COLS; c++) {
        for (let y = 0; y < H; y++) px32[y * W + c * MAP_CW] = bright;
    }
    for (let r = 0; r < MAP_ROWS; r++) px32.fill(bright, r * MAP_CH * W, r * MAP_CH * W + W);
    for (let y = 0; y < H; y++) px32[y * W + W - 1] = bright;
    px32.fill(bright, (H - 1) * W, H * W);
    for (let k = 0; k < MAP_COLS; k++) {
        const x = MAP_CW * k + MAP_CW / 2;
        for (let y = 0; y < MAP_TICK; y++) {
            px32[y * W + x] = 0xFFFFFFFF;
            px32[(H - 1 - y) * W + x] = 0xFFFFFFFF;
        }
    }
    for (let r = 0; r < MAP_ROWS; r++) {
        for (let c = 0; c < MAP_COLS; c++) mapLabel(c * MAP_CW + 3, r * MAP_CH + 2, `${c},${r}`);
    }
    mapDrawn = true;
}

function sceneMap() {
    if (!mapDrawn) drawMap();
}

// ---- frame clock ----

function renderScene(dt) {
    switch (state.scene) {
        case 0: sceneOrbit(dt); break;
        case 1: scenePlasma(dt); break;
        case 2: sceneStrips(); break;
        case 3: sceneSweep(); break;
        case 4: sceneMap(); break;
    }
}

function tick() {
    if (!running) return;
    const iv = 1000 / state.rate;
    const ro = state.readout && state.scene !== 4;      // the readout block would hide the Map labels
    const t0 = Date.now();
    const late = t0 - nextDue;
    if (late >= iv) {                                   // overrun: skip ahead, never queue a backlog
        const miss = Math.floor(late / iv);
        dropped += miss;
        nextDue += miss * iv;
    }
    let dt = lastTick ? (t0 - lastTick) / 1000 : 1 / state.rate;
    if (dt > 0.25) dt = 0.25;
    lastTick = t0;
    try {
        renderScene(dt);
        if (ro) overlayOn();
        matrix.copyarraytomatrix(px);
    } catch (e) {
        post(`${NAME}: frame error ${e}\n`);
    }
    const t1 = Date.now();
    outlet(0, "jit_matrix", matrix.name);
    const t2 = Date.now();
    if (ro) overlayOff();
    frameNo++;
    // statistics
    const build = t1 - t0;
    if (!statStart) statStart = t0;
    statLast = t0;
    statFrames++;
    statBuild += build;
    statSend += t2 - t1;
    if (build > statMax) statMax = build;
    if (!secStart) secStart = t0;
    secFrames++;
    secCost += build;
    if (t0 - secStart >= 1000) {
        shownFps = Math.round((secFrames * 1000) / (t0 - secStart));
        shownMs = secCost / secFrames;
        shownDrop = dropped;
        secStart = t0;
        secFrames = 0;
        secCost = 0;
        buildReadout();
    }
    nextDue += iv;
    let delay = nextDue - Date.now();
    if (delay < 1) delay = 1;                           // next tick counts what it missed
    clock.schedule(delay);
}

function start() {
    clock.cancel();
    running = true;
    lastTick = 0;
    frameNo = 0;
    sweepX = -1;
    mapDrawn = false;
    resetStats();
    nextDue = Date.now();
    clock.schedule(1);
}

function stop() {
    running = false;
    clock.cancel();
}

function clearFrame() {
    roDrawn = false;
    px.fill(0);
    trail.fill(0);
    sweepX = -1;
    mapDrawn = false;
    matrix.copyarraytomatrix(px);
    outlet(0, "jit_matrix", matrix.name);
}

function setRun(v) {
    state.run = v ? 1 : 0;
    if (!booted) return;
    if (state.run) {
        px.fill(0);
        trail.fill(0);
        start();
    } else {
        stop();
        clearFrame();
    }
}

function setScene(v) {
    state.scene = Math.max(0, Math.min(SCENE_NAMES.length - 1, Math.round(v)));
    px.fill(0);
    trail.fill(0);
    roDrawn = false;
    sweepX = -1;
    mapDrawn = false;
    frameNo = 0;
    resetStats();
}

// ---- inlet dispatch ----

function apply(v) {
    switch (inlet) {
        case 0: setRun(v); break;
        case 1:
            state.rate = Math.max(1, Math.min(120, Math.round(v)));
            if (state.run && booted) start();
            break;
        case 2: state.speed = Math.max(0.05, Math.min(4, v)); break;
        case 3: state.density = Math.max(1, Math.min(24, Math.round(v))); break;
        case 4: state.spread = Math.max(0, Math.min(100, v)) / 100; break;
        case 5: state.glow = Math.max(0, Math.min(100, v)) / 100; break;
        case 6: setScene(v); break;
        case 7: state.readout = v ? 1 : 0; break;
    }
}

function msg_int(v) { apply(v); }
function msg_float(v) { apply(v); }

// ---- Push banks, rebuilt every load ----

function bang() {
    outlet(1, "getcount");
}

function count(n) {
    for (let i = 0; i < BANK_COUNT; i++) outlet(1, [i < n ? "edit" : "new", i, ...BANKS[i]]);
    for (let i = n - 1; i >= BANK_COUNT; i--) outlet(1, "delete", i);
    post(`${NAME}: banks built (${n} existing)\n`);
}

// ---- diagnostics ----

function status() {
    const n = statFrames;
    const span = statLast - statStart;
    const fps = n > 1 && span > 0 ? ((n - 1) * 1000) / span : 0;
    post(`${NAME}: scene ${SCENE_NAMES[state.scene]} rate ${state.rate} run ${state.run} readout ${state.readout} frames ${n} avg build ${n ? (statBuild / n).toFixed(2) : "0"} ms (max ${statMax}) avg send ${n ? (statSend / n).toFixed(2) : "0"} ms dropped ${dropped} measured ${fps.toFixed(1)} fps\n`);
}

function reset() {
    resetStats();
    statStart = 0;
}

// post the readout block as text (white = X), one character per font pixel: checks the digits without Push
function ascii() {
    let out = `${NAME}: readout block (${shownFps} fps, ${shownMs.toFixed(1)} ms, ${shownDrop} dropped)\n`;
    overlayOn();
    for (let y = 0; y < RO_H; y += FS) {
        let line = "";
        for (let x = 0; x < RO_W; x += FS) line += px32[(RO_Y + y) * W + RO_X + x] === 0xFFFFFFFF ? "X" : ".";
        out += `${line}\n`;
    }
    overlayOff();
    post(out);
}

function dump(path) {
    matrix.exportimage(path, "png");
    post(`${NAME}: dumped ${path}\n`);
}

function notifydeleted() {
    running = false;
    clock.cancel();
    boot.cancel();
    clock.freepeer?.();
    boot.freepeer?.();
    matrix.freepeer?.();
}
