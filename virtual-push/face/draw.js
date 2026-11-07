// Virtual Push 3 face renderer, shared by the HTML preview (canvas 2D) and the
// Max v8ui (mgraphics). Everything is drawn in LAYOUT frame units through a
// small adapter `g` (see adapter-canvas.js / vpush.js for the two adapters):
//   save restore translate scale
//   begin moveTo lineTo curveTo close rect roundRect circle
//   fill(rgba) stroke(rgba, width) text(str, x, y, size, align, weight)
// Colours are [r, g, b, a] in 0..1.
//
// State (what Live sent, plus local presses):
//   leds: Map(key -> {idx, ch, t0})  key 'cc85' | 'note36', idx palette index,
//         ch MIDI channel (0 static, 1-5 one-shot, 6-10 pulse, 11-15 blink), t0 ms
//   pressed: Set(control id), touched: Set(control id)
//   bpm: animation tempo (from MIDI clock, default 120)
//   clockStart: ms of the last MIDI Start, for blink phase

const CHASSIS = [0.11, 0.11, 0.115, 1], PLATE = [0.075, 0.075, 0.08, 1], KEY = [0.14, 0.14, 0.145, 1];
const KEY_EDGE = [0.2, 0.2, 0.21, 1], PRINT_OFF = [0.5, 0.5, 0.5, 1], PAD_OFF = [0.62, 0.63, 0.58, 1];   // unlit pad: greyish cream silicone, no light behind it (Push 3 photo)
const ENC = [0.09, 0.09, 0.095, 1], ENC_RING = [0.22, 0.22, 0.23, 1], SCREEN = [0, 0, 0, 1], DIVIDER = [0.26, 0.26, 0.27, 1];

// --- SVG path data -> adapter calls (M L H V C S Q T A Z, absolute and relative)
function svgPath(g, d, ox, oy, s) {
  const tok = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cx = 0, cy = 0;
  const num = () => parseFloat(tok[i++]);
  const P = (px, py) => [ox + px * s, oy + py * s];
  const arc = (x1, y1, rx, ry, phi, fa, fs, x2, y2) => {   // endpoint arc -> cubic beziers
    if (rx === 0 || ry === 0) { g.lineTo(...P(x2, y2)); return; }
    const rad = phi * Math.PI / 180, cosp = Math.cos(rad), sinp = Math.sin(rad);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    const x1p = cosp * dx + sinp * dy, y1p = -sinp * dx + cosp * dy;
    let rx2 = rx * rx, ry2 = ry * ry; const l = x1p * x1p / rx2 + y1p * y1p / ry2;
    if (l > 1) { rx *= Math.sqrt(l); ry *= Math.sqrt(l); rx2 = rx * rx; ry2 = ry * ry; }
    let sq = (rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p) / (rx2 * y1p * y1p + ry2 * x1p * x1p);
    sq = Math.sqrt(Math.max(0, sq)) * (fa === fs ? -1 : 1);
    const cxp = sq * rx * y1p / ry, cyp = -sq * ry * x1p / rx;
    const ccx = cosp * cxp - sinp * cyp + (x1 + x2) / 2, ccy = sinp * cxp + cosp * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
    const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
    const n = Math.ceil(Math.abs(dt) / (Math.PI / 2)), seg = dt / n;
    let t = t1;
    for (let k = 0; k < n; k++) {
      const t2 = t + seg, al = 4 / 3 * Math.tan(seg / 4);
      const e1x = Math.cos(t), e1y = Math.sin(t), e2x = Math.cos(t2), e2y = Math.sin(t2);
      const pt = (ex, ey) => [ccx + rx * cosp * ex - ry * sinp * ey, ccy + rx * sinp * ex + ry * cosp * ey];
      const [p1x, p1y] = pt(e1x, e1y), [p2x, p2y] = pt(e2x, e2y);
      const d1 = [-rx * cosp * e1y - ry * sinp * e1x, -rx * sinp * e1y + ry * cosp * e1x];
      const d2 = [-rx * cosp * e2y - ry * sinp * e2x, -rx * sinp * e2y + ry * cosp * e2x];
      g.curveTo(...P(p1x + al * d1[0], p1y + al * d1[1]), ...P(p2x - al * d2[0], p2y - al * d2[1]), ...P(p2x, p2y));
      t = t2;
    }
  };
  while (i < tok.length) {
    if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    if (C === 'M') { const nx = num(), ny = num(); x = rel ? x + nx : nx; y = rel ? y + ny : ny; g.moveTo(...P(x, y)); sx = x; sy = y; cmd = rel ? 'l' : 'L'; }
    else if (C === 'L') { const nx = num(), ny = num(); x = rel ? x + nx : nx; y = rel ? y + ny : ny; g.lineTo(...P(x, y)); }
    else if (C === 'H') { const nx = num(); x = rel ? x + nx : nx; g.lineTo(...P(x, y)); }
    else if (C === 'V') { const ny = num(); y = rel ? y + ny : ny; g.lineTo(...P(x, y)); }
    else if (C === 'C') { let a = [num(), num(), num(), num(), num(), num()]; if (rel) a = [a[0] + x, a[1] + y, a[2] + x, a[3] + y, a[4] + x, a[5] + y]; g.curveTo(...P(a[0], a[1]), ...P(a[2], a[3]), ...P(a[4], a[5])); cx = a[2]; cy = a[3]; x = a[4]; y = a[5]; }
    else if (C === 'S') { let a = [num(), num(), num(), num()]; if (rel) a = [a[0] + x, a[1] + y, a[2] + x, a[3] + y]; const r1x = 2 * x - cx, r1y = 2 * y - cy; g.curveTo(...P(r1x, r1y), ...P(a[0], a[1]), ...P(a[2], a[3])); cx = a[0]; cy = a[1]; x = a[2]; y = a[3]; }
    else if (C === 'Q' || C === 'T') { let qx, qy, nx, ny; if (C === 'Q') { qx = num(); qy = num(); if (rel) { qx += x; qy += y; } } else { qx = 2 * x - cx; qy = 2 * y - cy; } nx = num(); ny = num(); if (rel) { nx += x; ny += y; } g.curveTo(...P(x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y)), ...P(nx + 2 / 3 * (qx - nx), ny + 2 / 3 * (qy - ny)), ...P(nx, ny)); cx = qx; cy = qy; x = nx; y = ny; }
    else if (C === 'A') { const rx = num(), ry = num(), phi = num(), fa = num(), fs = num(); let nx = num(), ny = num(); if (rel) { nx += x; ny += y; } arc(x, y, rx, ry, phi, fa, fs, nx, ny); x = nx; y = ny; }
    else if (C === 'Z') { g.close(); x = sx; y = sy; }
    else i++;
  }
}

function lucide(g, icon, cx, cy, size, color) {
  const s = size / 24, ox = cx - size / 2, oy = cy - size / 2;
  g.begin();
  for (const e of icon) {
    if (e.t === 'path') svgPath(g, e.d, ox, oy, s);
    else if (e.t === 'circle') g.circle(ox + e.cx * s, oy + e.cy * s, e.r * s);
    else if (e.t === 'rect') g.roundRect(ox + e.x * s, oy + e.y * s, e.w * s, e.h * s, e.rx * s);
    else if (e.t === 'line') { g.moveTo(ox + e.x1 * s, oy + e.y1 * s); g.lineTo(ox + e.x2 * s, oy + e.y2 * s); }
    else if (e.t === 'poly') { e.pts.forEach((v, k) => { if (k % 2) return; (k ? g.lineTo : g.moveTo).call(g, ox + v * s, oy + e.pts[k + 1] * s); }); if (e.close) g.close(); }
  }
  g.stroke(color, 2 * s);
}

// primitive prints that Lucide does not have
function primitive(g, name, cx, cy, size, color) {
  const h = size / 2, w = Math.max(2.2, size * 0.09);
  g.begin();
  switch (name) {
    case 'play': g.moveTo(cx - h * 0.7, cy - h); g.lineTo(cx + h * 0.9, cy); g.lineTo(cx - h * 0.7, cy + h); g.close(); g.stroke(color, w); return;
    case 'play-small': g.moveTo(cx - h * 0.6, cy - h * 0.8); g.lineTo(cx + h * 0.8, cy); g.lineTo(cx - h * 0.6, cy + h * 0.8); g.close(); g.stroke(color, w * 0.8); return;
    case 'record': g.circle(cx, cy, h * 0.85); g.stroke(color, w); return;
    case 'square': g.rect(cx - h * 0.7, cy - h * 0.7, h * 1.4, h * 1.4); g.stroke(color, w); return;
    case 'dash': g.moveTo(cx - h, cy); g.lineTo(cx + h, cy); g.stroke(color, w); return;
    case 'plus': g.moveTo(cx - h, cy); g.lineTo(cx + h, cy); g.moveTo(cx, cy - h); g.lineTo(cx, cy + h); g.stroke(color, w); return;
    case 'metronome': g.circle(cx - h * 0.6, cy, h * 0.5); g.stroke(color, w * 0.8); g.begin(); g.circle(cx + h * 0.6, cy, h * 0.5); g.fill(color); return;
    case 'capture': { const o = h, k = h * 0.45; for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.moveTo(cx + sx * o, cy + sy * (o - k)); g.lineTo(cx + sx * o, cy + sy * o); g.lineTo(cx + sx * (o - k), cy + sy * o); } g.stroke(color, w); return; }
    case 'bars': for (const [k, hh] of [[-0.6, 0.5], [0, 1], [0.6, 0.7]]) { g.moveTo(cx + k * h, cy + hh * h); g.lineTo(cx + k * h, cy - hh * h); } g.stroke(color, w); return;
    case 'bars3': for (const k of [-0.6, 0, 0.6]) { g.moveTo(cx + k * h, cy + h); g.lineTo(cx + k * h, cy - h); } g.stroke(color, w); return;
    case 'tri-up': g.moveTo(cx - h * 0.6, cy + h * 0.3); g.lineTo(cx, cy - h * 0.3); g.lineTo(cx + h * 0.6, cy + h * 0.3); g.stroke(color, w); return;
    case 'tri-down': g.moveTo(cx - h * 0.6, cy - h * 0.3); g.lineTo(cx, cy + h * 0.3); g.lineTo(cx + h * 0.6, cy - h * 0.3); g.stroke(color, w); return;
    case 'tri-left': g.moveTo(cx + h * 0.3, cy - h * 0.6); g.lineTo(cx - h * 0.3, cy); g.lineTo(cx + h * 0.3, cy + h * 0.6); g.stroke(color, w); return;
    case 'tri-right': g.moveTo(cx - h * 0.3, cy - h * 0.6); g.lineTo(cx + h * 0.3, cy); g.lineTo(cx - h * 0.3, cy + h * 0.6); g.stroke(color, w); return;
    case 'dot': g.circle(cx, cy, w); g.fill(color); return;
    case 'lock-open': lucide(g, ICONS.lock, cx, cy, size, color); return;
  }
}

function drawIcon(g, name, cx, cy, size, color) {
  if (ICONS[name]) lucide(g, ICONS[name], cx, cy, size, color); else primitive(g, name, cx, cy, size, color);
}

// --- LED colour from palette + animation -------------------------------------
const DUR = [1 / 6, 1 / 4, 1 / 2, 1, 2];      // 24th, 16th, 8th, quarter, half (beats)
function ledLevel(led, now, bpm, clockStart) {
  if (!led || led.ch === 0) return 1;
  const beat = 60000 / bpm, k = (led.ch - 1) % 5, d = DUR[k] * beat;
  if (led.ch <= 5) return Math.min(1, (now - led.t0) / d);                          // one-shot ramp in
  const ph = ((now - (clockStart ?? 0)) % d) / d;
  if (led.ch <= 10) return 0.25 + 0.75 * (0.5 + 0.5 * Math.cos(2 * Math.PI * ph));    // pulse
  return ph < 0.5 ? 1 : 0.08;                                                           // blink
}
let LED_BRIGHT = 1;                              // Live's global LED brightness (sysex 06), set by drawFace
function ledColor(control, led, palette, now, bpm, clockStart) {
  if (led?.rgb) { const [r, gr, b] = led.rgb; return r + gr + b > 0 && LED_BRIGHT > 0.02 ? [r / 255, gr / 255, b / 255, LED_BRIGHT] : null; }   // sysex 3B colour
  if (!led || led.idx === 0) return null;
  const e = palette[led.idx & 127] || [0, 0, 0, 0], lv = ledLevel(led, now, bpm, clockStart) * LED_BRIGHT;
  if (lv <= 0.02) return null;
  if (control.led === 'white') { const w = e[3] / 255 * lv; return w > 0.02 ? [1, 1, 1, Math.min(1, 0.15 + w)] : null; }
  const m = Math.max(e[0], e[1], e[2]);
  if (m === 0) { const w = e[3] / 255 * lv; return w > 0.02 ? [1, 1, 1, w] : null; }
  return [e[0] / 255, e[1] / 255, e[2] / 255, Math.min(1, 0.2 + 0.8 * lv)];
}

// arrowhead at the end of a turn arc (angle ae on a circle of radius rr), pointing along the turn
function arcArrow(g, cx, cy, rr, ae, dir, size, color) {
  const tx = -Math.sin(ae) * dir, ty = Math.cos(ae) * dir;                 // tangent in the turn direction
  const px = Math.cos(ae) * rr, py = Math.sin(ae) * rr, tipx = cx + px + tx * size * 0.6, tipy = cy + py + ty * size * 0.6;
  const nx = Math.cos(ae), ny = Math.sin(ae);
  g.begin();
  g.moveTo(tipx - tx * size + nx * size * 0.6, tipy - ty * size + ny * size * 0.6); g.lineTo(tipx, tipy);
  g.lineTo(tipx - tx * size - nx * size * 0.6, tipy - ty * size - ny * size * 0.6);
  g.stroke(color, size * 0.35);
}

// --- a key: raised at rest (light top edge, dark bottom edge), sunk when pressed
const KEY_TOP = [0.3, 0.3, 0.31, 1], KEY_BOTTOM = [0.03, 0.03, 0.035, 1], KEY_DOWN = [0.085, 0.085, 0.09, 1], PRESS = [1, 1, 1, 1];
function key(g, x, y, w, h, r) {
  g.begin(); g.roundRect(x, y, w, h, r); g.fill(KEY);
  g.begin(); g.moveTo(x + r, y + 1.5); g.lineTo(x + w - r, y + 1.5); g.stroke(KEY_TOP, 2);
  g.begin(); g.moveTo(x + r, y + h - 1.5); g.lineTo(x + w - r, y + h - 1.5); g.stroke(KEY_BOTTOM, 3);
}

// --- the face ---------------------------------------------------------------
function textLines(g, text, cx, cy, size, align, color, weight) {
  const lines = text.split('\n'), lh = size * 1.15, y0 = cy - lh * (lines.length - 1) / 2;
  lines.forEach((l, k) => g.text(l, cx, y0 + k * lh, size, align, weight ?? 'normal', color));
}

function drawFace(g, L, state, palette, now, opts = {}) {
  const S = opts.scale ?? 1;
  g.save(); g.scale(S);
  const { leds, pressed, touched, bpm = 120, clockStart = 0 } = state;
  LED_BRIGHT = state.ledBright ?? 1;
  const ledOf = (c, sub) => leds.get(c.midi.cc !== undefined ? `cc${c.midi.cc}` : c.midi.note !== undefined ? `note${c.midi.note}` : sub ?? '');
  g.begin(); g.roundRect(0, 0, L.W, L.H, 36); g.fill(CHASSIS);
  for (const p of L.plates) {
    g.begin(); g.roundRect(p.x - 6, p.y - 6, p.w + 12, p.h + 12, 10); g.fill(PLATE);
    g.begin(); g.roundRect(p.x - 6, p.y - 6, p.w + 12, p.h + 12, 10); g.stroke(KEY_EDGE, 2);
    g.begin();
    for (const vx of p.v ?? []) { g.moveTo(vx, p.y + 10); g.lineTo(vx, p.y + p.h - 10); }
    for (const hy of p.h2 ?? []) { g.moveTo(p.x + 10, hy); g.lineTo(p.x + p.w - 10, hy); }
    g.stroke(DIVIDER, 2);
  }
  g.begin(); g.rect(L.screen.x, L.screen.y, L.screen.w, L.screen.h); g.fill(SCREEN);
  if (opts.screen) opts.screen(g, L.screen);
  // console: the last events, newest at the bottom, in the empty top-right corner
  { const P = L.console; g.begin(); g.roundRect(P.x, P.y, P.w, P.h, 6); g.fill([0.02, 0.02, 0.025, 1]);
    g.begin(); g.roundRect(P.x, P.y, P.w, P.h, 6); g.stroke(KEY_EDGE, 2);
    const lines = (state.log ?? []).slice(-5);
    lines.forEach((e, k) => g.text(e, P.x + 12, P.y + P.h - 14 - (lines.length - 1 - k) * 19, 15, 'left', 'normal', [1, 0.72, 0.32, k === lines.length - 1 ? 1 : 0.45 + 0.1 * k]));
  }

  const overlays = [];                       // drawn after every control, so nothing paints over them
  for (const c of L.controls) {
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2, down = pressed.has(c.id), led = ledOf(c);
    const col = ledColor(c, led, palette, now, bpm, clockStart);
    switch (c.kind) {
      case 'pad': {
        const r = 6;
        g.begin(); g.roundRect(c.x + 2, c.y + 6, c.w, c.h, r + 2); g.fill([0, 0, 0, 0.6]);       // raised: shadow on the chassis below
        if (col) {                                                                               // a lit pad spills light into the gaps around it
          const hm = Math.max(col[0], col[1], col[2], 1e-3), hI = Math.min(1, Math.sqrt(hm * col[3]));
          g.begin(); g.roundRect(c.x - 5, c.y - 5, c.w + 10, c.h + 10, r + 5); g.fill([col[0] / hm, col[1] / hm, col[2] / hm, 0.38 * hI]);
        }
        g.begin(); g.roundRect(c.x, c.y, c.w, c.h, r);
        if (col) {
          // cream silicone with the LED in the middle (Push 3 photo, default melodic layout): a coloured LED washes the
          // whole pad in its colour; the glow covers most of the pad, piling up to an almost white core. White LEDs read
          // slightly cool. Built from nested faint rounded rects (v8ui has no working gradient fill). An off pad has no light.
          const m = Math.max(col[0], col[1], col[2], 1e-3), I = Math.min(1, Math.sqrt(m * col[3]));
          let t = [col[0] / m, col[1] / m, col[2] / m];
          const sat = 1 - Math.min(t[0], t[1], t[2]);
          if (sat < 0.15) t = [0.9, 0.93, 1];                                                    // white LED: cool white
          g.fill([...PAD_OFF.slice(0, 3), 1]);
          g.begin(); g.roundRect(c.x, c.y, c.w, c.h, r); g.fill([...t, (0.4 + 0.5 * sat) * I]);   // wash: strong for colours, lighter for white
          const N = 22, outer = 0.88 + 0.12 * I;                                                   // the glow reaches most of the pad
          for (let k = 0; k < N; k++) {
            const f = k / (N - 1), sz = outer * (1 - f) + 0.12 * f;                                 // layer size, outer to core
            const w0 = c.w * sz, h0 = c.h * sz, wh = (0.35 + 0.6 * f) * I * (1 - 0.5 * sat);        // whiter toward the core; colours stay coloured
            g.begin(); g.roundRect(cx - w0 / 2, cy - h0 / 2, w0, h0, r + Math.min(w0, h0) * 0.42);
            g.fill([t[0] + (1 - t[0]) * wh, t[1] + (1 - t[1]) * wh, t[2] + (1 - t[2]) * wh, 0.15 * I + 0.012]);
          }
        } else g.fill(down ? [0.9, 0.9, 0.88, 1] : PAD_OFF);
        // relief, same for lit and unlit pads (never pressed in): a domed top, light from above
        g.begin(); g.roundRect(c.x + 3, c.y + 2, c.w - 6, c.h * 0.42, r); g.fill([1, 1, 1, 0.1]);                // upper sheen
        g.begin(); g.roundRect(c.x, c.y + c.h * 0.62, c.w, c.h * 0.38, r); g.fill([0, 0, 0, 0.09]);               // lower half in shade
        g.begin(); g.moveTo(c.x + r, c.y + c.h - 2); g.lineTo(c.x + c.w - 2, c.y + c.h - 2); g.lineTo(c.x + c.w - 2, c.y + r); g.stroke([0, 0, 0, 0.32], 4);   // bottom-right edge
        g.begin(); g.moveTo(c.x + 2, c.y + c.h - r); g.lineTo(c.x + 2, c.y + 2); g.lineTo(c.x + c.w - r, c.y + 2); g.stroke([1, 1, 1, 0.55], 3);            // top-left edge
        if (down) overlays.push(() => {
          // MPE per note, drawn black on the lit pad: p pressure 0..1 (spot grows), y slide 0..1 (marker line), bend in pad widths (arrow toward the neighbour)
          const P = (state.padPress ?? {})[c.id] ?? { p: 0, y: 0.5, bend: 0 }, INK = [0, 0, 0, 0.85];
          g.begin(); g.circle(cx, cy, 12 + 34 * (P.p ?? 0)); g.fill([0, 0, 0, 0.3 + 0.5 * (P.p ?? 0)]);
          const sy = c.y + c.h - 8 - (P.y ?? 0.5) * (c.h - 16);
          g.begin(); g.moveTo(c.x + 12, sy); g.lineTo(c.x + c.w - 12, sy); g.stroke(INK, 3.5);
          g.begin(); g.roundRect(c.x, c.y, c.w, c.h, r); g.stroke([1, 1, 1, 0.9], 4);
          if (P.bend) {   // pitch bend: an arrow from the pad centre, extending in the bend direction, one pad width per pad step
            const bx = P.bend * 153.3, tip = cx + bx, d = Math.sign(bx), ah = 16;
            g.begin(); g.moveTo(cx, cy); g.lineTo(tip - d * ah, cy); g.stroke(INK, 7);
            g.begin(); g.moveTo(tip - d * ah, cy - ah * 0.8); g.lineTo(tip, cy); g.lineTo(tip - d * ah, cy + ah * 0.8); g.stroke(INK, 7);
          }
        });
        break;
      }
      case 'disp': {
        key(g, c.x, c.y, c.w, c.h, 6);
        const by = c.bar === 'bottom' ? c.y + c.h - 16 : c.y + 10;
        const bc = down ? PRESS : col;
        g.begin(); g.roundRect(c.x + 18, by, c.w - 36, 7, 3); g.fill(bc ? bc : [0.25, 0.25, 0.26, 1]);
        if (bc) { const col = bc; g.begin(); g.roundRect(c.x + 14, by - 4, c.w - 28, 15, 7); g.fill([col[0], col[1], col[2], 0.25 * col[3]]); }
        break;
      }
      case 'scene': {
        key(g, c.x, c.y, c.w, c.h, 6);
        const pc = down ? PRESS : col ?? PRINT_OFF;
        g.text(c.print.text, cx, c.y + 20, 17, 'center', 'normal', pc);
        drawIcon(g, 'play-small', cx, c.y + 48, 18, pc);
        break;
      }
      case 'btn': {
        if (c.flat) key(g, c.x + 3, c.y + 3, c.w - 6, c.h - 6, 5); else key(g, c.x, c.y, c.w, c.h, 6);
        const pc = down ? PRESS : col ?? PRINT_OFF;
        if (col || down) { const k = pc; g.begin(); g.roundRect(c.x + 2, c.y + 2, c.w - 4, c.h - 4, 5); g.fill([k[0], k[1], k[2], 0.12 * k[3]]); }
        if (state.latched?.has(c.id)) { g.begin(); g.roundRect(c.x + 4, c.y + 4, c.w - 8, c.h - 8, 5); g.stroke(PRESS, 2); }
        const left = c.align === 'left', tx = left ? c.x + 16 : cx, al = left ? 'left' : 'center';
        if (c.print.icon && c.print.text) {        // icon above text (Scale, Layout, Octave, Page)
          if (c.print.icon.startsWith('tri-')) {
            const vert = c.print.icon === 'tri-up' || c.print.icon === 'tri-down';
            if (vert) { drawIcon(g, c.print.icon, cx, cy + (c.print.icon === 'tri-up' ? 14 : -14), 22, pc); g.text(c.print.text, cx, cy + (c.print.icon === 'tri-up' ? -14 : 14), 20, 'center', 'normal', pc); }
            else { const ix = c.print.icon === 'tri-left' ? c.x + 16 : c.x + c.w - 16; drawIcon(g, c.print.icon, ix, cy, 22, pc); g.text(c.print.text, c.print.icon === 'tri-left' ? c.x + 34 : c.x + c.w - 34, cy, 20, c.print.icon === 'tri-left' ? 'left' : 'right', 'normal', pc); }
          } else { drawIcon(g, c.print.icon, cx, c.y + 42, 34, pc); g.text(c.print.text, cx, c.y + c.h - 28, 20, 'center', 'normal', pc); }
        } else if (c.print.icon) {
          const big = c.print.icon === 'play' || c.print.icon === 'record' || c.print.icon === 'capture';
          drawIcon(g, c.print.icon, left ? c.x + 34 : cx, cy, big ? 40 : c.id === 'note' || c.id === 'sessionpad' ? 34 : 30, pc);
        } else if (c.print.text) textLines(g, c.print.text, tx, cy, c.id === 'mute' || c.id === 'solo' ? 24 : 20, al, pc, c.id === 'mute' || c.id === 'solo' ? 'bold' : 'normal');
        break;
      }
      case 'enc': {
        // state.enc[id] = { angle, arc: {dir, deg, t} }; pressed has `${id}:press` for Volume and Tempo
        const r = c.w / 2, t = touched.has(c.id), E = (state.enc ?? {})[c.id] ?? {}, pr = pressed.has(`${c.id}:press`);
        g.begin(); g.circle(cx, cy, r); g.fill(pr ? [0.2, 0.2, 0.21, 1] : ENC);
        g.begin(); g.circle(cx, cy, r - 3); g.stroke(pr ? [1, 1, 1, 0.95] : t ? [0.9, 0.9, 0.9, 0.9] : ENC_RING, pr ? 5 : 4);
        g.begin();
        for (let k = 0; k < 16; k++) { const a = (E.angle ?? 0) + k * Math.PI / 8; g.moveTo(cx + Math.cos(a) * (r * 0.5), cy + Math.sin(a) * (r * 0.5)); g.lineTo(cx + Math.cos(a) * (r * 0.62), cy + Math.sin(a) * (r * 0.62)); }
        g.stroke(pr ? [0.8, 0.8, 0.8, 0.9] : [0.22, 0.22, 0.23, 1], 2);
        if (E.arc) {
          const f = Math.max(0, 1 - (now - E.arc.t) / 500);
          if (f > 0) {
            const sweep = Math.min(300, E.arc.deg) * Math.PI / 180 * E.arc.dir, a0 = -Math.PI / 2, n = 16;
            g.begin(); for (let k = 0; k <= n; k++) { const a = a0 + sweep * k / n; (k ? g.lineTo : g.moveTo).call(g, cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3)); }
            g.stroke([1, 1, 1, 0.9 * f], pr ? 6 : 4);
            arcArrow(g, cx, cy, r - 3, a0 + sweep, E.arc.dir, pr ? 18 : 12, [1, 1, 1, f]);
          }
        }
        if (c.id !== 'volume' && c.id !== 'tempo') break;
        drawIcon(g, 'tri-down', cx, c.y + c.h + 16, pr ? 22 : 18, pr ? [1, 1, 1, 1] : PRINT_OFF);      // the press print under Volume and Tempo
        break;
      }
      case 'jog': {
        // state.jog = { angle (rad, accumulated detents), arc: {dir, deg, t} last turn, press, nudge: 'left'|'right'|null, nudgeT }
        const r = c.w / 2, t = touched.has(c.id), J = state.jog ?? {}, pressedJ = pressed.has('jog:press');
        g.begin(); g.circle(cx, cy, r); g.fill(pressedJ ? [0.2, 0.2, 0.21, 1] : ENC);
        g.begin(); g.circle(cx, cy, r - 4); g.stroke(pressedJ ? [1, 1, 1, 0.95] : t ? [0.9, 0.9, 0.9, 0.9] : ENC_RING, pressedJ ? 7 : 5);
        if (pressedJ) { g.begin(); g.circle(cx, cy, r - 14); g.fill([1, 1, 1, 0.08]); }
        // 24 dents that rotate with the accumulated turn
        g.begin();
        for (let k = 0; k < 24; k++) { const a = (J.angle ?? 0) + k * Math.PI / 12; g.moveTo(cx + Math.cos(a) * (r * 0.62), cy + Math.sin(a) * (r * 0.62)); g.lineTo(cx + Math.cos(a) * (r * 0.72), cy + Math.sin(a) * (r * 0.72)); }
        g.stroke(pressedJ ? [0.8, 0.8, 0.8, 0.9] : [0.24, 0.24, 0.25, 1], 3);
        g.begin(); g.circle(cx, cy, r * 0.78); g.stroke([0.16, 0.16, 0.17, 1], 2);
        // arc while turning: from the top, sweeping in the direction of the turn, fading out
        if (J.arc) {
          const age = (now - J.arc.t) / 500, f = Math.max(0, 1 - age);
          if (f > 0) {
            const sweep = Math.min(300, J.arc.deg) * Math.PI / 180 * J.arc.dir, a0 = -Math.PI / 2, n = 24;
            g.begin();
            for (let k = 0; k <= n; k++) { const a = a0 + sweep * k / n; (k ? g.lineTo : g.moveTo).call(g, cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4)); }
            g.stroke([1, 1, 1, 0.9 * f], pressedJ ? 8 : 6);
            arcArrow(g, cx, cy, r - 4, a0 + sweep, J.arc.dir, pressedJ ? 26 : 18, [1, 1, 1, f]);
          }
        }
        // printed arrows: nudge left / right beside the wheel, press below; they light while active
        const nf = J.nudge && now - (J.nudgeT ?? 0) < 250 ? 1 : 0;
        drawIcon(g, 'tri-left', c.x - 18, cy, J.nudge === 'left' && nf ? 24 : 16, J.nudge === 'left' && nf ? [1, 1, 1, 1] : PRINT_OFF);
        drawIcon(g, 'tri-right', c.x + c.w + 18, cy, J.nudge === 'right' && nf ? 24 : 16, J.nudge === 'right' && nf ? [1, 1, 1, 1] : PRINT_OFF);
        drawIcon(g, 'tri-down', cx, c.y + c.h + 16, pressedJ ? 22 : 16, pressedJ ? [1, 1, 1, 1] : PRINT_OFF);
        break;
      }
      case 'dpad': {
        const dirs = { up: [cx, c.y + 32, 'tri-up', 46], down: [cx, c.y + c.h - 32, 'tri-down', 47], left: [c.x + 34, cy, 'tri-left', 44], right: [c.x + c.w - 34, cy, 'tri-right', 45] };
        key(g, c.x + 3, c.y + 3, c.w - 6, c.h - 6, 8);
        for (const [k, [ix, iy, ic, cc]] of Object.entries(dirs)) {
          if (pressed.has(`dpad:${k}`)) { drawIcon(g, ic, ix, iy, 30, PRESS); continue; }
          const dcol = ledColor({ led: 'white' }, leds.get(`cc${cc}`), palette, now, bpm, clockStart);
          drawIcon(g, ic, ix, iy, 24, dcol ?? PRINT_OFF);
        }
        g.begin(); g.roundRect(cx - 34, cy - 34, 68, 68, 6); g.stroke(pressed.has('dpad:center') ? PRESS : touched.has('dpad') ? [0.9, 0.9, 0.9, 0.9] : [0.3, 0.3, 0.31, 1], pressed.has('dpad:center') ? 4 : 2);
        drawIcon(g, 'dot', cx, cy, 10, ledColor({ led: 'white' }, leds.get('cc91'), palette, now, bpm, clockStart) ?? PRINT_OFF);
        break;
      }
      case 'strip': {
        const t = touched.has('strip');
        g.begin(); g.roundRect(c.x, c.y, c.w, c.h, 10); g.fill(ENC);
        g.begin(); g.roundRect(c.x + 36, c.y + 14, c.w - 72, c.h - 28, 6); g.fill([0.06, 0.06, 0.065, 1]);
        if (state.stripLeds) {                                                         // Live's own strip LEDs (sysex 19), index 0 at the bottom
          const n = 31, step = (c.h - 28) / n;
          state.stripLeds.forEach((lv, i) => {
            if (!lv) return;
            g.begin(); g.roundRect(c.x + 42, c.y + c.h - 14 - (i + 1) * step + 2, c.w - 84, step - 4, 2); g.fill([1, 1, 1, lv / 7 * LED_BRIGHT]);
          });
        }
        const pos = state.strip ?? 0.5, py = c.y + c.h - 14 - pos * (c.h - 28);          // 0 bottom .. 1 top
        if (t) { g.begin(); g.roundRect(c.x + 40, Math.min(py, cy), c.w - 80, Math.abs(py - cy) + 1, 3); g.fill([1, 1, 1, 0.25]); }  // lit span from centre to the finger
        g.begin(); g.circle(cx, py, t ? 7 : 5); g.fill(t ? [1, 1, 1, 1] : [0.8, 0.8, 0.8, 0.7]);
        break;
      }
    }
  }
  for (const f of overlays) f();
  g.restore();
}

// hit test in frame units; returns {control, sub} (sub: dpad direction, pad x/y 0..1)
function hitTest(L, fx, fy) {
  for (let i = L.controls.length - 1; i >= 0; i--) {
    const c = L.controls[i];
    if (c.kind === 'jog') {
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2, dx = fx - cx, dy = fy - cy, r = c.w / 2;
      if (Math.abs(dy) > r) continue;
      if (dx * dx + dy * dy <= r * r) return { control: c, u: (fx - c.x) / c.w, v: (fy - c.y) / c.h, sub: dx * dx + dy * dy < (r * 0.45) ** 2 ? 'press' : 'turn', angle: Math.atan2(dy, dx) };
      if (dx < -r && dx > -r - 40 && Math.abs(dy) < 30) return { control: c, u: 0, v: 0.5, sub: 'left' };
      if (dx > r && dx < r + 40 && Math.abs(dy) < 30) return { control: c, u: 1, v: 0.5, sub: 'right' };
      continue;
    }
    if (c.kind === 'enc') {                              // round hit area a little larger than the knob, so a drag can start on the rim
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2, dx = fx - cx, dy = fy - cy, d2 = dx * dx + dy * dy, r = c.w * 0.62;
      if (d2 > r * r) continue;
      const sub = c.midi.press !== undefined && d2 < (c.w * 0.2) ** 2 ? 'press' : 'turn';
      return { control: c, u: (fx - c.x) / c.w, v: (fy - c.y) / c.h, sub };
    }
    if (fx < c.x || fy < c.y || fx > c.x + c.w || fy > c.y + c.h) continue;
    const u = (fx - c.x) / c.w, v = (fy - c.y) / c.h;
    let sub = null;
    if (c.kind === 'dpad') { const dx = u - 0.5, dy = v - 0.5; sub = Math.abs(dx) < 0.17 && Math.abs(dy) < 0.17 ? 'center' : Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'); }
    return { control: c, u, v, sub };
  }
  return null;
}

if (typeof exports !== 'undefined') Object.assign(exports, { drawFace, hitTest, ledColor, svgPath, drawIcon });
