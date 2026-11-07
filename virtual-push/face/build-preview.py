#!/usr/bin/env python3
"""Build the HTML preview of the virtual Push 3 face from the shared renderer.

Usage: build-preview.py <out.html> [screen.png]
The page inlines face/icons.js, face/layout.js, face/draw.js and data/push3-palette.json,
draws on a canvas, and animates a made-up Live state so the lit look can be judged.
"""
import base64, json, sys, pathlib
here = pathlib.Path(__file__).resolve().parent
out = pathlib.Path(sys.argv[1]); screen = sys.argv[2] if len(sys.argv) > 2 else None
snap = base64.b64encode(open(screen, "rb").read()).decode() if screen else ""
pal = json.load(open(here.parent / "data/push3-palette.json"))["palette"]
icons, layout, draw = [(here / f).read_text() for f in ("icons.js", "layout.js", "draw.js")]
html = f'''<title>Virtual Push 3 Face</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
/* layout: the drawn face fills the width; a short legend below. Single dark look, like the hardware. */
:root {{ --bg:#141414; --panel:#1f1f1f; --fg:#e9e7e2; --mute:#9a9790; --line:#333; --accent:#5ad28f; --font:'IBM Plex Sans',system-ui,sans-serif; color-scheme:dark }}
body {{ background:var(--bg); color:var(--fg); font-family:var(--font); margin:0; padding-block:24px; padding-left:max(16px,env(safe-area-inset-left,0px)); padding-right:max(16px,env(safe-area-inset-right,0px)) }}
h1 {{ font-size:1.5rem; font-weight:600; margin:0 0 4px; text-wrap:balance }}
p.lead {{ color:var(--mute); margin:0 0 16px; max-width:70ch }}
canvas {{ display:block; width:100%; max-width:1400px; margin:0 auto; aspect-ratio:2000/1668; border-radius:12px; touch-action:none }}
.note {{ max-width:1400px; margin:20px auto 0; display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px }}
.note section {{ background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px 16px; min-width:0 }}
.note h2 {{ font-size:.8rem; letter-spacing:.06em; text-transform:uppercase; color:var(--mute); margin:0 0 8px; font-weight:600 }}
.note p, .note li {{ font-size:.92rem; line-height:1.45; margin:0 0 6px }} .note ul {{ margin:0; padding-left:18px }}
</style>
<h1>Virtual Push 3 face</h1>
<p class="lead">Drawn from the layout table the Max v8ui will use, with the colours Live sends looked up in the palette read from your Push. The state shown is a made-up Live moment: playing, record armed (pulsing), Automate on, a track muted and soloed, Note mode with root notes in blue, two held pads, scene 1 blinking, Tap Tempo blinking on the beat. Click pads and buttons to press them: as on the hardware nothing moves, the print lights while held; latching buttons (Metronome, Automate, Mute, Play...) toggle their light, momentary ones (Shift, Delete, Undo...) light only while held, as Live does it. Shift: hold the keyboard Shift key to hold the Shift button, or Shift-click the Shift button to latch it (a thin frame shows it is latched; click it again to release). Jog wheel: drag around it or scroll to turn (an arc shows the turn, the dents rotate), press its centre, keep dragging around for press-and-turn (lit wheel plus arc), click the side arrows to nudge. Encoders: rest the pointer on one for touch (ring), drag around it (or up and down, or scroll) to turn; on Volume and Tempo, button down on the centre is the press and dragging around while held is press-and-turn. An arrowhead at the end of every arc shows the turn direction. Strip: press and drag, it springs back on release. Pads (MPE): click height is velocity; drag up and down for slide (a marker line, CC 74); drag sideways across pads for pitch bend (the glow stretches toward the neighbour, bend in semitones in the console); press ↑ or ↓ while holding to change pressure (the spot grows), all three at once.</p>
<canvas id="face" width="2000" height="1668" aria-label="Virtual Push 3 face"></canvas>
<div class="note">
<section><h2>What lights</h2><ul><li>Pads: the pad glows in the palette colour (white when idle in Note mode, like the hardware).</li><li>Display buttons: their LED bar takes the track or page colour.</li><li>Every other button: its print lights, white or coloured, with Live's one-shot, pulse and blink animations at Live's tempo.</li><li>Encoders and the jog wheel show a ring when touched; the strip shows its position dot.</li></ul><li>The small panel top right is a console: the last five events (pressed, released, touched, turned, nudged, pad velocity).</li></ul></section>
<section><h2>Same code in Max</h2><p>This page runs <code>face/draw.js</code> on a canvas; the v8ui runs the same file on mgraphics. The screen slot here shows the frame Max received from the fake Push; in Max it is a <code>jit.pwindow</code>.</p></section>
</div>
<script>
{icons}
{layout}
{draw}
const PALETTE = {json.dumps(pal)};
class CanvasG {{
  constructor(ctx) {{ this.c = ctx; }}
  save() {{ this.c.save(); }} restore() {{ this.c.restore(); }} translate(x, y) {{ this.c.translate(x, y); }} scale(s) {{ this.c.scale(s, s); }}
  begin() {{ this.c.beginPath(); }} moveTo(x, y) {{ this.c.moveTo(x, y); }} lineTo(x, y) {{ this.c.lineTo(x, y); }}
  curveTo(a, b, c, d, e, f) {{ this.c.bezierCurveTo(a, b, c, d, e, f); }} close() {{ this.c.closePath(); }}
  rect(x, y, w, h) {{ this.c.rect(x, y, w, h); }} roundRect(x, y, w, h, r) {{ this.c.roundRect(x, y, w, h, r); }}
  circle(cx, cy, r) {{ this.c.moveTo(cx + r, cy); this.c.arc(cx, cy, r, 0, Math.PI * 2); }}
  css(k) {{ return `rgba(${{Math.round(k[0]*255)}},${{Math.round(k[1]*255)}},${{Math.round(k[2]*255)}},${{k[3]}})`; }}
  fill(k) {{ this.c.fillStyle = this.css(k); this.c.fill(); }}
  stroke(k, w) {{ this.c.strokeStyle = this.css(k); this.c.lineWidth = w; this.c.lineCap = 'round'; this.c.lineJoin = 'round'; this.c.stroke(); }}
  text(s, x, y, size, align, weight, k) {{ this.c.font = `${{weight}} ${{size}}px 'IBM Plex Sans', system-ui, sans-serif`; this.c.textAlign = align; this.c.textBaseline = 'middle'; this.c.fillStyle = this.css(k); this.c.fillText(s, x, y); }}
}}
const cv = document.getElementById('face'), ctx = cv.getContext('2d'), g = new CanvasG(ctx);
const img = new Image(); img.src = 'data:image/png;base64,{snap}';
const state = {{ leds: new Map(), pressed: new Set(), touched: new Set(), latched: new Set(), bpm: 120, clockStart: performance.now(), strip: 0.5, jog: {{ angle: 0, arc: null, nudge: null, nudgeT: 0 }}, enc: {{}}, padPress: {{}} }};
const ENC_DETENT = 8;   // pixels of vertical drag per encoder step
function encTurn(id, steps) {{ const E = state.enc[id] ??= {{ angle: 0, arc: null }}; E.angle += steps * Math.PI / 8; const dir = Math.sign(steps); log(`${{id}} ${{state.pressed.has(`${{id}}:press`) ? 'press+turn ' : ''}}${{steps > 0 ? '+' : ''}}${{steps}}`);
  if (E.arc && E.arc.dir === dir && performance.now() - E.arc.t < 500) E.arc.deg += Math.abs(steps) * 22.5; else E.arc = {{ dir, deg: Math.abs(steps) * 22.5, t: 0 }};
  E.arc.t = performance.now(); }}
// touch = the pointer resting over an encoder or the jog wheel for 150 ms (capacitive touch on the hardware)
let hoverId = null, hoverTimer = null;
cv.addEventListener('pointermove', e => {{ if (held) return; const h = hitTest(LAYOUT, ...toFrame(e)); const id = h && (h.control.kind === 'enc' || h.control.kind === 'jog') ? h.control.id : null;
  if (id !== hoverId) {{ if (hoverId) state.touched.delete(hoverId); clearTimeout(hoverTimer); hoverId = id; if (id) hoverTimer = setTimeout(() => {{ state.touched.add(id); log(`${{id}} touched`); }}, 150); }} }});
cv.addEventListener('pointerleave', () => {{ if (hoverId) state.touched.delete(hoverId); hoverId = null; clearTimeout(hoverTimer); }});
const log = t => {{ (state.log ??= []).push(t); if (state.log.length > 50) state.log.shift(); }};
const DETENT = Math.PI / 12;   // one dent of the jog wheel per 15 degrees of drag
function jogTurn(steps) {{ const J = state.jog; J.angle += steps * DETENT; const dir = Math.sign(steps); log(`jog ${{state.pressed.has('jog:press') ? 'press+turn ' : ''}}${{steps > 0 ? '+' : ''}}${{steps}}`);
  if (J.arc && J.arc.dir === dir && performance.now() - J.arc.t < 500) J.arc.deg += Math.abs(steps) * 15; else J.arc = {{ dir, deg: Math.abs(steps) * 15, t: 0 }};
  J.arc.t = performance.now(); }}
cv.addEventListener('wheel', e => {{ const h = hitTest(LAYOUT, ...toFrame(e)); if (h?.control.kind === 'jog') {{ e.preventDefault(); jogTurn(Math.sign(e.deltaY || e.deltaX)); }} if (h?.control.kind === 'enc') {{ e.preventDefault(); encTurn(h.control.id, -Math.sign(e.deltaY || e.deltaX)); }} }}, {{ passive: false }});
const set = (k, idx, ch = 0) => state.leds.set(k, {{ idx, ch, t0: performance.now() }});
set('cc85', 126); set('cc86', 127, 9); set('cc89', 127); set('cc60', 8); set('cc61', 125); set('cc29', 2);
set('cc43', 126, 14); set('cc3', 127, 14); set('cc102', 122); set('cc34', 127); set('cc110', 64); set('cc119', 64); set('cc82', 64);
for (const n of [80, 30, 81, 59, 83, 49, 48, 58, 31, 46, 47, 44, 45, 28, 32, 33, 9, 116, 90, 87, 65, 113, 112]) set(`cc${{n}}`, 64);
[1, 3, 8, 64, 125, 126, 2, 122].forEach((i, k) => set(`cc${{20 + k}}`, i));
for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) set(`note${{36 + 8 * r + c}}`, ((c + 3 * r) % 7) === 0 ? 125 : 122);
set('note52', 126); set('note73', 126);
function frame() {{
  drawFace(g, LAYOUT, state, PALETTE, performance.now(), {{ screen: (g, s) => {{ if (img.complete && img.naturalWidth) ctx.drawImage(img, s.x, s.y, s.w, s.h); }} }});
  requestAnimationFrame(frame);
}}
requestAnimationFrame(frame);
// pressure (MPE Z): arrow keys while a pad is held, up raises, down lowers, at any time during the drag
const keys = new Set();
window.addEventListener('keydown', e => {{ if (held?.kind === 'pad' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {{ keys.add(e.key); e.preventDefault(); }} }});
window.addEventListener('keyup', e => keys.delete(e.key));
window.addEventListener('keydown', e => {{ if (e.key === 'Shift' && !state.pressed.has('shift') && !state.latched.has('shift')) {{ state.pressed.add('shift'); set('cc49', 127); log('shift pressed (key)'); }} }});
window.addEventListener('keyup', e => {{ if (e.key === 'Shift' && !state.latched.has('shift') && held?.id !== 'shift') {{ state.pressed.delete('shift'); set('cc49', 64); log('shift released (key)'); }} }});
setInterval(() => {{ if (held?.kind !== 'pad' || !keys.size) return; const P = state.padPress[held.id]; if (!P) return;
  P.p = Math.min(1, Math.max(0, P.p + (keys.has('ArrowUp') ? 0.04 : 0) - (keys.has('ArrowDown') ? 0.04 : 0)));
  if (performance.now() - padLogT > 150) {{ padLogT = performance.now(); log(`${{held.id}} pressure ${{Math.round(P.p * 127)}}`); }} }}, 16);
const toFrame = e => {{ const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * LAYOUT.W, (e.clientY - r.top) / r.height * LAYOUT.H]; }};
// simulated Live behaviour: latching buttons toggle their light, momentary ones light while held
const LATCH = new Set(['metronome', 'automate', 'fixed', 'repeat', 'accent', 'note', 'sessionpad', 'scale', 'layout', 'mute', 'solo', 'play', 'record', 'user', 'lock', 'quantize', 'clip', 'mix', 'session', 'device', 'sets', 'setup', 'learn', 'master', 'stop', 'add', 'swap']);
const LIT = {{ play: 126, record: 127, automate: 127, mute: 8, solo: 125, stop: 2 }};
const keyOf = c => c.midi.cc !== undefined ? `cc${{c.midi.cc}}` : `note${{c.midi.note}}`;
let held = null, heldSub = null, jogLast = 0, jogAcc = 0, encStartY = 0, encAcc = 0, encMoved = false, encLast = 0, encAng = 0, padStart = [0, 0], padLogT = 0;
cv.addEventListener('pointerdown', e => {{ const h = hitTest(LAYOUT, ...toFrame(e)); if (!h) return; held = h.control; heldSub = h.sub; cv.setPointerCapture(e.pointerId);
  const c = h.control;
  if (c.kind === 'jog') {{ state.touched.add(c.id); heldSub = h.sub; jogLast = h.angle; jogAcc = 0;
    if (h.sub === 'press') {{ state.pressed.add('jog:press'); log('jog pressed'); }} else if (h.sub === 'left' || h.sub === 'right') {{ state.jog.nudge = h.sub; state.jog.nudgeT = performance.now(); log(`jog nudge ${{h.sub}}`); }} return; }}
  if (c.kind === 'enc') {{ state.touched.add(c.id); const [fx0, fy0] = toFrame(e); encStartY = fy0; encAcc = 0; encMoved = false; encLast = Math.atan2(fy0 - (c.y + c.h / 2), fx0 - (c.x + c.w / 2)); encAng = 0;
    if (h.sub === 'press') {{ state.pressed.add(`${{c.id}}:press`); log(`${{c.id}} pressed`); }} return; }}
  if (c.kind === 'strip') {{ state.touched.add('strip'); state.strip = Math.min(1, Math.max(0, 1 - (toFrame(e)[1] - c.y) / c.h)); log(`strip touched ${{state.strip.toFixed(2)}}`); return; }}
  if (c.id === 'shift' && (e.shiftKey || state.latched.has('shift'))) {{      // Shift + click on Shift latches it; any click unlatches
    if (state.latched.has('shift')) {{ state.latched.delete('shift'); state.pressed.delete('shift'); set('cc49', 64); log('shift unlatched'); }}
    else {{ state.latched.add('shift'); state.pressed.add('shift'); set('cc49', 127); log('shift latched'); }}
    held = null; return; }}
  state.pressed.add(c.kind === 'dpad' ? `dpad:${{h.sub}}` : c.id);
  if (c.kind === 'pad') {{ set(keyOf(c), 126); padStart = toFrame(e); state.padPress[c.id] = {{ p: 0, y: h.v > 0.5 ? 1 - h.v : 1 - h.v, bend: 0 }}; log(`${{c.id}} note ${{c.midi.note}} vel ${{Math.round(1 + 126 * (1 - h.v))}} ch ${{2 + (c.midi.note % 15)}}`); return; }}
  log(`${{c.kind === 'dpad' ? 'dpad ' + h.sub : c.id}} pressed`);
  if (c.kind === 'dpad') return;
  const k = keyOf(c), on = state.leds.get(k)?.idx > 64 || (state.leds.get(k)?.idx ?? 0) === LIT[c.id];
  if (LATCH.has(c.id)) set(k, on ? 64 : (LIT[c.id] ?? 127)); else set(k, LIT[c.id] ?? 127); }});
cv.addEventListener('pointerup', () => {{ if (held) {{ const c = held; if (c.kind !== 'enc' && c.kind !== 'jog') log(`${{c.kind === 'dpad' ? 'dpad ' + heldSub : c.id}} released`); else if (c.kind === 'jog' && heldSub === 'press') log('jog released'); state.pressed.delete(c.kind === 'dpad' ? `dpad:${{heldSub}}` : c.id); state.pressed.delete('jog:press'); state.pressed.delete(`${{c.id}}:press`); if (c.id !== hoverId) state.touched.delete(c.id);
  if (c.kind === 'strip') {{ state.touched.delete('strip'); state.strip = 0.5; }}                                   // pitch-bend strip springs back to centre
  if (c.kind === 'enc' && state.pressed.has(`${{c.id}}:press`)) log(`${{c.id}} released`);
  if (c.kind === 'pad') delete state.padPress[c.id];
  if (c.kind === 'pad') set(keyOf(c), 122); else if (c.kind !== 'dpad' && c.kind !== 'enc' && c.kind !== 'jog' && c.kind !== 'strip' && !LATCH.has(c.id)) set(keyOf(c), 64); }} held = null; }});
cv.addEventListener('pointermove', e => {{
  if (held?.kind === 'strip') {{ const [, fy] = toFrame(e); state.strip = Math.min(1, Math.max(0, 1 - (fy - held.y) / held.h)); }}
  if (held?.kind === 'enc') {{ const [fx, fy] = toFrame(e); const ecx = held.x + held.w / 2, ecy = held.y + held.h / 2, dist = Math.hypot(fx - ecx, fy - ecy);
    if (dist > held.w * 0.3) {{   // around the knob: angular, one step per 22.5 degrees, like the jog wheel
      const a = Math.atan2(fy - ecy, fx - ecx); let d = a - encLast; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; encLast = a; encAng += d;
      const st = Math.trunc(encAng / (Math.PI / 8)); if (st) {{ encAng -= st * Math.PI / 8; encMoved = true; encTurn(held.id, st); }}
    }} else {{ encAcc += encStartY - fy; const st = Math.trunc(encAcc / ENC_DETENT); if (st) {{ encAcc -= st * ENC_DETENT; encMoved = true; encTurn(held.id, st); }} }}
    encStartY = fy; }}
  if (held?.kind === 'pad') {{ const [fx, fy] = toFrame(e), P = state.padPress[held.id];
    P.y = Math.min(1, Math.max(0, 1 - (fy - held.y) / held.h));                                             // vertical drag: slide (MPE Y, CC 74)
    P.bend = (fx - (held.x + held.w / 2)) / 153.3; if (Math.abs(P.bend) < 0.15) P.bend = 0;                 // horizontal drag across pads: pitch bend (MPE X)
    padStart = [fx, fy];
    if (performance.now() - padLogT > 150) {{ padLogT = performance.now(); log(`${{held.id}} slide ${{Math.round(P.y * 127)}}${{P.bend ? ' bend ' + (P.bend > 0 ? '+' : '') + P.bend.toFixed(2) + ' st' : ''}} pressure ${{Math.round(P.p * 127)}}`); }} }}
  if (held?.kind === 'jog' && (heldSub === 'turn' || heldSub === 'press')) {{ const [fx, fy] = toFrame(e); const a = Math.atan2(fy - (held.y + held.h / 2), fx - (held.x + held.w / 2));
    let d = a - jogLast; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; jogLast = a; jogAcc += d;
    const steps = Math.trunc(jogAcc / DETENT); if (steps) {{ jogAcc -= steps * DETENT; jogTurn(steps); }} }}
}});
</script>
'''
out.write_text(html); print(out, len(html))
