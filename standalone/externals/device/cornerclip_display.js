"use strict";

// CornerClip display: the stock Ableton LCD panel with a line drawing of what the clipper does, in the style of
// Live's Tape device (orange line art, "In:" / "Mix:" readouts). The orange line is the device's real output for
// a sine: OneCornerClip's per-sample rule (Airwindows, MIT) run on 48 samples per cycle at 44.1 kHz, so Voicing
// rounds the corner exactly as the external does. Behind it: the unclipped input (caption colour) and the two
// thresholds (frame colour). The wave scrolls slowly, as Tape's reels turn.
//
// Messages: the parameter messages sent to cornerclip~ (input <dB>, posthr <dB>, negthr <dB>, voicing <0..1>,
// mix <0..1>). Captions "In:" and "Mix:" sit beside the LCD number boxes laid over this panel.
// Every colour is a Live theme colour read with max.getcolor at paint time; a 1 s poll catches theme changes.

autowatch = 1;
inlets = 1;
outlets = 0;

mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;

const FONT = "Ableton Sans Medium";
const SPC = 48;               // samples per sine cycle (about 920 Hz at 44.1 kHz)
const CYCLES = 2;             // cycles across the wave area
const SCROLL = 0.35;          // cycles per second
const FPS = 25;
const RANGE = 1.25;           // vertical full scale, in signal units
const WAVE = { x: 8, y: 9, h: 66 };
const CAPTIONS = [["In:", 9, 98], ["Mix:", 79, 98]];

const state = { input: 0, posthr: -0.3, negthr: -0.3, voicing: 0.618, mix: 1 };
let phase = 0;
let lastTheme = "";

const dbToLin = (db) => Math.pow(10, db / 20);
const color = (name) => {
  const c = max.getcolor(name);
  return Array.isArray(c) && c.length >= 3 ? c : [1, 0, 1, 1];
};
const setColor = (name, alpha = 1) => {
  const c = color(name);
  mgraphics.set_source_rgba(c[0], c[1], c[2], alpha);
};

// One pass of OneCornerClipProc (stereo collapsed to one channel). Returns [input, output] arrays.
function simulate(count, start) {
  const gain = dbToLin(state.input);
  const posThreshold = Math.min(1, dbToLin(state.posthr));
  const negThreshold = -Math.min(1, dbToLin(state.negthr));
  let voicing = state.voicing === 0.618 ? 0.618033988749894848204586 : state.voicing;
  voicing = Math.min(1, Math.max(0, voicing));
  const inverseHardness = 1 - voicing;
  const wet = state.mix;
  let posTarget = posThreshold;
  let negTarget = negThreshold;
  let last = 0;
  const ins = [];
  const outs = [];
  // one cycle of warm-up so the first drawn corner carries the filter state
  for (let k = -SPC; k < count; k++) {
    const dry = Math.sin(2 * Math.PI * (start + k / SPC));
    let x = dry * gain;
    if (x > posTarget) {
      x = last * voicing + posThreshold * inverseHardness;
      posTarget = x;
    } else {
      posTarget = posThreshold;
    }
    if (x < negTarget) {
      x = last * voicing + negThreshold * inverseHardness;
      negTarget = x;
    } else {
      negTarget = negThreshold;
    }
    last = x;
    if (k < 0) continue;
    ins.push(dry * gain);
    outs.push(wet !== 1 ? x * wet + dry * (1 - wet) : x);
  }
  return [ins, outs];
}

function paint() {
  const [w, h] = mgraphics.size;
  const bg = color("live_lcd_bg");
  mgraphics.set_source_rgba(bg[0], bg[1], bg[2], 1);
  mgraphics.rectangle_rounded(0, 0, w, h, 4, 4);
  mgraphics.fill();

  const left = WAVE.x;
  const width = w - 2 * WAVE.x;
  const mid = WAVE.y + WAVE.h / 2;
  const yOf = (v) => mid - (Math.max(-RANGE, Math.min(RANGE, v)) / RANGE) * (WAVE.h / 2);
  const count = SPC * CYCLES;
  const xOf = (k) => left + (k / count) * width;

  // thresholds, dashed, in the display's line colour
  setColor("live_lcd_frame");
  mgraphics.set_line_width(1);
  for (const v of [Math.min(1, dbToLin(state.posthr)), -Math.min(1, dbToLin(state.negthr))]) {
    const y = Math.round(yOf(v)) + 0.5;
    for (let x = left; x < left + width; x += 6) {
      mgraphics.move_to(x, y);
      mgraphics.line_to(Math.min(x + 3, left + width), y);
    }
  }
  mgraphics.stroke();

  const [ins, outs] = simulate(count + 1, phase);
  const polyline = (vals) => {
    vals.forEach((v, k) => (k ? mgraphics.line_to(xOf(k), yOf(v)) : mgraphics.move_to(xOf(k), yOf(v))));
    mgraphics.stroke();
  };
  mgraphics.set_line_join(1);
  setColor("live_lcd_control_fg_zombie", 0.45);
  mgraphics.set_line_width(1);
  polyline(ins);
  setColor("live_lcd_control_fg");
  mgraphics.set_line_width(1.5);
  polyline(outs);

  mgraphics.select_font_face(FONT);
  mgraphics.set_font_size(9.5);
  setColor("live_lcd_control_fg_zombie");
  for (const [str, x, y] of CAPTIONS) {
    mgraphics.move_to(x, y);
    mgraphics.show_text(str);
  }
}

function anything(v) {
  if (!Object.hasOwn(state, messagename) || typeof v !== "number") return;
  state[messagename] = v;
  mgraphics.redraw();
}

const tick = new Task(() => {
  phase = (phase + SCROLL / FPS) % 1;
  mgraphics.redraw();
});
tick.interval = 1000 / FPS;
tick.repeat();

// theme watch: Live sends no message when the theme changes
const watch = new Task(() => {
  const key = ["live_lcd_bg", "live_lcd_control_fg", "live_lcd_frame"].map((n) => color(n).join(",")).join("|");
  if (key !== lastTheme) { lastTheme = key; mgraphics.redraw(); }
});
watch.interval = 1000;
watch.repeat();

function notifydeleted() {
  tick.cancel(); tick.freepeer();
  watch.cancel(); watch.freepeer();
}
function onresize() { mgraphics.redraw(); }
