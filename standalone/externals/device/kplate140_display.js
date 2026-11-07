"use strict";

// kPlate140 display: the stock Ableton LCD panel (aesthetics/stock-ableton/aesthetic.md section 8) with a line
// drawing of an EMT 140 style plate hung in its frame by four springs. An exciter on the plate pulses every few
// seconds and ripples spread across the plate, bouncing back from the edges, driven by the device's parameters:
//   regen     how long the ripples keep bouncing (decay time)
//   predelay  how long after the pulse the first ripple leaves (the plugin's 0..1 scale, up to about 0.7 s)
//   derez     how fine the ripple lines are: fewer segments and stepped growth as the internal rate drops
//   input, wetness  how bright the ripples are
// Captions "In:" and "Wet:" sit beside the LCD number boxes laid over this panel. Colours are Live theme colours
// read with max.getcolor at paint time; a 1 s poll catches theme changes.

autowatch = 1;
inlets = 1;
outlets = 0;

mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;

const FONT = "Ableton Sans Medium";
const FPS = 25;
const HIT_EVERY = 3.2;        // seconds between exciter pulses
const TRAVEL = 0.7;           // seconds for a ripple to cross from the exciter to the edge
const MAX_PREDELAY = 0.7;     // seconds at predelay 1 (16000 plate samples at half rate, 48 kHz)
const FRAME = { x: 17, y: 7, w: 111, h: 70 };
const INSET = 10;             // spring length, frame to plate
const CAPTIONS = [["In:", 9, 98], ["Wet:", 79, 98]];

const state = { input: 1, regen: 0.5, derez: 1, predelay: 0, wetness: 0.25 };
const start = Date.now();
let lastTheme = "";

const color = (name) => {
  const c = max.getcolor(name);
  return Array.isArray(c) && c.length >= 3 ? c : [1, 0, 1, 1];
};
const setColor = (name, alpha = 1) => {
  const c = color(name);
  mgraphics.set_source_rgba(c[0], c[1], c[2], alpha);
};
const decayTime = () => 0.6 + 4.4 * Math.pow(state.regen, 1.5);

function spring(x0, y0, x1, y1, turns = 4, amp = 1.8) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len;
  mgraphics.move_to(x0, y0);
  for (let i = 1; i < turns * 2; i++) {
    const t = i / (turns * 2), side = i % 2 ? amp : -amp;
    mgraphics.line_to(x0 + dx * t + nx * side, y0 + dy * t + ny * side);
  }
  mgraphics.line_to(x1, y1);
}

function ellipsePath(cx, cy, rx, ry, segments) {
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * 2 * Math.PI;
    const x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
    i ? mgraphics.line_to(x, y) : mgraphics.move_to(x, y);
  }
}

function paint() {
  const [w, h] = mgraphics.size;
  const bg = color("live_lcd_bg");
  mgraphics.set_source_rgba(bg[0], bg[1], bg[2], 1);
  mgraphics.rectangle_rounded(0, 0, w, h, 4, 4);
  mgraphics.fill();

  const f = FRAME;
  const p = { x: f.x + INSET, y: f.y + INSET, w: f.w - 2 * INSET, h: f.h - 2 * INSET };
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;

  // frame and springs
  setColor("live_lcd_frame");
  mgraphics.set_line_width(1);
  mgraphics.rectangle(f.x + 0.5, f.y + 0.5, f.w - 1, f.h - 1);
  mgraphics.stroke();
  setColor("live_lcd_control_fg_zombie", 0.7);
  spring(f.x + 1, f.y + 1, p.x, p.y);
  spring(f.x + f.w - 1, f.y + 1, p.x + p.w, p.y);
  spring(f.x + 1, f.y + f.h - 1, p.x, p.y + p.h);
  spring(f.x + f.w - 1, f.y + f.h - 1, p.x + p.w, p.y + p.h);
  mgraphics.stroke();

  // ripples: the last few pulses, each bouncing every TRAVEL seconds, fading with the decay time
  const now = (Date.now() - start) / 1000;
  const T = decayTime();
  const pre = state.predelay * MAX_PREDELAY;
  const level = Math.min(1, state.input) * (0.35 + 0.65 * Math.min(1, state.wetness * 2));
  const segments = Math.round(8 + 40 * state.derez);
  const step = (1 - state.derez) * 6;
  const rxMax = p.w / 2 - 2, ryMax = p.h / 2 - 2;
  mgraphics.set_line_width(1.25);
  const lastHit = Math.floor(now / HIT_EVERY);
  for (let k = lastHit; k >= Math.max(0, lastHit - Math.ceil((pre + 4 * T) / HIT_EVERY)); k--) {
    const age = now - k * HIT_EVERY - pre;
    if (age < 0) continue;
    const amp = level * Math.exp(-age / T);
    if (amp < 0.04) continue;
    let frac = (age % TRAVEL) / TRAVEL;
    if (step > 0) frac = Math.floor((frac * rxMax) / step) * step / rxMax;
    setColor("live_lcd_control_fg", amp * (1 - 0.6 * frac));
    ellipsePath(cx, cy, Math.max(1, rxMax * frac), Math.max(1, ryMax * frac), segments);
    mgraphics.stroke();
  }

  // the plate, then the exciter, which flashes on each pulse
  setColor("live_lcd_control_fg");
  mgraphics.set_line_width(1.5);
  mgraphics.rectangle(p.x, p.y, p.w, p.h);
  mgraphics.stroke();
  const sinceHit = now - lastHit * HIT_EVERY;
  const flash = Math.max(0, 1 - sinceHit / 0.25);
  setColor("live_lcd_control_fg", 0.55 + 0.45 * flash);
  mgraphics.ellipse(cx - 2 - flash, cy - 2 - flash, 4 + 2 * flash, 4 + 2 * flash);
  mgraphics.fill();

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

const tick = new Task(() => mgraphics.redraw());
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
